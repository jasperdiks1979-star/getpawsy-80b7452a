import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Rocket, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Result = {
  recommendation_id: string;
  product_id: string;
  readiness_score: number;
  pinterest_pin_id?: string | null;
  tiktok_post_id?: string | null;
  pinterest_error?: string | null;
  tiktok_error?: string | null;
};

export function PublishReadinessTab() {
  const [running, setRunning] = useState<"none" | "preview" | "promote">("none");
  const [results, setResults] = useState<Result[]>([]);
  const [evaluated, setEvaluated] = useState(0);
  const [promotedCount, setPromotedCount] = useState(0);
  const [pendingRecs, setPendingRecs] = useState(0);

  useEffect(() => {
    void loadCounts();
  }, []);

  async function loadCounts() {
    const [pending, promoted] = await Promise.all([
      supabase.from("mi_recommendations").select("id", { count: "exact", head: true }).eq("market", "US").eq("status", "new"),
      supabase.from("mi_recommendations").select("id", { count: "exact", head: true }).eq("market", "US").eq("status", "promoted"),
    ]);
    setPendingRecs(pending.count ?? 0);
    setPromotedCount(promoted.count ?? 0);
  }

  async function run(dryRun: boolean) {
    setRunning(dryRun ? "preview" : "promote");
    try {
      const { data, error } = await supabase.functions.invoke("mi-promote-recommendations", {
        body: { dry_run: dryRun, min_readiness: 60, max_promote: 8 },
      });
      if (error) throw error;
      setResults((data?.results ?? []) as Result[]);
      setEvaluated(Number(data?.evaluated ?? 0));
      toast.success(dryRun ? `Preview: ${data?.results?.length ?? 0} ready` : `Promoted ${data?.promoted ?? 0} to draft queues`);
      await loadCounts();
    } catch (e: any) {
      toast.error(`Failed: ${e?.message ?? e}`);
    } finally {
      setRunning("none");
    }
  }

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Cross-channel publish readiness</CardTitle>
            <CardDescription>
              Scores top recommendations on recipe strength, trend momentum, confidence and product completeness.
              Promotes ready candidates to Pinterest &amp; TikTok <strong>draft</strong> queues — never auto-publishes.
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => run(true)} disabled={running !== "none"} className="gap-1">
              {running === "preview" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
              Preview
            </Button>
            <Button size="sm" onClick={() => run(false)} disabled={running !== "none"} className="gap-1">
              {running === "promote" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
              Promote ready
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Pending recommendations" value={pendingRecs} />
            <Stat label="Already promoted" value={promotedCount} />
            <Stat label="Last evaluated" value={evaluated} />
          </div>

          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No results yet. Click <strong>Preview</strong> to score the top recommendations without inserting drafts.
            </p>
          ) : (
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.recommendation_id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                  <div className="min-w-0 flex items-center gap-2">
                    <Badge variant={r.readiness_score >= 80 ? "default" : "secondary"} className="shrink-0">
                      {r.readiness_score}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground truncate">{r.recommendation_id.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <Badge variant={r.pinterest_pin_id ? "default" : r.pinterest_error ? "destructive" : "outline"}>
                      Pinterest {r.pinterest_pin_id ? "✓" : r.pinterest_error ? "✗" : "—"}
                    </Badge>
                    <Badge variant={r.tiktok_post_id ? "default" : r.tiktok_error ? "destructive" : "outline"}>
                      TikTok {r.tiktok_post_id ? "✓" : r.tiktok_error ? "✗" : "—"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription className="text-xs">{label}</CardDescription></CardHeader>
      <CardContent><div className="text-xl font-semibold">{value.toLocaleString()}</div></CardContent>
    </Card>
  );
}