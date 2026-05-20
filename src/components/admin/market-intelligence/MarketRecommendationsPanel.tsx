import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Brain, Crown, Check, X } from "lucide-react";

type Rec = {
  id: string;
  target_type: string;
  target_id: string | null;
  action: string;
  reasoning: string | null;
  confidence: number;
  status: string;
  payload: any;
  created_at: string;
};

type Priority = {
  id: string;
  product_id: string;
  rank: number;
  composite_score: number;
  recommended_channels: string[];
  rationale: string | null;
};

export function MarketRecommendationsPanel() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("market_ai_recommendations" as any)
        .select("*").eq("status", "pending")
        .order("created_at", { ascending: false }).limit(40),
      supabase.from("market_product_priority" as any)
        .select("*").eq("day", today)
        .order("rank", { ascending: true }).limit(15),
    ]);
    setRecs((r as any as Rec[]) ?? []);
    setPriorities((p as any as Priority[]) ?? []);
    const ids = ((p as any as Priority[]) ?? []).map((x) => x.product_id);
    if (ids.length) {
      const { data: prods } = await supabase.from("products").select("id, name").in("id", ids);
      const map: Record<string, string> = {};
      (prods ?? []).forEach((x: any) => { map[x.id] = x.name; });
      setProductNames(map);
    }
  }
  useEffect(() => { void load(); }, []);

  async function call(fn: string) {
    setBusy(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn);
      if (error) throw error;
      toast.success(fn, { description: JSON.stringify(data).slice(0, 160) });
      await load();
    } catch (e: any) { toast.error(fn, { description: e.message }); }
    finally { setBusy(null); }
  }

  async function setStatus(id: string, status: "approved" | "dismissed") {
    await supabase.from("market_ai_recommendations" as any).update({ status }).eq("id", id);
    setRecs((rs) => rs.filter((r) => r.id !== id));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-4 w-4" /> AI Recommendations &amp; Autonomous Priority
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => call("market-priority-sync")}>
            Sync priority
          </Button>
          <Button size="sm" disabled={!!busy} onClick={() => call("market-recommendations-synthesize")}>
            <Brain className="h-3 w-3 mr-1" /> Synthesize
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1">
            <Crown className="h-3 w-3" /> Top priority products today
          </h3>
          {!priorities.length && (
            <p className="text-xs text-muted-foreground">No priorities yet. Run "Sync priority".</p>
          )}
          <div className="space-y-1">
            {priorities.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="font-mono">#{p.rank}</Badge>
                  <span className="truncate font-medium">{productNames[p.product_id] ?? p.product_id.slice(0, 8)}</span>
                  <span className="truncate text-muted-foreground">{p.rationale}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.recommended_channels.map((c) => (
                    <Badge key={c} variant="secondary" className="capitalize">{c}</Badge>
                  ))}
                  <span className="font-mono text-muted-foreground">{p.composite_score.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-2">Pending recommendations</h3>
          {!recs.length && (
            <p className="text-xs text-muted-foreground">All caught up. Run "Synthesize" to generate today's digest.</p>
          )}
          <div className="space-y-2">
            {recs.map((r) => (
              <div key={r.id} className="rounded-md border p-2 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="capitalize">{r.target_type}</Badge>
                    <span className="truncate font-medium">{r.action}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-mono text-muted-foreground">
                      {(r.confidence * 100).toFixed(0)}%
                    </span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setStatus(r.id, "approved")}>
                      <Check className="h-3 w-3 text-emerald-500" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setStatus(r.id, "dismissed")}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                {r.reasoning && (
                  <p className="text-muted-foreground whitespace-pre-wrap">{r.reasoning}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

export default MarketRecommendationsPanel;