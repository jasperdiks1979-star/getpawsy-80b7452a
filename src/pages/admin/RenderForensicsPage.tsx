import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Snapshot = {
  ok: boolean;
  now: string;
  workers: {
    live_count: number;
    zombie_count: number;
    dead_count: number;
    total_known: number;
    live: Array<{ worker_id: string; updated_at: string; last_claim_at: string | null; last_job_id: string | null }>;
    zombies: Array<{ worker_id: string; updated_at: string }>;
    dead: Array<{ worker_id: string; updated_at: string | null }>;
  };
  queue: {
    render_queued: number;
    render_queued_stale_30m: number;
    rendering: number;
    zombies_rendering_10m: number;
    gh_actions_12m_timeouts: number;
  };
  throughput: {
    rendered_24h: number;
    failed_24h: number;
    avg_render_seconds_24h: number | null;
    missing_output_mp4: number;
  };
  recent_jobs: Array<{
    id: string;
    status: string;
    product_slug: string;
    render_worker_id: string | null;
    render_queued_at: string | null;
    render_started_at: string | null;
    render_heartbeat_at: string | null;
    render_complete_at: string | null;
    output_mp4_url: string | null;
    render_attempts: number;
    error_message: string | null;
    admin_review_reason: string | null;
    updated_at: string;
  }>;
};

function ageMin(iso: string | null): string {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const STATUS_TONE: Record<string, string> = {
  render_queued: "bg-blue-500/15 text-blue-700",
  rendering: "bg-amber-500/15 text-amber-700",
  publishable: "bg-emerald-500/15 text-emerald-700",
  awaiting_approval: "bg-emerald-500/15 text-emerald-700",
  failed: "bg-red-500/15 text-red-700",
  needs_admin_review: "bg-orange-500/15 text-orange-700",
};

export default function RenderForensicsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selftest, setSelftest] = useState<any | null>(null);
  const [selftestBusy, setSelftestBusy] = useState(false);
  const [restartResult, setRestartResult] = useState<any | null>(null);
  const [restartBusy, setRestartBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke<Snapshot>("render-forensics", {
        body: {},
      });
      if (error) throw error;
      if (res) setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load forensics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const callAction = async (action: "kill_zombies" | "requeue_stale") => {
    setBusy(action);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/render-forensics?action=${action}`;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(body?.message ?? "action failed");
      const count = body.killed ?? body.requeued ?? 0;
      toast.success(`${action}: ${count} jobs affected`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "action failed");
    } finally {
      setBusy(null);
    }
  };

  const triggerWatchdog = async () => {
    setBusy("watchdog");
    try {
      const { error } = await supabase.functions.invoke("cinematic-ad-watchdog", {
        body: { force: true },
      });
      if (error) throw error;
      toast.success("Watchdog run kicked off");
      setTimeout(refresh, 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "watchdog failed");
    } finally {
      setBusy(null);
    }
  };

  const runSelftest = async () => {
    setSelftestBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("render-worker-selftest", { body: {} });
      if (error) throw error;
      setSelftest(res);
      if (res?.ok) toast.success("Self-test passed");
      else toast.error("Self-test failed — see per-step results");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "self-test failed");
    } finally {
      setSelftestBusy(false);
    }
  };

  const restartRenderWorker = async () => {
    setRestartBusy(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("render-worker-restart", { body: {} });
      if (error) throw error;
      setRestartResult(res);
      if ((res as any)?.ok) {
        toast.success("Render worker deploy triggered — new container in ~60s");
      } else {
        toast.error((res as any)?.message ?? "Restart failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "restart failed");
    } finally {
      setRestartBusy(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <Helmet>
        <title>Render Forensics — GetPawsy Admin</title>
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Render Infrastructure Forensics</h1>
          <p className="text-sm text-muted-foreground">
            Live view of worker heartbeats, queue depth, zombies & 12-min GitHub Actions timeouts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="secondary" size="sm" onClick={runSelftest} disabled={selftestBusy}>
            {selftestBusy ? "Testing…" : "Run worker self-test"}
          </Button>
          <Button variant="secondary" size="sm" onClick={restartRenderWorker} disabled={restartBusy}>
            {restartBusy ? "Restarting…" : "Restart Render worker"}
          </Button>
          <Button variant="outline" size="sm" onClick={triggerWatchdog} disabled={busy === "watchdog"}>
            Run watchdog now
          </Button>
          <Button variant="outline" size="sm" onClick={() => callAction("kill_zombies")} disabled={busy === "kill_zombies"}>
            Kill zombies
          </Button>
          <Button variant="default" size="sm" onClick={() => callAction("requeue_stale")} disabled={busy === "requeue_stale"}>
            Requeue GH timeouts
          </Button>
        </div>
      </header>

      {selftest && (
        <Card className={selftest.ok ? "border-emerald-500/40" : "border-red-500/40"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Render worker self-test</span>
              <Badge variant="outline" className={selftest.ok ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700"}>
                {selftest.ok ? "PASS" : "FAIL"}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">trace {selftest.traceId}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{selftest.summary}</p>
            <div className="rounded border bg-muted/30 p-3 font-mono text-xs">
              <div><strong>env var:</strong> {selftest.cloud_secret?.env_var}</div>
              <div><strong>configured:</strong> {String(selftest.cloud_secret?.configured)}</div>
              <div><strong>length:</strong> {selftest.cloud_secret?.fingerprint?.length}</div>
              <div><strong>sha256_prefix:</strong> {selftest.cloud_secret?.fingerprint?.sha256_prefix ?? "—"}</div>
              <div><strong>has_leading_ws:</strong> {String(selftest.cloud_secret?.fingerprint?.has_leading_ws)}</div>
              <div><strong>has_trailing_ws:</strong> {String(selftest.cloud_secret?.fingerprint?.has_trailing_ws)}</div>
              <div><strong>has_quotes:</strong> {String(selftest.cloud_secret?.fingerprint?.has_quotes)}</div>
              <div className="text-muted-foreground mt-1">Compare these to the Render.com worker startup log fingerprint.</div>
            </div>
            {(selftest.steps ?? []).map((s: any, i: number) => (
              <div key={i} className="rounded border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={
                    s.http_status === 200 ? "bg-emerald-500/15 text-emerald-700"
                    : s.ok ? "bg-amber-500/15 text-amber-700"
                    : "bg-red-500/15 text-red-700"
                  }>
                    {s.http_status || "ERR"}
                  </Badge>
                  <strong>Step {i + 1}: {s.name}</strong>
                  <Badge variant="outline" className={s.ok ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700"}>
                    {s.ok ? "OK" : "FAIL"}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">{s.duration_ms}ms</span>
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  function: <span className="text-foreground">{s.function}</span>
                  {"  ·  "}env: <span className="text-foreground">{s.env_var}</span>
                  {s.traceId && <> {"  ·  "}trace: <span className="text-foreground">{s.traceId}</span></>}
                </div>
                <div className="text-xs"><strong>Expected:</strong> {s.expected}</div>
                <div className="text-xs"><strong>Message:</strong> {s.message}</div>
                {s.http_status === 401 && (
                  <div className="text-xs text-red-700">
                    401 = the {s.function} function read a different RENDER_WORKER_SECRET than the caller sent.
                    Both sides read from Lovable Cloud env, so the function is likely running on stale boot env — redeploy it.
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {restartResult && (
        <Card className={restartResult.ok ? "border-emerald-500/40" : "border-red-500/40"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>Render worker restart</span>
              <Badge variant="outline" className={restartResult.ok ? "bg-emerald-500/15 text-emerald-700" : "bg-red-500/15 text-red-700"}>
                {restartResult.ok ? "TRIGGERED" : "FAILED"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="font-mono text-xs">
              <div><strong>service_id:</strong> {restartResult.service_id}</div>
              <div><strong>render api status:</strong> {restartResult.render_status}</div>
              {restartResult.deploy?.id && <div><strong>deploy_id:</strong> {restartResult.deploy.id}</div>}
            </div>
            <p className="text-muted-foreground text-xs">{restartResult.note ?? restartResult.message}</p>
          </CardContent>
        </Card>
      )}

      {!data ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Loading…</CardContent></Card>
      ) : (
        <>
          {data.workers.live_count === 0 && (
            <Card className="border-red-500/40 bg-red-500/5">
              <CardContent className="py-4 text-sm">
                <strong className="text-red-700">No live render workers.</strong>{" "}
                External Render.com worker is offline (no heartbeats in the last 5 minutes). New jobs in
                <code className="mx-1">render_queued</code> will sit until either the external worker comes
                back online or a GitHub Actions workflow is dispatched for each job.
              </CardContent>
            </Card>
          )}

          <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Metric label="Live workers" value={data.workers.live_count} tone={data.workers.live_count > 0 ? "ok" : "bad"} />
            <Metric label="Zombie workers" value={data.workers.zombie_count} tone={data.workers.zombie_count > 0 ? "warn" : "ok"} />
            <Metric label="Render queued" value={data.queue.render_queued} sub={`${data.queue.render_queued_stale_30m} stale >30m`} />
            <Metric label="Currently rendering" value={data.queue.rendering} sub={`${data.queue.zombies_rendering_10m} zombies >10m`} tone={data.queue.zombies_rendering_10m > 0 ? "bad" : "ok"} />
            <Metric label="Failed (24h)" value={data.throughput.failed_24h} tone={data.throughput.failed_24h > 5 ? "warn" : "ok"} />
            <Metric label="Avg render (24h)" value={data.throughput.avg_render_seconds_24h != null ? `${Math.round(data.throughput.avg_render_seconds_24h)}s` : "—"} />
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <Metric label="GH 12-min timeouts" value={data.queue.gh_actions_12m_timeouts} tone={data.queue.gh_actions_12m_timeouts > 0 ? "warn" : "ok"} sub="Use Requeue button" />
            <Metric label="Rendered (24h)" value={data.throughput.rendered_24h} tone="ok" />
            <Metric label="Missing output_mp4" value={data.throughput.missing_output_mp4} tone={data.throughput.missing_output_mp4 > 0 ? "bad" : "ok"} sub="completion blocked by trigger" />
          </section>

          <Card>
            <CardHeader><CardTitle>Workers</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.workers.live.length === 0 && data.workers.zombies.length === 0 && data.workers.dead.length === 0 && (
                <p className="text-sm text-muted-foreground">No heartbeats recorded yet. Confirm the external worker has <code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> and <code>RENDER_WORKER_SECRET</code> set.</p>
              )}
              {[...data.workers.live, ...data.workers.zombies, ...data.workers.dead].map((w) => {
                const live = data.workers.live.includes(w as never);
                const zombie = data.workers.zombies.includes(w as never);
                return (
                  <div key={w.worker_id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={live ? "bg-emerald-500/15 text-emerald-700" : zombie ? "bg-amber-500/15 text-amber-700" : "bg-red-500/15 text-red-700"}>
                        {live ? "LIVE" : zombie ? "ZOMBIE" : "DEAD"}
                      </Badge>
                      <span className="font-mono">{w.worker_id}</span>
                    </div>
                    <span className="text-muted-foreground">heartbeat {ageMin(w.updated_at)} ago</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent jobs</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Product</th>
                    <th className="px-2 py-1">Worker</th>
                    <th className="px-2 py-1">Queued</th>
                    <th className="px-2 py-1">Started</th>
                    <th className="px-2 py-1">Heartbeat</th>
                    <th className="px-2 py-1">Completed</th>
                    <th className="px-2 py-1">MP4</th>
                    <th className="px-2 py-1">Attempts</th>
                    <th className="px-2 py-1">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_jobs.map((j) => (
                    <tr key={j.id} className="border-t">
                      <td className="px-2 py-1">
                        <Badge variant="outline" className={STATUS_TONE[j.status] ?? ""}>{j.status}</Badge>
                      </td>
                      <td className="px-2 py-1 font-mono text-xs">{j.product_slug?.slice(0, 28)}</td>
                      <td className="px-2 py-1 font-mono text-xs">{j.render_worker_id ?? "—"}</td>
                      <td className="px-2 py-1">{ageMin(j.render_queued_at)}</td>
                      <td className="px-2 py-1">{ageMin(j.render_started_at)}</td>
                      <td className="px-2 py-1">{ageMin(j.render_heartbeat_at)}</td>
                      <td className="px-2 py-1">{ageMin(j.render_complete_at)}</td>
                      <td className="px-2 py-1">
                        {j.output_mp4_url ? <a className="text-primary underline" href={j.output_mp4_url} target="_blank" rel="noreferrer">view</a> : "—"}
                      </td>
                      <td className="px-2 py-1 text-center">{j.render_attempts}</td>
                      <td className="px-2 py-1 text-xs text-muted-foreground max-w-[18ch] truncate" title={j.error_message ?? j.admin_review_reason ?? ""}>
                        {j.error_message ?? j.admin_review_reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "ok" | "warn" | "bad" }) {
  const toneCls = tone === "bad" ? "border-red-500/40" : tone === "warn" ? "border-amber-500/40" : "border-emerald-500/30";
  return (
    <Card className={tone ? toneCls : ""}>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
