import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

type Row = { hook_type: string; count: number; avg_engagement: number };

export function HookLeaderboardTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("mi_competitor_observations")
      .select("hook_type, est_engagement")
      .not("hook_type", "is", null)
      .limit(2000);
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of data ?? []) {
      const k = (r.hook_type || "").trim().toLowerCase();
      if (!k) continue;
      const e = map.get(k) ?? { sum: 0, count: 0 };
      e.sum += Number(r.est_engagement) || 0;
      e.count += 1;
      map.set(k, e);
    }
    const arr: Row[] = Array.from(map.entries())
      .map(([hook_type, v]) => ({ hook_type, count: v.count, avg_engagement: v.count ? v.sum / v.count : 0 }))
      .sort((a, b) => b.count - a.count);
    setRows(arr);
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4" /> Hook Leaderboard</CardTitle>
        <CardDescription>Aggregated from competitor observations and creative recipes.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> :
          rows.length === 0 ? <p className="text-sm text-muted-foreground">No hook data yet. Log observations in Competitor Intel.</p> :
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.hook_type} className="flex items-center justify-between p-3 rounded-md border">
                <div className="font-medium capitalize">{r.hook_type}</div>
                <div className="text-right text-sm">
                  <div>{r.count} obs.</div>
                  <div className="text-xs text-muted-foreground">avg engagement {r.avg_engagement.toFixed(1)}</div>
                </div>
              </div>
            ))}
          </div>
        }
      </CardContent>
    </Card>
  );
}