import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  Activity, AlertTriangle, CheckCircle2, Globe, RefreshCw,
  Wifi, WifiOff, Download, Search, Zap,
} from "lucide-react";
import { resolveCanonicalSource, CANONICAL_SOURCES, type CanonicalSource } from "@/lib/canonicalSource";
import { resolveCanonicalEvent } from "@/lib/analytics-canonical-events";

/* =========================================================================
 * Phase 4 — Live Events & Real-Time Analytics Command Center
 * Read-only dashboard over existing analytics tables. No schema changes.
 * Realtime subscription with polling fallback (3s).
 * ========================================================================= */

type StreamEvent = {
  id: string;
  source_table: "lp_funnel_events" | "checkout_funnel_events" | "visitor_activity";
  created_at: string;
  session_id: string | null;
  visitor_id?: string | null;
  event_name: string;
  canonical: string;
  country?: string | null;
  city?: string | null;
  device?: string | null;
  browser?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  page_path?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  value?: number | null;
  is_internal?: boolean | null;
  is_bot?: boolean | null;
  validation_status?: string | null;
  raw: Record<string, unknown>;
};

const STREAM_LIMIT = 200;
const POLL_MS = 3000;

function statusFor(e: StreamEvent): "ok" | "warn" | "fail" {
  if (e.validation_status === "failed" || e.is_bot) return "fail";
  if (e.validation_status === "delayed" || e.is_internal) return "warn";
  return "ok";
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function toCSV(rows: StreamEvent[]): string {
  const header = [
    "time", "session", "canonical", "country", "city", "device", "source",
    "utm_source", "utm_medium", "utm_campaign", "page", "product", "value",
  ];
  const lines = rows.map((r) => [
    r.created_at, r.session_id ?? "", r.canonical, r.country ?? "", r.city ?? "",
    r.device ?? "", resolveCanonicalSource(r), r.utm_source ?? "", r.utm_medium ?? "",
    r.utm_campaign ?? "", r.page_path ?? "", r.product_name ?? r.product_id ?? "",
    r.value ?? "",
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

/* ---------- Data fetchers ---------- */

async function fetchRecent(sinceIso?: string): Promise<StreamEvent[]> {
  const since = sinceIso ?? new Date(Date.now() - 15 * 60_000).toISOString();

  const [lp, ck, va] = await Promise.all([
    supabase.from("lp_funnel_events")
      .select("id,created_at,session_id,event_name,utm_source,utm_medium,utm_campaign,page_path,product_id,product_name,value,is_internal,is_bot,validation_status,device,browser_family,geo_country")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(STREAM_LIMIT),
    supabase.from("checkout_funnel_events")
      .select("id,created_at,session_id,event_name,utm_source,utm_medium,utm_campaign,page_path,product_id,product_name,value,is_internal,country")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(STREAM_LIMIT),
    supabase.from("visitor_activity")
      .select("id,created_at,session_id,visitor_id,activity_type,country,city,device_type,browser,utm_source,utm_medium,utm_campaign,page_path,product_id,product_name,product_price,order_value,is_internal,is_bot_suspect,referrer")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(STREAM_LIMIT),
  ]);

  const events: StreamEvent[] = [];

  (lp.data ?? []).forEach((r: any) => events.push({
    id: `lp:${r.id}`, source_table: "lp_funnel_events", created_at: r.created_at,
    session_id: r.session_id, event_name: r.event_name,
    canonical: resolveCanonicalEvent(r.event_name ?? ""),
    country: r.geo_country, device: r.device, browser: r.browser_family,
    utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign,
    page_path: r.page_path, product_id: r.product_id, product_name: r.product_name,
    value: r.value, is_internal: r.is_internal, is_bot: r.is_bot,
    validation_status: r.validation_status, raw: r,
  }));

  (ck.data ?? []).forEach((r: any) => events.push({
    id: `ck:${r.id}`, source_table: "checkout_funnel_events", created_at: r.created_at,
    session_id: r.session_id, event_name: r.event_name,
    canonical: resolveCanonicalEvent(r.event_name ?? ""),
    country: r.country, utm_source: r.utm_source, utm_medium: r.utm_medium,
    utm_campaign: r.utm_campaign, page_path: r.page_path,
    product_id: r.product_id, product_name: r.product_name, value: r.value,
    is_internal: r.is_internal, raw: r,
  }));

  (va.data ?? []).forEach((r: any) => events.push({
    id: `va:${r.id}`, source_table: "visitor_activity", created_at: r.created_at,
    session_id: r.session_id, visitor_id: r.visitor_id,
    event_name: r.activity_type ?? "page_view",
    canonical: resolveCanonicalEvent(r.activity_type ?? "page_view"),
    country: r.country, city: r.city, device: r.device_type, browser: r.browser,
    utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign,
    page_path: r.page_path, product_id: r.product_id, product_name: r.product_name,
    value: r.order_value ?? r.product_price,
    is_internal: r.is_internal, is_bot: r.is_bot_suspect, raw: r,
  }));

  events.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return events.slice(0, STREAM_LIMIT);
}

/* ---------- Hooks ---------- */

function useLiveStream() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [latencyMs, setLatencyMs] = useState(0);
  const paused = useRef(false);

  const refresh = useCallback(async () => {
    if (paused.current) return;
    const t = performance.now();
    try {
      const next = await fetchRecent();
      setEvents(next);
      setLastFetch(new Date());
      setLatencyMs(Math.round(performance.now() - t));
    } catch (err) {
      console.error("[live-events] fetch failed", err);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, POLL_MS);

    // Realtime attempt (may silently no-op if tables not in publication)
    const channel = supabase
      .channel("live-events-stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lp_funnel_events" }, () => void refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkout_funnel_events" }, () => void refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visitor_activity" }, () => void refresh())
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => { clearInterval(t); supabase.removeChannel(channel); };
  }, [refresh]);

  return { events, connected, lastFetch, latencyMs, refresh, pauseRef: paused };
}

/* ---------- Sub-components ---------- */

const StatusDot = ({ s }: { s: "ok" | "warn" | "fail" }) => {
  const map = { ok: "bg-emerald-500", warn: "bg-amber-500", fail: "bg-rose-500" } as const;
  return <span className={`inline-block h-2 w-2 rounded-full ${map[s]}`} />;
};

function LiveStreamTab({ events, onSelect, filter }: { events: StreamEvent[]; onSelect: (e: StreamEvent) => void; filter: string; }) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) =>
      [e.canonical, e.session_id, e.country, e.city, e.utm_source, e.utm_campaign, e.product_name, e.page_path]
        .some((v) => v && String(v).toLowerCase().includes(q)),
    );
  }, [events, filter]);

  return (
    <ScrollArea className="h-[560px] rounded-md border">
      <div className="divide-y">
        {filtered.map((e) => {
          const s = statusFor(e);
          const src = resolveCanonicalSource(e);
          return (
            <button
              key={e.id}
              onClick={() => onSelect(e)}
              className="grid w-full grid-cols-12 items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50"
            >
              <div className="col-span-1 flex items-center gap-2">
                <StatusDot s={s} />
                <span className="text-muted-foreground">{timeAgo(e.created_at)}</span>
              </div>
              <div className="col-span-2 truncate font-mono">{e.canonical}</div>
              <div className="col-span-2 truncate">{e.country ?? "—"}{e.city ? ` · ${e.city}` : ""}</div>
              <div className="col-span-1 truncate">{e.device ?? "—"}</div>
              <div className="col-span-2 truncate"><Badge variant="outline" className="text-[10px]">{src}</Badge></div>
              <div className="col-span-3 truncate text-muted-foreground">{e.product_name ?? e.page_path ?? "—"}</div>
              <div className="col-span-1 text-right">{e.value ? `$${Number(e.value).toFixed(2)}` : ""}</div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No events in window.</div>
        )}
      </div>
    </ScrollArea>
  );
}

function FunnelTab({ events }: { events: StreamEvent[] }) {
  const steps: { key: string; label: string }[] = [
    { key: "page_view", label: "Page Views" },
    { key: "view_item", label: "View Item" },
    { key: "add_to_cart", label: "Add to Cart" },
    { key: "view_cart", label: "View Cart" },
    { key: "begin_checkout", label: "Begin Checkout" },
    { key: "purchase", label: "Purchase" },
  ];
  const counts = steps.map((s) => events.filter((e) => e.canonical === s.key).length);
  const max = Math.max(1, ...counts);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const c = counts[i];
        const conv = i === 0 ? 100 : counts[0] ? Math.round((c / counts[0]) * 100) : 0;
        return (
          <div key={s.key} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{s.label}</span>
              <span className="text-muted-foreground">{c} · {conv}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(c / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SourceTab({ events }: { events: StreamEvent[] }) {
  const buckets = useMemo(() => {
    const map = new Map<CanonicalSource, { visitors: Set<string>; pv: number; atc: number; checkout: number; purchase: number; revenue: number; }>();
    CANONICAL_SOURCES.forEach((s) => map.set(s, { visitors: new Set(), pv: 0, atc: 0, checkout: 0, purchase: 0, revenue: 0 }));
    events.forEach((e) => {
      const src = resolveCanonicalSource(e);
      const b = map.get(src)!;
      if (e.session_id) b.visitors.add(e.session_id);
      if (e.canonical === "page_view" || e.canonical === "view_item") b.pv++;
      if (e.canonical === "add_to_cart") b.atc++;
      if (e.canonical === "begin_checkout") b.checkout++;
      if (e.canonical === "purchase") { b.purchase++; b.revenue += Number(e.value ?? 0); }
    });
    return Array.from(map.entries()).map(([k, v]) => ({ source: k, visitors: v.visitors.size, ...v }))
      .sort((a, b) => b.visitors - a.visitors);
  }, [events]);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs"><tr>
          {["Source","Visitors","PV","ATC","Checkout","Purchase","Revenue"].map((h) =>
            <th key={h} className="p-2 text-left">{h}</th>)}
        </tr></thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.source} className="border-t">
              <td className="p-2 font-medium capitalize">{b.source}</td>
              <td className="p-2">{b.visitors}</td>
              <td className="p-2">{b.pv}</td>
              <td className="p-2">{b.atc}</td>
              <td className="p-2">{b.checkout}</td>
              <td className="p-2">{b.purchase}</td>
              <td className="p-2">${b.revenue.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlertsTab({ events }: { events: StreamEvent[] }) {
  const alerts = useMemo(() => {
    const out: { sev: "high" | "med" | "low"; msg: string; system: string; fix: string }[] = [];
    const lastATC = events.find((e) => e.canonical === "add_to_cart");
    if (!lastATC || Date.now() - +new Date(lastATC.created_at) > 60 * 60_000) {
      out.push({ sev: "high", msg: "No Add-to-Cart in last 60 minutes", system: "Funnel", fix: "Inspect PDP CTA & tracking emit" });
    }
    const pinPV = events.filter((e) => resolveCanonicalSource(e) === "pinterest" && (e.canonical === "page_view" || e.canonical === "landing")).length;
    const pinVI = events.filter((e) => resolveCanonicalSource(e) === "pinterest" && e.canonical === "view_item").length;
    if (pinPV > 5 && pinVI === 0) out.push({ sev: "med", msg: "Pinterest traffic without Product Views", system: "Attribution", fix: "Check Pinterest deep links" });
    const purchases = events.filter((e) => e.canonical === "purchase").length;
    const checkouts = events.filter((e) => e.canonical === "begin_checkout").length;
    if (purchases > 0 && checkouts === 0) out.push({ sev: "high", msg: "Purchase without Begin Checkout", system: "Funnel waterfall", fix: "Verify begin_checkout emit on checkout page" });
    const failed = events.filter((e) => statusFor(e) === "fail").length;
    if (failed > 10) out.push({ sev: "med", msg: `${failed} failed/bot-flagged events in window`, system: "Validation", fix: "Review bot filter & validation rules" });
    return out;
  }, [events]);

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> All systems nominal.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div key={i} className="rounded-md border p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${a.sev === "high" ? "text-rose-500" : "text-amber-500"}`} />
            <span className="font-medium">{a.msg}</span>
            <Badge variant="outline" className="ml-auto text-[10px] uppercase">{a.sev}</Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">System: {a.system} · Fix: {a.fix}</div>
        </div>
      ))}
    </div>
  );
}

function JourneyTab({ events }: { events: StreamEvent[] }) {
  const bySession = useMemo(() => {
    const m = new Map<string, StreamEvent[]>();
    events.forEach((e) => { if (!e.session_id) return; if (!m.has(e.session_id)) m.set(e.session_id, []); m.get(e.session_id)!.push(e); });
    return Array.from(m.entries())
      .map(([sid, evs]) => ({ sid, evs: evs.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) }))
      .sort((a, b) => b.evs.length - a.evs.length).slice(0, 25);
  }, [events]);
  return (
    <ScrollArea className="h-[560px]">
      <div className="space-y-3">
        {bySession.map(({ sid, evs }) => (
          <div key={sid} className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-mono text-muted-foreground">{sid.slice(0, 12)}…</span>
              <span>{evs[0]?.country ?? "—"} · {evs[0]?.device ?? "—"} · {evs.length} events</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {evs.map((e) => (
                <Badge key={e.id} variant="outline" className="text-[10px]">{e.canonical}</Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

/* ---------- Page ---------- */

export default function LiveEventsPage() {
  const { events, connected, lastFetch, latencyMs, refresh, pauseRef } = useLiveStream();
  const [selected, setSelected] = useState<StreamEvent | null>(null);
  const [filter, setFilter] = useState("");

  const counts = useMemo(() => ({
    total: events.length,
    visitors: new Set(events.map((e) => e.session_id).filter(Boolean)).size,
    revenue: events.filter((e) => e.canonical === "purchase").reduce((s, e) => s + Number(e.value ?? 0), 0),
    failed: events.filter((e) => statusFor(e) === "fail").length,
  }), [events]);

  const exportCsv = () => {
    const blob = new Blob([toCSV(events)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `live-events-${Date.now()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Helmet><title>Live Events — Admin</title></Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Zap className="h-6 w-6 text-primary" /> Live Events</h1>
          <p className="text-sm text-muted-foreground">Realtime monitor over canonical analytics pipeline (last 15 min).</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            {connected ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3 text-amber-500" />}
            {connected ? "Realtime" : "Polling"}
          </Badge>
          <Badge variant="outline">Latency {latencyMs}ms</Badge>
          <Button size="sm" variant="outline" onClick={() => { pauseRef.current = !pauseRef.current; }}>
            <Activity className="mr-1 h-4 w-4" /> Pause/Resume
          </Button>
          <Button size="sm" variant="outline" onClick={() => void refresh()}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" /> CSV</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Events", value: counts.total },
          { label: "Visitors", value: counts.visitors },
          { label: "Revenue", value: `$${counts.revenue.toFixed(2)}` },
          { label: "Failed", value: counts.failed },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{s.label}</div><div className="text-2xl font-bold">{s.value}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Monitor</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter events…" className="pl-7 h-8 text-xs" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="stream">
            <TabsList>
              <TabsTrigger value="stream">Stream</TabsTrigger>
              <TabsTrigger value="journey">Journeys</TabsTrigger>
              <TabsTrigger value="funnel">Funnel</TabsTrigger>
              <TabsTrigger value="sources">Sources</TabsTrigger>
              <TabsTrigger value="alerts">Alerts</TabsTrigger>
            </TabsList>
            <TabsContent value="stream" className="mt-4"><LiveStreamTab events={events} onSelect={setSelected} filter={filter} /></TabsContent>
            <TabsContent value="journey" className="mt-4"><JourneyTab events={events} /></TabsContent>
            <TabsContent value="funnel" className="mt-4"><FunnelTab events={events} /></TabsContent>
            <TabsContent value="sources" className="mt-4"><SourceTab events={events} /></TabsContent>
            <TabsContent value="alerts" className="mt-4"><AlertsTab events={events} /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Globe className="h-3 w-3" /> Last refresh: {lastFetch ? lastFetch.toLocaleTimeString() : "—"} · transport: {connected ? "websocket" : `polling ${POLL_MS}ms`}
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>Event Inspector</SheetTitle></SheetHeader>
          {selected && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-xs text-muted-foreground">Canonical</div><div className="font-mono">{selected.canonical}</div></div>
                <div><div className="text-xs text-muted-foreground">Raw event</div><div className="font-mono">{selected.event_name}</div></div>
                <div><div className="text-xs text-muted-foreground">Source table</div><div className="font-mono">{selected.source_table}</div></div>
                <div><div className="text-xs text-muted-foreground">Status</div><div>{statusFor(selected)}</div></div>
                <div><div className="text-xs text-muted-foreground">Session</div><div className="font-mono truncate">{selected.session_id ?? "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Channel</div><div>{resolveCanonicalSource(selected)}</div></div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Raw payload</div>
                <pre className="max-h-[60vh] overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(selected.raw, null, 2)}</pre>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}