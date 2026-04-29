import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Loader2, RefreshCw, TrendingUp, MousePointerClick, ShoppingCart, CreditCard, DollarSign, Target, CheckCircle2, AlertCircle, CircleDashed, Download, Info, Link2, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * TikTok Ads Performance — per-hook funnel dashboard.
 *
 * Reads from public.get_tiktok_hook_performance(window_days, pattern). Each
 * row represents one utm_campaign value (hook1..hook5 by convention) for
 * traffic where utm_source = 'tiktok'. Empty states are intentional: no
 * fake demo data is rendered while ads have not started yet.
 */

type HookRow = {
  hook: string;
  sessions: number;
  go_views: number;
  pdp_views: number;
  pdp_sessions: number;
  cart_events: number;
  cart_sessions: number;
  checkout_events: number;
  checkout_sessions: number;
  purchases: number;
  revenue: number;
  pdp_ctr: number;
  cart_rate: number;
  cvr: number;
  aov: number;
};

type Totals = {
  sessions: number;
  pdp_sessions: number;
  cart_sessions: number;
  checkout_sessions: number;
  purchases: number;
  revenue: number;
};

type DayRow = { date: string; sessions: number; purchases: number; revenue: number };

type Payload = {
  window_days: number;
  from: string;
  totals: Totals;
  per_hook: HookRow[];
  per_day: DayRow[];
};

/**
 * Bio-link split — per-hook breakdown of organic profile traffic
 * (utm_content=tt_bio_link) vs everything else (paid ads, manual UTMs).
 * Shape mirrors the public.get_tiktok_bio_split RPC.
 */
type BioHookRow = {
  hook: string;
  bio_sessions: number;
  other_sessions: number;
  total_sessions: number;
  bio_share: number;          // % of this hook's sessions that came from bio
  bio_purchases: number;
  other_purchases: number;
  bio_revenue: number;
  other_revenue: number;
  bio_cvr: number;
  other_cvr: number;
  bio_aov: number;
  other_aov: number;
};

type BioPayload = {
  window_days: number;
  from: string;
  totals: {
    bio_sessions: number;
    other_sessions: number;
    total_sessions: number;
    bio_share: number;
    bio_purchases: number;
    other_purchases: number;
    bio_revenue: number;
    other_revenue: number;
  };
  per_hook: BioHookRow[];
};

const WINDOWS: { label: string; days: number }[] = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const EXPECTED_HOOKS = ["hook1", "hook2", "hook3", "hook4", "hook5"];

function fmtInt(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n || 0));
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}
function fmtPct(n: number) {
  return `${(n || 0).toFixed(2)}%`;
}

/**
 * Build a CSV from the per-hook rows.
 *
 * Columns are split into two groups:
 *   - "TikTok Ads Manager" columns (impressions, clicks, spend, CPC, CPM):
 *     left blank — these only exist in the TikTok dashboard, not in our DB.
 *     The user fills them in after export so a single sheet shows ad spend
 *     side-by-side with on-site funnel + revenue.
 *   - "Site funnel" columns: fully populated from visitor_activity.
 * CSV values are quoted + double-quote-escaped to stay safe with commas/quotes.
 */
function escapeCsv(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildHookCsv(rows: HookRow[], windowDays: number): string {
  const headers = [
    "hook",
    // TikTok Ads Manager — fill manually after export
    "impressions",
    "clicks",
    "ctr_percent",
    "spend_eur",
    "cpc_eur",
    "cpm_eur",
    // On-site funnel — auto-filled from our database
    "sessions",
    "pdp_visits",
    "pdp_ctr_percent",
    "add_to_cart",
    "checkouts",
    "purchases",
    "cvr_percent",
    "revenue_eur",
    "aov_eur",
  ];
  const lines: string[] = [];
  lines.push(`# TikTok Ads Performance export — last ${windowDays} day(s) — generated ${new Date().toISOString()}`);
  lines.push(
    `# impressions/clicks/spend/cpc/cpm: copy from TikTok Ads Manager. sessions onwards: site funnel from getpawsy.pet`,
  );
  lines.push(headers.join(","));
  for (const r of rows) {
    lines.push(
      [
        r.hook,
        "", "", "", "", "", "", // ad-platform columns left empty
        r.sessions,
        r.pdp_sessions,
        r.pdp_ctr,
        r.cart_sessions,
        r.checkout_sessions,
        r.purchases,
        r.cvr,
        Number(r.revenue || 0).toFixed(2),
        r.purchases > 0 ? Number(r.aov || 0).toFixed(2) : "",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return lines.join("\n");
}

function downloadCsv(filename: string, content: string) {
  // Prepend BOM so Excel on Windows opens UTF-8 with €-symbols correctly.
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the download has a chance to start (Safari/iOS quirk).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TikTokAdsPerformancePage() {
  const [windowDays, setWindowDays] = useState<number>(30);
  // Admin override: when ON, the RPCs return the raw, unfiltered data set
  // (internal/NL/admin/bot sessions are no longer dropped). Use only for
  // manual validation; defaults OFF so the dashboard stays compliant.
  const [includeExcluded, setIncludeExcluded] = useState<boolean>(false);
  const [data, setData] = useState<Payload | null>(null);
  const [bioData, setBioData] = useState<BioPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (days: number, includeExcludedFlag: boolean) => {
    setLoading(true);
    setError(null);
    // Fetch the funnel and the bio-link split in parallel — both are admin-
    // only RPCs and the UI shows them on the same screen, so failing one
    // shouldn't blank the other (we surface a single combined error line).
    const [funnelRes, bioRes] = await Promise.all([
      supabase.rpc("get_tiktok_hook_performance" as any, {
        p_window_days: days,
        p_campaign_pattern: null,
        p_include_excluded: includeExcludedFlag,
      }),
      supabase.rpc("get_tiktok_bio_split" as any, {
        p_window_days: days,
        p_include_excluded: includeExcludedFlag,
      }),
    ]);
    if (funnelRes.error) {
      setError(funnelRes.error.message);
      setData(null);
    } else {
      setData(funnelRes.data as unknown as Payload);
    }
    if (bioRes.error) {
      // Don't clobber the primary error if both failed — funnel is the
      // headline data set; bio split is a sidecar widget.
      if (!funnelRes.error) setError(bioRes.error.message);
      setBioData(null);
    } else {
      setBioData(bioRes.data as unknown as BioPayload);
    }
    setLoading(false);
  };

  useEffect(() => {
    load(windowDays, includeExcluded);
  }, [windowDays, includeExcluded]);

  // Merge live rows with the 5 expected hooks so every hook is visible even
  // before its first click — gives the user a deterministic 5-row table that
  // mirrors the 5 ad URLs they generated.
  const hookRows = useMemo<HookRow[]>(() => {
    const live = data?.per_hook ?? [];
    const byHook = new Map(live.map((r) => [r.hook.toLowerCase(), r]));
    const merged: HookRow[] = EXPECTED_HOOKS.map(
      (h) =>
        byHook.get(h) ?? {
          hook: h,
          sessions: 0,
          go_views: 0,
          pdp_views: 0,
          pdp_sessions: 0,
          cart_events: 0,
          cart_sessions: 0,
          checkout_events: 0,
          checkout_sessions: 0,
          purchases: 0,
          revenue: 0,
          pdp_ctr: 0,
          cart_rate: 0,
          cvr: 0,
          aov: 0,
        },
    );
    // Append any unexpected campaigns (e.g. hook6, manual tests) below.
    for (const row of live) {
      if (!EXPECTED_HOOKS.includes(row.hook.toLowerCase())) merged.push(row);
    }
    return merged;
  }, [data]);

  // Non-hook TikTok campaigns (e.g. tt_bio_link from the TikTok profile bio,
  // organic posts, manual experiments). These are real revenue sources too —
  // showing them prevents the dashboard from feeling broken when ads haven't
  // started yet but bio-link traffic is already flowing.
  const otherCampaignRows = useMemo<HookRow[]>(() => {
    const live = data?.per_hook ?? [];
    return live.filter((r) => !EXPECTED_HOOKS.includes(r.hook.toLowerCase()));
  }, [data]);

  const hasHookTraffic = useMemo(
    () => hookRows.some((r) => EXPECTED_HOOKS.includes(r.hook.toLowerCase()) && r.sessions > 0),
    [hookRows],
  );
  const hasOtherTraffic = otherCampaignRows.some((r) => r.sessions > 0);

  const totals: Totals = data?.totals ?? {
    sessions: 0,
    pdp_sessions: 0,
    cart_sessions: 0,
    checkout_sessions: 0,
    purchases: 0,
    revenue: 0,
  };

  // Best/worst hooks among rows that have any traffic, so we don't crown an
  // empty hook just because it sorts first alphabetically.
  const bestHook = useMemo(() => {
    const withData = hookRows.filter((r) => r.sessions > 0);
    if (!withData.length) return null;
    return [...withData].sort((a, b) => b.cvr - a.cvr || b.revenue - a.revenue)[0];
  }, [hookRows]);

  // PDP-lag alerts — flags hooks where /go landings happened but PDP visits
  // are running well below what a healthy CTA-click → PDP rate looks like.
  //
  // Why this matters: the only on-site CTA on /go is the TikTokDeepLinkButton.
  // Every CTA click navigates to the PDP, so PDP visits are a direct proxy
  // for confirmed CTA clicks (the lp_cta_click + tiktok_deep_link_click GA4
  // events are not in the DB; visitor_activity only sees pageviews). If
  // sessions ≫ pdp_sessions, one of three things is wrong:
  //   1. The CTA itself isn't getting clicked (creative / copy issue).
  //   2. Clicks are happening but UTMs are being stripped before the PDP row
  //      lands (regression of the /products → /product redirect fix).
  //   3. The PDP is throwing before the visitor tracker fires.
  //
  // Heuristic — only fires once we have a meaningful sample so single-visit
  // sessions don't trigger noise:
  //   - sessions ≥ 5
  //   - pdp_ctr < 30%   → "low" (warn)
  //   - pdp_ctr < 10%   → "critical" (likely a tracking regression)
  // Hooks with no sessions are skipped (covered by the "Waiting" status).
  const PDP_CTR_WARN = 30;
  const PDP_CTR_CRITICAL = 10;
  const MIN_SESSIONS_FOR_ALERT = 5;

  type PdpLagAlert = {
    hook: string;
    sessions: number;
    pdp: number;
    pdp_ctr: number;
    severity: 'critical' | 'warn';
    likelyCause: string;
  };

  const pdpLagAlerts = useMemo<PdpLagAlert[]>(() => {
    return hookRows
      .filter((r) => EXPECTED_HOOKS.includes(r.hook.toLowerCase()))
      .filter((r) => r.sessions >= MIN_SESSIONS_FOR_ALERT && r.pdp_ctr < PDP_CTR_WARN)
      .map<PdpLagAlert>((r) => {
        const severity: 'critical' | 'warn' = r.pdp_ctr < PDP_CTR_CRITICAL ? 'critical' : 'warn';
        const likelyCause =
          r.pdp_sessions === 0
            ? 'No PDP visits at all — likely a redirect dropping UTMs or the CTA is broken on this hook.'
            : severity === 'critical'
              ? 'PDP CTR is far below the 30% benchmark — investigate creative fatigue or tracking attribution.'
              : 'PDP CTR is below the 30% benchmark — try a stronger CTA or a sharper hook.';
        return {
          hook: r.hook,
          sessions: r.sessions,
          pdp: r.pdp_sessions,
          pdp_ctr: r.pdp_ctr,
          severity,
          likelyCause,
        };
      })
      .sort((a, b) => {
        // Critical first, then by raw click→PDP gap so the biggest leaks bubble up.
        if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
        return (b.sessions - b.pdp) - (a.sessions - a.pdp);
      });
  }, [hookRows]);

  return (
    <>
      <Helmet>
        <title>TikTok Ads Performance | GetPawsy Admin</title>
      </Helmet>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              TikTok Ads Performance
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Funnel per hook — sessions → product page → cart → checkout → purchase. Data flows in
              automatically as TikTok ad clicks arrive (matched by <code className="px-1 py-0.5 rounded bg-muted text-xs">utm_campaign=hook1..5</code>).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
              <TabsList>
                {WINDOWS.map((w) => (
                  <TabsTrigger key={w.days} value={String(w.days)}>
                    {w.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button variant="outline" size="icon" onClick={() => load(windowDays)} aria-label="Refresh">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loading || hookRows.length === 0}
              onClick={() => {
                const stamp = new Date().toISOString().slice(0, 10);
                downloadCsv(
                  `tiktok-ads-performance_${windowDays}d_${stamp}.csv`,
                  buildHookCsv(hookRows, windowDays),
                );
              }}
              aria-label="Export hook performance as CSV"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
          </div>
        </header>

        {error && (
          <Card className="p-4 border-destructive/50 bg-destructive/5 text-sm text-destructive">
            Failed to load: {error}
          </Card>
        )}

        {/* Diagnostic banner: explains the difference between bio-link traffic
            (utm_campaign=tt_bio_link, organic from your TikTok profile) and
            paid ad traffic (utm_campaign=hook1..5). Without this, an empty
            hook table looks like broken tracking when in reality the ads
            simply haven't been clicked yet. */}
        {!loading && !hasHookTraffic && hasOtherTraffic && (
          <Card className="p-4 border-amber-500/40 bg-amber-500/5">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-semibold text-foreground">
                  TikTok traffic detected — but not from the paid ad hooks yet.
                </p>
                <p className="text-muted-foreground">
                  All current TikTok visitors are arriving via your{" "}
                  <span className="font-mono text-xs px-1 py-0.5 rounded bg-muted">utm_campaign</span> values
                  shown below (e.g. <span className="font-mono text-xs px-1 py-0.5 rounded bg-muted">tt_bio_link</span>{" "}
                  = your profile bio link). The 5 ad-hook URLs
                  (<span className="font-mono text-xs px-1 py-0.5 rounded bg-muted">hook1..5</span>)
                  haven&apos;t been clicked in this window yet — once your TikTok ads start
                  driving clicks, those rows will fill in automatically.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Top KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile icon={<MousePointerClick className="h-4 w-4" />} label="Sessions" value={fmtInt(totals.sessions)} />
          <KpiTile icon={<Target className="h-4 w-4" />} label="PDP visits" value={fmtInt(totals.pdp_sessions)} />
          <KpiTile icon={<ShoppingCart className="h-4 w-4" />} label="Add to cart" value={fmtInt(totals.cart_sessions)} />
          <KpiTile icon={<CreditCard className="h-4 w-4" />} label="Checkouts" value={fmtInt(totals.checkout_sessions)} />
          <KpiTile icon={<DollarSign className="h-4 w-4" />} label="Purchases" value={fmtInt(totals.purchases)} />
          <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="Revenue" value={fmtMoney(totals.revenue)} />
        </div>

        {/* PDP-lag alert — surfaces hooks where /go traffic isn't reaching
            the product page. Only renders when there's at least one flagged
            hook so the dashboard stays quiet when everything is healthy. */}
        {pdpLagAlerts.length > 0 && (
          <Card
            className={cn(
              'overflow-hidden border-l-4',
              pdpLagAlerts.some((a) => a.severity === 'critical')
                ? 'border-l-destructive bg-destructive/5'
                : 'border-l-amber-500 bg-amber-500/5',
            )}
            role="alert"
            aria-live="polite"
          >
            <div className="px-4 py-3 border-b border-border/60 flex items-start gap-3">
              <AlertCircle
                className={cn(
                  'h-5 w-5 shrink-0 mt-0.5',
                  pdpLagAlerts.some((a) => a.severity === 'critical')
                    ? 'text-destructive'
                    : 'text-amber-600 dark:text-amber-400',
                )}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground">
                  PDP visits lag behind CTA clicks
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pdpLagAlerts.length === 1
                    ? `1 hook is sending TikTok sessions but not landing them on the product page (PDP CTR < ${PDP_CTR_WARN}%).`
                    : `${pdpLagAlerts.length} hooks are sending TikTok sessions but not landing them on the product page (PDP CTR < ${PDP_CTR_WARN}%).`}
                </p>
              </div>
            </div>
            <ul className="divide-y divide-border/60">
              {pdpLagAlerts.map((a) => (
                <li key={a.hook} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex items-center gap-2 sm:w-28 shrink-0">
                    <span
                      className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide',
                        a.severity === 'critical'
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                      )}
                    >
                      {a.severity === 'critical' ? 'Critical' : 'Warning'}
                    </span>
                    <span className="font-mono font-semibold text-sm text-foreground">{a.hook}</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums sm:w-56 shrink-0">
                    {fmtInt(a.sessions)} sessions · {fmtInt(a.pdp)} PDP ·{' '}
                    <span
                      className={cn(
                        'font-semibold',
                        a.severity === 'critical' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400',
                      )}
                    >
                      {fmtPct(a.pdp_ctr)} PDP CTR
                    </span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-snug">{a.likelyCause}</p>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-border/60 bg-muted/30 text-[11px] text-muted-foreground">
              Threshold: ≥ {MIN_SESSIONS_FOR_ALERT} sessions, PDP CTR &lt; {PDP_CTR_WARN}% (warning) or &lt; {PDP_CTR_CRITICAL}% (critical).
              The lp_cta_click → tiktok_deep_link_click → PDP chain is healthy when PDP CTR ≥ {PDP_CTR_WARN}%.
            </div>
          </Card>
        )}

        {/* Healthy-state confirmation: explicit "all good" tile so the
            absence of alerts isn't ambiguous (especially after we just
            shipped the redirect / UTM-preservation fix). Only shows when
            we have enough traffic to actually evaluate the hooks. */}
        {pdpLagAlerts.length === 0 && hasHookTraffic && (
          <Card className="overflow-hidden border-l-4 border-l-green-500/60 bg-green-500/5">
            <div className="px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  CTA → PDP chain is healthy.
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Every hook with ≥ {MIN_SESSIONS_FOR_ALERT} sessions is sending traffic through to the product page above the {PDP_CTR_WARN}% PDP CTR threshold.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Tracking status per hook — verifies that the tiktok_deep_link_click
            event is propagating utm_campaign correctly for each of the 5 ad
            URLs. A hook is "verified" when we see both /go landings AND a
            downstream PDP session under the same utm_campaign — that's only
            possible if the deep-link button preserved the campaign param. */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">UTM tracking status</h2>
            <span className="text-xs text-muted-foreground">
              Verifies <code className="px-1 py-0.5 rounded bg-muted text-[10px]">tiktok_deep_link_click</code> propagates utm_campaign
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 p-3">
            {EXPECTED_HOOKS.map((h) => {
              const row = hookRows.find((r) => r.hook.toLowerCase() === h);
              const sessions = row?.sessions ?? 0;
              const pdp = row?.pdp_sessions ?? 0;
              // Three states:
              //  - verified: landed AND propagated to PDP under same campaign
              //  - partial:  landed but no PDP click yet (CTA not clicked, OR
              //              attribution is dropping the campaign — investigate)
              //  - waiting:  no traffic at all yet
              const state: 'verified' | 'partial' | 'waiting' =
                sessions > 0 && pdp > 0 ? 'verified' : sessions > 0 ? 'partial' : 'waiting';
              return (
                <div
                  key={h}
                  className={cn(
                    'rounded-lg border p-3 flex items-start gap-2.5 transition-colors',
                    state === 'verified' && 'border-green-500/40 bg-green-500/5',
                    state === 'partial' && 'border-amber-500/40 bg-amber-500/5',
                    state === 'waiting' && 'border-border bg-muted/30',
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {state === 'verified' && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />}
                    {state === 'partial' && <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                    {state === 'waiting' && <CircleDashed className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono font-semibold text-sm text-foreground">{h}</span>
                      <span
                        className={cn(
                          'text-[10px] uppercase tracking-wide font-semibold',
                          state === 'verified' && 'text-green-600 dark:text-green-400',
                          state === 'partial' && 'text-amber-600 dark:text-amber-400',
                          state === 'waiting' && 'text-muted-foreground',
                        )}
                      >
                        {state === 'verified' ? 'Verified' : state === 'partial' ? 'Partial' : 'Waiting'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                      {fmtInt(sessions)} sessions · {fmtInt(pdp)} PDP
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      {state === 'verified' &&
                        'utm_campaign propagated end-to-end.'}
                      {state === 'partial' &&
                        'Landings tracked, but no CTA click recorded yet under this campaign.'}
                      {state === 'waiting' && 'No clicks received yet.'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Bio-link share widget — for each hook bucket, shows what % of
            sessions came from the TikTok profile bio link (utm_content=
            tt_bio_link) vs other sources, with side-by-side CVR so you can
            see whether bio traffic converts better/worse than the rest. */}
        <BioSplitCard data={bioData} loading={loading} />

        {/* Per-hook table */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Per-hook funnel</h2>
            {bestHook && (
              <span className="text-xs text-muted-foreground">
                Top performer: <span className="font-mono font-semibold text-primary">{bestHook.hook}</span> · CVR {fmtPct(bestHook.cvr)}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Hook</th>
                  <th className="text-right px-3 py-2 font-medium">Sessions</th>
                  <th className="text-right px-3 py-2 font-medium">PDP</th>
                  <th className="text-right px-3 py-2 font-medium">PDP CTR</th>
                  <th className="text-right px-3 py-2 font-medium">Cart</th>
                  <th className="text-right px-3 py-2 font-medium">Checkout</th>
                  <th className="text-right px-3 py-2 font-medium">Purchases</th>
                  <th className="text-right px-3 py-2 font-medium">CVR</th>
                  <th className="text-right px-3 py-2 font-medium">Revenue</th>
                  <th className="text-right px-4 py-2 font-medium">AOV</th>
                </tr>
              </thead>
              <tbody>
                {hookRows.map((r) => (
                  <tr
                    key={r.hook}
                    className={cn(
                      "border-t border-border/60 hover:bg-accent/40 transition-colors",
                      r.sessions === 0 && "opacity-60",
                    )}
                  >
                    <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{r.hook}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.sessions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.pdp_sessions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtPct(r.pdp_ctr)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.cart_sessions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.checkout_sessions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtInt(r.purchases)}</td>
                    <td className={cn(
                      "px-3 py-2.5 text-right tabular-nums font-semibold",
                      r.cvr >= 2 ? "text-green-600 dark:text-green-400" : r.cvr > 0 ? "text-foreground" : "text-muted-foreground",
                    )}>
                      {fmtPct(r.cvr)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.revenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.purchases > 0 ? fmtMoney(r.aov) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totals.sessions === 0 && !loading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground border-t border-border">
              No TikTok ad clicks recorded yet in this window. Once ads start running with{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-xs">utm_source=tiktok</code> and{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-xs">utm_campaign=hook1..5</code>, rows fill in automatically.
            </div>
          )}
        </Card>

        {/* Other (non-hook) TikTok campaigns: bio-link, organic posts, etc.
            Identical funnel breakdown so you can compare paid hooks vs.
            organic profile traffic side-by-side. */}
        {otherCampaignRows.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Other TikTok campaigns</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                Bio link, organic posts &amp; manual UTMs (everything not <code className="px-1 py-0.5 rounded bg-muted text-[10px]">hook1..5</code>)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Campaign</th>
                    <th className="text-right px-3 py-2 font-medium">Sessions</th>
                    <th className="text-right px-3 py-2 font-medium">PDP</th>
                    <th className="text-right px-3 py-2 font-medium">PDP CTR</th>
                    <th className="text-right px-3 py-2 font-medium">Cart</th>
                    <th className="text-right px-3 py-2 font-medium">Checkout</th>
                    <th className="text-right px-3 py-2 font-medium">Purchases</th>
                    <th className="text-right px-3 py-2 font-medium">CVR</th>
                    <th className="text-right px-3 py-2 font-medium">Revenue</th>
                    <th className="text-right px-4 py-2 font-medium">AOV</th>
                  </tr>
                </thead>
                <tbody>
                  {otherCampaignRows.map((r) => (
                    <tr key={r.hook} className="border-t border-border/60 hover:bg-accent/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{r.hook}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.sessions)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.pdp_sessions)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtPct(r.pdp_ctr)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.cart_sessions)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.checkout_sessions)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtInt(r.purchases)}</td>
                      <td className={cn(
                        "px-3 py-2.5 text-right tabular-nums font-semibold",
                        r.cvr >= 2 ? "text-green-600 dark:text-green-400" : r.cvr > 0 ? "text-foreground" : "text-muted-foreground",
                      )}>
                        {fmtPct(r.cvr)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.revenue)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {r.purchases > 0 ? fmtMoney(r.aov) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Daily trend */}
        {data && data.per_day.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Daily trend (all hooks)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-right px-3 py-2 font-medium">Sessions</th>
                    <th className="text-right px-3 py-2 font-medium">Purchases</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.per_day.map((d) => (
                    <tr key={d.date} className="border-t border-border/60">
                      <td className="px-4 py-2 font-mono text-xs">{d.date}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInt(d.sessions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInt(d.purchases)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Source: <code>visitor_activity</code> filtered by <code>utm_source=tiktok</code>, grouped by{" "}
          <code>utm_campaign</code>. Internal traffic excluded. Funnel definitions: PDP = product page session, Cart =
          add-to-cart event, Checkout = checkout event, Purchase = order linked to session.
        </p>
      </div>
    </>
  );
}

function KpiTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-foreground tabular-nums">{value}</div>
    </Card>
  );
}

/**
 * BioSplitCard — visualises how much of each hook's traffic comes from the
 * TikTok bio link vs other sources, plus how each segment converts.
 *
 * Why this matters: organic bio-link traffic and paid-ad traffic both end
 * up in hook1..hook5 buckets (bio is auto-bucketed deterministically), so
 * without this widget you can't tell whether a hook's CVR is being lifted
 * or dragged down by the bio audience. The horizontal bar shows the share
 * at a glance; the CVR pair shows whether the bio audience converts better
 * or worse than the rest for this specific hook.
 */
function BioSplitCard({ data, loading }: { data: BioPayload | null; loading: boolean }) {
  // Always render all 5 expected hooks so the layout is stable even before
  // any traffic arrives — empty states are explicit, not invisible rows.
  const rowsByHook = new Map((data?.per_hook ?? []).map((r) => [r.hook.toLowerCase(), r]));
  const totals = data?.totals;

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Bio-link share &amp; conversion</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          <code className="px-1 py-0.5 rounded bg-muted text-[10px]">utm_content=tt_bio_link</code> vs other sources, per hook
        </span>
      </div>

      {/* Roll-up summary across all 5 hooks */}
      {totals && totals.total_sessions > 0 && (
        <div className="px-4 py-3 border-b border-border bg-muted/20 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Bio share (all hooks)</div>
            <div className="text-base font-bold text-foreground tabular-nums">{fmtPct(totals.bio_share)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Bio sessions</div>
            <div className="text-base font-bold text-foreground tabular-nums">{fmtInt(totals.bio_sessions)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Bio purchases</div>
            <div className="text-base font-bold text-foreground tabular-nums">{fmtInt(totals.bio_purchases)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Bio revenue</div>
            <div className="text-base font-bold text-foreground tabular-nums">{fmtMoney(totals.bio_revenue)}</div>
          </div>
        </div>
      )}

      <div className="divide-y divide-border/60">
        {EXPECTED_HOOKS.map((h) => {
          const row = rowsByHook.get(h);
          const bioSessions = row?.bio_sessions ?? 0;
          const otherSessions = row?.other_sessions ?? 0;
          const total = bioSessions + otherSessions;
          const bioShare = row?.bio_share ?? 0;
          const bioCvr = row?.bio_cvr ?? 0;
          const otherCvr = row?.other_cvr ?? 0;
          // Highlight when bio meaningfully out- or under-performs the rest.
          // 0.5 pp is small enough to surface signal early, big enough to
          // ignore rounding noise when both buckets are tiny.
          const cvrDelta = bioCvr - otherCvr;
          const cvrSignal: 'better' | 'worse' | 'neutral' =
            total === 0 || (bioSessions === 0 && otherSessions === 0)
              ? 'neutral'
              : cvrDelta >= 0.5
              ? 'better'
              : cvrDelta <= -0.5
              ? 'worse'
              : 'neutral';

          return (
            <div key={h} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono font-semibold text-sm text-foreground">{h}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {fmtInt(total)} sessions
                  </span>
                </div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  Bio share <span className="font-semibold text-foreground">{fmtPct(bioShare)}</span>
                </div>
              </div>

              {/* Stacked bar: bio (primary) vs other (muted). Falls back to
                  a flat grey track when the hook has no traffic yet. */}
              <div className="h-2.5 w-full rounded-full overflow-hidden bg-muted/60 flex" aria-label={`${h} bio share ${fmtPct(bioShare)}`}>
                {total > 0 ? (
                  <>
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${(bioSessions / total) * 100}%` }}
                    />
                    <div
                      className="h-full bg-muted-foreground/40 transition-all"
                      style={{ width: `${(otherSessions / total) * 100}%` }}
                    />
                  </>
                ) : null}
              </div>

              {/* Side-by-side comparison: sessions, CVR, revenue per bucket */}
              <div className="mt-2.5 grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold uppercase tracking-wide text-primary">Bio link</span>
                    <span className="tabular-nums text-muted-foreground">{fmtInt(bioSessions)} sess</span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1 tabular-nums">
                    <div>
                      <div className="text-muted-foreground">CVR</div>
                      <div className={cn(
                        'font-semibold',
                        cvrSignal === 'better' && 'text-green-600 dark:text-green-400',
                        cvrSignal === 'worse' && 'text-amber-600 dark:text-amber-400',
                      )}>{fmtPct(bioCvr)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Buys</div>
                      <div className="font-semibold text-foreground">{fmtInt(row?.bio_purchases ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Revenue</div>
                      <div className="font-semibold text-foreground">{fmtMoney(row?.bio_revenue ?? 0)}</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold uppercase tracking-wide text-muted-foreground">Other</span>
                    <span className="tabular-nums text-muted-foreground">{fmtInt(otherSessions)} sess</span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1 tabular-nums">
                    <div>
                      <div className="text-muted-foreground">CVR</div>
                      <div className={cn(
                        'font-semibold',
                        cvrSignal === 'worse' && 'text-green-600 dark:text-green-400',
                        cvrSignal === 'better' && 'text-amber-600 dark:text-amber-400',
                      )}>{fmtPct(otherCvr)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Buys</div>
                      <div className="font-semibold text-foreground">{fmtInt(row?.other_purchases ?? 0)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Revenue</div>
                      <div className="font-semibold text-foreground">{fmtMoney(row?.other_revenue ?? 0)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {cvrSignal !== 'neutral' && total > 0 && (
                <p className={cn(
                  'mt-2 text-[11px]',
                  cvrSignal === 'better' && 'text-green-700 dark:text-green-400',
                  cvrSignal === 'worse' && 'text-amber-700 dark:text-amber-400',
                )}>
                  Bio audience converts {cvrSignal === 'better' ? 'better' : 'worse'} than other sources by {Math.abs(cvrDelta).toFixed(2)}pp.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!loading && (!totals || totals.total_sessions === 0) && (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground border-t border-border">
          No hook traffic in this window yet — bio-link split appears here once any hook1..5 session is recorded.
        </div>
      )}
    </Card>
  );
}