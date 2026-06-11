import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Row = {
  product_id: string;
  product_slug: string | null;
  product_name: string | null;
  sessions: number;
  pdp_views: number;
  avg_dwell_ms: number;
  avg_scroll_depth: number;
  gallery_interactions: number;
  variant_selections: number;
  atc: number;
  atc_rate: number;
  purchases: number;
  engagement_score: number;
  conversion_score: number;
  product_score: number;
  tier: "winner" | "neutral" | "loser";
};

type Resp = {
  ok: boolean;
  stats?: {
    sessions: number; events: number; products_scored: number; avg_score: number;
    winners: number; neutral: number; losers: number;
  };
  actions?: Record<string, number>;
  products?: Row[];
  message?: string;
};

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function tierBadge(t: Row["tier"]) {
  if (t === "winner") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Winner</Badge>;
  if (t === "loser") return <Badge variant="destructive">Loser</Badge>;
  return <Badge variant="secondary">Neutral</Badge>;
}

export default function PinterestProductConversionPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");

  async function run(apply = false, generate = false) {
    if (apply) setApplying(true); else setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-product-conversion-score", {
        body: { days, apply, generate },
      });
      if (error) throw error;
      setData(data as Resp);
      if (apply) {
        const a = (data as Resp).actions ?? {};
        toast.success(`Applied — boosted ${a.boosted_pins ?? 0}, paused ${a.paused_pins ?? 0}, generated ${a.generated_pins ?? 0}`);
      } else {
        toast.success(`Scored ${((data as Resp).stats?.products_scored) ?? 0} products`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false); setApplying(false);
    }
  }

  useEffect(() => { run(false, false); /* eslint-disable-next-line */ }, []);

  const rows = useMemo(() => {
    const all = data?.products ?? [];
    const q = search.trim().toLowerCase();
    return q
      ? all.filter((r) => (r.product_name ?? "").toLowerCase().includes(q) || (r.product_slug ?? "").toLowerCase().includes(q))
      : all;
  }, [data, search]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pinterest Product Conversion Score</h1>
          <p className="text-sm text-muted-foreground">
            Real human Pinterest traffic → per-product engagement &amp; conversion scoring,
            with automatic distribution rebalancing.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Days</label>
            <Input
              type="number" min={1} max={90} value={days}
              onChange={(e) => setDays(Number(e.target.value) || 30)}
              className="w-24"
            />
          </div>
          <Button variant="outline" onClick={() => run(false, false)} disabled={loading}>
            {loading ? "Scoring…" : "Recompute"}
          </Button>
          <Button onClick={() => run(true, false)} disabled={applying}>
            {applying ? "Applying…" : "Apply distribution"}
          </Button>
          <Button variant="secondary" onClick={() => run(true, true)} disabled={applying}>
            Apply + generate winners
          </Button>
        </div>
      </header>

      {data?.stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            ["Sessions", data.stats.sessions],
            ["Events", data.stats.events],
            ["Products", data.stats.products_scored],
            ["Avg score", data.stats.avg_score],
            ["Winners", data.stats.winners],
            ["Losers", data.stats.losers],
          ].map(([k, v]) => (
            <Card key={k as string}>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{k}</CardTitle></CardHeader>
              <CardContent className="text-xl font-semibold">{v as number}</CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Ranked products</CardTitle>
          <Input
            placeholder="Search…" value={search}
            onChange={(e) => setSearch(e.target.value)} className="w-64"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 px-2">#</th>
                <th className="text-left py-2 px-2">Product</th>
                <th className="text-right py-2 px-2">Score</th>
                <th className="text-right py-2 px-2">Eng</th>
                <th className="text-right py-2 px-2">Conv</th>
                <th className="text-right py-2 px-2">Sessions</th>
                <th className="text-right py-2 px-2">PDP</th>
                <th className="text-right py-2 px-2">Dwell</th>
                <th className="text-right py-2 px-2">Scroll</th>
                <th className="text-right py-2 px-2">Gallery</th>
                <th className="text-right py-2 px-2">Variant</th>
                <th className="text-right py-2 px-2">ATC%</th>
                <th className="text-right py-2 px-2">Buys</th>
                <th className="text-left py-2 px-2">Tier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.product_id} className="border-b hover:bg-muted/30">
                  <td className="py-1.5 px-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 px-2">
                    <div className="font-medium">{r.product_name ?? r.product_slug ?? r.product_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{r.product_slug}</div>
                  </td>
                  <td className="text-right font-semibold">{r.product_score}</td>
                  <td className="text-right">{r.engagement_score}</td>
                  <td className="text-right">{r.conversion_score}</td>
                  <td className="text-right">{r.sessions}</td>
                  <td className="text-right">{r.pdp_views}</td>
                  <td className="text-right">{fmtMs(r.avg_dwell_ms)}</td>
                  <td className="text-right">{r.avg_scroll_depth}%</td>
                  <td className="text-right">{r.gallery_interactions}</td>
                  <td className="text-right">{r.variant_selections}</td>
                  <td className="text-right">{pct(r.atc_rate)}</td>
                  <td className="text-right">{r.purchases}</td>
                  <td className="py-1.5 px-2">{tierBadge(r.tier)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={14} className="text-center py-8 text-muted-foreground">No products scored yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}