import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

type Row = { product_slug: string; sessions_us: number; add_to_cart: number; purchases: number; revenue_cents: number };

export function ProductWinnersTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("us_product_performance_daily_v" as any)
        .select("product_slug, sessions_us, add_to_cart, purchases, revenue_cents")
        .gte("date", since);
      const agg = new Map<string, Row>();
      for (const r of (((data as unknown) as Row[]) ?? [])) {
        const key = r.product_slug || "(unknown)";
        const cur = agg.get(key) ?? { product_slug: key, sessions_us: 0, add_to_cart: 0, purchases: 0, revenue_cents: 0 };
        cur.sessions_us += r.sessions_us; cur.add_to_cart += r.add_to_cart;
        cur.purchases += r.purchases; cur.revenue_cents += r.revenue_cents;
        agg.set(key, cur);
      }
      const sorted = [...agg.values()].sort((a, b) => b.revenue_cents - a.revenue_cents).slice(0, 25);
      setRows(sorted); setLoading(false);
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Product Winners (US, 30d)</CardTitle>
        <CardDescription>Top 25 products by US revenue.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No product performance data yet. Run the rollup from the Channels tab.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">US Sessions</TableHead>
                <TableHead className="text-right">ATC</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.product_slug}>
                  <TableCell className="font-mono text-xs">{r.product_slug}</TableCell>
                  <TableCell className="text-right">{r.sessions_us}</TableCell>
                  <TableCell className="text-right">{r.add_to_cart}</TableCell>
                  <TableCell className="text-right">{r.purchases}</TableCell>
                  <TableCell className="text-right">€{(r.revenue_cents / 100).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}