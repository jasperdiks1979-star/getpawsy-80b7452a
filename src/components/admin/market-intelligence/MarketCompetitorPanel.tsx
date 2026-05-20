import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Comp = {
  competitor: string;
  product_handle: string;
  title: string;
  price: number | null;
  rating: number | null;
  review_count: number | null;
  captured_at: string;
};

type Gap = {
  id: string;
  gap_type: string;
  target: string;
  competitor: string | null;
  opportunity_score: number;
  evidence: Record<string, unknown>;
};

const gapColor: Record<string, string> = {
  weak_competitor_rating: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  price_advantage: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  catalog_expansion: "bg-purple-500/15 text-purple-700 border-purple-500/30",
};

export function MarketCompetitorPanel() {
  const [comps, setComps] = useState<Comp[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: g }] = await Promise.all([
      supabase.from("market_competitor_insights").select("*").order("captured_at", { ascending: false }).limit(40),
      supabase.from("market_opportunity_gaps").select("*").eq("status", "open").order("opportunity_score", { ascending: false }).limit(30),
    ]);
    setComps((c ?? []) as Comp[]);
    setGaps((g ?? []) as Gap[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function run(fn: string) {
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      const res = data as { ok?: boolean; needs_firecrawl?: boolean; message?: string };
      if (res?.needs_firecrawl) {
        toast.warning("Connect Firecrawl in Connectors to enable competitor scraping.");
      } else if (res?.ok === false) {
        toast.error(res.message ?? "Failed");
      } else {
        toast.success(res?.message ?? `${fn} ran`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const byCompetitor = comps.reduce<Record<string, number>>((acc, c) => {
    acc[c.competitor] = (acc[c.competitor] ?? 0) + 1; return acc;
  }, {});

  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Competitor Intelligence &amp; Opportunity Gaps</h2>
          <p className="text-sm text-muted-foreground">Amazon · Chewy · Petco · PetSmart · Walmart — US pet category. Phase 8b.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => run("market-competitor-scan")} disabled={loading}>Scan competitors</Button>
          <Button size="sm" onClick={() => run("market-gap-detect")} disabled={loading}>Detect gaps</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {["amazon_us", "chewy", "petco", "petsmart", "walmart_pets"].map((k) => (
          <div key={k} className="rounded border bg-card/40 px-3 py-2">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="text-xl font-bold">{byCompetitor[k] ?? 0}</div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Open opportunity gaps ({gaps.length})</h3>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Run "Detect gaps" after scanning competitors.</p>
        ) : (
          <div className="space-y-1">
            {gaps.map((g) => (
              <div key={g.id} className="flex items-start justify-between gap-3 border-b last:border-0 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{g.target}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {g.competitor ?? "—"} · {Object.entries(g.evidence).slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`).join(" · ")}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className={gapColor[g.gap_type] ?? ""} variant="outline">{g.gap_type}</Badge>
                  <span className="font-mono text-sm w-10 text-right">{g.opportunity_score}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Recent competitor rows</h3>
        {comps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No competitor data yet — Firecrawl required.</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-auto">
            {comps.map((c) => (
              <div key={`${c.competitor}-${c.product_handle}`} className="flex items-center justify-between text-xs border-b last:border-0 py-1.5">
                <div className="truncate flex-1 pr-3">{c.title}</div>
                <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px]">{c.competitor}</Badge>
                  {c.price && <span>${c.price}</span>}
                  {c.rating && <span>★{c.rating}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}