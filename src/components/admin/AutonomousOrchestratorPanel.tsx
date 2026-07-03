import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, RefreshCw, Wrench, Activity, Bot, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Mode = "AI_MODE" | "DETERMINISTIC_MODE";

interface StatusPayload {
  mode: {
    mode: Mode;
    ai_paused: boolean;
    publishing_paused: boolean;
    credit_state: string;
    estimated_credits_pct: number;
    last_success_at: string | null;
    last_402_at: string | null;
  };
  pacing: {
    pins_last_24h: number;
    pins_last_hour: number;
    videos_last_24h: number;
    approved_inventory: number;
    waiting_ai_inventory: number;
    daily_pin_target: number;
    daily_video_target: number;
    hourly_pin_ceiling: number;
  };
  headroom: {
    estimated_days_publishing_headroom: number;
    next_ai_wake_trigger: string;
    should_wake_ai_now: boolean;
    publishing_can_continue: boolean;
  };
  recent_ticks: Array<{ created_at: string; payload: any }>;
  modules_reused: string[];
}

function Kpi({ label, value, tone = "default", sub }: { label: string; value: string | number; tone?: "default" | "success" | "warn" | "danger"; sub?: string }) {
  const toneCls =
    tone === "success" ? "text-emerald-600"
    : tone === "warn" ? "text-amber-600"
    : tone === "danger" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${toneCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export function AutonomousOrchestratorPanel() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "run" | "heal" | "score">(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("pinterest-autonomous-orchestrator", {
      body: { action: "status" },
    });
    if (error) {
      toast.error(`Orchestrator status failed: ${error.message}`);
    } else if (data?.ok) {
      setStatus(data as StatusPayload);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  const run = async (action: "run" | "heal" | "score") => {
    setBusy(action);
    const { data, error } = await supabase.functions.invoke("pinterest-autonomous-orchestrator", { body: { action } });
    if (error) toast.error(`${action} failed: ${error.message}`);
    else if (!data?.ok) toast.error(`${action} failed: ${data?.error ?? "unknown"}`);
    else toast.success(`${action} completed`);
    setBusy(null);
    load();
  };

  if (loading && !status) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading autonomous orchestrator…
      </Card>
    );
  }
  if (!status) return null;

  const { mode, pacing, headroom, recent_ticks, modules_reused } = status;
  const isAiMode = mode.mode === "AI_MODE";

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <h2 className="font-semibold">Autonomous Publish Orchestrator</h2>
          <Badge variant={isAiMode ? "default" : "secondary"} className="ml-1">
            {isAiMode ? <ShieldCheck className="h-3 w-3 mr-1" /> : <ShieldAlert className="h-3 w-3 mr-1" />}
            {mode.mode.replace("_", " ")}
          </Badge>
          {mode.publishing_paused && <Badge variant="destructive">Publisher paused</Badge>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" variant="secondary" onClick={() => run("score")} disabled={busy !== null}>
            {busy === "score" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Activity className="h-4 w-4 mr-1.5" />}
            Score
          </Button>
          <Button size="sm" variant="outline" onClick={() => run("heal")} disabled={busy !== null}>
            {busy === "heal" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Wrench className="h-4 w-4 mr-1.5" />}
            Heal
          </Button>
          <Button size="sm" onClick={() => run("run")} disabled={busy !== null}>
            {busy === "run" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />}
            Run tick
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <Kpi label="AI credits" value={`${mode.estimated_credits_pct}%`} tone={mode.estimated_credits_pct > 20 ? "success" : "danger"} />
        <Kpi label="Approved inventory" value={pacing.approved_inventory} tone={pacing.approved_inventory > 50 ? "success" : "warn"} />
        <Kpi label="Waiting AI" value={pacing.waiting_ai_inventory} tone="warn" />
        <Kpi label="Pins / 24h" value={`${pacing.pins_last_24h} / ${pacing.daily_pin_target}`} />
        <Kpi label="Pins / hour" value={`${pacing.pins_last_hour} / ${pacing.hourly_pin_ceiling}`} />
        <Kpi label="Videos / 24h" value={`${pacing.videos_last_24h} / ${pacing.daily_video_target}`} />
        <Kpi label="Publishing headroom" value={`${headroom.estimated_days_publishing_headroom}d`} sub={headroom.next_ai_wake_trigger} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-md border p-3">
          <div className="text-xs font-medium mb-2">Mode signal</div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>State: <span className="font-mono">{mode.credit_state}</span></div>
            <div>Last AI success: {mode.last_success_at ? new Date(mode.last_success_at).toLocaleString() : "—"}</div>
            <div>Last 402: {mode.last_402_at ? new Date(mode.last_402_at).toLocaleString() : "—"}</div>
            <div>Publishing can continue: {headroom.publishing_can_continue ? "yes" : "no"}</div>
            <div>Wake AI now: {headroom.should_wake_ai_now ? "yes" : "no"}</div>
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs font-medium mb-2">Recent autonomous ticks</div>
          {recent_ticks.length === 0 ? (
            <div className="text-xs text-muted-foreground">No ticks yet — press "Run tick" or wait for cron.</div>
          ) : (
            <ul className="text-xs space-y-1 max-h-40 overflow-auto">
              {recent_ticks.map((t, i) => (
                <li key={i} className="font-mono">
                  {new Date(t.created_at).toLocaleTimeString()} · {t.payload?.mode ?? "?"} · actions={Array.isArray(t.payload?.actions) ? t.payload.actions.length : 0}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Modules reused ({modules_reused.length}) — no duplicate systems</summary>
        <div className="mt-2 flex flex-wrap gap-1">
          {modules_reused.map((m) => (
            <span key={m} className="px-2 py-0.5 rounded bg-muted font-mono text-[10px]">{m}</span>
          ))}
        </div>
      </details>
    </Card>
  );
}