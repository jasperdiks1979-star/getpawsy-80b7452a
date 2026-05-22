import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Clock, Gauge } from "lucide-react";
import { Helmet } from "react-helmet-async";

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

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: last }, { count: c1h }, { count: c24h }] = await Promise.all([
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
    setSettings((s as unknown) as Settings | null);
    setLastPublishAt((last as any)?.last_publish_at ?? null);
    setRecentCount1h(c1h ?? 0);
    setRecent24h(c24h ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(() => setNow(new Date()), 1000);
    const r = setInterval(load, 15000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, []);

  const windows = settings?.publish_windows_est ?? [];
  const inWindow = useMemo(() => isInWindow(now, windows), [now, windows]);
  const nextWindow = useMemo(() => nextWindowStartUtc(now, windows), [now, windows]);
  const jitterRangeMin = settings ? Math.round(settings.publish_jitter_min_seconds / 60) : 0;
  const jitterRangeMax = settings ? Math.round(settings.publish_jitter_max_seconds / 60) : 0;

  // Effective hourly cap based on recovery tier
  const tierCap = settings?.pinterest_publish_recovery_mode
    ? settings.recovery_tier_progression?.tier1 ?? 2
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

      {loading && !settings ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !settings ? (
        <Card className="p-6 text-sm text-muted-foreground">No settings row found.</Card>
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
                  Active — {settings.recovery_tier_progression?.tier1 ?? 2}/hr cap
                </Badge>
              ) : (
                <Badge className="bg-emerald-500 hover:bg-emerald-500/90 gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Normal — {settings.pinterest_publish_max_per_hour}/hr cap
                </Badge>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Auto-exits after {settings.recovery_auto_exit_days} clean days
              </p>
            </Card>

            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Publish Window
              </div>
              {inWindow ? (
                <>
                  <Badge className="bg-emerald-500 hover:bg-emerald-500/90">In window</Badge>
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
              <Row label="QA floor" value={`≥ ${settings.pinterest_publish_quality_floor}`} />
              <Row label="Slug cooldown" value={`${settings.pinterest_publish_min_slug_gap_minutes} min`} />
              <Row label="Hourly cap" value={`${tierCap} / hr`} />
              <Row label="Hook cooldown" value={`${settings.hook_cooldown_days} days`} />
              <Row
                label="Thumbnail pHash distance"
                value={`≤ ${settings.thumbnail_phash_distance_threshold} → reject`}
              />
              <Row
                label="Board diversification"
                value={`max ${settings.board_max_pins_per_window} pins / ${settings.board_recent_window_minutes}min`}
              />
            </dl>
          </Card>

          {/* Recovery tier ladder */}
          <Card className="p-4">
            <h2 className="font-semibold mb-3 text-sm">Recovery Tier Ladder</h2>
            <div className="flex gap-3 flex-wrap">
              {Object.entries(settings.recovery_tier_progression ?? {}).map(([k, v]) => {
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
            <p className="text-[11px] text-muted-foreground mt-2">
              Settings last updated: {new Date(settings.updated_at).toLocaleString()}
            </p>
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