import { parseProductFromHtml } from "./_lib/parseProduct.js";
import { convertToUsd } from "./_lib/convertCurrency.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB cap on the response body we read

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = parseInt(ipv4[1], 10);
    const b = parseInt(ipv4[2], 10);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
  }
  return false;
}

async function readBodyCapped(response) {
  const reader = response.body?.getReader?.();
  if (!reader) return response.text();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    chunks.push(value);
    if (received > MAX_BYTES) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

export default async function handler(req, res) {
  const rawUrl = req.query?.url;
  const target = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl;

  if (!target || typeof target !== "string") {
    res.status(400).json({ error: "Missing url parameter" });
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    res.status(400).json({ error: "That doesn't look like a valid URL" });
    return;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).json({ error: "URL must start with http:// or https://" });
    return;
  }
  if (isBlockedHost(parsed.hostname)) {
    res.status(400).json({ error: "That host can't be fetched" });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html;
  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      // Some retailers run bot-detection (Akamai, PerimeterX, Cloudflare, etc.)
      // that blocks requests by server IP reputation regardless of headers —
      // a 403 here often means that, not a bug in this app.
      const blockedHint = response.status === 403
        ? " — this site may be blocking automated requests, which isn't always fixable"
        : "";
      res.status(502).json({ error: `That site responded with ${response.status}${blockedHint}` });
      return;
    }
    html = await readBodyCapped(response);
  } catch (err) {
    if (err?.name === "AbortError") {
      res.status(504).json({ error: "That site took too long to respond" });
    } else {
      res.status(502).json({ error: "Couldn't reach that URL" });
    }
    return;
  } finally {
    clearTimeout(timeout);
  }

  let product;
  try {
    product = parseProductFromHtml(html, parsed.toString());
  } catch {
    res.status(500).json({ error: "Couldn't read that page's product details" });
    return;
  }

  // Everything downstream (display, sale-percent math, sorting) assumes
  // USD, so convert here rather than carrying the source currency through
  // the whole app.
  if (product.currency && product.currency !== "USD") {
    const [price, originalPrice] = await Promise.all([
      convertToUsd(product.price, product.currency),
      convertToUsd(product.originalPrice, product.currency),
    ]);
    product = { ...product, price, originalPrice };
  }

  const onSale = product.originalPrice != null && product.price != null && product.originalPrice > product.price;
  const salePercent = onSale ? Math.round((1 - product.price / product.originalPrice) * 100) : null;

  res.status(200).json({
    url: target,
    title: product.title,
    description: product.description,
    availableImages: product.images,
    price: product.price,
    originalPrice: onSale ? product.originalPrice : product.price,
    onSale,
    salePercent,
    store: product.store,
  });
}
