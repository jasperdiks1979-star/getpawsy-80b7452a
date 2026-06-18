import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Job = {
  id: string;
  product_slug: string;
  status: string;
  quality_score: number | null;
  rejection_reasons: string[];
  final_mp4_url: string | null;
  created_at: string;
  storyboard: any;
};

export default function CinematicV4Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [slug, setSlug] = useState("");
  const [running, setRunning] = useState(false);

  const load = async () => {
    let q = supabase.from("cinematic_v4_jobs").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setJobs((data ?? []) as Job[]);
  };
  useEffect(() => { load(); }, [filter]);

  const enqueue = async () => {
    if (!slug.trim()) return;
    setRunning(true);
    try {
      await supabase.functions.invoke("cinematic-v4-orchestrator", { body: { product_slug: slug.trim() } });
      setSlug("");
      await load();
    } finally { setRunning(false); }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cinematic V4 Jobs</h1>
        <p className="text-sm text-muted-foreground">Pinterest Revenue Renderer — safe-zone enforced, server-side quality gate.</p>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Enqueue a product slug</label>
          <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="cat-wicked-ball-toy" />
        </div>
        <Button onClick={enqueue} disabled={running || !slug.trim()}>{running ? "Working…" : "Generate"}</Button>
      </div>

      <div className="flex gap-2">
        {["all", "approved", "rendering", "rejected", "failed", "scripting"].map(s => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>{s}</Button>
        ))}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3">Slug</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Score</th>
              <th className="text-left p-3">Reasons</th>
              <th className="text-left p-3">Created</th>
              <th className="text-left p-3">Preview</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.id} className="border-t align-top">
                <td className="p-3 font-mono text-xs">{j.product_slug}</td>
                <td className="p-3">{j.status}</td>
                <td className="p-3 font-bold">{j.quality_score ?? "—"}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {(j.rejection_reasons ?? []).map((r, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive">{r}</span>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td>
                <td className="p-3">{j.final_mp4_url ? <a className="text-primary underline text-xs" target="_blank" rel="noreferrer" href={j.final_mp4_url}>mp4</a> : "—"}</td>
              </tr>
            ))}
            {jobs.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No jobs</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}