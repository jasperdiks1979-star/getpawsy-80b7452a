import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, RefreshCw, Upload, AlertTriangle } from "lucide-react";

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
  const videoRef = useRef<HTMLVideoElement>(null);

  const load = async () => {
    if (!jobId) return;
    setLoading(true);
    const { data, error } = await supabase.from("cinematic_ad_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error) { toast.error(error.message); setLoading(false); return; }
    setJob(data);
    setHookEdit((data as any)?.hook_text ?? (data as any)?.hook_variant ?? "");
    setPresetEdit((data as any)?.preset ?? "pin-organic");
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
    setBusy("publish");
    try {
      await callFn("cinematic-ad-push-pinterest", { job_id: jobId });
      toast.success("Approved & pushed to Pinterest");
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
        </div>

        {/* Right column */}
        <div className="space-y-4">
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
                <Button onClick={handleApproveAndPublish} disabled={!canPublish || busy !== null}>
                  <Upload className="w-4 h-4 mr-1" /> Approve & push to Pinterest
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}