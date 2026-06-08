/**
 * Pinterest Redirect Map (admin) — review every slug_history + product_aliases
 * mapping, see the exact live Pinterest URLs each one rescues, the live
 * resolver target, and timestamps. Read-only. No pin mutations.
 */
import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw } from "lucide-react";

type Mapping = {
  source: "slug_history" | "alias";
  id: string;
  old_slug: string;
  current_slug: string | null;
  product_id: string | null;
  product_name: string | null;
  product_active: boolean;
  product_in_stock: boolean;
  reason: string | null;
  kind: string | null;
  created_at: string;
  pin_count: number;
  sample_pin_urls: string[];
};

const HOST = "https://getpawsy.pet";

export default function PinterestRedirectMapPage() {
  const [rows, setRows] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "slug_history" | "alias">("all");

  async function load() {
    setLoading(true);
    const [history, aliases, pins] = await Promise.all([
      supabase
        .from("product_slug_history")
        .select("id, old_slug, current_slug, product_id, reason, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("product_aliases")
        .select("id, alias, product_id, kind, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("pinterest_pin_queue")
        .select("destination_link")
        .eq("status", "posted")
        .not("destination_link", "is", null),
    ]);

    const slugToPins = new Map<string, string[]>();
    for (const r of pins.data || []) {
      const link = String((r as any).destination_link || "");
      const m = link.match(/\/products\/([^/?#]+)/i);
      if (!m) continue;
      const slug = m[1].toLowerCase();
      const list = slugToPins.get(slug) || [];
      if (list.length < 5) list.push(link);
      slugToPins.set(slug, list);
    }
    const pinCount = new Map<string, number>();
    for (const [k, v] of slugToPins.entries()) pinCount.set(k, v.length === 5 ? Math.max(5, slugToPins.get(k)!.length) : v.length);
    // recompute true counts
    const fullCount = new Map<string, number>();
    for (const r of pins.data || []) {
      const link = String((r as any).destination_link || "");
      const m = link.match(/\/products\/([^/?#]+)/i);
      if (!m) continue;
      const slug = m[1].toLowerCase();
      fullCount.set(slug, (fullCount.get(slug) || 0) + 1);
    }

    const productIds = new Set<string>();
    (history.data || []).forEach((h: any) => h.product_id && productIds.add(h.product_id));
    (aliases.data || []).forEach((a: any) => a.product_id && productIds.add(a.product_id));

    const productsById = new Map<string, { name: string; slug: string; is_active: boolean; stock: number }>();
    if (productIds.size > 0) {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, slug, is_active, stock")
        .in("id", Array.from(productIds));
      for (const p of prods || []) productsById.set((p as any).id, p as any);
    }

    const fromHistory: Mapping[] = (history.data || []).map((h: any) => {
      const p = h.product_id ? productsById.get(h.product_id) : undefined;
      return {
        source: "slug_history",
        id: h.id,
        old_slug: h.old_slug,
        current_slug: h.current_slug,
        product_id: h.product_id,
        product_name: p?.name ?? null,
        product_active: !!p?.is_active,
        product_in_stock: (p?.stock ?? 0) > 0,
        reason: h.reason ?? null,
        kind: null,
        created_at: h.created_at,
        pin_count: fullCount.get(h.old_slug.toLowerCase()) || 0,
        sample_pin_urls: slugToPins.get(h.old_slug.toLowerCase()) || [],
      };
    });

    const fromAlias: Mapping[] = (aliases.data || []).map((a: any) => {
      const p = a.product_id ? productsById.get(a.product_id) : undefined;
      return {
        source: "alias",
        id: a.id,
        old_slug: a.alias,
        current_slug: p?.slug ?? null,
        product_id: a.product_id,
        product_name: p?.name ?? null,
        product_active: !!p?.is_active,
        product_in_stock: (p?.stock ?? 0) > 0,
        reason: null,
        kind: a.kind ?? null,
        created_at: a.created_at,
        pin_count: fullCount.get(String(a.alias).toLowerCase()) || 0,
        sample_pin_urls: slugToPins.get(String(a.alias).toLowerCase()) || [],
      };
    });

    setRows([...fromHistory, ...fromAlias].sort((a, b) => b.pin_count - a.pin_count));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== "all" && r.source !== tab) return false;
      if (!needle) return true;
      return (
        r.old_slug.toLowerCase().includes(needle) ||
        (r.current_slug || "").toLowerCase().includes(needle) ||
        (r.product_name || "").toLowerCase().includes(needle) ||
        (r.reason || "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, tab]);

  const kpi = useMemo(() => {
    const total = rows.length;
    const live = rows.filter((r) => r.product_active && r.product_in_stock && !!r.current_slug).length;
    const broken = rows.filter((r) => !r.product_active || !r.product_in_stock || !r.current_slug).length;
    const pinsCovered = rows.reduce((s, r) => s + r.pin_count, 0);
    return { total, live, broken, pinsCovered };
  }, [rows]);

  function StatusBadge({ r }: { r: Mapping }) {
    if (!r.current_slug) return <Badge variant="destructive">no target</Badge>;
    if (!r.product_active) return <Badge variant="destructive">inactive</Badge>;
    if (!r.product_in_stock) return <Badge variant="secondary">out of stock</Badge>;
    return <Badge>live</Badge>;
  }

  return (
    <div className="p-6 space-y-6">
      <Helmet>
        <title>Pinterest Redirect Map · Admin · GetPawsy</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pinterest Redirect Map</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every slug-history and alias mapping, the exact posted Pinterest URLs it rescues, and the live destination.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Mappings" value={kpi.total} />
        <Kpi label="Live targets" value={kpi.live} />
        <Kpi label="Broken targets" value={kpi.broken} tone="warn" />
        <Kpi label="Posted pins covered" value={kpi.pinsCovered} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Mappings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="all">All ({rows.length})</TabsTrigger>
                <TabsTrigger value="slug_history">
                  Slug history ({rows.filter((r) => r.source === "slug_history").length})
                </TabsTrigger>
                <TabsTrigger value="alias">
                  Aliases ({rows.filter((r) => r.source === "alias").length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="all" />
              <TabsContent value="slug_history" />
              <TabsContent value="alias" />
            </Tabs>
            <Input
              placeholder="Filter by slug, product name, or reason…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="md:max-w-md"
            />
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%]">Old slug</TableHead>
                  <TableHead className="w-[28%]">→ Target product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Pins</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Reason / kind</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Test</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      No mappings match.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  filtered.map((r) => (
                    <TableRow key={`${r.source}:${r.id}`}>
                      <TableCell className="font-mono text-xs break-all">
                        <a
                          href={`${HOST}/products/${r.old_slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline inline-flex items-center gap-1"
                        >
                          {r.old_slug}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                        {r.sample_pin_urls.length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[11px] text-muted-foreground">
                              {r.pin_count} pin URL{r.pin_count === 1 ? "" : "s"}
                            </summary>
                            <ul className="mt-1 space-y-0.5">
                              {r.sample_pin_urls.map((u, i) => (
                                <li key={i} className="text-[11px]">
                                  <a href={u} target="_blank" rel="noreferrer" className="hover:underline break-all">
                                    {u.replace(HOST, "")}
                                  </a>
                                </li>
                              ))}
                              {r.pin_count > r.sample_pin_urls.length && (
                                <li className="text-[11px] text-muted-foreground">
                                  + {r.pin_count - r.sample_pin_urls.length} more
                                </li>
                              )}
                            </ul>
                          </details>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.current_slug ? (
                          <a
                            href={`${HOST}/products/${r.current_slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            <div className="font-medium">{r.product_name || r.current_slug}</div>
                            <div className="font-mono text-[11px] text-muted-foreground break-all">
                              {r.current_slug}
                            </div>
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge r={r} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.pin_count}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {r.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground max-w-[200px] truncate">
                        {r.reason || r.kind || "—"}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(`${HOST}/products/${r.old_slug}?_audit=1`, "_blank")}
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div
          className={`mt-1 text-2xl font-semibold tabular-nums ${
            tone === "warn" && value > 0 ? "text-destructive" : ""
          }`}
        >
          {value.toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}