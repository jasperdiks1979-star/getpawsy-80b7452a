/**
 * Pinterest Pin Performance dashboard — aggregates impressions, pin clicks,
 * outbound clicks (visits), and saves from pinterest_analytics_daily, joined
 * with pinterest_pin_queue (for product + board context) and pinterest_boards.
 * Read-only. No pin mutations.
 */
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, ExternalLink } from "lucide-react";

type Totals = {
  impressions: number;
  pin_clicks: number;
  outbound_clicks: number;
  saves: number;
  pins: number;
};

type ProductRow = Totals & {
  product_id: string;
  product_name: string;
  product_slug: string;
  ctr: number;
};

type BoardRow = Totals & {
  board_id: string;
  board_name: string;
  ctr: number;
};

type PinRow = Totals & {
  pin_id: string;
  product_name: string;
  product_slug: string;
  board_name: string;
  ctr: number;
};

const RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: 0 },
];

function pct(num: number, denom: number) {
  if (!denom) return 0;
  return (num / denom) * 100;
}

function fmt(n: number) {
  return n.toLocaleString();
}

export default function PinterestPinPerformancePage() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<number>(30);
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [pins, setPins] = useState<PinRow[]>([]);
  const [totals, setTotals] = useState<Totals>({
    impressions: 0,
    pin_clicks: 0,
    outbound_clicks: 0,
    saves: 0,
    pins: 0,
  });

  async function load() {
    setLoading(true);
    try {
      // Date filter
      let analyticsQuery = supabase
        .from("pinterest_analytics_daily")
        .select("pin_id, impressions, pin_clicks, outbound_clicks, saves, day");
      if (days > 0) {
        const from = new Date();
        from.setDate(from.getDate() - days);
        analyticsQuery = analyticsQuery.gte("day", from.toISOString().slice(0, 10));
      }
      const [analyticsRes, queueRes, boardsRes] = await Promise.all([
        analyticsQuery,
        supabase
          .from("pinterest_pin_queue")
          .select("pinterest_pin_id, product_id, product_name, product_slug, board_id, board_name")
          .not("pinterest_pin_id", "is", null),
        supabase.from("pinterest_boards").select("id, name"),
      ]);

      const queueByPin = new Map<string, any>();
      for (const q of queueRes.data || []) {
        if (q.pinterest_pin_id) queueByPin.set(q.pinterest_pin_id, q);
      }
      const boardNameById = new Map<string, string>();
      for (const b of boardsRes.data || []) boardNameById.set(b.id, b.name);

      const perPin = new Map<string, Totals & { product_id?: string; product_name?: string; product_slug?: string; board_id?: string; board_name?: string }>();
      const grand: Totals = { impressions: 0, pin_clicks: 0, outbound_clicks: 0, saves: 0, pins: 0 };

      for (const a of analyticsRes.data || []) {
        const meta = queueByPin.get(a.pin_id);
        const cur = perPin.get(a.pin_id) || {
          impressions: 0,
          pin_clicks: 0,
          outbound_clicks: 0,
          saves: 0,
          pins: 1,
          product_id: meta?.product_id,
          product_name: meta?.product_name,
          product_slug: meta?.product_slug,
          board_id: meta?.board_id,
          board_name: meta?.board_name || (meta?.board_id ? boardNameById.get(meta.board_id) : undefined),
        };
        cur.impressions += a.impressions || 0;
        cur.pin_clicks += a.pin_clicks || 0;
        cur.outbound_clicks += a.outbound_clicks || 0;
        cur.saves += a.saves || 0;
        perPin.set(a.pin_id, cur);

        grand.impressions += a.impressions || 0;
        grand.pin_clicks += a.pin_clicks || 0;
        grand.outbound_clicks += a.outbound_clicks || 0;
        grand.saves += a.saves || 0;
      }
      grand.pins = perPin.size;

      // Aggregate per product
      const byProd = new Map<string, ProductRow>();
      const byBoard = new Map<string, BoardRow>();
      const pinRows: PinRow[] = [];

      for (const [pin_id, v] of perPin.entries()) {
        pinRows.push({
          pin_id,
          product_name: v.product_name || "(unknown)",
          product_slug: v.product_slug || "",
          board_name: v.board_name || "(unknown)",
          impressions: v.impressions,
          pin_clicks: v.pin_clicks,
          outbound_clicks: v.outbound_clicks,
          saves: v.saves,
          pins: 1,
          ctr: pct(v.outbound_clicks, v.impressions),
        });

        const pKey = v.product_id || v.product_slug || "unknown";
        const p = byProd.get(pKey) || {
          product_id: v.product_id || "",
          product_name: v.product_name || "(unknown)",
          product_slug: v.product_slug || "",
          impressions: 0, pin_clicks: 0, outbound_clicks: 0, saves: 0, pins: 0, ctr: 0,
        };
        p.impressions += v.impressions;
        p.pin_clicks += v.pin_clicks;
        p.outbound_clicks += v.outbound_clicks;
        p.saves += v.saves;
        p.pins += 1;
        byProd.set(pKey, p);

        const bKey = v.board_id || v.board_name || "unknown";
        const b = byBoard.get(bKey) || {
          board_id: v.board_id || "",
          board_name: v.board_name || "(unknown)",
          impressions: 0, pin_clicks: 0, outbound_clicks: 0, saves: 0, pins: 0, ctr: 0,
        };
        b.impressions += v.impressions;
        b.pin_clicks += v.pin_clicks;
        b.outbound_clicks += v.outbound_clicks;
        b.saves += v.saves;
        b.pins += 1;
        byBoard.set(bKey, b);
      }

      for (const p of byProd.values()) p.ctr = pct(p.outbound_clicks, p.impressions);
      for (const b of byBoard.values()) b.ctr = pct(b.outbound_clicks, b.impressions);

      setProducts([...byProd.values()].sort((a, b) => b.impressions - a.impressions));
      setBoards([...byBoard.values()].sort((a, b) => b.impressions - a.impressions));
      setPins(pinRows.sort((a, b) => b.impressions - a.impressions));
      setTotals(grand);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const filteredProducts = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products;
    return products.filter((r) => r.product_name.toLowerCase().includes(t) || r.product_slug.toLowerCase().includes(t));
  }, [products, q]);

  const filteredBoards = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return boards;
    return boards.filter((r) => r.board_name.toLowerCase().includes(t));
  }, [boards, q]);

  const filteredPins = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return pins.slice(0, 500);
    return pins.filter((r) =>
      r.product_name.toLowerCase().includes(t) ||
      r.board_name.toLowerCase().includes(t) ||
      r.pin_id.includes(t)
    ).slice(0, 500);
  }, [pins, q]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Pinterest Pin Performance — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pinterest Pin Performance</h1>
          <p className="text-muted-foreground">Impressions, clicks, outbound visits and saves per product and per board.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.days} value={String(r.days)}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Impressions" value={fmt(totals.impressions)} />
        <KPI label="Pin clicks" value={fmt(totals.pin_clicks)} />
        <KPI label="Outbound visits" value={fmt(totals.outbound_clicks)} />
        <KPI label="Saves" value={fmt(totals.saves)} />
        <KPI label="Pins with data" value={fmt(totals.pins)} sub={`CTR ${pct(totals.outbound_clicks, totals.impressions).toFixed(2)}%`} />
      </div>

      <Input
        placeholder="Search products, boards, pin IDs…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">By product ({filteredProducts.length})</TabsTrigger>
          <TabsTrigger value="boards">By board ({filteredBoards.length})</TabsTrigger>
          <TabsTrigger value="pins">By pin ({filteredPins.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <Card>
            <CardHeader><CardTitle>Per product</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {totals.pins === 0 ? (
                <EmptyState />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Pins</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Pin clicks</TableHead>
                      <TableHead className="text-right">Outbound visits</TableHead>
                      <TableHead className="text-right">Saves</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((r) => (
                      <TableRow key={r.product_id || r.product_slug}>
                        <TableCell className="max-w-[320px] truncate">{r.product_name}</TableCell>
                        <TableCell className="text-right">{fmt(r.pins)}</TableCell>
                        <TableCell className="text-right">{fmt(r.impressions)}</TableCell>
                        <TableCell className="text-right">{fmt(r.pin_clicks)}</TableCell>
                        <TableCell className="text-right">{fmt(r.outbound_clicks)}</TableCell>
                        <TableCell className="text-right">{fmt(r.saves)}</TableCell>
                        <TableCell className="text-right">{r.ctr.toFixed(2)}%</TableCell>
                        <TableCell>
                          {r.product_slug && (
                            <a
                              href={`/products/${r.product_slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center text-primary hover:underline"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="boards">
          <Card>
            <CardHeader><CardTitle>Per board</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {totals.pins === 0 ? (
                <EmptyState />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Board</TableHead>
                      <TableHead className="text-right">Pins</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Pin clicks</TableHead>
                      <TableHead className="text-right">Outbound visits</TableHead>
                      <TableHead className="text-right">Saves</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBoards.map((r) => (
                      <TableRow key={r.board_id || r.board_name}>
                        <TableCell>{r.board_name}</TableCell>
                        <TableCell className="text-right">{fmt(r.pins)}</TableCell>
                        <TableCell className="text-right">{fmt(r.impressions)}</TableCell>
                        <TableCell className="text-right">{fmt(r.pin_clicks)}</TableCell>
                        <TableCell className="text-right">{fmt(r.outbound_clicks)}</TableCell>
                        <TableCell className="text-right">{fmt(r.saves)}</TableCell>
                        <TableCell className="text-right">{r.ctr.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pins">
          <Card>
            <CardHeader><CardTitle>Per pin (top 500)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {totals.pins === 0 ? (
                <EmptyState />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pin</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Board</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Pin clicks</TableHead>
                      <TableHead className="text-right">Outbound</TableHead>
                      <TableHead className="text-right">Saves</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPins.map((r) => (
                      <TableRow key={r.pin_id}>
                        <TableCell>
                          <a
                            href={`https://pinterest.com/pin/${r.pin_id}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline font-mono text-xs"
                          >
                            {r.pin_id}
                          </a>
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate">{r.product_name}</TableCell>
                        <TableCell>{r.board_name}</TableCell>
                        <TableCell className="text-right">{fmt(r.impressions)}</TableCell>
                        <TableCell className="text-right">{fmt(r.pin_clicks)}</TableCell>
                        <TableCell className="text-right">{fmt(r.outbound_clicks)}</TableCell>
                        <TableCell className="text-right">{fmt(r.saves)}</TableCell>
                        <TableCell className="text-right">{r.ctr.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground py-8 text-center">
      No Pinterest analytics data yet for this range. The dashboard populates as <code>pinterest_analytics_daily</code> is synced.
    </div>
  );
}