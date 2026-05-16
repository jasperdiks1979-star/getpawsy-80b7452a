import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles, Video, ExternalLink, Send, Download, Cloud, Copy, RefreshCw, ShieldCheck, FileText, ChevronDown, ChevronRight, AlertTriangle, Activity, RotateCcw } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

type Job = {
  id: string;
  product_slug: string;
  hook_variant: string;
  status: string;
  status_message: string | null;
  vo_url: string | null;
  vo_script: string | null;
  output_mp4_url: string | null;
  scene_assets: Array<{ index: number; image_url: string; caption: string; duration_seconds: number; ai_generated: boolean }>;
  caption_variants?: string[][] | null;
  vo_script_variants?: string[] | null;
  variant_index?: number | null;
  pinterest_asset_id: string | null;
  pushed_to_pinterest_at: string | null;
  pinterest_pin_id?: string | null;
  pinterest_pin_url?: string | null;
  pinterest_publish_error?: string | null;
  pinterest_publish_attempts?: number | null;
  last_pinterest_attempt_at?: string | null;
  render_complete_at?: string | null;
  pinterest_uploaded_at?: string | null;
  published_at?: string | null;
  error_message: string | null;
  created_at: string;
  prepared_at: string | null;
  render_attempts?: number | null;
  render_worker_id?: string | null;
  render_queued_at?: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  preparing: "bg-blue-500/10 text-blue-600",
  prepared: "bg-emerald-500/10 text-emerald-600",
  render_queued: "bg-indigo-500/10 text-indigo-600",
  rendering: "bg-amber-500/10 text-amber-600",
  rendered: "bg-emerald-600/15 text-emerald-700",
  render_complete: "bg-emerald-600/15 text-emerald-700",
  pinterest_uploaded: "bg-sky-500/15 text-sky-700",
  published: "bg-pink-500/15 text-pink-700",
  failed: "bg-destructive/10 text-destructive",
  worker_stale: "bg-orange-500/15 text-orange-700",
};

type HealthSnapshot = {
  workerLive: boolean;
  workerStale: boolean;
  lastClaimAt: string | null;
  lastClaimAgeMs: number | null;
  lastClaimWorkerId: string | null;
  lastClaimJobId: string | null;
  lastCompleteAt: string | null;
  currentJob: { id: string; product_slug: string; render_worker_id: string | null; render_started_at: string | null } | null;
  staleCandidates: Array<{ id: string; product_slug: string; render_queued_at: string | null }>;
  flaggedStale: Array<{ id: string; product_slug: string }>;
  staleThresholdMs: number;
  workerLiveWindowMs: number;
  heartbeat?: { worker_id: string; last_poll_at: string; last_claim_at: string | null; last_job_id: string | null } | null;
  heartbeatAgeMs?: number | null;
  lastTouchedAt?: string | null;
  lastTouchedAgeMs?: number | null;
};

type HealthResponse = {
  ok: boolean;
  message?: string;
  code?: string;
  secrets?: Record<string, boolean>;
  snapshot?: HealthSnapshot;
  workerHealth?: { ok: boolean; data?: any; error?: string };
};

function fmtAge(ms: number | null): string {
  if (ms === null) return "never";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export default function CinematicAdsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openPreview, setOpenPreview] = useState<Record<string, boolean>>({});
  const [productSlug, setProductSlug] = useState("enclosed-cat-litter-box-extra-large-flip-top");
  const [hookVariant, setHookVariant] = useState("default");
  const [smoke, setSmoke] = useState<any>(null);
  const [smokeBusy, setSmokeBusy] = useState(false);
  const [e2e, setE2e] = useState<any>(null);
  const [e2eBusy, setE2eBusy] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);

  const runSmokeTest = async () => {
    setSmokeBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-smoke-test", { body: {} });
      if (error) throw error;
      setSmoke(data);
      if (data?.summary?.failed > 0) toast.error(`Smoke test: ${data.summary.failed} failed, ${data.summary.warned} warn`);
      else toast.success(`Smoke test passed (${data?.summary?.passed} OK, ${data?.summary?.warned} warn)`);
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setSmokeBusy(false); }
  };

  const runE2eTest = async () => {
    setE2eBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-e2e-test", { body: {} });
      if (error) throw error;
      setE2e(data);
      if (data?.ok) toast.success(`E2E pipeline test passed in ${data.durationMs}ms`);
      else toast.error(`E2E test failed (${data?.summary?.failed} step(s))`);
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setE2eBusy(false); }
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("cinematic_ad_jobs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) { toast.error(error.message); return; }
    setJobs((data as unknown as Job[]) ?? []);
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
    loadHealth();
    const interval = setInterval(() => { loadHealth(); }, 30_000);
    const ch = supabase
      .channel("cinematic_ad_jobs_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cinematic_ad_jobs" }, () => load())
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(ch); };
  }, []);

  const generate = async () => {
    setBusyId("__new__");
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-prepare", {
        body: { product_slug: productSlug, hook_variant: hookVariant },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "prepare failed");
      toast.success("Assets prepared. Render the MP4 locally with the Remotion script, then push to Pinterest.");
      load();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const pushToPinterest = async (jobId: string) => {
    setBusyId(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-push-pinterest", { body: { job_id: jobId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "push failed");
      toast.success("Registered as Pinterest video asset.");
      load();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const sendToRenderWorker = async (jobId: string) => {
    setBusyId(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-queue-render", { body: { job_id: jobId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "queue failed");
      toast.success("Queued for render worker.");
      // copy command to clipboard for convenience
      try { await navigator.clipboard.writeText(data.command); } catch { /* noop */ }
      load();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const loadHealth = async () => {
    setHealthBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", { body: { action: "health" } });
      if (error) throw error;
      setHealth(data as HealthResponse);
    } catch (e: any) {
      setHealth({ ok: false, message: e?.message ?? String(e) });
    } finally {
      setHealthBusy(false);
    }
  };

  const retryRender = async (jobId: string) => {
    setBusyId(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", { body: { action: "retry_render", job_id: jobId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "retry_render failed");
      toast.success("Re-queued for render worker.");
      load();
      loadHealth();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const retryPublish = async (jobId: string) => {
    setBusyId(jobId);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-worker-control", { body: { action: "retry_publish", job_id: jobId } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "retry_publish failed");
      toast.success("Pinterest publish chain re-triggered.");
      load();
    } catch (e: any) { toast.error(e?.message ?? String(e)); }
    finally { setBusyId(null); }
  };

  const copyText = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error("Clipboard blocked"); }
  };

  const ghCommand = (jobId: string) =>
    `gh workflow run render-cinematic-ad.yml -f job_id=${jobId}`;

  const groups = {
    prepared: jobs.filter(j => j.status === "prepared"),
    render_queued: jobs.filter(j => j.status === "render_queued"),
    rendering: jobs.filter(j => j.status === "rendering"),
    rendered: jobs.filter(j => j.status === "rendered"),
    worker_stale: jobs.filter(j => j.status === "worker_stale"),
    failed: jobs.filter(j => j.status === "failed"),
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-6xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="size-6 text-primary" /> Cinematic Ads
        </h1>
        <p className="text-sm text-muted-foreground">
          Hybrid Remotion + Nano Banana pipeline. Generate cinematic 9:16 promo videos for Pinterest, TikTok &amp; Reels.
        </p>
      </header>

      {health?.code === "MISSING_SECRETS" && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Render pipeline misconfigured</AlertTitle>
          <AlertDescription className="text-xs">
            {health.message}
            {health.secrets && (
              <ul className="mt-2 list-disc pl-5">
                {Object.entries(health.secrets).map(([k, v]) => (
                  <li key={k} className={v ? "text-emerald-700" : "text-destructive"}>
                    {k}: {v ? "set" : "missing"}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {health?.snapshot && health.snapshot.workerStale && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Render worker is not claiming jobs</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <div>
              Last claim: {fmtAge(health.snapshot.lastClaimAgeMs)} · last heartbeat: {fmtAge(health.snapshot.heartbeatAgeMs ?? null)}
              {health.snapshot.lastClaimWorkerId && ` · worker ${health.snapshot.lastClaimWorkerId}`}
            </div>
            {health.snapshot.staleCandidates.length + health.snapshot.flaggedStale.length > 0 && (
              <div>
                {health.snapshot.staleCandidates.length + health.snapshot.flaggedStale.length} job(s) stuck in render_queued for &gt; 10 min.
                Verify the Render.com worker is running and that <code>RENDER_WORKER_SECRET</code> matches.
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="size-4" /> Render worker health
            {health?.snapshot && (
              <Badge className={health.snapshot.workerLive ? "bg-emerald-500/15 text-emerald-700" : "bg-orange-500/15 text-orange-700"}>
                {health.snapshot.workerLive ? "live" : "stale"}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={loadHealth} disabled={healthBusy}>
              {healthBusy ? <Loader2 className="size-3 animate-spin mr-1" /> : <RefreshCw className="size-3 mr-1" />}
              Refresh
            </Button>
            <span className="text-muted-foreground">
              Polled every 30s · liveness from heartbeats &amp; job activity. <code>/health/worker</code> is optional.
            </span>
          </div>
          {!health && <div className="text-muted-foreground">Loading…</div>}
          {health && !health.ok && health.code !== "MISSING_SECRETS" && (
            <div className="text-destructive">Health check failed: {health.message}</div>
          )}
          {health?.snapshot && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div><div className="text-muted-foreground">Worker live</div><div className="font-mono">{String(health.snapshot.workerLive)}</div></div>
              <div><div className="text-muted-foreground">Last claim</div><div className="font-mono">{fmtAge(health.snapshot.lastClaimAgeMs)}</div></div>
              <div><div className="text-muted-foreground">Last claim worker</div><div className="font-mono truncate">{health.snapshot.lastClaimWorkerId ?? "—"}</div></div>
              <div><div className="text-muted-foreground">Last heartbeat</div><div className="font-mono">{fmtAge(health.snapshot.heartbeatAgeMs ?? null)}</div></div>
              <div><div className="text-muted-foreground">Last job touch</div><div className="font-mono">{fmtAge(health.snapshot.lastTouchedAgeMs ?? null)}</div></div>
              <div><div className="text-muted-foreground">Current job</div><div className="font-mono truncate">{health.snapshot.currentJob?.id?.slice(0, 8) ?? "—"}</div></div>
              <div><div className="text-muted-foreground">Last render complete</div><div className="font-mono">{health.snapshot.lastCompleteAt ? new Date(health.snapshot.lastCompleteAt).toLocaleString() : "—"}</div></div>
              <div><div className="text-muted-foreground">Stale (queued &gt; 10m)</div><div className="font-mono">{health.snapshot.staleCandidates.length + health.snapshot.flaggedStale.length}</div></div>
              <div><div className="text-muted-foreground">Threshold</div><div className="font-mono">{Math.round(health.snapshot.staleThresholdMs / 60000)}m</div></div>
            </div>
          )}
          {health?.workerHealth && !health.workerHealth.ok && (
            <div className="text-[11px] text-muted-foreground">
              Health endpoint unavailable ({health.workerHealth.error ?? "unreachable"}). This is normal for Render Background Workers — liveness is derived from DB activity.
            </div>
          )}
          {health?.secrets && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] pt-1 border-t">
              {Object.entries(health.secrets).map(([k, v]) => (
                <span key={k} className={v ? "text-emerald-700" : "text-destructive"}>
                  {v ? "✓" : "✗"} {k}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Generate Viral Ad</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Product slug</label>
              <Input value={productSlug} onChange={(e) => setProductSlug(e.target.value)} placeholder="product-slug" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hook variant</label>
              <Input value={hookVariant} onChange={(e) => setHookVariant(e.target.value)} placeholder="default" />
            </div>
          </div>
          <Button onClick={generate} disabled={busyId === "__new__"} className="w-full sm:w-auto">
            {busyId === "__new__" ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
            Prepare cinematic assets
          </Button>
          <p className="text-xs text-muted-foreground">
            Step 1 (this button): generates 6 AI scene stills + ElevenLabs voiceover (Sarah). Step 2: render MP4 locally
            via <code className="text-[10px] bg-muted px-1 py-0.5 rounded">remotion/scripts/render-cinematic-ad.mjs</code>.
            Step 3: click <strong>Push to Pinterest</strong> to register the MP4.
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cloud className="size-4" /> External Render Worker</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            Lovable Cloud cannot run ffmpeg/Chromium. Click <strong>Send to Render Worker</strong> on a prepared job to queue it; then either trigger the GitHub Actions workflow or let your Render.com / Railway worker pick it up.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => copyText("gh workflow run render-cinematic-ad.yml -f job_id=<JOB_UUID>", "GitHub Actions command")}>
              <Copy className="size-3 mr-1" /> Copy GitHub Actions command
            </Button>
            <Button size="sm" variant="outline" onClick={() => copyText("Render.com → New Background Worker → see render-worker/README.md for env vars + start command.", "Render.com instructions")}>
              <Copy className="size-3 mr-1" /> Copy Render.com setup
            </Button>
            <Button size="sm" variant="ghost" onClick={() => load()}>
              <RefreshCw className="size-3 mr-1" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="size-4" /> Pipeline Smoke Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button size="sm" onClick={runSmokeTest} disabled={smokeBusy}>
            {smokeBusy ? <Loader2 className="size-4 animate-spin mr-1" /> : <ShieldCheck className="size-4 mr-1" />}
            Run end-to-end smoke test
          </Button>
          <Button size="sm" variant="secondary" onClick={runE2eTest} disabled={e2eBusy} className="ml-2">
            {e2eBusy ? <Loader2 className="size-4 animate-spin mr-1" /> : <ShieldCheck className="size-4 mr-1" />}
            Run automated E2E pipeline test
          </Button>
          <p className="text-[11px] text-muted-foreground">
            E2E test creates a throwaway job, walks queue → claim → upload → webhook, validates the public MP4 URL, then deletes the test job. No external worker required.
          </p>
          {e2e && (
            <div className="text-xs space-y-2">
              <div className="flex flex-wrap gap-3">
                <span className={e2e.ok ? "text-emerald-700 font-semibold" : "text-destructive font-semibold"}>
                  {e2e.ok ? "Pipeline OK ✓" : "Pipeline FAILED"}
                </span>
                <span className="text-muted-foreground">{e2e.durationMs}ms · trace {e2e.traceId}</span>
              </div>
              <div className="border rounded divide-y">
                {(e2e.steps ?? []).map((s: any, i: number) => (
                  <div key={i} className="p-2 flex items-start gap-2">
                    <Badge className={s.status === "OK" ? "bg-emerald-500/10 text-emerald-700" : "bg-destructive/10 text-destructive"}>
                      {s.status}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{s.name} <span className="text-muted-foreground font-normal">({s.ms}ms)</span></div>
                      {s.reason !== "ok" && <div className="text-muted-foreground break-words">{s.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {smoke?.summary && (
            <div className="text-xs flex flex-wrap gap-3">
              <span className="text-emerald-600">OK: {smoke.summary.passed}</span>
              <span className="text-amber-600">WARN: {smoke.summary.warned}</span>
              <span className="text-destructive">FAIL: {smoke.summary.failed}</span>
              <span className={smoke.summary.productionReady ? "text-emerald-700 font-semibold" : "text-muted-foreground"}>
                {smoke.summary.productionReady ? "Production-ready ✓" : "Not yet production-ready"}
              </span>
              {smoke.job_used && <span className="font-mono text-muted-foreground">job: {String(smoke.job_used).slice(0,8)}</span>}
            </div>
          )}
          {Array.isArray(smoke?.checks) && (
            <div className="border rounded divide-y">
              {smoke.checks.map((c: any) => (
                <div key={c.traceId} className="p-2 text-xs flex items-start gap-2">
                  <Badge className={
                    c.status === "OK" ? "bg-emerald-500/10 text-emerald-700"
                    : c.status === "WARN" ? "bg-amber-500/10 text-amber-700"
                    : "bg-destructive/10 text-destructive"
                  }>{c.status}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-muted-foreground break-words">{c.reason}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">trace {c.traceId} · {new Date(c.ts).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs yet.</p>
        ) : (
          (["prepared","render_queued","rendering","rendered","worker_stale","failed"] as const).map((groupKey) => {
            const groupJobs = groups[groupKey];
            if (groupJobs.length === 0) return null;
            return (
            <div key={groupKey} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wide">
                {groupKey.replace("_"," ")} <span className="ml-1 opacity-60">({groupJobs.length})</span>
              </h2>
              {groupJobs.map((j) => (
              <Card key={j.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <div className="space-y-0.5">
                      <div className="font-mono text-xs text-muted-foreground">{j.id.slice(0, 8)}</div>
                      <div className="font-medium text-sm">{j.product_slug}</div>
                      <div className="text-xs text-muted-foreground">hook: {j.hook_variant} · {new Date(j.created_at).toLocaleString()}</div>
                      {(j.render_attempts ?? 0) > 0 && (
                        <div className="text-[10px] text-muted-foreground">attempts: {j.render_attempts}{j.render_worker_id ? ` · ${j.render_worker_id}` : ""}</div>
                      )}
                    </div>
                    <Badge className={STATUS_COLOR[j.status] ?? "bg-muted"}>{j.status}</Badge>
                  </div>
                  {j.status_message && <p className="text-xs text-muted-foreground">{j.status_message}</p>}
                  {j.error_message && <p className="text-xs text-destructive">{j.error_message}</p>}

                  {(j.vo_script || (j.scene_assets && j.scene_assets.length > 0)) && (() => {
                    const isOpen = openPreview[j.id] ?? (j.status === "prepared" || j.status === "render_queued");
                    const variantCount = Math.min(
                      (j.vo_script_variants?.length ?? 0) || 1,
                      ...((j.caption_variants ?? []).map((row) => row?.length ?? 0).filter((n) => n > 0)),
                    );
                    const hasVariants = variantCount > 1;
                    return (
                      <div className="rounded border bg-muted/30">
                        <button
                          type="button"
                          onClick={() => setOpenPreview((s) => ({ ...s, [j.id]: !isOpen }))}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium hover:bg-muted/50 rounded-t"
                        >
                          <span className="flex items-center gap-1.5">
                            {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                            <FileText className="size-3.5" />
                            Copy preview — review captions & voiceover before render
                          </span>
                          {hasVariants && (
                            <span className="text-[10px] text-muted-foreground font-normal">
                              variant {(j.variant_index ?? 0) + 1} / {variantCount}
                            </span>
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3 pt-1 space-y-3 text-xs">
                            {j.vo_script && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
                                    Voiceover script
                                    <span className="ml-2 font-normal normal-case">
                                      {j.vo_script.split(/\s+/).filter(Boolean).length} words
                                    </span>
                                  </span>
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => copyText(j.vo_script ?? "", "VO script")}>
                                    <Copy className="size-3 mr-1" /> Copy
                                  </Button>
                                </div>
                                <p className="leading-relaxed whitespace-pre-wrap">{j.vo_script}</p>
                                {(j.vo_script_variants?.length ?? 0) > 1 && (
                                  <details className="pt-1">
                                    <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                                      {j.vo_script_variants!.length} VO variants available
                                    </summary>
                                    <ol className="list-decimal pl-5 pt-1 space-y-1 text-muted-foreground">
                                      {j.vo_script_variants!.map((v, i) => (
                                        <li key={i} className={i === (j.variant_index ?? 0) ? "text-foreground font-medium" : ""}>
                                          {v}
                                        </li>
                                      ))}
                                    </ol>
                                  </details>
                                )}
                              </div>
                            )}

                            {j.scene_assets && j.scene_assets.length > 0 && (
                              <div className="space-y-1">
                                <span className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
                                  Scene captions
                                </span>
                                <ol className="space-y-1.5">
                                  {j.scene_assets
                                    .slice()
                                    .sort((a, b) => a.index - b.index)
                                    .map((s) => {
                                      const altRow = j.caption_variants?.[s.index - 1] ?? [];
                                      const alts = altRow.filter((c) => c && c !== s.caption);
                                      return (
                                        <li key={s.index} className="flex items-start gap-2">
                                          <span className="font-mono text-[10px] text-muted-foreground mt-0.5 shrink-0 w-5">
                                            {s.index}.
                                          </span>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium">{s.caption}</div>
                                            {alts.length > 0 && (
                                              <div className="text-[10px] text-muted-foreground">
                                                alts: {alts.join(" · ")}
                                              </div>
                                            )}
                                          </div>
                                          <span className="text-[10px] text-muted-foreground shrink-0">
                                            {s.duration_seconds}s
                                          </span>
                                        </li>
                                      );
                                    })}
                                </ol>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {j.scene_assets?.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {j.scene_assets.map((s) => (
                        <div key={s.index} className="space-y-1">
                          <img src={s.image_url} alt={`Scene ${s.index}: ${s.caption}`} className="aspect-[9/16] w-full object-cover rounded border" loading="lazy" />
                          <div className="text-[10px] text-muted-foreground truncate" title={s.caption}>{s.index}. {s.caption}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {j.vo_url && (
                    <audio controls src={j.vo_url} className="w-full h-10" preload="none" />
                  )}

                  {j.output_mp4_url && (
                    <video controls src={j.output_mp4_url} className="w-full max-w-[240px] aspect-[9/16] rounded border bg-black" preload="none" />
                  )}

                  {(j.pinterest_pin_url || j.pinterest_publish_error || (j.pinterest_publish_attempts ?? 0) > 0) && (
                    <div className="rounded border bg-muted/30 p-3 text-xs space-y-1.5">
                      <div className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
                        Pinterest publish
                      </div>
                      {j.pinterest_pin_url ? (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-pink-500/15 text-pink-700">live</Badge>
                          <a href={j.pinterest_pin_url} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate">
                            {j.pinterest_pin_url}
                          </a>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          {j.status === "pinterest_uploaded" ? "Uploaded; awaiting pin creation." : "Not yet published."}
                        </div>
                      )}
                      {(j.pinterest_publish_attempts ?? 0) > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          attempts: {j.pinterest_publish_attempts}
                          {j.last_pinterest_attempt_at && ` · last ${new Date(j.last_pinterest_attempt_at).toLocaleString()}`}
                        </div>
                      )}
                      {j.pinterest_publish_error && (
                        <div className="text-destructive break-words">{j.pinterest_publish_error}</div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {(j.status === "prepared" || j.status === "failed") && (
                      <Button size="sm" onClick={() => sendToRenderWorker(j.id)} disabled={busyId === j.id}>
                        {busyId === j.id ? <Loader2 className="size-4 animate-spin mr-1" /> : <Cloud className="size-4 mr-1" />}
                        Send to Render Worker
                      </Button>
                    )}
                    {(j.status === "render_queued" || j.status === "rendering" || j.status === "worker_stale" || j.status === "failed") && (
                      <Button size="sm" variant="outline" onClick={() => retryRender(j.id)} disabled={busyId === j.id}>
                        {busyId === j.id ? <Loader2 className="size-4 animate-spin mr-1" /> : <RotateCcw className="size-4 mr-1" />}
                        Retry render
                      </Button>
                    )}
                    {j.output_mp4_url && (j.status !== "published" || j.pinterest_publish_error) && (
                      <Button size="sm" variant="outline" onClick={() => retryPublish(j.id)} disabled={busyId === j.id}>
                        {busyId === j.id ? <Loader2 className="size-4 animate-spin mr-1" /> : <Send className="size-4 mr-1" />}
                        Retry publish
                      </Button>
                    )}
                    {(j.status === "prepared" || j.status === "render_queued" || j.status === "failed") && (
                      <Button size="sm" variant="outline" onClick={() => copyText(ghCommand(j.id), "GH command")}>
                        <Copy className="size-3 mr-1" /> Copy GH command
                      </Button>
                    )}
                    {j.output_mp4_url && (
                      <>
                        <Button size="sm" variant="outline" asChild>
                          <a href={j.output_mp4_url} download><Download className="size-4 mr-1" /> Download MP4</a>
                        </Button>
                        <Button size="sm" onClick={() => pushToPinterest(j.id)} disabled={busyId === j.id || !!j.pinterest_asset_id}>
                          {busyId === j.id ? <Loader2 className="size-4 animate-spin mr-1" /> : <Send className="size-4 mr-1" />}
                          {j.pinterest_asset_id ? "Pushed to Pinterest" : "Push to Pinterest"}
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={j.output_mp4_url} target="_blank" rel="noopener" title="Open MP4 — download then upload to TikTok/IG manually">
                            <Video className="size-4 mr-1" /> TikTok / IG
                          </a>
                        </Button>
                      </>
                    )}
                    {j.pinterest_asset_id && (
                      <Badge variant="outline" className="text-xs">Pinterest asset {j.pinterest_asset_id.slice(0, 8)}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
              ))}
            </div>
            );
          })
        )}
      </section>
    </div>
  );
}