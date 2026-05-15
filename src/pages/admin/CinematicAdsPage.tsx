import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles, Video, ExternalLink, Send, Download, Cloud, Copy, RefreshCw, ShieldCheck, FileText, ChevronDown, ChevronRight } from "lucide-react";

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
  failed: "bg-destructive/10 text-destructive",
};

export default function CinematicAdsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [productSlug, setProductSlug] = useState("enclosed-cat-litter-box-extra-large-flip-top");
  const [hookVariant, setHookVariant] = useState("default");
  const [smoke, setSmoke] = useState<any>(null);
  const [smokeBusy, setSmokeBusy] = useState(false);
  const [e2e, setE2e] = useState<any>(null);
  const [e2eBusy, setE2eBusy] = useState(false);

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
    const ch = supabase
      .channel("cinematic_ad_jobs_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cinematic_ad_jobs" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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
          (["prepared","render_queued","rendering","rendered","failed"] as const).map((groupKey) => {
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

                  <div className="flex flex-wrap gap-2">
                    {(j.status === "prepared" || j.status === "failed") && (
                      <Button size="sm" onClick={() => sendToRenderWorker(j.id)} disabled={busyId === j.id}>
                        {busyId === j.id ? <Loader2 className="size-4 animate-spin mr-1" /> : <Cloud className="size-4 mr-1" />}
                        Send to Render Worker
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