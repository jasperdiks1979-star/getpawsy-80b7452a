import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const TEST_SLUG = "automatic-cat-litter-box-self-cleaning-app-control";

type Scene = {
  key: "hook" | "problem" | "solution" | "cta";
  video_prompt: string;
  frame_prompt: string;
  starting_frame_url?: string;
  runway_task_id?: string;
  clip_url?: string;
  duration_s?: number;
  status?: string;
  error?: string;
};

type Job = {
  id: string;
  product_slug: string;
  product_name: string;
  product_image_url: string | null;
  status: string;
  script: { hook?: string; problem?: string; solution?: string; cta?: string; vo_text?: string } | null;
  scenes: Scene[] | null;
  voiceover_url: string | null;
  captions: any;
  final_video_url: string | null;
  qa_score: number | null;
  qa_report: Record<string, { pass: boolean; detail: string }> | null;
  cost_cents: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "approved" || status === "ready_for_review"
      ? "default"
      : status === "failed"
      ? "destructive"
      : "secondary";
  return <Badge variant={tone as any}>{status}</Badge>;
}

export default function CinematicRunwayPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mergeProgress, setMergeProgress] = useState<string>("");
  const [autoLog, setAutoLog] = useState<string[]>([]);
  const autoBusyRef = useRef(false);
  const lastPollRef = useRef<Record<string, number>>({});

  function log(msg: string) {
    const line = `${new Date().toISOString().slice(11, 19)}  ${msg}`;
    // eslint-disable-next-line no-console
    console.log("[cinematic-runway]", line);
    setAutoLog((prev) => [...prev.slice(-49), line]);
  }

  const active = useMemo(() => jobs.find((j) => j.id === activeId) ?? jobs[0] ?? null, [jobs, activeId]);

  async function loadJobs() {
    const { data, error } = await supabase
      .from("cinematic_runway_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      toast.error(`Load failed: ${error.message}`);
      return;
    }
    setJobs((data ?? []) as unknown as Job[]);
    if (!activeId && data?.[0]) setActiveId(data[0].id);
  }

  useEffect(() => {
    loadJobs();
    const ch = supabase
      .channel("cinematic-runway-jobs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cinematic_runway_jobs" },
        () => loadJobs(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startGeneration() {
    setBusy("generating");
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-runway-generate", {
        body: { product_slug: TEST_SLUG },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "failed");
      toast.success("Generation started — Runway is rendering 4 scenes (~3-5 min)");
      setActiveId(data.job_id);
      loadJobs();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function pollScenes() {
    if (!active) return;
    setBusy("polling");
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-runway-poll", {
        body: { job_id: active.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "failed");
      toast.success(`Poll: status=${data.status}`);
      loadJobs();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function makeVoiceover() {
    if (!active) return;
    setBusy("voiceover");
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-runway-voiceover", {
        body: { job_id: active.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "failed");
      toast.success("Voice-over generated");
      loadJobs();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function assemble() {
    if (!active) return;
    if (!active.scenes || active.scenes.length !== 4 || !active.scenes.every((s) => s.clip_url)) {
      toast.error("Need 4 finished scene clips first");
      return;
    }
    if (!active.voiceover_url) {
      toast.error("Need voice-over first");
      return;
    }
    setBusy("assembling");
    setMergeProgress("Loading ffmpeg.wasm…");
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      const base = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      });
      ffmpeg.on("log", ({ message }) => {
        if (message.includes("frame=")) setMergeProgress(message.slice(0, 120));
      });

      // Load font for burned captions
      setMergeProgress("Loading font…");
      const fontResp = await fetch(
        "https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTc2dRDgIWk_RW6.ttf",
      );
      const fontBytes = new Uint8Array(await fontResp.arrayBuffer());
      await ffmpeg.writeFile("Inter.ttf", fontBytes);

      // Fetch all clips and voiceover
      const sceneOrder: Array<Scene["key"]> = ["hook", "problem", "solution", "cta"];
      for (const key of sceneOrder) {
        setMergeProgress(`Fetching scene ${key}…`);
        const s = active.scenes!.find((x) => x.key === key)!;
        await ffmpeg.writeFile(`${key}.mp4`, await fetchFile(s.clip_url!));
      }
      setMergeProgress("Fetching voice-over…");
      await ffmpeg.writeFile("vo.mp3", await fetchFile(active.voiceover_url));

      // Concat the 4 clips into one, dropping any original audio
      setMergeProgress("Concatenating scenes…");
      const concatList = sceneOrder
        .map((k) => `file '${k}.mp4'`)
        .join("\n");
      await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(concatList));
      await ffmpeg.exec([
        "-f", "concat", "-safe", "0", "-i", "concat.txt",
        "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "24",
        "concat.mp4",
      ]);

      // Burn captions via drawtext per segment, then mux voiceover
      setMergeProgress("Burning captions + adding voice-over…");
      const lines = sceneOrder.map((k) => active.script?.[k] ?? "");
      const esc = (s: string) =>
        s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/,/g, "\\,");
      // Each scene assumed 5s; segments: 0-5, 5-10, 10-15, 15-20
      const drawFilters = lines
        .map((text, i) => {
          const start = i * 5;
          const end = start + 5;
          return `drawtext=fontfile=Inter.ttf:text='${esc(text)}':fontcolor=white:fontsize=44:` +
            `box=1:boxcolor=black@0.55:boxborderw=24:x=(w-text_w)/2:y=h-220:` +
            `enable='between(t,${start},${end})'`;
        })
        .join(",");

      await ffmpeg.exec([
        "-i", "concat.mp4",
        "-i", "vo.mp3",
        "-vf", drawFilters,
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        "final.mp4",
      ]);

      setMergeProgress("Uploading final video…");
      const out = (await ffmpeg.readFile("final.mp4")) as Uint8Array;
      const blob = new Blob([out as unknown as BlobPart], { type: "video/mp4" });
      const path = `jobs/${active.id}/final.mp4`;
      const { error: upErr } = await supabase.storage
        .from("cinematic-runway")
        .upload(path, blob, { contentType: "video/mp4", upsert: true });
      if (upErr) throw upErr;
      const finalUrl = supabase.storage.from("cinematic-runway").getPublicUrl(path).data.publicUrl;

      // Measure duration
      const dur = await new Promise<number>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => resolve(v.duration);
        v.onerror = () => resolve(0);
        v.src = URL.createObjectURL(blob);
      });

      const captions = sceneOrder.map((k, i) => ({
        key: k,
        text: lines[i],
        start_s: i * 5,
        end_s: i * 5 + 5,
      }));

      setMergeProgress("Running QA…");
      const { data: qa, error: qaErr } = await supabase.functions.invoke(
        "cinematic-runway-finalize",
        {
          body: {
            job_id: active.id,
            final_video_url: finalUrl,
            duration_s: dur,
            byte_size: blob.size,
            captions,
          },
        },
      );
      if (qaErr) throw qaErr;
      if (!qa?.ok) {
        toast.error(`QA failed (score ${qa?.qa_score ?? "?"}). Review report.`);
      } else {
        toast.success(`Final assembled. QA score ${qa.qa_score}.`);
      }
      setMergeProgress("");
      loadJobs();
    } catch (e: any) {
      toast.error(e.message ?? String(e));
      setMergeProgress("");
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!active) return;
    setBusy("approving");
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-runway-approve", {
        body: { job_id: active.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message ?? "failed");
      toast.success("Approved. Not published anywhere.");
      loadJobs();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Cinematic Ads — Runway Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            Real AI video ads. 4 distinct scenes (Hook → Problem → Solution → CTA), ElevenLabs voice-over,
            burned captions. Manual approval only. No autopublish.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Test product: <code>{TEST_SLUG}</code> · Budget per ad ≈ $1.30 (Runway gen3a_turbo + VO)
          </p>
        </div>
        <Button onClick={startGeneration} disabled={busy !== null}>
          {busy === "generating" ? "Starting…" : "Generate New Ad"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.length === 0 && (
              <p className="text-xs text-muted-foreground">No jobs yet.</p>
            )}
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => setActiveId(j.id)}
                className={`w-full text-left p-2 rounded border text-xs ${
                  active?.id === j.id ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono">{j.id.slice(0, 8)}</span>
                  <StatusBadge status={j.status} />
                </div>
                <div className="text-muted-foreground truncate">{j.product_slug}</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {new Date(j.created_at).toLocaleString()}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!active && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Click "Generate New Ad" to start.
              </CardContent>
            </Card>
          )}

          {active && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    Job {active.id.slice(0, 8)} · {active.product_name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={active.status} />
                    <span className="text-xs text-muted-foreground">
                      ${(active.cost_cents / 100).toFixed(2)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {active.error && (
                    <div className="text-xs text-destructive border border-destructive/40 rounded p-2">
                      {active.error}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={pollScenes} disabled={busy !== null}>
                      {busy === "polling" ? "Polling…" : "Poll Runway"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={makeVoiceover}
                      disabled={busy !== null || !active.script?.vo_text}
                    >
                      {busy === "voiceover" ? "Generating VO…" : "Generate Voice-over"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={assemble}
                      disabled={
                        busy !== null ||
                        !active.voiceover_url ||
                        !active.scenes?.every((s) => s.clip_url)
                      }
                    >
                      {busy === "assembling" ? "Merging…" : "Assemble Final Video"}
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={approve}
                      disabled={busy !== null || active.status !== "ready_for_review"}
                    >
                      {busy === "approving" ? "Approving…" : "Approve (no publish)"}
                    </Button>
                  </div>
                  {mergeProgress && (
                    <p className="text-xs text-muted-foreground font-mono">{mergeProgress}</p>
                  )}
                </CardContent>
              </Card>

              {active.script && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Script</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p><b>Hook:</b> {active.script.hook}</p>
                    <p><b>Problem:</b> {active.script.problem}</p>
                    <p><b>Solution:</b> {active.script.solution}</p>
                    <p><b>CTA:</b> {active.script.cta}</p>
                    <p className="text-muted-foreground mt-2 text-xs">
                      <b>VO:</b> {active.script.vo_text}
                    </p>
                  </CardContent>
                </Card>
              )}

              {active.scenes && active.scenes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Scenes</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {active.scenes.map((s) => (
                      <div key={s.key} className="border rounded p-3 space-y-2">
                        <div className="flex justify-between text-xs">
                          <b className="uppercase">{s.key}</b>
                          <span className="text-muted-foreground">{s.status ?? "—"}</span>
                        </div>
                        {s.starting_frame_url && (
                          <img
                            src={s.starting_frame_url}
                            alt={`${s.key} frame`}
                            className="w-full aspect-[9/16] object-cover rounded"
                          />
                        )}
                        {s.clip_url && (
                          <video
                            src={s.clip_url}
                            controls
                            className="w-full aspect-[9/16] rounded bg-black"
                          />
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          {s.video_prompt}
                        </p>
                        {s.error && <p className="text-xs text-destructive">{s.error}</p>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {active.voiceover_url && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Voice-over</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <audio src={active.voiceover_url} controls className="w-full" />
                  </CardContent>
                </Card>
              )}

              {active.final_video_url && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Final video</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <video
                      src={active.final_video_url}
                      controls
                      className="w-full max-w-sm mx-auto aspect-[9/16] rounded bg-black"
                    />
                    {active.qa_report && (
                      <div className="text-xs space-y-1">
                        <b>QA score: {active.qa_score}</b>
                        {Object.entries(active.qa_report).map(([k, v]) => (
                          <div key={k} className="flex justify-between">
                            <span className={v.pass ? "text-green-600" : "text-destructive"}>
                              {v.pass ? "✓" : "✗"} {k}
                            </span>
                            <span className="text-muted-foreground">{v.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}