import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Sparkles, Trophy, AlertTriangle, Pause, Rocket, Image as ImageIcon } from "lucide-react";

type Row = {
  product_id: string;
  name: string;
  price: number;
  image: string | null;
  category: string | null;
  revenue_probability: number;
  pinterest_click_probability: number;
  conversion_probability: number;
  impulse_score: number;
  perceived_value_score: number;
  bestseller_score: number;
  first_sale_score: number;
  estimated_profit_per_sale: number;
  competition_level: "low" | "medium" | "high";
  verdict: string;
  signals: Record<string, unknown>;
};

type Payload = {
  ok: boolean;
  run_id?: string;
  scored?: number;
  lists?: {
    first_sales: Row[];
    bestsellers: Row[];
    pinterest_potential: Row[];
    impulse_buy: Row[];
    perceived_value: Row[];
    winners: Row[];
    losers: Row[];
    pause: Row[];
    scale: Row[];
    needs_creative: Row[];
  };
  error?: string;
};

const compColor = (c: string) =>
  c === "low" ? "bg-emerald-500/15 text-emerald-700" : c === "medium" ? "bg-amber-500/15 text-amber-700" : "bg-red-500/15 text-red-700";

function ProductTable({ rows, scoreKey, scoreLabel }: { rows: Row[]; scoreKey: keyof Row; scoreLabel: string }) {
  if (!rows?.length) return <p className="text-sm text-muted-foreground p-4">No products in this list yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted-foreground border-b">
          <tr>
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Product</th>
            <th className="py-2 pr-2">Price</th>
            <th className="py-2 pr-2">{scoreLabel}</th>
            <th className="py-2 pr-2">Rev %</th>
            <th className="py-2 pr-2">Pin CTR %</th>
            <th className="py-2 pr-2">CVR %</th>
            <th className="py-2 pr-2">Profit/sale</th>
            <th className="py-2 pr-2">Competition</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.product_id} className="border-b last:border-0">
              <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2">
                  {r.image ? (
                    <img src={r.image} alt="" loading="lazy" className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center"><ImageIcon className="h-4 w-4 opacity-50" /></div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate max-w-[280px] font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.category || "—"}</div>
                  </div>
                </div>
              </td>
              <td className="py-2 pr-2">${Number(r.price).toFixed(2)}</td>
              <td className="py-2 pr-2 font-semibold">{Math.round(Number(r[scoreKey]))}</td>
              <td className="py-2 pr-2">{Math.round(r.revenue_probability)}</td>
              <td className="py-2 pr-2">{Math.round(r.pinterest_click_probability)}</td>
              <td className="py-2 pr-2">{Math.round(r.conversion_probability)}</td>
              <td className="py-2 pr-2">${Number(r.estimated_profit_per_sale).toFixed(2)}</td>
              <td className="py-2 pr-2"><span className={`px-2 py-0.5 rounded text-xs ${compColor(r.competition_level)}`}>{r.competition_level}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProductWinnerDiscoveryPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Payload | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke<Payload>("discover-product-winners", { body: {} });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || "Discovery failed");
      setData(res);
      toast.success(`Scored ${res.scored} products`);
    } catch (e: unknown) {
      toast.error("Discovery failed", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  const L = data?.lists;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Helmet><title>Product Winner Discovery — Admin</title></Helmet>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-6 w-6" /> Product Winner Discovery</h1>
          <p className="text-sm text-muted-foreground">Catalog-wide revenue scoring. {data?.scored ? `${data.scored} live products scored.` : ""}</p>
        </div>
        <Button onClick={run} disabled={loading}>
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scoring…</> : "Re-run discovery"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Winners</div><div className="text-2xl font-bold flex items-center gap-1"><Trophy className="h-5 w-5 text-amber-500" />{L?.winners.length ?? 0}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Scale</div><div className="text-2xl font-bold flex items-center gap-1"><Rocket className="h-5 w-5 text-emerald-500" />{L?.scale.length ?? 0}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Needs creative</div><div className="text-2xl font-bold flex items-center gap-1"><ImageIcon className="h-5 w-5 text-blue-500" />{L?.needs_creative.length ?? 0}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Pause</div><div className="text-2xl font-bold flex items-center gap-1"><Pause className="h-5 w-5 text-amber-600" />{L?.pause.length ?? 0}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Losers</div><div className="text-2xl font-bold flex items-center gap-1"><AlertTriangle className="h-5 w-5 text-red-500" />{L?.losers.length ?? 0}</div></Card>
      </div>

      <Card className="p-2 md:p-4">
        <Tabs defaultValue="first_sales">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="first_sales">First-Sale Likely</TabsTrigger>
            <TabsTrigger value="bestsellers">Bestseller Potential</TabsTrigger>
            <TabsTrigger value="pinterest">Pinterest Potential</TabsTrigger>
            <TabsTrigger value="impulse">Impulse-Buy</TabsTrigger>
            <TabsTrigger value="value">Perceived Value</TabsTrigger>
            <TabsTrigger value="winners">Winners</TabsTrigger>
            <TabsTrigger value="scale">Scale</TabsTrigger>
            <TabsTrigger value="needs">Needs Creative</TabsTrigger>
            <TabsTrigger value="pause">Pause</TabsTrigger>
            <TabsTrigger value="losers">Losers</TabsTrigger>
          </TabsList>

          <TabsContent value="first_sales"><ProductTable rows={L?.first_sales ?? []} scoreKey="first_sale_score" scoreLabel="First-sale" /></TabsContent>
          <TabsContent value="bestsellers"><ProductTable rows={L?.bestsellers ?? []} scoreKey="bestseller_score" scoreLabel="Bestseller" /></TabsContent>
          <TabsContent value="pinterest"><ProductTable rows={L?.pinterest_potential ?? []} scoreKey="pinterest_click_probability" scoreLabel="Pin CTR" /></TabsContent>
          <TabsContent value="impulse"><ProductTable rows={L?.impulse_buy ?? []} scoreKey="impulse_score" scoreLabel="Impulse" /></TabsContent>
          <TabsContent value="value"><ProductTable rows={L?.perceived_value ?? []} scoreKey="perceived_value_score" scoreLabel="Value" /></TabsContent>
          <TabsContent value="winners"><ProductTable rows={L?.winners ?? []} scoreKey="revenue_probability" scoreLabel="Revenue" /></TabsContent>
          <TabsContent value="scale"><ProductTable rows={L?.scale ?? []} scoreKey="revenue_probability" scoreLabel="Revenue" /></TabsContent>
          <TabsContent value="needs"><ProductTable rows={L?.needs_creative ?? []} scoreKey="revenue_probability" scoreLabel="Revenue" /></TabsContent>
          <TabsContent value="pause"><ProductTable rows={L?.pause ?? []} scoreKey="revenue_probability" scoreLabel="Revenue" /></TabsContent>
          <TabsContent value="losers"><ProductTable rows={L?.losers ?? []} scoreKey="revenue_probability" scoreLabel="Revenue" /></TabsContent>
        </Tabs>
      </Card>

      <p className="text-xs text-muted-foreground">
        Verdict legend — <Badge variant="outline">winner</Badge> high revenue probability, ship pins.{" "}
        <Badge variant="outline">scale</Badge> proven clicks, boost queue.{" "}
        <Badge variant="outline">needs_creative</Badge> good product, weak Pinterest signal.{" "}
        <Badge variant="outline">pause</Badge> impressions without clicks — kill creatives.{" "}
        <Badge variant="outline">loser</Badge> low margin / no image / weak title.
      </p>
    </div>
  );
}