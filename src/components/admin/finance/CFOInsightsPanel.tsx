import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, RefreshCw } from "lucide-react";

type Insights = {
  months: { month: string; revenue: number; expense: number; profit: number }[];
  cash_burn_monthly: number;
  largest_suppliers: { supplier_id: string; name: string; spend_minor: number }[];
  fastest_growing_costs: { name: string; delta_pct: number; last_minor: number }[];
  subscription_risks: { supplier: string; product: string; annualized_minor: number; risk: string; trend: string }[];
  subscriptions_annualized_minor: number;
  missing_evidence_count: number;
  low_confidence_document_count: number;
  vat_risk_document_count: number;
  recommendations: string[];
};

const fmt = (m: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(m / 100);
const fmtEur = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

export function CFOInsightsPanel({ entityId }: { entityId: string | null }) {
  const [d, setD] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("finance-cfo-insights", { body: { entity_id: entityId } });
    setD(data as Insights);
    setLoading(false);
  }, [entityId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" /> CFO Insights <Badge variant="secondary">Estimated</Badge></CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}><RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!d ? <div className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data."}</div> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Cell label="Cash burn / mo" value={fmt(d.cash_burn_monthly)} />
              <Cell label="Subs annualized" value={fmt(d.subscriptions_annualized_minor)} />
              <Cell label="Missing evidence" value={String(d.missing_evidence_count)} />
              <Cell label="Low-confidence docs" value={String(d.low_confidence_document_count)} />
            </div>

            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">Monthly P&L (last 6)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">Month</th><th className="text-right pr-3">Revenue</th><th className="text-right pr-3">Expense</th><th className="text-right">Profit</th></tr></thead>
                  <tbody>
                    {d.months.map(m => (
                      <tr key={m.month} className="border-t">
                        <td className="py-1 pr-3">{m.month}</td>
                        <td className="text-right pr-3">{fmtEur(m.revenue)}</td>
                        <td className="text-right pr-3">{fmtEur(m.expense)}</td>
                        <td className={`text-right ${m.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtEur(m.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Largest suppliers (180d)</div>
                <ul className="text-sm space-y-1">
                  {d.largest_suppliers.map(s => (
                    <li key={s.supplier_id} className="flex justify-between border-b pb-1">
                      <span className="truncate">{s.name}</span><span className="tabular-nums">{fmt(s.spend_minor)}</span>
                    </li>
                  ))}
                  {d.largest_suppliers.length === 0 && <li className="text-muted-foreground">No spend recorded.</li>}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Fastest growing costs</div>
                <ul className="text-sm space-y-1">
                  {d.fastest_growing_costs.map((g, i) => (
                    <li key={i} className="flex justify-between border-b pb-1">
                      <span className="truncate">{g.name}</span>
                      <span><Badge variant="destructive">+{g.delta_pct}%</Badge> <span className="tabular-nums ml-2">{fmt(g.last_minor)}</span></span>
                    </li>
                  ))}
                  {d.fastest_growing_costs.length === 0 && <li className="text-muted-foreground">No significant increases.</li>}
                </ul>
              </div>
            </div>

            {d.subscription_risks.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Subscription risks</div>
                <ul className="text-sm space-y-1">
                  {d.subscription_risks.map((s, i) => (
                    <li key={i} className="flex justify-between border-b pb-1">
                      <span>{s.supplier} — {s.product}</span>
                      <span>
                        <Badge variant={s.risk === "high" ? "destructive" : "secondary"}>{s.risk}</Badge>
                        <span className="tabular-nums ml-2">{fmt(s.annualized_minor || 0)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.recommendations.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">Recommended actions</div>
                <ul className="text-sm list-disc pl-5">
                  {d.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}