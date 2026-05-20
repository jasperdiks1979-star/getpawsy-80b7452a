import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

type Forecast = {
  entity_type: "product" | "angle";
  entity_key: string;
  horizon_days: number;
  forecast_reward: number;
  forecast_revenue: number;
  trend_slope: number;
  confidence: number;
  rising: boolean;
  sample_size: number;
  computed_at: string;
};

export function GrowthForecastPanel() {
  const [rows, setRows] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [horizon, setHorizon] = useState<7 | 30>(7);

  async function load() {
    const { data } = await supabase
      .from("growth_forecasts" as any)
      .select("*")
      .eq("horizon_days", horizon)
      .order("forecast_reward", { ascending: false })
      .limit(40);
    setRows((data as any as Forecast[]) ?? []);
  }

  useEffect(() => { void load(); }, [horizon]);

  async function recompute() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("growth-forecast-compute");
      if (error) throw error;
      toast.success("Forecast updated", { description: JSON.stringify(data).slice(0, 140) });
      await load();
    } catch (e: any) {
      toast.error("Forecast failed", { description: e.message });
    } finally { setLoading(false); }
  }

  const rising = rows.filter((r) => r.rising);
  const products = rows.filter((r) => r.entity_type === "product").slice(0, 10);
  const angles = rows.filter((r) => r.entity_type === "angle").slice(0, 10);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Predictive Forecast</CardTitle>
        <div className="flex gap-2">
          <div className="flex rounded-md border p-0.5">
            {([7, 30] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`px-2 py-1 text-xs rounded ${horizon === h ? "bg-primary text-primary-foreground" : ""}`}
              >
                {h}d
              </button>
            ))}
          </div>
          <Button size="sm" disabled={loading} onClick={recompute}>Recompute</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" /> Next winners ({horizon}d)
          </h3>
          {rising.length === 0 ? (
            <p className="text-xs text-muted-foreground">No rising entities yet — need ≥2 days of metrics.</p>
          ) : (
            <div className="space-y-1">
              {rising.slice(0, 8).map((r) => (
                <div key={`${r.entity_type}-${r.entity_key}`} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline">{r.entity_type}</Badge>
                    <span className="truncate font-mono">{r.entity_key}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                    <span>R {r.forecast_reward.toFixed(2)}</span>
                    <span>${r.forecast_revenue.toFixed(0)}</span>
                    <span className="text-emerald-500">+{(r.trend_slope * 100).toFixed(1)}/d</span>
                    <span>conf {(r.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold mb-2">Top products</h3>
            <div className="space-y-1 text-xs">
              {products.map((r) => (
                <Row key={r.entity_key} r={r} />
              ))}
              {!products.length && <p className="text-muted-foreground">—</p>}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Top angles</h3>
            <div className="space-y-1 text-xs">
              {angles.map((r) => (
                <Row key={r.entity_key} r={r} />
              ))}
              {!angles.length && <p className="text-muted-foreground">—</p>}
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function Row({ r }: { r: Forecast }) {
  const Icon = r.trend_slope >= 0 ? TrendingUp : TrendingDown;
  const color = r.trend_slope >= 0 ? "text-emerald-500" : "text-destructive";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate font-mono">{r.entity_key}</span>
      <div className="flex items-center gap-2 text-muted-foreground shrink-0">
        <Icon className={`h-3 w-3 ${color}`} />
        <span>R {r.forecast_reward.toFixed(2)}</span>
        <span>${r.forecast_revenue.toFixed(0)}</span>
        <span>{(r.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

export default GrowthForecastPanel;