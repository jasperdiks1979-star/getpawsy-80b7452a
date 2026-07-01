import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Users, Eye, ShoppingCart, CreditCard, Pin, PinOff, Minus, X,
  Globe, Smartphone, Monitor, Tablet, Link2, Clock, Package, DollarSign, GripVertical, Move, Maximize2,
  Loader2, Radio,
} from "lucide-react";

interface ActivityRow {
  id: string;
  session_id: string;
  activity_type:
    | "browsing"
    | "product_view"
    | "add_to_cart"
    | "view_cart"
    | "cart"
    | "checkout"
    | "purchase"
    | string;
  country: string | null;
  city: string | null;
  device_type: string | null;
  browser: string | null;
  referrer_category: string | null;
  page_path: string | null;
  product_name: string | null;
  order_value: number | null;
  created_at: string;
}

interface UIState {
  open: boolean;
  pinned: boolean;
  minimized: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

const LS_KEY = "gp:visitor-inspector:v1";
const DEFAULT_STATE: UIState = { open: false, pinned: false, minimized: false, x: -1, y: 96, w: 380, h: 520 };

function loadState(): UIState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}
function saveState(s: UIState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

function deviceIcon(d?: string | null) {
  if (d === "mobile") return <Smartphone className="h-3 w-3" />;
  if (d === "tablet") return <Tablet className="h-3 w-3" />;
  return <Monitor className="h-3 w-3" />;
}

// Normalize the raw activity_type values from `visitor_activity` into the
// 5 buckets displayed in the inspector. `view_cart` folds into the cart
// bucket (both represent an intent-to-purchase state without checkout).
type Bucket = "product_view" | "add_to_cart" | "checkout" | "purchase" | "browsing";
function bucketFor(t: string): Bucket {
  switch (t) {
    case "purchase": return "purchase";
    case "checkout": return "checkout";
    case "add_to_cart":
    case "cart":
    case "view_cart": return "add_to_cart";
    case "product_view": return "product_view";
    default: return "browsing";
  }
}
// Funnel priority — later stages "stick" as the session's current status.
const BUCKET_PRIORITY: Record<Bucket, number> = {
  browsing: 0, product_view: 1, add_to_cart: 2, checkout: 3, purchase: 4,
};
const BUCKET_LABEL: Record<Bucket, string> = {
  browsing: "Browsing",
  product_view: "Product viewed",
  add_to_cart: "Add to cart",
  checkout: "Checkout",
  purchase: "Purchase",
};

function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

export function useLiveVisitorInspector() {
  const [state, setState] = useState<UIState>(() => loadState());
  useEffect(() => { saveState(state); }, [state]);
  const open = useCallback(() => setState(s => ({ ...s, open: true, minimized: false })), []);
  const close = useCallback(() => setState(s => ({ ...s, open: false })), []);
  return { state, setState, open, close };
}

interface Props {
  state: UIState;
  setState: React.Dispatch<React.SetStateAction<UIState>>;
}

export const LiveVisitorInspector = ({ state, setState }: Props) => {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; active: boolean }>({ dx: 0, dy: 0, active: false });
  const titleId = "live-visitor-inspector-title";
  // Remember the element that opened the panel so we can restore focus on close.
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (state.open) {
      openerRef.current = (document.activeElement as HTMLElement) ?? null;
    } else if (openerRef.current) {
      // Restore focus to the opener when the panel closes (WCAG 2.4.3).
      try { openerRef.current.focus(); } catch { /* noop */ }
    }
  }, [state.open]);

  // Tick every 10s to keep session-duration labels fresh (no DB polling).
  useEffect(() => {
    if (!state.open || state.minimized) return;
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, [state.open, state.minimized]);

  // Initial fetch + realtime subscription (single channel, INSERT only).
  useEffect(() => {
    if (!state.open) return;
    let cancelled = false;

    const fetchInitial = async () => {
      setLoading(true);
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("visitor_activity")
        .select("id, session_id, activity_type, country, city, device_type, browser, referrer_category, page_path, product_name, order_value, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!cancelled) {
        if (!error && data) setRows(data as ActivityRow[]);
        setLoading(false);
        setLastUpdated(Date.now());
      }
    };
    fetchInitial();

    const channel = supabase
      .channel("visitor-inspector-desktop")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "visitor_activity" },
        (payload) => {
          const row = payload.new as ActivityRow;
          setRows(prev => [row, ...prev].slice(0, 200));
          setLastUpdated(Date.now());
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [state.open]);

  // Drag
  const onPointerDown = (e: React.PointerEvent) => {
    if (state.pinned) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, active: true };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const x = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - dragRef.current.dx));
    const y = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragRef.current.dy));
    setState(s => ({ ...s, x, y }));
  };
  const onPointerUp = () => { dragRef.current.active = false; };

  // Keyboard move: arrow keys nudge the panel when the drag handle has focus.
  const nudge = useCallback((dx: number, dy: number) => {
    setState(s => {
      if (s.pinned) return s;
      const x = Math.max(0, Math.min(window.innerWidth - 120, (s.x < 0 ? window.innerWidth - s.w - 24 : s.x) + dx));
      const y = Math.max(0, Math.min(window.innerHeight - 60, s.y + dy));
      return { ...s, x, y };
    });
  }, [setState]);
  const onMoveHandleKeyDown = (e: React.KeyboardEvent) => {
    if (state.pinned) return;
    const step = e.shiftKey ? 40 : 10;
    switch (e.key) {
      case "ArrowLeft":  e.preventDefault(); nudge(-step, 0); break;
      case "ArrowRight": e.preventDefault(); nudge(step, 0); break;
      case "ArrowUp":    e.preventDefault(); nudge(0, -step); break;
      case "ArrowDown":  e.preventDefault(); nudge(0, step); break;
    }
  };
  // Keyboard resize handle: arrow keys change width/height while focused.
  const resize = useCallback((dw: number, dh: number) => {
    setState(s => {
      if (s.pinned || s.minimized) return s;
      const w = Math.max(320, Math.min(window.innerWidth - 40, s.w + dw));
      const h = Math.max(240, Math.min(window.innerHeight - 40, s.h + dh));
      return { ...s, w, h };
    });
  }, [setState]);
  const onResizeKeyDown = (e: React.KeyboardEvent) => {
    if (state.pinned || state.minimized) return;
    const step = e.shiftKey ? 40 : 10;
    switch (e.key) {
      case "ArrowLeft":  e.preventDefault(); resize(-step, 0); break;
      case "ArrowRight": e.preventDefault(); resize(step, 0); break;
      case "ArrowUp":    e.preventDefault(); resize(0, -step); break;
      case "ArrowDown":  e.preventDefault(); resize(0, step); break;
    }
  };
  // Escape closes the panel — matches native dialog affordance.
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setState(s => ({ ...s, open: false }));
    }
  };

  // Track manual resize via ResizeObserver
  useEffect(() => {
    if (!panelRef.current) return;
    const el = panelRef.current;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setState(s => (s.w === w && s.h === h ? s : { ...s, w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setState, state.open, state.minimized]);

  // Derived stats
  const stats = useMemo(() => {
    // Track the "furthest reached" bucket per session, plus first/last timestamps.
    const sessions = new Map<string, { bucket: Bucket; last: number; first: number }>();
    for (const r of rows) {
      const ts = new Date(r.created_at).getTime();
      const b = bucketFor(r.activity_type);
      const cur = sessions.get(r.session_id);
      if (!cur) sessions.set(r.session_id, { bucket: b, last: ts, first: ts });
      else {
        cur.first = Math.min(cur.first, ts);
        if (ts > cur.last) cur.last = ts;
        // Sticky funnel: never regress to a lower stage within the 15-min window.
        if (BUCKET_PRIORITY[b] > BUCKET_PRIORITY[cur.bucket]) cur.bucket = b;
      }
    }
    let browsing = 0, product_view = 0, add_to_cart = 0, checkout = 0, purchase = 0;
    sessions.forEach(v => {
      if (v.bucket === "browsing") browsing++;
      else if (v.bucket === "product_view") product_view++;
      else if (v.bucket === "add_to_cart") add_to_cart++;
      else if (v.bucket === "checkout") checkout++;
      else if (v.bucket === "purchase") purchase++;
    });
    return { total: sessions.size, browsing, product_view, add_to_cart, checkout, purchase, sessions };
  }, [rows]);

  if (!state.open) return null;

  const xPx = state.x < 0 ? window.innerWidth - state.w - 24 : state.x;

  const panel = (
    <div
      ref={panelRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onPanelKeyDown}
      className="fixed z-[70] flex flex-col rounded-lg border border-slate-700 bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur"
      style={{
        left: xPx,
        top: state.y,
        width: state.w,
        height: state.minimized ? "auto" : state.h,
        minWidth: 320,
        minHeight: state.minimized ? undefined : 240,
        // Pointer resize stays available via the visible corner grip; the
        // dedicated resize <button> below provides the keyboard equivalent.
        resize: state.minimized || state.pinned ? "none" : "both",
        overflow: "hidden",
      }}
      role="dialog"
      aria-labelledby={titleId}
    >
      {/* Header / drag handle */}
      <div
        onPointerDown={onPointerDown}
        className={`flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-800/80 px-3 py-2 ${state.pinned ? "cursor-default" : "cursor-move"}`}
      >
        <div className="flex items-center gap-2 text-xs font-semibold">
          {/* Focusable drag handle — arrow keys move the panel for keyboard users. */}
          <button
            type="button"
            onKeyDown={onMoveHandleKeyDown}
            disabled={state.pinned}
            aria-label={state.pinned ? "Panel pinned — move disabled" : "Move panel (arrow keys, shift for larger steps)"}
            className="rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
          >
            <GripVertical className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
          </button>
          <Users className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          <span id={titleId}>Live Visitors</span>
          <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300 tabular-nums">
            {stats.total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setState(s => ({ ...s, pinned: !s.pinned }))}
            className="rounded p-1 hover:bg-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            title={state.pinned ? "Unpin" : "Pin position"}
            aria-label={state.pinned ? "Unpin panel" : "Pin panel position"}
            aria-pressed={state.pinned}
          >
            {state.pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => setState(s => ({ ...s, minimized: !s.minimized }))}
            className="rounded p-1 hover:bg-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            title={state.minimized ? "Expand" : "Minimize"}
            aria-label={state.minimized ? "Expand panel" : "Minimize panel"}
            aria-expanded={!state.minimized}
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setState(s => ({ ...s, open: false }))}
            className="rounded p-1 hover:bg-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            title="Close (Esc)"
            aria-label="Close visitor inspector"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {!state.minimized && (
        <>
          {/* Summary — 5-stage funnel mirrors the ActivityDot color legend below. */}
          <div className="grid grid-cols-5 gap-1.5 border-b border-slate-800 px-3 py-2 text-[11px]">
            <SummaryCell icon={<Users className="h-3 w-3" />} label="Active" value={stats.total} tone="text-slate-200" />
            <SummaryCell icon={<Eye className="h-3 w-3" />} label="Product" value={stats.product_view} tone="text-cyan-300" />
            <SummaryCell icon={<ShoppingCart className="h-3 w-3" />} label="Cart" value={stats.add_to_cart} tone="text-amber-300" />
            <SummaryCell icon={<CreditCard className="h-3 w-3" />} label="Checkout" value={stats.checkout} tone="text-emerald-300" />
            <SummaryCell icon={<DollarSign className="h-3 w-3" />} label="Purchase" value={stats.purchase} tone="text-fuchsia-300" />
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-slate-400" aria-live="polite" aria-busy="true">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-400" aria-hidden="true" />
                <p>Connecting to live visitor stream…</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center" aria-live="polite">
                <Radio className="h-5 w-5 text-slate-500" aria-hidden="true" />
                <p className="text-xs text-slate-300">No live visitor events right now.</p>
                <p className="max-w-[220px] text-[11px] text-slate-500">
                  The realtime stream is quiet. Events will appear automatically when visitors browse, add to cart, or purchase.
                </p>
                {lastUpdated && (
                  <p className="mt-1 text-[10px] text-slate-500 tabular-nums">
                    Checked {formatLastUpdated(lastUpdated)}
                  </p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {rows.slice(0, 60).map(r => {
                  const sess = stats.sessions.get(r.session_id);
                  const durMs = sess ? sess.last - sess.first : 0;
                  return (
                    <li key={r.id} className="px-3 py-2 text-[11px] hover:bg-slate-800/60">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <ActivityDot type={r.activity_type} />
                          <span className="font-medium">{BUCKET_LABEL[bucketFor(r.activity_type)]}</span>
                          {r.order_value ? (
                            <span className="text-fuchsia-300">· ${Number(r.order_value).toFixed(2)}</span>
                          ) : null}
                        </div>
                        <span className="text-slate-500 tabular-nums">{new Date(r.created_at).toLocaleTimeString()}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-400">
                        <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{r.country || "?"}{r.city ? ` · ${r.city}` : ""}</span>
                        <span className="inline-flex items-center gap-1">{deviceIcon(r.device_type)}{r.browser || "unknown"}</span>
                        {r.referrer_category && (
                          <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" />{r.referrer_category}</span>
                        )}
                        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(durMs)}</span>
                      </div>
                      {r.page_path && (
                        <div className="mt-0.5 truncate text-slate-300" title={r.page_path}>{r.page_path}</div>
                      )}
                      {r.product_name && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-emerald-300">
                          <Package className="h-3 w-3" />
                          <span className="truncate" title={r.product_name}>{r.product_name}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-800 px-3 py-1.5 text-[10px] text-slate-500">
            Realtime · last 15 min · {rows.length} events · updates via websocket (no polling)
            <span className="ml-1 opacity-50">t={new Date(now).toLocaleTimeString()}</span>
          </div>
          {/* Keyboard-accessible resize handle. The CSS `resize: both` corner
              is not reachable by keyboard, so we expose a focusable button
              that responds to arrow keys. */}
          {!state.pinned && (
            <button
              type="button"
              onKeyDown={onResizeKeyDown}
              aria-label="Resize panel (arrow keys, shift for larger steps)"
              title="Resize (arrow keys)"
              className="absolute bottom-1 right-1 rounded p-0.5 text-slate-500 hover:text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Maximize2 className="h-3 w-3 rotate-90" aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );

  return createPortal(panel, document.body);
};

function SummaryCell({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900 px-1.5 py-1">
      <div className={`flex items-center gap-1 ${tone}`}>{icon}<span className="text-[10px] uppercase opacity-80">{label}</span></div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ActivityDot({ type }: { type: string }) {
  const b = bucketFor(type);
  const color =
    b === "purchase" ? "bg-fuchsia-400" :
    b === "checkout" ? "bg-emerald-400" :
    b === "add_to_cart" ? "bg-amber-400" :
    b === "product_view" ? "bg-cyan-400" :
    "bg-blue-400";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}