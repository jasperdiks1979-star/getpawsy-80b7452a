import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, MousePointerClick, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * CtaCopyPerformancePage — quick scorecard of `/go` CTA copy performance.
 *
 * Pulls `lp_cta_impression` and `lp_cta_click` rows from `lp_funnel_events`
 * (the same mirror that powers the placement-overview dashboard) and
 * groups by placement × cta_variant so we can see which copy converts
 * best per surface (primary / secondary / sticky). Internal/Founder Mode
 * traffic is excluded by default to keep CTR honest.
 */

type Row = {
  placement: string | null;
  cta_variant: string | null;
  event_name: string;
  created_at: string;
};

type Bucket = {
  placement: string;
  cta_variant: string;
  impressions: number;
  clicks: number;
  /** Subset of `clicks` that came from raw <TikTokDeepLinkButton> events
   *  rather than the higher-level lp_cta_click wrapper. Lets us spot
   *  placements where one event source is firing but the other isn't. */
  deep_link_clicks: number;
};

const PLACEMENT_ORDER = ['bio_primary', 'bio_secondary', 'bio_sticky'];
const RANGES = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 24 * 7 },
  { label: '30d', hours: 24 * 30 },
] as const;

function aggregate(rows: Row[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const placement = r.placement ?? '(unknown)';
    const variant = r.cta_variant ?? '(none)';
    const key = `${placement}::${variant}`;
    let b = map.get(key);
    if (!b) {
      b = { placement, cta_variant: variant, impressions: 0, clicks: 0, deep_link_clicks: 0 };
      map.set(key, b);
    }
    if (r.event_name === 'lp_cta_impression') b.impressions += 1;
    else if (r.event_name === 'lp_cta_click') b.clicks += 1;
    else if (r.event_name === 'tiktok_deep_link_click') {
      b.clicks += 1;
      b.deep_link_clicks += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ai = PLACEMENT_ORDER.indexOf(a.placement);
    const bi = PLACEMENT_ORDER.indexOf(b.placement);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.clicks - a.clicks;
  });
}

function ctrPct(b: Bucket): string {
  if (!b.impressions) return b.clicks > 0 ? '∞' : '—';
  return `${((b.clicks / b.impressions) * 100).toFixed(1)}%`;
}

function placementLabel(p: string): string {
  if (p === 'bio_primary') return 'Primary (above the fold)';
  if (p === 'bio_secondary') return 'Secondary (mid-page)';
  if (p === 'bio_sticky') return 'Sticky (bottom bar)';
  return p;
}

export default function CtaCopyPerformancePage() {
  const [hours, setHours] = useState<number>(24 * 7);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    (async () => {
      const { data, error } = await supabase
        .from('lp_funnel_events')
        .select('placement, cta_variant, event_name, created_at')
        .in('event_name', ['lp_cta_impression', 'lp_cta_click', 'tiktok_deep_link_click'])
        .gte('created_at', since)
        .or('is_internal.is.null,is_internal.eq.false')
        .limit(50000);
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [hours]);

  const buckets = rows ? aggregate(rows) : [];
  const grouped = PLACEMENT_ORDER.map((p) => ({
    placement: p,
    rows: buckets.filter((b) => b.placement === p),
  })).filter((g) => g.rows.length > 0);

  const other = buckets.filter((b) => !PLACEMENT_ORDER.includes(b.placement));
  if (other.length > 0) grouped.push({ placement: '(other)', rows: other });

  const totalImpr = buckets.reduce((s, b) => s + b.impressions, 0);
  const totalClicks = buckets.reduce((s, b) => s + b.clicks, 0);
  const totalCtr = totalImpr ? ((totalClicks / totalImpr) * 100).toFixed(1) : '—';

  return (
    <>
      <Helmet>
        <title>CTA Copy Performance | GetPawsy Admin</title>
      </Helmet>
      <div className="container py-8 space-y-6 max-w-5xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Admin
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2 mt-1">
              <MousePointerClick className="h-6 w-6 text-primary" />
              CTA Copy Performance
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Impressions, clicks &amp; CTR per placement × CTA copy variant on{' '}
              <code className="text-xs">/go</code>. Excludes internal traffic.
            </p>
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Button
                key={r.label}
                size="sm"
                variant={hours === r.hours ? 'default' : 'outline'}
                onClick={() => setHours(r.hours)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="p-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Impressions</p>
              <p className="text-2xl font-bold">{totalImpr.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Clicks</p>
              <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">CTR</p>
              <p className="text-2xl font-bold text-primary">{totalCtr}%</p>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">
              Failed to load: {error}
            </CardContent>
          </Card>
        )}

        {loading && !rows && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {rows && buckets.length === 0 && !loading && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground text-center">
              No CTA events recorded in this window yet. Send some real /go traffic
              and check back.
            </CardContent>
          </Card>
        )}

        {grouped.map((g) => (
          <Card key={g.placement}>
            <CardHeader>
              <CardTitle className="text-base">{placementLabel(g.placement)}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">CTA Variant</th>
                      <th className="text-right p-3">Impressions</th>
                      <th className="text-right p-3" title="lp_cta_click + tiktok_deep_link_click">
                        Clicks
                      </th>
                      <th className="text-right p-3" title="Subset of clicks from raw TikTokDeepLinkButton events">
                        Deep-link
                      </th>
                      <th className="text-right p-3">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((b) => {
                      const isWinner =
                        g.rows.length > 1 &&
                        b ===
                          g.rows.reduce((best, r) =>
                            (r.impressions >= 20 ? r.clicks / Math.max(r.impressions, 1) : 0) >
                            (best.impressions >= 20 ? best.clicks / Math.max(best.impressions, 1) : 0)
                              ? r
                              : best,
                          );
                      return (
                        <tr
                          key={b.cta_variant}
                          className={`border-t ${isWinner ? 'bg-primary/5' : ''}`}
                        >
                          <td className="p-3 font-mono text-xs">
                            {b.cta_variant}
                            {isWinner && (
                              <span className="ml-2 text-[10px] uppercase font-bold text-primary">
                                top
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {b.impressions.toLocaleString()}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {b.clicks.toLocaleString()}
                          </td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">
                            {b.deep_link_clicks.toLocaleString()}
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold">
                            {ctrPct(b)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}

        <p className="text-xs text-muted-foreground">
          Source: <code>lp_funnel_events</code> — impressions from{' '}
          <code>lp_cta_impression</code>, clicks from <code>lp_cta_click</code> +{' '}
          <code>tiktok_deep_link_click</code> (the “Deep-link” column shows the
          subset coming from raw <code>TikTokDeepLinkButton</code> events). The
          “top” badge appears once a variant has ≥ 20 impressions to avoid
          early-sample noise.
        </p>
      </div>
    </>
  );
}