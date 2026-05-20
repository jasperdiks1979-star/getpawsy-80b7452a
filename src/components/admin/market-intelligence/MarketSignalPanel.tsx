import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SourceRow = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
};

type ScoreRow = {
  product_id: string;
  market_score: number;
  priority: string;
  factors: Record<string, unknown>;
};

const priorityColor: Record<string, string> = {
  explosive: "bg-red-500/15 text-red-600 border-red-500/30",
  high: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

export function MarketSignalPanel() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: src }, { data: sc }] = await Promise.all([
      supabase.from("market_signal_sources").select("*").order("name"),
      supabase.from("market_product_scores").select("product_id,market_score,priority,factors")
        .eq("day", today).order("market_score", { ascending: false }).limit(20),
    ]);
    setSources((src ?? []) as SourceRow[]);
    setScores((sc ?? []) as ScoreRow[]);
    const ids = (sc ?? []).map((r) => r.product_id);
    if (ids.length) {
      const { data: prods } = await supabase.from("products_public").select("id,name").in("id", ids);
      const map: Record<string, string> = {};
      for (const p of prods ?? []) map[p.id as string] = (p as { name: string }).name;
      setProductNames(map);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function trigger(fn: string) {
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      toast.success((data as { message?: string })?.message ?? `${fn} ran`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const buckets = scores.reduce<Record<string, number>>((acc, s) => {
    acc[s.priority] = (acc[s.priority] ?? 0) + 1; return acc;
  }, {});

  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Market Signal Engine</h2>
          <p className="text-sm text-muted-foreground">US-market signal collection + composite product scoring (Phase 8a).</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => trigger("market-signal-ingest")} disabled={loading}>Ingest signals</Button>
          <Button size="sm" onClick={() => trigger("market-score-products")} disabled={loading}>Score products</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["explosive", "high", "medium", "low"] as const).map((p) => (
          <div key={p} className={`rounded-lg border p-3 ${priorityColor[p]}`}>
            <div className="text-xs uppercase tracking-wide">{p}</div>
            <div className="text-2xl font-bold">{buckets[p] ?? 0}</div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Sources</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded border bg-card/40 px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.kind}</div>
              </div>
              <div className="text-right">
                <Badge variant={s.last_status === "ok" ? "default" : s.last_status === "error" ? "destructive" : "secondary"}>
                  {s.last_status ?? "idle"}
                </Badge>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : "never"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Top 20 products today</h3>
        {scores.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scores yet. Run "Score products".</p>
        ) : (
          <div className="space-y-1">
            {scores.map((s) => (
              <div key={s.product_id} className="flex items-center justify-between text-sm border-b last:border-0 py-1.5">
                <div className="truncate flex-1 pr-3">{productNames[s.product_id] ?? s.product_id.slice(0, 8)}</div>
                <div className="flex items-center gap-2">
                  <Badge className={priorityColor[s.priority]} variant="outline">{s.priority}</Badge>
                  <span className="font-mono w-10 text-right">{s.market_score}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}