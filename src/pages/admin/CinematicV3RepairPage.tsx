import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Wrench, RefreshCw } from "lucide-react";

type Row = {
  job_id: string;
  product_slug: string | null;
  approved_at: string | null;
  final_mp4_url: string | null;
  attached: boolean;
  queued: boolean;
  queue_status: string | null;
};

type RunResult = {
  ok: boolean;
  processed: number;
  attached: number;
  queued: number;
  failed: number;
  results: Array<{ job_id: string; attached: boolean; queued: boolean; error?: string; skipped?: string }>;
};

export default function CinematicV3RepairPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<RunResult | null>(null);

  async function load() {
    setLoading(true);
    const { data: jobs, error } = await supabase
      .from("cinematic_v3_jobs")
      .select("id, product_id, product_slug, approved_at, final_mp4_url, pinterest_queue_id")
      .eq("status", "approved")
      .order("approved_at", { ascending: false });
    if (error) toast.error(error.message);
    const jobList = (jobs as any[]) ?? [];

    // Lookup attachments + queue rows in parallel.
    const jobIds = jobList.map((j) => j.id);
    const checksums = jobIds.map((id) => `cinematic_v3:${id}`);
    const [{ data: media }, { data: queue }] = await Promise.all([
      supabase.from("product_media").select("checksum, product_id").in("checksum", checksums),
      supabase.from("pinterest_video_queue").select("variation_hash, status").in("variation_hash", jobIds),
    ]);
    const attachedSet = new Set((media ?? []).map((m: any) => m.checksum));
    const queueMap = new Map((queue ?? []).map((q: any) => [q.variation_hash, q.status]));

    setRows(
      jobList.map((j) => ({
        job_id: j.id,
        product_slug: j.product_slug,
        approved_at: j.approved_at,
        final_mp4_url: j.final_mp4_url,
        attached: attachedSet.has(`cinematic_v3:${j.id}`),
        queued: queueMap.has(j.id),
        queue_status: queueMap.get(j.id) ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function repairAll() {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("cinematic-v3-post-approval", {
      body: { backfill: true },
    });
    if (error) toast.error(error.message);
    else {
      const r = data as RunResult;
      setLast(r);
      toast.success(`Repair done — ${r.attached} attached, ${r.queued} queued, ${r.failed} failed`);
    }
    await load();
    setRunning(false);
  }

  async function repairOne(jobId: string) {
    const { data, error } = await supabase.functions.invoke("cinematic-v3-post-approval", {
      body: { job_id: jobId },
    });
    if (error) toast.error(error.message);
    else toast.success(`Repaired ${jobId.slice(0, 8)}`);
    await load();
  }

  const missing = rows.filter((r) => !r.attached || !r.queued).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cinematic V3 Repair</h1>
          <p className="text-sm text-muted-foreground">
            Re-runs the post-approval handoff: attaches missing videos to PDPs and enqueues missing Pinterest video pins. Idempotent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={repairAll} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wrench className="h-4 w-4 mr-1" />}
            Repair all
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Approved</div><div className="text-2xl font-semibold">{rows.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Attached to PDP</div><div className="text-2xl font-semibold">{rows.filter((r) => r.attached).length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Queued for Pinterest</div><div className="text-2xl font-semibold">{rows.filter((r) => r.queued).length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Needs repair</div><div className="text-2xl font-semibold">{missing}</div></Card>
      </div>

      {last && (
        <Card className="p-4">
          <div className="text-sm font-semibold mb-2">Last run</div>
          <div className="text-sm text-muted-foreground">
            Processed <b>{last.processed}</b> · Attached <b>{last.attached}</b> · Queued <b>{last.queued}</b> · Failed <b>{last.failed}</b>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">Approved jobs ({rows.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left">
              <tr>
                <th className="py-1 pr-3">Product</th>
                <th>Approved</th>
                <th>PDP</th>
                <th>Pinterest</th>
                <th>Preview</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.job_id} className="border-t border-border/40">
                  <td className="py-1 pr-3 font-mono text-xs">{r.product_slug}</td>
                  <td className="text-xs text-muted-foreground whitespace-nowrap">{r.approved_at ? new Date(r.approved_at).toLocaleString() : "—"}</td>
                  <td>{r.attached ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">attached</Badge> : <Badge variant="destructive">missing</Badge>}</td>
                  <td>{r.queued ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">{r.queue_status}</Badge> : <Badge variant="destructive">missing</Badge>}</td>
                  <td>{r.final_mp4_url ? <a href={r.final_mp4_url} target="_blank" rel="noreferrer" className="text-xs underline">mp4</a> : "—"}</td>
                  <td className="text-right">
                    <Button variant="outline" size="sm" onClick={() => repairOne(r.job_id)} disabled={running}>Repair</Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="text-sm text-muted-foreground py-4">No approved jobs.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}