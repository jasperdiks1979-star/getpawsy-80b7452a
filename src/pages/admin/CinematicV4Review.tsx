import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
};

type QueueRow = {
  id: string;
  storyboard_id: string | null;
  status: string;
  approved_at: string | null;
  engine_version: string | null;
};

export default function CinematicV4Review() {
  const [items, setItems] = useState<Array<{ sb: Storyboard; queue: QueueRow | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);

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

  useEffect(() => { load(); }, []);

  async function approve(item: { sb: Storyboard; queue: QueueRow | null }) {
    if (!item.queue) return toast.error("No queue row to approve");
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
    else { toast.success(`Generated ${data?.count ?? 0} storyboards`); load(); }
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cinematic V4 Review</h1>
          <p className="text-sm text-muted-foreground">5-beat storyboards staged before Pinterest publish. Auto-publish disabled — every video needs manual approval.</p>
        </div>
        <Button onClick={generateShowcase} disabled={genBusy}>{genBusy ? "Generating…" : "Generate 5 showcase videos"}</Button>
      </header>

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
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Badge variant={sb.status === "rejected" ? "destructive" : "secondary"}>sb: {sb.status}</Badge>
                    <Badge variant="outline">queue: {queueStatus}</Badge>
                    <Badge variant="outline">scenes: {sb.scene_count ?? 0}</Badge>
                    <Badge variant="outline">imgs: {sb.unique_image_count ?? 0}</Badge>
                    {sb.quality_score != null && <Badge variant="outline">QA {Math.round(sb.quality_score)}</Badge>}
                  </div>
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

                {blocked && (
                  <div className="text-xs text-destructive space-y-0.5">
                    {sb.cv4_reject_reasons.map((r) => <div key={r}>• {r}</div>)}
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={() => reject(it)} disabled={busy === sb.id}>Reject</Button>
                  <Button size="sm" onClick={() => approve(it)} disabled={busy === sb.id || blocked || !sb.mp4_url || !it.queue}>
                    {sb.mp4_url ? "Approve & queue" : "Awaiting render"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}