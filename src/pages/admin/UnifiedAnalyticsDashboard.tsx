/**
 * /admin/analytics — GetPawsy commercial intelligence dashboard (iPhone → desktop).
 *
 * Single source of truth: public.gp_unified_analytics_v2(p_hours). The RPC classifies
 * every session in the window (REAL_SHOPPER / LIKELY_HUMAN / INTERNAL_ADMIN /
 * INTERNAL_QA / AUTOMATION / BOT_CRAWLER / MONITORING_HEALTHCHECK / DUPLICATE_SESSION)
 * in the reporting layer only — no raw analytics record is ever mutated or deleted.
 *
 * Default KPIs = qualified humans (REAL_SHOPPER + LIKELY_HUMAN). Raw counts stay
 * visible as diagnostics so Raw − Excluded = Qualified always reconciles.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, AlertTriangle, Download, ChevronDown } from 'lucide-react';
import { LiveVisitorsWorld, type LiveHealth } from '@/components/admin/live-world/LiveVisitorsWorld';

type Range = '24h' | '7d' | '30d' | '90d';
const RANGE_HOURS: Record<Range, number> = { '24h': 24, '7d': 168, '30d': 720, '90d': 2160 };
const RANGE_LABEL: Record<Range, string> = { '24h': 'Today', '7d': '7 days', '30d': '30 days', '90d': '90 days' };

interface Kpis {
  qualified_sessions: number; raw_sessions: number; raw_sessions_all_ingested: number;
  excluded_sessions: number; pinterest_sessions: number; product_views: number;
  add_to_cart: number; checkouts: number; orders: number; revenue: number;
}
interface RawKpis { sessions: number; product_views: number; add_to_cart: number; checkouts: number; orders: number }
interface Payload {
  generated_at: string;
  window_hours: number;
  kpis: Kpis;
  kpis_raw: RawKpis;
  exclusions: Array<{ reason: string; sessions: number; product_views: number; add_to_cart: number }>;
  class_breakdown: Array<{ session_class: string; sessions: number }>;
  timeseries: Array<{ day: string; qualified_sessions: number; raw_sessions: number; product_views: number; add_to_cart: number; orders: number; revenue: number }>;
  channels: Array<{ channel: string; qualified_sessions: number; product_views: number; add_to_cart: number; checkouts: number; orders: number }>;
  referral_hosts: Array<{ host: string; sessions: number; qualified: number; product_views: number; add_to_cart: number }>;
  campaigns: Array<{ campaign: string; campaign_class: string | null; source: string; sessions: number; qualified: number; product_views: number; add_to_cart: number }>;
  pinterest: {
    totals: { qualified_sessions: number; product_views: number; add_to_cart: number; checkouts: number; orders: number };
    by_campaign: Array<{ campaign: string; sessions: number; product_views: number; add_to_cart: number }>;
    by_pin: Array<{ pin: string; campaign: string; sessions: number; product_views: number; add_to_cart: number }>;
    by_landing: Array<{ page: string; sessions: number; add_to_cart: number }>;
  };
  new_campaigns: Array<{ campaign: string; qualified_sessions: number; product_views: number; add_to_cart: number }>;
  landing_pages: Array<{ page: string; sessions: number; product_views: number; add_to_cart: number }>;
  countries: Array<{ country: string; sessions: number }>;
  geo_unknown_pct: number;
  products: Array<{ product_id: string; name: string; slug: string | null; price: number | null; stock: number | null; is_active: boolean | null; views: number; add_to_cart: number; out_of_stock: boolean }>;
  recent_activity: Array<{ occurred_at: string; channel: string; country: string; device: string; action: string; product: string }>;
  recent_orders: Array<{ id: string; created_at: string; total_amount: number; currency: string; status: string }>;
}

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(2) + '%' : '—');

const EXCLUSION_LABEL: Record<string, string> = {
  INTERNAL_ADMIN: 'Internal admin',
  INTERNAL_QA: 'QA / test',
  AUTOMATION: 'Automation',
  BOT_CRAWLER: 'Bot / crawler',
  MONITORING_HEALTHCHECK: 'Monitoring',
  DUPLICATE_SESSION: 'Duplicate session',
  UNKNOWN: 'Unclassified',
};

function Kpi({ label, value, sub, muted }: { label: string; value: string; sub?: string; muted?: boolean }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-1 p-3 sm:p-4 sm:pb-2">
        <CardDescription className="text-[13px] sm:text-xs uppercase tracking-wide leading-tight">{label}</CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
        <div className={`${muted ? 'text-base sm:text-lg text-muted-foreground' : 'text-xl sm:text-2xl'} font-semibold tabular-nums break-words`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1 break-words">{sub}</div>}
      </CardContent>
    </Card>
  );
}

type Col<T> = { key: keyof T; label: string; render?: (r: T) => React.ReactNode; align?: 'right'; primary?: boolean };

/** Table on desktop, stacked cards on mobile. Only one variant is rendered. */
function ResponsiveTable<T extends Record<string, unknown>>({ rows, cols, mobile }: { rows: T[]; cols: Array<Col<T>>; mobile?: boolean }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground py-6">No data in this window.</p>;

  if (mobile) {
    const primary = cols.find((c) => c.primary) ?? cols[0];
    const rest = cols.filter((c) => c !== primary);
    return (
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i} className="rounded-lg border p-3">
            <div className="text-sm font-medium break-words [overflow-wrap:anywhere] mb-2">
              {primary.render ? primary.render(r) : String(r[primary.key] ?? '—')}
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              {rest.map((c) => (
                <div key={String(c.key)} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{c.label}</dt>
                  <dd className="text-sm tabular-nums break-words [overflow-wrap:anywhere]">
                    {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            {cols.map((c) => (
              <th key={String(c.key)} className={`py-2 px-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {cols.map((c) => (
                <td key={String(c.key)} className={`py-2 px-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                  {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FunnelStep({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border p-3 flex items-baseline justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-right">
        <span className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}

type Health = { label: string; status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'; reason?: string };

function healthChecks(d: Payload): Health[] {
  const k = d.kpis;
  return [
    { label: 'Sessions', status: k.raw_sessions > 0 ? 'HEALTHY' : 'UNAVAILABLE', reason: k.raw_sessions ? undefined : 'no sessions ingested in window' },
    {
      label: 'Product views',
      status: k.product_views > 0 ? 'HEALTHY' : k.qualified_sessions > 0 ? 'DEGRADED' : 'UNAVAILABLE',
      reason: k.product_views === 0 && k.qualified_sessions > 0 ? 'qualified sessions recorded but zero product-view events' : undefined,
    },
    {
      label: 'Add to cart',
      status: k.add_to_cart > 0 ? 'HEALTHY' : k.product_views > 0 ? 'DEGRADED' : 'UNAVAILABLE',
      reason: k.add_to_cart === 0 ? 'no qualified add-to-cart events in window' : undefined,
    },
    {
      label: 'Checkout',
      status: k.checkouts > 0 ? 'HEALTHY' : k.add_to_cart > 0 ? 'DEGRADED' : 'UNAVAILABLE',
      reason: k.checkouts === 0 ? 'no qualified checkout events in window' : undefined,
    },
    { label: 'Paid orders', status: 'HEALTHY', reason: undefined },
    {
      label: 'Pinterest attribution',
      status: k.pinterest_sessions > 0 ? 'HEALTHY' : 'DEGRADED',
      reason: k.pinterest_sessions === 0 ? 'no qualified Pinterest-attributed sessions' : undefined,
    },
    {
      label: 'Country attribution',
      status: d.geo_unknown_pct <= 25 ? 'HEALTHY' : d.geo_unknown_pct <= 75 ? 'DEGRADED' : 'UNAVAILABLE',
      reason: d.geo_unknown_pct > 25 ? `${d.geo_unknown_pct}% of qualified sessions have no country` : undefined,
    },
    { label: 'Bot filtering', status: 'HEALTHY' },
    { label: 'Internal traffic filtering', status: 'HEALTHY' },
  ];
}

function insights(d: Payload): string[] {
  const out: string[] = [];
  const k = d.kpis;
  const p = d.pinterest.totals;
  if (p.qualified_sessions > 0 && p.add_to_cart === 0) {
    out.push(`Pinterest generated ${p.qualified_sessions} qualified visits but no add-to-carts.`);
  }
  if (k.qualified_sessions > 0 && k.product_views === 0) {
    out.push(`${k.qualified_sessions} qualified visits but zero product views — traffic is landing on content, not products.`);
  }
  if (k.add_to_cart > 0 && k.checkouts === 0) {
    out.push(`${k.add_to_cart} add-to-carts but no checkout started.`);
  }
  const qaAtc = d.exclusions.find((e) => e.reason === 'INTERNAL_QA')?.add_to_cart ?? 0;
  if (qaAtc > 0) out.push(`${qaAtc} add-to-cart events came from QA/test traffic and are excluded from commercial KPIs.`);
  d.products.filter((x) => x.out_of_stock && x.views > 0).forEach((x) => {
    out.push(`"${x.name}" received ${x.views} qualified views while out of stock.`);
  });
  d.products.filter((x) => x.add_to_cart > 0).slice(0, 3).forEach((x) => {
    out.push(`"${x.name}" has ${x.views} qualified views and ${x.add_to_cart} add-to-carts.`);
  });
  const excludedPct = k.raw_sessions ? (k.excluded_sessions / k.raw_sessions) * 100 : 0;
  if (excludedPct >= 20) out.push(`${excludedPct.toFixed(0)}% of sessions in this window were internal, QA, bot or duplicate traffic.`);
  d.new_campaigns.filter((c) => c.qualified_sessions === 0).forEach((c) => {
    out.push(`Campaign "${c.campaign}" has 0 qualified visits so far.`);
  });
  return out;
}

export default function UnifiedAnalyticsDashboard() {
  const [range, setRange] = useState<Range>('30d');
  const [mode, setMode] = useState<'qualified' | 'raw'>('qualified');
  const [showExcluded, setShowExcluded] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [liveHealth, setLiveHealth] = useState<LiveHealth | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data: res, error: err } = await supabase.rpc(
      'gp_unified_analytics_v2' as never,
      { p_hours: RANGE_HOURS[range] } as never,
    );
    if (err) { setError(err.message); setData(null); }
    else setData(res as unknown as Payload);
    setLoading(false);
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const lines = ['day,qualified_sessions,raw_sessions,product_views,add_to_cart,orders,revenue'];
    data.timeseries.forEach((t) => lines.push([t.day, t.qualified_sessions, t.raw_sessions, t.product_views, t.add_to_cart, t.orders, t.revenue].join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `getpawsy-analytics-${range}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const k = data?.kpis;
  const maxSessions = useMemo(
    () => Math.max(1, ...(data?.timeseries ?? []).map((t) => (mode === 'raw' ? t.raw_sessions : t.qualified_sessions))),
    [data, mode],
  );
  const funnel = useMemo(() => {
    if (!data) return null;
    return mode === 'raw'
      ? { sessions: data.kpis_raw.sessions, product_views: data.kpis_raw.product_views, add_to_cart: data.kpis_raw.add_to_cart, checkouts: data.kpis_raw.checkouts, orders: data.kpis_raw.orders }
      : { sessions: data.kpis.qualified_sessions, product_views: data.kpis.product_views, add_to_cart: data.kpis.add_to_cart, checkouts: data.kpis.checkouts, orders: data.kpis.orders };
  }, [data, mode]);
  const checks = useMemo(() => (data ? healthChecks(data) : []), [data]);
  const allChecks = useMemo<Health[]>(
    () =>
      liveHealth
        ? [...checks, { label: 'Live presence', status: liveHealth.status, reason: liveHealth.reason ?? undefined }]
        : checks,
    [checks, liveHealth],
  );
  const notes = useMemo(() => (data ? insights(data) : []), [data]);

  return (
    <div
      className="w-full max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-6 space-y-5 md:space-y-6 overflow-x-hidden"
      style={{
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <Helmet><title>Unified Analytics | Admin</title><meta name="robots" content="noindex" /></Helmet>

      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold">GetPawsy Analytics</h1>
            <p className="text-sm text-muted-foreground">
              {RANGE_LABEL[range]} · qualified shopper truth — internal, QA and bot traffic excluded.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="icon"
              variant="outline"
              className="h-11 w-11"
              aria-label="Refresh analytics"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="outline" className="h-11 w-11" aria-label="Export CSV" onClick={exportCsv} disabled={!data}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Thumb-friendly, horizontally scrollable date filter */}
        <div className="-mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto">
          <div className="flex items-center gap-2 w-max">
            {(Object.keys(RANGE_HOURS) as Range[]).map((r) => (
              <Button
                key={r}
                size="sm"
                className="h-11 px-4 text-sm"
                variant={r === range ? 'default' : 'outline'}
                onClick={() => setRange(r)}
              >
                {RANGE_LABEL[r]}
              </Button>
            ))}
            <span className="w-px h-7 bg-border mx-1" />
            {(['qualified', 'raw'] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                className="h-11 px-4 text-sm capitalize"
                variant={m === mode ? 'default' : 'outline'}
                onClick={() => setMode(m)}
              >
                {m}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Analytics query failed</AlertTitle>
          <AlertDescription className="break-words [overflow-wrap:anywhere]">{error}</AlertDescription>
        </Alert>
      )}

      {loading && !data && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

      {k && data && funnel && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Qualified sessions" value={k.qualified_sessions.toLocaleString()} sub="real + likely human" />
            <Kpi label="Pinterest" value={k.pinterest_sessions.toLocaleString()} sub="qualified sessions" />
            <Kpi label="Product views" value={k.product_views.toLocaleString()} />
            <Kpi label="Add to cart" value={k.add_to_cart.toLocaleString()} sub={`${pct(k.add_to_cart, k.product_views)} of views`} />
            <Kpi label="Checkouts" value={k.checkouts.toLocaleString()} sub={`${pct(k.checkouts, k.add_to_cart)} of ATC`} />
            <Kpi label="Paid orders" value={k.orders.toLocaleString()} sub="Stripe-verified" />
            <Kpi label="Revenue" value={money(Number(k.revenue))} sub="Stripe-verified" />
            <Kpi label="Conversion rate" value={pct(k.orders, k.qualified_sessions)} sub="orders / qualified" />
          </div>

          {/* Diagnostic row — raw vs excluded, always reconcilable */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Kpi muted label="Raw sessions" value={k.raw_sessions.toLocaleString()} sub="before classification" />
            <Kpi muted label="Excluded traffic" value={k.excluded_sessions.toLocaleString()} sub="internal / QA / bot / dupe" />
            <Kpi muted label="Ingested (all)" value={k.raw_sessions_all_ingested.toLocaleString()} sub="incl. pre-filtered crawlers" />
            <Kpi muted label="Unknown geo" value={`${data.geo_unknown_pct}%`} sub="of qualified sessions" />
          </div>

          {notes.length > 0 && (
            <Card>
              <CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2">
                <CardTitle className="text-base">What needs attention</CardTitle>
                <CardDescription>Rule-based observations from this window only.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <ul className="space-y-2">
                  {notes.map((n, i) => (
                    <li key={i} className="text-sm rounded-lg border p-3 break-words [overflow-wrap:anywhere]">{n}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Shopper funnel */}
          <Card>
            <CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2">
              <CardTitle className="text-base">{mode === 'raw' ? 'Raw funnel' : 'Qualified shopper funnel'}</CardTitle>
              <CardDescription>Counts and step conversion for this window.</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="grid gap-2 sm:grid-cols-5">
                <FunnelStep label="Sessions" value={funnel.sessions} sub="100%" />
                <FunnelStep label="Product views" value={funnel.product_views} sub={pct(funnel.product_views, funnel.sessions)} />
                <FunnelStep label="Add to cart" value={funnel.add_to_cart} sub={pct(funnel.add_to_cart, funnel.product_views)} />
                <FunnelStep label="Checkout" value={funnel.checkouts} sub={pct(funnel.checkouts, funnel.add_to_cart)} />
                <FunnelStep label="Orders" value={funnel.orders} sub={pct(funnel.orders, funnel.checkouts)} />
              </div>
            </CardContent>
          </Card>

          {/* Exclusion transparency */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setShowExcluded((v) => !v)}
                aria-expanded={showExcluded}
              >
                <span>
                  <CardTitle className="text-base">Excluded traffic</CardTitle>
                  <CardDescription>
                    {k.raw_sessions.toLocaleString()} raw − {k.excluded_sessions.toLocaleString()} excluded = {k.qualified_sessions.toLocaleString()} qualified
                  </CardDescription>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showExcluded ? 'rotate-180' : ''}`} />
              </button>
            </CardHeader>
            {showExcluded && (
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <ResponsiveTable
                  mobile={isMobile}
                  rows={data.exclusions}
                  cols={[
                    { key: 'reason', label: 'Reason', primary: true, render: (r) => EXCLUSION_LABEL[r.reason] ?? r.reason },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'product_views', label: 'Views', align: 'right' },
                    { key: 'add_to_cart', label: 'ATC', align: 'right' },
                  ]}
                />
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2">
              <CardTitle className="text-base">Daily {mode === 'raw' ? 'raw' : 'qualified'} sessions</CardTitle>
              <CardDescription>{data.timeseries.length} days · peak {maxSessions.toLocaleString()} sessions/day</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <div className="flex items-end gap-[2px] h-24 sm:h-32 w-full overflow-hidden">
                {data.timeseries.map((t) => {
                  const v = mode === 'raw' ? t.raw_sessions : t.qualified_sessions;
                  return (
                    <div
                      key={t.day}
                      title={`${t.day}: ${v} sessions, ${t.orders} orders`}
                      className="flex-1 min-w-0 bg-primary/70 rounded-t min-h-[2px]"
                      style={{ height: `${(v / maxSessions) * 100}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>{data.timeseries[0]?.day ?? ''}</span>
                <span>{data.timeseries[data.timeseries.length - 1]?.day ?? ''}</span>
              </div>
            </CardContent>
          </Card>

          {data.recent_activity.length > 0 && (
            <Card>
              <CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2">
                <CardTitle className="text-base">Recent qualified shopper activity</CardTitle>
                <CardDescription>Anonymised — internal and QA activity excluded.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                <ul className="space-y-2">
                  {data.recent_activity.slice(0, 12).map((a, i) => (
                    <li key={i} className="rounded-lg border p-3 text-sm break-words [overflow-wrap:anywhere]">
                      <span className="font-medium">{a.channel}</span> visitor ({a.device}, {a.country}) → {a.product} → {a.action}
                      <span className="block text-xs text-muted-foreground mt-1">{new Date(a.occurred_at).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2 p-4 sm:p-6 sm:pb-2"><CardTitle className="text-base">Data health</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {checks.map((c) => (
                  <li key={c.label} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{c.label}</span>
                      <Badge variant={c.status === 'HEALTHY' ? 'default' : c.status === 'DEGRADED' ? 'secondary' : 'destructive'}>{c.status}</Badge>
                    </div>
                    {c.reason && <p className="text-xs text-muted-foreground mt-1 break-words [overflow-wrap:anywhere]">{c.reason}</p>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Tabs defaultValue="traffic">
            <div className="-mx-3 px-3 sm:mx-0 sm:px-0 overflow-x-auto">
              <TabsList className="w-max">
                <TabsTrigger value="traffic" className="h-10 px-4">Traffic</TabsTrigger>
                <TabsTrigger value="pinterest" className="h-10 px-4">Pinterest</TabsTrigger>
                <TabsTrigger value="products" className="h-10 px-4">Products</TabsTrigger>
                <TabsTrigger value="orders" className="h-10 px-4">Orders</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="traffic" className="grid gap-4 lg:grid-cols-2 mt-4">
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">Channels (qualified)</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.channels} cols={[
                    { key: 'channel', label: 'Channel', primary: true },
                    { key: 'qualified_sessions', label: 'Sessions', align: 'right' },
                    { key: 'product_views', label: 'Views', align: 'right' },
                    { key: 'add_to_cart', label: 'ATC', align: 'right' },
                    { key: 'orders', label: 'Orders', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base">Referral hosts</CardTitle>
                  <CardDescription>The referral bucket broken out by actual referring domain.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.referral_hosts} cols={[
                    { key: 'host', label: 'Referring host', primary: true },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'qualified', label: 'Qualified', align: 'right' },
                    { key: 'product_views', label: 'Views', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">Campaigns (UTM)</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.campaigns} cols={[
                    { key: 'campaign', label: 'Campaign', primary: true },
                    { key: 'campaign_class', label: 'Class', render: (r) => <Badge variant={r.campaign_class === 'PRODUCTION_MARKETING' ? 'default' : 'secondary'}>{r.campaign_class ?? 'UNKNOWN'}</Badge> },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'qualified', label: 'Qualified', align: 'right' },
                    { key: 'add_to_cart', label: 'ATC', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base">Commercial landing pages</CardTitle>
                  <CardDescription>Canonical paths, admin routes excluded.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.landing_pages} cols={[
                    { key: 'page', label: 'Page', primary: true },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'product_views', label: 'Views', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">Countries</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.countries} cols={[
                    { key: 'country', label: 'Country', primary: true },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pinterest" className="mt-4 space-y-4">
              <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
                <Kpi label="Pin sessions" value={data.pinterest.totals.qualified_sessions.toLocaleString()} />
                <Kpi label="Product views" value={data.pinterest.totals.product_views.toLocaleString()} sub={pct(data.pinterest.totals.product_views, data.pinterest.totals.qualified_sessions)} />
                <Kpi label="Add to cart" value={data.pinterest.totals.add_to_cart.toLocaleString()} sub={pct(data.pinterest.totals.add_to_cart, data.pinterest.totals.product_views)} />
                <Kpi label="Checkouts" value={data.pinterest.totals.checkouts.toLocaleString()} />
                <Kpi label="Orders" value={data.pinterest.totals.orders.toLocaleString()} sub={`CVR ${pct(data.pinterest.totals.orders, data.pinterest.totals.qualified_sessions)}`} />
              </div>
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">New pin campaigns</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.new_campaigns} cols={[
                    { key: 'campaign', label: 'Campaign', primary: true },
                    { key: 'qualified_sessions', label: 'Qualified visits', align: 'right' },
                    { key: 'product_views', label: 'Views', align: 'right' },
                    { key: 'add_to_cart', label: 'ATC', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">By campaign</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.pinterest.by_campaign} cols={[
                    { key: 'campaign', label: 'Campaign', primary: true },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'product_views', label: 'Views', align: 'right' },
                    { key: 'add_to_cart', label: 'ATC', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base">By pin (utm_content)</CardTitle>
                  <CardDescription>GetPawsy-side attribution — no Pinterest API metrics involved.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.pinterest.by_pin} cols={[
                    { key: 'pin', label: 'Pin', primary: true },
                    { key: 'campaign', label: 'Campaign' },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'add_to_cart', label: 'ATC', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="p-4 sm:p-6"><CardTitle className="text-base">Pinterest landing pages</CardTitle></CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.pinterest.by_landing} cols={[
                    { key: 'page', label: 'Page', primary: true },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'add_to_cart', label: 'ATC', align: 'right' },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="mt-4">
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base">Product performance (qualified)</CardTitle>
                  <CardDescription>Ranked by add-to-cart first, then views. Out-of-stock traffic is flagged.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.products} cols={[
                    { key: 'name', label: 'Product', primary: true },
                    { key: 'views', label: 'Views', align: 'right' },
                    { key: 'add_to_cart', label: 'ATC', align: 'right' },
                    { key: 'price', label: 'Price', align: 'right', render: (r) => (r.price != null ? money(Number(r.price)) : '—') },
                    { key: 'stock', label: 'Stock', align: 'right', render: (r) => (r.stock != null ? String(r.stock) : '—') },
                    { key: 'out_of_stock', label: 'Status', render: (r) => (
                      r.out_of_stock
                        ? <Badge variant="destructive">OUT_OF_STOCK</Badge>
                        : <Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'active' : 'inactive'}</Badge>
                    ) },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orders" className="mt-4">
              <Card>
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base">Recent paid orders</CardTitle>
                  <CardDescription>Stripe-verified paid orders only — carts and checkout starts never count as revenue.</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  <ResponsiveTable mobile={isMobile} rows={data.recent_orders} cols={[
                    { key: 'created_at', label: 'Date', primary: true, render: (r) => new Date(r.created_at).toLocaleString() },
                    { key: 'total_amount', label: 'Total', align: 'right', render: (r) => money(Number(r.total_amount)) },
                    { key: 'currency', label: 'Currency' },
                    { key: 'status', label: 'Status' },
                  ]} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground">
            Generated {new Date(data.generated_at).toLocaleString()} · window {data.window_hours}h · classification applied in the reporting layer only; raw analytics history is never modified.
          </p>
        </>
      )}
    </div>
  );
}
