import { useEffect, useMemo, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { TrafficClassSplitPanel } from "@/components/admin/TrafficClassSplitPanel";
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, CheckCircle2,
  Compass, Globe2, Loader2, MapPinned, Radio, RefreshCw, Search,
  ShieldCheck, Sparkles, TrendingUp, Users, XCircle,
} from "lucide-react";

/**
 * Phase 8 — Growth Commander
 *
 * Single executive layer above existing systems. Reads ONLY from production
 * tables and edge functions already used by their dedicated pages. No new
 * tables, no new events, no mock data, no hardcoded recommendations.
 *
 * Aggregated systems (deep-linked, never duplicated):
 *   - Funnel Health           → /admin/funnel-health
 *   - Production Validation   → /admin/production-validation
 *   - Live Events             → /admin/live-events
 *   - Pinterest Distribution  → /admin/pinterest-distribution
 *   - Pinterest Growth Engine → /admin/pinterest-growth
 *   - Execution Center        → /admin/execution-center
 *   - Analytics Health        → /admin/analytics-health
 *   - World Map               → /admin/visitor-world-map
 *   - Attribution Compare     → /admin/attribution-compare
 *   - Visitor Timeline        → /admin/visitor-timeline/:sessionId
 */

type Tone = "green" | "yellow" | "red" | "muted";

const TONE_BADGE: Record<Tone, string> = {
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-700",
  yellow: "bg-amber-500/15 text-amber-300 border-amber-700",
  red: "bg-rose-500/15 text-rose-300 border-rose-700",
  muted: "bg-muted text-muted-foreground border-border",
};

function StatusDot({ tone }: { tone: Tone }) {
  const color =
    tone === "green" ? "bg-emerald-500"
      : tone === "yellow" ? "bg-amber-500"
      : tone === "red" ? "bg-rose-500"
      : "bg-muted-foreground/40";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} aria-hidden />;
}

interface SystemTileProps {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  headline: string;
  detail?: React.ReactNode;
  loading?: boolean;
}

function SystemTile({ title, href, icon: Icon, tone, headline, detail, loading }: SystemTileProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="text-sm font-medium truncate">{title}</CardTitle>
          </div>
          <Badge variant="outline" className={TONE_BADGE[tone]}>
            <StatusDot tone={tone} />
            <span className="ml-1.5 uppercase text-[10px] tracking-wider">{tone}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <div className="text-2xl font-semibold leading-tight">{headline}</div>
        )}
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
        <Button asChild size="sm" variant="ghost" className="px-0 h-auto text-xs">
          <Link to={href}>Open <ArrowRight className="h-3 w-3 ml-1" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------- Data shapes ----------

interface ValidationSummary {
  status: string;
  startedAt: string | null;
  passed: number;
  failed: number;
  warnings: number;
}

interface HealthSummary {
  green: number;
  yellow: number;
  red: number;
  openAlerts: number;
  lastCheckedAt: string | null;
}

interface FunnelSummary {
  sessions: number;
  pageViews: number;
  addToCarts: number;
  beginCheckouts: number;
  purchases: number;
  atcRate: number;
  cvr: number;
}

interface LiveSummary {
  eventsLastHour: number;
  distinctSessions: number;
  pinterestShare: number;
  tiktokShare: number;
}

interface PinterestSummary {
  publishedToday: number;
  readyDrafts: number;
  ctr7d: number;
  impressions7d: number;
  clicks7d: number;
  revenue30d: number;
}

// ---------- Helpers ----------

const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
const fmtUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

function sinceIso(hours: number) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

function validationTone(s: ValidationSummary | null): Tone {
  if (!s) return "muted";
  if (s.failed > 0 || s.status === "fail" || s.status === "failed") return "red";
  if (s.warnings > 0 || s.status === "warning" || s.status === "warn") return "yellow";
  if (s.status === "pass" || s.status === "passed" || s.passed > 0) return "green";
  return "muted";
}

function healthTone(s: HealthSummary | null): Tone {
  if (!s) return "muted";
  if (s.red > 0 || s.openAlerts > 0) return "red";
  if (s.yellow > 0) return "yellow";
  if (s.green > 0) return "green";
  return "muted";
}

function funnelTone(s: FunnelSummary | null): Tone {
  if (!s) return "muted";
  if (s.sessions === 0) return "muted";
  if (s.purchases > 0 && s.cvr >= 0.005) return "green";
  if (s.addToCarts > 0) return "yellow";
  return "red";
}

// ---------- Page ----------

export default function GrowthCommanderPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [validation, setValidation] = useState<ValidationSummary | null>(null);
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [funnel, setFunnel] = useState<FunnelSummary | null>(null);
  const [live, setLive] = useState<LiveSummary | null>(null);
  const [pinterest, setPinterest] = useState<PinterestSummary | null>(null);
  const [pinterestErr, setPinterestErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPinterestErr(null);

    const since24h = sinceIso(24);
    const since1h = sinceIso(1);
    const todayIso = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z").toISOString();

    const [
      runRes,
      healthRes,
      alertRes,
      waterfallRes,
      sessionsRes,
      liveRes,
      pinterestRes,
    ] = await Promise.all([
      supabase
        .from("production_validation_runs")
        .select("status,started_at,passed_count,failed_count,warning_count")
        .order("started_at", { ascending: false })
        .limit(1),
      supabase
        .from("analytics_health_checks")
        .select("probe_key,status,checked_at")
        .order("checked_at", { ascending: false })
        .limit(200),
      supabase
        .from("analytics_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabase
        .from("analytics_funnel_waterfall")
        .select("session_id,page_view_at,add_to_cart_at,begin_checkout_at,purchase_at,utm_source")
        .gte("updated_at", since24h)
        .limit(5000),
      supabase
        .from("visitor_activity")
        .select("session_id", { count: "exact", head: true })
        .gte("created_at", since24h),
      supabase
        .from("visitor_activity")
        .select("session_id,utm_source,created_at")
        .gte("created_at", since1h)
        .limit(5000),
      supabase.functions.invoke("pinterest-growth-engine", { body: { action: "dashboard" } }),
    ]);

    // Validation
    if (runRes.error) {
      setValidation(null);
    } else {
      const r = (runRes.data ?? [])[0];
      setValidation(
        r
          ? {
              status: r.status,
              startedAt: r.started_at,
              passed: r.passed_count ?? 0,
              failed: r.failed_count ?? 0,
              warnings: r.warning_count ?? 0,
            }
          : null,
      );
    }

    // Health probes — latest per probe_key
    if (healthRes.error) {
      setHealth(null);
    } else {
      const seen = new Set<string>();
      let g = 0, y = 0, r2 = 0;
      let lastCheckedAt: string | null = null;
      for (const row of healthRes.data ?? []) {
        if (seen.has(row.probe_key)) continue;
        seen.add(row.probe_key);
        if (!lastCheckedAt || row.checked_at > lastCheckedAt) lastCheckedAt = row.checked_at;
        if (row.status === "green") g++;
        else if (row.status === "yellow") y++;
        else if (row.status === "red") r2++;
      }
      const openAlerts = alertRes.count ?? 0;
      setHealth({ green: g, yellow: y, red: r2, openAlerts, lastCheckedAt });
    }

    // Funnel waterfall
    if (waterfallRes.error) {
      setFunnel(null);
    } else {
      const rows = waterfallRes.data ?? [];
      const sessions = sessionsRes.count ?? rows.length;
      const pv = rows.filter((r: any) => r.page_view_at).length;
      const atc = rows.filter((r: any) => r.add_to_cart_at).length;
      const co = rows.filter((r: any) => r.begin_checkout_at).length;
      const pur = rows.filter((r: any) => r.purchase_at).length;
      setFunnel({
        sessions,
        pageViews: pv,
        addToCarts: atc,
        beginCheckouts: co,
        purchases: pur,
        atcRate: pv ? atc / pv : 0,
        cvr: sessions ? pur / sessions : 0,
      });
    }

    // Live
    if (liveRes.error) {
      setLive(null);
    } else {
      const rows = liveRes.data ?? [];
      const sessions = new Set(rows.map((r: any) => r.session_id).filter(Boolean));
      const lower = (s: any) => (s || "").toString().toLowerCase();
      const pin = rows.filter((r: any) => lower(r.utm_source).includes("pinterest")).length;
      const tik = rows.filter((r: any) => lower(r.utm_source).includes("tiktok")).length;
      setLive({
        eventsLastHour: rows.length,
        distinctSessions: sessions.size,
        pinterestShare: rows.length ? pin / rows.length : 0,
        tiktokShare: rows.length ? tik / rows.length : 0,
      });
    }

    // Pinterest growth engine
    if (pinterestRes.error) {
      setPinterest(null);
      setPinterestErr(pinterestRes.error.message);
    } else {
      const d: any = pinterestRes.data;
      if (d && typeof d === "object") {
        setPinterest({
          publishedToday: d?.today?.published ?? 0,
          readyDrafts: d?.pipeline?.ready ?? 0,
          ctr7d: d?.last7d?.ctr ?? 0,
          impressions7d: d?.last7d?.impressions ?? 0,
          clicks7d: d?.last7d?.clicks ?? 0,
          revenue30d: d?.revenue30d?.revenue ?? d?.revenue?.last30d?.revenue_usd ?? 0,
        });
      } else {
        setPinterest(null);
      }
    }

    setLoading(false);
    // Acknowledge unused vars when needed
    void todayIso;
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshTick]);

  // Realtime: refresh tile state when validation runs or health probes change.
  useEffect(() => {
    const ch = supabase
      .channel("growth-commander")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "production_validation_runs" },
        () => setRefreshTick((t) => t + 1),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "analytics_health_checks" },
        () => setRefreshTick((t) => t + 1),
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);

  const validationDetail = useMemo(() => {
    if (!validation) return "No runs yet";
    const when = validation.startedAt ? new Date(validation.startedAt).toLocaleString() : "—";
    return `${validation.passed} pass · ${validation.warnings} warn · ${validation.failed} fail · ${when}`;
  }, [validation]);

  const overallTone: Tone = useMemo(() => {
    const tones: Tone[] = [
      validationTone(validation),
      healthTone(health),
      funnelTone(funnel),
    ];
    if (tones.includes("red")) return "red";
    if (tones.includes("yellow")) return "yellow";
    if (tones.every((t) => t === "muted")) return "muted";
    return "green";
  }, [validation, health, funnel]);

  return (
    <>
      <Helmet>
        <title>Growth Commander | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Compass className="h-6 w-6 md:h-7 md:w-7 text-primary shrink-0" />
              Growth Commander
            </h1>
            <p className="text-sm text-muted-foreground">
              Phase 8 executive layer. Live read-only view of every production system. No mutations from this page.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={TONE_BADGE[overallTone]}>
              <StatusDot tone={overallTone} />
              <span className="ml-2 uppercase text-xs tracking-wider">Overall: {overallTone}</span>
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRefreshTick((t) => t + 1)}
              disabled={loading}
            >
              {loading
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
        </header>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Row 1 — Platform integrity */}
        <section aria-label="Platform integrity" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SystemTile
            title="Production Validation"
            href="/admin/production-validation"
            icon={ShieldCheck}
            tone={validationTone(validation)}
            headline={
              validation
                ? `${validation.passed}/${validation.passed + validation.failed + validation.warnings}`
                : "—"
            }
            detail={validationDetail}
            loading={loading}
          />
          <SystemTile
            title="Analytics Health"
            href="/admin/analytics-health"
            icon={Activity}
            tone={healthTone(health)}
            headline={
              health
                ? `${health.green}🟢 ${health.yellow}🟡 ${health.red}🔴`
                : "—"
            }
            detail={
              health
                ? `${health.openAlerts} open alert${health.openAlerts === 1 ? "" : "s"} · checked ${
                    health.lastCheckedAt ? new Date(health.lastCheckedAt).toLocaleTimeString() : "—"
                  }`
                : "Awaiting first probe"
            }
            loading={loading}
          />
          <SystemTile
            title="Funnel Health (24h)"
            href="/admin/funnel-health"
            icon={BarChart3}
            tone={funnelTone(funnel)}
            headline={funnel ? fmtPct(funnel.cvr) : "—"}
            detail={
              funnel
                ? `${fmtInt(funnel.sessions)} sess · ${fmtInt(funnel.pageViews)} PV · ${fmtInt(
                    funnel.addToCarts,
                  )} ATC · ${fmtInt(funnel.purchases)} purchases`
                : "No waterfall rows yet"
            }
            loading={loading}
          />
          <SystemTile
            title="Live Events (1h)"
            href="/admin/live-events"
            icon={Radio}
            tone={live && live.eventsLastHour > 0 ? "green" : "muted"}
            headline={live ? fmtInt(live.eventsLastHour) : "—"}
            detail={
              live
                ? `${fmtInt(live.distinctSessions)} sessions · Pinterest ${fmtPct(
                    live.pinterestShare,
                  )} · TikTok ${fmtPct(live.tiktokShare)}`
                : "Waiting for traffic"
            }
            loading={loading}
          />
        </section>

        {/* Row 2 — Pinterest stack */}
        <section aria-label="Pinterest distribution" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Pinterest Distribution
            </h2>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/execution-center">
                  <Sparkles className="h-4 w-4 mr-2" /> Execution Center
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/pinterest-distribution">
                  <Search className="h-4 w-4 mr-2" /> Distribution Audit
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <SystemTile
              title="Pinterest Growth Engine"
              href="/admin/pinterest-growth"
              icon={TrendingUp}
              tone={
                pinterest && pinterest.publishedToday > 0
                  ? "green"
                  : pinterest && pinterest.readyDrafts > 0
                    ? "yellow"
                    : pinterestErr
                      ? "red"
                      : "muted"
              }
              headline={pinterest ? `${fmtInt(pinterest.publishedToday)} pins today` : "—"}
              detail={
                pinterest
                  ? `${fmtInt(pinterest.readyDrafts)} ready drafts queued`
                  : pinterestErr ?? "Loading…"
              }
              loading={loading}
            />
            <SystemTile
              title="Pinterest CTR (7d)"
              href="/admin/pinterest-growth"
              icon={BarChart3}
              tone={pinterest && pinterest.ctr7d >= 0.01 ? "green" : pinterest ? "yellow" : "muted"}
              headline={pinterest ? fmtPct(pinterest.ctr7d) : "—"}
              detail={
                pinterest
                  ? `${fmtInt(pinterest.impressions7d)} impr · ${fmtInt(pinterest.clicks7d)} clicks`
                  : "—"
              }
              loading={loading}
            />
            <SystemTile
              title="Pinterest Revenue (30d)"
              href="/admin/pinterest-growth"
              icon={Sparkles}
              tone={pinterest && pinterest.revenue30d > 0 ? "green" : "muted"}
              headline={pinterest ? fmtUSD(pinterest.revenue30d) : "—"}
              detail="From attributed orders"
              loading={loading}
            />
            <SystemTile
              title="Distribution Audit"
              href="/admin/pinterest-distribution"
              icon={Search}
              tone="muted"
              headline="On demand"
              detail="Read-only investigator. Click to run the latest audit."
              loading={false}
            />
          </div>
        </section>

        {/* Row 3 — Attribution + audience */}
        <section aria-label="Attribution" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Attribution &amp; Audience
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <SystemTile
              title="Attribution Compare"
              href="/admin/attribution-compare"
              icon={Users}
              tone="muted"
              headline="Per-layer parity"
              detail="Compare GA4, Pinterest tag, TikTok pixel, and server attribution side-by-side."
              loading={false}
            />
            <SystemTile
              title="Visitor World Map"
              href="/admin/visitor-world-map"
              icon={Globe2}
              tone="muted"
              headline="Live geo"
              detail="Source classification (clean, internal, bot, prefetch) with Pinterest drilldown."
              loading={false}
            />
            <SystemTile
              title="Visitor Timeline"
              href="/admin/live-events"
              icon={MapPinned}
              tone="muted"
              headline="Per-session"
              detail="Open Live Events, click a session to inspect its full funnel waterfall."
              loading={false}
            />
          </div>
        </section>

        {/* Composite KPI strip */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Composite KPIs (last 24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : !funnel ? (
              <div className="text-sm text-muted-foreground">No funnel data available.</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Kpi label="Sessions" value={fmtInt(funnel.sessions)} icon={Users} />
                <Kpi label="Page Views" value={fmtInt(funnel.pageViews)} icon={BarChart3} />
                <Kpi label="Add to Cart" value={fmtInt(funnel.addToCarts)} icon={TrendingUp} />
                <Kpi label="Checkouts" value={fmtInt(funnel.beginCheckouts)} icon={CheckCircle2} />
                <Kpi label="Purchases" value={fmtInt(funnel.purchases)} icon={Sparkles} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Validation breakdown */}
        {validation && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Latest Production Validation
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4 text-sm">
              <Badge variant="outline" className={TONE_BADGE[validationTone(validation)]}>
                <StatusDot tone={validationTone(validation)} />
                <span className="ml-2 uppercase text-[10px] tracking-wider">{validation.status}</span>
              </Badge>
              <span className="text-emerald-400">{validation.passed} passed</span>
              <span className="text-amber-400">{validation.warnings} warning</span>
              <span className="text-rose-400">{validation.failed} failed</span>
              <span className="text-muted-foreground">
                Run at {validation.startedAt ? new Date(validation.startedAt).toLocaleString() : "—"}
              </span>
              <Button asChild size="sm" variant="ghost" className="ml-auto">
                <Link to="/admin/production-validation">
                  View run history <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Health detail */}
        {health && (health.red > 0 || health.openAlerts > 0) && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              {health.red} probe{health.red === 1 ? "" : "s"} red · {health.openAlerts} open alert
              {health.openAlerts === 1 ? "" : "s"}.{" "}
              <Link to="/admin/analytics-health" className="underline">
                Open Analytics Health
              </Link>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}

function Kpi({
  label, value, icon: Icon,
}: { label: string; value: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border p-3 flex items-center gap-3">
      <div className="rounded-md bg-primary/10 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold leading-tight truncate">{value}</div>
      </div>
    </div>
  );
}