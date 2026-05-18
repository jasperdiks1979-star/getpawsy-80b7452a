import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, Upload, AlertTriangle, Mic, Download, Sparkles } from "lucide-react";
import VoiceStyleSelector, { type VoiceStyleId } from "@/components/admin/cinematic/VoiceStyleSelector";

type HookVariantMeta = { angle: string; text: string; score: number; reasoning?: string };
type CtaVariantMeta = { text: string; score: number };
type StoryboardScene = {
  scene_index: number;
  role: string;
  visual: string;
  on_screen_text: string;
  vo_line: string;
  duration_s: number;
};

const ANGLE_LABEL: Record<string, string> = {
  emotional: "Emotional",
  luxury: "Luxury",
  problem_solution: "Problem / Solution",
  curiosity: "Curiosity",
  social_proof: "Social Proof",
  ugc: "UGC",
};

const PRESET_OPTIONS = [
  { id: "pin-organic", label: "Pinterest Organic" },
  { id: "pin-ads", label: "Pinterest Ads" },
  { id: "tt-organic", label: "TikTok Organic" },
  { id: "tt-spark", label: "TikTok Spark Ads" },
] as const;

type ValidationCheck = { name: string; passed: boolean; observed: unknown; expected: unknown; message?: string };
type ValidationReport = { passed: boolean; checks: ValidationCheck[]; motion_score: number | null; validated_at: string; preset: string } | null;

const SCENE_BREAKDOWN = [
  { label: "Hook", startSec: 0, endSec: 3 },
  { label: "Feature 1", startSec: 3, endSec: 7 },
  { label: "Feature 2", startSec: 7, endSec: 11 },
  { label: "Lifestyle", startSec: 11, endSec: 14 },
  { label: "CTA", startSec: 14, endSec: 22 },
];

export default function CinematicAdPreviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [hookEdit, setHookEdit] = useState("");
  const [presetEdit, setPresetEdit] = useState<string>("pin-organic");
  const [pinTitle, setPinTitle] = useState("");
  const [pinDesc, setPinDesc] = useState("");
  const [pinUrl, setPinUrl] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyleId>("lifestyle_female");
  const videoRef = useRef<HTMLVideoElement>(null);

  const load = async () => {
    if (!jobId) return;
    setLoading(true);
    const { data, error } = await supabase.from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error) { toast.error(error.message); setLoading(false); return; }
    setJob(data);
    setHookEdit((data as any)?.hook_text ?? (data as any)?.hook_variant ?? "");
    setPresetEdit((data as any)?.preset ?? "pin-organic");
    setPinTitle((data as any)?.pin_title ?? "");
    setPinDesc((data as any)?.pin_description ?? "");
    setPinUrl((data as any)?.pin_destination_url ?? "");
    setHashtags(Array.isArray((data as any)?.hashtags) ? (data as any).hashtags.join(" ") : "");
    setVoiceStyle(((data as any)?.voice_style as VoiceStyleId) ?? "lifestyle_female");
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [jobId]);

  const report = (job?.validation_report ?? null) as ValidationReport;
  const canPublish = !!report?.passed && !!job?.output_mp4_url;

  const seekTo = (sec: number) => {
    const v = videoRef.current;
    if (v) { v.currentTime = sec; v.play().catch(() => {}); }
  };

  const callFn = async (fn: string, payload: any) => {
    const { data, error } = await supabase.functions.invoke(fn, { body: payload });
    if (error) throw new Error(error.message);
    if ((data as any)?.ok === false) throw new Error((data as any)?.message ?? "Function returned ok:false");
    return data;
  };

  const handleRevalidate = async () => {
    if (!jobId) return;
    setBusy("revalidate");
    try {
      await callFn("cinematic-ad-validate", { job_id: jobId });
      toast.success("Validator re-ran");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleReRender = async () => {
    if (!jobId) return;
    setBusy("rerender");
    try {
      await callFn("cinematic-ad-queue-render", { job_id: jobId, preset: presetEdit });
      toast.success(`Queued re-render with preset ${presetEdit}`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleApproveAndPublish = async () => {
    if (!jobId) return;
    setBusy("approve");
    try {
      await callFn("cinematic-ad-approve", {
        job_id: jobId,
        pin_title: pinTitle,
        pin_description: pinDesc,
        pin_destination_url: pinUrl,
        hashtags: hashtags.split(/\s+/).filter(Boolean),
        preset: presetEdit,
      });
      toast.success("Approved — render queued");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handlePublishPinterest = async () => {
    if (!jobId) return;
    setBusy("publish");
    try {
      await callFn("cinematic-ad-push-pinterest", { job_id: jobId });
      toast.success("Pushed to Pinterest");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleRegenVO = async () => {
    if (!jobId) return;
    setBusy("regen-vo");
    try {
      await callFn("cinematic-ad-prepare", { job_id: jobId, product_slug: job.product_slug, regenerate: "vo", voice_style: voiceStyle });
      toast.success("Voiceover regenerated");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleRegenHook = async () => {
    if (!jobId) return;
    setBusy("regen-hook");
    try {
      await callFn("cinematic-ad-prepare", { job_id: jobId, product_slug: job.product_slug, regenerate: "copy", voice_style: voiceStyle });
      toast.success("Hook & pin copy regenerated");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const selectHook = async (idx: number) => {
    if (!jobId) return;
    const hooks: HookVariantMeta[] = Array.isArray(job?.hook_variants_meta) ? job.hook_variants_meta : [];
    const picked = hooks[idx];
    if (!picked) return;
    setBusy(`hook-${idx}`);
    try {
      const { error } = await supabase.from("cinematic_ad_jobs").update({
        selected_hook_index: idx,
        hook_text: picked.text,
        hook_variant: picked.text,
      }).eq("id", jobId);
      if (error) throw error;
      toast.success(`Hook set: ${picked.text.slice(0, 40)}`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const selectCta = async (idx: number) => {
    if (!jobId) return;
    const ctas: CtaVariantMeta[] = Array.isArray(job?.cta_variants_meta) ? job.cta_variants_meta : [];
    const picked = ctas[idx];
    if (!picked) return;
    setBusy(`cta-${idx}`);
    try {
      const { error } = await supabase.from("cinematic_ad_jobs").update({
        selected_cta_index: idx,
        cta_text: picked.text,
      }).eq("id", jobId);
      if (error) throw error;
      toast.success(`CTA set: ${picked.text}`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  const handleForcePublish = async () => {
    if (!jobId) return;
    if (!confirm("Validation has NOT passed. Force-publish anyway?")) return;
    setBusy("publish");
    try {
      await callFn("cinematic-ad-push-pinterest", { job_id: jobId, force: true });
      toast.success("Force-published");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="p-8"><h2>Loading preview…</h2></div>;
  if (!job) return <div className="p-8"><h2>Job not found</h2></div>;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/cinematic-ads/dashboard")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to dashboard
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cinematic Ad Preview</h1>
          <p className="text-sm text-muted-foreground">
            Job <code className="font-mono">{String(job.id).slice(0, 8)}</code> · {job.product_slug} · status <Badge variant="outline">{job.status}</Badge> · preset <Badge>{job.preset ?? "pin-organic"}</Badge>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr] gap-6">
        {/* Player */}
        <div className="space-y-3">
          <div className="rounded-xl overflow-hidden bg-black aspect-[9/16] sticky top-4">
            {job.output_mp4_url ? (
              <video
                ref={videoRef}
                src={job.output_mp4_url}
                poster={job.output_thumbnail_url ?? undefined}
                controls
                playsInline
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/60 text-sm">
                No MP4 rendered yet
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {job.output_width}×{job.output_height} · {job.output_duration_seconds?.toFixed?.(1) ?? "—"}s · {(Number(job.output_file_size_bytes ?? 0) / 1024 / 1024).toFixed(2)} MB
          </div>
          {job.output_mp4_url && (
            <a href={job.output_mp4_url} download className="text-xs inline-flex items-center gap-1 text-primary hover:underline">
              <Download className="w-3 h-3" /> Download MP4
            </a>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* AI Creative Kit — hooks, CTAs, storyboard */}
          {(() => {
            const hooks: HookVariantMeta[] = Array.isArray(job?.hook_variants_meta) ? job.hook_variants_meta : [];
            const ctas: CtaVariantMeta[] = Array.isArray(job?.cta_variants_meta) ? job.cta_variants_meta : [];
            const storyboard: StoryboardScene[] = Array.isArray(job?.storyboard) ? job.storyboard : [];
            const selH = Number(job?.selected_hook_index ?? 0);
            const selC = Number(job?.selected_cta_index ?? 0);
            const recommended = hooks[0];
            if (hooks.length === 0 && ctas.length === 0 && storyboard.length === 0) return null;
            return (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI Creative Kit</span>
                    <Button size="sm" variant="outline" onClick={handleRegenHook} disabled={busy !== null}>
                      <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy === "regen-hook" ? "animate-spin" : ""}`} /> Regenerate
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recommended && (
                    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1">
                        AI Recommended Hook
                      </div>
                      <div className="text-base font-semibold leading-snug">{recommended.text}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                        <Badge variant="secondary">{ANGLE_LABEL[recommended.angle] ?? recommended.angle}</Badge>
                        <Badge variant="outline">Predicted CTR score {recommended.score}</Badge>
                        {recommended.reasoning && <span className="italic">{recommended.reasoning}</span>}
                      </div>
                    </div>
                  )}

                  {hooks.length > 0 && (
                    <div>
                      <Label className="text-xs">Hook variants ({hooks.length}) — click to override</Label>
                      <div className="space-y-1.5 mt-1.5">
                        {hooks.map((h, i) => {
                          const active = i === selH;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => selectHook(i)}
                              disabled={busy !== null}
                              className={`w-full text-left rounded-md border px-3 py-2 transition ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium leading-snug">{h.text}</div>
                                <div className="shrink-0 flex items-center gap-1.5">
                                  <Badge variant="outline" className="text-[10px]">{ANGLE_LABEL[h.angle] ?? h.angle}</Badge>
                                  <Badge variant={active ? "default" : "secondary"} className="text-[10px]">{h.score}</Badge>
                                </div>
                              </div>
                              {h.reasoning && <div className="text-[10px] text-muted-foreground mt-0.5">{h.reasoning}</div>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {ctas.length > 0 && (
                    <div>
                      <Label className="text-xs">CTA variants ({ctas.length})</Label>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {ctas.map((c, i) => {
                          const active = i === selC;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => selectCta(i)}
                              disabled={busy !== null}
                              className={`rounded-md border px-3 py-1.5 text-sm transition ${active ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"}`}
                            >
                              {c.text} <span className="text-[10px] text-muted-foreground ml-1">{c.score}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {storyboard.length > 0 && (
                    <div>
                      <Label className="text-xs">Storyboard ({storyboard.length} scenes)</Label>
                      <div className="space-y-1.5 mt-1.5">
                        {storyboard.map((s) => (
                          <div key={s.scene_index} className="rounded-md border p-2 text-xs">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="font-semibold">#{s.scene_index} · {s.role}</span>
                              <span className="text-muted-foreground">{s.duration_s}s</span>
                            </div>
                            <div className="text-muted-foreground"><span className="font-medium text-foreground">Visual:</span> {s.visual}</div>
                            <div className="text-muted-foreground"><span className="font-medium text-foreground">On-screen:</span> {s.on_screen_text}</div>
                            <div className="text-muted-foreground"><span className="font-medium text-foreground">VO:</span> {s.vo_line}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Generated concept */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Generated concept</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {(Array.isArray(job.scene_assets) ? job.scene_assets : []).map((s: any) => (
                  <div key={s.index} className="relative aspect-[9/16] bg-muted rounded overflow-hidden">
                    {s.image_url && <img src={s.image_url} alt="" className="w-full h-full object-cover" />}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">{s.caption}</div>
                  </div>
                ))}
              </div>
              <div>
                <Label className="text-xs">VO script</Label>
                <Textarea readOnly value={job.vo_script ?? ""} rows={4} className="text-xs" />
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                <Badge variant="outline">Voice: {job.voice_style ?? "—"}</Badge>
                <Badge variant="outline">Voice ID: {(job.voice_id ?? "").slice(0, 8)}</Badge>
                <Badge variant="outline">~{job.output_duration_seconds ?? "—"}s</Badge>
                {Array.isArray(job.media_warnings) && job.media_warnings.length > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    <AlertTriangle className="w-3 h-3 mr-1" /> {job.media_warnings.length} media warning(s)
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handleRegenHook} disabled={busy !== null}>
                  <Sparkles className={`w-3.5 h-3.5 mr-1 ${busy === "regen-hook" ? "animate-spin" : ""}`} /> Regenerate hook & copy
                </Button>
                <Button size="sm" variant="outline" onClick={handleRegenVO} disabled={busy !== null}>
                  <Mic className={`w-3.5 h-3.5 mr-1 ${busy === "regen-vo" ? "animate-spin" : ""}`} /> Regenerate voiceover
                </Button>
              </div>
              <div>
                <Label className="text-xs">Voiceover style</Label>
                <VoiceStyleSelector value={voiceStyle} onChange={setVoiceStyle} />
              </div>
            </CardContent>
          </Card>

          {/* Pin copy editor */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Pinterest copy (editable)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div>
                <Label className="text-xs">Pin title</Label>
                <Input value={pinTitle} onChange={(e) => setPinTitle(e.target.value)} maxLength={100} />
              </div>
              <div>
                <Label className="text-xs">Pin description</Label>
                <Textarea value={pinDesc} onChange={(e) => setPinDesc(e.target.value)} rows={3} maxLength={480} />
              </div>
              <div>
                <Label className="text-xs">Destination URL</Label>
                <Input value={pinUrl} onChange={(e) => setPinUrl(e.target.value)} placeholder="https://getpawsy.pet/products/..." />
              </div>
              <div>
                <Label className="text-xs">Hashtags (space separated)</Label>
                <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#cats #petproducts" />
              </div>
            </CardContent>
          </Card>

          {/* Validator */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Validator</span>
                <Button size="sm" variant="outline" onClick={handleRevalidate} disabled={busy !== null}>
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy === "revalidate" ? "animate-spin" : ""}`} /> Re-run
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!report ? (
                <p className="text-sm text-muted-foreground">No validation report yet.</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    {report.passed ? (
                      <Badge className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Passed</Badge>
                    ) : (
                      <Badge variant="destructive"><XCircle className="w-3.5 h-3.5 mr-1" /> Failed</Badge>
                    )}
                    {report.motion_score != null && (
                      <Badge variant="outline">motion {report.motion_score.toFixed(3)}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.validated_at).toLocaleString()}
                    </span>
                  </div>
                  <ul className="text-sm space-y-1.5 mt-2">
                    {report.checks.map((c) => (
                      <li key={c.name} className="flex items-start gap-2">
                        {c.passed
                          ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                          : <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                        <div className="flex-1">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            got <code>{String(c.observed)}</code>, expected <code>{String(c.expected)}</code>
                          </div>
                          {c.message && <div className="text-xs text-amber-700 mt-0.5">{c.message}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          {/* Scene timeline */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Scene timeline</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                {SCENE_BREAKDOWN.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => seekTo(s.startSec)}
                    className="rounded-lg border bg-muted/40 hover:bg-muted px-2 py-3 text-left transition"
                  >
                    <div className="text-[11px] font-mono text-muted-foreground">{s.startSec}s–{s.endSec}s</div>
                    <div className="text-sm font-semibold">{s.label}</div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">Click a scene to seek the player. Re-render below to regenerate any segment with new motion.</p>
            </CardContent>
          </Card>

          {/* Overrides */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Overrides & re-render</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Export preset</Label>
                  <Select value={presetEdit} onValueChange={setPresetEdit}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRESET_OPTIONS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Hook text</Label>
                  <Input value={hookEdit} onChange={(e) => setHookEdit(e.target.value)} placeholder="Stop scrolling. Look at this." />
                </div>
              </div>
              <Button onClick={handleReRender} disabled={busy !== null} variant="secondary">
                <RefreshCw className={`w-4 h-4 mr-1 ${busy === "rerender" ? "animate-spin" : ""}`} />
                Re-render with selected preset
              </Button>
              <p className="text-[11px] text-muted-foreground">Hook edits are applied on the next render — the worker reads them from the job row.</p>
            </CardContent>
          </Card>

          {/* Publish */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Approve & publish</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleApproveAndPublish} disabled={busy !== null}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Approve & render MP4
                </Button>
                <Button onClick={handlePublishPinterest} disabled={!canPublish || busy !== null} variant="secondary">
                  <Upload className="w-4 h-4 mr-1" /> Publish to Pinterest
                </Button>
                <Button onClick={handleForcePublish} disabled={busy !== null || !job.output_mp4_url} variant="outline">
                  Force publish (override validator)
                </Button>
              </div>
              {!canPublish && (
                <p className="text-xs text-amber-700">Validator hasn't passed — fix issues above or force-publish.</p>
              )}
              {job.approved_at && (
                <p className="text-xs text-muted-foreground">Approved {new Date(job.approved_at).toLocaleString()}</p>
              )}
              {job.pinterest_pin_url && (
                <a href={job.pinterest_pin_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                  View live pin →
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}