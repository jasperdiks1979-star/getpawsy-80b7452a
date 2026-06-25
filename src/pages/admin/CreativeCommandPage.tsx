import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

type Run = {
  id: string;
  mode: string;
  dry_run: boolean;
  status: string;
  generated: number;
  skipped: number;
  blocked_duplicates: number;
  actual_usd: number;
  created_at: string;
};

type Draft = {
  id: string;
  product_title: string | null;
  category_slug: string | null;
  creative_type: string;
  hook: string | null;
  cta: string | null;
  image_url: string | null;
  pdp_url: string | null;
  priority_score: number | null;
  created_at: string;
};

export default function CreativeCommandPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);

  async function refresh() {
    const [{ data: r }, { data: d }, { count }] = await Promise.all([
      supabase.from("creative_generation_runs").select("*").order("created_at", { ascending: false }).limit(15),
      supabase.from("creative_assets").select("id,product_title,category_slug,creative_type,hook,cta,image_url,pdp_url,priority_score,created_at").eq("status", "draft").order("priority_score", { ascending: false }).limit(50),
      supabase.from("creative_assets").select("id", { count: "exact", head: true }).eq("status", "draft"),
    ]);
    setRuns((r as Run[]) ?? []);
    setDrafts((d as Draft[]) ?? []);
    setEligibleCount(count ?? null);
  }

  useEffect(() => { refresh(); }, []);

  async function call(fn: string, body: unknown = {}) {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      toast({ title: fn, description: JSON.stringify(data).slice(0, 240) });
      await refresh();
    } catch (e) {
      toast({ title: `${fn} failed`, description: String(e), variant: "destructive" });
    } finally { setLoading(false); }
  }

  async function approveToQueue(id: string) {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    const { error } = await supabase.from("pinterest_pin_queue").insert({
      title: d.hook,
      description: `${d.hook ?? ""} — ${d.cta ?? ""}`.slice(0, 480),
      pin_image_url: d.image_url,
      destination_url: d.pdp_url,
      board_name: d.category_slug,
      status: "ready",
      meta: { creative_asset_id: d.id, source: "creative_command" },
    } as any);
    if (error) { toast({ title: "Queue insert failed", description: error.message, variant: "destructive" }); return; }
    await supabase.from("creative_assets").update({ status: "queued", routed_to: "pinterest_queue", approved_at: new Date().toISOString() }).eq("id", id);
    toast({ title: "Approved to Pinterest queue" });
    refresh();
  }

  async function reject(id: string) {
    await supabase.from("creative_assets").update({ status: "rejected", rejection_reason: "manual" }).eq("id", id);
    refresh();
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Creative Command Center</h1>
        <p className="text-muted-foreground">Score, generate, approve, and route creatives. Dry-run by default.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle>Drafts pending</CardTitle></CardHeader><CardContent className="text-3xl">{eligibleCount ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Recent runs</CardTitle></CardHeader><CardContent className="text-3xl">{runs.length}</CardContent></Card>
        <Card><CardHeader><CardTitle>Auto-generate</CardTitle></CardHeader><CardContent><Badge variant="secondary">disabled</Badge></CardContent></Card>
        <Card><CardHeader><CardTitle>AI budget cap</CardTitle></CardHeader><CardContent className="text-xl">$15 / run</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button disabled={loading} onClick={() => call("creative-score-engine")}>Refresh scores</Button>
          <Button disabled={loading} onClick={() => call("creative-generation-planner")}>Plan (dry run)</Button>
          <Button disabled={loading} onClick={() => call("creative-generate-batch", { mode: "no_ai", dry_run: true, limit: 20 })} variant="secondary">No-AI dry run</Button>
          <Button disabled={loading} onClick={() => call("creative-generate-batch", { mode: "no_ai", dry_run: false, limit: 20 })}>Generate safe batch (no-AI)</Button>
          <Button disabled={loading} onClick={() => call("creative-performance-snapshot")} variant="outline">Snapshot performance</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {runs.map((r) => (
            <div key={r.id} className="flex justify-between border-b py-1">
              <span>{new Date(r.created_at).toLocaleString()} · {r.mode} {r.dry_run ? "(dry)" : ""}</span>
              <span>{r.status} · gen {r.generated} · skip {r.skipped}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Approval queue ({drafts.length})</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {drafts.map((d) => (
            <div key={d.id} className="border rounded p-3 flex gap-3">
              {d.image_url && <img src={d.image_url} alt="" className="w-20 h-20 object-cover rounded" loading="lazy" />}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{d.product_title}</div>
                <div className="text-xs text-muted-foreground">{d.category_slug} · {d.creative_type} · score {d.priority_score}</div>
                <div className="text-sm mt-1 truncate">{d.hook}</div>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={() => approveToQueue(d.id)}>Approve → Queue</Button>
                  <Button size="sm" variant="ghost" onClick={() => reject(d.id)}>Reject</Button>
                </div>
              </div>
            </div>
          ))}
          {drafts.length === 0 && <div className="text-muted-foreground text-sm">No drafts pending. Run a batch.</div>}
        </CardContent>
      </Card>
    </div>
  );
}