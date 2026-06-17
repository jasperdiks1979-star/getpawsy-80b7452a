import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, TrendingUp, AlertTriangle, Layers, Hash } from "lucide-react";

type Run = {
  id: string;
  ran_at: string;
  total_daily_target: number;
  board_analysis: any[];
  category_gaps: any[];
  hook_fatigue: any[];
  recommendations: any[];
  summary: Record<string, any>;
  trigger: string;
};

export default function PinterestScalingPage() {
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [target, setTarget] = useState(30);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("pinterest_scaling_runs")
      .select("*")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) toast.error(error.message);
    setRun((data as Run) ?? null);
    setLoading(false);
  }

  async function trigger() {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("pinterest-scaling-engine", {
      body: { totalDailyTarget: target, trigger: "manual" },
    });
    setRunning(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Scaling engine ran — ${data?.recommendations ?? 0} recommendations`);
    await load();
  }

  useEffect(() => { load(); }, []);

  const sortedBoards = [...(run?.board_analysis ?? [])].sort(
    (a: any, b: any) => b.daily_quota - a.daily_quota,
  );
  const gaps = (run?.category_gaps ?? []).filter((c: any) => c.status === "undercovered").slice(0, 15);
  const overcovered = (run?.category_gaps ?? []).filter((c: any) => c.status === "overcovered").slice(0, 10);
  const fatigued = (run?.hook_fatigue ?? []).filter((h: any) => h.fatigued);
  const recs = run?.recommendations ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="h-7 w-7" /> Pinterest Scaling Engine v2
          </h1>
          <p className="text-muted-foreground mt-1">
            Auto-scales daily pin quotas per board by 30-day smoothed CTR. Flags undercovered categories and fatigued hooks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={5}
            max={80}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="w-20 h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
          <span className="text-sm text-muted-foreground">pins/day</span>
          <Button onClick={trigger} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Re-run analysis
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading latest run…</div>
      ) : !run ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          No runs yet. Click "Re-run analysis" to start.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard label="Boards" value={run.summary.total_boards} />
            <SummaryCard label="Pins 30d" value={run.summary.total_pins_30d} />
            <SummaryCard label="Impressions 30d" value={run.summary.total_impressions_30d} />
            <SummaryCard label="Clicks 30d" value={run.summary.total_clicks_30d} />
            <SummaryCard
              label="CTR 30d"
              value={
                run.summary.total_impressions_30d
                  ? `${((run.summary.total_clicks_30d / run.summary.total_impressions_30d) * 100).toFixed(2)}%`
                  : "—"
              }
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Last run: {new Date(run.ran_at).toLocaleString()} • Target {run.total_daily_target}/day • Trigger: {run.trigger}
          </div>

          <Tabs defaultValue="recs" className="w-full">
            <TabsList>
              <TabsTrigger value="recs">Recommendations ({recs.length})</TabsTrigger>
              <TabsTrigger value="boards">Board quotas ({sortedBoards.length})</TabsTrigger>
              <TabsTrigger value="cats">Category gaps ({gaps.length})</TabsTrigger>
              <TabsTrigger value="hooks">Hook fatigue ({fatigued.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="recs" className="space-y-2">
              {recs.length === 0 && <EmptyState text="No recommendations — system is well balanced." />}
              {recs.map((r: any, i: number) => (
                <Card key={i}>
                  <CardContent className="py-3 flex items-start gap-3">
                    <AlertTriangle className={`h-5 w-5 mt-0.5 ${r.priority === "high" ? "text-destructive" : "text-amber-500"}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={r.priority === "high" ? "destructive" : "secondary"}>{r.priority}</Badge>
                        <Badge variant="outline">{r.type}</Badge>
                      </div>
                      <div className="text-sm">{r.message}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="boards">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-3">Board</th>
                      <th className="text-right p-3">Quota/day</th>
                      <th className="text-right p-3">Weight</th>
                      <th className="text-right p-3">Smoothed CTR</th>
                      <th className="text-right p-3">Impressions</th>
                      <th className="text-right p-3">Clicks</th>
                      <th className="text-right p-3">Pins 30d</th>
                      <th className="text-left p-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBoards.map((b: any) => (
                      <tr key={b.board_id} className="border-t">
                        <td className="p-3 font-medium">{b.board_name}</td>
                        <td className="p-3 text-right font-mono">{b.daily_quota}</td>
                        <td className="p-3 text-right text-muted-foreground">{(b.weight * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right">{(b.smoothed_ctr * 100).toFixed(2)}%</td>
                        <td className="p-3 text-right">{b.impressions.toLocaleString()}</td>
                        <td className="p-3 text-right">{b.clicks.toLocaleString()}</td>
                        <td className="p-3 text-right">{b.pin_count}</td>
                        <td className="p-3 text-xs text-muted-foreground">{b.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="cats" className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" /> Undercovered categories (need more pins)</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40"><tr>
                      <th className="text-left p-3">Category</th>
                      <th className="text-right p-3">Products</th>
                      <th className="text-right p-3">Pins 30d</th>
                      <th className="text-right p-3">Product share</th>
                      <th className="text-right p-3">Pin share</th>
                      <th className="text-right p-3">Gap</th>
                    </tr></thead>
                    <tbody>
                      {gaps.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No undercovered categories.</td></tr>}
                      {gaps.map((c: any) => (
                        <tr key={c.category} className="border-t">
                          <td className="p-3 font-medium">{c.category}</td>
                          <td className="p-3 text-right">{c.product_count}</td>
                          <td className="p-3 text-right">{c.pin_count_30d}</td>
                          <td className="p-3 text-right">{(c.product_share * 100).toFixed(1)}%</td>
                          <td className="p-3 text-right">{(c.pin_share * 100).toFixed(1)}%</td>
                          <td className="p-3 text-right text-destructive font-mono">+{(c.gap_score * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              {overcovered.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base text-muted-foreground">Overcovered (consider rotating attention)</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40"><tr>
                        <th className="text-left p-3">Category</th>
                        <th className="text-right p-3">Pins 30d</th>
                        <th className="text-right p-3">Pin share</th>
                        <th className="text-right p-3">Product share</th>
                      </tr></thead>
                      <tbody>
                        {overcovered.map((c: any) => (
                          <tr key={c.category} className="border-t">
                            <td className="p-3 font-medium">{c.category}</td>
                            <td className="p-3 text-right">{c.pin_count_30d}</td>
                            <td className="p-3 text-right">{(c.pin_share * 100).toFixed(1)}%</td>
                            <td className="p-3 text-right">{(c.product_share * 100).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="hooks">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Hash className="h-4 w-4" /> Top hooks (last 30d) — retire fatigued (≥15% share)</CardTitle></CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40"><tr>
                      <th className="text-left p-3">Hook</th>
                      <th className="text-right p-3">Uses</th>
                      <th className="text-right p-3">Share</th>
                      <th className="text-left p-3">Status</th>
                    </tr></thead>
                    <tbody>
                      {(run.hook_fatigue ?? []).map((h: any) => (
                        <tr key={h.hook} className="border-t">
                          <td className="p-3 max-w-md truncate">{h.hook}</td>
                          <td className="p-3 text-right">{h.count}</td>
                          <td className="p-3 text-right">{(h.share * 100).toFixed(1)}%</td>
                          <td className="p-3">{h.fatigued ? <Badge variant="destructive">fatigued</Badge> : <Badge variant="outline">ok</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: any }) {
  return (
    <Card><CardContent className="py-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1">{value ?? "—"}</div>
    </CardContent></Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <Card><CardContent className="py-8 text-center text-muted-foreground">{text}</CardContent></Card>;
}