import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type HealthResp = {
  ok: boolean;
  snapshot?: any;
  workerHealth?: { ok: boolean; data?: any; error?: string };
  secrets?: Record<string, boolean>;
  ghPat?: { source: string; updatedAt: string | null };
  message?: string;
  code?: string;
};

const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
  const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", {
    body: { action, ...extra },
  });
  if (error) throw error;
  return data as HealthResp;
};

const fmtAge = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
};

const WorkerRecoveryPage = () => {
  const [health, setHealth] = useState<HealthResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke("health");
      setHealth(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load worker health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const run = async (label: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusyAction(action);
    try {
      const res = await invoke(action, extra);
      toast.success(`${label}: ${JSON.stringify(res).slice(0, 160)}`);
      await refresh();
    } catch (e: any) {
      toast.error(`${label} failed: ${e?.message ?? "unknown"}`);
    } finally {
      setBusyAction(null);
    }
  };

  const snap = health?.snapshot ?? {};
  const wh = health?.workerHealth ?? null;
  const live = !!snap?.workerLive;
  const secrets = health?.secrets ?? {};
  const missingSecrets = Object.entries(secrets).filter(([, v]) => !v).map(([k]) => k);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Worker Recovery</h1>
          <p className="text-sm text-muted-foreground">
            Cinematic render worker liveness, queue depth, and emergency GitHub Actions fallback.
          </p>
        </div>
        <Button onClick={refresh} disabled={loading} variant="outline">
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </header>

      {health?.code === "MISSING_SECRETS" && (
        <Card className="p-4 border-destructive">
          <h2 className="font-semibold text-destructive">Missing secrets</h2>
          <p className="text-sm">{health.message}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Worker</div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={live ? "default" : "destructive"}>
              {live ? "ONLINE" : "OFFLINE"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              heartbeat {fmtAge(snap?.lastHeartbeatAt ?? snap?.lastClaimAt)}
            </span>
          </div>
          <div className="mt-2 text-xs">
            Last claim: <code>{fmtAge(snap?.lastClaimAt)}</code>
          </div>
          <div className="text-xs">
            Last complete: <code>{fmtAge(snap?.lastCompleteAt)}</code>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Queue</div>
          <div className="text-3xl font-bold mt-1">{snap?.queueDepth ?? "—"}</div>
          <div className="text-xs text-muted-foreground">
            rendering: {snap?.rendering ?? 0} · stale: {snap?.staleCount ?? snap?.stale?.length ?? 0}
          </div>
          <div className="text-xs text-muted-foreground">
            failed (24h): {snap?.failedRecent ?? snap?.failed24h ?? "—"}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Deployment</div>
          <div className="mt-1">
            <Badge variant={wh?.ok ? "default" : "destructive"}>
              {wh?.ok ? "Healthy" : wh?.error ? "Unreachable" : "Unknown"}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            GH_PAT source: {health?.ghPat?.source ?? "—"}
          </div>
          {missingSecrets.length > 0 && (
            <div className="text-xs text-destructive mt-2">
              Missing: {missingSecrets.join(", ")}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Emergency Recovery</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Worker offline? Use the GitHub Actions fallback to dispatch all queued renders.
          Recovery actions are idempotent and safe to run multiple times.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => run("Heal stuck jobs", "auto_heal_stuck")}
            disabled={!!busyAction}
            variant="default"
          >
            Heal stuck jobs
          </Button>
          <Button
            onClick={() => run("Reset stale (timed_out / >10m)", "reset_stale")}
            disabled={!!busyAction}
            variant="outline"
          >
            Reset stale → render_queued
          </Button>
          <Button
            onClick={() => run("Dispatch all queued via GitHub Actions", "render_all_queued")}
            disabled={!!busyAction}
            variant="default"
          >
            Dispatch all queued (GH fallback)
          </Button>
          <Button
            onClick={() => run("Mark stale", "mark_stale")}
            disabled={!!busyAction}
            variant="ghost"
          >
            Mark stale
          </Button>
          <Button
            onClick={() => run("Validate GitHub secrets", "validate_github_secrets")}
            disabled={!!busyAction}
            variant="ghost"
          >
            Validate GitHub secrets
          </Button>
          <Button
            onClick={() => run("Validate PAT", "validate_github_pat")}
            disabled={!!busyAction}
            variant="ghost"
          >
            Validate PAT
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Secret presence</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          {Object.entries(secrets).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <Badge variant={v ? "default" : "destructive"}>{v ? "✓" : "✗"}</Badge>
              <code>{k}</code>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold mb-2">Raw snapshot</h2>
        <pre className="text-[10px] bg-muted p-3 rounded overflow-auto max-h-96">
          {JSON.stringify(health, null, 2)}
        </pre>
      </Card>
    </div>
  );
};

export default WorkerRecoveryPage;