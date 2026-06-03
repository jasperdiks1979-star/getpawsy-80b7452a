import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw } from "lucide-react";

type Light = "green" | "orange" | "red" | "muted";

const fmtAge = (iso: string | null | undefined): string => {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
};

const dot = (l: Light) => {
  const cls =
    l === "green" ? "bg-emerald-500" :
    l === "orange" ? "bg-amber-500" :
    l === "red" ? "bg-red-500" : "bg-muted";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} aria-hidden />;
};

type State = {
  loading: boolean;
  workerLive: boolean;
  heartbeatAt: string | null;
  lastClaimAt: string | null;
  lastCompleteAt: string | null;
  lastPinterestAt: string | null;
  queue: {
    render_queued: number;
    rendering: number;
    publishable: number;
    failed: number;
    needs_admin_review: number;
  };
  secretsAllPresent: boolean;
  ghOk: boolean;
};

const PipelineHealthBanner = () => {
  const [state, setState] = useState<State>({
    loading: true,
    workerLive: false,
    heartbeatAt: null,
    lastClaimAt: null,
    lastCompleteAt: null,
    lastPinterestAt: null,
    queue: { render_queued: 0, rendering: 0, publishable: 0, failed: 0, needs_admin_review: 0 },
    secretsAllPresent: false,
    ghOk: false,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const [{ data: health }, { data: pinRow }, { data: queueRows }] = await Promise.all([
        supabase.functions.invoke("cinematic-ad-worker-control", { body: { action: "health" } }),
        supabase
          .from("cinematic_ad_jobs")
          .select("pushed_to_pinterest_at")
          .not("pushed_to_pinterest_at", "is", null)
          .order("pushed_to_pinterest_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("cinematic_ad_jobs")
          .select("status")
          .in("status", ["render_queued", "rendering", "publishable", "failed", "needs_admin_review"]),
      ]);

      const snap = (health as any)?.snapshot ?? {};
      const secrets = (health as any)?.secrets ?? {};
      const secretsAllPresent = Object.values(secrets).every(Boolean);
      const ghOk = !!(health as any)?.workerHealth?.ok || secretsAllPresent;

      const counts = { render_queued: 0, rendering: 0, publishable: 0, failed: 0, needs_admin_review: 0 };
      for (const r of (queueRows ?? []) as Array<{ status: keyof typeof counts }>) {
        if (counts[r.status] !== undefined) counts[r.status]++;
      }

      setState({
        loading: false,
        workerLive: !!snap.workerLive,
        heartbeatAt: snap.heartbeat?.last_poll_at ?? null,
        lastClaimAt: snap.lastClaimAt ?? null,
        lastCompleteAt: snap.lastCompleteAt ?? null,
        lastPinterestAt: (pinRow as any)?.pushed_to_pinterest_at ?? null,
        queue: counts,
        secretsAllPresent,
        ghOk,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const ageMs = (iso: string | null) => (iso ? Date.now() - new Date(iso).getTime() : Infinity);

  // Traffic lights
  const supaLight: Light = state.secretsAllPresent ? "green" : "red";
  const workerLight: Light =
    state.workerLive && ageMs(state.heartbeatAt) < 5 * 60_000 ? "green" :
    state.workerLive ? "orange" : "red";
  const pinLight: Light =
    ageMs(state.lastPinterestAt) < 24 * 3_600_000 ? "green" :
    ageMs(state.lastPinterestAt) < 7 * 86_400_000 ? "orange" : "red";
  const ghLight: Light = state.ghOk ? "green" : "orange";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Pipeline Health</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={state.loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${state.loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <PipelineCell label="Supabase" light={supaLight} detail={state.secretsAllPresent ? "secrets ok" : "missing secrets"} />
        <PipelineCell label="Render Worker" light={workerLight} detail={state.workerLive ? `hb ${fmtAge(state.heartbeatAt)}` : "offline"} />
        <PipelineCell label="Pinterest" light={pinLight} detail={`last ${fmtAge(state.lastPinterestAt)}`} />
        <PipelineCell label="GitHub Actions" light={ghLight} detail={state.ghOk ? "ready" : "check secrets"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Stat label="Worker">
          <div><Badge variant={state.workerLive ? "default" : "destructive"}>{state.workerLive ? "ONLINE" : "OFFLINE"}</Badge></div>
          <div className="text-muted-foreground mt-1">heartbeat {fmtAge(state.heartbeatAt)}</div>
          <div className="text-muted-foreground">last claim {fmtAge(state.lastClaimAt)}</div>
          <div className="text-muted-foreground">last render {fmtAge(state.lastCompleteAt)}</div>
          <div className="text-muted-foreground">last pin {fmtAge(state.lastPinterestAt)}</div>
        </Stat>
        <Stat label="Queue">
          <Row k="render_queued" v={state.queue.render_queued} />
          <Row k="rendering" v={state.queue.rendering} />
          <Row k="publishable" v={state.queue.publishable} />
          <Row k="failed" v={state.queue.failed} />
          <Row k="needs_review" v={state.queue.needs_admin_review} />
        </Stat>
        <Stat label="Auto-recovery">
          <div className="text-muted-foreground">cron sweep every 5m</div>
          <div className="text-muted-foreground">render_queued &gt; 10m → retry</div>
          <div className="text-muted-foreground">rendering &gt; 20m → reset</div>
        </Stat>
        <Stat label="Drift guard">
          <div className="text-muted-foreground">JWT role check on boot</div>
          <div className="text-muted-foreground">project ref match enforced</div>
          <div className="text-muted-foreground">no secrets in logs</div>
        </Stat>
      </div>
    </Card>
  );
};

const PipelineCell = ({ label, light, detail }: { label: string; light: Light; detail: string }) => (
  <div className="flex items-center gap-2 rounded-md border p-2.5">
    {dot(light)}
    <div className="min-w-0">
      <div className="text-xs font-medium truncate">{label}</div>
      <div className="text-[10px] text-muted-foreground truncate">{detail}</div>
    </div>
  </div>
);

const Stat = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="rounded-md border p-2.5">
    <div className="text-[10px] uppercase text-muted-foreground mb-1.5">{label}</div>
    {children}
  </div>
);

const Row = ({ k, v }: { k: string; v: number }) => (
  <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>
);

export default PipelineHealthBanner;