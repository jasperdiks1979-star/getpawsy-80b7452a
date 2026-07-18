/**
 * /admin/funnel-health — Phase 2 Funnel Health Center.
 *
 * Canonical, production-only live analytics command center. Reads exclusively from
 * the canonical sources locked down in Phase 1:
 *   - analytics_funnel_waterfall  (session-level funnel ladder)
 *   - lp_funnel_events            (raw landing/page mirror)
 *   - checkout_funnel_events      (checkout-specific steps)
 *   - visitor_activity            (visitor/session activity)
 *   - orders                      (purchases / revenue truth)
 *
 * Every event name shown is resolved through analytics-canonical-events.ts
 * so legacy aliases never surface and the dashboard cannot drift from the
 * canonical contract enforced by the regression suite.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import { CanonicalKpiStrip } from "@/components/admin/CanonicalKpiStrip";
import { V2EnvelopeBadge } from "@/components/admin/V2EnvelopeBadge";
import {
  CANONICAL_ECOMMERCE_EVENTS,
  REQUIRED_GA4_PARAMS,
  EVENT_ALIASES,
  resolveCanonicalEvent,
  type CanonicalEcommerceEvent,
} from "@/lib/analytics-canonical-events";

type Range = "1h" | "24h" | "7d" | "30d";
type HealthStatus = "green" | "warning" | "red";

const FUNNEL_EVENTS: CanonicalEcommerceEvent[] = [
  "view_item",
  "add_to_cart",
  "view_cart",
  "remove_from_cart",
  "begin_checkout",
  "purchase",
];

const RANGE_HOURS: Record<Range, number> = { "1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

function sinceIso(r: Range): string {
  const d = new Date(Date.now() - RANGE_HOURS[r] * 3600_000);
  return d.toISOString();
}

function statusBadge(s: HealthStatus, label?: string) {
  const cls =
    s === "green" ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40"
    : s === "warning" ? "bg-amber-500/15 text-amber-700 border-amber-500/40"
    : "bg-rose-500/15 text-rose-700 border-rose-500/40";
  return (
    <Badge variant="outline" className={cls} data-testid={`status-${s}`}>
      {label ?? s.toUpperCase()}
    </Badge>
  );
}

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(2)}%`;
}

interface Filters {
  range: Range;
  source: string;
  medium: string;
  campaign: string;
  country: string;
  product: string;
  device: string;
  eventType: "all" | CanonicalEcommerceEvent;
}

const EMPTY_FILTERS: Filters = {
  range: "24h",
  source: "",
  medium: "",
  campaign: "",
  country: "",
  product: "",
  device: "",
  eventType: "all",
};

interface EventDeliveryRow {
  event: CanonicalEcommerceEvent;
  ga4Count: number;            // internal DB mirror (proxy for GA4 emission)
  internalCount: number;       // mirror in lp_funnel_events / visitor_activity / orders
  lpCount: number;
  visitorActivityCount: number;
  waterfallCount: number;
  attributionCount: number;
  lastSuccessAt: string | null;
  lastFailedAt: string | null;
  duplicates: number;
  dropped: number;
  missingParams: number;
  status: HealthStatus;
}

export default function FunnelHealthCenter() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waterfall, setWaterfall] = useState<any[]>([]);
  const [lp, setLp] = useState<any[]>([]);
  const [ck, setCk] = useState<any[]>([]);
  const [va, setVa] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [utm, setUtm] = useState<any[]>([]);
  const [loadStartedAt, setLoadStartedAt] = useState<number>(0);
  const [loadedAt, setLoadedAt] = useState<number>(0);

  const since = useMemo(() => sinceIso(filters.range), [filters.range]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    setLoadStartedAt(Date.now());
    try {
      const [w, l, c, v, o, u] = await Promise.all([
        supabase
          .from("analytics_funnel_waterfall")
          .select("session_id,visitor_id,utm_source,utm_medium,utm_campaign,landing_page,click_at,redirect_at,landing_at,engagement_start_at,page_view_at,scroll_at,view_item_at,add_to_cart_at,view_cart_at,remove_from_cart_at,begin_checkout_at,payment_at,purchase_at,furthest_step,traffic_type,updated_at,created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("lp_funnel_events")
          .select("id,created_at,event_name,product_id,utm_source,utm_medium,utm_campaign,geo_country,device,session_id,value,is_bot,qa,classification,raw_payload")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("checkout_funnel_events")
          .select("id,created_at,step,session_id,value,currency,geo_country,device,is_bot,qa,error_reason")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("visitor_activity")
          .select("id,created_at,activity_type,session_id,product_id,utm_source,utm_medium,utm_campaign")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("orders")
          .select("id,created_at,status,total_amount,currency,stripe_session_id")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("utm_session_log")
          .select("session_id,utm_source,utm_medium,utm_campaign,created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);
      if (w.error) throw w.error;
      setWaterfall(w.data ?? []);
      setLp(l.data ?? []);
      setCk(c.data ?? []);
      setVa(v.data ?? []);
      setOrders(o.data ?? []);
      setUtm(u.data ?? []);
      setLoadedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      // tiny use to satisfy eslint about t0
      void t0;
    }
  }, [since]);

  useEffect(() => { void load(); }, [load]);

  // Apply non-range filters in memory; range is in the query.
  const matchFilter = useCallback(
    (row: Record<string, any>) => {
      if (filters.source && (row.utm_source || "").toLowerCase() !== filters.source.toLowerCase()) return false;
      if (filters.medium && (row.utm_medium || "").toLowerCase() !== filters.medium.toLowerCase()) return false;
      if (filters.campaign && (row.utm_campaign || "").toLowerCase() !== filters.campaign.toLowerCase()) return false;
      if (filters.country && (row.geo_country || "").toLowerCase() !== filters.country.toLowerCase()) return false;
      if (filters.product && String(row.product_id ?? "").toLowerCase() !== filters.product.toLowerCase()) return false;
      if (filters.device && (row.device || "").toLowerCase() !== filters.device.toLowerCase()) return false;
      // Exclude QA / bot traffic from production metrics — Phase 1 lock.
      if (row.qa === true) return false;
      if (row.is_bot === true) return false;
      return true;
    },
    [filters],
  );

  const fLp = useMemo(() => lp.filter(matchFilter), [lp, matchFilter]);
  const fCk = useMemo(() => ck.filter(matchFilter), [ck, matchFilter]);
  const fVa = useMemo(() => va.filter(matchFilter), [va, matchFilter]);
  const fWater = useMemo(() => waterfall.filter(matchFilter), [waterfall, matchFilter]);
  const fUtm = useMemo(() => utm.filter(matchFilter), [utm, matchFilter]);

  // ------------------- Top-line metrics -------------------
  const visitors = useMemo(
    () => new Set([
      ...fVa.map(r => r.session_id),
      ...fLp.map(r => r.session_id),
      ...fWater.map(r => r.session_id),
    ].filter(Boolean)).size,
    [fVa, fLp, fWater],
  );

  function lpCount(canonical: CanonicalEcommerceEvent): number {
    return fLp.filter(r => resolveCanonicalEvent(r.event_name) === canonical).length;
  }

  function vaCount(canonical: CanonicalEcommerceEvent): number {
    return fVa.filter(r => resolveCanonicalEvent(r.activity_type) === canonical).length;
  }

  function waterCount(canonical: CanonicalEcommerceEvent): number {
    const col = `${canonical}_at`;
    return fWater.filter(r => r[col] != null).length;
  }

  function ckCount(canonical: CanonicalEcommerceEvent): number {
    return fCk.filter(r => resolveCanonicalEvent(r.step) === canonical).length;
  }

  const purchases = orders.filter(o =>
    (o.status ?? "").toLowerCase() === "paid" || (o.status ?? "").toLowerCase() === "completed",
  );
  const revenue = purchases.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const purchaseCount = purchases.length;
  const pageViews = fVa.filter(r => r.activity_type === "browsing" || r.activity_type === "product_view").length;
  const viewItemTotal = lpCount("view_item") + vaCount("view_item");
  const addToCartTotal = lpCount("add_to_cart") + vaCount("add_to_cart") + waterCount("add_to_cart");
  const viewCartTotal = lpCount("view_cart") + vaCount("view_cart") + waterCount("view_cart");
  const removeFromCartTotal = lpCount("remove_from_cart") + vaCount("remove_from_cart") + waterCount("remove_from_cart");
  const beginCheckoutTotal = lpCount("begin_checkout") + ckCount("begin_checkout") + waterCount("begin_checkout");

  const convRate = pct(purchaseCount, visitors);
  const cartRate = pct(addToCartTotal, viewItemTotal || visitors);
  const checkoutRate = pct(beginCheckoutTotal, addToCartTotal);
  const purchaseRate = pct(purchaseCount, beginCheckoutTotal);

  // ------------------- Delivery health per event -------------------
  const deliveryRows: EventDeliveryRow[] = useMemo(() => {
    return FUNNEL_EVENTS.map((ev): EventDeliveryRow => {
      const lpRows = fLp.filter(r => resolveCanonicalEvent(r.event_name) === ev);
      const vaRows = fVa.filter(r => resolveCanonicalEvent(r.activity_type) === ev);
      const ckRows = fCk.filter(r => resolveCanonicalEvent(r.step) === ev);
      const wRows = fWater.filter(r => r[`${ev}_at`] != null);

      const allTimes: string[] = [
        ...lpRows.map(r => r.created_at),
        ...vaRows.map(r => r.created_at),
        ...ckRows.map(r => r.created_at),
        ...wRows.map(r => r[`${ev}_at`] || r.created_at),
      ].filter(Boolean).sort();

      const lastSuccessAt = allTimes.length ? allTimes[allTimes.length - 1] : null;
      const failedRows = ckRows.filter(r => r.error_reason);
      const lastFailedAt = failedRows.length
        ? failedRows.map(r => r.created_at).sort().slice(-1)[0]
        : null;

      // Duplicate detection: same session_id + canonical event within 2s window
      const seen = new Map<string, number>();
      let dupes = 0;
      for (const r of lpRows) {
        const key = `${r.session_id}::${ev}`;
        const t = new Date(r.created_at).getTime();
        const prev = seen.get(key);
        if (prev && Math.abs(t - prev) < 2000) dupes++;
        seen.set(key, t);
      }

      // Missing required GA4 params: scan raw_payload on lp rows
      const required = REQUIRED_GA4_PARAMS[ev] ?? [];
      const missingParams = lpRows.filter(r => {
        const p = (r.raw_payload && typeof r.raw_payload === "object") ? r.raw_payload as Record<string, unknown> : {};
        return required.some(k => !(k in p));
      }).length;

      const ga4Count = lpRows.length; // server-side mirror of GA4 dispatch
      const internalCount = lpRows.length + vaRows.length + ckRows.length + (ev === "purchase" ? purchases.length : 0);

      // Attribution: how many of these have any UTM
      const attrCount = lpRows.filter(r => r.utm_source).length
        + vaRows.filter(r => r.utm_source).length;

      // Status logic
      let status: HealthStatus = "green";
      if (ev === "purchase") {
        if (purchaseCount === 0 && visitors > 50) status = "warning";
      }
      if (internalCount === 0 && visitors > 20 && ev !== "purchase" && ev !== "refund") status = "warning";
      if (missingParams > 0 && lpRows.length > 0 && missingParams / lpRows.length > 0.25) status = "warning";
      if (failedRows.length > 0 && failedRows.length / Math.max(1, ckRows.length) > 0.5) status = "red";
      if (lpRows.length === 0 && vaRows.length === 0 && ckRows.length === 0 && visitors > 200 && ev !== "refund") {
        status = "red";
      }

      return {
        event: ev,
        ga4Count,
        internalCount,
        lpCount: lpRows.length,
        visitorActivityCount: vaRows.length,
        waterfallCount: wRows.length,
        attributionCount: attrCount,
        lastSuccessAt,
        lastFailedAt,
        duplicates: dupes,
        dropped: 0,
        missingParams,
        status,
      };
    });
  }, [fLp, fVa, fCk, fWater, purchases, purchaseCount, visitors]);

  const overallStatus: HealthStatus = useMemo(() => {
    if (deliveryRows.some(r => r.status === "red")) return "red";
    if (deliveryRows.some(r => r.status === "warning")) return "warning";
    return "green";
  }, [deliveryRows]);

  const dashboardLatencyMs = loadedAt && loadStartedAt ? loadedAt - loadStartedAt : 0;

  // Distinct values for filter dropdown hints
  const distinct = useMemo(() => {
    return {
      source: Array.from(new Set([...fUtm, ...fLp].map(r => r.utm_source).filter(Boolean))).slice(0, 30),
      medium: Array.from(new Set([...fUtm, ...fLp].map(r => r.utm_medium).filter(Boolean))).slice(0, 30),
      campaign: Array.from(new Set([...fUtm, ...fLp].map(r => r.utm_campaign).filter(Boolean))).slice(0, 30),
      country: Array.from(new Set(fLp.map(r => r.geo_country).filter(Boolean))).slice(0, 30),
      device: Array.from(new Set(fLp.map(r => r.device).filter(Boolean))).slice(0, 30),
    };
  }, [fUtm, fLp]);

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="funnel-health-center">
      <Helmet>
        <title>Funnel Health Center · GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Funnel Health Center</h1>
          <p className="text-muted-foreground text-sm">
            Canonical · live · production-only. Reads exclusively from
            <span className="font-mono"> analytics_funnel_waterfall · lp_funnel_events · checkout_funnel_events · visitor_activity · orders</span>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overallStatus === "green" && statusBadge("green", "GREEN — healthy")}
          {overallStatus === "warning" && statusBadge("warning", "WARNING — partial data")}
          {overallStatus === "red" && statusBadge("red", "RED — broken funnel")}
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </header>

      <CanonicalKpiStrip defaultRange="24h" />

      {/* Phase 4C v2 envelope indicator — bucket split for the currently
          selected range. Additive alongside the legacy KPI strip. */}
      <V2EnvelopeBadge
        hours={RANGE_HOURS[filters.range]}
        geo="all"
        label="Traffic quality (Funnel health)"
      />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load funnel data</AlertTitle>
          <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Filters</CardTitle>
          <CardDescription>Range applies at the query layer. Other filters apply in memory.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={filters.range} onValueChange={v => setFilters(f => ({ ...f, range: v as Range }))}>
            <TabsList>
              <TabsTrigger value="1h">1h</TabsTrigger>
              <TabsTrigger value="24h">24h</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Input placeholder="utm_source" value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))} list="dl-source" />
            <datalist id="dl-source">{distinct.source.map(s => <option key={s} value={s} />)}</datalist>
            <Input placeholder="utm_medium" value={filters.medium} onChange={e => setFilters(f => ({ ...f, medium: e.target.value }))} list="dl-medium" />
            <datalist id="dl-medium">{distinct.medium.map(s => <option key={s} value={s} />)}</datalist>
            <Input placeholder="utm_campaign" value={filters.campaign} onChange={e => setFilters(f => ({ ...f, campaign: e.target.value }))} list="dl-campaign" />
            <datalist id="dl-campaign">{distinct.campaign.map(s => <option key={s} value={s} />)}</datalist>
            <Input placeholder="country" value={filters.country} onChange={e => setFilters(f => ({ ...f, country: e.target.value }))} list="dl-country" />
            <datalist id="dl-country">{distinct.country.map(s => <option key={s} value={s} />)}</datalist>
            <Input placeholder="product_id" value={filters.product} onChange={e => setFilters(f => ({ ...f, product: e.target.value }))} />
            <Input placeholder="device" value={filters.device} onChange={e => setFilters(f => ({ ...f, device: e.target.value }))} list="dl-device" />
            <datalist id="dl-device">{distinct.device.map(s => <option key={s} value={s} />)}</datalist>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={filters.eventType}
              onChange={e => setFilters(f => ({ ...f, eventType: e.target.value as Filters["eventType"] }))}
              data-testid="filter-event-type"
            >
              <option value="all">All canonical events</option>
              {CANONICAL_ECOMMERCE_EVENTS.map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>Reset filters</Button>
          </div>
        </CardContent>
      </Card>

      {/* Live funnel KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="funnel-kpis">
        <Kpi label="Visitors" value={visitors} />
        <Kpi label="page_view" value={pageViews} />
        <Kpi label="view_item" value={viewItemTotal} />
        <Kpi label="add_to_cart" value={addToCartTotal} />
        <Kpi label="view_cart" value={viewCartTotal} />
        <Kpi label="remove_from_cart" value={removeFromCartTotal} />
        <Kpi label="begin_checkout" value={beginCheckoutTotal} />
        <Kpi label="purchase" value={purchaseCount} />
        <Kpi label="revenue" value={`${revenue.toFixed(2)} USD`} />
        <Kpi label="conversion rate" value={convRate} />
        <Kpi label="cart rate" value={cartRate} />
        <Kpi label="checkout rate" value={checkoutRate} />
        <Kpi label="purchase rate" value={purchaseRate} />
        <Kpi label="dashboard latency" value={`${dashboardLatencyMs} ms`} />
      </section>

      {/* Delivery health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Delivery health per canonical event
          </CardTitle>
          <CardDescription>
            One row per canonical event. Each column is a downstream sink.
          </CardDescription>
          <div className="flex gap-2 pt-1">
            {statusBadge("green", "GREEN")}
            {statusBadge("warning", "WARNING")}
            {statusBadge("red", "RED")}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="delivery-table">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 pr-2">event</th>
                <th className="text-right px-2">GA4</th>
                <th className="text-right px-2">internal DB</th>
                <th className="text-right px-2">lp_funnel_events</th>
                <th className="text-right px-2">visitor_activity</th>
                <th className="text-right px-2">funnel_waterfall</th>
                <th className="text-right px-2">attribution</th>
                <th className="text-right px-2">duplicates</th>
                <th className="text-right px-2">missing params</th>
                <th className="text-right px-2">latency</th>
                <th className="text-left px-2">last ok</th>
                <th className="text-left px-2">last fail</th>
                <th className="text-left pl-2">status</th>
              </tr>
            </thead>
            <tbody>
              {deliveryRows
                .filter(r => filters.eventType === "all" || r.event === filters.eventType)
                .map(r => {
                  const latencyMs = r.lastSuccessAt
                    ? Math.max(0, Date.now() - new Date(r.lastSuccessAt).getTime())
                    : null;
                  return (
                    <tr key={r.event} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-mono">{r.event}</td>
                      <td className="text-right px-2">{r.ga4Count}</td>
                      <td className="text-right px-2">{r.internalCount}</td>
                      <td className="text-right px-2">{r.lpCount}</td>
                      <td className="text-right px-2">{r.visitorActivityCount}</td>
                      <td className="text-right px-2">{r.waterfallCount}</td>
                      <td className="text-right px-2">{r.attributionCount}</td>
                      <td className={`text-right px-2 ${r.duplicates ? "text-amber-600" : ""}`}>{r.duplicates}</td>
                      <td className={`text-right px-2 ${r.missingParams ? "text-amber-600" : ""}`}>{r.missingParams}</td>
                      <td className="text-right px-2 font-mono text-xs">
                        {latencyMs == null ? "—" : `${Math.round(latencyMs / 1000)}s`}
                      </td>
                      <td className="px-2 text-xs">{r.lastSuccessAt ? new Date(r.lastSuccessAt).toLocaleString() : "—"}</td>
                      <td className="px-2 text-xs">{r.lastFailedAt ? new Date(r.lastFailedAt).toLocaleString() : "—"}</td>
                      <td className="pl-2">{statusBadge(r.status)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {!loading && deliveryRows.every(r => r.internalCount === 0) && (
            <div
              className="text-center text-sm text-muted-foreground py-8"
              data-testid="funnel-empty-state"
            >
              No production funnel events in the selected window. Adjust the range or remove filters.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Canonical contract panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Canonical contract (read-only)
          </CardTitle>
          <CardDescription>
            Names below are the single source of truth. Legacy aliases such as
            <span className="font-mono"> {Object.keys(EVENT_ALIASES).slice(0, 6).join(", ")} …</span>
            are resolved server-side and never rendered here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2" data-testid="canonical-contract">
          {CANONICAL_ECOMMERCE_EVENTS.map(e => (
            <Badge key={e} variant="secondary" className="font-mono">{e}</Badge>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription className="text-xs font-mono">{label}</CardDescription>
        <CardTitle className="text-2xl font-mono">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}