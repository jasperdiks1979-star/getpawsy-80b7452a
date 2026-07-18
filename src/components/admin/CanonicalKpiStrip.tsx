import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { useCanonicalFunnel } from "@/hooks/useCanonicalFunnel";

// One KPI strip. Every admin dashboard renders this so the numbers can never
// diverge again. If you feel the urge to compute a funnel number in a
// dashboard component, use this hook instead.

type Range = { key: "1h" | "10h" | "24h" | "7d" | "30d"; hours: number; label: string };
const RANGES: Range[] = [
  { key: "1h", hours: 1, label: "1h" },
  { key: "10h", hours: 10, label: "10h" },
  { key: "24h", hours: 24, label: "24h" },
  { key: "7d", hours: 24 * 7, label: "7d" },
  { key: "30d", hours: 24 * 30, label: "30d" },
];

interface Props {
  defaultRange?: Range["key"];
  defaultGeo?: "US" | "all";
  title?: string;
  compact?: boolean;
}

export function CanonicalKpiStrip({
  defaultRange = "24h",
  defaultGeo = "all",
  title = "Canonical funnel — single source of truth",
  compact = false,
}: Props) {
  const [rangeKey, setRangeKey] = useState<Range["key"]>(defaultRange);
  const [geo, setGeo] = useState<"US" | "all">(defaultGeo);
  const hours = RANGES.find((r) => r.key === rangeKey)?.hours ?? 24;
  const q = useCanonicalFunnel({ hours, geo });

  const t = q.data?.totals;
  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();
  const money = (n: number | undefined, ccy: string | undefined) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: (ccy || "EUR").toUpperCase() }).format(n ?? 0);

  return (
    <Card className="ring-1 ring-emerald-500/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              {title}
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2 text-xs">
              <span>Source: <code>canonical_events</code> + <code>orders(paid|completed)</code></span>
              <Badge variant="outline" className="text-[10px]">Clean</Badge>
              <Badge variant="outline" className="text-[10px]">Dedup: dedup_key</Badge>
              {q.data?.cached && <Badge variant="outline" className="text-[10px]">cache</Badge>}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ToggleGroup type="single" value={geo} onValueChange={(v) => v && setGeo(v as any)} size="sm">
              <ToggleGroupItem value="all" className="text-xs px-2">All</ToggleGroupItem>
              <ToggleGroupItem value="US" className="text-xs px-2">US only</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup type="single" value={rangeKey} onValueChange={(v) => v && setRangeKey(v as any)} size="sm">
              {RANGES.map((r) => (
                <ToggleGroupItem key={r.key} value={r.key} className="text-xs px-2">
                  {r.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
              {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Canonical service error: {(q.error as Error).message}</span>
          </div>
        )}
        <div className={`grid gap-2 ${compact ? "grid-cols-3 md:grid-cols-6" : "grid-cols-2 md:grid-cols-5 lg:grid-cols-9"}`}>
          <Kpi label="Human visitors" value={fmt(t?.human_visitors ?? t?.visitors)} loading={q.isLoading} highlight />
          <Kpi label="Raw sessions" value={fmt(t?.raw_sessions_all)} loading={q.isLoading} />
          <Kpi label="Human sessions" value={fmt(t?.sessions)} loading={q.isLoading} />
          <Kpi label="Pageviews"  value={fmt(t?.page_views)} loading={q.isLoading} />
          <Kpi label="Products"   value={fmt(t?.product_views)} loading={q.isLoading} />
          <Kpi label="Add to cart" value={fmt(t?.add_to_cart)} loading={q.isLoading} />
          <Kpi label="View cart"  value={fmt(t?.view_cart)}  loading={q.isLoading} />
          <Kpi label="Checkout"   value={fmt(t?.checkout_started)} loading={q.isLoading} />
          <Kpi label="Purchases"  value={fmt(t?.purchases)}  loading={q.isLoading} highlight />
          <Kpi label="Revenue"    value={money(t?.revenue, t?.currency)} loading={q.isLoading} highlight />
        </div>
        {(q.data as any)?.traffic_quality_breakdown && (
          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 border-t pt-2">
            <span className="font-medium text-foreground">Traffic quality:</span>
            <span>excluded internal <b>{(q.data as any).traffic_quality_breakdown.excluded_internal}</b></span>
            <span>bot <b>{(q.data as any).traffic_quality_breakdown.excluded_bot}</b></span>
            <span>technical <b>{(q.data as any).traffic_quality_breakdown.excluded_technical}</b></span>
            <span>non-commercial <b>{(q.data as any).traffic_quality_breakdown.excluded_commercial_flag}</b></span>
            <span>low quality <b>{(q.data as any).traffic_quality_breakdown.excluded_low_quality}</b></span>
            <span>unknown country <b>{(q.data as any).traffic_quality_breakdown.unknown_country}</b></span>
          </div>
        )}
        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          <span>CVR: <b>{t?.conversion_rate ?? 0}%</b></span>
          <span>Window: last {hours}h · {q.data?.window?.since?.slice(0, 19) || "…"} → {q.data?.window?.until?.slice(0, 19) || "…"}</span>
          <span>Filter: geo={geo} · clean=true</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, loading, highlight }: { label: string; value: string; loading?: boolean; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${highlight ? "bg-emerald-500/5 border-emerald-500/30" : "bg-card"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">
        {loading ? <span className="text-muted-foreground text-sm">…</span> : value}
      </div>
    </div>
  );
}

export default CanonicalKpiStrip;