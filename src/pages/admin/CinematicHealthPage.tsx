import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Zap } from "lucide-react";

type StatusCount = { status: string; n: number };
type Health = {
  loading: boolean;
  statusCounts: StatusCount[];
  failureReasons: { reason: string; n: number }[];
  oldestStuck: { id: string; status: string; updated_at: string; age_min: number } | null;
  scene: { avgScenes: number; fallbackPct: number; needsRegen: number };
  render: { queued: number; rendering: number; lastHeartbeat: string | null };
  github: { lastDispatched: string | null; last422: string | null };
  pinterest: { published24h: number; lastError: string | null };
  fetchedAt: string;
};

const empty: Health = {
  loading: true,
  statusCounts: [], failureReasons: [],
  oldestStuck: null,
  scene: { avgScenes: 0, fallbackPct: 0, needsRegen: 0 },
  render: { queued: 0, rendering: 0, lastHeartbeat: null },
  github: { lastDispatched: null, last422: null },
  pinterest: { published24h: 0, lastError: null },
  fetchedAt: "",
};

function ageMin(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

export default function CinematicHealthPage() {
  const [h, setH] = useState<Health>(empty);

  const load = useCallback(async () => {
    const sb: any = supabase;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    // Pull 7d slice once; aggregate client-side (small volume — 100s of rows).
    const { data: jobs } = await sb
      .from("cinematic_ad_jobs")
      .select("id,status,error_message,storyboard,updated_at,render_heartbeat_at,render_dispatched_at,pushed_to_pinterest_at,pinterest_publish_error")
      .gte("created_at", since)
      .order("updated_at", { ascending: false })
      .limit(2000);

    const rows: any[] = jobs ?? [];
    const byStatus = new Map<string, number>();
    const byReason = new Map<string, number>();
    let sceneSum = 0, sceneN = 0, fallbackN = 0, needsRegen = 0;
    let queued = 0, rendering = 0;
    let lastHeartbeat: string | null = null;
    let lastDispatched: string | null = null;
    let last422: string | null = null;
    let published24h = 0;
    let lastPinErr: string | null = null;
    const stuckCandidates: any[] = [];
    const ago24 = Date.now() - 24 * 3600 * 1000;

    for (const r of rows) {
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
      if (r.status === "failed" && r.error_message) {
        const key = String(r.error_message).split(":")[0].slice(0, 60);
        byReason.set(key, (byReason.get(key) ?? 0) + 1);
        if (/workflow_dispatch|422/i.test(r.error_message)) last422 = r.error_message;
      }
      const sb = r.storyboard;
      const sc = Array.isArray(sb) ? sb.length : (sb?.scenes?.length ?? 0);
      if (sc > 0) { sceneSum += sc; sceneN++; }
      if (sb?.fallback_source === "product_images") fallbackN++;
      if (r.status === "needs_scene_regen") needsRegen++;
      if (r.status === "render_queued") queued++;
      if (r.status === "rendering") rendering++;
      if (r.render_heartbeat_at && (!lastHeartbeat || r.render_heartbeat_at > lastHeartbeat)) lastHeartbeat = r.render_heartbeat_at;
      if (r.render_dispatched_at && (!lastDispatched || r.render_dispatched_at > lastDispatched)) lastDispatched = r.render_dispatched_at;
      if (r.pushed_to_pinterest_at && new Date(r.pushed_to_pinterest_at).getTime() > ago24) published24h++;
      if (r.pinterest_publish_error && !lastPinErr) lastPinErr = r.pinterest_publish_error;
      if (["preparing", "prepared", "render_queued", "rendering"].includes(r.status)) stuckCandidates.push(r);
    }

    const oldest = stuckCandidates.sort((a, b) => +new Date(a.updated_at) - +new Date(b.updated_at))[0] ?? null;
    setH({
      loading: false,
      statusCounts: [...byStatus.entries()].map(([status, n]) => ({ status, n })).sort((a, b) => b.n - a.n),
      failureReasons: [...byReason.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n).slice(0, 8),
      oldestStuck: oldest ? { id: oldest.id, status: oldest.status, updated_at: oldest.updated_at, age_min: ageMin(oldest.updated_at) } : null,
      scene: {
        avgScenes: sceneN ? Math.round((sceneSum / sceneN) * 10) / 10 : 0,
        fallbackPct: sceneN ? Math.round((fallbackN / sceneN) * 100) : 0,
        needsRegen,
      },
      render: { queued, rendering, lastHeartbeat },
      github: { lastDispatched, last422 },
      pinterest: { published24h, lastError: lastPinErr },
      fetchedAt: new Date().toLocaleTimeString(),
    });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const runWatchdog = async () => {
    await supabase.functions.invoke("cinematic-ad-watchdog", { body: { force: true } });
    setTimeout(load, 1500);
  };

  const totalFailed = h.statusCounts.find((s) => s.status === "failed")?.n ?? 0;
  const totalRows = h.statusCounts.reduce((a, b) => a + b.n, 0);
  const failRate = totalRows ? Math.round((totalFailed / totalRows) * 100) : 0;
  const renderQueueOk = h.oldestStuck ? h.oldestStuck.age_min < 30 : true;
  const ghOk = !!h.github.lastDispatched && ageMin(h.github.lastDispatched) < 60 * 24;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cinematic Pipeline Health</h1>
          <p className="text-sm text-muted-foreground">Live status across scene generation, render queue, GitHub dispatch, and Pinterest publishing. Auto-refresh every 30s.</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-muted-foreground">Updated {h.fetchedAt}</span>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3 w-3 mr-1" />Refresh</Button>
          <Button size="sm" onClick={runWatchdog}><Zap className="h-3 w-3 mr-1" />Run watchdog</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <HealthCard title="Pipeline Health" ok={failRate < 30} icon={failRate < 30 ? "ok" : "warn"}>
          <div className="text-3xl font-bold">{failRate}%</div>
          <div className="text-xs text-muted-foreground mb-2">failure rate (7d, n={totalRows})</div>
          <div className="flex flex-wrap gap-1">
            {h.statusCounts.map((s) => (
              <Badge key={s.status} variant={s.status === "failed" ? "destructive" : s.status === "publishable" ? "default" : "secondary"}>{s.status}: {s.n}</Badge>
            ))}
          </div>
        </HealthCard>

        <HealthCard title="Scene Generator" ok={h.scene.needsRegen < 3} icon={h.scene.needsRegen < 3 ? "ok" : "warn"}>
          <div className="text-3xl font-bold">{h.scene.avgScenes}</div>
          <div className="text-xs text-muted-foreground mb-2">avg scenes / job</div>
          <div className="space-y-1 text-sm">
            <div>Image fallback used: <strong>{h.scene.fallbackPct}%</strong></div>
            <div>Awaiting regen: <strong>{h.scene.needsRegen}</strong></div>
          </div>
        </HealthCard>

        <HealthCard title="Render Queue" ok={renderQueueOk} icon={renderQueueOk ? "ok" : "warn"}>
          <div className="text-3xl font-bold">{h.render.queued + h.render.rendering}</div>
          <div className="text-xs text-muted-foreground mb-2">{h.render.queued} queued, {h.render.rendering} rendering</div>
          <div className="space-y-1 text-sm">
            <div>Last heartbeat: <strong>{h.render.lastHeartbeat ? `${ageMin(h.render.lastHeartbeat)} min ago` : "—"}</strong></div>
            {h.oldestStuck && (
              <div>Oldest active: <strong>{h.oldestStuck.age_min} min</strong> ({h.oldestStuck.status})</div>
            )}
          </div>
        </HealthCard>

        <HealthCard title="GitHub Dispatch" ok={ghOk} icon={ghOk ? "ok" : "warn"}>
          <div className="text-sm">Last dispatch: <strong>{h.github.lastDispatched ? new Date(h.github.lastDispatched).toLocaleString() : "never"}</strong></div>
          <div className="text-xs text-muted-foreground mt-1">workflow_dispatch trigger: <Badge variant="default" className="ml-1">present</Badge></div>
          {h.github.last422 && <div className="text-xs text-destructive mt-2 break-all">Last 422: {h.github.last422.slice(0, 120)}</div>}
        </HealthCard>

        <HealthCard title="Pinterest Publisher" ok={h.pinterest.published24h > 0 && !h.pinterest.lastError} icon={h.pinterest.published24h > 0 ? "ok" : "warn"}>
          <div className="text-3xl font-bold">{h.pinterest.published24h}</div>
          <div className="text-xs text-muted-foreground mb-2">published last 24h</div>
          {h.pinterest.lastError && <div className="text-xs text-destructive break-all">Last error: {h.pinterest.lastError.slice(0, 140)}</div>}
        </HealthCard>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Top failure reasons (7d)</CardTitle></CardHeader>
          <CardContent>
            {h.failureReasons.length === 0 ? (
              <CardDescription>No failures in window.</CardDescription>
            ) : (
              <ul className="text-sm space-y-1">
                {h.failureReasons.map((r) => (
                  <li key={r.reason} className="flex justify-between gap-2">
                    <span className="truncate">{r.reason}</span>
                    <Badge variant="outline">{r.n}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HealthCard({ title, ok, icon, children }: { title: string; ok: boolean; icon: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {icon === "ok" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Clock className="h-4 w-4 text-destructive" />}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}