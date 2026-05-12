import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays } from "lucide-react";

type F = { id: string; category: string; week_of_year: number; expected_lift: number; confidence: number; notes: string | null };

export function SeasonalForecastsTab() {
  const [forecasts, setForecasts] = useState<F[]>([]);

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data } = await supabase.from("mi_seasonal_forecasts").select("*")
      .eq("market", "US").order("week_of_year").limit(500);
    setForecasts((data ?? []) as F[]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Seasonal forecasts (US)</CardTitle>
        <CardDescription>Weekly expected lift per category. Auto-generated in Phase 5 from rolling 52-week data.</CardDescription>
      </CardHeader>
      <CardContent>
        {forecasts.length === 0 ?
          <p className="text-sm text-muted-foreground">No forecasts yet. The seasonal forecaster activates once the self-learning loop runs (Phase 5).</p> :
          <div className="space-y-2">
            {forecasts.map(f => (
              <div key={f.id} className="flex items-center justify-between p-3 rounded-md border">
                <div>
                  <div className="font-medium">{f.category}</div>
                  <div className="text-xs text-muted-foreground">Week {f.week_of_year} · confidence {Number(f.confidence).toFixed(2)}</div>
                </div>
                <div className="text-lg font-semibold">{Number(f.expected_lift) >= 0 ? "+" : ""}{Number(f.expected_lift).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        }
      </CardContent>
    </Card>
  );
}