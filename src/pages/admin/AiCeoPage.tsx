import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Play, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { recordDecision } from "@/lib/governanceLedger";

type Run = {
  id: string;
  started_at: string;
  status: string;
  observe: any;
  predict: any;
  executive_score: any;
};
type Rec = {
  id: string;
  rank: number;
  title: string;
  category: string;
  reason: string;
  expected_revenue_cents: number;
  expected_sales: number;
  confidence: number;
  risk: number;
  roi_score: number;
  status: string;
};

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function AiCeoPage() {
  const [run, setRun] = useState<Run | null>(null);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const { data: latest } = await supabase
      .from("ai_ceo_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRun(latest as any);
    if (latest) {
      const { data: r } = await supabase
        .from("ai_ceo_recommendations")
        .select("*")
        .eq("run_id", (latest as any).id)
        .order("rank");
      setRecs((r as any) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const triggerLoop = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("ai-ceo-loop", { body: { trigger: "manual" } });
      if (error) throw error;
      toast.success("AI CEO loop complete");
      await load();
      // Governance Ledger (Phase 4): every AI CEO recommendation becomes
      // exactly one ledger row, deduped by recommendation id. This is the
      // single bridge between the reasoning system and persisted evidence —
      // no parallel tables, no duplicate logging.
      try {
        const { data: latest } = await supabase
          .from("ai_ceo_runs").select("id").order("started_at", { ascending: false }).limit(1).maybeSingle();
        if (latest) {
          const { data: r } = await supabase
            .from("ai_ceo_recommendations").select("*").eq("run_id", (latest as any).id);
          for (const rec of ((r as any[]) ?? [])) {
            await recordDecision({
              sourceEngine: "ai_ceo",
              decisionType: rec.category ?? "recommendation",
              proposal: { title: rec.title, reason: rec.reason, rank: rec.rank },
              expectedMetric: "revenue_cents",
              expectedValue: rec.expected_revenue_cents ?? 0,
              confidence: rec.confidence ?? null,
              dedupeKey: `ai_ceo:${rec.id}`,
            });
          }
        }
      } catch (e) { console.warn("[governance] AI CEO ledger sync failed", e); }
    } catch (e: any) {
      toast.error(e.message ?? "Loop failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  const score = run?.executive_score ?? {};
  const obs = run?.observe ?? {};
  const pred = run?.predict ?? {};

  return (
    <>
      <Helmet>
        <title>AI CEO — Revenue Autopilot</title>
      </Helmet>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">AI CEO — Revenue Autopilot</h1>
          </div>
          <Button onClick={triggerLoop} disabled={running}>
            <Play className="mr-2 h-4 w-4" />
            {running ? "Running…" : "Run loop"}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">Sales (all)</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{obs.sales?.all ?? 0}</div>
              <div className="text-xs text-muted-foreground">{obs.sales?.remaining_to_100 ?? 100} to 100</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">Revenue (7d)</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{money(obs.revenue?.week_cents ?? 0)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">Checkout CVR</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{((obs.funnel?.checkout_cvr ?? 0) * 100).toFixed(1)}%</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">Health</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{score.overall_business_health ?? 0}/100</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Forecast
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Tomorrow</div><div className="font-semibold">{pred.tomorrow?.sales ?? 0} sales · {money(pred.tomorrow?.revenue_cents ?? 0)}</div></div>
            <div><div className="text-xs text-muted-foreground">7 days</div><div className="font-semibold">{pred.d7?.sales ?? 0} sales · {money(pred.d7?.revenue_cents ?? 0)}</div></div>
            <div><div className="text-xs text-muted-foreground">30 days</div><div className="font-semibold">{pred.d30?.sales ?? 0} sales · {money(pred.d30?.revenue_cents ?? 0)}</div></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" /> Today's Top 10 revenue actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recs.length === 0 && <p className="text-sm text-muted-foreground">No recommendations yet. Run the loop.</p>}
            {recs.map((r) => (
              <div key={r.id} className="border rounded p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge>#{r.rank}</Badge>
                    <span className="font-semibold">{r.title}</span>
                    <Badge variant="outline">{r.category}</Badge>
                  </div>
                  <div className="text-sm font-semibold">{money(r.expected_revenue_cents)}</div>
                </div>
                <p className="text-xs text-muted-foreground">{r.reason}</p>
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>Confidence {Math.round(r.confidence * 100)}%</span>
                  <span>Risk {Math.round(r.risk * 100)}%</span>
                  <span>ROI {r.roi_score.toFixed(1)}</span>
                  <span>Status {r.status}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}