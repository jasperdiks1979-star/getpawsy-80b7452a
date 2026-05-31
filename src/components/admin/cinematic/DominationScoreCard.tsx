import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Crown, RotateCw } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  product_slug: string;
  product_name: string | null;
  status: string;
  hook_score: number | null;
  voice_score: number | null;
  commercial_score: number | null;
  ctr_prediction_score: number | null;
  final_creative_score: number | null;
  pinterest_quality_score: number | null;
  hard_reject_reasons: string[] | null;
  emotional_payoff_present: boolean | null;
  regenerate_count: number | null;
  motion_ratio: number | null;
  pinterest_perf_score: number | null;
  selected_voice_id: string | null;
  voice_fit_score: number | null;
  motion_plan_summary: any | null;
  story_arc: any | null;
  hook_winner_reason: string | null;
};

function scoreBadge(v: number | null, floor = 95) {
  if (v == null) return <Badge variant="outline">—</Badge>;
  if (v >= floor) return <Badge>{v}</Badge>;
  if (v >= floor - 10) return <Badge variant="secondary">{v}</Badge>;
  return <Badge variant="destructive">{v}</Badge>;
}

export default function DominationScoreCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, string | null>>({});
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "failing">("failing");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("cinematic_ad_jobs")
      .select("id, product_slug, product_name, status, hook_score, voice_score, commercial_score, ctr_prediction_score, final_creative_score, pinterest_quality_score, hard_reject_reasons, emotional_payoff_present, regenerate_count, motion_ratio, pinterest_perf_score, selected_voice_id, voice_fit_score, motion_plan_summary, story_arc, hook_winner_reason")
      .in("status", ["render_complete", "pinterest_uploaded", "published", "awaiting_approval", "completed"])
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    const f = r.final_creative_score ?? 0;
    return f < 95 || (r.hard_reject_reasons?.length ?? 0) > 0;
  });

  const rescore = async (id: string) => {
    setBusy((p) => ({ ...p, [id]: "rescore" }));
    try {
      await supabase.functions.invoke("cinematic-hook-engine", { body: { job_id: id, force: true } });
      await supabase.functions.invoke("cinematic-voice-engine", { body: { job_id: id, force: true } });
      const { data, error } = await supabase.functions.invoke("cinematic-ad-validate", { body: { job_id: id } });
      if (error) throw error;
      toast.success(`Re-scored • final ${(data as any)?.domination?.final_creative_score ?? "—"}`);
      load();
    } catch (e: any) { toast.error(e?.message ?? "Re-score failed"); }
    finally { setBusy((p) => ({ ...p, [id]: null })); }
  };

  const regenerate = async (id: string) => {
    if (!confirm("Regenerate this ad? This bumps the regenerate_count and dispatches a fresh prepare/render cycle.")) return;
    setBusy((p) => ({ ...p, [id]: "regen" }));
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-regenerate", { body: { job_id: id, reason: "admin manual" } });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).message ?? "regenerate failed");
      toast.success(`Regenerate dispatched (#${(data as any)?.regenerate_count ?? "?"})`);
      load();
    } catch (e: any) { toast.error(e?.message ?? "Regenerate failed"); }
    finally { setBusy((p) => ({ ...p, [id]: null })); }
  };

  const replanCreative = async (id: string) => {
    setBusy((p) => ({ ...p, [id]: "replan" }));
    try {
      await supabase.functions.invoke("cinematic-hook-engine",      { body: { job_id: id, force: true } });
      await supabase.functions.invoke("cinematic-voice-selector",   { body: { job_id: id } });
      await supabase.functions.invoke("cinematic-story-arc",        { body: { job_id: id } });
      await supabase.functions.invoke("cinematic-motion-engine",    { body: { job_id: id } });
      await supabase.functions.invoke("cinematic-pinterest-perf",   { body: { job_id: id } });
      await supabase.functions.invoke("cinematic-ad-validate",      { body: { job_id: id } });
      toast.success("Creative re-planned (no render)");
      load();
    } catch (e: any) { toast.error(e?.message ?? "Re-plan failed"); }
    finally { setBusy((p) => ({ ...p, [id]: null })); }
  };

  const bulkRescore = async () => {
    if (!confirm("Re-score the last 50 completed jobs against the Domination lat? No re-render is triggered.")) return;
    setBulkBusy("rescore_all");
    try {
      const { data, error } = await supabase.functions.invoke("cinematic-ad-rescore-bulk", { body: { limit: 50, with_engines: true } });
      if (error) throw error;
      toast.success(`Re-scored ${(data as any)?.rescored ?? 0} • ${(data as any)?.regen_candidate_count ?? 0} below floor`);
      load();
    } catch (e: any) { toast.error(e?.message ?? "Bulk re-score failed"); }
    finally { setBulkBusy(null); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Crown className="h-4 w-4" /> Creative Domination scores
          <Badge variant={filter === "failing" ? "destructive" : "outline"} className="ml-2">
            {visible.length} {filter === "failing" ? "below floor" : "jobs"}
          </Badge>
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setFilter(filter === "failing" ? "all" : "failing")}>
              {filter === "failing" ? "Show all" : "Show failing"}
            </Button>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={bulkRescore} disabled={bulkBusy !== null}>
              {bulkBusy === "rescore_all" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCw className="h-3 w-3 mr-1" />}
              Re-score last 50
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 mr-2 inline animate-spin" />Loading…</div>
        ) : visible.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4">No jobs in this view.</div>
        ) : (
          <div className="overflow-auto max-h-[480px]">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-2 pr-2">Product</th>
                  <th className="text-center px-1">Final</th>
                  <th className="text-center px-1">Hook</th>
                  <th className="text-center px-1">Voice</th>
                  <th className="text-center px-1">Comm</th>
                  <th className="text-center px-1">CTR</th>
                  <th className="text-center px-1">Pin</th>
                  <th className="text-center px-1">Motion%</th>
                  <th className="text-center px-1">PinPerf</th>
                  <th className="text-center px-1">Plan</th>
                  <th className="text-center px-1">Arc</th>
                  <th className="text-center px-1">Regens</th>
                  <th className="text-left px-1">Voice</th>
                  <th className="text-left px-1">Hard rejects</th>
                  <th className="text-right pl-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-2">
                      <div className="font-medium truncate max-w-[180px]">{r.product_name ?? r.product_slug}</div>
                      <div className="text-[10px] text-muted-foreground">{r.status} • {r.id.slice(0, 8)} {r.regenerate_count ? `• regen #${r.regenerate_count}` : ""}</div>
                    </td>
                    <td className="text-center px-1">{scoreBadge(r.final_creative_score, 95)}</td>
                    <td className="text-center px-1">{scoreBadge(r.hook_score, 90)}</td>
                    <td className="text-center px-1">{scoreBadge(r.voice_score, 90)}</td>
                    <td className="text-center px-1">{scoreBadge(r.commercial_score, 80)}</td>
                    <td className="text-center px-1">{scoreBadge(r.ctr_prediction_score, 90)}</td>
                    <td className="text-center px-1">{scoreBadge(r.pinterest_quality_score, 95)}</td>
                    <td className="text-center px-1">
                      {r.motion_ratio == null
                        ? <Badge variant="outline">—</Badge>
                        : <Badge variant={r.motion_ratio >= 0.7 ? "default" : "secondary"}>{Math.round(r.motion_ratio * 100)}%</Badge>}
                    </td>
                    <td className="text-center px-1">{scoreBadge(r.pinterest_perf_score, 75)}</td>
                    <td className="text-center px-1">
                      {r.motion_plan_summary ? (
                        <span className="text-[10px]" title={JSON.stringify(r.motion_plan_summary)}>
                          {r.motion_plan_summary.camera_styles_count ?? "?"}c /{" "}
                          {r.motion_plan_summary.shot_distances_count ?? "?"}d
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-center px-1">
                      {Array.isArray(r.story_arc) && r.story_arc.length >= 6
                        ? <Badge variant="default">✓</Badge>
                        : <Badge variant="outline">—</Badge>}
                    </td>
                    <td className="text-center px-1">
                      <span className="text-[10px]">{r.regenerate_count ?? 0}/2</span>
                    </td>
                    <td className="px-1">
                      {r.selected_voice_id
                        ? <span className="text-[10px]">{r.selected_voice_id.replace(/_/g," ")} <span className="text-muted-foreground">({r.voice_fit_score ?? "—"})</span></span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-1">
                      {(r.hard_reject_reasons ?? []).length > 0 ? (
                        <span className="text-destructive">{(r.hard_reject_reasons ?? []).join(", ")}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="text-right pl-2 space-x-1">
                      <Button size="sm" variant="outline" disabled={!!busy[r.id]} onClick={() => rescore(r.id)}>
                        {busy[r.id] === "rescore" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Re-score"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={!!busy[r.id]} onClick={() => replanCreative(r.id)}>
                        {busy[r.id] === "replan" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Re-plan"}
                      </Button>
                      <Button size="sm" disabled={!!busy[r.id]} onClick={() => regenerate(r.id)}>
                        {busy[r.id] === "regen" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Regenerate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
