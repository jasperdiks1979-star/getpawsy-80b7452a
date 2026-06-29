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
  const [inspiration, setInspiration] = useState<{
    sampleSize: number;
    avgInspiration: number | null;
    avgAiRisk: number | null;
    avgAxes: Record<string, number>;
    topRooms: Array<{ value: string; avg: number; n: number }>;
    topStories: Array<{ value: string; avg: number; n: number }>;
    recent: Array<{ id: string; inspiration: number; ai_risk: number; image_url: string | null; room: string | null; story: string | null }>;
  } | null>(null);

  async function loadInspiration() {
    const { data } = await (supabase as any)
      .from("pinterest_pin_queue")
      .select("id, pin_image_url, meta, created_at")
      .not("meta->intelligence->master", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    const rows = (data ?? []) as any[];
    if (rows.length === 0) {
      setInspiration({ sampleSize: 0, avgInspiration: null, avgAiRisk: null, avgAxes: {}, topRooms: [], topStories: [], recent: [] });
      return;
    }
    const axesKeys = ["save_likelihood","interior_quality","emotional_impact","composition","storytelling","visual_uniqueness","lifestyle_realism"];
    const axesAgg: Record<string, { sum: number; n: number }> = {};
    const roomAgg: Record<string, { sum: number; n: number }> = {};
    const storyAgg: Record<string, { sum: number; n: number }> = {};
    let insSum = 0, insN = 0, riskSum = 0, riskN = 0;
    const recent: any[] = [];
    for (const r of rows) {
      const m = r?.meta?.intelligence?.master;
      const ins = m?.inspiration;
      if (!ins) continue;
      const total = Number(ins.total ?? 0);
      const risk = Number(ins.axes?.ai_look_risk ?? 0);
      insSum += total; insN++;
      riskSum += risk; riskN++;
      for (const k of axesKeys) {
        const v = Number(ins.axes?.[k] ?? 0);
        axesAgg[k] = axesAgg[k] ?? { sum: 0, n: 0 };
        axesAgg[k].sum += v; axesAgg[k].n++;
      }
      const room = m?.dims?.room ?? null;
      const story = m?.dims?.story ?? null;
      if (room) { roomAgg[room] = roomAgg[room] ?? { sum: 0, n: 0 }; roomAgg[room].sum += total; roomAgg[room].n++; }
      if (story) { storyAgg[story] = storyAgg[story] ?? { sum: 0, n: 0 }; storyAgg[story].sum += total; storyAgg[story].n++; }
      if (recent.length < 8) {
        recent.push({ id: r.id, inspiration: total, ai_risk: risk, image_url: r.pin_image_url, room, story });
      }
    }
    const avgAxes: Record<string, number> = {};
    for (const [k, v] of Object.entries(axesAgg)) avgAxes[k] = Math.round(v.sum / Math.max(1, v.n));
    const rank = (agg: Record<string, { sum: number; n: number }>) =>
      Object.entries(agg)
        .filter(([_, v]) => v.n >= 2)
        .map(([value, v]) => ({ value, avg: Math.round(v.sum / v.n), n: v.n }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 5);
    setInspiration({
      sampleSize: insN,
      avgInspiration: insN ? Math.round(insSum / insN) : null,
      avgAiRisk: riskN ? Math.round(riskSum / riskN) : null,
      avgAxes,
      topRooms: rank(roomAgg),
      topStories: rank(storyAgg),
      recent,
    });
  }

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
    loadInspiration();
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
      loadInspiration();
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Master Creative Director — Pinterest Inspiration Score</h2>
          <Button size="sm" variant="outline" onClick={() => loadInspiration()}>
            <RefreshCw className="h-4 w-4 mr-1" />Refresh
          </Button>
        </div>
        {!inspiration ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : inspiration.sampleSize === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Inspiration-scored pins yet. Run the Creative Factory to start populating Master Creative Director telemetry.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Sample (recent)</div>
                <div className="text-xl font-semibold">{inspiration.sampleSize}</div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Avg Inspiration</div>
                <div className="text-xl font-semibold">
                  {inspiration.avgInspiration ?? "—"}
                  <span className="text-xs text-muted-foreground"> /100</span>
                </div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Avg AI-look risk</div>
                <div className={`text-xl font-semibold ${
                  (inspiration.avgAiRisk ?? 0) >= 50 ? "text-red-600" : "text-emerald-700"
                }`}>
                  {inspiration.avgAiRisk ?? "—"}
                  <span className="text-xs text-muted-foreground"> (lower=better)</span>
                </div>
              </div>
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Floor (publish)</div>
                <div className="text-xl font-semibold">78</div>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold mb-1">Average axis scores</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {Object.entries(inspiration.avgAxes).map(([k, v]) => (
                  <div key={k} className="flex justify-between border rounded px-2 py-1">
                    <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-semibold mb-1">Top performing rooms (by Inspiration)</h3>
                <ul className="text-xs space-y-1">
                  {inspiration.topRooms.map((r) => (
                    <li key={r.value} className="flex justify-between gap-2 border-b py-1">
                      <span className="truncate">{r.value}</span>
                      <span className="font-mono">{r.avg} · n={r.n}</span>
                    </li>
                  ))}
                  {inspiration.topRooms.length === 0 && (
                    <li className="text-muted-foreground">Need ≥2 samples per room.</li>
                  )}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold mb-1">Top performing stories</h3>
                <ul className="text-xs space-y-1">
                  {inspiration.topStories.map((r) => (
                    <li key={r.value} className="flex justify-between gap-2 border-b py-1">
                      <span className="truncate">{r.value}</span>
                      <span className="font-mono">{r.avg} · n={r.n}</span>
                    </li>
                  ))}
                  {inspiration.topStories.length === 0 && (
                    <li className="text-muted-foreground">Need ≥2 samples per story.</li>
                  )}
                </ul>
              </div>
            </div>
            {inspiration.recent.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold mb-1">Latest scored pins</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {inspiration.recent.map((p) => (
                    <div key={p.id} className="border rounded overflow-hidden">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-full h-32 object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-32 bg-muted" />
                      )}
                      <div className="p-2 text-[10px] space-y-0.5">
                        <div className="flex justify-between font-mono">
                          <span>Insp {p.inspiration}</span>
                          <span className={p.ai_risk >= 50 ? "text-red-600" : "text-emerald-700"}>AI {p.ai_risk}</span>
                        </div>
                        {p.story && <div className="truncate text-muted-foreground">{p.story}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-2">Recent incidents</h2>
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
      <ExecutiveCouncilPanel />
      <ProductRelevanceEnginePanel />
      <PcieV2Panel />
      <PinterestPsychologyEnginePanel />
      <TasteEnginePanel />
      <GrowthDirectorPanel />
      <CollectiveIntelligencePanel />
      <EvidenceGovernorPanel />
      <AdaptiveLearningGovernorPanel />
      <ExplainableAIPanel />
      <MarketIntelligencePanel />
      <UsGeoIntelligencePanel />
    </div>
  );
}

function TasteEnginePanel() {
/* PRE panel injected above TasteEnginePanel */
  const [signals, setSignals] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    const [s, c, l] = await Promise.all([
      (supabase as any).from("pinterest_taste_signals")
        .select("dimension,value,lift_score,velocity_7d,momentum_30d,confidence,sample_n,status,expected_lifetime_days,computed_at")
        .order("lift_score", { ascending: false }).limit(50),
      (supabase as any).from("pinterest_taste_clusters")
        .select("cluster_key,label,weight,momentum,sample_n,status,last_seen").order("weight", { ascending: false }),
      (supabase as any).from("pinterest_evolution_log")
        .select("created_at,decision_type,rationale,metrics,new_value")
        .in("decision_type", ["taste_engine_run", "taste_engine_seed"])
        .order("created_at", { ascending: false }).limit(5),
    ]);
    setSignals(s.data ?? []);
    setClusters(c.data ?? []);
    setRuns(l.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const rising = signals.filter(s => s.status === "rising").slice(0, 10);
  const declining = signals.filter(s => s.status === "declining").slice(0, 10);
  const lastRun = runs[0];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Pinterest Taste Engine V1</h2>
        <button onClick={load} className="text-xs underline text-muted-foreground">{loading ? "…" : "refresh"}</button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Autonomous trend discovery from real Pinterest production data. Creative Factory + Evolution Engine consume these signals automatically.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Active signals" value={signals.length} />
        <Stat label="Rising" value={rising.length} />
        <Stat label="Declining" value={declining.length} />
        <Stat label="Visual DNA clusters" value={clusters.length} />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <h3 className="text-sm font-medium mb-2">Fastest rising taste signals</h3>
          <div className="space-y-1 text-xs">
            {rising.length === 0 && <p className="text-muted-foreground">No rising signals yet.</p>}
            {rising.map((s) => (
              <div key={`${s.dimension}-${s.value}`} className="flex justify-between border rounded px-2 py-1">
                <span className="font-mono truncate">{s.dimension} · {s.value}</span>
                <span className="text-emerald-600">+{(Number(s.lift_score) * 100).toFixed(0)}% · n={s.sample_n}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium mb-2">Declining taste signals</h3>
          <div className="space-y-1 text-xs">
            {declining.length === 0 && <p className="text-muted-foreground">No declining signals.</p>}
            {declining.map((s) => (
              <div key={`${s.dimension}-${s.value}`} className="flex justify-between border rounded px-2 py-1">
                <span className="font-mono truncate">{s.dimension} · {s.value}</span>
                <span className="text-rose-600">{(Number(s.lift_score) * 100).toFixed(0)}% · n={s.sample_n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-medium mb-2">Visual DNA clusters</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
          {clusters.map((c) => (
            <div key={c.cluster_key} className="border rounded p-2">
              <div className="flex justify-between">
                <span className="font-medium">{c.label}</span>
                <Badge variant="outline" className={
                  c.status === "rising" ? "text-emerald-700 border-emerald-300" :
                  c.status === "declining" ? "text-rose-700 border-rose-300" : ""
                }>{c.status}</Badge>
              </div>
              <div className="text-muted-foreground mt-1">
                weight {Number(c.weight).toFixed(2)} · momentum {(Number(c.momentum) * 100).toFixed(0)}% · n={c.sample_n}
              </div>
            </div>
          ))}
        </div>
      </div>

      {lastRun && (
        <div className="mt-5 text-xs text-muted-foreground">
          Last run: {new Date(lastRun.created_at).toLocaleString()} · {lastRun.rationale}
        </div>
      )}
    </Card>
  );
}

function CollectiveIntelligencePanel() {
  const [run, setRun] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: logs }, { data: sigs }] = await Promise.all([
      (supabase as any).from("pinterest_evolution_log")
        .select("created_at,rationale,metrics,new_value")
        .eq("decision_type", "collective_intelligence_run")
        .order("created_at", { ascending: false }).limit(1),
      (supabase as any).from("pinterest_taste_signals")
        .select("dimension,value,lift_score,confidence,sample_n,status,computed_at")
        .like("dimension", "ci_%")
        .order("lift_score", { ascending: false }).limit(40),
    ]);
    setRun(logs?.[0] ?? null);
    setSignals(sigs ?? []);
  }
  useEffect(() => { load(); }, []);

  async function run_now(dry: boolean) {
    setBusy(true);
    try {
      const { error } = await (supabase as any).functions.invoke(
        "pinterest-collective-intelligence" + (dry ? "?dry_run=1" : ""),
        { body: {} },
      );
      if (error) throw error;
      await load();
    } finally { setBusy(false); }
  }

  const winners = signals.filter((s) => s.status === "rising").slice(0, 10);
  const losers = signals.filter((s) => s.status === "declining").slice(0, 10);
  const m = run?.metrics ?? {};

  return (
    <Card className="p-5 mt-6 border-2 border-violet-300/60">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">Collective Intelligence Layer</h2>
          <p className="text-xs text-muted-foreground">One learning loop across Creative Factory · Evolution · Taste · Health. Every publish improves the system.</p>
        </div>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => run_now(true)} className="text-xs px-2 py-1 rounded border">Dry run</button>
          <button disabled={busy} onClick={() => run_now(false)} className="text-xs px-2 py-1 rounded bg-violet-600 text-white">Run cycle</button>
        </div>
      </div>
      {run ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
          <CiStat label="Joinable pins" value={m.joinable_pins ?? 0} />
          <CiStat label="DNA attributes" value={m.distinct_attributes ?? 0} />
          <CiStat label="Winners" value={m.winners ?? 0} />
          <CiStat label="Losers" value={m.losers ?? 0} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">No cycles yet. Click "Run cycle".</p>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-2 text-emerald-700">Winning DNA</h3>
          <ul className="text-xs space-y-1">
            {winners.length === 0 && <li className="text-muted-foreground">No statistically significant winners yet.</li>}
            {winners.map((s, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-border/40 py-1">
                <span className="truncate"><span className="text-muted-foreground">{s.dimension.replace(/^ci_/, "")}</span> · {s.value}</span>
                <span className="tabular-nums">{Number(s.lift_score).toFixed(2)}× · n={s.sample_n} · {Math.round(Number(s.confidence) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2 text-rose-700">Losing DNA</h3>
          <ul className="text-xs space-y-1">
            {losers.length === 0 && <li className="text-muted-foreground">No statistically significant losers yet.</li>}
            {losers.map((s, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-border/40 py-1">
                <span className="truncate"><span className="text-muted-foreground">{s.dimension.replace(/^ci_/, "")}</span> · {s.value}</span>
                <span className="tabular-nums">{Number(s.lift_score).toFixed(2)}× · n={s.sample_n} · {Math.round(Number(s.confidence) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function CiStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-border/60 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
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

function GrowthDirectorPanel() {
  const [snap, setSnap] = useState<any>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [s, d, r] = await Promise.all([
      (supabase as any).from("pinterest_growth_director_snapshots")
        .select("*").order("computed_at", { ascending: false }).limit(1).maybeSingle(),
      (supabase as any).from("pinterest_growth_director_decisions")
        .select("category,title,rationale,expected_impact_score,expected_revenue_cents_30d,confidence,effort,target_kind,target_ref,created_at")
        .order("created_at", { ascending: false }).limit(40),
      (supabase as any).from("pinterest_growth_director_runs")
        .select("started_at,finished_at,status,products_scored,boards_evaluated,opportunities_found,decisions_emitted,summary")
        .order("started_at", { ascending: false }).limit(7),
    ]);
    setSnap(s.data ?? null);
    setDecisions(d.data ?? []);
    setRuns(r.data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function run() {
    setBusy(true);
    try {
      const { error } = await (supabase as any).functions.invoke("pinterest-growth-director", { body: {} });
      if (error) throw error;
      await load();
    } finally { setBusy(false); }
  }

  const kpis = snap?.account_kpis ?? {};
  const outlook = snap?.outlook_30d ?? {};
  const top = (snap?.product_priorities ?? []).slice(0, 10);
  const boards = (snap?.board_allocations ?? []).slice(0, 8);
  const bn = snap?.bottlenecks ?? [];
  const opps = (snap?.opportunities ?? []).slice(0, 10);

  return (
    <Card className="p-4 mt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">Pinterest Growth Director</h2>
          <p className="text-xs text-muted-foreground">Holistic account-wide optimization brain · runs daily 04:45 UTC</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Confidence {((snap?.confidence ?? 0) * 100).toFixed(0)}%</Badge>
          <Button size="sm" variant="outline" disabled={busy} onClick={run}>{busy ? "Running…" : "Run now"}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs mb-4">
        <div className="p-2 rounded bg-muted"><div className="text-muted-foreground">CTR</div><div className="font-semibold">{((kpis.ctr ?? 0) * 100).toFixed(2)}%</div></div>
        <div className="p-2 rounded bg-muted"><div className="text-muted-foreground">Save rate</div><div className="font-semibold">{((kpis.save_rate ?? 0) * 100).toFixed(2)}%</div></div>
        <div className="p-2 rounded bg-muted"><div className="text-muted-foreground">Click→ATC</div><div className="font-semibold">{((kpis.click_to_atc ?? 0) * 100).toFixed(1)}%</div></div>
        <div className="p-2 rounded bg-muted"><div className="text-muted-foreground">ATC→Buy</div><div className="font-semibold">{((kpis.atc_to_purchase ?? 0) * 100).toFixed(1)}%</div></div>
        <div className="p-2 rounded bg-muted"><div className="text-muted-foreground">Rev 30d</div><div className="font-semibold">${((kpis.revenue_cents ?? 0) / 100).toFixed(0)}</div></div>
        <div className="p-2 rounded bg-muted"><div className="text-muted-foreground">Outlook +30d</div><div className="font-semibold">{outlook.projected_growth_pct ?? 0}%</div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-semibold mb-1">Top bottlenecks</div>
          {bn.length === 0 ? <div className="text-xs text-muted-foreground">None detected.</div> : (
            <ul className="space-y-1 text-xs">
              {bn.map((b: any) => (
                <li key={b.key} className="flex items-center justify-between p-2 rounded bg-muted">
                  <span>{b.label}</span>
                  <Badge variant={b.severity > 0.8 ? "destructive" : "secondary"}>{(b.severity * 100).toFixed(0)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-sm font-semibold mb-1">Top opportunities</div>
          {opps.length === 0 ? <div className="text-xs text-muted-foreground">None.</div> : (
            <ul className="space-y-1 text-xs">
              {opps.map((o: any, i: number) => (
                <li key={i} className="p-2 rounded bg-muted">
                  <div className="font-medium">{o.kind === "trend" ? `${o.dimension}: ${o.value}` : (o.name ?? o.slug ?? o.value)}</div>
                  <div className="text-muted-foreground">{o.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm font-semibold mb-1">Top 10 priority products</div>
        {top.length === 0 ? <div className="text-xs text-muted-foreground">Awaiting funnel data with product_id linkage.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground"><tr><th className="py-1">Product</th><th>Score</th><th>Winner p</th><th>Rev 30d</th><th>Pins</th><th>Margin</th></tr></thead>
              <tbody>
                {top.map((p: any) => (
                  <tr key={p.product_id} className="border-t border-border">
                    <td className="py-1">{p.name}</td>
                    <td><Badge variant="default">{p.priority_score}</Badge></td>
                    <td>{(p.winner_p * 100).toFixed(0)}%</td>
                    <td>${(p.revenue_cents_30d / 100).toFixed(0)}</td>
                    <td>{p.pins_30d}</td>
                    <td>{(p.margin * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="text-sm font-semibold mb-1">Board capital allocation</div>
        {boards.length === 0 ? <div className="text-xs text-muted-foreground">Awaiting board performance data.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground"><tr><th className="py-1">Board</th><th>Rev 30d</th><th>CTR</th><th>Current</th><th>Target</th><th>Action</th></tr></thead>
              <tbody>
                {boards.map((b: any) => (
                  <tr key={b.board_name} className="border-t border-border">
                    <td className="py-1">{b.board_name}</td>
                    <td>${(b.revenue_cents_30d / 100).toFixed(0)}</td>
                    <td>{(b.ctr * 100).toFixed(2)}%</td>
                    <td>{b.current_publish_weight.toFixed(2)}</td>
                    <td>{(b.recommended_share * 100).toFixed(1)}%</td>
                    <td><Badge variant={b.action === "increase" ? "default" : b.action === "decrease" ? "destructive" : "outline"}>{b.action}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="text-sm font-semibold mb-1">Ranked decisions ({decisions.length})</div>
        <div className="space-y-1 max-h-96 overflow-auto">
          {decisions.slice(0, 20).map((d, i) => (
            <div key={i} className="p-2 rounded bg-muted text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{d.title}</div>
                <div className="flex gap-1">
                  <Badge variant="outline">{d.category}</Badge>
                  <Badge>impact {Math.round(d.expected_impact_score)}</Badge>
                  <Badge variant="secondary">conf {Math.round(d.confidence * 100)}%</Badge>
                </div>
              </div>
              <div className="text-muted-foreground mt-1">{d.rationale}</div>
            </div>
          ))}
        </div>
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Recent runs ({runs.length})</summary>
        <ul className="mt-1 space-y-1">
          {runs.map((r, i) => (
            <li key={i} className="text-muted-foreground">
              {new Date(r.started_at).toLocaleString()} · {r.status} · {r.products_scored}p / {r.boards_evaluated}b / {r.opportunities_found}o / {r.decisions_emitted}d
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

function EvidenceGovernorPanel() {
  const [weights, setWeights] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  async function load() {
    setLoading(true);
    const [w, h, r] = await Promise.all([
      (supabase as any).from("pcie2_trait_weights")
        .select("dimension,value,weight,prev_weight,status,sample_n,confidence,ctr_lift,save_lift,rev_lift,purchase_lift,trend,stability,evidence_age_days,last_reason,last_evaluated_at")
        .order("weight", { ascending: false }).limit(400),
      (supabase as any).from("pcie2_trait_weight_history")
        .select("dimension,value,old_weight,new_weight,delta,reason,evidence,created_at")
        .order("created_at", { ascending: false }).limit(40),
      (supabase as any).from("pcie2_evidence_runs")
        .select("started_at,finished_at,traits_evaluated,traits_promoted,traits_demoted,traits_observed,avg_confidence,learning_velocity,summary")
        .order("started_at", { ascending: false }).limit(10),
    ]);
    setWeights(w.data ?? []);
    setHistory(h.data ?? []);
    setRuns(r.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function runNow(dry = false) {
    setRunning(true);
    try {
      await (supabase as any).functions.invoke(`pcie2-evidence-governor${dry ? "?dry_run=1" : ""}`);
      await load();
    } finally { setRunning(false); }
  }

  const active = weights.filter((w) => w.status === "active");
  const observ = weights.filter((w) => w.status === "observational");
  const improving = [...active]
    .filter((w) => Number(w.weight) > Number(w.prev_weight))
    .sort((a, b) => (Number(b.weight) - Number(b.prev_weight)) - (Number(a.weight) - Number(a.prev_weight)))
    .slice(0, 10);
  const declining = [...active]
    .filter((w) => Number(w.weight) < Number(w.prev_weight))
    .sort((a, b) => (Number(a.weight) - Number(a.prev_weight)) - (Number(b.weight) - Number(b.prev_weight)))
    .slice(0, 10);
  const highestConfidence = [...active]
    .sort((a, b) => Number(b.confidence) - Number(a.confidence)).slice(0, 10);
  const newest = [...weights]
    .sort((a, b) => new Date(b.last_evaluated_at).getTime() - new Date(a.last_evaluated_at).getTime())
    .slice(0, 10);
  const awaiting = [...observ]
    .sort((a, b) => Number(b.sample_n) - Number(a.sample_n)).slice(0, 10);
  const lastRun = runs[0];

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold">Creative Evidence Governor</h3>
          <p className="text-xs text-muted-foreground">
            Weight changes are evidence-gated (n≥20 · impressions≥500 · age≥14d · Wilson conf≥0.60 · no single-pin dominance).
            Updates are gradual EMA — never instant flips.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>Refresh</Button>
          <Button size="sm" variant="outline" onClick={() => runNow(true)} disabled={running}>Dry-run</Button>
          <Button size="sm" onClick={() => runNow(false)} disabled={running}>Run governor</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <Stat label="Active rules" value={active.length} />
        <Stat label="Observational" value={observ.length} />
        <Stat label="Avg confidence" value={lastRun ? Number(lastRun.avg_confidence ?? 0).toFixed(2) : "—"} />
        <Stat label="Learning velocity" value={lastRun ? `${Number(lastRun.learning_velocity ?? 0).toFixed(2)}/d` : "—"} />
        <Stat label="Last run" value={lastRun ? new Date(lastRun.started_at).toLocaleString() : "—"} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <TraitList title="Top improving traits" rows={improving} showDelta />
        <TraitList title="Top declining traits" rows={declining} showDelta />
        <TraitList title="Highest confidence rules" rows={highestConfidence} />
        <TraitList title="Newest learning" rows={newest} />
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Traits awaiting more evidence ({observ.length})</summary>
        <TraitList title="" rows={awaiting} muted />
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Recent weight changes ({history.length})</summary>
        <ul className="text-xs space-y-1 mt-2 max-h-72 overflow-auto">
          {history.map((h, i) => (
            <li key={i} className="border-b border-border/40 pb-1">
              <span className="font-mono">{h.dimension}={h.value}</span>{" "}
              <span className={Number(h.delta) >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {Number(h.old_weight).toFixed(2)} → {Number(h.new_weight).toFixed(2)} ({Number(h.delta) >= 0 ? "+" : ""}{Number(h.delta).toFixed(2)})
              </span>
              <span className="text-muted-foreground"> · {h.reason}</span>
            </li>
          ))}
          {history.length === 0 && <li className="text-muted-foreground">No weight changes yet — system still observing.</li>}
        </ul>
      </details>
    </Card>
  );
}

function TraitList({ title, rows, showDelta = false, muted = false }: { title: string; rows: any[]; showDelta?: boolean; muted?: boolean }) {
  return (
    <div className={muted ? "opacity-80" : ""}>
      {title && <div className="text-xs font-semibold mb-1">{title}</div>}
      <ul className="text-xs space-y-1">
        {rows.map((r, i) => {
          const delta = Number(r.weight) - Number(r.prev_weight);
          return (
            <li key={i} className="flex items-center justify-between gap-2 border-b border-border/30 py-0.5">
              <span className="truncate font-mono" title={`${r.dimension}=${r.value}`}>
                {r.dimension}=<b>{r.value}</b>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <Badge variant="outline">w {Number(r.weight).toFixed(2)}</Badge>
                {showDelta && (
                  <span className={delta >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
                  </span>
                )}
                <span className="text-muted-foreground">n={r.sample_n} · c={Number(r.confidence ?? 0).toFixed(2)}</span>
              </span>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-muted-foreground">No data yet.</li>}
      </ul>
    </div>
  );
}

function AdaptiveLearningGovernorPanel() {
  const [state, setState] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [winners, setWinners] = useState<any[]>([]);
  const [frozen, setFrozen] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [s, r, w, f] = await Promise.all([
      (supabase as any).from("pcie2_alg_state").select("*").eq("scope", "global").maybeSingle(),
      (supabase as any).from("pcie2_alg_runs").select("*").order("started_at", { ascending: false }).limit(10),
      (supabase as any).from("pcie2_protected_winners").select("*").order("created_at", { ascending: false }).limit(10),
      (supabase as any).from("pcie2_frozen_rules").select("*").order("created_at", { ascending: false }).limit(10),
    ]);
    setState(s.data ?? null);
    setRuns(r.data ?? []);
    setWinners(w.data ?? []);
    setFrozen(f.data ?? []);
    setLoading(false);
  }

  async function run() {
    setLoading(true);
    await (supabase as any).functions.invoke("pcie2-adaptive-learning-governor", { body: {} });
    await load();
  }

  useEffect(() => { load(); }, []);

  const stateColor: Record<string, string> = {
    LEARNING: "text-emerald-600",
    CAUTIOUS: "text-amber-600",
    PAUSED: "text-rose-600",
    RECOVERY: "text-sky-600",
  };
  const s = state ?? {};

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Adaptive Learning Governor</h2>
          <p className="text-xs text-muted-foreground">
            Decides when to learn, slow, pause, or recover. Protects long-term winners and freezes rules during anomalies.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>Refresh</Button>
          <Button size="sm" onClick={run} disabled={loading}>Run governor</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="border rounded p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">State</div>
          <div className={`font-medium ${stateColor[s.state] ?? ""}`}>{s.state ?? "—"}</div>
        </div>
        <Stat label="Learning speed" value={Number(s.learning_speed ?? 0).toFixed(2)} />
        <Stat label="Confidence" value={Number(s.confidence ?? 0).toFixed(2)} />
        <Stat label="Evidence drift" value={Number(s.evidence_drift ?? 0).toFixed(3)} />
        <Stat label="CTR volatility" value={Number(s.ctr_volatility ?? 0).toFixed(3)} />
        <Stat label="Save volatility" value={Number(s.save_volatility ?? 0).toFixed(3)} />
        <Stat label="Purchase volatility" value={Number(s.purchase_volatility ?? 0).toFixed(3)} />
        <Stat label="Revenue volatility" value={Number(s.revenue_volatility ?? 0).toFixed(3)} />
        <Stat label="Season" value={s.season_tag ?? "none"} />
        <Stat label="Outliers" value={String(s.outlier_count ?? 0)} />
        <Stat label="Decay half-life" value={`${s.decay_half_life_days ?? 0}d`} />
        <Stat label="Model confidence" value={Number(s.model_confidence ?? 0).toFixed(2)} />
      </div>
      {s.reason && (
        <div className="text-xs text-muted-foreground">Reason: {s.reason}</div>
      )}

      <div className="grid md:grid-cols-3 gap-4 text-xs">
        <div>
          <div className="font-medium mb-1">Recent governor actions</div>
          <ul className="space-y-1">
            {runs.map((r) => (
              <li key={r.id} className="border rounded p-2">
                <div className="flex justify-between">
                  <span>{r.prev_state} → <strong>{r.new_state}</strong></span>
                  <span className="text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                </div>
                <div className="text-muted-foreground">{r.notes}</div>
                {Array.isArray(r.actions) && r.actions.length > 0 && (
                  <div className="text-muted-foreground">
                    {r.actions.map((a: any) => a.type).join(", ")}
                  </div>
                )}
              </li>
            ))}
            {runs.length === 0 && <li className="text-muted-foreground">No runs yet.</li>}
          </ul>
        </div>
        <div>
          <div className="font-medium mb-1">Protected winners</div>
          <ul className="space-y-1">
            {winners.map((w) => (
              <li key={w.id} className="border rounded p-2">
                <div>creative {String(w.creative_id ?? "").slice(0, 8)} · ${Number(w.lifetime_revenue ?? 0).toFixed(0)}</div>
                <div className="text-muted-foreground">until {w.protected_until ? new Date(w.protected_until).toLocaleDateString() : "—"}</div>
              </li>
            ))}
            {winners.length === 0 && <li className="text-muted-foreground">None.</li>}
          </ul>
        </div>
        <div>
          <div className="font-medium mb-1">Frozen rules</div>
          <ul className="space-y-1">
            {frozen.map((f) => (
              <li key={f.id} className="border rounded p-2">
                <div><strong>{f.rule_key}</strong></div>
                <div className="text-muted-foreground">{f.reason}</div>
                <div className="text-muted-foreground">until {f.frozen_until ? new Date(f.frozen_until).toLocaleDateString() : "—"}</div>
              </li>
            ))}
            {frozen.length === 0 && <li className="text-muted-foreground">None.</li>}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function ExplainableAIPanel() {
  const [snap, setSnap] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("pcie2-xai-engine", { body: {} , method: "GET" });
    if (data) setSnap(data);
    setLoading(false);
  }
  async function run() {
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("pcie2-xai-engine", { body: { action: "run" } });
    if (data) setSnap(data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const ev = snap?.latest_evaluation ?? {};
  const feed: any[] = snap?.feed ?? [];
  const top: any[] = snap?.top_decisions ?? [];
  const worst: any[] = snap?.worst_decisions ?? [];

  const pct = (v: any, digits = 0) =>
    v == null || Number.isNaN(Number(v)) ? "—" : `${(Number(v) * 100).toFixed(digits)}%`;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Explainable AI (XAI)</h2>
          <p className="text-xs text-muted-foreground">
            Every optimization with reason codes, confidence, evidence, alternatives, and plain-English rationale.
            Nightly self-evaluation grades the AI on accuracy and explainability.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>Refresh</Button>
          <Button size="sm" onClick={run} disabled={loading}>Run self-eval</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Decision Quality" value={ev.decision_quality_score != null ? `${ev.decision_quality_score}/100` : "—"} />
        <Stat label="Prediction Accuracy" value={pct(ev.prediction_accuracy, 1)} />
        <Stat label="Explainability" value={pct(ev.explainability_score, 0)} />
        <Stat label="Confidence Calibration" value={pct(ev.confidence_calibration, 0)} />
        <Stat label="Evidence Completeness" value={pct(ev.evidence_completeness, 0)} />
        <Stat label="Decision Traceability" value={pct(ev.decision_traceability, 0)} />
        <Stat label="Missing Evidence" value={pct(ev.missing_evidence_pct, 0)} />
        <Stat label="Decisions (14d)" value={String(ev.total_decisions ?? feed.length ?? 0)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="font-medium text-sm mb-1">Decision feed</div>
          <ul className="space-y-1 max-h-96 overflow-y-auto pr-1">
            {feed.map((d) => (
              <li
                key={d.id}
                className="border rounded p-2 text-xs cursor-pointer hover:bg-muted/40"
                onClick={() => setSelected(d)}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium truncate">{d.summary}</span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {d.confidence != null ? `${Math.round(Number(d.confidence) * 100)}%` : "—"}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {d.source_engine} · {d.decision_type}
                  {d.expected_lift != null && <> · lift {(Number(d.expected_lift) * 100).toFixed(1)}%</>}
                  {d.status && <> · <span className={
                    d.status === "validated" ? "text-emerald-600"
                    : d.status === "missed" ? "text-rose-600"
                    : d.status === "neutral" ? "text-muted-foreground"
                    : ""
                  }>{d.status}</span></>}
                </div>
                {Array.isArray(d.reason_codes) && d.reason_codes.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.reason_codes.slice(0, 5).map((c: string) => (
                      <span key={c} className="px-1.5 py-0.5 rounded bg-muted text-[10px]">{c}</span>
                    ))}
                  </div>
                )}
              </li>
            ))}
            {feed.length === 0 && <li className="text-xs text-muted-foreground">No decisions yet — engines will start populating the feed.</li>}
          </ul>
        </div>

        <div className="space-y-3">
          <div>
            <div className="font-medium text-sm mb-1">Top decisions (by revenue impact)</div>
            <ul className="space-y-1 text-xs">
              {top.map((d) => (
                <li key={d.id} className="border rounded p-2">
                  <div className="font-medium truncate">{d.summary}</div>
                  <div className="text-muted-foreground">
                    +${(Number((d.outcome?.revenue_impact_cents ?? 0)) / 100).toFixed(2)} ·
                    actual lift {d.outcome?.actual_lift != null ? `${(Number(d.outcome.actual_lift) * 100).toFixed(1)}%` : "—"}
                  </div>
                </li>
              ))}
              {top.length === 0 && <li className="text-muted-foreground">Waiting on outcomes.</li>}
            </ul>
          </div>
          <div>
            <div className="font-medium text-sm mb-1">Worst decisions</div>
            <ul className="space-y-1 text-xs">
              {worst.map((d) => (
                <li key={d.id} className="border rounded p-2">
                  <div className="font-medium truncate">{d.summary}</div>
                  <div className="text-muted-foreground">
                    ${(Number((d.outcome?.revenue_impact_cents ?? 0)) / 100).toFixed(2)} ·
                    actual lift {d.outcome?.actual_lift != null ? `${(Number(d.outcome.actual_lift) * 100).toFixed(1)}%` : "—"}
                  </div>
                </li>
              ))}
              {worst.length === 0 && <li className="text-muted-foreground">None.</li>}
            </ul>
          </div>
        </div>
      </div>

      {selected && (
        <div className="border rounded p-3 bg-muted/30 text-xs space-y-2">
          <div className="flex justify-between">
            <div className="font-medium">{selected.summary}</div>
            <button className="text-muted-foreground" onClick={() => setSelected(null)}>close</button>
          </div>
          <div className="text-sm">{selected.plain_english}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Confidence" value={selected.confidence != null ? `${Math.round(Number(selected.confidence) * 100)}%` : "—"} />
            <Stat label="Expected lift" value={selected.expected_lift != null ? `${(Number(selected.expected_lift) * 100).toFixed(1)}%` : "—"} />
            <Stat label="Risk" value={selected.risk != null ? Number(selected.risk).toFixed(2) : "—"} />
            <Stat label="Explainability" value={selected.explainability_score != null ? `${Math.round(Number(selected.explainability_score) * 100)}%` : "—"} />
          </div>
          {Array.isArray(selected.reason_codes) && selected.reason_codes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selected.reason_codes.map((c: string) => (
                <span key={c} className="px-1.5 py-0.5 rounded bg-background border text-[10px]">{c}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MarketIntelligencePanel() {
  const [snap, setSnap] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("pinterest-market-intelligence", { body: {}, method: "GET" });
    if (data?.market_intel) setSnap(data.market_intel);
    setLoading(false);
  }
  async function run() {
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("pinterest-market-intelligence", { body: { action: "run" } });
    if (data?.market_intel) setSnap(data.market_intel);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const counts = snap?.counts ?? {};
  const recs: any[] = snap?.recommendations ?? [];
  const emerging: any[] = snap?.emerging ?? [];
  const declining: any[] = snap?.declining ?? [];
  const lastRun = snap?.last_runs?.[0];

  const usd = (cents: number) => `$${((cents || 0) / 100).toFixed(0)}`;
  const num = (n: any, d = 2) => n == null ? "—" : Number(n).toFixed(d);

  const actionColor = (a: string) =>
    a === "amplify" ? "text-emerald-600"
    : a === "harvest" ? "text-amber-600"
    : a === "throttle" ? "text-rose-600"
    : "";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pinterest Market Intelligence</h2>
          <p className="text-xs text-muted-foreground">
            External trend signals (keywords, clusters, seasonal, competitor patterns) scored, lifecycle-classified,
            and emitted as XAI recommendations every night.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>Refresh</Button>
          <Button size="sm" onClick={run} disabled={loading}>Run scan</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Market Trend Score" value={snap?.market_trend_score != null ? `${snap.market_trend_score}/100` : "—"} />
        <Stat label="Trend Confidence" value={num(snap?.trend_confidence)} />
        <Stat label="Competition Index" value={num(snap?.competition_index)} />
        <Stat label="Creative Saturation" value={num(snap?.creative_saturation)} />
        <Stat label="Expected Reach" value={(snap?.expected_reach_total ?? 0).toLocaleString()} />
        <Stat label="Expected Revenue" value={usd(snap?.expected_revenue_cents_total ?? 0)} />
        <Stat label="Emerging" value={String(counts.emerging ?? 0)} />
        <Stat label="Declining" value={String(counts.declining ?? 0)} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <div className="font-medium text-sm mb-1">Emerging opportunities</div>
          <ul className="space-y-1 max-h-72 overflow-y-auto pr-1 text-xs">
            {emerging.map((o) => (
              <li key={o.id} className="border rounded p-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium truncate">{o.signal_key}</span>
                  <span className="text-muted-foreground">{o.opportunity_score}</span>
                </div>
                <div className="text-muted-foreground">
                  {o.niche ?? "—"} · conf {(Number(o.confidence) * 100).toFixed(0)}% ·
                  <span className={actionColor(o.recommended_action)}> {o.recommended_action}</span>
                </div>
              </li>
            ))}
            {emerging.length === 0 && <li className="text-muted-foreground">No emerging signals yet.</li>}
          </ul>
        </div>

        <div>
          <div className="font-medium text-sm mb-1">Recommended actions</div>
          <ul className="space-y-1 max-h-72 overflow-y-auto pr-1 text-xs">
            {recs.map((o) => (
              <li key={o.id} className="border rounded p-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium truncate">{o.signal_key}</span>
                  <span className={actionColor(o.recommended_action)}>{o.recommended_action}</span>
                </div>
                <div className="text-muted-foreground">
                  score {o.opportunity_score} · {o.lifecycle} · reach {(o.expected_reach ?? 0).toLocaleString()} · {usd(o.expected_revenue_cents)}
                </div>
              </li>
            ))}
            {recs.length === 0 && <li className="text-muted-foreground">No actions ranked yet.</li>}
          </ul>
        </div>

        <div>
          <div className="font-medium text-sm mb-1">Declining categories</div>
          <ul className="space-y-1 max-h-72 overflow-y-auto pr-1 text-xs">
            {declining.map((o) => (
              <li key={o.id} className="border rounded p-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium truncate">{o.signal_key}</span>
                  <span className="text-muted-foreground">{o.opportunity_score}</span>
                </div>
                <div className="text-muted-foreground">{o.niche ?? "—"} · throttle</div>
              </li>
            ))}
            {declining.length === 0 && <li className="text-muted-foreground">Nothing declining — healthy market.</li>}
          </ul>
        </div>
      </div>

      {lastRun && (
        <div className="text-[11px] text-muted-foreground border-t pt-2">
          Last run {new Date(lastRun.started_at).toLocaleString()} · {lastRun.signals_seen ?? 0} signals ·
          {" "}{lastRun.opportunities_new ?? 0} upserts · {lastRun.opportunities_expired ?? 0} expired ·
          {" "}{lastRun.xai_emitted ?? 0} XAI decisions
        </div>
      )}
    </Card>
  );
}

function ExecutiveCouncilPanel() {
  const [snap, setSnap] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("aec-executive-council", { body: {}, method: "GET" });
    if (data) setSnap(data);
    setLoading(false);
  }
  async function call(action: string) {
    setBusy(action);
    await (supabase as any).functions.invoke("aec-executive-council", { body: { action } });
    await load();
    setBusy(null);
  }
  useEffect(() => { load(); }, []);

  const lastRun = snap?.last_run;
  const briefing = snap?.briefing;
  const advisors: any[] = snap?.advisors ?? [];
  const decisions: any[] = snap?.decisions ?? [];
  const priorities: any[] = snap?.priorities ?? [];
  const votes: any[] = snap?.votes ?? [];
  const counts = snap?.counts ?? {};

  const usd = (cents: number) => `$${((cents || 0) / 100).toFixed(0)}`;
  const pct = (n: any) => n == null ? "—" : `${Math.round(Number(n) * 100)}%`;

  const byKind = (k: string) => priorities.filter(p => p.kind === k).sort((a, b) => a.rank - b.rank);

  const consensusColor =
    lastRun?.council_consensus === "unanimous" ? "text-emerald-600"
    : lastRun?.council_consensus === "weighted_majority" ? "text-amber-600"
    : lastRun?.council_consensus === "conflict" ? "text-rose-600" : "";

  return (
    <Card className="p-4 space-y-3 border-2 border-primary/30">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">🏛 AI Executive Council</h2>
          <p className="text-xs text-muted-foreground">
            Highest decision layer — 13 specialist advisors vote, the Council weights by reliability, resolves conflicts and executes the highest expected lifetime-value action.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>Refresh</Button>
          <Button size="sm" onClick={() => call("run")} disabled={busy !== null}>Convene Council</Button>
          <Button size="sm" variant="outline" onClick={() => call("briefing")} disabled={busy !== null}>CEO briefing</Button>
          <Button size="sm" variant="outline" onClick={() => call("weekly_review")} disabled={busy !== null}>Weekly review</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <Stat label="Council Confidence" value={pct(lastRun?.council_confidence)} />
        <Stat label="Consensus" value={<span className={consensusColor}>{lastRun?.council_consensus ?? "—"}</span> as any} />
        <Stat label="Decision Quality" value={lastRun?.decision_quality_score != null ? `${lastRun.decision_quality_score}/100` : "—"} />
        <Stat label="Projected Revenue" value={usd(lastRun?.projected_monthly_revenue_cents ?? 0) + "/mo"} />
        <Stat label="Projected Growth" value={pct(lastRun?.projected_growth_pct)} />
        <Stat label="Decisions" value={String(counts.decisions ?? 0)} />
        <Stat label="Conflicts" value={String(counts.conflicts ?? 0)} />
        <Stat label="Advisors active" value={`${counts.advisors_active ?? 0}/13`} />
        <Stat label="Last run" value={lastRun ? new Date(lastRun.started_at).toLocaleString() : "—"} />
        <Stat label="Briefing date" value={briefing?.for_date ?? "—"} />
      </div>

      {briefing && (
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="font-medium text-sm mb-1">📋 Executive Briefing — {briefing.for_date}</div>
          <ul className="list-disc pl-5 text-xs space-y-0.5">
            {(briefing.bullets ?? []).map((b: string, i: number) => <li key={i}>{b}</li>)}
          </ul>
          <div className="text-[11px] text-muted-foreground mt-2">
            Founder action: <span className={briefing.required_founder_action === "None" ? "text-emerald-600" : "text-amber-600 font-medium"}>{briefing.required_founder_action}</span>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <div className="font-medium text-sm mb-1">🚀 Top Opportunities</div>
          <ul className="space-y-1 max-h-60 overflow-y-auto pr-1 text-xs">
            {byKind("opportunity").map(p => (
              <li key={p.id} className="border rounded p-2">
                <div className="flex justify-between gap-2"><span className="truncate">#{p.rank} {p.title}</span><span className="text-muted-foreground">{pct(p.confidence)}</span></div>
              </li>
            ))}
            {byKind("opportunity").length === 0 && <li className="text-muted-foreground">No opportunities ranked.</li>}
          </ul>
        </div>
        <div>
          <div className="font-medium text-sm mb-1">⚠ Top Risks</div>
          <ul className="space-y-1 max-h-60 overflow-y-auto pr-1 text-xs">
            {byKind("risk").map(p => (
              <li key={p.id} className="border rounded p-2">
                <div className="flex justify-between gap-2"><span className="truncate">#{p.rank} {p.title}</span><span className="text-rose-600">{pct(p.score)}</span></div>
              </li>
            ))}
            {byKind("risk").length === 0 && <li className="text-muted-foreground">No active risks.</li>}
          </ul>
        </div>
        <div>
          <div className="font-medium text-sm mb-1">🧪 Top Experiments</div>
          <ul className="space-y-1 max-h-60 overflow-y-auto pr-1 text-xs">
            {byKind("experiment").map(p => (
              <li key={p.id} className="border rounded p-2">
                <div className="flex justify-between gap-2"><span className="truncate">#{p.rank} {p.title}</span><span className="text-muted-foreground">{pct(p.confidence)}</span></div>
              </li>
            ))}
            {byKind("experiment").length === 0 && <li className="text-muted-foreground">No experiments queued.</li>}
          </ul>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="font-medium text-sm mb-1">🗳 Advisor Votes (last run)</div>
          <div className="text-xs space-y-1 max-h-60 overflow-y-auto pr-1">
            {advisors.map(a => {
              const aVotes = votes.filter(v => v.advisor_key === a.advisor_key);
              const totalW = aVotes.reduce((s, v) => s + Number(v.weight || 0), 0);
              return (
                <div key={a.advisor_key} className="flex items-center justify-between border rounded px-2 py-1">
                  <span className="truncate">{a.display_name}</span>
                  <span className="text-muted-foreground">
                    w={Number(a.current_weight).toFixed(2)} · rel={pct(a.reliability_score)} · votes={aVotes.length} · Σw={totalW.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="font-medium text-sm mb-1">⚖ Council Decisions</div>
          <ul className="space-y-1 max-h-60 overflow-y-auto pr-1 text-xs">
            {decisions.slice(0, 20).map(d => (
              <li key={d.id} className="border rounded p-2">
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{d.final_action.toUpperCase()} · {d.decision_type}</span>
                  <span className={d.consensus === "conflict" ? "text-rose-600" : d.consensus === "unanimous" ? "text-emerald-600" : "text-amber-600"}>{d.consensus}</span>
                </div>
                <div className="text-muted-foreground">
                  conf {pct(d.council_confidence)} · ROI ~{usd(d.expected_revenue_cents)}/mo · risk {pct(d.expected_risk)} · {d.votes_for}✓ / {d.votes_against}✗
                </div>
              </li>
            ))}
            {decisions.length === 0 && <li className="text-muted-foreground">No Council decisions yet — click Convene Council.</li>}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function PcieV2Panel() {
  const [runs, setRuns] = useState<any[]>([]);
  const [creatives, setCreatives] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [r, c, fl, sf, hk, ax, st] = await Promise.all([
      supabase.from("pcie_v2_runs").select("*").order("started_at", { ascending: false }).limit(10),
      supabase.from("pcie_v2_creatives").select("id,status,niche,novelty_total,reject_reason,decisions,created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("pcie_v2_feature_flags").select("*").order("flag"),
      supabase.from("pcie_v2_style_families").select("id", { count: "exact", head: true }),
      supabase.from("pcie_v2_hooks").select("id", { count: "exact", head: true }),
      supabase.from("pcie_v2_scoring_axes").select("id", { count: "exact", head: true }),
      supabase.from("pcie_v2_pipeline_stages").select("id", { count: "exact", head: true }),
    ]);
    setRuns(r.data ?? []); setCreatives(c.data ?? []); setFlags(fl.data ?? []);
    setCounts({ style_families: sf.count ?? 0, hooks: hk.count ?? 0, axes: ax.count ?? 0, stages: st.count ?? 0 });
  }
  useEffect(() => { refresh(); }, []);

  async function trigger() {
    setBusy(true);
    try {
      await supabase.functions.invoke("pcie-v2-creative-director", { body: { count: 5, niche: "cat_litter", trigger: "manual_panel" } });
      await refresh();
    } finally { setBusy(false); }
  }

  async function toggleFlag(flag: string, enabled: boolean) {
    await supabase.from("pcie_v2_feature_flags").update({ enabled, updated_at: new Date().toISOString() }).eq("flag", flag);
    refresh();
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">PCIE-V2 Creative Director</h3>
          <p className="text-xs text-muted-foreground">Config-driven · self-critiquing · genetic-learning · the future replacement of legacy Creative Factory.</p>
        </div>
        <Button size="sm" onClick={trigger} disabled={busy}>{busy ? "Running…" : "Run 5 (dry)"}</Button>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div className="rounded border p-2"><div className="text-xl font-semibold">{counts.style_families}</div>Style families</div>
        <div className="rounded border p-2"><div className="text-xl font-semibold">{counts.hooks}</div>Hooks</div>
        <div className="rounded border p-2"><div className="text-xl font-semibold">{counts.axes}</div>Scoring axes</div>
        <div className="rounded border p-2"><div className="text-xl font-semibold">{counts.stages}</div>Pipeline stages</div>
      </div>

      <div>
        <div className="text-xs font-medium mb-1">Feature flags</div>
        <div className="flex flex-wrap gap-2">
          {flags.map((f) => (
            <button key={f.flag} onClick={() => toggleFlag(f.flag, !f.enabled)}
              className={`text-xs rounded border px-2 py-1 ${f.enabled ? "bg-primary/10 border-primary" : "bg-muted"}`}>
              {f.enabled ? "✓" : "○"} {f.flag}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-medium mb-1">Recent runs</div>
          <ul className="text-xs space-y-1">
            {runs.map((r) => (
              <li key={r.id} className="flex justify-between border-b py-1">
                <span>{new Date(r.started_at).toLocaleString()}</span>
                <span>{r.status} · ✓{r.produced} ✗{r.rejected} ⊜{r.duplicates}</span>
              </li>
            ))}
            {runs.length === 0 && <li className="text-muted-foreground">No runs yet.</li>}
          </ul>
        </div>
        <div>
          <div className="text-xs font-medium mb-1">Recent creatives</div>
          <ul className="text-xs space-y-1 max-h-72 overflow-auto">
            {creatives.map((c) => (
              <li key={c.id} className="border-b py-1">
                <div className="flex justify-between">
                  <span><Badge variant={c.status === "draft" ? "default" : "secondary"}>{c.status}</Badge> {c.niche}</span>
                  <span>{c.novelty_total ? Number(c.novelty_total).toFixed(1) : "—"}</span>
                </div>
                {c.reject_reason && <div className="text-muted-foreground">↳ {c.reject_reason}</div>}
                <div className="text-muted-foreground truncate">{Object.entries(c.decisions ?? {}).map(([k,v]) => `${k}:${v}`).join(" · ")}</div>
              </li>
            ))}
            {creatives.length === 0 && <li className="text-muted-foreground">No creatives yet.</li>}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function UsGeoIntelligencePanel() {
  const [snap, setSnap] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dry, setDry] = useState<any[] | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("pinterest-geo-intelligence", { body: { action: "snapshot" } });
    if (data?.us_geo) setSnap(data.us_geo);
    setLoading(false);
  }
  async function runScan() {
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("pinterest-geo-intelligence", { body: { action: "scan", limit: 200 } });
    if (data?.snapshot) setSnap(data.snapshot);
    setLoading(false);
  }
  async function runDry() {
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("pinterest-geo-intelligence", { body: { action: "dry_run", limit: 25 } });
    setDry(data?.results ?? []);
    setLoading(false);
  }
  async function runRepair() {
    if (!confirm("Apply metadata repairs to up to 50 draft/queued pins?")) return;
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("pinterest-geo-intelligence", { body: { action: "repair", limit: 50 } });
    if (data?.snapshot) setSnap(data.snapshot);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">US Organic Geo Intelligence</h2>
          <p className="text-xs text-muted-foreground">
            US Relevance Score, Rich-Pin readiness and metadata repair for organic Pinterest. Floor {snap?.floor ?? 92}/100; reject &lt; {snap?.reject_below ?? 80}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>Refresh</Button>
          <Button size="sm" variant="outline" onClick={runDry} disabled={loading}>Dry-run 25</Button>
          <Button size="sm" variant="outline" onClick={runScan} disabled={loading}>Scan 200</Button>
          <Button size="sm" onClick={runRepair} disabled={loading}>Repair 50</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Target" value={`${snap?.target_market?.country ?? "US"} · ${snap?.target_market?.currency ?? "USD"}`} />
        <Stat label="Avg score 24h" value={snap?.avg_score_24h != null ? `${snap.avg_score_24h}/100` : "—"} />
        <Stat label="Avg score 7d" value={snap?.avg_score_7d != null ? `${snap.avg_score_7d}/100` : "—"} />
        <Stat label="Sample 7d" value={String(snap?.sample_7d ?? 0)} />
        <Stat label="Blocked by gate 7d" value={String(snap?.blocked_by_gate_7d ?? 0)} />
        <Stat label="Repaired 7d" value={String(snap?.repaired_7d ?? 0)} />
        <Stat label="% USD" value={`${snap?.pct_usd ?? 0}%`} />
        <Stat label="% US English" value={`${snap?.pct_us_english ?? 0}%`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="font-medium text-sm mb-1">Top failing dimensions (24h)</div>
          <ul className="space-y-1 text-xs max-h-56 overflow-y-auto pr-1">
            {(snap?.top_failing_dimensions ?? []).map((d: any) => (
              <li key={d.dimension} className="flex justify-between border rounded p-2">
                <span>{d.dimension}</span><span className="text-muted-foreground">{d.count}</span>
              </li>
            ))}
            {(!snap?.top_failing_dimensions || snap.top_failing_dimensions.length === 0) && (
              <li className="text-muted-foreground">No failures — clean window.</li>
            )}
          </ul>
        </div>
        <div>
          <div className="font-medium text-sm mb-1">Recent repairs (before → after)</div>
          <ul className="space-y-1 text-xs max-h-56 overflow-y-auto pr-1">
            {(snap?.recent_repairs ?? []).map((r: any) => (
              <li key={r.id} className="border rounded p-2">
                <div className="truncate"><span className="text-muted-foreground">was:</span> {r.before_title}</div>
                <div className="truncate font-medium">→ {r.after_title}</div>
                <div className="text-muted-foreground">{r.score_before ?? "—"} → {r.score_after}</div>
              </li>
            ))}
            {(!snap?.recent_repairs || snap.recent_repairs.length === 0) && (
              <li className="text-muted-foreground">No repairs yet — run "Repair 50".</li>
            )}
          </ul>
        </div>
      </div>

      {dry && (
        <div>
          <div className="font-medium text-sm mb-1">Dry-run preview · {dry.length} pins (no writes)</div>
          <ul className="space-y-1 text-xs max-h-72 overflow-y-auto pr-1">
            {dry.map((r) => (
              <li key={r.id} className="border rounded p-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium truncate">{r.slug}</span>
                  <span className="text-muted-foreground">
                    {r.before.score} → {r.after.score} · <em>{r.after.decision}</em>
                  </span>
                </div>
                <div className="truncate"><span className="text-muted-foreground">title:</span> {r.before.title} → <strong>{r.after.title}</strong></div>
                <div className="text-muted-foreground truncate">{r.explanation}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-[11px] text-muted-foreground border-t pt-2">
        Publish windows ET: {(snap?.publish_windows_et ?? []).map((w: any) => `${w.start}-${w.end}`).join(" · ")} · Last refresh {snap?.last_run ? new Date(snap.last_run).toLocaleTimeString() : "—"}
      </div>
    </Card>
  );
}

function PinterestPsychologyEnginePanel() {
  const [snap, setSnap] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sim, setSim] = useState<any>(null);
  const [simInput, setSimInput] = useState<{ title: string; niche: string }>({ title: "", niche: "cat_litter" });

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("ppe-engine", { body: { action: "snapshot" } });
    if (data?.ppe) setSnap(data.ppe);
    setLoading(false);
  }
  async function simulate() {
    setLoading(true);
    const { data } = await (supabase as any).functions.invoke("ppe-engine", { body: { action: "simulate", title: simInput.title, niche: simInput.niche } });
    setSim(data ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const f = snap?.floors ?? {};
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Pinterest Psychology Engine (PPE)</h2>
          <p className="text-xs text-muted-foreground">
            Story-first reasoning · Multi-candidate competition · Product-Hero gate.
            Floors: visibility ≥ {f.visibility ?? 95}, CTR ≥ {f.ctr ?? 95}, novelty ≥ {f.novelty ?? 96}, composite ≥ {f.composite ?? 92}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Candidates 24h" value={String(snap?.sample_24h ?? 0)} />
        <Stat label="Avg composite 24h" value={snap?.avg_composite_24h != null ? `${snap.avg_composite_24h}/100` : "—"} />
        <Stat label="Avg CTR 24h" value={snap?.avg_ctr_24h != null ? `${snap.avg_ctr_24h}/100` : "—"} />
        <Stat label="Avg visibility 24h" value={snap?.avg_visibility_24h != null ? `${snap.avg_visibility_24h}/100` : "—"} />
        <Stat label="Avg scroll-stop 24h" value={snap?.avg_scroll_stop_24h != null ? `${snap.avg_scroll_stop_24h}/100` : "—"} />
        <Stat label="Beats competitors 24h" value={String(snap?.competitor_wins_24h ?? 0)} />
        <Stat label="Loses vs competitors 24h" value={String(snap?.competitor_loses_24h ?? 0)} />
        <Stat label="7d sample" value={String(snap?.sample_7d ?? 0)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="font-medium text-sm mb-1">Recent winners</div>
          <ul className="space-y-1 text-xs max-h-64 overflow-y-auto pr-1">
            {(snap?.winners_recent ?? []).map((w: any) => (
              <li key={w.creative_id} className="border rounded p-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium truncate">{w.product_slug}</span>
                  <span className="text-muted-foreground">{w.composite}/100 · {w.competitor_verdict}</span>
                </div>
                <div className="text-muted-foreground truncate">{w.primary_emotion} · {w.badge_text}</div>
                <div className="truncate">{w.story}</div>
              </li>
            ))}
            {(!snap?.winners_recent || snap.winners_recent.length === 0) && (
              <li className="text-muted-foreground">No winners yet — run the director.</li>
            )}
          </ul>
        </div>

        <div className="space-y-3">
          <div>
            <div className="font-medium text-sm mb-1">Top rejection reasons (24h)</div>
            <ul className="space-y-1 text-xs max-h-32 overflow-y-auto pr-1">
              {(snap?.rejection_reasons ?? []).map((r: any) => (
                <li key={r.reason} className="flex justify-between border rounded p-2">
                  <span className="truncate">{r.reason}</span>
                  <span className="text-muted-foreground">{r.count}</span>
                </li>
              ))}
              {(!snap?.rejection_reasons || snap.rejection_reasons.length === 0) && (
                <li className="text-muted-foreground">No rejections logged.</li>
              )}
            </ul>
          </div>
          <div>
            <div className="font-medium text-sm mb-1">Badge rotation (7d)</div>
            <ul className="space-y-1 text-xs max-h-32 overflow-y-auto pr-1">
              {(snap?.badge_usage_top ?? []).map((b: any) => (
                <li key={b.text} className="flex justify-between border rounded p-2">
                  <span className="truncate">{b.text}</span>
                  <span className="text-muted-foreground">{b.count}</span>
                </li>
              ))}
              {(!snap?.badge_usage_top || snap.badge_usage_top.length === 0) && (
                <li className="text-muted-foreground">No badge usage yet.</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t pt-3 space-y-2">
        <div className="font-medium text-sm">Simulate a story profile</div>
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <input
            value={simInput.title}
            onChange={(e) => setSimInput({ ...simInput, title: e.target.value })}
            placeholder="Supplier title (e.g. PVC Coated Two-color Waterproof Training Rope)"
            className="border rounded px-2 py-1 flex-1 min-w-[240px]"
          />
          <input
            value={simInput.niche}
            onChange={(e) => setSimInput({ ...simInput, niche: e.target.value })}
            placeholder="niche key"
            className="border rounded px-2 py-1 w-40"
          />
          <Button size="sm" onClick={simulate} disabled={loading || (!simInput.title && !simInput.niche)}>Simulate</Button>
        </div>
        {sim?.profile && (
          <div className="text-xs border rounded p-3 bg-muted/30 space-y-1">
            <div><strong>Story:</strong> {sim.profile.story}</div>
            <div><strong>Primary emotion:</strong> {sim.profile.primary_emotion} · <strong>Secondary:</strong> {sim.profile.secondary_emotion}</div>
            <div><strong>Desired response:</strong> {sim.profile.desired_response}</div>
            <div><strong>Motivations:</strong> {(sim.profile.buying_motivations ?? []).join(" · ")}</div>
            <div><strong>Scenes:</strong> {(sim.profile.scene_suggestions ?? []).join(" · ")}</div>
            <div><strong>Title rewrite:</strong> {sim.title_rewrite?.before} → <em>{sim.title_rewrite?.after}</em></div>
            <div><strong>Badge:</strong> {sim.badge?.text ?? "—"} · <strong>Attention balance:</strong> {sim.attention_map?.balance}</div>
          </div>
        )}
      </div>
    </Card>
  );
}
