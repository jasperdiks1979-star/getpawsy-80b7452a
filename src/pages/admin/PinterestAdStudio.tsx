import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Pin, Download, RotateCw, Send, Settings2, Trophy, Play, Wand2, Bug, AlertTriangle, CheckCircle2, XCircle, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router-dom";
import ProductPicker, { type PickerProduct } from "@/components/admin/cinematic/ProductPicker";
import { AD_STYLES, type AdStyleId, getAdStyle, ARCHETYPES, getArchetype, type ArchetypeId } from "@/components/admin/pinterest-ad-studio/adStyles";

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
  archetype?: ArchetypeId | null;
  predicted_score?: number | null;
  // Phase 5: motion-engine enforcement diagnostics
  render_mode?: string | null;
  motion_engine_used?: string | null;
  motion_score?: number | null;
  motion_diversity_v2?: number | null;
  transition_count?: number | null;
  publish_blocked_reason?: string | null;
};

const TERMINAL_OK = new Set(["rendered", "render_complete", "pinterest_uploaded", "published"]);
const TERMINAL_BAD = new Set(["failed", "cancelled"]);

// ============================================================
// Director run diagnostics — captured per-concept so the
// "Debug Director Run" panel can show actionable error info
// when an edge function returns a non-2xx status.
// ============================================================
type ConceptStage = "pending" | "preparing" | "queued" | "queue_waiting" | "rendering" | "success" | "concept_failed";
type EdgeCallDiag = {
  fn: string;
  ok: boolean;
  httpStatus: number | null;
  responseBody: string | null;
  traceId: string | null;
  errorMessage: string | null;
  errorCode?: string | null;
  preflight?: Array<{ name: string; pass: boolean; detail?: string }> | null;
};
type ConceptDiag = {
  archetype: ArchetypeId;
  label: string;
  stage: ConceptStage;
  jobId: string | null;
  prepare: EdgeCallDiag | null;
  queue: EdgeCallDiag | null;
  retried: boolean;
  suggestedFix: string | null;
  queueWaiting?: { retryAfterSec: number; attempts: number; maxAttempts: number } | null;
};

function suggestFix(d: EdgeCallDiag): string {
  const body = (d.responseBody || "").toLowerCase();
  const msg = (d.errorMessage || "").toLowerCase();
  if (d.httpStatus === 401 || d.httpStatus === 403) return "Auth/permission issue — re-login as admin and retry.";
  if (d.httpStatus === 402 || body.includes("payment") || body.includes("billing") || body.includes("credit")) return "AI provider billing/credit issue — add credits to Lovable AI / ElevenLabs.";
  if (d.httpStatus === 429 || body.includes("rate")) return "Rate limited — wait 30s and retry, or stagger concepts.";
  if (d.httpStatus && d.httpStatus >= 500) return "Upstream AI service unavailable — automatic safer-prompt retry will engage; otherwise skip this concept.";
  if (body.includes("voice") || msg.includes("voice")) return "Voice synthesis failed — retry with the narrator fallback voice.";
  if (body.includes("image") || body.includes("nano") || body.includes("gemini")) return "Image generation failed — retry with safer creative prompt or skip the viral pattern interrupt.";
  if (d.httpStatus === null) return "Network/timeout — retry the run.";
  return "Inspect the response body and edge function logs for details.";
}

// Resilient invoke: never throws, always returns full diagnostics
// including HTTP status + response body + trace id when the function
// returns a non-2xx status code.
async function invokeWithDiag(fn: string, body: Record<string, unknown>): Promise<{ data: any; diag: EdgeCallDiag }> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  // FunctionsHttpError exposes the raw Response via .context
  const ctx: Response | undefined = (error as any)?.context;
  let httpStatus: number | null = ctx?.status ?? (data ? 200 : null);
  let responseBody: string | null = null;
  let traceId: string | null = (data as any)?.traceId ?? null;
  let errorCode: string | null = (data as any)?.error_code ?? null;
  let preflight: Array<{ name: string; pass: boolean; detail?: string }> | null =
    ((data as any)?.diagnostics as any) ?? null;
  if (ctx) {
    try { responseBody = await ctx.clone().text(); } catch { /* noop */ }
    try {
      const parsed = responseBody ? JSON.parse(responseBody) : null;
      if (parsed?.traceId) traceId = parsed.traceId;
      if (parsed?.error_code) errorCode = parsed.error_code;
      if (Array.isArray(parsed?.diagnostics)) preflight = parsed.diagnostics;
    } catch { /* response was not JSON */ }
  }
  const okFlag = !error && (data as any)?.ok !== false;
  const errorMessage = okFlag ? null : ((data as any)?.message || error?.message || `non-2xx (${httpStatus ?? "?"})`);
  const diag: EdgeCallDiag = { fn, ok: okFlag, httpStatus, responseBody, traceId, errorMessage, errorCode, preflight };
  return { data, diag };
}

function statusLabel(s: string) {
  if (TERMINAL_OK.has(s)) return "Ready";
  if (TERMINAL_BAD.has(s)) return "Failed";
  if (s === "rendering") return "Rendering…";
  if (s === "render_queued") return "In queue";
  if (s === "queue_waiting") return "Queued — waiting for render slot";
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
  const [runId, setRunId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [pollKey, setPollKey] = useState(0);
  const [diagnostics, setDiagnostics] = useState<ConceptDiag[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [forceBudgetOverride, setForceBudgetOverride] = useState(false);

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
        .select("id, product_slug, status, status_message, output_mp4_url, output_thumbnail_url, qa_composite_score, pinterest_pin_url, pinterest_quality_score, error_message, hook_variant, voice_style, render_mode, motion_engine_used, motion_score, motion_diversity_v2, transition_count, publish_blocked_reason")
        .in("id", ids);
      if (data) setJobs(data as JobRow[]);
      setPollKey(k => k + 1);
    }, 5000);
    return () => clearTimeout(t);
  }, [jobs, pollKey]);

  async function startOne(opts: { hookVariant: string; voiceStyle: string; preset: string; archetype?: ArchetypeId; runId?: string | null }) {
    const res = await startOneWithDiag(opts);
    if (!res.jobId) throw new Error(res.prepare?.errorMessage || res.queue?.errorMessage || "Failed to start");
    return res.jobId;
  }

  // Returns { jobId, prepare, queue } — never throws.
  async function startOneWithDiag(opts: { hookVariant: string; voiceStyle: string; preset: string; archetype?: ArchetypeId; runId?: string | null; forceBudget?: boolean }): Promise<{ jobId: string | null; prepare: EdgeCallDiag; queue: EdgeCallDiag | null }> {
    if (!product) {
      const fake: EdgeCallDiag = { fn: "cinematic-ad-prepare", ok: false, httpStatus: null, responseBody: null, traceId: null, errorMessage: "no product selected" };
      return { jobId: null, prepare: fake, queue: null };
    }
    const prep = await invokeWithDiag("cinematic-ad-prepare", {
      product_slug: product.slug,
      hook_variant: opts.hookVariant,
      voice_style: opts.voiceStyle,
      force_new: true,
      director_archetype: opts.archetype ?? null,
      director_run_id: opts.runId ?? null,
      concept_type: opts.archetype ?? null,
    });
    const jobId = ((prep.data as any)?.job_id ?? (prep.data as any)?.job?.id) as string | undefined;
    if (!jobId || !prep.diag.ok) return { jobId: null, prepare: prep.diag, queue: null };
    const q = await invokeWithDiag("cinematic-ad-queue-render", {
      job_id: jobId,
      preset: opts.preset,
      // Director path is an authorized path — implicitly approve so the
      // approval gate doesn't 412 when called as part of the run.
      auto_approve: true,
      dry_run: dryRun,
      force_budget_override: opts.forceBudget === true,
      force_budget_reason: opts.forceBudget ? "pinterest_ad_studio_admin_force" : null,
    });
    // Best-effort: persist director_archetype + run_id on the job (idempotent)
    if (opts.archetype || opts.runId) {
      await supabase.from("cinematic_ad_jobs")
        .update({ director_archetype: opts.archetype ?? null, director_run_id: opts.runId ?? null })
        .eq("id", jobId);
    }
    return { jobId: q.diag.ok ? jobId : jobId, prepare: prep.diag, queue: q.diag };
  }

  async function runStyles(stylesToRun: AdStyleId[], successMsg: string) {
    const results: JobRow[] = [];
    for (const sId of stylesToRun) {
      try {
        const s = getAdStyle(sId);
        const jobId = await startOne({ hookVariant: s.hookVariant, voiceStyle: s.voiceStyle, preset: s.preset });
        if (jobId) {
          results.push({
            id: jobId, product_slug: product!.slug, status: "preparing", status_message: "queued",
            output_mp4_url: null, output_thumbnail_url: null, qa_composite_score: null,
            pinterest_pin_url: null, pinterest_quality_score: null, error_message: null,
            hook_variant: s.hookVariant, voice_style: s.voiceStyle,
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
    // Guard: if a director run is already active for this product, offer to resume instead of starting duplicates.
    if (!dryRun) {
      const { data: active } = await supabase
        .from("cinematic_ad_jobs")
        .select("id,director_run_id,concept_type,status")
        .eq("product_slug", product.slug)
        .not("director_run_id", "is", null)
        .in("status", ["pending", "preparing", "prepared", "render_queued", "rendering"])
        .order("updated_at", { ascending: false })
        .limit(4);
      if (active && active.length > 0) {
        const existingRun = (active[0] as any).director_run_id as string;
        setRunId(existingRun);
        toast.message("Director run already active for this product — resuming view.", {
          description: `${active.length} concept job(s) in flight under run ${existingRun.slice(0, 8)}…`,
        });
        const resumed: JobRow[] = (active as any[]).map((j) => ({
          id: j.id, product_slug: product.slug, status: j.status, status_message: "resumed",
          output_mp4_url: null, output_thumbnail_url: null, qa_composite_score: null,
          pinterest_pin_url: null, pinterest_quality_score: null, error_message: null,
          hook_variant: null, voice_style: null, archetype: j.concept_type ?? null,
        }));
        setJobs(resumed);
        return;
      }
    }
    setCreating(true);
    setDirectorNote(null);
    setRunId(null);
    setDiagnostics([]);
    try {
      const decided = await invokeWithDiag("cinematic-director-decide", { product_slug: product.slug, persist: true });
      if (!decided.diag.ok) {
        toast.error(`Director decide failed: ${decided.diag.errorMessage}`);
        setDiagnostics([{ archetype: "viral_interrupt", label: "director-decide", stage: "concept_failed", jobId: null, prepare: decided.diag, queue: null, retried: false, suggestedFix: suggestFix(decided.diag) }]);
        setShowDebug(true);
        return;
      }
      const data = decided.data;
      const payload = data as any;
      const concepts = (payload.concepts ?? []) as Array<{
        archetype: ArchetypeId; label: string; hookVariant: string; voiceStyle: string;
        preset: string; predicted_score: number; learned_weight: number; samples: number;
      }>;
      const newRunId = payload.run_id as string | null;
      setRunId(newRunId);
      const meta = payload.meta;
      if (concepts.length === 0) throw new Error("No concepts produced");

      setDirectorNote(
        `AI Director ${dryRun ? "DRY RUN — simulating" : "rendering"} ${concepts.length} concepts: ${concepts.map(c => `${c.label} (w=${c.learned_weight})`).join(" · ")}${meta?.category ? ` · ${meta.category}` : ""}. One failed concept does not stop the run.`,
      );

      // Initialize diagnostics row for each concept
      const initDiag: ConceptDiag[] = concepts.map(c => ({
        archetype: c.archetype, label: c.label, stage: "preparing",
        jobId: null, prepare: null, queue: null, retried: false, suggestedFix: null,
      }));
      setDiagnostics(initDiag);

      // Staggered sequential dispatch — first concept goes immediately, the
      // rest are queued 30s apart so we don't fill MAX_ACTIVE_QUEUED in one
      // burst. Concepts that come back as 202 queue_waiting are NOT failed;
      // the watchdog promotes them as render slots free up.
      const STAGGER_MS = 30_000;
      const settled: Array<PromiseSettledResult<{
        idx: number; c: typeof concepts[number]; jobId: string | null;
        prepare: EdgeCallDiag; queue: EdgeCallDiag | null; retried: boolean; dryRun: boolean;
      }>> = [];
      for (let i = 0; i < concepts.length; i++) {
        const c = concepts[i];
        if (i > 0) await new Promise((res) => setTimeout(res, STAGGER_MS));
        try {
          let r = await startOneWithDiag({ hookVariant: c.hookVariant, voiceStyle: c.voiceStyle, preset: c.preset as any, archetype: c.archetype, runId: newRunId, forceBudget: forceBudgetOverride });
          let retried = false;
          if (!r.jobId && c.archetype === "viral_interrupt") {
            retried = true;
            r = await startOneWithDiag({ hookVariant: "lifestyle", voiceStyle: "narrator", preset: c.preset as any, archetype: c.archetype, runId: newRunId, forceBudget: forceBudgetOverride });
          }
          settled.push({ status: "fulfilled", value: { idx: i, c, jobId: r.jobId, prepare: r.prepare, queue: r.queue, retried, dryRun } });
        } catch (err) {
          settled.push({ status: "rejected", reason: err });
        }
        // Live-update so the UI reflects each concept as it lands.
        setDiagnostics((prev) => {
          const next = [...prev];
          const last = settled[settled.length - 1];
          if (last && last.status === "fulfilled") {
            const { c, jobId, prepare, queue, retried, dryRun: isDry } = last.value;
            const isQueueWaiting = (queue as any)?.responseBody && (() => {
              try { return JSON.parse((queue as any).responseBody).status === "queue_waiting"; } catch { return false; }
            })();
            const ok = !!jobId && prepare.ok && (queue?.ok ?? true) && !isQueueWaiting;
            let stage: ConceptStage;
            if (isQueueWaiting) stage = "queue_waiting";
            else if (ok) stage = isDry ? "success" : "rendering";
            else stage = "concept_failed";
            let queueWaiting: ConceptDiag["queueWaiting"] = null;
            if (isQueueWaiting) {
              try {
                const parsed = JSON.parse((queue as any).responseBody);
                queueWaiting = { retryAfterSec: parsed.retry_after_seconds ?? 30, attempts: parsed.attempts ?? 1, maxAttempts: parsed.max_attempts ?? 8 };
              } catch { /* ignore */ }
            }
            next[i] = {
              archetype: c.archetype, label: c.label, stage, jobId, prepare, queue, retried,
              suggestedFix: ok || isQueueWaiting ? null : suggestFix(prepare.ok && queue && !queue.ok ? queue : prepare),
              queueWaiting,
            };
          }
          return next;
        });
      }

      const results: JobRow[] = [];
      const nextDiag: ConceptDiag[] = [...initDiag];
      let failedCount = 0;
      let waitingCount = 0;
      for (const s of settled) {
        if (s.status !== "fulfilled") continue;
        const { idx, c, jobId, prepare, queue, retried, dryRun: isDry } = s.value;
        // Detect queue_waiting (HTTP 202 with body.status==='queue_waiting')
        let isQueueWaiting = false;
        let qw: ConceptDiag["queueWaiting"] = null;
        if (queue?.responseBody) {
          try {
            const parsed = JSON.parse(queue.responseBody);
            if (parsed?.status === "queue_waiting") {
              isQueueWaiting = true;
              qw = { retryAfterSec: parsed.retry_after_seconds ?? 30, attempts: parsed.attempts ?? 1, maxAttempts: parsed.max_attempts ?? 8 };
            }
          } catch { /* ignore */ }
        }
        const ok = !!jobId && prepare.ok && (queue?.ok ?? true) && !isQueueWaiting;
        let stage: ConceptStage;
        if (isQueueWaiting) stage = "queue_waiting";
        else if (ok) stage = isDry ? "success" : "rendering";
        else stage = "concept_failed";
        nextDiag[idx] = {
          archetype: c.archetype, label: c.label, stage,
          jobId, prepare, queue, retried,
          suggestedFix: ok || isQueueWaiting ? null : suggestFix(prepare.ok && queue && !queue.ok ? queue : prepare),
          queueWaiting: qw,
        };
        if ((ok || isQueueWaiting) && !isDry && jobId) {
          results.push({
            id: jobId, product_slug: product.slug,
            status: isQueueWaiting ? "queue_waiting" : "preparing",
            status_message: isQueueWaiting ? `Queued — waiting for render slot (retry in ${qw?.retryAfterSec ?? 30}s)` : "queued",
            output_mp4_url: null, output_thumbnail_url: null, qa_composite_score: null,
            pinterest_pin_url: null, pinterest_quality_score: null, error_message: null,
            hook_variant: c.hookVariant, voice_style: c.voiceStyle,
            archetype: c.archetype, predicted_score: c.predicted_score,
          });
        }
        if (isQueueWaiting) waitingCount++;
        else if (!ok) failedCount++;
      }
      setDiagnostics(nextDiag);

      if (results.length > 0) {
        setJobs(results);
        const waitNote = waitingCount ? ` · ${waitingCount} waiting for render slot` : "";
        const failNote = failedCount ? ` · ${failedCount} failed` : "";
        toast.success(`Director: ${results.length}/${concepts.length} concepts dispatched${waitNote}${failNote}`);
      } else if (dryRun) {
        toast.success(`Dry run complete · ${concepts.length - failedCount}/${concepts.length} would render · ${failedCount} isolated`);
        setShowDebug(true);
      } else {
        toast.error(`All ${concepts.length} concepts failed — see Debug panel`);
        setShowDebug(true);
      }
      if (failedCount > 0) setShowDebug(true);
    } catch (e: any) {
      toast.error(e.message || "director failed");
    } finally { setCreating(false); }
  }

  async function handleFeedback() {
    if (!runId) { toast.error("No active run to score"); return; }
    const { data, error } = await supabase.functions.invoke("cinematic-director-feedback", { body: { run_id: runId } });
    if (error || (data as any)?.ok === false) { toast.error((data as any)?.message || error?.message || "feedback failed"); return; }
    toast.success(`Feedback: ${(data as any)?.message ?? "ok"}`);
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
      const newId = await startOne({
        hookVariant: sObj.hookVariant, voiceStyle: sObj.voiceStyle, preset: sObj.preset,
        archetype: j.archetype ?? null as any, runId,
      });
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
            The Self-Learning Director renders 4 fundamentally different concepts in parallel — Problem/Solution, Emotional, Premium Lifestyle and Viral Pattern Interrupt — each with a unique hook, voice, CTA, pacing and motion plan. Winner is auto-selected and Pinterest performance is fed back into the learning model so every new ad gets smarter.
          </p>
          <Button size="lg" className="w-full" disabled={!product || creating} onClick={handleDirector}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {dryRun ? "Dry-run Director (no renders)" : "Generate Best Possible Pinterest Ad"}
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="accent-primary" />
            Render queue dry run — runs prepare + queue preflight only, no GitHub Actions, no paid renders.
          </label>
          {directorNote && (
            <div className="text-xs text-muted-foreground p-2 rounded bg-muted/40">{directorNote}</div>
          )}
          {runId && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Run <code className="text-[10px]">{runId.slice(0,8)}</code> · feedback loop runs hourly</span>
              <Button size="sm" variant="ghost" onClick={handleFeedback}>Score this run now</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debug Director Run */}
      {diagnostics.length > 0 && (
        <Card className="border-amber-400/40">
          <CardHeader className="pb-3">
            <button onClick={() => setShowDebug(v => !v)} className="flex items-center justify-between w-full text-left">
              <CardTitle className="text-base flex items-center gap-2">
                <Bug className="w-4 h-4" />Debug Director Run
                <Badge variant="outline" className="ml-2">
                  {diagnostics.filter(d => d.stage === "success" || d.stage === "rendering").length}/{diagnostics.length} ok
                </Badge>
                {diagnostics.some(d => d.stage === "concept_failed") && (
                  <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />{diagnostics.filter(d => d.stage === "concept_failed").length} failed</Badge>
                )}
                {diagnostics.some(d => d.stage === "queue_waiting") && (
                  <Badge variant="secondary" className="gap-1"><Hourglass className="w-3 h-3" />{diagnostics.filter(d => d.stage === "queue_waiting").length} waiting</Badge>
                )}
              </CardTitle>
              <span className="text-xs text-muted-foreground">{showDebug ? "Hide" : "Show"}</span>
            </button>
          </CardHeader>
          {showDebug && (
            <CardContent className="space-y-3">
              {winner && (
                <div className="text-xs p-2 rounded bg-primary/5 border border-primary/20">
                  <span className="font-medium">Selected winner:</span> {winner.archetype ? getArchetype(winner.archetype).label : winner.hook_variant} · QA {Math.round(winner.qa_composite_score ?? 0)} · <code className="text-[10px]">{winner.id.slice(0,8)}</code>
                </div>
              )}
              <div className="space-y-2">
                {diagnostics.map((d, i) => {
                  const failed = d.stage === "concept_failed";
                  const okCall = d.stage === "success" || d.stage === "rendering";
                  const waiting = d.stage === "queue_waiting";
                  return (
                    <div key={`${d.archetype}-${i}`} className={`border rounded-md p-3 text-xs space-y-1.5 ${failed ? "border-destructive/40 bg-destructive/5" : okCall ? "border-emerald-500/30 bg-emerald-500/5" : waiting ? "border-amber-400/40 bg-amber-400/5" : "border-border"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold">
                          {failed ? <XCircle className="w-4 h-4 text-destructive" /> : okCall ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : waiting ? <Hourglass className="w-4 h-4 text-amber-500" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                          {d.label}
                          {d.retried && <Badge variant="outline" className="text-[10px]">retried (safer prompt)</Badge>}
                        </div>
                        <span className="text-muted-foreground">{waiting && d.queueWaiting ? `queue_waiting · retry in ${d.queueWaiting.retryAfterSec}s (attempt ${d.queueWaiting.attempts}/${d.queueWaiting.maxAttempts})` : d.stage}</span>
                      </div>
                      {d.jobId && <div><span className="text-muted-foreground">Render job:</span> <code className="text-[10px]">{d.jobId}</code></div>}
                      {d.prepare && (
                        <div className="grid grid-cols-[110px_1fr] gap-x-2">
                          <span className="text-muted-foreground">prepare:</span>
                          <span><code className="text-[10px]">{d.prepare.fn}</code> · HTTP {d.prepare.httpStatus ?? "—"} · {d.prepare.ok ? "ok" : (d.prepare.errorMessage ?? "failed")}{d.prepare.traceId ? ` · trace ${d.prepare.traceId}` : ""}</span>
                        </div>
                      )}
                      {d.queue && (
                        <div className="grid grid-cols-[110px_1fr] gap-x-2">
                          <span className="text-muted-foreground">queue:</span>
                          <span>
                            <code className="text-[10px]">{d.queue.fn}</code> · HTTP {d.queue.httpStatus ?? "—"} · {d.queue.ok ? "ok" : (d.queue.errorMessage ?? "failed")}
                            {d.queue.errorCode ? <> · <code className="text-[10px]">{d.queue.errorCode}</code></> : null}
                          </span>
                        </div>
                      )}
                      {/* Queue preflight diagnostics — PASS/FAIL grid */}
                      {(d.queue?.preflight && d.queue.preflight.length > 0) && (
                        <div className="mt-2 rounded border border-border bg-background/40 p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold">Queue diagnostics</span>
                            <button
                              type="button"
                              className="text-[10px] underline text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                const blob = {
                                  archetype: d.archetype,
                                  label: d.label,
                                  jobId: d.jobId,
                                  prepare: d.prepare,
                                  queue: d.queue,
                                };
                                navigator.clipboard.writeText(JSON.stringify(blob, null, 2));
                                toast.success("Diagnostics copied");
                              }}
                            >
                              Copy diagnostics
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                            {d.queue.preflight.map((p) => (
                              <div key={p.name} className="flex items-center gap-1.5 text-[10px]">
                                {p.pass
                                  ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                  : <XCircle className="w-3 h-3 text-destructive shrink-0" />}
                                <span className="font-mono">{p.name}</span>
                                {p.detail && <span className="text-muted-foreground truncate">— {p.detail}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {failed && d.prepare?.responseBody && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground">Response body</summary>
                          <pre className="text-[10px] whitespace-pre-wrap break-all p-2 rounded bg-background/60 border border-border mt-1 max-h-40 overflow-auto">{d.prepare.responseBody}</pre>
                        </details>
                      )}
                      {d.suggestedFix && (
                        <div className="text-amber-700 dark:text-amber-400"><span className="font-medium">Suggested fix:</span> {d.suggestedFix}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

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
            <div className={`grid gap-4 ${jobs.length > 1 ? "md:grid-cols-2 lg:grid-cols-4" : "grid-cols-1"}`}>
              {jobs.map(j => {
                const ready = TERMINAL_OK.has(j.status) && j.output_mp4_url;
                const failed = TERMINAL_BAD.has(j.status);
                const isWinner = winner?.id === j.id && jobs.length > 1;
                const archLabel = j.archetype ? getArchetype(j.archetype).shortLabel : (j.hook_variant ?? "—");
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
                        <span className="font-medium">{archLabel}</span>
                        {j.qa_composite_score != null && <Badge variant="outline">QA {Math.round(j.qa_composite_score)}</Badge>}
                      </div>
                      {j.predicted_score != null && (
                        <div className="text-[10px] text-muted-foreground">Predicted {j.predicted_score}</div>
                      )}
                      {/* Phase 5 — motion-engine enforcement diagnostics */}
                      {(j.render_mode || j.motion_engine_used || j.motion_score != null || j.motion_diversity_v2 != null || j.transition_count != null) && (
                        <div className="flex flex-wrap gap-1 text-[10px]">
                          {j.render_mode && (
                            <Badge
                              variant={j.render_mode === "remotion_cinematic" ? "outline" : "destructive"}
                              className="font-mono"
                              title="render_mode"
                            >
                              {j.render_mode}
                            </Badge>
                          )}
                          {j.motion_engine_used && (
                            <Badge
                              variant={j.motion_engine_used === "v2" ? "outline" : "destructive"}
                              className="font-mono"
                              title="motion_engine_used"
                            >
                              engine {j.motion_engine_used}
                            </Badge>
                          )}
                          {j.motion_score != null && (
                            <Badge
                              variant={j.motion_score >= 0.5 ? "outline" : "destructive"}
                              className="font-mono"
                              title="motion_score (publish gate ≥ 0.5)"
                            >
                              score {Number(j.motion_score).toFixed(2)}
                            </Badge>
                          )}
                          {j.motion_diversity_v2 != null && (
                            <Badge
                              variant={j.motion_diversity_v2 >= 0.8 ? "outline" : "secondary"}
                              className="font-mono"
                              title="motion_diversity (target ≥ 0.8)"
                            >
                              div {Number(j.motion_diversity_v2).toFixed(2)}
                            </Badge>
                          )}
                          {j.transition_count != null && (
                            <Badge variant="outline" className="font-mono" title="transition_count">
                              {j.transition_count} cuts
                            </Badge>
                          )}
                        </div>
                      )}
                      {j.publish_blocked_reason && (
                        <div className="text-[10px] text-destructive">
                          Publish blocked: <code className="font-mono">{j.publish_blocked_reason}</code>
                        </div>
                      )}
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
