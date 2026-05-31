import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Pin, Download, RotateCw, Send, Settings2, Trophy, Play, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router-dom";
import ProductPicker, { type PickerProduct } from "@/components/admin/cinematic/ProductPicker";
import { AD_STYLES, type AdStyleId, getAdStyle } from "@/components/admin/pinterest-ad-studio/adStyles";

type JobRow = {
  id: string;
  product_slug: string;
  status: string;
  status_message: string | null;
  output_mp4_url: string | null;
  output_thumbnail_url: string | null;
  qa_composite_score: number | null;
  pinterest_pin_url: string | null;
  pinterest_quality_score: number | null;
  error_message: string | null;
  hook_variant: string | null;
  voice_style: string | null;
};

const TERMINAL_OK = new Set(["rendered", "render_complete", "pinterest_uploaded", "published"]);
const TERMINAL_BAD = new Set(["failed", "cancelled"]);

function statusLabel(s: string) {
  if (TERMINAL_OK.has(s)) return "Ready";
  if (TERMINAL_BAD.has(s)) return "Failed";
  if (s === "rendering") return "Rendering…";
  if (s === "render_queued") return "In queue";
  if (s === "preparing" || s === "pending" || s === "prepared") return "Preparing…";
  return s;
}

export default function PinterestAdStudio() {
  const [sp, setSp] = useSearchParams();
  const initialSlug = sp.get("slug") || "";
  const [product, setProduct] = useState<PickerProduct | null>(null);
  const [manualStyle, setManualStyle] = useState<AdStyleId>("viral");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creating, setCreating] = useState(false);
  const [directorNote, setDirectorNote] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [pollKey, setPollKey] = useState(0);

  // Preload product from ?slug=
  useEffect(() => {
    if (!initialSlug || product) return;
    (async () => {
      const { data } = await supabase.from("products_public")
        .select("slug, name, image_url, images, price, category")
        .eq("slug", initialSlug).maybeSingle();
      if (data) setProduct(data as PickerProduct);
    })();
  }, [initialSlug, product]);

  // Poll active jobs
  useEffect(() => {
    if (jobs.length === 0) return;
    const ids = jobs.map(j => j.id);
    const pending = jobs.some(j => !TERMINAL_OK.has(j.status) && !TERMINAL_BAD.has(j.status));
    if (!pending) return;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("cinematic_ad_jobs")
        .select("id, product_slug, status, status_message, output_mp4_url, output_thumbnail_url, qa_composite_score, pinterest_pin_url, pinterest_quality_score, error_message, hook_variant, voice_style")
        .in("id", ids);
      if (data) setJobs(data as JobRow[]);
      setPollKey(k => k + 1);
    }, 5000);
    return () => clearTimeout(t);
  }, [jobs, pollKey]);

  async function startOne(styleId: AdStyleId) {
    if (!product) return null;
    const s = getAdStyle(styleId);
    const { data, error } = await supabase.functions.invoke("cinematic-ad-prepare", {
      body: {
        product_slug: product.slug,
        hook_variant: s.hookVariant,
        voice_style: s.voiceStyle,
        force_new: true,
      },
    });
    const jobId = (data as any)?.job_id as string | undefined;
    if (!jobId) throw new Error((data as any)?.message || error?.message || "Failed to start");
    await supabase.functions.invoke("cinematic-ad-queue-render", {
      body: { job_id: jobId, preset: s.preset },
    });
    return jobId;
  }

  async function runStyles(stylesToRun: AdStyleId[], successMsg: string) {
    const results: JobRow[] = [];
    for (const sId of stylesToRun) {
      try {
        const jobId = await startOne(sId);
        if (jobId) {
          results.push({
            id: jobId, product_slug: product!.slug, status: "preparing", status_message: "queued",
            output_mp4_url: null, output_thumbnail_url: null, qa_composite_score: null,
            pinterest_pin_url: null, pinterest_quality_score: null, error_message: null,
            hook_variant: getAdStyle(sId).hookVariant, voice_style: getAdStyle(sId).voiceStyle,
          });
        }
      } catch (e: any) {
        toast.error(`${sId}: ${e.message || "failed"}`);
      }
    }
    if (results.length > 0) { setJobs(results); toast.success(successMsg); }
  }

  async function handleDirector() {
    if (!product) { toast.error("Select a product first"); return; }
    setCreating(true);
    setDirectorNote(null);
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-director-decide", {
        body: { product_slug: product.slug, top_n: 3 },
      });
      if (error || (data as any)?.ok === false) throw new Error((data as any)?.message || error?.message || "director failed");
      const concepts = ((data as any)?.concepts ?? []) as Array<{ style: AdStyleId; predicted_score: number }>;
      const meta = (data as any)?.meta;
      const styles = concepts.slice(0, 3).map(c => c.style);
      if (styles.length === 0) throw new Error("No concepts produced");
      setDirectorNote(`AI picked ${styles.map(s => getAdStyle(s).label).join(" · ")} based on ${meta?.history_samples ?? 0} past results${meta?.category ? ` in ${meta.category}` : ""}.`);
      await runStyles(styles, "Director Mode: generating concepts — best will auto-win");
    } catch (e: any) {
      toast.error(e.message || "director failed");
    } finally { setCreating(false); }
  }

  async function handleManual() {
    if (!product) { toast.error("Select a product first"); return; }
    setCreating(true);
    setDirectorNote(null);
    try { await runStyles([manualStyle], "Ad creation started"); }
    finally { setCreating(false); }
  }

  async function publish(j: JobRow) {
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-push-pinterest", { body: { job_id: j.id } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any)?.message || "publish failed");
      toast.success("Published to Pinterest");
      setPollKey(k => k + 1);
    } catch (e: any) { toast.error(e.message || "publish failed"); }
  }

  async function regenerate(j: JobRow) {
    const sObj = AD_STYLES.find(s => s.hookVariant === j.hook_variant) ?? AD_STYLES[0];
    try {
      setCreating(true);
      const newId = await startOne(sObj.id);
      if (newId) {
        setJobs(prev => prev.map(p => p.id === j.id ? { ...p, id: newId, status: "preparing", status_message: "queued", output_mp4_url: null, output_thumbnail_url: null } : p));
        toast.success("Regenerating");
      }
    } catch (e: any) { toast.error(e.message || "regen failed"); }
    finally { setCreating(false); }
  }

  const winner = useMemo(() => {
    const ready = jobs.filter(j => TERMINAL_OK.has(j.status) && j.output_mp4_url);
    if (ready.length === 0) return null;
    return ready.slice().sort((a, b) => (b.qa_composite_score ?? 0) - (a.qa_composite_score ?? 0))[0];
  }, [jobs]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Helmet><title>Pinterest Ad Studio — Admin</title></Helmet>

      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Pin className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Pinterest Ad Studio</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Select a product, click create. The AI Director picks the best style, hook, voice, storyboard, CTA and motion automatically.
        </p>
      </header>

      {/* STEP 1 */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Step 1 · Select product</CardTitle></CardHeader>
        <CardContent>
          <ProductPicker value={product} onChange={(p) => { setProduct(p); if (p) setSp({ slug: p.slug }); else setSp({}); }} />
        </CardContent>
      </Card>

      {/* STEP 2 — Director Mode (primary) */}
      <Card className="border-primary/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            Step 2 · Generate Best Possible Pinterest Ad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The AI Director analyzes your product category, Pinterest trends and past performance, then auto-picks the best style, hook, voice, storyboard, CTA and motion. Three concepts are rendered and the highest-scoring winner is selected automatically.
          </p>
          <Button size="lg" className="w-full" disabled={!product || creating} onClick={handleDirector}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Generate Best Possible Pinterest Ad
          </Button>
          {directorNote && (
            <div className="text-xs text-muted-foreground p-2 rounded bg-muted/40">{directorNote}</div>
          )}
        </CardContent>
      </Card>

      {/* STEP 4 — results */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Step 4 · Preview & publish</CardTitle>
            {winner && jobs.length > 1 && (
              <Badge variant="default" className="gap-1"><Trophy className="w-3 h-3" />Winner auto-selected</Badge>
            )}
          </CardHeader>
          <CardContent>
            <div className={`grid gap-4 ${jobs.length > 1 ? "md:grid-cols-3" : "grid-cols-1"}`}>
              {jobs.map(j => {
                const ready = TERMINAL_OK.has(j.status) && j.output_mp4_url;
                const failed = TERMINAL_BAD.has(j.status);
                const isWinner = winner?.id === j.id && jobs.length > 1;
                return (
                  <div key={j.id} className={`border rounded-lg overflow-hidden ${isWinner ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
                    <div className="aspect-[9/16] bg-muted relative">
                      {ready ? (
                        <video src={j.output_mp4_url!} poster={j.output_thumbnail_url ?? undefined} controls className="w-full h-full object-cover" />
                      ) : failed ? (
                        <div className="absolute inset-0 flex items-center justify-center text-destructive text-xs p-3 text-center">{j.error_message ?? "Render failed"}</div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span className="text-xs">{statusLabel(j.status)}</span>
                        </div>
                      )}
                      {isWinner && <Badge className="absolute top-2 left-2 gap-1"><Trophy className="w-3 h-3" />Winner</Badge>}
                    </div>
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium capitalize">{j.hook_variant ?? "—"}</span>
                        {j.qa_composite_score != null && <Badge variant="outline">QA {Math.round(j.qa_composite_score)}</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" asChild disabled={!ready}>
                          <a href={j.output_mp4_url ?? "#"} download target="_blank" rel="noreferrer">
                            <Download className="w-3 h-3 mr-1" />Download
                          </a>
                        </Button>
                        <Button size="sm" variant="outline" disabled={creating} onClick={() => regenerate(j)}>
                          <RotateCw className="w-3 h-3 mr-1" />Regen
                        </Button>
                        <Button size="sm" disabled={!ready || !!j.pinterest_pin_url} onClick={() => publish(j)}>
                          {j.pinterest_pin_url ? <><Pin className="w-3 h-3 mr-1" />Published</> : <><Send className="w-3 h-3 mr-1" />Publish</>}
                        </Button>
                      </div>
                      {j.pinterest_pin_url && (
                        <a href={j.pinterest_pin_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">View pin →</a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advanced */}
      <Card>
        <CardHeader className="pb-3">
          <button onClick={() => setShowAdvanced(v => !v)} className="flex items-center justify-between w-full text-left">
            <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4" />Advanced Settings</CardTitle>
            <span className="text-xs text-muted-foreground">{showAdvanced ? "Hide" : "Show"}</span>
          </button>
        </CardHeader>
        {showAdvanced && (
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Manual style override (skips Director)</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
                {AD_STYLES.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setManualStyle(s.id)}
                    className={`text-left p-2 rounded-lg border transition-colors ${manualStyle === s.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                  >
                    <div className="text-xs font-semibold">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{s.description}</div>
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" disabled={!product || creating} onClick={handleManual}>
                <Sparkles className="w-3 h-3 mr-1" />Render single concept ({getAdStyle(manualStyle).label})
              </Button>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Engine controls</div>
              <p className="text-muted-foreground text-xs mb-2">Full engine controls, QA gates, autopilot, intelligence panels and bulk operations.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild><Link to="/admin/cinematic-ads"><Play className="w-3 h-3 mr-1" />Cinematic Control Center</Link></Button>
                <Button variant="outline" size="sm" asChild><Link to="/admin/cinematic-ads/dashboard">Jobs dashboard</Link></Button>
                <Button variant="outline" size="sm" asChild><Link to="/admin/cinematic-ads/queue-health">Queue health</Link></Button>
                <Button variant="outline" size="sm" asChild><Link to="/admin/cinematic-performance">Performance metrics</Link></Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
