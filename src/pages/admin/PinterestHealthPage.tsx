import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Play, AlertCircle, ShieldCheck, KeyRound, CheckCircle2, XCircle } from "lucide-react";

const ALL_PINTEREST_SCOPES = [
  "catalogs:read","catalogs:write","ads:read","ads:write",
  "billing:read","billing:write","user_accounts:write",
  "boards:read_secret","boards:write_secret",
  "pins:read_secret","pins:write_secret",
  "biz_access:read","biz_access:write",
];
const REQUIRED_PINTEREST_SCOPES = [
  "boards:read","boards:write","pins:read","pins:write","user_accounts:read",
  "catalogs:read","catalogs:write","ads:read","ads:write",
];

type Snapshot = {
  status: "healthy" | "delayed" | "stalled";
  publishedToday: number;
  queued: number;
  drafts: number;
  failed: number;
  rejected: number;
  blocked: number;
  lastPublishAt: string | null;
  minutesSinceLastPublish: number | null;
  oldestDraftAt: string | null;
  minutesOldestDraft: number | null;
  lastDirectorAt: string | null;
  minutesSinceLastDirector: number | null;
  nextPublishAt: string | null;
  incidents: Array<{ condition: string; severity: string; detail: any }>;
  recovery?: any;
  successRate24h?: number | null;
  avgPublishIntervalMin?: number | null;
  factoryThroughput24h?: number;
  queueGrowthRate24h?: number;
  estRuntimeDays?: number | null;
  tokenStatus?: {
    connected: boolean;
    expiresAt: string | null;
    minutesUntilExpiry: number | null;
    boardCount: number | null;
  };
  cronJobs?: Array<{ name: string; minutesSinceRun: number | null; ok: boolean }>;
  verification?: {
    verified24h: number;
    failed24h: number;
    waitingBacklog: number;
    successRate24h: number | null;
    avgScore24h: number | null;
    avgVerificationMinutes: number | null;
    lastVerifiedAt: string | null;
    lastFailedAt: string | null;
    topFailureCauses: Array<{ reason: string; count: number }>;
    autoRecoveries24h: number;
    recoverySuccessRate24h: number | null;
    productionHealthScore: number;
  };
  content?: {
    avgContentScore: number | null;
    contentDiversityScore: number;
    expectedWeeklyReach: number;
    topBoards: Array<{ board_name: string; posted: number; ctr: number; saveRate: number }>;
    boardRanking: Array<{ board_name: string; score: number; classification: string | null }>;
    topHeadlines: Array<{ headline: string; count: number; avgScore: number | null }>;
    topHooks: Array<{ hook: string; count: number }>;
    topCTAs: Array<{ cta: string; count: number }>;
    worstContent: Array<{ pin_id: string; reason: string; score: number | null }>;
    creativeEvolutionTrend: Array<{ day: string; avgScore: number; published: number }>;
    qualityGateRejections24h: number;
  };
};

type WatchdogPayload = {
  status: "green" | "yellow" | "red";
  checked_at: string;
  thresholds: Record<string, number>;
  metrics: {
    approved: number;
    drafts: number;
    queued: number;
    failed: number;
    posted_today: number;
    generated_today: number;
    generated_24h: number;
    last_publish_at: string | null;
    minutes_since_publish: number | null;
    last_generation_at: string | null;
    minutes_since_generation: number | null;
  };
  scheduler: Array<{
    jobname: string;
    schedule: string;
    active: boolean;
    last_run: string | null;
    last_success: string | null;
    fails_2h: number;
    succ_2h: number;
  }>;
  incidents: Array<{ condition: string; action: string; detail: any }>;
  recovery: Record<string, any>;
  escalated: { allowed: boolean; mode: string } | null;
};

const statusColor = {
  healthy: { dot: "🟢", label: "Healthy", cls: "bg-emerald-100 text-emerald-800" },
  delayed: { dot: "🟡", label: "Delayed", cls: "bg-amber-100 text-amber-800" },
  stalled: { dot: "🔴", label: "Stalled", cls: "bg-red-100 text-red-800" },
} as const;

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function PinterestHealthPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [growth, setGrowth] = useState<any | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [exp, setExp] = useState<any | null>(null);
  const [expLoading, setExpLoading] = useState(false);
  const [evo, setEvo] = useState<any | null>(null);
  const [evoLoading, setEvoLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [watchdog, setWatchdog] = useState<WatchdogPayload | null>(null);
  const [watchdogLoading, setWatchdogLoading] = useState(false);
  const [conn, setConn] = useState<any>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [recovery, setRecovery] = useState<any>(null);
  const [recoveryRunning, setRecoveryRunning] = useState(false);

  async function loadConnection() {
    const { data } = await (supabase as any).rpc("get_pinterest_connection_admin");
    const row = Array.isArray(data) ? data[0] : data;
    setConn(row && row.status === "connected" ? row : row ?? null);
  }

  async function startReconnect() {
    setReconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-oauth-start", {
        body: { extra_scopes: ALL_PINTEREST_SCOPES, auto_sync_catalog: true },
      });
      if (error || !data?.auth_url) throw new Error(error?.message || data?.error || "OAuth start failed");
      window.location.href = data.auth_url;
    } catch (e: any) {
      setError(`Reconnect failed: ${e?.message ?? e}`);
      setReconnecting(false);
    }
  }

  async function runFinalRecovery() {
    setRecoveryRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-final-recovery", { body: {} });
      if (error) throw error;
      setRecovery(data?.report ?? data);
      await loadConnection();
    } catch (e: any) {
      setError(`Recovery failed: ${e?.message ?? e}`);
    } finally {
      setRecoveryRunning(false);
    }
  }

  async function refresh(runAction = false) {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-flow-monitor",
        runAction ? { body: {} } : { method: "GET" as any },
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "Monitor returned error");
      setSnap(data.snapshot);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
    const { data: incs } = await supabase
      .from("pinterest_health_incidents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(15);
    setIncidents(incs ?? []);
  }

  async function refreshWatchdog(runRecovery = false) {
    setWatchdogLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-autopilot-watchdog",
        { body: runRecovery ? { source: "manual" } : { snapshot: true } },
      );
      if (!error && data?.ok) setWatchdog(data.watchdog as WatchdogPayload);
    } catch (_) {
      /* swallow — surface via snap error UI */
    } finally {
      setWatchdogLoading(false);
    }
  }

  async function refreshGrowth(execute = false) {
    setGrowthLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-growth-ai",
        execute ? { body: {} } : { method: "GET" as any },
      );
      if (!error && data?.ok) setGrowth(data.snapshot);
    } catch (_) {
      /* silent — surfaced in panel */
    } finally {
      setGrowthLoading(false);
    }
  }

  async function refreshExperiments(execute = false) {
    setExpLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-experiment-engine",
        execute ? { body: {} } : { method: "GET" as any },
      );
      if (!error && data?.ok) setExp(data.snapshot);
    } catch (_) {
      /* silent — surfaced in panel */
    } finally {
      setExpLoading(false);
    }
  }

  async function refreshEvolution(execute = false) {
    setEvoLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-evolution-engine",
        execute ? { body: {} } : { method: "GET" as any },
      );
      if (!error && data?.ok) setEvo(data.snapshot);
    } catch (_) {
      /* silent */
    } finally {
      setEvoLoading(false);
    }
  }

  useEffect(() => {
    refresh(false);
    refreshWatchdog(false);
    refreshGrowth(false);
    refreshExperiments(false);
    refreshEvolution(false);
    loadConnection();
    // Auto-run final recovery after a successful OAuth callback redirect
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("oauth_success") === "true") {
      runFinalRecovery();
    }
    const t = setInterval(() => {
      refresh(false);
      refreshWatchdog(false);
      refreshGrowth(false);
      refreshExperiments(false);
      refreshEvolution(false);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const sc = snap ? statusColor[snap.status] : statusColor.healthy;
  const wdColor =
    watchdog?.status === "red"
      ? "bg-red-100 text-red-800"
      : watchdog?.status === "yellow"
      ? "bg-amber-100 text-amber-800"
      : "bg-emerald-100 text-emerald-800";
  const wdDot = watchdog?.status === "red" ? "🔴" : watchdog?.status === "yellow" ? "🟡" : "🟢";

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <Helmet>
        <title>Pinterest Health Monitor — GetPawsy Admin</title>
      </Helmet>

      {/* OAuth Recovery panel — verifies scopes, surfaces reconnect CTA, runs final recovery */}
      <OAuthRecoveryPanel
        conn={conn}
        reconnecting={reconnecting}
        onReconnect={startReconnect}
        onRunRecovery={runFinalRecovery}
        recovery={recovery}
        recoveryRunning={recoveryRunning}
      />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Pinterest Flow Monitor</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refresh(false)}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => refresh(true)} disabled={loading}>
            <Play className="h-4 w-4 mr-1" />
            Run monitor + recovery
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">Autopilot Watchdog</h2>
            <Badge className={wdColor}>
              {wdDot} {watchdog?.status?.toUpperCase() ?? "—"}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => refreshWatchdog(false)} disabled={watchdogLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${watchdogLoading ? "animate-spin" : ""}`} />
              Check
            </Button>
            <Button size="sm" onClick={() => refreshWatchdog(true)} disabled={watchdogLoading}>
              <Play className="h-4 w-4 mr-1" />
              Run watchdog
            </Button>
          </div>
        </div>

        {watchdog ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-center">
              <Stat label="Approved (queued)" value={watchdog.metrics.approved} />
              <Stat label="Drafts" value={watchdog.metrics.drafts} />
              <Stat label="Generated today" value={watchdog.metrics.generated_today} />
              <Stat label="Generated 24h" value={watchdog.metrics.generated_24h} />
              <Stat label="Published today" value={watchdog.metrics.posted_today} />
              <Stat label="Failed/stuck" value={watchdog.metrics.failed} />
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Row
                label="Last generation"
                value={`${fmt(watchdog.metrics.last_generation_at)} (${watchdog.metrics.minutes_since_generation ?? "—"} min)`}
              />
              <Row
                label="Last publish"
                value={`${fmt(watchdog.metrics.last_publish_at)} (${watchdog.metrics.minutes_since_publish ?? "—"} min)`}
              />
              <Row label="Checked at" value={fmt(watchdog.checked_at)} />
              <Row
                label="SMS escalation"
                value={
                  watchdog.escalated
                    ? `${watchdog.escalated.allowed ? "SENT" : "BLOCKED"} (mode=${watchdog.escalated.mode})`
                    : "not needed"
                }
              />
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-2">Cron jobs (last 2h)</h3>
              <div className="space-y-1 text-xs">
                {watchdog.scheduler.map((s) => {
                  const dot =
                    s.fails_2h > 0
                      ? "🔴"
                      : s.succ_2h === 0
                      ? "🟡"
                      : "🟢";
                  return (
                    <div key={s.jobname} className="flex justify-between border-b py-1 gap-2 flex-wrap">
                      <span className="font-mono">{dot} {s.jobname}</span>
                      <span className="text-muted-foreground">
                        {s.schedule} • succ:{s.succ_2h} fail:{s.fails_2h} • last {s.last_run ? new Date(s.last_run).toLocaleTimeString() : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {watchdog.incidents.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">Active watchdog incidents</h3>
                <ul className="text-sm space-y-1">
                  {watchdog.incidents.map((i, n) => (
                    <li key={n} className="flex justify-between border-b py-1">
                      <span className="font-mono">{i.condition}</span>
                      <span className="text-muted-foreground">→ {i.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading watchdog…</p>
        )}
      </Card>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 text-red-800 text-sm flex gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          {error}
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-3xl">{sc.dot}</span>
          <Badge className={sc.cls}>{sc.label}</Badge>
          <span className="text-sm text-muted-foreground">
            {snap ? `${snap.incidents.length} active condition(s)` : "Loading…"}
          </span>
        </div>

        {snap && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
            <Stat label="Published today" value={snap.publishedToday} />
            <Stat label="Queued" value={snap.queued} />
            <Stat label="Drafts" value={snap.drafts} />
            <Stat label="Failed / stuck" value={snap.failed} />
            <Stat label="Rejected" value={snap.rejected} />
            <Stat label="Blocked (legacy)" value={snap.blocked} />
          </div>
        )}

        {snap && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Row label="Last publish" value={`${fmt(snap.lastPublishAt)} (${snap.minutesSinceLastPublish ?? "—"} min ago)`} />
            <Row label="Next scheduled" value={fmt(snap.nextPublishAt)} />
            <Row label="Oldest draft" value={snap.oldestDraftAt ? `${fmt(snap.oldestDraftAt)} (${snap.minutesOldestDraft} min)` : "none"} />
            <Row label="Last director output" value={snap.lastDirectorAt ? `${fmt(snap.lastDirectorAt)} (${snap.minutesSinceLastDirector} min)` : "—"} />
          </div>
        )}

        {snap && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold mb-2">Autonomy KPIs (24h)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
              <Stat
                label="Success rate"
                value={snap.successRate24h == null ? 0 : Math.round(snap.successRate24h * 100)}
              />
              <Stat
                label="Avg interval (min)"
                value={snap.avgPublishIntervalMin ?? 0}
              />
              <Stat label="Factory throughput" value={snap.factoryThroughput24h ?? 0} />
              <Stat label="Queue growth" value={snap.queueGrowthRate24h ?? 0} />
              <Stat label="Est. runtime (days)" value={snap.estRuntimeDays ?? 0} />
              <Stat label="Boards" value={snap.tokenStatus?.boardCount ?? 0} />
            </div>
            {snap.verification && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold mb-2">
                  End-to-end verification (24h)
                  <span className="ml-2 text-xs text-muted-foreground">
                    Production health score: <strong>{snap.verification.productionHealthScore}/100</strong>
                  </span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
                  <Stat label="Verified" value={snap.verification.verified24h} />
                  <Stat label="Failed" value={snap.verification.failed24h} />
                  <Stat label="Waiting backlog" value={snap.verification.waitingBacklog} />
                  <Stat
                    label="Success rate %"
                    value={snap.verification.successRate24h == null ? 0 : Math.round(snap.verification.successRate24h * 100)}
                  />
                  <Stat label="Avg score" value={snap.verification.avgScore24h ?? 0} />
                  <Stat label="Avg verify (min)" value={snap.verification.avgVerificationMinutes ?? 0} />
                  <Stat label="Auto recoveries" value={snap.verification.autoRecoveries24h} />
                  <Stat
                    label="Recovery %"
                    value={snap.verification.recoverySuccessRate24h == null ? 0 : Math.round(snap.verification.recoverySuccessRate24h * 100)}
                  />
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <Row label="Last verified" value={fmt(snap.verification.lastVerifiedAt)} />
                  <Row label="Last failed" value={fmt(snap.verification.lastFailedAt)} />
                </div>
                {snap.verification.topFailureCauses.length > 0 && (
                  <div className="mt-3 text-sm">
                    <div className="font-medium mb-1">Top failure causes</div>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {snap.verification.topFailureCauses.map((c) => (
                        <li key={c.reason}>
                          <code>{c.reason}</code> — {c.count}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Row
                label="Pinterest token"
                value={
                  snap.tokenStatus?.connected
                    ? `🟢 connected · expires ${fmt(snap.tokenStatus.expiresAt)} (${snap.tokenStatus.minutesUntilExpiry ?? "—"} min)`
                    : "🔴 disconnected"
                }
              />
              <Row
                label="Daily publish rate"
                value={`${snap.publishedToday} today`}
              />
            </div>
            {snap.cronJobs && snap.cronJobs.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">Critical cron freshness</h3>
                <div className="space-y-1 text-xs">
                  {snap.cronJobs.map((j) => (
                    <div key={j.name} className="flex justify-between border-b py-1 gap-2 flex-wrap">
                      <span className="font-mono">{j.ok ? "🟢" : "🔴"} {j.name}</span>
                      <span className="text-muted-foreground">
                        last run {j.minutesSinceRun ?? "—"} min ago
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {snap && snap.incidents.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold mb-2">Active conditions</h2>
          <ul className="space-y-1 text-sm">
            {snap.incidents.map((i, n) => (
              <li key={n} className="flex justify-between gap-2 border-b py-1">
                <span className="font-mono">{i.condition}</span>
                <span className="text-muted-foreground">{i.severity}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {snap?.content && (
        <Card className="p-5">
          <h2 className="font-semibold mb-2">Content Quality Engine</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Avg content score" value={snap.content.avgContentScore ?? "—"} />
            <Stat label="Diversity (last 100)" value={`${Math.round(snap.content.contentDiversityScore * 100)}%`} />
            <Stat label="Quality gate rejections (24h)" value={snap.content.qualityGateRejections24h} />
            <Stat label="Expected weekly reach" value={snap.content.expectedWeeklyReach.toLocaleString()} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-semibold mb-1">Top performing boards</h3>
              {snap.content.topBoards.length === 0 ? (
                <p className="text-xs text-muted-foreground">No published pins yet.</p>
              ) : (
                <ul className="space-y-1">
                  {snap.content.topBoards.map((b) => (
                    <li key={b.board_name} className="flex justify-between border-b py-1">
                      <span className="font-mono">{b.board_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {b.posted} pins · ctr {(b.ctr * 100).toFixed(2)}% · save {(b.saveRate * 100).toFixed(2)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="font-semibold mb-1">Board performance ranking</h3>
              {snap.content.boardRanking.length === 0 ? (
                <p className="text-xs text-muted-foreground">No 30d rollup yet — using cold-start keyword matching.</p>
              ) : (
                <ul className="space-y-1">
                  {snap.content.boardRanking.slice(0, 8).map((b) => (
                    <li key={b.board_name} className="flex justify-between border-b py-1">
                      <span className="font-mono">{b.board_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {b.score.toFixed(2)} · {b.classification ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="font-semibold mb-1">Top headlines</h3>
              {snap.content.topHeadlines.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1">
                  {snap.content.topHeadlines.map((h, i) => (
                    <li key={i} className="flex justify-between gap-2 border-b py-1">
                      <span className="truncate">{h.headline}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {h.count}× · {h.avgScore ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="font-semibold mb-1">Top hooks · CTAs</h3>
              <div className="grid grid-cols-2 gap-2">
                <ul>
                  {snap.content.topHooks.map((h, i) => (
                    <li key={i} className="flex justify-between border-b py-1 text-xs">
                      <span className="truncate">{h.hook}</span>
                      <span className="text-muted-foreground">{h.count}</span>
                    </li>
                  ))}
                </ul>
                <ul>
                  {snap.content.topCTAs.map((c, i) => (
                    <li key={i} className="flex justify-between border-b py-1 text-xs">
                      <span className="truncate">{c.cta}</span>
                      <span className="text-muted-foreground">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          {snap.content.worstContent.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold mb-1 text-sm">Worst performing content</h3>
              <ul className="space-y-1 text-xs">
                {snap.content.worstContent.map((w, i) => (
                  <li key={i} className="flex justify-between border-b py-1">
                    <span className="font-mono truncate">{w.pin_id}</span>
                    <span className="text-muted-foreground">{w.reason} · {w.score ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {snap.content.creativeEvolutionTrend.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold mb-1 text-sm">Creative evolution (14d)</h3>
              <div className="flex items-end gap-1 h-20">
                {snap.content.creativeEvolutionTrend.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center" title={`${d.day} · avg ${d.avgScore} · ${d.published} pub`}>
                    <div
                      className="w-full bg-emerald-400/70 rounded-t"
                      style={{ height: `${Math.min(100, d.avgScore)}%` }}
                    />
                    <span className="text-[10px] text-muted-foreground mt-1">{d.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Pinterest Growth AI</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={growthLoading} onClick={() => refreshGrowth(false)}>
              <RefreshCw className={`h-4 w-4 mr-1 ${growthLoading ? "animate-spin" : ""}`} /> Snapshot
            </Button>
            <Button size="sm" disabled={growthLoading} onClick={() => refreshGrowth(true)}>
              <Play className="h-4 w-4 mr-1" /> Run optimization
            </Button>
          </div>
        </div>
        {!growth ? (
          <p className="text-sm text-muted-foreground">No Growth AI snapshot yet. Click Snapshot.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <Stat label="Avg CTR (30d)" value={`${(growth.baseline.avgCtr * 100).toFixed(2)}%`} />
              <Stat label="Rev / pin (30d)" value={`$${(growth.baseline.avgRevenuePerPin / 100).toFixed(2)}`} />
              <Stat label="WoW clicks" value={`${growth.growthVelocity.weekOverWeekClicksPct >= 0 ? "+" : ""}${growth.growthVelocity.weekOverWeekClicksPct}%`} />
              <Stat label="WoW revenue" value={`${growth.growthVelocity.weekOverWeekRevenuePct >= 0 ? "+" : ""}${growth.growthVelocity.weekOverWeekRevenuePct}%`} />
              <Stat label="Est. weekly organic traffic" value={growth.estimatedWeeklyOrganicTraffic.toLocaleString()} />
              <Stat label="Est. monthly revenue" value={`$${(growth.estimatedMonthlyRevenueCents / 100).toFixed(0)}`} />
              <Stat label="AI confidence" value={`${Math.round(growth.aiConfidence * 100)}%`} />
              <Stat label="Decisions logged" value={growth.decisionsLogged} />
            </div>
            <div className="rounded-md border bg-muted/40 p-3 mb-4 text-sm">
              <span className="font-medium">Next optimization →</span> {growth.nextRecommendedOptimization}
            </div>
            <div className="grid md:grid-cols-3 gap-3 text-xs">
              <div>
                <h3 className="font-semibold mb-1">Top revenue products</h3>
                <ul className="space-y-1">
                  {growth.topRevenueProducts.slice(0, 5).map((p: any) => (
                    <li key={p.product_slug} className="flex justify-between border-b py-1">
                      <span className="truncate">{p.product_slug}</span>
                      <span>${(p.revenue_cents / 100).toFixed(0)} · {p.purchases}p</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Top organic products</h3>
                <ul className="space-y-1">
                  {growth.topOrganicProducts.slice(0, 5).map((p: any) => (
                    <li key={p.product_slug} className="flex justify-between border-b py-1">
                      <span className="truncate">{p.product_slug}</span>
                      <span>{p.saves}s · {p.clicks}c</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Top CTR products</h3>
                <ul className="space-y-1">
                  {growth.topCtrProducts.slice(0, 5).map((p: any) => (
                    <li key={p.product_slug} className="flex justify-between border-b py-1">
                      <span className="truncate">{p.product_slug}</span>
                      <span>{(p.ctr * 100).toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Top boards (revenue)</h3>
                <ul className="space-y-1">
                  {growth.topBoards.slice(0, 5).map((b: any) => (
                    <li key={b.board_name} className="flex justify-between border-b py-1">
                      <span className="truncate">{b.board_name}</span>
                      <span>${(b.revenue_cents / 100).toFixed(0)} · {(b.ctr * 100).toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Best UTC hours</h3>
                <ul className="space-y-1">
                  {growth.bestHoursUtc.slice(0, 5).map((h: any) => (
                    <li key={h.hour} className="flex justify-between border-b py-1">
                      <span>{String(h.hour).padStart(2, "0")}:00</span>
                      <span>{(h.ctr * 100).toFixed(2)}% · {h.samples}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Best weekdays</h3>
                <ul className="space-y-1">
                  {growth.bestWeekdays.slice(0, 7).map((d: any) => (
                    <li key={d.weekday} className="flex justify-between border-b py-1">
                      <span>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.weekday]}</span>
                      <span>{(d.ctr * 100).toFixed(2)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Top headlines</h3>
                <ul className="space-y-1">
                  {growth.topHeadlines.slice(0, 5).map((h: any, i: number) => (
                    <li key={i} className="flex justify-between border-b py-1">
                      <span className="truncate">{h.headline}</span>
                      <span>{h.avgScore}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Top hooks</h3>
                <ul className="space-y-1">
                  {growth.topHooks.slice(0, 5).map((h: any, i: number) => (
                    <li key={i} className="flex justify-between border-b py-1">
                      <span className="truncate">{h.hook}</span>
                      <span>{h.avgScore}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Top CTAs</h3>
                <ul className="space-y-1">
                  {growth.topCTAs.slice(0, 5).map((c: any, i: number) => (
                    <li key={i} className="flex justify-between border-b py-1">
                      <span className="truncate">{c.cta}</span>
                      <span>{c.avgScore}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {growth.winnerMultiplier.product_slug && (
              <div className="mt-3 text-xs text-muted-foreground">
                Winner multiplier candidate: <span className="font-mono">{growth.winnerMultiplier.product_slug}</span> · requested {growth.winnerMultiplier.variants_requested} variants · triggered: {String(growth.winnerMultiplier.triggered)}
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Pinterest Experiment Engine</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={expLoading} onClick={() => refreshExperiments(false)}>
              <RefreshCw className={`h-4 w-4 mr-1 ${expLoading ? "animate-spin" : ""}`} /> Snapshot
            </Button>
            <Button size="sm" disabled={expLoading} onClick={() => refreshExperiments(true)}>
              <Play className="h-4 w-4 mr-1" /> Run cycle
            </Button>
          </div>
        </div>
        {!exp ? (
          <p className="text-sm text-muted-foreground">No experiment snapshot yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <Stat label="Active experiments" value={exp.active} />
              <Stat label="Promoted winners" value={exp.winners.length} />
              <Stat label="Retired losers" value={exp.losers.length} />
              <Stat label="Avg lift" value={`${exp.avgLiftPct}%`} />
              <Stat label="Confidence target" value={`${exp.avgConfidencePct}%`} />
              <Stat label="Min sample / arm" value={exp.thresholds.minImpressionsPerArm} />
              <Stat label="p-value cutoff" value={exp.thresholds.pValueThreshold} />
              <Stat label="Expected annual impact" value={`${exp.expectedAnnualImpactPct}%`} />
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div>
                <h3 className="font-semibold mb-1">Winning variants</h3>
                {exp.winners.length === 0 ? (
                  <p className="text-muted-foreground">No winners yet — gathering evidence.</p>
                ) : (
                  <ul className="space-y-1">
                    {exp.winners.slice(0, 8).map((w: any) => (
                      <li key={w.experiment_id} className="flex justify-between border-b py-1 gap-2">
                        <span className="truncate">{w.headline ?? w.pin_id}</span>
                        <span>{(w.ctr * 100).toFixed(2)}% · {w.impressions.toLocaleString()} imp</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="font-semibold mb-1">Retired losers</h3>
                {exp.losers.length === 0 ? (
                  <p className="text-muted-foreground">No losers retired yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {exp.losers.slice(0, 8).map((l: any) => (
                      <li key={l.experiment_id} className="flex justify-between border-b py-1 gap-2">
                        <span className="truncate">{l.headline ?? l.pin_id}</span>
                        <span>{(l.ctr * 100).toFixed(2)}% · {l.impressions.toLocaleString()} imp</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {exp.history.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold mb-1 text-xs">Experiment history</h3>
                <ul className="space-y-1 text-xs">
                  {exp.history.slice(0, 10).map((h: any, i: number) => (
                    <li key={i} className="border-b py-1">
                      <div className="flex justify-between gap-2">
                        <span className="truncate">{h.rationale}</span>
                        <span className="text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Creative Evolution Engine — Creative Genome</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={evoLoading} onClick={() => refreshEvolution(false)}>
              <RefreshCw className={`h-4 w-4 mr-1 ${evoLoading ? "animate-spin" : ""}`} /> Snapshot
            </Button>
            <Button size="sm" disabled={evoLoading} onClick={() => refreshEvolution(true)}>
              Evolve now
            </Button>
          </div>
        </div>
        {!evo ? (
          <p className="text-sm text-muted-foreground">No evolution snapshot yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs mb-3">
              <div><div className="text-muted-foreground">Evaluated pins</div><div className="text-lg font-semibold">{evo.evaluated_pins}</div></div>
              <div><div className="text-muted-foreground">Baseline score</div><div className="text-lg font-semibold">{Number(evo.baseline_score).toFixed(2)}</div></div>
              <div><div className="text-muted-foreground">Expected CTR lift</div><div className="text-lg font-semibold text-green-600">+{Number(evo.expected_ctr_lift_pct).toFixed(1)}%</div></div>
              <div><div className="text-muted-foreground">Exploitation</div><div className="text-lg font-semibold">{Math.round(evo.exploitation_ratio * 100)}%</div></div>
              <div><div className="text-muted-foreground">Exploration</div><div className="text-lg font-semibold">{Math.round(evo.exploration_ratio * 100)}%</div></div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-semibold mb-1">Top winning DNA</h3>
                <ul className="text-xs space-y-1">
                  {(evo.winners ?? []).slice(0, 10).map((w: any, i: number) => (
                    <li key={i} className="flex justify-between gap-2 border-b py-1">
                      <span className="truncate"><span className="text-muted-foreground">{w.dimension}=</span>{w.value}</span>
                      <span className="text-green-600 font-mono">+{w.lift_pct}% · n={w.sample_size} · c={w.confidence}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold mb-1">Decaying / losing traits</h3>
                <ul className="text-xs space-y-1">
                  {(evo.decaying ?? evo.losers ?? []).slice(0, 10).map((l: any, i: number) => (
                    <li key={i} className="flex justify-between gap-2 border-b py-1">
                      <span className="truncate"><span className="text-muted-foreground">{l.dimension}=</span>{l.value}</span>
                      <span className="text-red-600 font-mono">{l.lift_pct}% · n={l.sample_size}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-2">Recent incidents (legacy)</h2>
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incidents logged yet.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {incidents.map((i) => (
              <div key={i.id} className="border rounded p-2">
                <div className="flex justify-between flex-wrap gap-2">
                  <span className="font-mono">{i.condition}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(i.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-2 mt-1 text-xs flex-wrap">
                  <Badge variant="outline">{i.severity}</Badge>
                  {i.sms_alert_sent && <Badge className="bg-blue-100 text-blue-800">SMS sent</Badge>}
                  {i.recovery_attempted && <Badge className="bg-emerald-100 text-emerald-800">Recovery attempted</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  );
}

function OAuthRecoveryPanel({
  conn, reconnecting, onReconnect, onRunRecovery, recovery, recoveryRunning,
}: {
  conn: any;
  reconnecting: boolean;
  onReconnect: () => void;
  onRunRecovery: () => void;
  recovery: any;
  recoveryRunning: boolean;
}) {
  return _OAuthRecoveryPanel({ conn, reconnecting, onReconnect, onRunRecovery, recovery, recoveryRunning });
}

const SCOPE_CONSENT_GUIDE: Record<string, { label: string; where: string; clicks: string[] }> = {
  "boards:read": { label: "Read boards", where: "OAuth consent screen", clicks: ["Check 'See your boards and their content'"] },
  "boards:write": { label: "Manage boards", where: "OAuth consent screen", clicks: ["Check 'Create, update, and delete your boards'"] },
  "pins:read": { label: "Read Pins", where: "OAuth consent screen", clicks: ["Check 'See your Pins'"] },
  "pins:write": { label: "Publish Pins", where: "OAuth consent screen", clicks: ["Check 'Create, update, and delete your Pins'"] },
  "user_accounts:read": { label: "Read account", where: "OAuth consent screen", clicks: ["Check 'See your account information'"] },
  "user_accounts:write": { label: "Update account", where: "OAuth consent screen", clicks: ["Check 'Update your account information' (if shown)"] },
  "boards:read_secret": { label: "Read secret boards", where: "OAuth consent screen", clicks: ["Check 'See your secret boards'"] },
  "pins:read_secret": { label: "Read secret Pins", where: "OAuth consent screen", clicks: ["Check 'See your secret Pins'"] },
  "catalogs:read": {
    label: "Read catalogs (Merchant Center)",
    where: "Pinterest Business Hub → Catalogs",
    clicks: [
      "Open business.pinterest.com → Catalogs",
      "If no catalog exists, click 'Get started' and add a data source",
      "Return to the OAuth consent screen and check 'See your product catalogs'",
    ],
  },
  "catalogs:write": {
    label: "Manage catalogs",
    where: "OAuth consent + Business Hub",
    clicks: [
      "On the OAuth consent screen, check 'Create and update product catalogs'",
      "After redirect: in Business Hub → Catalogs, claim domain getpawsy.pet",
    ],
  },
  "ads:read": {
    label: "Read Ads",
    where: "OAuth consent + Ads Manager",
    clicks: [
      "Ensure you are signed in to a Pinterest Business account that has an Ad Account (ads.pinterest.com)",
      "If no Ad Account exists, click 'Create ad account' in Ads Manager first",
      "On the OAuth consent screen, check 'See your ads data'",
    ],
  },
  "ads:write": {
    label: "Manage Ads",
    where: "OAuth consent screen",
    clicks: [
      "Check 'Create and update ad campaigns'",
      "Confirm the listed Ad Account matches your GetPawsy Business account",
    ],
  },
  "billing:read": { label: "Read billing", where: "OAuth consent screen", clicks: ["Check 'See your billing information' (if shown)"] },
  "biz_access:read": { label: "Business access", where: "OAuth consent screen", clicks: ["Check 'See members of your business account'"] },
  "biz_access:write": { label: "Manage business access", where: "OAuth consent screen", clicks: ["Check 'Manage members of your business account'"] },
};

function ScopeConsentChecklist({ missing }: { missing: string[] }) {
  return (
    <div className="mt-4 rounded-lg border bg-amber-50/50 p-3">
      <h3 className="text-sm font-semibold mb-1">What to click in Pinterest for each missing scope</h3>
      <p className="text-xs text-muted-foreground mb-3">
        After clicking <strong>Reconnect with Full Pinterest Access</strong>, Pinterest will show a permissions screen.
        Check every box below. If a permission isn't visible, the prerequisite (catalog / ad account) is missing — follow the linked step first.
      </p>
      <ol className="space-y-3">
        {missing.map((scope, i) => {
          const g = SCOPE_CONSENT_GUIDE[scope] ?? {
            label: scope,
            where: "OAuth consent screen",
            clicks: [`Check the permission labelled '${scope}'`],
          };
          return (
            <li key={scope} className="flex gap-3">
              <div className="flex-none mt-0.5 h-5 w-5 rounded-full bg-amber-200 text-amber-900 text-xs font-semibold flex items-center justify-center">
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">
                  <span className="font-mono text-xs bg-white border rounded px-1.5 py-0.5 mr-2">{scope}</span>
                  {g.label}
                </div>
                <div className="text-xs text-muted-foreground mb-1">Where: {g.where}</div>
                <ul className="text-xs space-y-1">
                  {g.clicks.map((c, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <span className="text-amber-700">▸</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 text-xs text-muted-foreground border-t pt-2">
        Tip: if Pinterest skips the consent screen (because you previously authorized GetPawsy), open
        {" "}
        <a href="https://www.pinterest.com/settings/apps/" target="_blank" rel="noopener noreferrer" className="text-primary underline">
          pinterest.com/settings/apps
        </a>
        , revoke GetPawsy, then click Reconnect again to force a fresh permissions prompt.
      </div>
    </div>
  );
}

function _OAuthRecoveryPanel({
  conn, reconnecting, onReconnect, onRunRecovery, recovery, recoveryRunning,
}: {
  conn: any;
  reconnecting: boolean;
  onReconnect: () => void;
  onRunRecovery: () => void;
  recovery: any;
  recoveryRunning: boolean;
}) {
  const granted: string[] = typeof conn?.scopes === "string"
    ? conn.scopes.split(/[\s,]+/).map((s: string) => s.trim().toLowerCase()).filter(Boolean)
    : Array.isArray(conn?.scopes) ? conn.scopes : [];
  const missing = REQUIRED_PINTEREST_SCOPES.filter((s) => !granted.includes(s));
  const fullAccess = missing.length === 0;
  return (
    <Card className="p-5 border-2 border-amber-300/60">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-amber-600" />
          <h2 className="font-semibold">Pinterest OAuth Final Recovery</h2>
          <Badge className={fullAccess ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
            Full Access: {fullAccess ? "Yes" : "No"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onRunRecovery} disabled={recoveryRunning}>
            <RefreshCw className={`h-4 w-4 mr-1 ${recoveryRunning ? "animate-spin" : ""}`} />
            Re-run recovery
          </Button>
          <Button size="sm" onClick={onReconnect} disabled={reconnecting}>
            <KeyRound className="h-4 w-4 mr-1" />
            Reconnect with Full Pinterest Access
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Row label="Account" value={conn?.account_name ?? "not connected"} />
        <Row label="Token expires" value={conn?.token_expires_at ? new Date(conn.token_expires_at).toLocaleString() : "—"} />
        <Row label="/user_account" value={conn?.last_account_status ? String(conn.last_account_status) : "—"} />
        <Row label="/boards" value={`${conn?.last_boards_status ?? "—"} (${conn?.board_count ?? 0} boards)`} />
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold mb-2">Required scopes</h3>
        <div className="flex flex-wrap gap-1.5">
          {REQUIRED_PINTEREST_SCOPES.map((s) => {
            const ok = granted.includes(s);
            return (
              <Badge key={s} className={ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                {ok ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                {s}
              </Badge>
            );
          })}
        </div>
        {missing.length > 0 && (
          <p className="text-xs text-red-700 mt-2">
            Missing: <span className="font-mono">{missing.join(", ")}</span>. Click <strong>Reconnect with Full Pinterest Access</strong>
            {" "}to start a fresh authorization and grant every supported Pinterest Business scope.
          </p>
        )}
      </div>

      {missing.length > 0 && (
        <ScopeConsentChecklist missing={missing} />
      )}

      {recovery && (
        <div className="mt-4 border-t pt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={recovery.verdict === "GREEN" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
              Final verdict: {recovery.verdict}
            </Badge>
            <Badge variant="outline">Trust: {recovery.trust_score ?? "—"}</Badge>
            <Badge variant="outline">Guardian: {recovery.guardian?.color ?? "—"}</Badge>
            {recovery.publish_unlocked && (
              <Badge className="bg-emerald-600 text-white">Publishing UNLOCKED — Week 1 ramp (3/day)</Badge>
            )}
          </div>
          {recovery.blockers?.length > 0 && (
            <div className="text-xs text-red-700">
              <strong>Remaining blocker{recovery.blockers.length > 1 ? "s" : ""}:</strong> {recovery.blockers.join("; ")}
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">View full report JSON</summary>
            <pre className="mt-2 p-2 bg-muted rounded overflow-auto max-h-80">{JSON.stringify(recovery, null, 2)}</pre>
          </details>
        </div>
      )}
    </Card>
  );
}