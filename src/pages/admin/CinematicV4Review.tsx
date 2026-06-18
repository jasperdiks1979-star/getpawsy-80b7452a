import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type SceneAsset = { beat: string; index: number; image_url: string; source: string };
type Beat = { index: number; beat: string; caption: string; duration_frames: number; image_role: string; motion: string };

type Storyboard = {
  id: string;
  product_slug: string;
  status: string;
  beats: Beat[];
  scene_assets: SceneAsset[];
  scene_count: number | null;
  unique_image_count: number | null;
  quality_score: number | null;
  cv4_reject_reasons: string[];
  mp4_url: string | null;
  preview_thumb_url: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  github_run_id: string | null;
  github_run_url: string | null;
  last_render_dispatched_at: string | null;
  render_error: string | null;
};

type QueueRow = {
  id: string;
  storyboard_id: string | null;
  status: string;
  approved_at: string | null;
  engine_version: string | null;
};

type V5Beat = { role: string; caption: string; vo_line: string; duration_s: number; camera: string; scene: string };
type V5Storyboard = {
  id: string; product_id: string; product_slug: string | null; product_title: string | null; niche: string | null;
  status: string; beats: V5Beat[]; scene_image_urls: string[] | null; vo_audio_url: string[] | null;
  vo_total_duration_s: number | null; quality_score: number | null; quality_breakdown: any;
  mp4_url: string | null; github_run_id: string | null; github_run_url: string | null;
  render_error: string | null; approved_at: string | null; rejected_reason: string | null; created_at: string;
};

export default function CinematicV4Review() {
  const [items, setItems] = useState<Array<{ sb: Storyboard; queue: QueueRow | null }>>([]);
  const [v5Items, setV5Items] = useState<Array<{ sb: V5Storyboard; queue: QueueRow | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [v5Busy, setV5Busy] = useState(false);

  async function load() {
    setLoading(true);
    const { data: sbs, error } = await supabase
      .from("cinematic_v4_storyboards")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) {
      toast.error(`Load failed: ${error.message}`);
      setLoading(false);
      return;
    }
    const ids = (sbs || []).map((s: any) => s.id);
    let queues: any[] = [];
    if (ids.length > 0) {
      const { data: q } = await supabase
        .from("pinterest_video_queue")
        .select("id, storyboard_id, status, approved_at, engine_version")
        .in("storyboard_id", ids);
      queues = q || [];
    }
    const merged = (sbs || []).map((sb: any) => ({
      sb: sb as Storyboard,
      queue: (queues.find((q: any) => q.storyboard_id === sb.id) as QueueRow) || null,
    }));
    setItems(merged);
    setLoading(false);
  }

  async function loadV5() {
    const { data: sbs } = await supabase.from("cv5_storyboards").select("*").order("created_at", { ascending: false }).limit(40);
    const ids = (sbs || []).map((s: any) => s.id);
    let queues: any[] = [];
    if (ids.length > 0) {
      const { data: q } = await supabase.from("pinterest_video_queue").select("id, storyboard_id, status, approved_at, engine_version").in("storyboard_id", ids);
      queues = q || [];
    }
    setV5Items((sbs || []).map((sb: any) => ({ sb, queue: queues.find((q: any) => q.storyboard_id === sb.id) || null })));
  }

  useEffect(() => { load(); loadV5(); }, []);

  // Auto-refresh while any storyboard is mid-pipeline so the user sees status flips.
  useEffect(() => {
    const midV4 = items.some((it) => ["github_dispatched", "rendering", "awaiting_render", "pending"].includes(it.sb.status));
    const midV5 = v5Items.some((it) => ["github_dispatched", "rendering", "awaiting_render", "generating"].includes(it.sb.status));
    if (!midV4 && !midV5) return;
    const t = setInterval(() => { if (midV4) load(); if (midV5) loadV5(); }, 8000);
    return () => clearInterval(t);
  }, [items, v5Items]);

  async function generateV5Prototypes() {
    setV5Busy(true);
    const { data, error } = await supabase.functions.invoke("cv5-generate-prototypes", { body: {} });
    setV5Busy(false);
    if (error) toast.error(error.message);
    else {
      const ok = (data?.results || []).filter((r: any) => r.ok).length;
      toast.success(`V5 prototypes: ${ok}/${data?.results?.length ?? 0} generated. Press “Force render” to render MP4s.`);
      loadV5();
    }
  }

  async function renderV5One(id: string) {
    setBusy(id);
    const { data, error } = await supabase.functions.invoke("cv5-queue-render", { body: { storyboard_id: id } });
    setBusy(null);
    if (error) toast.error(error.message);
    else if (!data?.results?.[0]?.ok) toast.error(data?.results?.[0]?.message || "dispatch failed");
    else { toast.success(`V5 render dispatched · run ${data.results[0].run_id || "?"}`); loadV5(); }
  }

  async function renderV5All() {
    setV5Busy(true);
    const { data: stuck } = await supabase.from("cv5_storyboards").select("id").in("status", ["awaiting_render", "upload_failed", "callback_failed"]);
    const ids = (stuck || []).map((r: any) => r.id);
    const { data, error } = await supabase.functions.invoke("cv5-queue-render", { body: { storyboard_ids: ids } });
    setV5Busy(false);
    if (error) toast.error(error.message);
    else { toast.success(`Force-rendered ${data?.dispatched ?? 0}/${data?.total ?? 0}`); loadV5(); }
  }

  async function approveV5(item: { sb: V5Storyboard; queue: QueueRow | null }) {
    if (!item.queue) return toast.error("No queue row to approve");
    setBusy(item.sb.id);
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("pinterest_video_queue").update({ status: "pending", approved_at: nowIso }).eq("id", item.queue.id);
    if (error) toast.error(error.message);
    else {
      await supabase.from("cv5_storyboards").update({ approved_at: nowIso }).eq("id", item.sb.id);
      toast.success("Approved (publisher kill switch still active — videos won't ship until kill switch is lifted).");
      loadV5();
    }
    setBusy(null);
  }

  async function rejectV5(item: { sb: V5Storyboard; queue: QueueRow | null }) {
    setBusy(item.sb.id);
    await supabase.from("cv5_storyboards").update({ status: "rejected", rejected_reason: "manual_reject_v5" }).eq("id", item.sb.id);
    if (item.queue) await supabase.from("pinterest_video_queue").update({ status: "creative_rejected", error_message: "manual_reject_v5" }).eq("id", item.queue.id);
    toast.success("Rejected");
    setBusy(null); loadV5();
  }

  function v5Stage(sb: V5Storyboard, queueStatus: string): { label: string; tone: "default" | "secondary" | "destructive" | "outline" } {
    if (queueStatus === "awaiting_review") return { label: "awaiting_review", tone: "default" };
    if (sb.status === "rejected") return { label: "rejected", tone: "destructive" };
    if (sb.status === "upload_failed") return { label: "upload_failed", tone: "destructive" };
    if (sb.status === "callback_failed") return { label: "callback_failed", tone: "destructive" };
    if (sb.status === "rendered") return { label: "rendered", tone: "secondary" };
    if (sb.status === "rendering") return { label: "rendering", tone: "outline" };
    if (sb.status === "github_dispatched") return { label: "github_dispatched", tone: "outline" };
    if (sb.status === "awaiting_render") return { label: "waiting_for_github", tone: "outline" };
    if (sb.status === "generating") return { label: "generating_scenes_vo", tone: "outline" };
    return { label: sb.status, tone: "outline" };
  }

  async function approve(item: { sb: Storyboard; queue: QueueRow | null }) {
    if (!item.queue) return toast.error("No queue row to approve");
    if (item.sb.status === "rejected" || item.sb.cv4_reject_reasons?.length > 0 || item.queue.status === "creative_rejected") {
      return toast.error("V4 is emergency-blocked. Rebuild quality before approval.");
    }
    setBusy(item.sb.id);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("pinterest_video_queue")
      .update({ status: "pending", approved_at: nowIso })
      .eq("id", item.queue.id);
    if (error) toast.error(error.message);
    else {
      await supabase.from("cinematic_v4_storyboards").update({ approved_at: nowIso }).eq("id", item.sb.id);
      toast.success("Approved — drainer will publish on its next cycle.");
      load();
    }
    setBusy(null);
  }

  async function reject(item: { sb: Storyboard; queue: QueueRow | null }) {
    setBusy(item.sb.id);
    const nowIso = new Date().toISOString();
    await supabase.from("cinematic_v4_storyboards")
      .update({ status: "rejected", rejected_at: nowIso }).eq("id", item.sb.id);
    if (item.queue) {
      await supabase.from("pinterest_video_queue")
        .update({ status: "creative_rejected", error_message: "manual_reject_v4" })
        .eq("id", item.queue.id);
    }
    toast.success("Rejected");
    setBusy(null);
    load();
  }

  async function generateShowcase() {
    setGenBusy(true);
    const { data, error } = await supabase.functions.invoke("cv4-generate-showcase", { body: {} });
    setGenBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(`Generated ${data?.count ?? 0} storyboards · dispatched ${data?.dispatch?.dispatched ?? 0}`); load(); }
  }

  async function renderAll() {
    setGenBusy(true);
    // Pull every storyboard currently stuck pre-render so a single click recovers them.
    const { data: stuck } = await supabase
      .from("cinematic_v4_storyboards")
      .select("id")
      .in("status", ["awaiting_render", "validated", "upload_failed", "callback_failed"]);
    const ids = (stuck || []).map((r: any) => r.id);
    const { data, error } = await supabase.functions.invoke("cv4-queue-render", { body: { storyboard_ids: ids } });
    setGenBusy(false);
    if (error) toast.error(error.message);
    else {
      const okRuns = (data?.results || []).filter((r: any) => r.ok && r.run_id).map((r: any) => r.run_id);
      toast.success(`Force-rendered ${data?.dispatched ?? 0}/${data?.total ?? 0}${okRuns.length ? ` · run ${okRuns[0]}` : ""}`);
      load();
    }
  }

  async function renderOne(storyboard_id: string) {
    setBusy(storyboard_id);
    const { data, error } = await supabase.functions.invoke("cv4-queue-render", { body: { storyboard_id } });
    setBusy(null);
    if (error) toast.error(error.message);
    else if (!data?.results?.[0]?.ok) toast.error(data?.results?.[0]?.message || "dispatch failed");
    else {
      const r = data.results[0];
      toast.success(r.run_id ? `Render dispatched · GitHub run ${r.run_id}` : "Render dispatched");
      load();
    }
  }

  function pipelineStage(sb: Storyboard, queueStatus: string): { label: string; tone: "default" | "secondary" | "destructive" | "outline" } {
    if (queueStatus === "awaiting_review") return { label: "awaiting_review", tone: "default" };
    if (sb.status === "rejected") return { label: "rejected", tone: "destructive" };
    if (sb.status === "upload_failed") return { label: "upload_failed", tone: "destructive" };
    if (sb.status === "callback_failed") return { label: "callback_failed", tone: "destructive" };
    if (sb.status === "rendered") return { label: "rendered", tone: "secondary" };
    if (sb.status === "rendering") return { label: "rendering", tone: "outline" };
    if (sb.status === "github_dispatched") return { label: "github_dispatched", tone: "outline" };
    if (sb.status === "awaiting_render") return { label: "waiting_for_github", tone: "outline" };
    return { label: sb.status, tone: "outline" };
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <header>
        <div>
          <h1 className="text-2xl font-semibold">Cinematic Review</h1>
          <p className="text-sm text-muted-foreground">Auto-publish disabled. Every video needs manual approval. V5 = Pinterest-native UGC story ads with ElevenLabs voice-over and AI-generated lifestyle scenes.</p>
        </div>
      </header>

      <Tabs defaultValue="v5">
        <TabsList>
          <TabsTrigger value="v5">V5 · UGC Story Ads</TabsTrigger>
          <TabsTrigger value="v4">V4 · Frozen (Ken Burns)</TabsTrigger>
        </TabsList>

        <TabsContent value="v5" className="space-y-6 pt-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={renderV5All} disabled={v5Busy}>Force render all V5</Button>
            <Button onClick={generateV5Prototypes} disabled={v5Busy}>{v5Busy ? "Working…" : "Generate 3 V5 prototypes"}</Button>
          </div>
          {v5Items.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No V5 storyboards yet. Click “Generate 3 V5 prototypes”.</CardContent></Card>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {v5Items.map((it) => {
              const sb = it.sb;
              const queueStatus = it.queue?.status || "—";
              const stage = v5Stage(sb, queueStatus);
              const reasons: string[] = sb.quality_breakdown?.reasons || [];
              return (
                <Card key={sb.id} className={sb.status === "rejected" ? "border-destructive/40" : ""}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{sb.product_title || sb.product_slug || sb.product_id}</CardTitle>
                        <p className="text-xs text-muted-foreground">{sb.niche} · {new Date(sb.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end">
                        <Badge variant={stage.tone}>{stage.label}</Badge>
                        <Badge variant="outline">scenes: {sb.scene_image_urls?.length ?? 0}</Badge>
                        <Badge variant="outline">vo: {Array.isArray(sb.vo_audio_url) ? sb.vo_audio_url.length : 0}</Badge>
                        {sb.quality_score != null && <Badge variant="outline">QA {sb.quality_score}</Badge>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {sb.mp4_url ? (
                      <video src={sb.mp4_url} controls className="w-full max-h-[640px] bg-black rounded" />
                    ) : (
                      <div className="grid grid-cols-5 gap-2">
                        {(sb.scene_image_urls || []).slice(0, 5).map((url, i) => (
                          <div key={i} className="aspect-[9/16] bg-muted rounded overflow-hidden relative">
                            {url ? <img src={url} alt={`beat ${i}`} className="w-full h-full object-cover" /> : null}
                            <span className="absolute bottom-1 left-1 right-1 text-[10px] text-white bg-black/60 px-1 rounded truncate">{sb.beats?.[i]?.role}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <ol className="text-sm space-y-2">
                      {(sb.beats || []).map((b, i) => (
                        <li key={i} className="border-l-2 border-muted pl-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span className="uppercase font-semibold">{b.role}</span>
                            <span>{b.duration_s}s · {b.camera}</span>
                          </div>
                          <div className="font-medium">“{b.caption}”</div>
                          <div className="text-xs italic text-muted-foreground">VO: {b.vo_line}</div>
                          {Array.isArray(sb.vo_audio_url) && sb.vo_audio_url[i] && (
                            <audio src={sb.vo_audio_url[i]} controls className="w-full h-8 mt-1" />
                          )}
                        </li>
                      ))}
                    </ol>
                    {reasons.length > 0 && (
                      <div className="text-xs text-destructive space-y-0.5">
                        {reasons.map((r) => <div key={r}>• {r}</div>)}
                      </div>
                    )}
                    {(sb.github_run_id || sb.render_error) && (
                      <div className="text-xs space-y-0.5 border-t pt-2">
                        {sb.github_run_id && <div>GitHub run: {sb.github_run_url ? <a href={sb.github_run_url} target="_blank" rel="noreferrer" className="underline">{sb.github_run_id}</a> : sb.github_run_id}</div>}
                        {sb.render_error && <div className="text-destructive break-all">render_error: {sb.render_error}</div>}
                      </div>
                    )}
                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="outline" size="sm" onClick={() => rejectV5(it)} disabled={busy === sb.id}>Reject</Button>
                      {sb.status !== "rejected" && (
                        <Button variant="secondary" size="sm" onClick={() => renderV5One(sb.id)} disabled={busy === sb.id}>
                          {sb.mp4_url ? "Re-render" : "Force render"}
                        </Button>
                      )}
                      <Button size="sm" onClick={() => approveV5(it)} disabled={busy === sb.id || !sb.mp4_url || !it.queue}>
                        {sb.mp4_url ? "Approve" : "Awaiting render"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="v4" className="space-y-6 pt-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={renderAll} disabled={genBusy}>Force render all awaiting_render</Button>
            <Button onClick={generateShowcase} disabled={genBusy}>{genBusy ? "Working…" : "Generate 5 V4 showcase"}</Button>
          </div>

      {loading && <div>Loading…</div>}
      {!loading && items.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No V4 storyboards yet. Click “Generate 5 showcase videos”.</CardContent></Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {items.map((it) => {
          const sb = it.sb;
          const blocked = sb.cv4_reject_reasons?.length > 0;
          const queueStatus = it.queue?.status || "—";
          return (
            <Card key={sb.id} className={blocked ? "border-destructive/40" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{sb.product_slug}</CardTitle>
                    <p className="text-xs text-muted-foreground">{new Date(sb.created_at).toLocaleString()}</p>
                  </div>
                  {(() => {
                    const stage = pipelineStage(sb, queueStatus);
                    return (
                      <div className="flex flex-wrap gap-1 justify-end">
                        <Badge variant={stage.tone}>{stage.label}</Badge>
                        <Badge variant="outline">scenes: {sb.scene_count ?? 0}</Badge>
                        <Badge variant="outline">imgs: {sb.unique_image_count ?? 0}</Badge>
                        {sb.quality_score != null && <Badge variant="outline">QA {Math.round(sb.quality_score)}</Badge>}
                      </div>
                    );
                  })()}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {sb.mp4_url ? (
                  <video src={sb.mp4_url} controls className="w-full max-h-96 bg-black rounded" />
                ) : (
                  <div className="grid grid-cols-5 gap-2">
                    {(sb.scene_assets || []).slice(0, 5).map((a, i) => (
                      <div key={i} className="aspect-[9/16] bg-muted rounded overflow-hidden relative">
                        {a.image_url ? <img src={a.image_url} alt={a.beat} className="w-full h-full object-cover" /> : null}
                        <span className="absolute bottom-1 left-1 right-1 text-[10px] text-white bg-black/60 px-1 rounded truncate">{a.beat}</span>
                      </div>
                    ))}
                  </div>
                )}

                <ol className="text-sm space-y-1">
                  {(sb.beats || []).map((b) => (
                    <li key={b.index} className="flex justify-between gap-2">
                      <span className="text-muted-foreground capitalize w-20 shrink-0">{b.beat}</span>
                      <span className="font-medium flex-1">{b.caption}</span>
                      <span className="text-xs text-muted-foreground">{b.duration_frames}f · {b.motion}</span>
                    </li>
                  ))}
                </ol>

                {(sb.scene_assets || []).length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Source images ({sb.scene_assets.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {sb.scene_assets.map((a, i) => (
                        <a key={i} href={a.image_url} target="_blank" rel="noreferrer" className="relative w-12 h-20 rounded overflow-hidden bg-muted border" title={`${a.beat} · ${a.source}`}>
                          {a.image_url ? <img src={a.image_url} alt={a.beat} className="w-full h-full object-cover" /> : null}
                          <span className={`absolute bottom-0 left-0 right-0 text-[8px] text-white px-0.5 ${a.source === "ai" ? "bg-amber-600/80" : "bg-emerald-700/80"}`}>{a.source}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {blocked && (
                  <div className="text-xs text-destructive space-y-0.5">
                    {sb.cv4_reject_reasons.map((r) => <div key={r}>• {r}</div>)}
                  </div>
                )}

                {(sb.github_run_id || sb.mp4_url || sb.render_error) && (
                  <div className="text-xs space-y-0.5 border-t pt-2">
                    {sb.github_run_id && (
                      <div>GitHub run: {sb.github_run_url ? (
                        <a href={sb.github_run_url} target="_blank" rel="noreferrer" className="underline">{sb.github_run_id}</a>
                      ) : sb.github_run_id}</div>
                    )}
                    {sb.mp4_url && (
                      <div>MP4: <a href={sb.mp4_url} target="_blank" rel="noreferrer" className="underline break-all">{sb.mp4_url}</a></div>
                    )}
                    {sb.render_error && <div className="text-destructive break-all">render_error: {sb.render_error}</div>}
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={() => reject(it)} disabled={busy === sb.id}>Reject</Button>
                  {!blocked && (
                    <Button variant="secondary" size="sm" onClick={() => renderOne(sb.id)} disabled={busy === sb.id}>
                      {sb.mp4_url ? "Re-render" : "Force render this video"}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => approve(it)} disabled={busy === sb.id || blocked || !sb.mp4_url || !it.queue}>
                    {sb.mp4_url ? "Approve & queue" : "Awaiting render"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}