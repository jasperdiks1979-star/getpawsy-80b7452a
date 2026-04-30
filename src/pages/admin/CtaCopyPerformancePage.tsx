import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, MousePointerClick, CheckCircle2, AlertTriangle, XCircle, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { downloadCsv } from '@/lib/lpFunnelExport';

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
  const [allRows, setAllRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Always fetch the widest window (30d) so the multi-window ranking
    // table can render 24h / 7d / 30d side-by-side without re-querying.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
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
      else setAllRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Slice the cached 30d dataset by the active range for the main scorecard.
  const sinceMs = Date.now() - hours * 60 * 60 * 1000;
  const rows = allRows
    ? allRows.filter((r) => new Date(r.created_at).getTime() >= sinceMs)
    : null;
  const buckets = rows ? aggregate(rows) : [];

  // Multi-window ranking — for each placement, compute the CTR per
  // cta_variant across 24h / 7d / 30d windows and pick the leader. Uses
  // the cached 30d dataset so it's free; no extra queries.
  const RANKING_WINDOWS = [
    { key: '24h' as const, hours: 24 },
    { key: '7d' as const, hours: 24 * 7 },
    { key: '30d' as const, hours: 24 * 30 },
  ];
  const MIN_IMPRESSIONS_FOR_RANK = 20;

  type RankCell = { impressions: number; clicks: number; ctr: number | null };
  type RankRow = { cta_variant: string; cells: Record<'24h' | '7d' | '30d', RankCell> };

  function bucketsForWindow(hoursWin: number): Bucket[] {
    if (!allRows) return [];
    const cutoff = Date.now() - hoursWin * 60 * 60 * 1000;
    return aggregate(
      allRows.filter((r) => new Date(r.created_at).getTime() >= cutoff),
    );
  }

  const ranking: Array<{ placement: string; rows: RankRow[] }> = (() => {
    if (!allRows) return [];
    // Pre-compute buckets per window once.
    const perWindow: Record<'24h' | '7d' | '30d', Bucket[]> = {
      '24h': bucketsForWindow(24),
      '7d': bucketsForWindow(24 * 7),
      '30d': bucketsForWindow(24 * 30),
    };
    return PLACEMENT_ORDER.map((placement) => {
      // Union of all variants seen for this placement across any window.
      const variants = new Set<string>();
      (Object.keys(perWindow) as Array<'24h' | '7d' | '30d'>).forEach((w) => {
        perWindow[w]
          .filter((b) => b.placement === placement)
          .forEach((b) => variants.add(b.cta_variant));
      });
      const rows: RankRow[] = Array.from(variants).map((variant) => {
        const cells = {} as RankRow['cells'];
        (Object.keys(perWindow) as Array<'24h' | '7d' | '30d'>).forEach((w) => {
          const b = perWindow[w].find(
            (x) => x.placement === placement && x.cta_variant === variant,
          );
          const impressions = b?.impressions ?? 0;
          const clicks = b?.clicks ?? 0;
          const ctr =
            impressions >= MIN_IMPRESSIONS_FOR_RANK
              ? clicks / impressions
              : null;
          cells[w] = { impressions, clicks, ctr };
        });
        return { cta_variant: variant, cells };
      });
      // Sort by 7d CTR (default ranking window), nulls last.
      rows.sort((a, b) => {
        const ac = a.cells['7d'].ctr;
        const bc = b.cells['7d'].ctr;
        if (ac == null && bc == null) return 0;
        if (ac == null) return 1;
        if (bc == null) return -1;
        return bc - ac;
      });
      return { placement, rows };
    }).filter((g) => g.rows.length > 0);
  })();

  /** Map a CTR (0..1) to a heatmap background. Cool→hot relative to the
   *  best CTR seen in the same column so weak placements still show
   *  contrast. Null cells (insufficient sample) get a neutral pattern. */
  function heatStyle(ctr: number | null, max: number): React.CSSProperties {
    if (ctr == null || max <= 0) return {};
    const ratio = Math.max(0, Math.min(1, ctr / max));
    // hsl(25,95%,53%) is the brand orange. Fade alpha 0.05 → 0.45.
    const alpha = 0.05 + ratio * 0.4;
    return { backgroundColor: `hsl(25 95% 53% / ${alpha})` };
  }

  const grouped = PLACEMENT_ORDER.map((p) => ({
    placement: p,
    rows: buckets.filter((b) => b.placement === p),
  })).filter((g) => g.rows.length > 0);

  const other = buckets.filter((b) => !PLACEMENT_ORDER.includes(b.placement));
  if (other.length > 0) grouped.push({ placement: '(other)', rows: other });

  const totalImpr = buckets.reduce((s, b) => s + b.impressions, 0);
  const totalClicks = buckets.reduce((s, b) => s + b.clicks, 0);
  const totalCtr = totalImpr ? ((totalClicks / totalImpr) * 100).toFixed(1) : '—';

  // Per-event health stats — counts and last-seen timestamp for each
  // mirrored event the dashboard depends on. Lets the operator instantly
  // see whether a missing CTR column is a "no traffic" issue or an actual
  // mirroring/instrumentation regression (e.g. tiktok_deep_link_click
  // dropped out of MIRRORED_EVENTS in lpFunnelMirror.ts).
  const TRACKED_EVENTS = [
    {
      key: 'lp_cta_impression',
      label: 'CTA impressions',
      role: 'Denominator for CTR (fires when a CTA scrolls into view).',
    },
    {
      key: 'lp_cta_click',
      label: 'CTA clicks',
      role: 'Wrapper-level click event used for CTR + cohort analysis.',
    },
    {
      key: 'tiktok_deep_link_click',
      label: 'TikTok deep-link clicks',
      role: 'Raw click on <TikTokDeepLinkButton> — added to total clicks.',
    },
  ] as const;

  const eventStats = TRACKED_EVENTS.map((e) => {
    const matching = (rows ?? []).filter((r) => r.event_name === e.key);
    const last = matching.reduce<string | null>((acc, r) => {
      if (!acc || r.created_at > acc) return r.created_at;
      return acc;
    }, null);
    return { ...e, count: matching.length, last };
  });

  function relativeTime(iso: string | null): string {
    if (!iso) return 'never';
    const diffMs = Date.now() - new Date(iso).getTime();
    if (diffMs < 0) return 'just now';
    const m = Math.floor(diffMs / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  // CSV export — flattens every (placement, cta_variant) bucket into a row
  // so the data lines up exactly with what's rendered on screen. Uses the
  // shared RFC-4180 helper from lpFunnelExport so Excel-on-Windows opens
  // it cleanly (UTF-8 BOM + quoted cells).
  function handleExportCsv() {
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'placement',
      'cta_variant',
      'impressions',
      'clicks',
      'deep_link_clicks',
      'wrapper_clicks',
      'ctr_pct',
    ].join(',');
    const body = buckets
      .map((b) => {
        const ctr = b.impressions ? (b.clicks / b.impressions) * 100 : 0;
        return [
          b.placement,
          b.cta_variant,
          b.impressions,
          b.clicks,
          b.deep_link_clicks,
          b.clicks - b.deep_link_clicks,
          b.impressions ? ctr.toFixed(2) : '',
        ]
          .map(escape)
          .join(',');
      })
      .join('\n');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadCsv(`${header}\n${body}`, `cta-copy-performance_${hours}h_${stamp}.csv`);
  }

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
          <div className="flex gap-1 items-center flex-wrap">
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
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
              disabled={buckets.length === 0}
              className="ml-2 gap-1"
              title="Download all rows as CSV"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Event ingestion status
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Event</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-right p-3">Rows in window</th>
                    <th className="text-right p-3">Last seen</th>
                    <th className="text-left p-3">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {eventStats.map((e) => {
                    const ok = e.count > 0;
                    const stale =
                      ok &&
                      e.last !== null &&
                      Date.now() - new Date(e.last).getTime() > hours * 60 * 60 * 1000 * 0.5;
                    return (
                      <tr key={e.key} className="border-t align-top">
                        <td className="p-3">
                          <div className="font-medium">{e.label}</div>
                          <code className="text-[11px] text-muted-foreground">{e.key}</code>
                        </td>
                        <td className="p-3">
                          {ok ? (
                            stale ? (
                              <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold">
                                <AlertTriangle className="h-3.5 w-3.5" /> Stale
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Receiving
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 text-destructive text-xs font-semibold">
                              <XCircle className="h-3.5 w-3.5" /> Missing
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {e.count.toLocaleString()}
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {relativeTime(e.last)}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{e.role}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Active filters</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>
                  Window: last <strong>{hours}h</strong> (from{' '}
                  <code>created_at &gt;= now() - {hours}h</code>)
                </li>
                <li>
                  Source table: <code>lp_funnel_events</code>
                </li>
                <li>
                  Events: <code>lp_cta_impression</code>, <code>lp_cta_click</code>,{' '}
                  <code>tiktok_deep_link_click</code>
                </li>
                <li>
                  Internal traffic: <strong>excluded</strong> (
                  <code>is_internal IS NULL OR is_internal = false</code>)
                </li>
                <li>
                  Row cap: 50 000 per fetch — bump the time window down if you hit
                  this on heavy days.
                </li>
              </ul>
              <p className="pt-1">
                Missing events usually mean the event name was removed from{' '}
                <code>MIRRORED_EVENTS</code> in <code>src/lib/lpFunnelMirror.ts</code>,
                or the firing component stopped calling <code>trackEvent()</code>.
              </p>
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