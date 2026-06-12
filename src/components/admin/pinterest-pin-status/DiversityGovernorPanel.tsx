import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Loader2, Scale } from "lucide-react";
import { useState } from "react";

type Bucket =
  | "cat_essentials" | "cat_toys" | "dog_toys" | "dog_beds" | "feeding"
  | "cat_furniture" | "cat_trees" | "litter" | "travel" | "grooming" | "misc";

interface MetricsResponse {
  ok: boolean;
  metrics: {
    posted_last_100: number;
    distribution: Array<{ bucket: Bucket; count: number; pct: number; target: number; delta: number }>;
    dog_pct: number;
    cat_pct: number;
    last_3_buckets: Bucket[];
    creative_types: Record<string, number>;
    top_products: Array<{ slug: string; count: number }>;
    top_overlays: Array<{ overlay: string; count: number }>;
  };
  targets: Record<Bucket, number>;
  hard_cap: number;
  forecast_24h: { expected_publishes: number; cat_share: number; dog_share: number };
}

function pct(n: number) { return `${(n * 100).toFixed(0)}%`; }

export default function DiversityGovernorPanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pinterest-diversity-governor"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<MetricsResponse>(
        "pinterest-diversity-governor",
        { body: { action: "metrics" } },
      );
      if (error) throw error;
      return data!;
    },
    refetchInterval: 60_000,
  });

  async function runMigrate() {
    setBusy("migrate");
    const { data, error } = await supabase.functions.invoke("pinterest-diversity-governor", {
      body: { action: "migrate_queue" },
    });
    setBusy(null);
    if (error) toast({ title: "Migration failed", description: error.message, variant: "destructive" });
    else toast({ title: "Queue rebalanced", description: `Rejected ${(data as any)?.rejected_queue_rows ?? 0} over-cap rows` });
    refetch();
  }

  async function runBatch(n: number) {
    setBusy(`batch-${n}`);
    const { data, error } = await supabase.functions.invoke("pinterest-diversity-governor", {
      body: { action: "run_batch", count: n },
    });
    setBusy(null);
    if (error) toast({ title: "Batch failed", description: error.message, variant: "destructive" });
    else toast({
      title: `Dispatched ${(data as any)?.selected_count ?? 0} drafts`,
      description: "Generation runs async; metrics refresh in ~60s.",
    });
    refetch();
  }

  return (
    <Card className="mb-4 border-2 border-emerald-300/40">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Scale className="h-4 w-4" /> Category Diversity Governor
          <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
            ACTIVE
          </Badge>
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runMigrate} disabled={busy !== null}>
            {busy === "migrate" ? "…" : "Rebalance queue"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => runBatch(10)} disabled={busy !== null}>
            {busy === "batch-10" ? "…" : "Dispatch 10"}
          </Button>
          <Button size="sm" onClick={() => runBatch(50)} disabled={busy !== null}>
            {busy === "batch-50" ? "…" : "Dispatch 50"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "…" : "refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading || !data ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading governor metrics…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded border p-2">
                <div className="text-xs text-muted-foreground">Dog share (last 100)</div>
                <div className={"text-lg font-semibold " + (data.metrics.dog_pct < 0.35 ? "text-amber-700" : "text-emerald-700")}>
                  {pct(data.metrics.dog_pct)} <span className="text-xs">/ ≥35%</span>
                </div>
              </div>
              <div className="rounded border p-2">
                <div className="text-xs text-muted-foreground">Cat share</div>
                <div className="text-lg font-semibold">{pct(data.metrics.cat_pct)}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-xs text-muted-foreground">Hard cap / bucket</div>
                <div className="text-lg font-semibold">{pct(data.hard_cap)}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-xs text-muted-foreground">Forecast 24h publishes</div>
                <div className="text-lg font-semibold">{data.forecast_24h.expected_publishes}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Category distribution (last {data.metrics.posted_last_100} posted) vs target
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {data.metrics.distribution.map((d) => {
                  const over = d.pct >= data.hard_cap;
                  return (
                    <div key={d.bucket} className={"rounded border p-2 " + (over ? "border-red-400 bg-red-50" : "")}>
                      <div className="text-xs flex items-center justify-between">
                        <span>{d.bucket.replace(/_/g, " ")}</span>
                        {over && <Badge variant="destructive" className="text-[10px]">OVER</Badge>}
                      </div>
                      <div className="text-sm font-mono">
                        {pct(d.pct)} <span className="text-muted-foreground">/ {pct(d.target)}</span>
                        <span className="ml-2 text-xs">({d.count})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Creative-type ratio (posted)</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(data.metrics.creative_types).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-xs">{k}: {v}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Last 3 categories published</div>
                <div className="flex gap-1">
                  {data.metrics.last_3_buckets.map((b, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{b}</Badge>
                  ))}
                </div>
              </div>
            </div>

            {data.metrics.top_products.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Top repeated products (last 100)</div>
                <div className="flex flex-wrap gap-1">
                  {data.metrics.top_products.slice(0, 6).map((p) => (
                    <Badge key={p.slug} variant="outline" className="text-xs" title={p.slug}>
                      {p.slug.slice(0, 32)}… ({p.count})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {data.metrics.top_overlays.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Top repeated overlays</div>
                <div className="flex flex-wrap gap-1">
                  {data.metrics.top_overlays.slice(0, 6).map((o) => (
                    <Badge
                      key={o.overlay}
                      variant="outline"
                      className={"text-xs " + (o.count > 5 ? "border-red-400 text-red-700 bg-red-50" : "")}
                      title={o.overlay}
                    >
                      {o.overlay.slice(0, 40)} ({o.count})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}