/**
 * /admin/clean-kpi — Clean KPI Dashboard.
 *
 * Reads lp_funnel_events and computes the canonical funnel (view_item →
 * add_to_cart → checkout_click → payment_success) under admin-selectable
 * filters built on the NEW envelope columns introduced by TRK-1/TRK-2:
 *   - geo_tier      (verified_us | probable_us | non_us | unknown)
 *   - classification (verified_user | probable_user | bot | qa | unknown)
 *   - device        (mobile | desktop | tablet | unknown)
 *   - qa            (always excluded — kept off the dashboard)
 *
 * Rows missing envelope metadata (legacy pre-TRK rows) are surfaced as a
 * separate "envelope coverage" KPI so admins know what slice of traffic
 * the Clean KPIs apply to. Bot rows are excluded from Clean KPIs by
 * default.
 *
 * Read-only. Admin-guarded by the parent AdminRouteGuard route.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';

type Range = '24h' | '7d' | '30d';
type GeoTier = 'all' | 'verified_us' | 'probable_us' | 'non_us' | 'unknown';
type Classification = 'all' | 'verified_user' | 'probable_user' | 'unknown';
type Device = 'all' | 'mobile' | 'desktop' | 'tablet' | 'unknown';

interface Row {
  event_name: string;
  session_id: string;
  is_bot: boolean | null;
  classification: string | null;
  geo_tier: string | null;
  device: string | null;
  qa: boolean | null;
  value: number | null;
}

const FUNNEL_STEPS = ['view_item', 'add_to_cart', 'checkout_click', 'payment_success'] as const;
type Step = typeof FUNNEL_STEPS[number];

function rangeStart(r: Range): string {
  const days = r === '24h' ? 1 : r === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 24 * 3600e3).toISOString();
}

function pct(n: number, d: number): string {
  if (!d) return '—';
  return ((n / d) * 100).toFixed(1) + '%';
}

export default function CleanKpiDashboard() {
  const [range, setRange] = useState<Range>('7d');
  const [geoTier, setGeoTier] = useState<GeoTier>('all');
  const [classification, setClassification] = useState<Classification>('all');
  const [device, setDevice] = useState<Device>('all');
  const [excludeBots, setExcludeBots] = useState(true);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('lp_funnel_events')
      .select('event_name, session_id, is_bot, classification, geo_tier, device, qa, value')
      .gte('created_at', rangeStart(range))
      .eq('qa', false)
      .in('event_name', [...FUNNEL_STEPS])
      .limit(50000);
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // Apply admin filters to compute the Clean slice.
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (excludeBots && r.is_bot === true) return false;
      if (geoTier !== 'all' && (r.geo_tier ?? 'unknown') !== geoTier) return false;
      if (classification !== 'all' && (r.classification ?? 'unknown') !== classification) return false;
      if (device !== 'all' && (r.device ?? 'unknown') !== device) return false;
      return true;
    });
  }, [rows, excludeBots, geoTier, classification, device]);

  // Funnel: unique sessions per step.
  const funnel = useMemo(() => {
    const sets: Record<Step, Set<string>> = {
      view_item: new Set(), add_to_cart: new Set(),
      checkout_click: new Set(), payment_success: new Set(),
    };
    let revenue = 0;
    for (const r of filtered) {
      const step = r.event_name as Step;
      if (step in sets) sets[step].add(r.session_id);
      if (step === 'payment_success' && typeof r.value === 'number') revenue += r.value;
    }
    return {
      counts: {
        view_item: sets.view_item.size,
        add_to_cart: sets.add_to_cart.size,
        checkout_click: sets.checkout_click.size,
        payment_success: sets.payment_success.size,
      },
      revenue,
    };
  }, [filtered]);

  // Envelope coverage — how much of the raw data carries the new columns.
  const coverage = useMemo(() => {
    const total = rows.length;
    if (!total) return { total: 0, geo: 0, cls: 0, dev: 0 };
    let geo = 0, cls = 0, dev = 0;
    for (const r of rows) {
      if (r.geo_tier) geo++;
      if (r.classification) cls++;
      if (r.device) dev++;
    }
    return { total, geo, cls, dev };
  }, [rows]);

  // Per-segment breakdown by geo_tier.
  const geoBreakdown = useMemo(() => {
    const buckets = new Map<string, { sessions: Set<string>; atc: Set<string>; purchases: Set<string> }>();
    for (const r of filtered) {
      const k = r.geo_tier ?? 'unknown';
      let b = buckets.get(k);
      if (!b) { b = { sessions: new Set(), atc: new Set(), purchases: new Set() }; buckets.set(k, b); }
      b.sessions.add(r.session_id);
      if (r.event_name === 'add_to_cart') b.atc.add(r.session_id);
      if (r.event_name === 'payment_success') b.purchases.add(r.session_id);
    }
    return [...buckets.entries()]
      .map(([k, v]) => ({
        geo_tier: k, sessions: v.sessions.size,
        add_to_cart: v.atc.size, purchases: v.purchases.size,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [filtered]);

  const c = funnel.counts;
  const cvr = c.view_item ? (c.payment_success / c.view_item) * 100 : 0;

  return (
    <>
      <Helmet>
        <title>Clean KPI Dashboard | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Clean KPI Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Funnel KPIs filtered by the TRK envelope: geo_tier, classification, device. QA always excluded.
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="outline" size="sm">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>Segment the funnel by envelope columns.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <FilterSelect label="Range" value={range} onChange={(v) => setRange(v as Range)} options={[
              { v: '24h', l: 'Last 24h' }, { v: '7d', l: 'Last 7d' }, { v: '30d', l: 'Last 30d' },
            ]} />
            <FilterSelect label="Geo tier" value={geoTier} onChange={(v) => setGeoTier(v as GeoTier)} options={[
              { v: 'all', l: 'All' },
              { v: 'verified_us', l: 'Verified US' },
              { v: 'probable_us', l: 'Probable US' },
              { v: 'non_us', l: 'Non-US' },
              { v: 'unknown', l: 'Unknown' },
            ]} />
            <FilterSelect label="Classification" value={classification} onChange={(v) => setClassification(v as Classification)} options={[
              { v: 'all', l: 'All' },
              { v: 'verified_user', l: 'Verified user' },
              { v: 'probable_user', l: 'Probable user' },
              { v: 'unknown', l: 'Unknown' },
            ]} />
            <FilterSelect label="Device" value={device} onChange={(v) => setDevice(v as Device)} options={[
              { v: 'all', l: 'All' },
              { v: 'mobile', l: 'Mobile' },
              { v: 'desktop', l: 'Desktop' },
              { v: 'tablet', l: 'Tablet' },
              { v: 'unknown', l: 'Unknown' },
            ]} />
            <FilterSelect label="Bots" value={excludeBots ? 'exclude' : 'include'} onChange={(v) => setExcludeBots(v === 'exclude')} options={[
              { v: 'exclude', l: 'Exclude bots' },
              { v: 'include', l: 'Include bots' },
            ]} />
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Query failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Envelope coverage */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Envelope coverage</CardTitle>
            <CardDescription>
              Share of rows carrying TRK envelope columns. Low coverage = mostly legacy rows,
              filters won't apply to them.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Rows (funnel events)" value={coverage.total.toLocaleString()} />
            <Kpi label="With geo_tier" value={pct(coverage.geo, coverage.total)} sub={`${coverage.geo}`} />
            <Kpi label="With classification" value={pct(coverage.cls, coverage.total)} sub={`${coverage.cls}`} />
            <Kpi label="With device" value={pct(coverage.dev, coverage.total)} sub={`${coverage.dev}`} />
          </CardContent>
        </Card>

        {/* Clean funnel */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Clean funnel — unique sessions</CardTitle>
                <CardDescription>
                  After applying the filters above.
                </CardDescription>
              </div>
              <Badge variant="secondary">CVR: {cvr.toFixed(2)}%</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="View item" value={c.view_item.toLocaleString()} />
            <Kpi label="Add to cart" value={c.add_to_cart.toLocaleString()}
              sub={`${pct(c.add_to_cart, c.view_item)} of views`} />
            <Kpi label="Checkout click" value={c.checkout_click.toLocaleString()}
              sub={`${pct(c.checkout_click, c.add_to_cart)} of ATC`} />
            <Kpi label="Payments" value={c.payment_success.toLocaleString()}
              sub={`${pct(c.payment_success, c.checkout_click)} of checkouts`} />
            <Kpi label="Revenue" value={`$${funnel.revenue.toFixed(2)}`} />
          </CardContent>
        </Card>

        {/* Per-geo breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By geo_tier (current filters)</CardTitle>
            <CardDescription>Verifies that geo segmentation is reaching the funnel correctly.</CardDescription>
          </CardHeader>
          <CardContent>
            {geoBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rows match the current filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-4">Geo tier</th>
                      <th className="py-2 pr-4">Sessions</th>
                      <th className="py-2 pr-4">Add to cart</th>
                      <th className="py-2 pr-4">Purchases</th>
                      <th className="py-2 pr-4">CVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geoBreakdown.map((b) => (
                      <tr key={b.geo_tier} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{b.geo_tier}</td>
                        <td className="py-2 pr-4">{b.sessions}</td>
                        <td className="py-2 pr-4">{b.add_to_cart}</td>
                        <td className="py-2 pr-4">{b.purchases}</td>
                        <td className="py-2 pr-4">{pct(b.purchases, b.sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}