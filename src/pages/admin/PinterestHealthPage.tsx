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

  useEffect(() => {
    refresh(false);
    refreshWatchdog(false);
    loadConnection();
    // Auto-run final recovery after a successful OAuth callback redirect
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("oauth_success") === "true") {
      runFinalRecovery();
    }
    const t = setInterval(() => {
      refresh(false);
      refreshWatchdog(false);
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
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