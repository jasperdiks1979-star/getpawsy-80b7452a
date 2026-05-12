import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

type KPI = {
  trends: number;
  recipes: number;
  drafts: number;
  recommendations: number;
  opportunities: number;
};

type TrendRow = { term: string; score: number; momentum: number; category: string | null };
type RecipeRow = { id: string; name: string; hook_family: string | null; score: number };
type ForecastRow = { week_of_year: number; expected_lift: number; category: string };
type PerfRow = { recipe_id: string; composite_score: number; avg_ctr: number; computed_at: string };

export function OverviewDashboardTab() {
  const [kpi, setKpi] = useState<KPI>({ trends: 0, recipes: 0, drafts: 0, recommendations: 0, opportunities: 0 });
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [forecasts, setForecasts] = useState<ForecastRow[]>([]);
  const [perf, setPerf] = useState<PerfRow[]>([]);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const [kT, kR, kD, kRec, kOpp, tr, rc, fc, pf] = await Promise.all([
      supabase.from("mi_trends").select("id", { count: "exact", head: true }).eq("market", "US"),
      supabase.from("mi_creative_recipes").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("mi_remix_drafts").select("id", { count: "exact", head: true }),
      supabase.from("mi_recommendations").select("id", { count: "exact", head: true }).eq("market", "US").eq("status", "new"),
      supabase.from("mi_opportunities").select("id", { count: "exact", head: true }).eq("market", "US").eq("status", "open"),
      supabase.from("mi_trends").select("term,score,momentum,category").eq("market", "US").order("momentum", { ascending: false }).limit(10),
      supabase.from("mi_creative_recipes").select("id,name,hook_family,score").eq("active", true).order("score", { ascending: false }).limit(10),
      supabase.from("mi_seasonal_forecasts").select("week_of_year,expected_lift,category").eq("market", "US").order("week_of_year", { ascending: true }).limit(520),
      supabase.from("mi_recipe_performance").select("recipe_id,composite_score,avg_ctr,computed_at").order("computed_at", { ascending: false }).limit(50),
    ]);
    setKpi({
      trends: kT.count ?? 0,
      recipes: kR.count ?? 0,
      drafts: kD.count ?? 0,
      recommendations: kRec.count ?? 0,
      opportunities: kOpp.count ?? 0,
    });
    setTrends((tr.data ?? []) as TrendRow[]);
    setRecipes((rc.data ?? []) as RecipeRow[]);
    setForecasts((fc.data ?? []) as ForecastRow[]);
    setPerf((pf.data ?? []) as PerfRow[]);
  }

  // Aggregate forecast by week (avg lift across categories)
  const weekly = aggregateByWeek(forecasts);

  return (
    <div className="space-y-6 pt-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="US trends" value={kpi.trends} />
        <KpiCard label="Active recipes" value={kpi.recipes} />
        <KpiCard label="Total drafts" value={kpi.drafts} />
        <KpiCard label="New recommendations" value={kpi.recommendations} />
        <KpiCard label="Open opportunities" value={kpi.opportunities} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trend momentum (top 10)</CardTitle>
            <CardDescription>US trends ranked by recent momentum</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trends} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="term" angle={-25} textAnchor="end" interval={0} fontSize={10} height={60} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Bar dataKey="momentum" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seasonal forecast (avg lift / week)</CardTitle>
            <CardDescription>52-week expected category lift, US market</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekly} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Line type="monotone" dataKey="lift" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recipe leaderboard</CardTitle>
          <CardDescription>Top active recipes by composite score</CardDescription>
        </CardHeader>
        <CardContent>
          {recipes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active recipes yet. Run autorun to populate.</p>
          ) : (
            <div className="space-y-2">
              {recipes.map((r, i) => {
                const recent = perf.find((p) => p.recipe_id === r.id);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground w-6">#{i + 1}</span>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.name}</div>
                        {r.hook_family && (
                          <div className="text-xs text-muted-foreground truncate">{r.hook_family}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {recent && (
                        <Badge variant="outline" className="text-xs">
                          CTR {(Number(recent.avg_ctr) * 100).toFixed(2)}%
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        score {Number(r.score).toFixed(2)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function aggregateByWeek(rows: ForecastRow[]): { week: number; lift: number }[] {
  const map = new Map<number, { sum: number; n: number }>();
  for (const r of rows) {
    const m = map.get(r.week_of_year) ?? { sum: 0, n: 0 };
    m.sum += Number(r.expected_lift) || 0;
    m.n += 1;
    map.set(r.week_of_year, m);
  }
  const out: { week: number; lift: number }[] = [];
  for (let w = 1; w <= 52; w++) {
    const m = map.get(w);
    out.push({ week: w, lift: m ? +(m.sum / m.n).toFixed(2) : 0 });
  }
  return out;
}