import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrendingUp, Sparkles, Layers } from "lucide-react";

type Cluster = {
  id: string;
  source: string;
  label: string;
  keywords: string[];
  signal_score: number;
  velocity: number;
  sample_size: number;
  status: "emerging" | "rising" | "peaked" | "declining" | "archived";
  last_seen_at: string;
};

const STATUS_COLOR: Record<Cluster["status"], string> = {
  rising: "bg-emerald-500/20 text-emerald-500",
  emerging: "bg-amber-500/20 text-amber-500",
  peaked: "bg-blue-500/20 text-blue-500",
  declining: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export function MarketTrendsPanel() {
  const [rows, setRows] = useState<Cluster[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("market_trend_clusters" as any)
      .select("*")
      .order("signal_score", { ascending: false })
      .limit(40);
    setRows((data as any as Cluster[]) ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function call(fn: string) {
    setBusy(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn);
      if (error) throw error;
      toast.success(fn, { description: JSON.stringify(data).slice(0, 160) });
      await load();
    } catch (e: any) {
      toast.error(fn, { description: e.message });
    } finally { setBusy(null); }
  }

  const bySource = rows.reduce((acc, r) => {
    (acc[r.source] ??= []).push(r);
    return acc;
  }, {} as Record<string, Cluster[]>);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Trend Clusters (Pinterest · TikTok · Google Trends)
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call("market-trends-ingest")}>
            <Layers className="h-3 w-3 mr-1" /> Ingest
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call("market-cluster-trends")}>
            Cluster
          </Button>
          <Button size="sm" disabled={!!busy} onClick={() => call("market-dna-enrich")}>
            <Sparkles className="h-3 w-3 mr-1" /> Seed DNA
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!rows.length && (
          <p className="text-xs text-muted-foreground">
            No clusters yet. Run Ingest → Cluster → Seed DNA to bootstrap.
          </p>
        )}
        {Object.entries(bySource).map(([src, list]) => (
          <section key={src}>
            <h3 className="text-sm font-semibold capitalize mb-2">{src.replace("_", " ")}</h3>
            <div className="space-y-1">
              {list.slice(0, 10).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge className={STATUS_COLOR[c.status]}>{c.status}</Badge>
                    <span className="truncate font-medium">{c.label}</span>
                    <span className="truncate text-muted-foreground">
                      {c.keywords.slice(0, 4).join(" · ")}
                    </span>
                  </div>
                  <div className="shrink-0 font-mono text-muted-foreground flex gap-3">
                    <span>s {c.signal_score.toFixed(1)}</span>
                    <span>v {c.velocity.toFixed(2)}</span>
                    <span>n {c.sample_size}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

export default MarketTrendsPanel;