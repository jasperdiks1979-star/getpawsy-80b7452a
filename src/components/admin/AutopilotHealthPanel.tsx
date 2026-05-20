import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Play, ShieldAlert, ShieldCheck, ShieldOff, Activity } from "lucide-react";

type DashboardSnapshot = {
  overall: "healthy" | "degraded" | "blocked" | "paused";
  paused: boolean;
  paused_reason: string | null;
  hard_stop_reasons: string[];
  active_jobs: number;
  recovered_today: number;
  failed_after_retries: number;
  needs_review: number;
  current_blocker: string | null;
  last_watchdog_run_at: string | null;
  next_watchdog_run_estimate: string | null;
};

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(ms);
  const sec = Math.round(abs / 1000);
  if (sec < 60) return `${ms >= 0 ? "" : "in "}${sec}s${ms >= 0 ? " ago" : ""}`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${ms >= 0 ? "" : "in "}${min}m${ms >= 0 ? " ago" : ""}`;
  const hr = Math.round(min / 60);
  return `${ms >= 0 ? "" : "in "}${hr}h${ms >= 0 ? " ago" : ""}`;
}

function overallStyle(overall: DashboardSnapshot["overall"]) {
  switch (overall) {
    case "healthy":
      return { variant: "secondary" as const, icon: ShieldCheck, label: "Healthy", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" };
    case "degraded":
      return { variant: "secondary" as const, icon: ShieldAlert, label: "Degraded", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
    case "blocked":
      return { variant: "destructive" as const, icon: ShieldOff, label: "Blocked", className: "" };
    case "paused":
      return { variant: "outline" as const, icon: ShieldOff, label: "Paused", className: "" };
  }
}

export default function AutopilotHealthPanel() {
  const [snap, setSnap] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);

  const fetchSnap = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("cinematic_autopilot_dashboard");
      if (error) throw error;
      setSnap(data as unknown as DashboardSnapshot);
    } catch (e) {
      console.error("[autopilot-health] fetch failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnap();
    const id = window.setInterval(fetchSnap, 15_000);
    return () => window.clearInterval(id);
  }, [fetchSnap]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-watchdog", {
        body: { force: true },
      });
      if (error) throw error;
      const r = (data as any)?.result;
      toast.success("Autopilot ran", {
        description: r
          ? `recovered ${r.recovered?.length ?? 0} · redispatched ${r.redispatched?.filter((x: any) => x.ok).length ?? 0} · retried ${r.retried?.length ?? 0} · quarantined ${r.quarantined?.length ?? 0} · diagnosed ${r.diagnosed?.length ?? 0} · emailed ${r.emailed?.filter((x: any) => x.ok).length ?? 0}`
          : "no detail",
      });
      await fetchSnap();
    } catch (e) {
      toast.error("Autopilot run failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  const togglePause = async (next: boolean) => {
    setTogglingPause(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("cinematic_autopilot_state")
        .update({
          paused: next,
          paused_at: next ? new Date().toISOString() : null,
          paused_by: next ? userData.user?.id ?? null : null,
          paused_reason: next ? "paused by admin" : null,
        })
        .eq("id", 1);
      if (error) throw error;
      toast.success(next ? "Autopilot paused" : "Autopilot resumed");
      await fetchSnap();
    } catch (e) {
      toast.error("Toggle failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setTogglingPause(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading autopilot health…
        </CardContent>
      </Card>
    );
  }

  if (!snap) return null;

  const style = overallStyle(snap.overall);
  const Icon = style.icon;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Autopilot Health</h2>
            </div>
            <Badge variant={style.variant} className={`gap-1 ${style.className}`}>
              <Icon className="h-3 w-3" /> {style.label}
            </Badge>
            {snap.current_blocker && (
              <span className="text-xs text-muted-foreground">· {snap.current_blocker}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Pause</span>
              <Switch checked={snap.paused} onCheckedChange={togglePause} disabled={togglingPause} />
            </div>
            <Button size="sm" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Run Autopilot Now
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
          <Metric label="Active jobs" value={snap.active_jobs} />
          <Metric label="Recovered (24h)" value={snap.recovered_today} tone={snap.recovered_today > 0 ? "good" : "muted"} />
          <Metric label="Needs review" value={snap.needs_review} tone={snap.needs_review > 0 ? "warn" : "muted"} />
          <Metric label="Last run" value={fmtRelative(snap.last_watchdog_run_at)} />
          <Metric label="Next run" value={fmtRelative(snap.next_watchdog_run_estimate)} />
        </div>

        {snap.hard_stop_reasons.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
            <div className="font-medium text-destructive">Hard stop active — auto-recovery paused</div>
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              {snap.hard_stop_reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "good" | "warn" | "muted" }) {
  const cls = tone === "good" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : tone === "muted" ? "text-muted-foreground"
    : "text-foreground";
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
