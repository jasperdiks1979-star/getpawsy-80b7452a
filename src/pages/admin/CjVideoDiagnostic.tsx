import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Search, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

interface Aggregate {
  cj_products: number;
  cj_media_synced: number;
  db_videos: number;
  db_images: number;
  products_with_video: number;
  products_missing_video: number;
  products_with_zero_variants: number;
  recent_actions: Record<string, number>;
}

interface ZeroVariantRow {
  id: string;
  name: string;
  slug: string;
  cj_product_id: string | null;
  stock: number | null;
}

interface PerProductReport {
  product: Record<string, unknown>;
  product_media: Array<Record<string, unknown>>;
  video_count: number;
  image_media_count: number;
  variant_count: number;
  recent_sync_items: Array<Record<string, unknown>>;
  live_candidates: Array<{ url: string; source: string; status: string }> | null;
  live_summary: Record<string, unknown> | null;
}

export default function CjVideoDiagnostic() {
  const [aggLoading, setAggLoading] = useState(false);
  const [agg, setAgg] = useState<{ aggregate: Aggregate; zero_variant_sample: ZeroVariantRow[] } | null>(null);
  const [query, setQuery] = useState("2603250937581630000");
  const [live, setLive] = useState(true);
  const [perLoading, setPerLoading] = useState(false);
  const [perReport, setPerReport] = useState<PerProductReport | null>(null);

  async function loadAggregate() {
    setAggLoading(true);
    setAgg(null);
    try {
      const { data, error } = await supabase.functions.invoke("cj-video-diagnostic", { body: {} });
      if (error) throw error;
      setAgg(data as { aggregate: Aggregate; zero_variant_sample: ZeroVariantRow[] });
    } catch (e) {
      toast.error(`Aggregate failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAggLoading(false); }
  }

  async function loadProduct() {
    if (!query.trim()) return;
    setPerLoading(true);
    setPerReport(null);
    try {
      const body: Record<string, unknown> = { live };
      // UUID heuristic
      if (/^[0-9a-f-]{36}$/i.test(query.trim())) body.product_id = query.trim();
      else body.cj_product_id = query.trim();
      const { data, error } = await supabase.functions.invoke("cj-video-diagnostic", { body });
      if (error) throw error;
      setPerReport(data as PerProductReport);
    } catch (e) {
      toast.error(`Lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setPerLoading(false); }
  }

  return (
    <div className="container mx-auto max-w-6xl py-8 space-y-6">
      <Helmet><title>CJ Video Diagnostic · Admin</title></Helmet>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">CJ video &amp; variant diagnostic</h1>
        <p className="text-muted-foreground">
          Inspect catalog-wide media coverage and per-product CJ → DB → PDP flow.
          Use the lookup to compare live CJ payload against stored
          <code className="text-xs"> product_media</code> and{" "}
          <code className="text-xs">products.variants</code>.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Catalog aggregate</CardTitle>
          <Button size="sm" variant="outline" onClick={loadAggregate} disabled={aggLoading}>
            {aggLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {!agg && !aggLoading && (
            <p className="text-sm text-muted-foreground">Click refresh to load aggregate counts.</p>
          )}
          {agg && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="CJ products" value={agg.aggregate.cj_products} />
                <Stat label="Media synced" value={agg.aggregate.cj_media_synced} />
                <Stat label="DB videos" value={agg.aggregate.db_videos} tone="success" />
                <Stat label="DB images" value={agg.aggregate.db_images} />
                <Stat label="With video" value={agg.aggregate.products_with_video} tone="success" />
                <Stat label="Missing video" value={agg.aggregate.products_missing_video} tone="warn" />
                <Stat label="Zero variants" value={agg.aggregate.products_with_zero_variants} tone="warn" />
                <Stat label="Recent sync events" value={Object.values(agg.aggregate.recent_actions).reduce((a, b) => a + b, 0)} tone="muted" />
              </div>
              <details className="rounded-md border bg-muted/30 p-3">
                <summary className="cursor-pointer text-sm font-medium">Recent sync actions</summary>
                <pre className="mt-2 max-h-[240px] overflow-auto text-xs">{JSON.stringify(agg.aggregate.recent_actions, null, 2)}</pre>
              </details>
              <details className="rounded-md border bg-muted/30 p-3">
                <summary className="cursor-pointer text-sm font-medium">Zero-variant sample ({agg.zero_variant_sample.length})</summary>
                <ul className="mt-2 max-h-[240px] overflow-auto text-xs space-y-1">
                  {agg.zero_variant_sample.map((r) => (
                    <li key={r.id}>
                      <button
                        className="underline underline-offset-2"
                        onClick={() => { setQuery(r.id); setLive(true); }}
                      >
                        {r.name}
                      </button>{" "}
                      <span className="text-muted-foreground">cj={r.cj_product_id} stock={r.stock ?? 0}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-product lookup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="product UUID or cj_product_id"
              className="max-w-md"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              Fetch live CJ payload
            </label>
            <Button onClick={loadProduct} disabled={perLoading}>
              {perLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Lookup
            </Button>
          </div>

          {perReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label="Videos in DB" value={perReport.video_count} tone="success" />
                <Stat label="Image media" value={perReport.image_media_count} />
                <Stat label="Variants" value={perReport.variant_count} tone={perReport.variant_count === 0 ? "warn" : "success"} />
                <Stat label="Live candidates" value={perReport.live_candidates?.length ?? 0} tone="muted" />
              </div>

              {perReport.live_candidates && (
                <details open className="rounded-md border bg-muted/30 p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Live CJ video candidates ({perReport.live_candidates.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {perReport.live_candidates.map((c, i) => (
                      <li key={i} className="flex flex-col gap-0.5">
                        <span className={c.status === "accepted" ? "text-emerald-600" : "text-amber-600"}>
                          [{c.status}] {c.source}
                        </span>
                        <a href={c.url} target="_blank" rel="noreferrer" className="break-all underline">{c.url}</a>
                      </li>
                    ))}
                    {perReport.live_candidates.length === 0 && (
                      <li className="text-muted-foreground">CJ returned no video candidates for this product.</li>
                    )}
                  </ul>
                </details>
              )}

              <details open className="rounded-md border bg-muted/30 p-3">
                <summary className="cursor-pointer text-sm font-medium">Stored product_media ({perReport.product_media.length})</summary>
                <pre className="mt-2 max-h-[280px] overflow-auto text-xs">{JSON.stringify(perReport.product_media, null, 2)}</pre>
              </details>

              <details className="rounded-md border bg-muted/30 p-3">
                <summary className="cursor-pointer text-sm font-medium">Recent sync items ({perReport.recent_sync_items.length})</summary>
                <pre className="mt-2 max-h-[280px] overflow-auto text-xs">{JSON.stringify(perReport.recent_sync_items, null, 2)}</pre>
              </details>

              <details className="rounded-md border bg-muted/30 p-3">
                <summary className="cursor-pointer text-sm font-medium">Product row</summary>
                <pre className="mt-2 max-h-[280px] overflow-auto text-xs">{JSON.stringify(perReport.product, null, 2)}</pre>
              </details>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "warn" | "destructive" | "muted"; }) {
  const toneClass =
    tone === "success" ? "text-emerald-600"
    : tone === "warn" ? "text-amber-600"
    : tone === "destructive" ? "text-destructive"
    : tone === "muted" ? "text-muted-foreground"
    : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}