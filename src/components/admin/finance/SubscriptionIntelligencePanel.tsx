import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Repeat, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Sub = {
  id: string; supplier_slug: string; product_name: string; cadence: string;
  amount_minor: number; currency: string; is_active: boolean;
  cycle_detected: string | null; price_trend: string | null;
  forecast_annual_minor: number | null; renewal_risk: string | null;
  duplicate_of: string | null; unused_since: string | null;
  confidence_score: number | null; last_seen_at: string | null;
};

const fmt = (m: number | null, cur = "EUR") =>
  m == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: cur }).format(m / 100);

function riskBadge(r: string | null) {
  if (r === "high") return "destructive" as const;
  if (r === "medium") return "secondary" as const;
  return "outline" as const;
}

export function SubscriptionIntelligencePanel({ entityId: _entityId }: { entityId: string | null }) {
  const [rows, setRows] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("finance_subscriptions")
      .select("id,supplier_slug,product_name,cadence,amount_minor,currency,is_active,cycle_detected,price_trend,forecast_annual_minor,renewal_risk,duplicate_of,unused_since,confidence_score,last_seen_at")
      .order("forecast_annual_minor", { ascending: false, nullsFirst: false })
      .limit(60);
    setRows((data ?? []) as Sub[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("finance-subscription-intel", { body: {} });
    setRunning(false);
    if (error) toast.error(error.message);
    else toast.success(`Updated ${data?.updated ?? 0} subscriptions`);
    await load();
  }, [load]);

  const totalAnnual = rows.filter(r => r.is_active).reduce((s, r) => s + (r.forecast_annual_minor ?? 0), 0);
  const dupes = rows.filter(r => r.duplicate_of).length;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Repeat className="h-4 w-4" /> Subscription Intelligence
          <Badge variant="outline">annual ~ {fmt(totalAnnual)}</Badge>
          {dupes > 0 && <Badge variant="destructive">{dupes} duplicates</Badge>}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={run} disabled={running}>
          <RefreshCw className={`h-3 w-3 mr-1 ${running ? "animate-spin" : ""}`} /> Recompute
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? <div className="text-sm text-muted-foreground">Loading…</div>
         : rows.length === 0 ? <div className="text-sm text-muted-foreground">No subscriptions tracked.</div>
         : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Supplier</th>
                <th className="py-1 pr-3">Product</th>
                <th className="py-1 pr-3">Cycle</th>
                <th className="py-1 pr-3 text-right">Amount</th>
                <th className="py-1 pr-3 text-right">Annual forecast</th>
                <th className="py-1 pr-3">Trend</th>
                <th className="py-1 pr-3">Risk</th>
                <th className="py-1">Status</th>
              </tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="py-1 pr-3">{r.supplier_slug}</td>
                  <td className="py-1 pr-3 font-medium">{r.product_name}</td>
                  <td className="py-1 pr-3">{r.cycle_detected ?? r.cadence}</td>
                  <td className="py-1 pr-3 text-right">{fmt(r.amount_minor, r.currency)}</td>
                  <td className="py-1 pr-3 text-right">{fmt(r.forecast_annual_minor, r.currency)}</td>
                  <td className="py-1 pr-3">{r.price_trend ?? "—"}</td>
                  <td className="py-1 pr-3"><Badge variant={riskBadge(r.renewal_risk)}>{r.renewal_risk ?? "—"}</Badge></td>
                  <td className="py-1">
                    {r.duplicate_of ? <Badge variant="destructive">Duplicate</Badge>
                     : r.unused_since ? <Badge variant="secondary">Unused since {r.unused_since}</Badge>
                     : r.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Cancelled</Badge>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}