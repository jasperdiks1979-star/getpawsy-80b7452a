import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, RefreshCw } from "lucide-react";

type MonthRow = { month: string; revenue: number; expense: number };

const fmt = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
const monthKey = (d: string) => d.slice(0, 7);

export function CFODashboardPanel({ entityId }: { entityId: string | null }) {
  const [rev, setRev] = useState<{ created_at: string; total_amount: number | null; status: string }[]>([]);
  const [exp, setExp] = useState<{ paid_at: string | null; amount_minor: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [revAvailable, setRevAvailable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 180 * 86400_000).toISOString();
    const [o, p] = await Promise.all([
      supabase.from("orders").select("created_at,total_amount,status").gte("created_at", since).limit(5000),
      supabase.from("evidence_payments").select("paid_at,amount_minor").gte("paid_at", since).limit(5000),
    ]);
    if (o.error) setRevAvailable(false);
    setRev((o.data ?? []) as any);
    setExp((p.data ?? []) as any);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, entityId]);

  const months: MonthRow[] = useMemo(() => {
    const map = new Map<string, MonthRow>();
    for (const o of rev) {
      if (!o.created_at) continue;
      if (!/paid|complete|success|fulfilled/i.test(o.status || "")) continue;
      const k = monthKey(o.created_at);
      const r = map.get(k) ?? { month: k, revenue: 0, expense: 0 };
      r.revenue += Number(o.total_amount || 0);
      map.set(k, r);
    }
    for (const e of exp) {
      if (!e.paid_at) continue;
      const k = monthKey(e.paid_at);
      const r = map.get(k) ?? { month: k, revenue: 0, expense: 0 };
      r.expense += e.amount_minor / 100;
      map.set(k, r);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  }, [rev, exp]);

  const last = months[months.length - 1];
  const last3 = months.slice(-3);
  const avgBurn = last3.length > 0
    ? last3.reduce((s, m) => s + Math.max(0, m.expense - m.revenue), 0) / last3.length
    : 0;
  const cashOnHand = 0; // Not derivable without bank balance connector
  const runwayMonths = avgBurn > 0 && cashOnHand > 0 ? cashOnHand / avgBurn : null;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><LineChart className="h-4 w-4" /> CFO Dashboard</CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Kpi label="Revenue (last month)" value={last ? fmt(last.revenue) : "—"} badge={revAvailable ? "Verified" : "Missing Evidence"} tone={revAvailable ? "default" : "destructive"} />
          <Kpi label="Expense (last month)" value={last ? fmt(last.expense) : "—"} badge="Verified" tone="default" />
          <Kpi label="Profit (last month)" value={last ? fmt(last.revenue - last.expense) : "—"} badge={revAvailable ? "Verified" : "Estimated"} tone={revAvailable ? "default" : "secondary"} />
          <Kpi label="Avg burn (3m)" value={fmt(avgBurn)} badge="Estimated" tone="secondary" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Month</th>
                <th className="py-1 pr-3 text-right">Revenue</th>
                <th className="py-1 pr-3 text-right">Expense</th>
                <th className="py-1 pr-3 text-right">Profit</th>
                <th className="py-1 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {months.length === 0 ? (
                <tr><td colSpan={5} className="py-2 text-muted-foreground text-sm">No data.</td></tr>
              ) : months.map((m) => {
                const p = m.revenue - m.expense;
                const marg = m.revenue > 0 ? (p / m.revenue) * 100 : null;
                return (
                  <tr key={m.month} className="border-t">
                    <td className="py-1 pr-3">{m.month}</td>
                    <td className="py-1 pr-3 text-right">{fmt(m.revenue)}</td>
                    <td className="py-1 pr-3 text-right">{fmt(m.expense)}</td>
                    <td className={`py-1 pr-3 text-right ${p >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(p)}</td>
                    <td className="py-1 text-right">{marg == null ? "—" : `${marg.toFixed(1)}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Runway: {runwayMonths ? `${runwayMonths.toFixed(1)}m` : "needs cash-on-hand connector"}</Badge>
          <span>Revenue counted from orders with paid/complete/fulfilled status. Expenses from evidence_payments.</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, badge, tone }: { label: string; value: string; badge: string; tone: "default" | "secondary" | "destructive" }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      <Badge variant={tone} className="mt-1 text-[10px]">{badge}</Badge>
    </div>
  );
}