import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Clock, Gauge } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";

type Window = { start: number; end: number };
type Settings = {
  auto_publish_enabled: boolean;
  pinterest_publish_recovery_mode: boolean;
  pinterest_publish_quality_floor: number;
  pinterest_publish_max_per_hour: number;
  pinterest_publish_min_slug_gap_minutes: number;
  publish_windows_est: Window[];
  publish_jitter_min_seconds: number;
  publish_jitter_max_seconds: number;
  recovery_auto_exit_days: number;
  recovery_tier_progression: Record<string, number>;
  hook_cooldown_days: number;
  thumbnail_phash_distance_threshold: number;
  board_recent_window_minutes: number;
  board_max_pins_per_window: number;
  engine_version: string;
  updated_at: string;
};

const DEFAULT_WINDOWS: Window[] = [
  { start: 7, end: 9 },
  { start: 12, end: 14 },
  { start: 19, end: 23 },
];
const DEFAULT_TIERS: Record<string, number> = { tier1: 2, tier2: 3, tier3: 4 };

function estHourNow(now: Date) {
  return (now.getUTCHours() + 24 - 5) % 24;
}
function safeWindows(windows: Window[] | undefined | null): Window[] {
  const w = Array.isArray(windows)
    ? windows.filter((x) => x && typeof x.start === "number" && typeof x.end === "number")
    : [];
  return w.length > 0 ? w : DEFAULT_WINDOWS;
}
function isInWindow(now: Date, windows: Window[]) {
  const h = estHourNow(now);
  return safeWindows(windows).some((w) => h >= w.start && h < w.end);
}
function nextWindowStartUtc(now: Date, windows: Window[]): Date | null {
  const ws = safeWindows(windows);
  if (ws.length === 0) return null;
  const h = estHourNow(now);
  const sorted = [...ws].sort((a, b) => a.start - b.start);
  for (const w of sorted) {
    if (h < w.start) {
      const next = new Date(now);
      next.setUTCHours(next.getUTCHours() + (w.start - h));
      next.setUTCMinutes(0, 0, 0);
      return next;
    }
  }
  const first = sorted[0];
  const next = new Date(now);
  next.setUTCHours(next.getUTCHours() + (24 - h + first.start));
  next.setUTCMinutes(0, 0, 0);
  return next;
}
function fmtRelative(target: Date, now: Date) {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}h ${r}m` : `${m}m`;
}

export default function PinterestRecoveryStatusPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lastPublishAt, setLastPublishAt] = useState<string | null>(null);
  const [recentCount1h, setRecentCount1h] = useState(0);
  const [recent24h, setRecent24h] = useState(0);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState<string | null>(null);

  type VerifyCounts = {
    deleted: number;
    still_exists: number;
    inaccessible: number;
    cached_only: number;
    active_live: number;
    archived: number;
    remotely_deleted: number;
    orphaned: number;
  };
  const [verify, setVerify] = useState<{
    verified_at: string | null;
    counts: VerifyCounts | null;
  }>({ verified_at: null, counts: null });
  const [verifyRunning, setVerifyRunning] = useState(false);

  const loadVerify = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-pin-deletion-verify", {
        method: "GET",
      });
      if (error) throw error;
      if (data?.ok) {
        setVerify({ verified_at: data.verified_at, counts: data.counts });
      }
    } catch (e) {
      console.error("[PinterestRecovery] loadVerify failed", e);
    }
  };

  const runVerify = async () => {
    setVerifyRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-pin-deletion-verify", {
        method: "POST",
        body: { limit: 200, onlyStale: true },
      });
      if (error) throw error;
      if (data?.ok) {
        setVerify({ verified_at: data.verified_at, counts: data.counts });
        toast.success(`Verified ${data.checked ?? 0} pins`);
      } else {
        toast.error(data?.message || "Verification failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Verification failed");
    } finally {
      setVerifyRunning(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        supabase.from("cinematic_ad_settings").select("*").eq("id", true).maybeSingle(),
        supabase
          .from("pinterest_video_assets")
          .select("last_publish_at")
          .not("last_publish_at", "is", null)
          .order("last_publish_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("pinterest_video_assets")
          .select("id", { count: "exact", head: true })
          .gte("last_publish_at", new Date(Date.now() - 3600_000).toISOString()),
        supabase
          .from("pinterest_video_assets")
          .select("id", { count: "exact", head: true })
          .gte("last_publish_at", new Date(Date.now() - 86400_000).toISOString()),
      ]);
      const [sR, lastR, c1R, c24R] = results;
      const sVal: any = sR.status === "fulfilled" ? sR.value : null;
      const s = sVal?.data ?? null;
      const sErr = sVal?.error ?? (sR.status === "rejected" ? sR.reason : null);
      const last = lastR.status === "fulfilled" ? (lastR.value as any)?.data : null;
      const c1h = c1R.status === "fulfilled" ? (c1R.value as any)?.count ?? 0 : 0;
      const c24h = c24R.status === "fulfilled" ? (c24R.value as any)?.count ?? 0 : 0;
      if (sErr && !s) {
        const msg = String(sErr?.message ?? sErr ?? "");
        if (/jwt|auth|permission|rls/i.test(msg)) {
          setError("AUTH");
        } else {
          setError(msg || "Failed to load settings");
        }
      }
      setSettings((s as unknown) as Settings | null);
      setLastPublishAt((last as any)?.last_publish_at ?? null);
      setRecentCount1h(c1h);
      setRecent24h(c24h);
    } catch (e: any) {
      console.error("[PinterestRecovery] load failed", e);
      setError(e?.message || "Unknown error loading recovery status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadVerify();
    const t = setInterval(() => setNow(new Date()), 1000);
    const r = setInterval(load, 15000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, []);

  const windows = safeWindows(settings?.publish_windows_est);
  const inWindow = useMemo(() => isInWindow(now, windows), [now, windows]);
  const nextWindow = useMemo(() => nextWindowStartUtc(now, windows), [now, windows]);
  const jitterRangeMin = settings ? Math.round((settings.publish_jitter_min_seconds ?? 0) / 60) : 0;
  const jitterRangeMax = settings ? Math.round((settings.publish_jitter_max_seconds ?? 0) / 60) : 0;

  // Effective hourly cap based on recovery tier
  const tierProg: Record<string, number> =
    settings?.recovery_tier_progression && typeof settings.recovery_tier_progression === "object"
      ? (settings.recovery_tier_progression as Record<string, number>)
      : DEFAULT_TIERS;
  const tierCap = settings?.pinterest_publish_recovery_mode
    ? tierProg.tier1 ?? 2
    : settings?.pinterest_publish_max_per_hour ?? 3;

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl pb-24">
      <Helmet>
        <title>Pinterest Recovery Status — Admin</title>
      </Helmet>
      <header className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pinterest Recovery Status</h1>
          <p className="text-sm text-muted-foreground">
            Live view of the V3 autopublish gate, recovery mode and publishing windows.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Refresh
        </Button>
      </header>

      {error === "AUTH" ? (
        <Card className="p-6 text-sm">Admin login required to view recovery status.</Card>
      ) : error ? (
        <Card className="p-6 text-sm text-destructive">
          Error loading recovery status: {error}
        </Card>
      ) : loading && !settings ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !settings ? (
        <Card className="p-6 text-sm text-muted-foreground">No recovery data yet.</Card>
      ) : (
        <>
          {/* Top status grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Autopublish</div>
              <div className="flex items-center gap-2">
                {settings.auto_publish_enabled ? (
                  <Badge className="bg-emerald-500 hover:bg-emerald-500/90 gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Enabled
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Disabled
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">v{settings.engine_version}</span>
              </div>
            </Card>

            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Recovery Mode</div>
              {settings.pinterest_publish_recovery_mode ? (
                <Badge className="bg-amber-500 hover:bg-amber-500/90 gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  Active — {tierProg.tier1 ?? 2}/hr cap
                </Badge>
              ) : (
                <Badge className="bg-emerald-500 hover:bg-emerald-500/90 gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Normal — {settings.pinterest_publish_max_per_hour ?? 3}/hr cap
                </Badge>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Auto-exits after {settings.recovery_auto_exit_days ?? 0} clean days
              </p>
            </Card>

            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Publish Window
              </div>
              {inWindow || !nextWindow ? (
                <>
                  <Badge className={inWindow ? "bg-emerald-500 hover:bg-emerald-500/90" : "bg-muted"}>
                    {inWindow ? "In window" : "—"}
                  </Badge>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    EST hour: {estHourNow(now)}:00
                  </p>
                </>
              ) : (
                <>
                  <Badge variant="secondary">Closed</Badge>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Next: {nextWindow.toLocaleTimeString()} (in {fmtRelative(nextWindow, now)})
                  </p>
                </>
              )}
            </Card>

            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <Gauge className="h-3 w-3" /> Throughput
              </div>
              <div className="text-2xl font-bold leading-tight">
                {recentCount1h}
                <span className="text-sm font-normal text-muted-foreground"> / {tierCap}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                last hour · {recent24h} in 24h
              </p>
            </Card>
          </div>

          {/* Windows + jitter */}
          <Card className="p-4 mb-4">
            <h2 className="font-semibold mb-2 text-sm">EST Publishing Windows</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {windows.map((w, i) => {
                const active = estHourNow(now) >= w.start && estHourNow(now) < w.end;
                return (
                  <Badge key={i} variant={active ? "default" : "outline"} className="font-mono">
                    {String(w.start).padStart(2, "0")}:00 – {String(w.end).padStart(2, "0")}:00 EST
                  </Badge>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Jitter between publishes: <span className="font-mono">{jitterRangeMin}–{jitterRangeMax} min</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Last publish: {lastPublishAt ? new Date(lastPublishAt).toLocaleString() : "—"}
            </p>
          </Card>

          {/* Quality gate */}
          <Card className="p-4 mb-4">
            <h2 className="font-semibold mb-3 text-sm">PinterestQualityGateV2</h2>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row label="QA floor" value={`≥ ${settings.pinterest_publish_quality_floor ?? "—"}`} />
              <Row label="Slug cooldown" value={`${settings.pinterest_publish_min_slug_gap_minutes ?? "—"} min`} />
              <Row label="Hourly cap" value={`${tierCap} / hr`} />
              <Row label="Hook cooldown" value={`${settings.hook_cooldown_days ?? "—"} days`} />
              <Row
                label="Thumbnail pHash distance"
                value={`≤ ${settings.thumbnail_phash_distance_threshold ?? "—"} → reject`}
              />
              <Row
                label="Board diversification"
                value={`max ${settings.board_max_pins_per_window ?? "—"} pins / ${settings.board_recent_window_minutes ?? "—"}min`}
              />
            </dl>
          </Card>

          {/* Recovery tier ladder */}
          <Card className="p-4">
            <h2 className="font-semibold mb-3 text-sm">Recovery Tier Ladder</h2>
            <div className="flex gap-3 flex-wrap">
              {Object.entries(tierProg).map(([k, v]) => {
                const isCurrent =
                  settings.pinterest_publish_recovery_mode && k === "tier1";
                return (
                  <div
                    key={k}
                    className={`px-3 py-2 rounded-md border text-xs ${
                      isCurrent ? "border-amber-500 bg-amber-500/10" : "border-border"
                    }`}
                  >
                    <div className="font-mono uppercase">{k}</div>
                    <div className="text-base font-bold">{v}/hr</div>
                  </div>
                );
              })}
            </div>
            {settings.updated_at && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Settings last updated:{" "}
                {(() => {
                  try { return new Date(settings.updated_at).toLocaleString(); } catch { return "—"; }
                })()}
              </p>
            )}
          </Card>

          {/* Remote deletion verification */}
          <Card className="p-4 mt-4">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
              <div>
                <h2 className="font-semibold text-sm">Remote Deletion Verification</h2>
                <p className="text-[11px] text-muted-foreground">
                  Confirms previously deleted pins are actually gone from Pinterest.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={runVerify} disabled={verifyRunning}>
                {verifyRunning ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Run verification
              </Button>
            </div>

            {!verify.counts ? (
              <p className="text-xs text-muted-foreground">
                No verification run yet. Click “Run verification” to query the Pinterest API.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <Stat label="Active live" value={verify.counts.active_live} tone="emerald" />
                  <Stat label="Archived (DB)" value={verify.counts.archived} tone="muted" />
                  <Stat label="Remotely deleted" value={verify.counts.remotely_deleted} tone="emerald" />
                  <Stat label="Orphaned" value={verify.counts.orphaned} tone="amber" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Deleted ok" value={verify.counts.deleted} tone="emerald" />
                  <Stat label="Still exists" value={verify.counts.still_exists} tone="destructive" />
                  <Stat label="Inaccessible" value={verify.counts.inaccessible} tone="amber" />
                  <Stat label="Cached only" value={verify.counts.cached_only} tone="muted" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Last verification:{" "}
                  {verify.verified_at ? new Date(verify.verified_at).toLocaleString() : "—"}
                </p>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "destructive" | "muted";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold leading-tight ${toneCls}`}>{value}</div>
    </div>
  );
}