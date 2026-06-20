import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Activity, RefreshCw, Wrench, Siren, Loader2 } from "lucide-react";

type Snapshot = {
  created_at: string;
  videos_generated_24h: number;
  pins_generated_24h: number;
  pins_published_24h: number;
  pending_videos: number;
  pending_pins: number;
  failed_24h: number;
  recovered_24h: number;
  avg_render_ms: number | null;
  publish_rate_per_hour: number | null;
  last_video_at: string | null;
  last_pin_at: string | null;
  health_score: number;
  mode: string;
  reasons: Array<{ key: string; impact: number; detail?: string }>;
};

type Failure = {
  id: string;
  source: string;
  job_type: string;
  error_message: string | null;
  attempt: number;
  next_retry_at: string | null;
  escalated_at: string | null;
  created_at: string;
};

type Recovery = {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger: string;
  outcome: string | null;
  health_before: number | null;
  health_after: number | null;
  actions: Array<{ name: string; ok: boolean; detail?: string }>;
};

const ageStr = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
};

const modeVariant = (mode: string): "default" | "secondary" | "destructive" | "outline" => {
  if (mode === "emergency") return "destructive";
  if (mode === "recovery") return "secondary";
  if (mode === "light_render") return "outline";
  return "default";
};

export default function PipelineSelfHealingPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pipeline-health-dashboard");
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.message ?? "Failed");
      setSnapshot((data as any).snapshot ?? null);
      setFailures((data as any).open_failures ?? []);
      setRecoveries((data as any).recovery_runs ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load pipeline health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const run = async (fn: string, label: string) => {
    setBusy(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: { trigger: "manual" } });
      if (error) throw error;
      toast.success(`${label}: ${JSON.stringify(data).slice(0, 140)}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  };

  const score = snapshot?.health_score ?? 100;
  const mode = snapshot?.mode ?? "normal";
  const scoreColor =
    score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Self-Healing Pinterest Engine
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={modeVariant(mode)}>{mode.toUpperCase()}</Badge>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-6">
          <div>
            <div className={`text-5xl font-bold tabular-nums ${scoreColor}`}>{score}</div>
            <div className="text-xs text-muted-foreground">Pipeline Health Score</div>
          </div>
          {snapshot?.reasons?.length ? (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {snapshot.reasons.slice(0, 4).map((r) => (
                <li key={r.key}>
                  <span className="font-mono">{r.impact}</span> {r.key}
                  {r.detail ? ` (${r.detail})` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Stat label="Videos 24h" value={snapshot?.videos_generated_24h ?? 0} />
          <Stat label="Pins gen 24h" value={snapshot?.pins_generated_24h ?? 0} />
          <Stat label="Pins pub 24h" value={snapshot?.pins_published_24h ?? 0} />
          <Stat label="Publish/h" value={snapshot?.publish_rate_per_hour ?? 0} />
          <Stat label="Pending videos" value={snapshot?.pending_videos ?? 0} />
          <Stat label="Pending pins" value={snapshot?.pending_pins ?? 0} />
          <Stat label="Failed 24h" value={snapshot?.failed_24h ?? 0} />
          <Stat label="Recovered 24h" value={snapshot?.recovered_24h ?? 0} />
          <Stat label="Last video" value={ageStr(snapshot?.last_video_at ?? null)} />
          <Stat label="Last pin" value={ageStr(snapshot?.last_pin_at ?? null)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("pipeline-health-monitor", "Health check")}>
            {busy === "pipeline-health-monitor" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Activity className="h-3.5 w-3.5 mr-1" />}
            Force health check
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("pipeline-recovery-run", "Recovery run")}>
            {busy === "pipeline-recovery-run" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Wrench className="h-3.5 w-3.5 mr-1" />}
            Run recovery
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("pipeline-emergency-content", "Emergency content")}>
            {busy === "pipeline-emergency-content" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Siren className="h-3.5 w-3.5 mr-1" />}
            Emergency content
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("pipeline-failure-retry", "Retry failures")}>
            {busy === "pipeline-failure-retry" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Retry failures
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold mb-1 uppercase text-muted-foreground">Open failures ({failures.length})</div>
            <div className="space-y-1 max-h-64 overflow-auto pr-1">
              {failures.length === 0 ? (
                <div className="text-xs text-muted-foreground">No open failures.</div>
              ) : failures.map((f) => (
                <div key={f.id} className="text-xs border rounded p-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono">{f.source}/{f.job_type}</span>
                    <span className="text-muted-foreground">a{f.attempt} · {ageStr(f.created_at)}</span>
                  </div>
                  {f.error_message ? <div className="text-muted-foreground truncate">{f.error_message}</div> : null}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold mb-1 uppercase text-muted-foreground">Recent recovery runs</div>
            <div className="space-y-1 max-h-64 overflow-auto pr-1">
              {recoveries.length === 0 ? (
                <div className="text-xs text-muted-foreground">No runs yet.</div>
              ) : recoveries.map((r) => (
                <div key={r.id} className="text-xs border rounded p-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono">{r.trigger}</span>
                    <span className="text-muted-foreground">{ageStr(r.started_at)}</span>
                  </div>
                  <div className="text-muted-foreground truncate">
                    {r.outcome ?? "running"} · health {r.health_before ?? "?"}→{r.health_after ?? "?"} · {(r.actions ?? []).length} actions
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}