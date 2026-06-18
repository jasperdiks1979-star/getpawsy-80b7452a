import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Play, RefreshCw, Mic } from "lucide-react";

type Job = {
  id: string;
  product_slug: string;
  status: string;
  qa_total: number | null;
  qa_passed: boolean;
  qa_scores: Record<string, number>;
  failure_reasons: string[];
  duration_seconds: number | null;
  voiceover_url: string | null;
  final_mp4_url: string | null;
  voiceover_transcript: string | null;
  scenes: Array<{ key: string; start: number; end: number; vo: string; caption: string; visual: string }> | null;
  created_at: string;
};

const SCORE_LABELS: Array<[string, string]> = [
  ["product_accuracy", "Product"],
  ["visual_consistency", "Visual"],
  ["text_visibility", "Text"],
  ["voiceover_present", "VO"],
  ["audio_quality", "Audio"],
  ["aspect_ratio", "Aspect"],
  ["safe_zones", "Safe"],
  ["caption_timing", "Caption"],
  ["pinterest_compliance", "Pin"],
];

function scoreColor(n: number) {
  if (n >= 95) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (n >= 80) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-400";
}

export default function CinematicV3QaPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [slugs, setSlugs] = useState("");
  const [starting, setStarting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cinematic_v3_jobs")
      .select("id, product_slug, status, qa_total, qa_passed, qa_scores, failure_reasons, duration_seconds, voiceover_url, final_mp4_url, voiceover_transcript, scenes, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setJobs((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const selected = useMemo(() => jobs.find((j) => j.id === selectedId) ?? null, [jobs, selectedId]);

  async function retryVoiceover(jobId: string): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke("cinematic-v3-retry-voiceover", {
      body: { job_id: jobId },
    });
    if (error || !(data as any)?.ok) {
      toast.error(`Retry failed: ${error?.message || (data as any)?.message || "unknown"}`);
      return false;
    }
    return true;
  }

  async function onRetryOne(jobId: string) {
    setRetryingId(jobId);
    const ok = await retryVoiceover(jobId);
    setRetryingId(null);
    if (ok) {
      toast.success("Voiceover re-queued — rendering started");
      load();
    }
  }

  async function onRetryAllFailed() {
    const failed = jobs.filter((j) => j.status === "failed" && (j.voiceover_transcript || (j.scenes && j.scenes.length)));
    if (failed.length === 0) { toast.info("No failed jobs with a transcript to retry"); return; }
    setRetryingAll(true);
    let ok = 0, fail = 0;
    for (const j of failed) {
      const r = await retryVoiceover(j.id);
      r ? ok++ : fail++;
    }
    setRetryingAll(false);
    toast.success(`Retried ${ok} job(s)${fail ? `, ${fail} failed` : ""}`);
    load();
  }

  async function startJobs() {
    const list = slugs.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error("Paste at least one product slug"); return; }
    setStarting(true);
    let ok = 0, fail = 0;
    for (const slug of list) {
      const { data, error } = await supabase.functions.invoke("cinematic-v3-start", {
        body: { product_slug: slug },
      });
      if (error || !(data as any)?.ok) {
        fail++;
        toast.error(`${slug}: ${error?.message || (data as any)?.message || "failed"}`);
      } else {
        ok++;
      }
    }
    setStarting(false);
    setSlugs("");
    toast.success(`Queued ${ok} job(s)${fail ? `, ${fail} failed` : ""}`);
    load();
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cinematic V3 — QA Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Real product images only. Mandatory voiceover. OCR-validated safe zones. QA ≥ 95 to publish.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onRetryAllFailed} variant="outline" size="sm" disabled={retryingAll}>
            {retryingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
            Retry all failed VO
          </Button>
          <Button onClick={load} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </header>

      <Card className="p-4 space-y-3">
        <h2 className="text-base font-medium">Start pilot renders</h2>
        <p className="text-xs text-muted-foreground">
          Paste 1–3 product slugs (comma or newline separated). Each job validates the product (RULE-1),
          writes a 7-beat script, generates a Jessica voiceover, and dispatches the deterministic render.
        </p>
        <div className="flex gap-2">
          <Input value={slugs} onChange={(e) => setSlugs(e.target.value)} placeholder="cat-tree-deluxe, smart-litter-box, ..." />
          <Button onClick={startJobs} disabled={starting}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span className="ml-2">Render</span>
          </Button>
        </div>
      </Card>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <Card className="p-0 overflow-hidden">
          <div className="p-3 border-b text-sm font-medium">Jobs ({jobs.length})</div>
          <div className="divide-y max-h-[70vh] overflow-y-auto">
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => setSelectedId(j.id)}
                className={`w-full text-left p-3 hover:bg-muted/40 ${selectedId === j.id ? "bg-muted/60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-xs truncate">{j.product_slug}</div>
                  <Badge variant={j.qa_passed ? "default" : "secondary"}>{j.status}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {SCORE_LABELS.map(([k, label]) => {
                    const v = j.qa_scores?.[k];
                    if (v == null) return null;
                    return (
                      <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded ${scoreColor(Number(v))}`}>
                        {label} {v}
                      </span>
                    );
                  })}
                  {j.qa_total != null && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${scoreColor(j.qa_total)}`}>
                      Total {j.qa_total}
                    </span>
                  )}
                </div>
                {j.failure_reasons?.length > 0 && (
                  <div className="mt-1 text-[10px] text-rose-600 dark:text-rose-400 truncate">
                    {j.failure_reasons.join(" · ")}
                  </div>
                )}
              </button>
            ))}
            {!loading && jobs.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No jobs yet. Paste a slug above to render the first one.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          {!selected && <div className="text-sm text-muted-foreground">Select a job to see details.</div>}
          {selected && (
            <>
              <div>
                <div className="text-xs text-muted-foreground">Product</div>
                <div className="font-mono text-sm">{selected.product_slug}</div>
              </div>
              {selected.status === "failed" && (
                <Button
                  onClick={() => onRetryOne(selected.id)}
                  disabled={retryingId === selected.id}
                  size="sm"
                  className="w-full"
                >
                  {retryingId === selected.id
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Mic className="mr-2 h-4 w-4" />}
                  Retry Voiceover
                </Button>
              )}
              {selected.final_mp4_url && (
                <video
                  src={selected.final_mp4_url}
                  controls
                  className="w-full rounded-lg bg-black aspect-[9/16] max-h-[60vh] object-contain"
                />
              )}
              {selected.voiceover_url && (
                <audio src={selected.voiceover_url} controls className="w-full" />
              )}
              {selected.voiceover_transcript && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Voiceover transcript</div>
                  <div className="text-sm whitespace-pre-wrap">{selected.voiceover_transcript}</div>
                </div>
              )}
              {selected.scenes && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Scenes</div>
                  <div className="space-y-1 text-xs">
                    {selected.scenes.map((s, i) => (
                      <div key={i} className="grid grid-cols-[60px_80px_1fr] gap-2">
                        <span className="font-mono text-muted-foreground">{s.key}</span>
                        <span className="font-mono">{s.start}-{s.end}s</span>
                        <span>{s.vo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                QA total: <span className={`font-medium ${scoreColor(selected.qa_total ?? 0).split(" ")[1]}`}>{selected.qa_total ?? "—"}</span>
                {" · "}
                {selected.qa_passed ? "PASS — eligible for Pinterest queue" : "Below 95 — blocked from publication"}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
