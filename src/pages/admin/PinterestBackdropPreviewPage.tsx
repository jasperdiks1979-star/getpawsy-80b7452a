import { useEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, Image as ImageIcon, Send, RefreshCw, Dices, Search, X, CheckCircle2, Sparkles, ImageOff, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type PreviewPin = {
  hook_group: string;
  pin_variant: string;
  pin_title: string;
  pin_description: string;
  pin_image_url: string;
  destination_link: string;
  scheduled_at: string;
  overlay_text: string;
  backdrop_url: string | null;
  backdrop_query: string | null;
  backdrop_avg_color?: string | null;
  backdrop_source?: "pexels" | "cloudinary_fallback" | null;
  backdrop_width?: number | null;
  backdrop_height?: number | null;
  backdrop_photographer?: string | null;
  backdrop_pexels_page?: string | null;
  backdrop_hook_group?: string | null;
  backdrop_style?: "dark" | "subtle" | "accent" | null;
  backdrop_score?: number | null;
  backdrop_variants?: Array<{ style: string; score: number; url: string }> | null;
  uses_lifestyle_backdrop: boolean;
};

const DEFAULT_SLUG = "automatic-cat-litter-box-self-cleaning-app-control";

function normalizeSlugInput(raw: string): string {
  if (!raw) return raw;
  let s = raw.trim();
  const m = s.match(/\/products\/([^/?#]+)/i);
  if (m) s = m[1];
  s = s.split("?")[0].split("#")[0];
  return s.toLowerCase().replace(/^-+|-+$/g, "");
}

type DebugInfo = {
  fn: string;
  productFound: "yes" | "no" | "—";
  backdropSource: string;
  status: number | string;
  error: string | null;
  resolvedSlug: string;
  productName?: string | null;
  productId?: string | null;
};

const HOOKS: Array<{ key: string; label: string }> = [
  { key: "pain", label: "Pain" },
  { key: "curiosity", label: "Curiosity" },
  { key: "time_saving", label: "Time-saving" },
  { key: "social_proof", label: "Social proof" },
  { key: "transformation", label: "Transformation" },
];

export default function PinterestBackdropPreviewPage() {
  const [slug, setSlug] = useState(DEFAULT_SLUG);
  const [useBackdrop, setUseBackdrop] = useState(true);
  // Per-hook toggle. Default mirrors legacy "every other pin" pattern (0,2,4).
  const [backdropByHook, setBackdropByHook] = useState<Record<string, boolean>>({
    pain: true,
    curiosity: false,
    time_saving: true,
    social_proof: false,
    transformation: true,
  });
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [rerollingAll, setRerollingAll] = useState(false);
  const [rerollingHook, setRerollingHook] = useState<string | null>(null);
  const [pins, setPins] = useState<PreviewPin[]>([]);
  const [batchTag, setBatchTag] = useState<string | null>(null);
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  // Filter/search state for the rendered preview grid.
  const [searchQuery, setSearchQuery] = useState("");
  const [hookFilter, setHookFilter] = useState<string>("all");
  const [backdropOnlyFilter, setBackdropOnlyFilter] = useState(false);
  // Per-hook approval map. Pins start approved; unchecking forces the backdrop
  // off for that hook when queueing (product-only image is queued instead).
  const [approvedByHook, setApprovedByHook] = useState<Record<string, boolean>>({});
  // Multi-select: which hooks are currently selected for bulk on/off actions.
  const [selectedHooks, setSelectedHooks] = useState<Set<string>>(new Set());
  // Pagination — keeps the grid snappy with large pin counts.
  const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const;
  const [pageSize, setPageSize] = useState<number>(24);
  const [page, setPage] = useState(1);
  // Brief skeleton flash while page/sort/filter recompute, so UI feels live.
  const [transitioning, setTransitioning] = useState(false);
  // Sorting — operates on the filtered list before pagination.
  type SortKey = "default" | "hook" | "query" | "product" | "scheduled";
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSelectedHook(key: string) {
    setSelectedHooks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyBulkBackdrop(value: boolean) {
    if (selectedHooks.size === 0) {
      toast.error("Selecteer eerst hooks");
      return;
    }
    setBackdropByHook((prev) => {
      const next = { ...prev };
      selectedHooks.forEach((k) => {
        next[k] = value;
      });
      return next;
    });
    toast.success(
      `${value ? "Enabled" : "Disabled"} backdrop for ${selectedHooks.size} hook${selectedHooks.size === 1 ? "" : "s"}`,
    );
  }

  const filteredPinsRaw = useMemo(() => pins.filter((p) => {
    if (hookFilter !== "all" && p.hook_group !== hookFilter) return false;
    if (backdropOnlyFilter && !p.uses_lifestyle_backdrop) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      p.pin_title,
      p.pin_description,
      p.overlay_text,
      p.hook_group,
      p.backdrop_query,
      p.backdrop_hook_group,
      p.backdrop_photographer,
      p.destination_link,
      slug,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  }), [pins, hookFilter, backdropOnlyFilter, searchQuery, slug]);

  const filteredPins = useMemo(() => {
    if (sortKey === "default") return filteredPinsRaw;
    const dir = sortDir === "asc" ? 1 : -1;
    const productOf = (p: PreviewPin) => {
      // Destination link slug is the most reliable per-pin product key.
      try {
        const u = new URL(p.destination_link);
        const m = u.pathname.match(/\/products\/([^/?#]+)/);
        return (m?.[1] || u.pathname || slug).toLowerCase();
      } catch {
        return slug.toLowerCase();
      }
    };
    const keyOf = (p: PreviewPin): string | number => {
      switch (sortKey) {
        case "hook":
          return (p.hook_group || "").toLowerCase();
        case "query":
          return (p.backdrop_query || "~").toLowerCase();
        case "product":
          return productOf(p);
        case "scheduled":
          return new Date(p.scheduled_at).getTime() || 0;
        default:
          return 0;
      }
    };
    return [...filteredPinsRaw].sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka < kb) return -1 * dir;
      if (ka > kb) return 1 * dir;
      return 0;
    });
  }, [filteredPinsRaw, sortKey, sortDir, slug]);

  const totalPages = Math.max(1, Math.ceil(filteredPins.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pagedPins = filteredPins.slice(pageStart, pageStart + pageSize);

  // Reset to page 1 whenever filters or page size change.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, hookFilter, backdropOnlyFilter, pageSize, pins.length, sortKey, sortDir]);

  // Show a short skeleton flash whenever the visible slice changes, so the
  // user gets immediate feedback even though slicing/sorting is sync.
  useEffect(() => {
    if (pins.length === 0) return;
    setTransitioning(true);
    const t = window.setTimeout(() => setTransitioning(false), 180);
    return () => window.clearTimeout(t);
  }, [safePage, pageSize, sortKey, sortDir, hookFilter, backdropOnlyFilter, searchQuery, pins.length]);

  // ---------------- Virtualization ----------------
  // Auto-virtualize when there are many cards on a single page; can be
  // toggled. Only the visible rows (+ overscan) are mounted in the DOM.
  const [virtualize, setVirtualize] = useState(true);
  const shouldVirtualize = virtualize && pagedPins.length > 24;

  // Responsive column count mirrors the Tailwind grid: 1 / 2 / 3.
  const [cols, setCols] = useState<number>(() =>
    typeof window === "undefined"
      ? 3
      : window.innerWidth >= 1024
      ? 3
      : window.innerWidth >= 768
      ? 2
      : 1,
  );
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setCols(w >= 1024 ? 3 : w >= 768 ? 2 : 1);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Chunk paged pins into rows of `cols` items.
  const rows = useMemo(() => {
    if (!shouldVirtualize) return [] as PreviewPin[][];
    const out: PreviewPin[][] = [];
    for (let i = 0; i < pagedPins.length; i += cols) {
      out.push(pagedPins.slice(i, i + cols));
    }
    return out;
  }, [pagedPins, cols, shouldVirtualize]);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 720, // approx pin card height incl. backdrop block
    overscan: 4,
    scrollMargin: gridContainerRef.current?.offsetTop ?? 0,
  });

  async function runPreview() {
    setLoading(true);
    setPins([]);
    const cleanSlug = normalizeSlugInput(slug);
    if (cleanSlug && cleanSlug !== slug) setSlug(cleanSlug);
    const sentSlug = cleanSlug || DEFAULT_SLUG;
    setDebug({ fn: "pinterest-viral-batch", productFound: "—", backdropSource: "—", status: "pending", error: null, resolvedSlug: sentSlug });
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-viral-batch", {
        body: {
          productSlug: sentSlug,
          useLifestyleBackdrop: useBackdrop,
          backdropByHook: useBackdrop ? backdropByHook : undefined,
          dryRun: true,
        },
      });
      if (error) {
        setDebug((dd) => dd && { ...dd, status: "transport_error", error: error.message || "transport_error" });
        throw error;
      }
      const dd: any = data || {};
      const firstSrc = (dd.pins || []).find((p: any) => p?.backdrop_source)?.backdrop_source
        || (dd?.product ? "product_only" : "—");
      setDebug({
        fn: "pinterest-viral-batch",
        productFound: dd?.product ? "yes" : (dd?.code === "PRODUCT_NOT_FOUND" ? "no" : "—"),
        backdropSource: firstSrc,
        status: dd?.ok ? 200 : (dd?.code || "error"),
        error: dd?.ok ? null : (dd?.message || "Preview failed"),
        resolvedSlug: dd?.product?.slug || sentSlug,
      });
      if (!dd.ok) throw new Error(dd?.message || "Preview failed");
      setPins(data.pins || []);
      setBatchTag(data.batchTag || null);
      // Default every hook to approved on a fresh preview.
      const fresh: Record<string, boolean> = {};
      for (const p of (data.pins || []) as PreviewPin[]) {
        fresh[p.hook_group] = true;
      }
      setApprovedByHook(fresh);
      toast.success(`Preview ready — ${data.pins?.length ?? 0} pins`);
    } catch (e: any) {
      const msg = e?.message || "Preview failed";
      setDebug((dd) => dd && { ...dd, status: dd.status === "pending" ? "transport_error" : dd.status, error: msg });
      toast.error(
        msg.includes("Failed to send a request")
          ? "Edge Function unreachable — check the debug panel for details."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * Re-roll backdrops without rebuilding AI copy / queue order.
   * - When `hookKey` is null → reroll ALL enabled hooks.
   * - When `hookKey` is set  → reroll just that one hook (others unchanged).
   * Server returns a fresh dry-run; we merge only the backdrop_* fields onto
   * existing pins so titles/descriptions/scheduled_at stay stable.
   */
  async function rerollBackdrops(hookKey: string | null) {
    if (!useBackdrop) {
      toast.error("Lifestyle backdrop is uitgeschakeld");
      return;
    }
    if (hookKey) setRerollingHook(hookKey);
    else setRerollingAll(true);
    try {
      const targetMap: Record<string, boolean> = hookKey
        ? { ...Object.fromEntries(HOOKS.map((h) => [h.key, false])), [hookKey]: true }
        : backdropByHook;
      const { data, error } = await supabase.functions.invoke("pinterest-viral-batch", {
        body: {
          productSlug: slug,
          useLifestyleBackdrop: true,
          backdropByHook: targetMap,
          dryRun: true,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "Reroll failed");
      const fresh: PreviewPin[] = data.pins || [];
      setPins((prev) =>
        prev.map((p) => {
          const updated = fresh.find((f) => f.hook_group === p.hook_group);
          if (!updated || !updated.uses_lifestyle_backdrop) return p;
          if (hookKey && p.hook_group !== hookKey) return p;
          return {
            ...p,
            pin_image_url: updated.pin_image_url,
            pin_variant: updated.pin_variant,
            backdrop_url: updated.backdrop_url,
            backdrop_query: updated.backdrop_query,
            backdrop_avg_color: updated.backdrop_avg_color,
            backdrop_source: updated.backdrop_source,
            backdrop_width: updated.backdrop_width,
            backdrop_height: updated.backdrop_height,
            backdrop_photographer: updated.backdrop_photographer,
            backdrop_pexels_page: updated.backdrop_pexels_page,
            backdrop_hook_group: updated.backdrop_hook_group,
            backdrop_style: updated.backdrop_style,
            backdrop_score: updated.backdrop_score,
            backdrop_variants: updated.backdrop_variants,
            uses_lifestyle_backdrop: true,
          };
        }),
      );
      toast.success(hookKey ? `Re-rolled ${hookKey}` : "Re-rolled all backdrops");
    } catch (e: any) {
      toast.error(e?.message || "Reroll failed");
    } finally {
      setRerollingAll(false);
      setRerollingHook(null);
    }
  }

  async function queueForReal() {
    setQueueing(true);
    try {
      // Build effective backdrop map: a hook only keeps its backdrop if the
      // user toggled it on AND approved the preview. Unapproved hooks fall
      // back to product-only (no lifestyle backdrop) when queued.
      const effectiveBackdropByHook: Record<string, boolean> = {};
      for (const h of HOOKS) {
        effectiveBackdropByHook[h.key] =
          !!backdropByHook[h.key] && approvedByHook[h.key] !== false;
      }
      const { data, error } = await supabase.functions.invoke("pinterest-viral-batch", {
        body: {
          productSlug: slug,
          useLifestyleBackdrop: useBackdrop,
          backdropByHook: useBackdrop ? effectiveBackdropByHook : undefined,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "Queue failed");
      toast.success(data.message || "Queued");
    } catch (e: any) {
      toast.error(e?.message || "Queue failed");
    } finally {
      setQueueing(false);
    }
  }

  return (
    <>
      <Helmet>
        <title>Pinterest Backdrop Preview | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="container py-8 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ImageIcon className="h-6 w-6 text-primary" />
            Pinterest Backdrop Preview
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inspecteer welke Pexels lifestyle-backdrops gekozen worden vóórdat
            de pins in de queue belanden. Product foto blijft altijd dominant.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] items-end">
              <div>
                <Label htmlFor="slug" className="text-xs">Product slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="product-slug"
                />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  id="lifestyle"
                  checked={useBackdrop}
                  onCheckedChange={setUseBackdrop}
                />
                <Label htmlFor="lifestyle" className="text-xs cursor-pointer">
                  Lifestyle backdrop
                </Label>
              </div>
              <Button onClick={runPreview} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Generate preview
              </Button>
            </div>

            {debug && (
              <div className="mt-2 rounded border bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground space-y-0.5">
                <div className="flex items-center justify-between text-foreground">
                  <span className="font-semibold">Debug</span>
                  <button
                    type="button"
                    onClick={() => setDebug(null)}
                    className="text-[10px] underline opacity-70 hover:opacity-100"
                  >
                    clear
                  </button>
                </div>
                <div>fn: <span className="text-foreground">{debug.fn}</span></div>
                <div>slug: <span className="text-foreground">{debug.resolvedSlug}</span></div>
                <div>product found: <span className="text-foreground">{debug.productFound}</span></div>
                <div>backdrop source: <span className="text-foreground">{debug.backdropSource}</span></div>
                <div>status: <span className="text-foreground">{String(debug.status)}</span></div>
                {debug.error && <div className="text-destructive">error: {debug.error}</div>}
              </div>
            )}

            {useBackdrop && (
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Backdrop per hook
                  </Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setBackdropByHook(Object.fromEntries(HOOKS.map((h) => [h.key, true])))
                      }
                      className="text-[10px] underline text-muted-foreground hover:text-foreground"
                    >
                      All on
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setBackdropByHook(Object.fromEntries(HOOKS.map((h) => [h.key, false])))
                      }
                      className="text-[10px] underline text-muted-foreground hover:text-foreground"
                    >
                      All off
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 rounded border bg-muted/40">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Checkbox
                      checked={
                        selectedHooks.size === HOOKS.length
                          ? true
                          : selectedHooks.size === 0
                          ? false
                          : "indeterminate"
                      }
                      onCheckedChange={(v) =>
                        setSelectedHooks(
                          v === true ? new Set(HOOKS.map((h) => h.key)) : new Set(),
                        )
                      }
                    />
                    <span>
                      {selectedHooks.size} of {HOOKS.length} selected
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={selectedHooks.size === 0}
                      onClick={() => applyBulkBackdrop(true)}
                    >
                      Enable selected
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={selectedHooks.size === 0}
                      onClick={() => applyBulkBackdrop(false)}
                    >
                      Disable selected
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      disabled={selectedHooks.size === 0}
                      onClick={() => setSelectedHooks(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {HOOKS.map((h) => (
                    <div
                      key={h.key}
                      className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border ${
                        selectedHooks.has(h.key)
                          ? "border-primary bg-primary/5"
                          : "hover:bg-accent"
                      }`}
                    >
                      <Checkbox
                        checked={selectedHooks.has(h.key)}
                        onCheckedChange={() => toggleSelectedHook(h.key)}
                        aria-label={`Select ${h.label}`}
                      />
                      <Switch
                        checked={!!backdropByHook[h.key]}
                        onCheckedChange={(v) =>
                          setBackdropByHook((prev) => ({ ...prev, [h.key]: v }))
                        }
                      />
                      <span className="cursor-pointer" onClick={() => toggleSelectedHook(h.key)}>
                        {h.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pins.length > 0 && (
              <div className="flex items-center justify-between border-t pt-4">
                <div className="text-xs text-muted-foreground">
                  Batch: <span className="font-mono">{batchTag}</span> · {pins.length} pins ·{" "}
                  {pins.filter((p) => p.uses_lifestyle_backdrop).length} met backdrop ·{" "}
                  <span className="text-foreground font-medium">
                    {pins.filter((p) => approvedByHook[p.hook_group] !== false).length} approved
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => rerollBackdrops(null)}
                    disabled={rerollingAll || !useBackdrop}
                  >
                    {rerollingAll ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Dices className="h-4 w-4 mr-2" />
                    )}
                    Reroll all backdrops
                  </Button>
                  <Button
                    onClick={queueForReal}
                    disabled={
                      queueing ||
                      pins.filter((p) => approvedByHook[p.hook_group] !== false).length === 0
                    }
                  >
                    {queueing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                    Queue for publish
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {loading && pins.length === 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-[9/16] w-full rounded-none" />
                <CardContent className="p-3 space-y-2">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {pins.length === 0 && !loading && (
          <Card>
            <CardContent className="p-12 text-center text-sm text-muted-foreground">
              Geen preview geladen. Klik op "Generate preview".
            </CardContent>
          </Card>
        )}

        {pins.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] items-end">
                <div>
                  <Label htmlFor="pin-search" className="text-xs">
                    Search pins
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      id="pin-search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Title, description, Pexels query, product…"
                      className="pl-7 pr-7"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="hook-filter" className="text-xs">
                    Hook group
                  </Label>
                  <select
                    id="hook-filter"
                    value={hookFilter}
                    onChange={(e) => setHookFilter(e.target.value)}
                    className="h-10 w-full md:w-48 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="all">All hooks</option>
                    {HOOKS.map((h) => (
                      <option key={h.key} value={h.key}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    id="backdrop-only"
                    checked={backdropOnlyFilter}
                    onCheckedChange={setBackdropOnlyFilter}
                  />
                  <Label htmlFor="backdrop-only" className="text-xs cursor-pointer">
                    Only with backdrop
                  </Label>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3 border-t pt-3">
                <div>
                  <Label htmlFor="sort-key" className="text-xs">
                    Sort by
                  </Label>
                  <select
                    id="sort-key"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                    className="h-9 w-44 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="default">Default (queue order)</option>
                    <option value="hook">Hook group</option>
                    <option value="query">Pexels query</option>
                    <option value="product">Product</option>
                    <option value="scheduled">Scheduled time</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="sort-dir" className="text-xs">
                    Direction
                  </Label>
                  <select
                    id="sort-dir"
                    value={sortDir}
                    onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                    disabled={sortKey === "default"}
                    className="h-9 w-32 rounded-md border bg-background px-3 text-sm disabled:opacity-50"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
                {sortKey !== "default" && (
                  <button
                    type="button"
                    onClick={() => {
                      setSortKey("default");
                      setSortDir("asc");
                    }}
                    className="text-[11px] underline text-muted-foreground hover:text-foreground pb-2"
                  >
                    Reset sort
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Showing {filteredPins.length === 0 ? 0 : pageStart + 1}–
                  {Math.min(pageStart + pageSize, filteredPins.length)} of {filteredPins.length}
                  {filteredPins.length !== pins.length && (
                    <> (filtered from {pins.length})</>
                  )}
                </span>
                {(searchQuery || hookFilter !== "all" || backdropOnlyFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setHookFilter("all");
                      setBackdropOnlyFilter(false);
                    }}
                    className="underline hover:text-foreground"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {pins.length > 0 && filteredPins.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center text-sm text-muted-foreground">
              Geen pins komen overeen met je filter.
            </CardContent>
          </Card>
        )}

        {filteredPins.length > pageSize && (
          <div className="flex items-center justify-end gap-2 -mb-2">
            <Switch
              id="virtualize"
              checked={virtualize}
              onCheckedChange={setVirtualize}
            />
            <Label htmlFor="virtualize" className="text-xs cursor-pointer">
              Virtualize grid (faster for large pages)
            </Label>
          </div>
        )}

        {(() => {
          const renderPin = (pin: PreviewPin, i: number) => {
            const approved = approvedByHook[pin.hook_group] !== false;
            const hookEnabled = !!backdropByHook[pin.hook_group];
            const willHaveBackdrop =
              useBackdrop && hookEnabled && approved && pin.uses_lifestyle_backdrop;
            return (
            <Card
              key={i}
              className={`overflow-hidden transition ${
                willHaveBackdrop ? "ring-2 ring-primary/60" : ""
              }`}
            >
              <div className="relative bg-muted aspect-[9/16]">
                <img
                  src={pin.pin_image_url}
                  alt={pin.pin_title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <Badge className="absolute top-2 left-2 capitalize">
                  {pin.hook_group.replace("_", " ")}
                </Badge>
                <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                  {willHaveBackdrop ? (
                    <Badge className="bg-primary text-primary-foreground gap-1">
                      <Sparkles className="h-3 w-3" />
                      Lifestyle ON
                    </Badge>
                  ) : pin.uses_lifestyle_backdrop && useBackdrop && hookEnabled && !approved ? (
                    <Badge variant="outline" className="gap-1 border-dashed">
                      <ImageOff className="h-3 w-3" />
                      Backdrop blocked
                    </Badge>
                  ) : pin.uses_lifestyle_backdrop ? (
                    <Badge variant="secondary" className="gap-1 opacity-70">
                      <ImageOff className="h-3 w-3" />
                      Backdrop off
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="opacity-80">
                      Product only
                    </Badge>
                  )}
                </div>
                {!approved && (
                  <div className="absolute inset-0 bg-background/70 backdrop-blur-[1px] flex items-center justify-center">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border border-dashed rounded px-3 py-1 bg-background/80">
                      Not approved
                    </span>
                  </div>
                )}
                {pin.uses_lifestyle_backdrop && (
                  <button
                    type="button"
                    onClick={() => rerollBackdrops(pin.hook_group)}
                    disabled={rerollingHook === pin.hook_group || rerollingAll}
                    className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-background/90 backdrop-blur text-[10px] font-medium border hover:bg-background disabled:opacity-50"
                    title="Reroll this backdrop"
                  >
                    {rerollingHook === pin.hook_group ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Dices className="h-3 w-3" />
                    )}
                    Reroll
                  </button>
                )}
              </div>
              <CardContent className="p-3 space-y-2">
                <div
                  className={`text-[10px] font-medium uppercase tracking-wider flex items-center gap-1 ${
                    willHaveBackdrop
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {willHaveBackdrop ? (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Will queue WITH lifestyle backdrop
                    </>
                  ) : (
                    <>
                      <ImageOff className="h-3 w-3" />
                      Will queue product-only
                    </>
                  )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none -mx-1 px-1 py-1 rounded hover:bg-accent/50">
                  <Checkbox
                    checked={approvedByHook[pin.hook_group] !== false}
                    onCheckedChange={(v) =>
                      setApprovedByHook((prev) => ({
                        ...prev,
                        [pin.hook_group]: v === true,
                      }))
                    }
                  />
                  <span className="text-xs font-medium flex items-center gap-1">
                    {approvedByHook[pin.hook_group] !== false ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        Approved for queue
                      </>
                    ) : (
                      <span className="text-muted-foreground">Approve for queue</span>
                    )}
                  </span>
                </label>
                <p className="text-sm font-medium line-clamp-2">{pin.pin_title}</p>
                <p className="text-xs text-muted-foreground line-clamp-3">
                  {pin.pin_description}
                </p>
                {pin.uses_lifestyle_backdrop && pin.backdrop_url && (
                  <div className="border-t pt-2 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {pin.backdrop_source === "cloudinary_fallback" ? "Fallback" : "Pexels"} · "{pin.backdrop_query}"
                      {pin.backdrop_avg_color && (
                        <span
                          className="inline-block w-3 h-3 rounded-sm border ml-2 align-middle"
                          style={{ backgroundColor: pin.backdrop_avg_color }}
                          title={`avg color ${pin.backdrop_avg_color}`}
                        />
                      )}
                      {pin.backdrop_source === "cloudinary_fallback" && (
                        <Badge variant="outline" className="ml-2 text-[9px] py-0 px-1">
                          fallback
                        </Badge>
                      )}
                    </p>
                    <div className="text-[10px] text-muted-foreground space-y-0.5 leading-snug">
                      {pin.backdrop_hook_group && (
                        <div>
                          Hook:{" "}
                          <span className="font-medium capitalize text-foreground">
                            {pin.backdrop_hook_group.replace("_", " ")}
                          </span>
                        </div>
                      )}
                      {pin.backdrop_width && pin.backdrop_height && (
                        <div>
                          Resolution:{" "}
                          <span className="font-mono">
                            {pin.backdrop_width}×{pin.backdrop_height}
                          </span>
                        </div>
                      )}
                      {pin.backdrop_photographer && (
                        <div className="truncate">
                          Photo by{" "}
                          {pin.backdrop_pexels_page ? (
                            <a
                              href={pin.backdrop_pexels_page}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-foreground"
                            >
                              {pin.backdrop_photographer}
                            </a>
                          ) : (
                            <span>{pin.backdrop_photographer}</span>
                          )}{" "}
                          on Pexels
                        </div>
                      )}
                      <div className="truncate">
                        Source:{" "}
                        <a
                          href={pin.backdrop_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono underline hover:text-foreground"
                          title={pin.backdrop_url}
                        >
                          {pin.backdrop_url.replace(/^https?:\/\//, "").slice(0, 48)}
                          {pin.backdrop_url.length > 55 ? "…" : ""}
                        </a>
                      </div>
                    </div>
                    {pin.backdrop_variants && pin.backdrop_variants.length > 0 ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {pin.backdrop_variants.map((v) => {
                          const isWinner = v.style === pin.backdrop_style;
                          return (
                            <a
                              key={v.style}
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`block rounded border overflow-hidden ${
                                isWinner
                                  ? "ring-2 ring-primary border-primary"
                                  : "opacity-70 hover:opacity-100"
                              }`}
                              title={`${v.style} · score ${v.score}`}
                            >
                              <div className="aspect-[9/16] bg-muted">
                                <img
                                  src={v.url}
                                  alt={`${v.style} variant`}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              <div className="px-1 py-0.5 flex items-center justify-between text-[9px]">
                                <span className="capitalize font-medium">
                                  {v.style}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  {v.score.toFixed(2)}
                                </span>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    ) : (
                      <a
                        href={pin.backdrop_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <img
                          src={pin.backdrop_url}
                          alt="Pexels backdrop"
                          className="w-full h-24 object-cover rounded border"
                          loading="lazy"
                        />
                      </a>
                    )}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {new Date(pin.scheduled_at).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            );
          };

          if (transitioning) {
            return (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                  <Card key={i} className="overflow-hidden animate-pulse">
                    <Skeleton className="aspect-[9/16] w-full rounded-none" />
                    <CardContent className="p-3 space-y-2">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-5/6" />
                      <Skeleton className="h-3 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          }

          if (!shouldVirtualize) {
            return (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pagedPins.map((p, i) => renderPin(p, i))}
              </div>
            );
          }

          const items = virtualizer.getVirtualItems();
          const totalSize = virtualizer.getTotalSize();
          const offset = items[0]?.start ?? 0;
          const scrollMargin = gridContainerRef.current?.offsetTop ?? 0;
          return (
            <div ref={gridContainerRef} style={{ height: totalSize, position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${offset - scrollMargin}px)`,
                }}
              >
                {items.map((vi) => {
                  const row = rows[vi.index];
                  if (!row) return null;
                  const startIdx = vi.index * cols;
                  return (
                    <div
                      key={vi.key}
                      ref={virtualizer.measureElement}
                      data-index={vi.index}
                      className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pb-4"
                    >
                      {row.map((p, j) => renderPin(p, startIdx + j))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {filteredPins.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Per page</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPage(1)}
                disabled={safePage <= 1}
                aria-label="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {safePage} / {totalPages}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Label htmlFor="goto-page" className="text-xs text-muted-foreground">
                    Go to
                  </Label>
                  <select
                    id="goto-page"
                    value={safePage}
                    onChange={(e) => setPage(Number(e.target.value))}
                    className="h-8 rounded-md border bg-background px-2 text-xs tabular-nums"
                  >
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        Page {n}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPage(totalPages)}
                disabled={safePage >= totalPages}
                aria-label="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}