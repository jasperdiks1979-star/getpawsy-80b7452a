import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, MousePointerClick, CheckCircle2, AlertTriangle, XCircle, Download, Trophy, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { downloadCsv } from '@/lib/lpFunnelExport';
import { CTA_COPY_REGISTRY, type CtaPlacement, type CtaCopyMode } from '@/lib/ctaCopyRegistry';

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

  // ─── Auto-winner block state ──────────────────────────────────────────
  // Mirrors `cta_copy_winners` (one row per placement+mode). Refreshed
  // after every manual elector run so the UI reflects the latest decision.
  type WinnerRow = {
    placement: string;
    mode: string;
    winning_label: string;
    ctr_pct: number | null;
    impressions: number;
    clicks: number;
    window_hours: number;
    evaluated_at: string;
    notes: string | null;
  };
  const [winners, setWinners] = useState<WinnerRow[] | null>(null);
  const [electionRunning, setElectionRunning] = useState(false);
  const [electionMsg, setElectionMsg] = useState<string | null>(null);

  async function loadWinners() {
    const { data } = await supabase
      .from('cta_copy_winners')
      .select('placement, mode, winning_label, ctr_pct, impressions, clicks, window_hours, evaluated_at, notes')
      .order('placement')
      .order('mode');
    setWinners((data ?? []) as WinnerRow[]);
  }

  useEffect(() => { void loadWinners(); }, []);

  async function runElectorNow(dry: boolean) {
    setElectionRunning(true);
    setElectionMsg(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        'cta-copy-winner-elector',
        { body: {}, ...(dry ? { headers: {} } : {}) },
      );
      // The edge function reads ?dry=1 from the URL — supabase-js doesn't
      // expose query params on invoke, so we hit the function URL directly
      // when running a dry preview.
      if (dry) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cta-copy-winner-elector?dry=1`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
            'Content-Type': 'application/json',
          },
          body: '{}',
        });
        const json = await res.json();
        setElectionMsg(json?.message ? `Dry-run: ${json.message}` : 'Dry-run done');
      } else if (invokeErr) {
        setElectionMsg(`Error: ${invokeErr.message}`);
      } else {
        setElectionMsg(
          (data as { message?: string })?.message ?? 'Elector ran successfully',
        );
        await loadWinners();
      }
    } catch (err) {
      setElectionMsg(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setElectionRunning(false);
    }
  }

  function copyTextFor(placement: string, mode: string, label: string): string {
    const bank =
      CTA_COPY_REGISTRY[placement as CtaPlacement]?.[mode as CtaCopyMode] ?? [];
    return bank.find((o) => o.label === label)?.text ?? label;
  }

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
  function heatStyle(ctr: number | null, max: number): { backgroundColor?: string } {
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

        {/* ─── Auto-elected winning copy ────────────────────────────────
            Server-cached winner per (placement, mode). The elector edge
            function (`cta-copy-winner-elector`) runs hourly via cron and
            promotes a label only when ALL candidates have ≥50 impressions
            in the last 48h. UTM / campaign / content / deep-link refs are
            never touched — only the visible button TEXT changes. */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                Auto-elected winning copy
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                48h window · ≥50 impressions/variant · runs hourly · UTM &amp; tracking unchanged
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => runElectorNow(true)}
                disabled={electionRunning}
              >
                Preview
              </Button>
              <Button
                size="sm"
                onClick={() => runElectorNow(false)}
                disabled={electionRunning}
              >
                {electionRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Run now'
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {electionMsg && (
              <p className="px-4 py-2 text-xs text-muted-foreground border-b">
                {electionMsg}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-4 py-2 font-medium">Placement</th>
                    <th className="px-4 py-2 font-medium">Mode</th>
                    <th className="px-4 py-2 font-medium">Winning copy</th>
                    <th className="px-4 py-2 font-medium text-right">CTR</th>
                    <th className="px-4 py-2 font-medium text-right">Impr</th>
                    <th className="px-4 py-2 font-medium text-right">Clicks</th>
                    <th className="px-4 py-2 font-medium">Evaluated</th>
                  </tr>
                </thead>
                <tbody>
                  {(winners ?? []).map((w) => (
                    <tr
                      key={`${w.placement}-${w.mode}`}
                      className="border-t border-border/60"
                    >
                      <td className="px-4 py-2">{placementLabel(w.placement)}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            w.mode === 'urgent'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {w.mode}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">
                          {copyTextFor(w.placement, w.mode, w.winning_label)}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {w.winning_label}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {w.ctr_pct != null ? `${w.ctr_pct.toFixed(2)}%` : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {w.impressions.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {w.clicks.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {new Date(w.evaluated_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {winners && winners.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-6 text-center text-sm text-muted-foreground"
                      >
                        No winners yet — the elector hasn't promoted any copy.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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

        {ranking.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                CTR ranking — 24h vs 7d vs 30d
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Best CTA variant per placement, color-graded relative to the
                top performer in each column. Variants with fewer than{' '}
                {MIN_IMPRESSIONS_FOR_RANK} impressions in a window show “—”
                to avoid early-sample noise. Sorted by 7d CTR.
              </p>
            </CardHeader>
            <CardContent className="p-0 space-y-0">
              {ranking.map((g) => {
                // Per-window max CTR for the heatmap normalization.
                const maxByWindow: Record<'24h' | '7d' | '30d', number> = {
                  '24h': Math.max(0, ...g.rows.map((r) => r.cells['24h'].ctr ?? 0)),
                  '7d': Math.max(0, ...g.rows.map((r) => r.cells['7d'].ctr ?? 0)),
                  '30d': Math.max(0, ...g.rows.map((r) => r.cells['30d'].ctr ?? 0)),
                };
                return (
                  <div key={g.placement} className="border-t first:border-t-0">
                    <div className="px-4 py-2 bg-muted/30 text-xs font-semibold uppercase text-muted-foreground">
                      {placementLabel(g.placement)}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-[11px] uppercase text-muted-foreground">
                          <tr>
                            <th className="text-left p-2 pl-4 w-[8%]">#</th>
                            <th className="text-left p-2">CTA Variant</th>
                            {RANKING_WINDOWS.map((w) => (
                              <th key={w.key} className="text-right p-2 w-[14%]">
                                {w.key} CTR
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((r, idx) => (
                            <tr key={r.cta_variant} className="border-t">
                              <td className="p-2 pl-4 text-muted-foreground tabular-nums">
                                {idx + 1}
                              </td>
                              <td className="p-2 font-mono text-xs">
                                {r.cta_variant}
                                {idx === 0 && r.cells['7d'].ctr != null && (
                                  <span className="ml-2 text-[10px] uppercase font-bold text-primary">
                                    leader
                                  </span>
                                )}
                              </td>
                              {RANKING_WINDOWS.map((w) => {
                                const cell = r.cells[w.key];
                                return (
                                  <td
                                    key={w.key}
                                    className="p-2 text-right tabular-nums"
                                    style={heatStyle(cell.ctr, maxByWindow[w.key])}
                                    title={`${cell.clicks} clicks / ${cell.impressions} impr`}
                                  >
                                    {cell.ctr != null ? (
                                      <span className="font-semibold">
                                        {(cell.ctr * 100).toFixed(1)}%
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                    <div className="text-[10px] text-muted-foreground font-normal">
                                      {cell.clicks}/{cell.impressions}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
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