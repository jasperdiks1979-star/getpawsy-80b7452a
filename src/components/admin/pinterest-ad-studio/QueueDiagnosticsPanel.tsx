import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";

type QueueHealth = {
  queued_count: number;
  active_rendering_count: number;
  active_render_count: number;
  max_render_slots: number;
  waiting_jobs: number;
  oldest_waiting_at: string | null;
  oldest_waiting_age_seconds: number | null;
  last_worker_heartbeat_at: string | null;
  last_worker_heartbeat_age_seconds: number | null;
  oldest_queued_age_seconds: number | null;
};

function fmtAge(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * Live render-queue diagnostics surfaced inside Pinterest Ad Studio so
 * directors can see at a glance whether their concepts will actually
 * render or just park in `queue_waiting` because the queue is saturated
 * by zombie jobs. Auto-refreshes every 15s.
 */
export default function QueueDiagnosticsPanel() {
  const [health, setHealth] = useState<QueueHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", {
        body: { action: "health" },
      });
      if (error) throw error;
      const qh = (data as { snapshot?: { queueHealth?: QueueHealth | null } })?.snapshot?.queueHealth ?? null;
      setHealth(qh);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 15_000);
    return () => window.clearInterval(t);
  }, [load]);

  const active = health?.active_render_count ?? 0;
  const max = health?.max_render_slots ?? 6;
  const full = active >= max;
  const hbAge = health?.last_worker_heartbeat_age_seconds ?? null;
  const workerSilent = hbAge == null ? false : hbAge > 600;
  const oldestWaitAge = health?.oldest_waiting_age_seconds ?? null;
  const waitingStale = oldestWaitAge != null && oldestWaitAge > 1800;

  return (
    <Card className="border-muted">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm">Render queue diagnostics</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Live snapshot · refreshes every 15s. If <code>active_render_count</code> equals <code>max_render_slots</code>, new concepts park in <code>queue_waiting</code> until the watchdog frees a slot.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-7 px-2">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && (
          <div className="flex items-center gap-2 rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="w-3 h-3" /> {error}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Metric
            label="active / max slots"
            value={`${active} / ${max}`}
            tone={full ? "danger" : active > max * 0.75 ? "warn" : "ok"}
          />
          <Metric label="rendering" value={String(health?.active_rendering_count ?? "—")} />
          <Metric label="queued (room slot)" value={String(health?.queued_count ?? "—")} />
          <Metric
            label="waiting (parked)"
            value={String(health?.waiting_jobs ?? "—")}
            tone={waitingStale ? "warn" : undefined}
          />
          <Metric
            label="oldest waiting"
            value={fmtAge(oldestWaitAge)}
            tone={waitingStale ? "warn" : undefined}
          />
          <Metric label="oldest queued" value={fmtAge(health?.oldest_queued_age_seconds ?? null)} />
          <Metric
            label="last worker heartbeat"
            value={fmtAge(hbAge)}
            tone={workerSilent ? "warn" : hbAge != null ? "ok" : undefined}
          />
          <Metric
            label="status"
            value={full ? "queue saturated" : "accepting"}
            tone={full ? "danger" : "ok"}
          />
        </div>
        {full && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive flex items-start gap-2">
            <AlertTriangle className="w-3 h-3 mt-0.5" />
            <div>
              Render queue is full ({active}/{max}). New concepts will be parked in <code>queue_waiting</code>. The watchdog (~60s) auto-fails zombie jobs that exceed
              the 30-min unclaimed / 10-min stale-heartbeat thresholds and then promotes oldest waiting jobs.
            </div>
          </div>
        )}
        {workerSilent && (
          <div className="rounded border border-amber-500/50 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-3 h-3 mt-0.5" />
            <div>Last worker heartbeat is {fmtAge(hbAge)} old — the GitHub Actions renderer may be offline. Zombie jobs will be auto-failed by the watchdog.</div>
          </div>
        )}
        {!full && !workerSilent && health && (
          <div className="flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" /> Queue healthy — director runs should dispatch immediately.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const cls =
    tone === "danger"
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : tone === "warn"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : "border-border bg-muted/30";
  return (
    <div className={`rounded border p-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}