import { useState, useEffect, useRef, useLayoutEffect } from "react";
import {
  Plus, X, Share2, Bell, Heart, ExternalLink, Tag, Check,
  Copy, Trash2, Edit3, AlertCircle, Sparkles, ImageOff, LayoutGrid, List,
  Gift, Home, Star, Shirt, BookOpen, Leaf, Palette, ShoppingBag, Search, LogOut,
  Footprints, Watch, Glasses, Gem, PartyPopper, Cake, TreePine, Music, Gamepad2, Camera, MoreHorizontal
} from "lucide-react";
import heartsLogo from "../assets/images/hearts-logo.png";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface WishlistItem {
  id: string;
  url: string;
  title: string;
  description: string;
  selectedImage: string;
  availableImages: string[];
  price: number | null;
  originalPrice: number | null;
  onSale: boolean;
  salePercent: number | null;
  store: string;
  addedAt: string;
  notifyOnSale: boolean;
  priority: boolean;
}

export interface Wishlist {
  id: string;
  name: string;
  icon: string;
  items: WishlistItem[];
  createdAt: string;
}

interface User {
  id: string;
  email: string | null; // null means this is a guest account, not signed up yet
}

interface Notification {
  id: string;
  itemTitle: string;
  listName: string;
  oldPrice: number;
  newPrice: number;
  salePercent: number;
  timestamp: Date;
  read: boolean;
}

// ─── Real product scraper ──────────────────────────────────────────────────────
// Hits our own /api/scrape serverless function, which fetches the page
// server-side (avoiding CORS) and parses JSON-LD/Open Graph product data.
async function scrapeProduct(url: string): Promise<Omit<WishlistItem, "id" | "addedAt" | "notifyOnSale" | "selectedImage" | "priority">> {
  const res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "Couldn't fetch that link");
  return {
    url,
    title: data.title,
    description: data.description,
    availableImages: data.availableImages ?? [],
    price: data.price,
    originalPrice: data.originalPrice,
    onSale: !!data.onSale,
    salePercent: data.salePercent,
    store: data.store,
  };
}

// ─── Backend API ──────────────────────────────────────────────────────────────
// Thin wrappers around our /api/* serverless routes. Sessions are tracked
// with an httpOnly cookie the browser sends automatically, so there's no
// token to manage here.
async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server always sends a plain-string `error`, but a crashed
    // serverless function (e.g. the platform's own error page) can return
    // a differently-shaped body — fall back instead of stringifying an
    // object into "[object Object]".
    const message = typeof data?.error === "string" ? data.error
      : typeof data?.error?.message === "string" ? data.error.message
      : "Something went wrong";
    throw new Error(message);
  }
  return data;
}

async function fetchMe(): Promise<User | null> {
  const data = await apiFetch("/api/auth/me");
  return data.user;
}
async function apiSignup(email: string, password: string): Promise<User> {
  const data = await apiFetch("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
  return data.user;
}
async function apiLogin(email: string, password: string): Promise<User> {
  const data = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  return data.user;
}
async function apiLogout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}
async function apiCreateGuest(): Promise<User> {
  const data = await apiFetch("/api/auth/guest", { method: "POST" });
  return data.user;
}
async function apiClaimAccount(email: string, password: string): Promise<User> {
  const data = await apiFetch("/api/auth/guest", { method: "PATCH", body: JSON.stringify({ email, password }) });
  return data.user;
}

async function fetchLists(): Promise<Wishlist[]> {
  const data = await apiFetch("/api/lists");
  return data.lists;
}
async function apiCreateList(name: string, icon: string): Promise<Wishlist> {
  const data = await apiFetch("/api/lists", { method: "POST", body: JSON.stringify({ name, icon }) });
  return data.list;
}
async function apiRenameList(id: string, name: string, icon: string): Promise<Wishlist> {
  const data = await apiFetch(`/api/lists/${id}`, { method: "PATCH", body: JSON.stringify({ name, icon }) });
  return data.list;
}
async function apiDeleteList(id: string): Promise<void> {
  await apiFetch(`/api/lists/${id}`, { method: "DELETE" });
}
async function apiReorderLists(order: string[]): Promise<void> {
  await apiFetch("/api/lists", { method: "PATCH", body: JSON.stringify({ order }) });
}
async function apiCreateItem(payload: Record<string, unknown>): Promise<WishlistItem> {
  const data = await apiFetch("/api/items", { method: "POST", body: JSON.stringify(payload) });
  return data.item;
}
async function apiPatchItem(id: string, payload: Record<string, unknown>): Promise<WishlistItem> {
  const data = await apiFetch(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  return data.item;
}
async function apiDeleteItem(id: string): Promise<void> {
  await apiFetch(`/api/items/${id}`, { method: "DELETE" });
}

// ─── Seed data ────────────────────────────────────────────────────────────────
export const LIST_ICONS: { value: string; Icon: React.ElementType }[] = [
  { value: "gift", Icon: Gift }, { value: "home", Icon: Home }, { value: "star", Icon: Star },
  { value: "shirt", Icon: Shirt }, { value: "shoes", Icon: Footprints }, { value: "watch", Icon: Watch },
  { value: "glasses", Icon: Glasses }, { value: "gem", Icon: Gem }, { value: "book", Icon: BookOpen },
  { value: "leaf", Icon: Leaf }, { value: "palette", Icon: Palette }, { value: "bag", Icon: ShoppingBag },
  { value: "party", Icon: PartyPopper }, { value: "cake", Icon: Cake }, { value: "tree", Icon: TreePine },
  { value: "music", Icon: Music }, { value: "games", Icon: Gamepad2 }, { value: "camera", Icon: Camera },
];
export function ListIcon({ value, size = 16 }: { value: string; size?: number }) {
  const found = LIST_ICONS.find(i => i.value === value);
  if (!found) return <Star size={size} />;
  return <found.Icon size={size} />;
}

function uid() { return Math.random().toString(36).slice(2, 10); }
export function fmt(n: number) { return "$" + n.toFixed(2); }

// ─── Polka dot background ─────────────────────────────────────────────────────
export const polkaDotBg = `url("data:image/svg+xml,%3Csvg width='64' height='64' viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='32' cy='32' r='7.5' fill='%2342FAE1' fill-opacity='0.35'/%3E%3C/svg%3E")`;

// ─── Custom mint arrow cursor ──────────────────────────────────────────────────
const heartCursor = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 2 L3 19 L7.5 15.2 L10.5 21.5 L13.2 20.2 L10.2 14 L16 14 Z' fill='%2342FAE1' stroke='white' stroke-width='1.3' stroke-linejoin='round'/%3E%3C/svg%3E") 3 2, auto`;

// ─── Subcomponents ────────────────────────────────────────────────────────────
export function SaleBadge({ pct }: { pct: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#42FAE1", color: "#006B5E", fontFamily: "'DM Mono', monospace" }}>
      <Tag size={9} />-{pct}%
    </span>
  );
}

function ItemCard({ item, onDelete, onChangePhoto, onClick, onTogglePriority, isSelected }: {
  item: WishlistItem; onDelete: () => void; onChangePhoto: (img: string) => void;
  onClick: () => void; onTogglePriority: () => void; isSelected: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative text-left w-full min-w-0 transition-all duration-200"
      style={{ outline: "none" }}
    >
      <div
        className="rounded-2xl overflow-hidden transition-all duration-200"
        style={{
          background: "#fff",
          border: isSelected ? "2.5px solid #FF1493" : "2.5px solid transparent",
          boxShadow: isSelected ? "0 0 0 4px #FF149322" : "0 2px 10px rgba(255,20,147,0.08)",
        }}
      >
        <div className="relative aspect-square bg-pink-50 overflow-hidden flex items-center justify-center">
          {item.selectedImage ? (
            <img src={item.selectedImage} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <ImageOff size={28} color="#FFB6D9" />
          )}
          {item.onSale && (
            <div className="absolute top-2 left-2"><SaleBadge pct={item.salePercent!} /></div>
          )}
          <button
            onClick={e => { e.stopPropagation(); onTogglePriority(); }}
            className="absolute bottom-2 left-2 w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-sm transition-all"
            style={{ background: item.priority ? "#FF1493" : "rgba(255,255,255,0.85)" }}
            title={item.priority ? "Remove priority" : "Mark as priority"}
          >
            <Star size={12} fill={item.priority ? "#fff" : "none"} color={item.priority ? "#fff" : "#FF1493"} />
          </button>
        </div>
        <div className="p-2.5">
          <p className="text-xs font-bold leading-snug line-clamp-2 mb-1" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#12002A", minHeight: "2.75em" }}>{item.title}</p>
          <div className="flex items-center gap-1.5" style={{ minHeight: "1.375em" }}>
            {item.price !== null && <span className="text-xs font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#FF1493" }}>{fmt(item.price)}</span>}
            {item.onSale && item.originalPrice && item.originalPrice !== item.price && (
              <span className="text-xs line-through" style={{ fontFamily: "'DM Mono', monospace", color: "#C0A0B0" }}>{fmt(item.originalPrice)}</span>
            )}
          </div>
        </div>
      </div>
      {/* hover actions */}
      <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "#FF1493", color: "#fff" }}
        >
          <X size={11} />
        </button>
      </div>
    </button>
  );
}

function ItemListRow({ item, onDelete, onClick, onTogglePriority, isSelected }: {
  item: WishlistItem; onDelete: () => void; onClick: () => void; onTogglePriority: () => void; isSelected: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 w-full text-left rounded-2xl p-2 transition-all"
      style={{
        background: "#fff",
        border: isSelected ? "2.5px solid #FF1493" : "2.5px solid transparent",
        boxShadow: isSelected ? "0 0 0 4px #FF149322" : "0 2px 8px rgba(255,20,147,0.06)",
      }}
    >
      <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-pink-50 flex items-center justify-center">
        {item.selectedImage ? (
          <img src={item.selectedImage} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <ImageOff size={16} color="#FFB6D9" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold leading-snug truncate" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#12002A" }}>{item.title}</p>
        <div className="flex items-center gap-1.5">
          {item.price !== null && <span className="text-xs font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#FF1493" }}>{fmt(item.price)}</span>}
          {item.onSale && item.originalPrice && item.originalPrice !== item.price && (
            <span className="text-xs line-through" style={{ fontFamily: "'DM Mono', monospace", color: "#C0A0B0" }}>{fmt(item.originalPrice)}</span>
          )}
          {item.onSale && <SaleBadge pct={item.salePercent!} />}
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onTogglePriority(); }}
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
        style={{ background: item.priority ? "#FF1493" : "#FFF0FA" }}
        title={item.priority ? "Remove priority" : "Mark as priority"}
      >
        <Star size={13} fill={item.priority ? "#fff" : "none"} color={item.priority ? "#fff" : "#FF1493"} />
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
        style={{ background: "#FF1493", color: "#fff" }}
      >
        <X size={12} />
      </button>
    </button>
  );
}

function PhotoPickerModal({ images, selected, onSelect, onClose }: {
  images: string[]; selected: string; onSelect: (img: string) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative rounded-3xl border-2 p-6 max-w-xs w-full shadow-2xl" style={{ background: "#fff", borderColor: "#FF1493" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#FF1493" }}>Pick a photo</h4>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#FFE8F5" }}><X size={14} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {images.map((img, i) => (
            <button key={i} onClick={() => { onSelect(img); onClose(); }} className="relative aspect-square rounded-2xl overflow-hidden transition-all"
              style={{ border: img === selected ? "2.5px solid #FF1493" : "2.5px solid #FFD6F0" }}>
              <img src={img} alt={`Option ${i + 1}`} className="w-full h-full object-cover" />
              {img === selected && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(255,20,147,0.2)" }}>
                  <div className="rounded-full p-1" style={{ background: "#FF1493" }}><Check size={14} color="#fff" /></div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddItemModal({ onClose, onAdd }: { onClose: () => void; onAdd: (item: Omit<WishlistItem, "id" | "addedAt" | "priority">) => void }) {
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<"url" | "pick">("url");
  const [loading, setLoading] = useState(false);
  const [scraped, setScraped] = useState<Omit<WishlistItem, "id" | "addedAt" | "notifyOnSale" | "selectedImage" | "priority"> | null>(null);
  const [selectedImg, setSelectedImg] = useState<string>("");
  const [notifyOnSale, setNotifyOnSale] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await scrapeProduct(url.trim());
      setScraped(data);
      setSelectedImg(data.availableImages[0] ?? "");
      setStep("pick");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't fetch that link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" style={{ background: "#fff", border: "2.5px solid #FFD6F0" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ background: "linear-gradient(135deg, #FFE8F5 0%, #E8FDF9 100%)" }}>
          <div>
            <h2 className="text-xl font-semibold" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#FF1493" }}>Add to wishlist</h2>
            <p className="text-xs mt-0.5" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#7A5E8A" }}>
              {step === "url" ? "Paste a product link to get started" : "Now pick your fave photo!"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#FFD6F0" }}><X size={15} color="#FF1493" /></button>
        </div>

        <div className="p-6">
          {step === "url" ? (
            <div className="space-y-4">
              <input
                type="url" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleFetch()}
                placeholder="https://www.example.com/product/..."
                className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
                style={{ background: "#FDF5FF", border: "2px solid #FFD6F0", fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#12002A" }}
                autoFocus
              />
              <p className="text-xs" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#C0A0B0" }}>
                We'll pull the real title, photo, and price from the page.
              </p>
              {error && (
                <div className="flex items-center gap-2 rounded-2xl p-3 text-xs font-bold" style={{ background: "#FFEAF0", color: "#D6003F", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
                  <AlertCircle size={14} />{error}
                </div>
              )}
              <button
                onClick={handleFetch} disabled={!url.trim() || loading}
                className="w-full rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #FF1493, #FF69B4)", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}
              >
                {loading ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Fetching...</> : <><Sparkles size={15} />Fetch details</>}
              </button>
            </div>
          ) : scraped ? (
            <div className="space-y-4">
              <div className="flex gap-3 p-3 rounded-2xl" style={{ background: "#FFF5FD" }}>
                {selectedImg ? (
                  <img src={selectedImg} alt={scraped.title} className="w-16 h-16 object-cover rounded-xl flex-shrink-0" style={{ border: "2px solid #FFD6F0" }} />
                ) : (
                  <div className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ border: "2px solid #FFD6F0", background: "#fff" }}>
                    <ImageOff size={20} color="#C0A0B0" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold line-clamp-2" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#12002A" }}>{scraped.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {scraped.price != null && <span className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#FF1493" }}>{fmt(scraped.price)}</span>}
                    {scraped.price == null && <span className="text-xs" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#C0A0B0" }}>No price found</span>}
                    {scraped.onSale && scraped.originalPrice && scraped.originalPrice !== scraped.price && <span className="text-xs line-through" style={{ fontFamily: "'DM Mono', monospace", color: "#C0A0B0" }}>{fmt(scraped.originalPrice)}</span>}
                    {scraped.onSale && scraped.salePercent && <SaleBadge pct={scraped.salePercent} />}
                  </div>
                </div>
              </div>
              {scraped.availableImages.length > 0 ? (
              <div>
                <p className="text-xs font-bold mb-2" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#7A5E8A" }}>Choose a photo</p>
                <div className="grid grid-cols-4 gap-2">
                  {scraped.availableImages.map((img, i) => (
                    <button key={i} onClick={() => setSelectedImg(img)} className="relative aspect-square rounded-xl overflow-hidden transition-all"
                      style={{ border: img === selectedImg ? "2.5px solid #FF1493" : "2.5px solid #FFD6F0" }}>
                      <img src={img} alt={`Option ${i + 1}`} className="w-full h-full object-cover" />
                      {img === selectedImg && <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(255,20,147,0.15)" }}><div className="rounded-full p-0.5" style={{ background: "#FF1493" }}><Check size={10} color="#fff" /></div></div>}
                    </button>
                  ))}
                </div>
              </div>
              ) : (
                <p className="text-xs text-center py-2" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#C0A0B0" }}>No photos found on that page.</p>
              )}
              <label className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => setNotifyOnSale(!notifyOnSale)} className="relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0" style={{ background: notifyOnSale ? "#FF1493" : "#E8C8F0" }}>
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200" style={{ transform: notifyOnSale ? "translateX(20px)" : "translateX(0)" }} />
                </div>
                <span className="text-sm font-bold" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#12002A" }}>Notify me when price drops</span>
              </label>
              <div className="flex gap-2">
                <button onClick={() => setStep("url")} className="flex-1 rounded-2xl py-2.5 text-sm font-bold transition-colors" style={{ border: "2px solid #FFD6F0", fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#FF1493", background: "#fff" }}>Back</button>
                <button onClick={() => { if (!scraped) return; onAdd({ ...scraped, selectedImage: selectedImg, notifyOnSale }); onClose(); }} className="flex-[2] rounded-2xl py-2.5 text-sm font-bold flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #FF1493, #FF69B4)", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
                  <Heart size={14} fill="#fff" />Add to wishlist
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ShareModal({ list, onClose }: { list: Wishlist; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/list/${list.id}`;
  function copy() { navigator.clipboard.writeText(shareUrl).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative rounded-3xl p-6 max-w-sm w-full shadow-2xl" style={{ background: "#fff", border: "2.5px solid #FFD6F0" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-semibold" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#FF1493" }}>Share this list</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#FFE8F5" }}><X size={14} color="#FF1493" /></button>
        </div>
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FFE8F5, #E8FDF9)" }}>
            <span className="text-pink-500"><ListIcon value={list.icon} size={24} /></span>
          </div>
          <p className="text-lg font-semibold" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#12002A" }}>{list.name}</p>
          <p className="text-sm" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#7A5E8A" }}>{list.items.length} item{list.items.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2 mb-3">
          <input readOnly value={shareUrl} className="flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none" style={{ background: "#FDF5FF", border: "2px solid #FFD6F0", fontFamily: "'DM Mono', monospace", color: "#7A5E8A" }} />
          <button onClick={copy} className="px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all" style={{ background: copied ? "#42FAE1" : "#FF1493", color: copied ? "#006B5E" : "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
            {copied ? <><Check size={14} />Copied!</> : <><Copy size={14} />Copy</>}
          </button>
        </div>
        <p className="text-xs text-center" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#C0A0B0" }}>Anyone with this link can view your wishlist</p>
      </div>
    </div>
  );
}

function SaveWishlistPrompt({ onSignUp, onClose }: { onSignUp: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center" style={{ background: "#fff", border: "2.5px solid #FFD6F0" }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#FFE8F5" }}><X size={14} color="#FF1493" /></button>
        <img src={heartsLogo} alt="" width={56} className="select-none mx-auto mb-3" draggable={false} />
        <h3 className="text-xl font-semibold mb-2" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#FF1493" }}>Save your wishlist now by signing up!</h3>
        <p className="text-sm mb-5" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#7A5E8A" }}>
          Without an account, this wishlist only lives in this browser. Sign up so you never lose it.
        </p>
        <button onClick={onSignUp} className="w-full rounded-2xl py-3 text-sm font-bold mb-2" style={{ background: "linear-gradient(135deg, #FF1493, #FF69B4)", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
          Sign up
        </button>
        <button onClick={onClose} className="w-full text-center text-xs font-bold py-1" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#C0A0B0" }}>
          Maybe later
        </button>
      </div>
    </div>
  );
}

function NotificationsPanel({ notifications, onMarkRead, onClose }: { notifications: Notification[]; onMarkRead: (id: string) => void; onClose: () => void }) {
  const unread = notifications.filter(n => !n.read);
  return (
    <div className="absolute top-12 right-0 z-40 w-80 rounded-3xl shadow-2xl overflow-hidden" style={{ background: "#fff", border: "2.5px solid #FFD6F0" }} onClick={e => e.stopPropagation()}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: "linear-gradient(135deg, #FFE8F5, #E8FDF9)" }}>
        <h4 className="font-semibold" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#FF1493" }}>Price alerts</h4>
        {unread.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#FF1493", color: "#fff", fontFamily: "'DM Mono', monospace" }}>{unread.length} new</span>}
      </div>
      <div className="max-h-72 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#C0A0B0" }}>No alerts yet!</div>
        ) : notifications.map(n => (
          <div key={n.id} onClick={() => onMarkRead(n.id)} className="px-4 py-3 border-b cursor-pointer hover:bg-pink-50 transition-colors" style={{ borderColor: "#FFE8F5" }}>
            <div className="flex items-start gap-2">
              {!n.read && <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#FF1493" }} />}
              <div className={!n.read ? "" : "pl-4"}>
                <p className="text-sm font-bold line-clamp-1" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#12002A" }}>{n.itemTitle}</p>
                <p className="text-xs mt-0.5" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#7A5E8A" }}>in <span className="font-bold">{n.listName}</span></p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#FF1493" }}>{fmt(n.newPrice)}</span>
                  <span className="text-xs line-through" style={{ fontFamily: "'DM Mono', monospace", color: "#C0A0B0" }}>{fmt(n.oldPrice)}</span>
                  <SaleBadge pct={n.salePercent} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={onClose} className="w-full py-2.5 text-xs font-bold transition-colors" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#FF1493", borderTop: "2px solid #FFE8F5" }}>Close</button>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#FFFFFF", backgroundImage: polkaDotBg, cursor: heartCursor }}>
      <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "#FFD6F0", borderTopColor: "#FF1493" }} />
    </div>
  );
}

function AuthScreen({ onAuthed, onClose, initialMode = "login", claiming = false }: {
  onAuthed: (user: User) => void; onClose?: () => void; initialMode?: "login" | "signup"; claiming?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || loading) return;
    setLoading(true);
    setError(null);
    try {
      const user = mode === "login" ? await apiLogin(email.trim(), password)
        : claiming ? await apiClaimAccount(email.trim(), password)
        : await apiSignup(email.trim(), password);
      onAuthed(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const content = (
    <div className="w-full max-w-sm rounded-[2rem] shadow-2xl p-8 relative" style={{ background: "#FFE8F5", border: "3px solid #fff" }} onClick={e => e.stopPropagation()}>
      {onClose && (
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#fff" }}>
          <X size={15} color="#FF1493" />
        </button>
      )}
      <div className="flex flex-col items-center mb-6">
        <img src={heartsLogo} alt="" width={64} className="select-none mb-2" draggable={false} />
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#FF1493" }}>Wishly</h1>
        <p className="text-sm mt-1 text-center" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#7A5E8A" }}>
          {mode === "login" ? "Welcome back!" : claiming ? "Save your wishlist by creating a password" : "Create your account"}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" autoFocus
          className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
          style={{ background: "#fff", border: "2px solid #FFD6F0", fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#12002A" }}
        />
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
          className="w-full rounded-2xl px-4 py-3 text-sm focus:outline-none"
          style={{ background: "#fff", border: "2px solid #FFD6F0", fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#12002A" }}
        />
        {error && (
          <div className="flex items-center gap-2 rounded-2xl p-3 text-xs font-bold" style={{ background: "#FFEAF0", color: "#D6003F", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
            <AlertCircle size={14} />{error}
          </div>
        )}
        <button
          type="submit" disabled={loading || !email.trim() || !password}
          className="w-full rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, #FF1493, #FF69B4)", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}
        >
          {loading ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>
      <button
        onClick={() => { setMode(m => m === "login" ? "signup" : "login"); setError(null); }}
        className="w-full text-center text-xs font-bold mt-4"
        style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#FF1493" }}
      >
        {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
      </button>
    </div>
  );

  if (!onClose) {
    return (
      <div className="min-h-screen flex items-center justify-center p-3 md:p-6" style={{ background: "#FFFFFF", backgroundImage: polkaDotBg, cursor: heartCursor }}>
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      {content}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [listsLoading, setListsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lists, setLists] = useState<Wishlist[]>([]);
  const [activeListId, setActiveListId] = useState<string>("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListIcon, setNewListIcon] = useState("star");
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingIcon, setEditingIcon] = useState("star");
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"default" | "priority" | "price-asc" | "price-desc">("default");
  const [showAuthOverlay, setShowAuthOverlay] = useState<false | "login" | "signup">(false);
  const [showSaveNag, setShowSaveNag] = useState(false);
  const [draggedListId, setDraggedListId] = useState<string | null>(null);
  const [showTabOverflow, setShowTabOverflow] = useState(false);
  const [visibleTabCount, setVisibleTabCount] = useState(Infinity);
  const tabsRowRef = useRef<HTMLDivElement>(null);
  const tabsMeasureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMe().then(setUser).catch(() => setUser(null)).finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    setListsLoading(true);
    fetchLists()
      .then(ls => { setLists(ls); setActiveListId(ls[0]?.id ?? ""); })
      .catch(err => setActionError(err instanceof Error ? err.message : "Couldn't load your wishlists"))
      .finally(() => setListsLoading(false));
  }, [user]);

  // Measures how many wishlist tabs actually fit on one row (against an
  // off-screen clone), so the rest can be tucked behind the "..." button
  // instead of wrapping to a second row.
  useLayoutEffect(() => {
    function measure() {
      const container = tabsRowRef.current;
      const measureRow = tabsMeasureRef.current;
      if (!container || !measureRow) return;
      const gap = 6;
      const buttonSpace = 28 + gap; // the "+" and "..." buttons are fixed w-7 h-7 circles
      const widths = Array.from(measureRow.children).map(c => (c as HTMLElement).offsetWidth);
      const available = container.clientWidth;

      const totalWithAddButton = widths.reduce((sum, w) => sum + w + gap, 0) + buttonSpace;
      if (totalWithAddButton <= available) {
        setVisibleTabCount(widths.length);
        return;
      }

      const budget = available - buttonSpace * 2; // reserve room for both "+" and "..."
      let used = 0;
      let count = 0;
      for (const w of widths) {
        const next = used + w + gap;
        if (next > budget) break;
        used = next;
        count++;
      }
      setVisibleTabCount(count);
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (tabsRowRef.current) ro.observe(tabsRowRef.current);
    return () => ro.disconnect();
  }, [lists]);

  async function handleLogout() {
    try { await apiLogout(); } catch { /* clear local state regardless */ }
    setUser(null);
    setLists([]);
    setActiveListId("");
    setSelectedItemId(null);
    setNotifications([]);
  }

  const activeList = lists.find(l => l.id === activeListId)!;
  const selectedItem = activeList?.items.find(i => i.id === selectedItemId) ?? null;
  const unreadCount = notifications.filter(n => !n.read).length;

  if (!authChecked || listsLoading) return <LoadingScreen />;

  const sortedItems = activeList ? [...activeList.items].sort((a, b) => {
    if (sortBy === "priority") return Number(b.priority) - Number(a.priority);
    if (sortBy === "price-asc") return (a.price ?? Infinity) - (b.price ?? Infinity);
    if (sortBy === "price-desc") return (b.price ?? -Infinity) - (a.price ?? -Infinity);
    return 0;
  }) : [];

  async function addItem(input: Omit<WishlistItem, "id" | "addedAt" | "priority">) {
    try {
      const item = await apiCreateItem({ listId: activeListId, ...input });
      setLists(ls => ls.map(l => l.id === activeListId ? { ...l, items: [item, ...l.items] } : l));
      setSelectedItemId(item.id);
      if (item.onSale && item.salePercent) {
        setNotifications(ns => [{ id: uid(), itemTitle: item.title, listName: activeList.name, oldPrice: item.originalPrice!, newPrice: item.price!, salePercent: item.salePercent!, timestamp: new Date(), read: false }, ...ns]);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't add that item");
    }
  }
  async function deleteItem(itemId: string) {
    try {
      await apiDeleteItem(itemId);
      setLists(ls => ls.map(l => l.id === activeListId ? { ...l, items: l.items.filter(i => i.id !== itemId) } : l));
      if (selectedItemId === itemId) setSelectedItemId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't delete that item");
    }
  }
  async function changePhoto(itemId: string, img: string) {
    try {
      const item = await apiPatchItem(itemId, { selectedImage: img });
      setLists(ls => ls.map(l => l.id === activeListId ? { ...l, items: l.items.map(i => i.id === itemId ? item : i) } : l));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't change that photo");
    }
  }
  async function togglePriority(itemId: string) {
    const current = activeList?.items.find(i => i.id === itemId);
    if (!current) return;
    try {
      const item = await apiPatchItem(itemId, { priority: !current.priority });
      setLists(ls => ls.map(l => l.id === activeListId ? { ...l, items: l.items.map(i => i.id === itemId ? item : i) } : l));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't update priority");
    }
  }
  async function createList() {
    if (!newListName.trim()) return;
    try {
      // First-time (not-logged-in) visitors get a real account created
      // behind the scenes so they can start building a list right away —
      // setUser happens only after the list exists server-side, so the
      // lists-loading effect that setUser triggers can't race past it.
      const wasGuestless = !user;
      const activeUser = user ?? await apiCreateGuest();
      const nl = await apiCreateList(newListName.trim(), newListIcon);
      if (wasGuestless) setUser(activeUser);
      setLists(ls => [...ls, nl]); setActiveListId(nl.id); setSelectedItemId(null);
      setNewListName(""); setNewListIcon("star"); setShowNewList(false);
      if (wasGuestless) setShowSaveNag(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't create that list");
    }
  }
  async function deleteList(id: string) {
    try {
      await apiDeleteList(id);
      const remaining = lists.filter(l => l.id !== id);
      setLists(remaining);
      if (activeListId === id) { setActiveListId(remaining[0]?.id ?? ""); setSelectedItemId(null); }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't delete that list");
    }
  }
  function reorderLists(newOrder: Wishlist[]) {
    setLists(newOrder);
    apiReorderLists(newOrder.map(l => l.id)).catch(err => setActionError(err instanceof Error ? err.message : "Couldn't save that order"));
  }
  async function saveRename() {
    if (!editingName.trim() || !editingListId) { setEditingListId(null); return; }
    const id = editingListId;
    const icon = editingIcon;
    setEditingListId(null);
    try {
      const updated = await apiRenameList(id, editingName.trim(), icon);
      setLists(ls => ls.map(l => l.id === id ? { ...l, name: updated.name, icon: updated.icon } : l));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't rename that list");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-3 md:p-6" style={{ background: "#FFFFFF", backgroundImage: polkaDotBg, cursor: heartCursor }}>

      {/* Main card */}
      <div className="w-full max-w-[1100px] rounded-[2rem] overflow-hidden shadow-2xl flex flex-col" style={{ background: "#FFE8F5", height: "85vh", border: "3px solid #fff" }}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-0.5 flex-shrink-0" style={{ background: "#fff" }}>
          <div className="flex items-center gap-1.5">
            <img src={heartsLogo} alt="" width={28} className="select-none" draggable={false} />
            <span className="text-lg font-semibold" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#FF1493", letterSpacing: "0.02em" }}>Wishly</span>
          </div>
          <div className="flex items-center gap-1.5">
            {lists.length > 0 && (
              <>
                <button onClick={() => setShowShare(true)} className="flex items-center gap-1 rounded-2xl px-3 py-1.5 text-xs font-bold transition-all" style={{ background: "#fff", border: "2px solid #FFD6F0", color: "#FF1493", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
                  <Share2 size={12} /> Share
                </button>
                <div className="relative">
                  <button onClick={() => setShowNotifs(!showNotifs)} className="relative w-7 h-7 rounded-full flex items-center justify-center transition-all" style={{ background: "#FFF5FD", border: "2px solid #FFD6F0" }}>
                    <Bell size={13} color="#FF1493" />
                    {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#42FAE1", color: "#006B5E", fontFamily: "'DM Mono', monospace" }}>{unreadCount}</span>}
                  </button>
                  {showNotifs && (
                    <div onClick={() => setShowNotifs(false)} className="fixed inset-0 z-30">
                      <NotificationsPanel notifications={notifications} onMarkRead={id => setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n))} onClose={() => setShowNotifs(false)} />
                    </div>
                  )}
                </div>
              </>
            )}
            {user?.email ? (
              <button onClick={handleLogout} title={`Log out (${user.email})`} className="w-7 h-7 rounded-full flex items-center justify-center transition-all" style={{ background: "#FFF5FD", border: "2px solid #FFD6F0" }}>
                <LogOut size={13} color="#FF1493" />
              </button>
            ) : user ? (
              <button onClick={() => setShowAuthOverlay("signup")} className="rounded-2xl px-3 py-1.5 text-xs font-bold transition-all" style={{ background: "linear-gradient(135deg, #FF1493, #FF69B4)", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
                Sign up
              </button>
            ) : (
              <button onClick={() => setShowAuthOverlay("login")} className="rounded-2xl px-3 py-1.5 text-xs font-bold transition-all" style={{ background: "#fff", border: "2px solid #FFD6F0", color: "#FF1493", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
                Log in
              </button>
            )}
          </div>
        </div>

        {actionError && (
          <div className="flex items-center justify-between px-6 py-2 text-xs font-bold flex-shrink-0" style={{ background: "#FFEAF0", color: "#D6003F", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
            <span className="flex items-center gap-1.5"><AlertCircle size={12} />{actionError}</span>
            <button onClick={() => setActionError(null)}><X size={12} /></button>
          </div>
        )}

        {/* Body */}
        {lists.length === 0 ? (
          /* Welcome screen — shown until the first wishlist is created */
          <div className="flex-1 min-h-0 overflow-y-auto flex items-start justify-center p-6 pt-8">
            <div className="text-center max-w-sm">
              <div className="flex justify-center mb-3">
                <img src={heartsLogo} alt="" width={170} className="select-none" draggable={false} />
              </div>
              <h1 className="text-3xl font-semibold mb-2" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#FF1493" }}>Hi! Welcome to Wishly :))</h1>
              <p className="text-base mb-4" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#7A5E8A" }}>Would you like to create a new wishlist?</p>

              {showNewList ? (
                <div className="text-left p-4 rounded-2xl" style={{ background: "#fff", border: "2px solid #FFD6F0" }}>
                  <div className="grid grid-cols-4 gap-1.5 mb-3 justify-items-center">
                    {LIST_ICONS.map(({ value, Icon }) => (
                      <button key={value} onClick={() => setNewListIcon(value)} className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{ background: newListIcon === value ? "#FF1493" : "#FFE8F5", color: newListIcon === value ? "#fff" : "#FF1493" }}>
                        <Icon size={13} />
                      </button>
                    ))}
                  </div>
                  <input value={newListName} onChange={e => setNewListName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createList(); if (e.key === "Escape") setShowNewList(false); }} placeholder="Name your wishlist..." className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none mb-3" style={{ background: "#FDF5FF", border: "2px solid #FFD6F0", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }} autoFocus />
                  <div className="flex gap-2">
                    <button onClick={createList} className="flex-1 rounded-xl py-2 text-sm font-bold" style={{ background: "#FF1493", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>Create</button>
                    <button onClick={() => setShowNewList(false)} className="flex-1 rounded-xl py-2 text-sm font-bold" style={{ border: "2px solid #FFD6F0", color: "#FF1493", background: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowNewList(true)} className="rounded-2xl px-6 py-3 text-sm font-bold flex items-center gap-2 mx-auto" style={{ background: "linear-gradient(135deg, #FF1493, #FF69B4)", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
                  <Sparkles size={15} />Yes, let's create one!
                </button>
              )}
            </div>
          </div>
        ) : (
        <div className="flex flex-1 min-h-0">

          {/* Left: wishlist tabs + item grid */}
          <div className="flex flex-col flex-shrink-0" style={{ background: "#FFE8F5", width: selectedItem ? "50%" : "100%", transition: "width 300ms ease" }}>
            {/* List tabs */}
            <div className="px-4 pt-4 pb-2 flex-shrink-0">
              {/* Off-screen clone used only to measure how many tabs fit in one row */}
              <div ref={tabsMeasureRef} aria-hidden="true" style={{ position: "absolute", top: -9999, left: 0, visibility: "hidden", display: "flex", gap: 6, whiteSpace: "nowrap" }}>
                {lists.map(list => (
                  <div key={list.id} className="flex items-center gap-1.5 rounded-2xl pl-3 pr-1.5 py-1.5 text-xs font-bold" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", border: "2px solid transparent" }}>
                    <ListIcon value={list.icon} size={12} />
                    <span className="max-w-[80px] truncate">{list.name}</span>
                    <span className="text-xs rounded-full px-1" style={{ fontFamily: "'DM Mono', monospace" }}>{list.items.length}</span>
                    <span className="w-4 h-4 rounded-full flex-shrink-0" />
                  </div>
                ))}
              </div>
              <div ref={tabsRowRef} className="flex items-center gap-1.5 mb-3 flex-nowrap">
                {lists.slice(0, visibleTabCount).map(list => (
                  editingListId === list.id ? (
                    <div key={list.id} className="relative">
                      <div onClick={saveRename} className="fixed inset-0 z-30" />
                      <input
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditingListId(null); }}
                        className="relative z-40 rounded-2xl px-3 py-1.5 text-xs font-bold focus:outline-none"
                        style={{ width: 120, background: "#fff", border: "2px solid #FF1493", color: "#12002A", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}
                        autoFocus
                      />
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute top-full left-0 mt-2 z-40 p-2.5 rounded-2xl shadow-xl"
                        style={{ width: 210, background: "#fff", border: "2px solid #FFD6F0" }}
                      >
                        <div className="grid grid-cols-6 gap-1 mb-2 justify-items-center">
                          {LIST_ICONS.map(({ value, Icon }) => (
                            <button key={value} onClick={() => setEditingIcon(value)} className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                              style={{ background: editingIcon === value ? "#FF1493" : "#FFE8F5", color: editingIcon === value ? "#fff" : "#FF1493" }}>
                              <Icon size={10} />
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={saveRename} className="flex-1 rounded-lg py-1 text-xs font-bold" style={{ background: "#FF1493", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>Save</button>
                          <button onClick={() => setEditingListId(null)} className="flex-1 rounded-lg py-1 text-xs font-bold" style={{ border: "2px solid #FFD6F0", color: "#FF1493", background: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={list.id}
                      draggable
                      onDragStart={() => setDraggedListId(list.id)}
                      onDragOver={e => {
                        e.preventDefault();
                        if (!draggedListId || draggedListId === list.id) return;
                        const from = lists.findIndex(l => l.id === draggedListId);
                        const to = lists.findIndex(l => l.id === list.id);
                        if (from === -1 || to === -1 || from === to) return;
                        const next = [...lists];
                        const [moved] = next.splice(from, 1);
                        next.splice(to, 0, moved);
                        setLists(next);
                      }}
                      onDragEnd={() => {
                        setDraggedListId(null);
                        apiReorderLists(lists.map(l => l.id)).catch(err => setActionError(err instanceof Error ? err.message : "Couldn't save that order"));
                      }}
                      onClick={() => { setActiveListId(list.id); setSelectedItemId(null); }}
                      onDoubleClick={() => {
                        setActiveListId(list.id);
                        setSelectedItemId(null);
                        setEditingListId(list.id);
                        setEditingName(list.name);
                        setEditingIcon(list.icon);
                      }}
                      onContextMenu={e => {
                        e.preventDefault();
                        setActiveListId(list.id);
                        setSelectedItemId(null);
                        setEditingListId(list.id);
                        setEditingName(list.name);
                        setEditingIcon(list.icon);
                      }}
                      title="Drag to reorder — double click (or two-finger click) to rename"
                      className="flex items-center gap-1.5 rounded-2xl pl-3 pr-1.5 py-1.5 text-xs font-bold transition-all cursor-pointer"
                      style={{
                        background: activeListId === list.id ? "#FF1493" : "#fff",
                        color: activeListId === list.id ? "#fff" : "#FF1493",
                        fontFamily: "'ZT Bros Oskon 90s', sans-serif",
                        border: "2px solid",
                        borderColor: activeListId === list.id ? "#FF1493" : "#FFD6F0",
                        opacity: draggedListId === list.id ? 0.4 : 1,
                      }}
                    >
                      <ListIcon value={list.icon} size={12} />
                      <span className="max-w-[80px] truncate">{list.name}</span>
                      <span className="text-xs rounded-full px-1" style={{ background: activeListId === list.id ? "rgba(255,255,255,0.3)" : "#FFE8F5", fontFamily: "'DM Mono', monospace" }}>{list.items.length}</span>
                      <button
                        onClick={e => { e.stopPropagation(); deleteList(list.id); }}
                        title="Delete this wishlist"
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{ background: activeListId === list.id ? "rgba(255,255,255,0.3)" : "#FFE8F5" }}
                      >
                        <X size={9} />
                      </button>
                    </div>
                  )
                ))}
                {lists.length > visibleTabCount && (
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setShowTabOverflow(v => !v)}
                      title={`${lists.length - visibleTabCount} more wishlist${lists.length - visibleTabCount !== 1 ? "s" : ""}`}
                      className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                      style={{ background: "#fff", border: "2px solid #FFD6F0", color: "#FF1493" }}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {showTabOverflow && (
                      <>
                        <div onClick={() => setShowTabOverflow(false)} className="fixed inset-0 z-30" />
                        <div className="absolute top-full left-0 mt-2 z-40 py-1.5 rounded-2xl shadow-xl max-h-64 overflow-y-auto" style={{ width: 180, background: "#fff", border: "2px solid #FFD6F0" }}>
                          {lists.slice(visibleTabCount).map(list => (
                            <button
                              key={list.id}
                              onClick={() => {
                                setActiveListId(list.id);
                                setSelectedItemId(null);
                                setShowTabOverflow(false);
                                const rest = lists.filter(l => l.id !== list.id);
                                reorderLists([list, ...rest]);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition-colors hover:bg-pink-50"
                              style={{ color: "#12002A", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}
                            >
                              <span className="text-pink-500 flex-shrink-0"><ListIcon value={list.icon} size={13} /></span>
                              <span className="flex-1 text-left truncate">{list.name}</span>
                              <span className="text-xs rounded-full px-1.5" style={{ background: "#FFE8F5", color: "#FF1493", fontFamily: "'DM Mono', monospace" }}>{list.items.length}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setShowNewList(!showNewList)}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                  style={{ background: "#fff", border: "2px solid #FFD6F0", color: "#FF1493" }}
                >
                  <Plus size={13} />
                </button>
              </div>

              {/* New list form */}
              {showNewList && (
                <div className="mb-3 p-3 rounded-2xl" style={{ background: "#fff", border: "2px solid #FFD6F0" }}>
                  <div className="grid grid-cols-9 gap-1.5 mb-2 justify-items-center">
                    {LIST_ICONS.map(({ value, Icon }) => (
                      <button key={value} onClick={() => setNewListIcon(value)} className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                        style={{ background: newListIcon === value ? "#FF1493" : "#FFE8F5", color: newListIcon === value ? "#fff" : "#FF1493" }}>
                        <Icon size={13} />
                      </button>
                    ))}
                  </div>
                  <input value={newListName} onChange={e => setNewListName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createList(); if (e.key === "Escape") setShowNewList(false); }} placeholder="List name..." className="w-full rounded-xl px-2.5 py-1.5 text-xs focus:outline-none mb-2" style={{ background: "#FDF5FF", border: "2px solid #FFD6F0", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }} autoFocus />
                  <div className="flex gap-1.5">
                    <button onClick={createList} className="flex-1 rounded-xl py-1.5 text-xs font-bold" style={{ background: "#FF1493", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>Create</button>
                    <button onClick={() => setShowNewList(false)} className="flex-1 rounded-xl py-1.5 text-xs font-bold" style={{ border: "2px solid #FFD6F0", color: "#FF1493", background: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>Cancel</button>
                  </div>
                </div>
              )}

            </div>

            {/* View + sort controls */}
            {activeList?.items.length > 0 && (
              <div className="px-4 pb-2 flex-shrink-0 flex items-center justify-between gap-2">
                <div className="flex rounded-xl overflow-hidden flex-shrink-0" style={{ border: "2px solid #FFD6F0" }}>
                  <button onClick={() => setViewMode("grid")} className="w-7 h-7 flex items-center justify-center transition-colors" style={{ background: viewMode === "grid" ? "#FF1493" : "#fff", color: viewMode === "grid" ? "#fff" : "#FF1493" }} title="Grid view">
                    <LayoutGrid size={13} />
                  </button>
                  <button onClick={() => setViewMode("list")} className="w-7 h-7 flex items-center justify-center transition-colors" style={{ background: viewMode === "list" ? "#FF1493" : "#fff", color: viewMode === "list" ? "#fff" : "#FF1493" }} title="List view">
                    <List size={13} />
                  </button>
                </div>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  className="text-xs font-bold rounded-xl px-2 py-1.5 focus:outline-none min-w-0"
                  style={{ border: "2px solid #FFD6F0", color: "#FF1493", fontFamily: "'ZT Bros Oskon 90s', sans-serif", background: "#fff" }}
                >
                  <option value="default">Sort: Newest</option>
                  <option value="priority">Sort: Priority</option>
                  <option value="price-asc">Sort: Price low-high</option>
                  <option value="price-desc">Sort: Price high-low</option>
                </select>
              </div>
            )}

            {/* Item grid / list */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-4">
              {activeList?.items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center">
                  <p className="text-sm font-bold mb-2" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#FF1493" }}>Nothing here yet!</p>
                  <p className="text-xs mb-3" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#C0A0B0" }}>Add your first item</p>
                  <button onClick={() => setShowAddItem(true)} className="rounded-2xl px-4 py-2 text-xs font-bold" style={{ background: "#FF1493", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
                    <Plus size={12} className="inline mr-1" />Add item
                  </button>
                </div>
              ) : viewMode === "list" ? (
                <div className="flex flex-col gap-2">
                  {sortedItems.map(item => (
                    <ItemListRow
                      key={item.id} item={item} isSelected={selectedItem?.id === item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      onDelete={() => deleteItem(item.id)}
                      onTogglePriority={() => togglePriority(item.id)}
                    />
                  ))}
                  <button onClick={() => setShowAddItem(true)} className="flex items-center justify-center gap-1.5 rounded-2xl py-2.5 transition-all" style={{ border: "2.5px dashed #FFB6D9", background: "#fff5fb" }}>
                    <Plus size={13} color="#FF1493" />
                    <span className="text-xs font-bold" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#FF1493" }}>Add</span>
                  </button>
                </div>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${selectedItem ? 2 : 4}, 1fr)` }}>
                  {/* Add tile */}
                  <button onClick={() => setShowAddItem(true)} className="rounded-2xl flex flex-col items-center justify-center gap-1 transition-all" style={{ border: "2.5px dashed #FFB6D9", background: "#fff5fb" }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#FFE8F5" }}><Plus size={15} color="#FF1493" /></div>
                    <span className="text-xs font-bold" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#FF1493" }}>Add</span>
                  </button>
                  {sortedItems.map(item => (
                    <ItemCard
                      key={item.id} item={item} isSelected={selectedItem?.id === item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      onDelete={() => deleteItem(item.id)}
                      onChangePhoto={img => changePhoto(item.id, img)}
                      onTogglePriority={() => togglePriority(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: item detail panel — only takes up space once an item is selected */}
          {selectedItem && (
            <div className="flex-1 flex flex-col min-w-0 rounded-[1.5rem] m-3 overflow-hidden" style={{ background: "#fff" }}>
              <>
                {/* Big image */}
                <div className="relative flex-shrink-0 flex items-center justify-center" style={{ height: "260px", background: "#FFE8F5" }}>
                  {selectedItem.selectedImage ? (
                    <img src={selectedItem.selectedImage} alt={selectedItem.title} className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff size={40} color="#FFB6D9" />
                  )}
                  {selectedItem.onSale && (
                    <div className="absolute top-4 left-4"><SaleBadge pct={selectedItem.salePercent!} /></div>
                  )}
                  {/* Quick actions */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    {selectedItem.availableImages.length > 0 && (
                      <button onClick={() => setShowPhotoPicker(true)} className="flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-bold backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.9)", color: "#FF1493", fontFamily: "'ZT Bros Oskon 90s', sans-serif", border: "2px solid #FFD6F0" }}>
                        <Search size={11} />Photos
                      </button>
                    )}
                    <button onClick={() => deleteItem(selectedItem.id)} className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.9)", border: "2px solid #FFD6F0" }}>
                      <Trash2 size={13} color="#FF1493" />
                    </button>
                    <button onClick={() => setSelectedItemId(null)} className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.9)", border: "2px solid #FFD6F0" }} title="Back to grid">
                      <X size={13} color="#FF1493" />
                    </button>
                  </div>
                  {/* list name + rename/delete */}
                  <div className="absolute bottom-4 left-4 flex gap-2">
                    <button onClick={() => { setEditingListId(activeListId); setEditingName(activeList.name); }} className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.85)", color: "#7A5E8A", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
                      <Edit3 size={10} />{activeList.name}
                    </button>
                    {lists.length > 1 && (
                      <button onClick={() => deleteList(activeListId)} className="w-6 h-6 rounded-full flex items-center justify-center backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.85)" }}>
                        <Trash2 size={11} color="#C0A0B0" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Detail */}
                <div className="flex-1 overflow-y-auto p-5">
                  <h2 className="text-xl font-semibold mb-1" style={{ fontFamily: "'Kiwi Soda', cursive", color: "#12002A" }}>{selectedItem.title}</h2>
                  <p className="text-sm mb-3 leading-relaxed" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#7A5E8A" }}>{selectedItem.description}</p>

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-baseline gap-2">
                      {selectedItem.price !== null && <span className="text-2xl font-bold" style={{ fontFamily: "'DM Mono', monospace", color: "#FF1493" }}>{fmt(selectedItem.price)}</span>}
                      {selectedItem.onSale && selectedItem.originalPrice && selectedItem.originalPrice !== selectedItem.price && (
                        <span className="text-sm line-through" style={{ fontFamily: "'DM Mono', monospace", color: "#C0A0B0" }}>{fmt(selectedItem.originalPrice)}</span>
                      )}
                    </div>
                    <a href={selectedItem.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold transition-all" style={{ background: "linear-gradient(135deg, #42FAE1, #00D4B8)", color: "#003D35", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
                      Visit {selectedItem.store} <ExternalLink size={10} />
                    </a>
                  </div>

                  {selectedItem.onSale && (
                    <div className="flex items-center gap-2 rounded-2xl p-3 text-sm" style={{ background: "#E8FDF9", border: "2px solid #42FAE1" }}>
                      <AlertCircle size={15} color="#006B5E" />
                      <span className="font-bold" style={{ fontFamily: "'ZT Bros Oskon 90s', sans-serif", color: "#006B5E" }}>
                        This item is on sale! Save {fmt(selectedItem.originalPrice! - selectedItem.price!)} today.
                      </span>
                    </div>
                  )}
                </div>

                {/* Bottom: add item */}
                <div className="flex-shrink-0 px-5 pb-5">
                  <button onClick={() => setShowAddItem(true)} className="w-full rounded-2xl py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all" style={{ background: "linear-gradient(135deg, #FF1493, #FF69B4)", color: "#fff", fontFamily: "'ZT Bros Oskon 90s', sans-serif" }}>
                    <Plus size={16} />Add another item
                  </button>
                </div>
              </>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Modals */}
      {showAddItem && <AddItemModal onClose={() => setShowAddItem(false)} onAdd={addItem} />}
      {showShare && activeList && <ShareModal list={activeList} onClose={() => setShowShare(false)} />}
      {showPhotoPicker && selectedItem && (
        <PhotoPickerModal
          images={selectedItem.availableImages}
          selected={selectedItem.selectedImage}
          onSelect={img => changePhoto(selectedItem.id, img)}
          onClose={() => setShowPhotoPicker(false)}
        />
      )}
      {showSaveNag && (
        <SaveWishlistPrompt
          onSignUp={() => { setShowSaveNag(false); setShowAuthOverlay("signup"); }}
          onClose={() => setShowSaveNag(false)}
        />
      )}
      {showAuthOverlay && (
        <AuthScreen
          onAuthed={u => { setUser(u); setShowAuthOverlay(false); }}
          onClose={() => setShowAuthOverlay(false)}
          initialMode={showAuthOverlay}
          claiming={!!user && !user.email}
        />
      )}
    </div>
  );
}
