import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

type DailyRow = {
  day: string;
  status: string;
  rejection_reason: string;
  pin_count: number;
  product_count: number;
};
type ProductRow = {
  day: string;
  product_id: string;
  product_name: string | null;
  product_slug: string | null;
  status: string;
  rejection_reason: string;
  pin_count: number;
};

const DAYS_OPTIONS = [7, 14, 30];

export default function PinQueueBreakdownPage() {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [byProduct, setByProduct] = useState<ProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([
        supabase.rpc("get_pin_queue_daily_breakdown", { _days: days }),
        supabase.rpc("get_pin_queue_daily_by_product", { _days: days, _limit: 500 }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      setDaily((a.data ?? []) as DailyRow[]);
      setByProduct((b.data ?? []) as ProductRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  // Aggregate daily totals by status
  const dailyByStatus = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const r of daily) {
      const row = map.get(r.day) ?? {};
      row[r.status] = (row[r.status] ?? 0) + Number(r.pin_count);
      map.set(r.day, row);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, counts]) => ({ day, ...counts }));
  }, [daily]);

  const rejectionTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of daily) {
      if (r.status !== "rejected") continue;
      map.set(r.rejection_reason, (map.get(r.rejection_reason) ?? 0) + Number(r.pin_count));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50);
  }, [daily]);

  const topRejectedProducts = useMemo(() => {
    const map = new Map<string, { name: string | null; slug: string | null; total: number; reasons: Map<string, number> }>();
    for (const r of byProduct) {
      if (r.status !== "rejected") continue;
      const key = r.product_id;
      const entry = map.get(key) ?? { name: r.product_name, slug: r.product_slug, total: 0, reasons: new Map() };
      entry.total += Number(r.pin_count);
      entry.reasons.set(r.rejection_reason, (entry.reasons.get(r.rejection_reason) ?? 0) + Number(r.pin_count));
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 50)
      .map(([id, v]) => ({
        id,
        name: v.name ?? id,
        slug: v.slug,
        total: v.total,
        topReason: Array.from(v.reasons.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "(none)",
      }));
  }, [byProduct]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    for (const r of daily) s.add(r.status);
    return Array.from(s).sort();
  }, [daily]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Pin Queue Breakdown — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Pin Queue Breakdown</h1>
          <p className="text-muted-foreground">
            Daily queued vs published vs rejected by rejection reason and product.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {DAYS_OPTIONS.map((d) => (
            <Button key={d} variant={d === days ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daily totals by status</CardTitle>
          <CardDescription>Last {days} days</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                {statuses.map((s) => (
                  <TableHead key={s} className="text-right capitalize">
                    {s}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyByStatus.map((row) => (
                <TableRow key={row.day}>
                  <TableCell className="font-mono text-xs">{row.day}</TableCell>
                  {statuses.map((s) => (
                    <TableCell key={s} className="text-right tabular-nums">
                      {(row as any)[s] ?? 0}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!loading && dailyByStatus.length === 0 && (
                <TableRow>
                  <TableCell colSpan={statuses.length + 1} className="text-center text-muted-foreground">
                    No data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rejection reasons</CardTitle>
          <CardDescription>Pins rejected in last {days} days</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Pins</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rejectionTotals.map(([reason, count]) => (
                <TableRow key={reason}>
                  <TableCell className="font-mono text-xs">{reason}</TableCell>
                  <TableCell className="text-right tabular-nums">{count}</TableCell>
                </TableRow>
              ))}
              {!loading && rejectionTotals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No rejections
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top rejected products</CardTitle>
          <CardDescription>Aggregated last {days} days</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Top reason</TableHead>
                <TableHead className="text-right">Rejected pins</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topRejectedProducts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    {p.slug && <div className="text-xs text-muted-foreground font-mono">{p.slug}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.topReason}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                </TableRow>
              ))}
              {!loading && topRejectedProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No rejected pins
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}