import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type RecipePerf = {
  id: string;
  recipe_id: string;
  drafts_count: number;
  pins_count: number;
  videos_count: number;
  total_impressions: number;
  total_engagements: number;
  total_clicks: number;
  avg_ctr: number;
  avg_engagement_rate: number;
  composite_score: number;
  computed_at: string;
  recipe?: { name: string; hook_family: string | null; score: number; active: boolean } | null;
};

export function FeedbackLoopTab() {
  const [rows, setRows] = useState<RecipePerf[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("mi_recipe_performance")
        .select("*, recipe:mi_creative_recipes(name, hook_family, score, active)")
        .order("computed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setRows((data ?? []) as any);
    } catch (e: any) {
      toast.error(`Load failed: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  async function runFeedback() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("mi-feedback-loop", { body: {} });
      if (error) throw error;
      toast.success(`Scored ${data?.drafts_scored ?? 0} drafts · ${data?.recipes_updated ?? 0} recipes`);
      await load();
    } catch (e: any) {
      toast.error(`Feedback loop failed: ${e?.message ?? e}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Recipe Feedback Loop</CardTitle>
          <CardDescription>
            Pulls Pinterest pin & TikTok video metrics for published drafts and re-scores recipes.
            Recipe score = 70% baseline · 30% real-world performance.
          </CardDescription>
        </div>
        <Button size="sm" onClick={runFeedback} disabled={running} className="gap-1">
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {running ? "Running…" : "Run feedback loop"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No performance records yet. Publish a remix draft (set published_pin_id or published_video_id), then run the feedback loop.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.recipe?.name ?? r.recipe_id.slice(0, 8)}</span>
                    {r.recipe?.hook_family && <Badge variant="outline">{r.recipe.hook_family}</Badge>}
                    {r.recipe?.active === false && <Badge variant="destructive">inactive</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.drafts_count} drafts · {r.pins_count} pins · {r.videos_count} videos ·{" "}
                    {r.total_impressions.toLocaleString()} impr · {r.total_engagements.toLocaleString()} eng ·{" "}
                    {r.total_clicks.toLocaleString()} clicks
                  </div>
                  <div className="text-xs text-muted-foreground">
                    CTR {(r.avg_ctr * 100).toFixed(2)}% · ER {(r.avg_engagement_rate * 100).toFixed(2)}% ·{" "}
                    {new Date(r.computed_at).toLocaleString()}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-semibold tabular-nums">{r.composite_score.toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">composite</div>
                  {r.recipe && (
                    <div className="text-xs text-muted-foreground mt-1">
                      recipe → {Number(r.recipe.score).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}