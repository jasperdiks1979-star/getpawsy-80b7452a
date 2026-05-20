import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Compass, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";

type Strat = { dimension: string; key: string; score: number; samples: number };
type Decision = {
  id: string;
  day: string;
  reason: string | null;
  payload: {
    product_name?: string;
    recommended_angle?: string;
    category?: string;
    bucket?: string;
    opportunity_score?: number;
    adjusted_score?: number;
    learning_bias?: number;
    bias_meta?: Record<string, number>;
  } | null;
};

export function GrowthStrategyDashboard() {
  const [loading, setLoading] = useState(true);
  const [strats, setStrats] = useState<Strat[]>([]);
  const [recent, setRecent] = useState<Decision[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [s, d] = await Promise.all([
        supabase
          .from("growth_strategy_scores")
          .select("dimension, key, score, samples")
          .order("score", { ascending: false }),
        supabase
          .from("growth_decisions")
          .select("id, day, reason, payload")
          .eq("decision_type", "daily_pick")
          .eq("day", today)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (s.data) setStrats(s.data as unknown as Strat[]);
      if (d.data) setRecent(d.data as unknown as Decision[]);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading strategy intelligence…
      </Card>
    );
  }

  const angles = strats.filter((s) => s.dimension === "angle" && s.samples >= 2);
  const cats = strats.filter((s) => s.dimension === "category" && s.samples >= 2);
  const winnersA = angles.slice(0, 3);
  const losersA = [...angles].reverse().slice(0, 2);
  const winnersC = cats.slice(0, 3);

  const biased = recent.filter((d) => Math.abs(Number(d.payload?.learning_bias ?? 0)) >= 0.5);

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Compass className="h-5 w-5" /> Strategy intelligence
          </h2>
          <p className="text-sm text-muted-foreground">
            Learned biases applied to today's selection. Angles & categories with proven US Pinterest reward get boosted; underperformers get dampened.
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Sparkles className="h-3 w-3" />
          {strats.length} strategies tracked
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Boost these angles</div>
          {winnersA.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not enough signal yet.</p>
          ) : winnersA.map((s) => (
            <div key={s.key} className="flex justify-between text-sm py-0.5">
              <span className="flex items-center gap-1"><ArrowUpRight className="h-3 w-3 text-emerald-500" />{s.key}</span>
              <Badge variant="outline">{Number(s.score).toFixed(1)} · n={s.samples}</Badge>
            </div>
          ))}
          {losersA.length > 0 && (
            <>
              <div className="h-px bg-border my-2" />
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Dampen</div>
              {losersA.map((s) => (
                <div key={s.key} className="flex justify-between text-sm py-0.5">
                  <span className="flex items-center gap-1"><ArrowDownRight className="h-3 w-3 text-destructive" />{s.key}</span>
                  <Badge variant="outline">{Number(s.score).toFixed(1)} · n={s.samples}</Badge>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="border rounded p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Top categories</div>
          {winnersC.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not enough signal yet.</p>
          ) : winnersC.map((s) => (
            <div key={s.key} className="flex justify-between text-sm py-0.5">
              <span className="truncate">{s.key}</span>
              <Badge variant="outline">{Number(s.score).toFixed(1)} · n={s.samples}</Badge>
            </div>
          ))}
        </div>

        <div className="border rounded p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Bias applied today</div>
          {biased.length === 0 ? (
            <p className="text-sm text-muted-foreground">No learning bias applied yet today.</p>
          ) : biased.slice(0, 5).map((d) => {
            const b = Number(d.payload?.learning_bias ?? 0);
            return (
              <div key={d.id} className="flex justify-between items-center text-sm py-0.5 gap-2">
                <span className="truncate" title={d.payload?.product_name ?? ""}>{d.payload?.product_name ?? "—"}</span>
                <Badge variant={b >= 0 ? "default" : "destructive"}>
                  {b >= 0 ? "+" : ""}{b.toFixed(1)}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>

      {recent.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Today's picks (learning-adjusted)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3">Angle</th>
                  <th className="py-2 pr-3">Bucket</th>
                  <th className="py-2 pr-3">Base</th>
                  <th className="py-2 pr-3">Bias</th>
                  <th className="py-2">Adjusted</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((d) => {
                  const base = Number(d.payload?.opportunity_score ?? 0);
                  const adj = Number(d.payload?.adjusted_score ?? base);
                  const bias = Number(d.payload?.learning_bias ?? 0);
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="py-2 pr-3 truncate max-w-[220px]">{d.payload?.product_name ?? "—"}</td>
                      <td className="py-2 pr-3">{d.payload?.recommended_angle ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={d.payload?.bucket === "safe_winner" ? "default" : "secondary"}>
                          {d.payload?.bucket ?? "—"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{base.toFixed(0)}</td>
                      <td className="py-2 pr-3">
                        <span className={bias > 0 ? "text-emerald-600" : bias < 0 ? "text-destructive" : "text-muted-foreground"}>
                          {bias >= 0 ? "+" : ""}{bias.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-2 font-medium">{adj.toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}