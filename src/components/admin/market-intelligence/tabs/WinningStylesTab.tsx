import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Palette } from "lucide-react";

type StyleRow = { key: string; count: number };

function aggregate(rows: Array<Record<string, string | null>>, field: string): StyleRow[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = (r[field] || "").trim().toLowerCase();
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function WinningStylesTab() {
  const [palettes, setPalettes] = useState<StyleRow[]>([]);
  const [pacing, setPacing] = useState<StyleRow[]>([]);
  const [aesthetic, setAesthetic] = useState<StyleRow[]>([]);

  useEffect(() => { void load(); }, []);

  async function load() {
    const [obs, recipes] = await Promise.all([
      supabase.from("mi_competitor_observations").select("aesthetic_category, visual_style").limit(2000),
      supabase.from("mi_creative_recipes").select("palette_category, pacing").limit(2000),
    ]);
    setAesthetic(aggregate((obs.data ?? []) as Array<Record<string, string | null>>, "aesthetic_category"));
    setPalettes(aggregate((recipes.data ?? []) as Array<Record<string, string | null>>, "palette_category"));
    setPacing(aggregate((recipes.data ?? []) as Array<Record<string, string | null>>, "pacing"));
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {[
        { title: "Aesthetic categories", rows: aesthetic },
        { title: "Palette categories", rows: palettes },
        { title: "Video pacing", rows: pacing },
      ].map(g => (
        <Card key={g.title}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4" /> {g.title}</CardTitle>
            <CardDescription>Most-observed in US data.</CardDescription>
          </CardHeader>
          <CardContent>
            {g.rows.length === 0 ? <p className="text-sm text-muted-foreground">No data yet.</p> :
              <div className="space-y-2">
                {g.rows.slice(0, 12).map(r => (
                  <div key={r.key} className="flex justify-between text-sm border rounded-md px-3 py-2">
                    <span className="capitalize">{r.key}</span><span className="font-mono">{r.count}</span>
                  </div>
                ))}
              </div>
            }
          </CardContent>
        </Card>
      ))}
    </div>
  );
}