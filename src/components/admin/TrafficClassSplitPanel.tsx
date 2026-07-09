import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Leaf, DollarSign, Users, ShieldOff, Bot, HelpCircle, Info } from "lucide-react";
import {
  useTrafficClassSplit,
  fmtCents,
  convRate,
  type TrafficClassRow,
} from "@/hooks/useTrafficClassSplit";

/**
 * TrafficClassSplitPanel — Organic / Paid / Total split (24h).
 *
 * Reads canonical_traffic_class_funnel_24h. Business KPIs = organic + paid
 * (internal + bot excluded by mission rule). "Total" column here is the
 * real-human total (organic + paid). Internal / bot / unknown are shown as
 * a filtered-out advisory strip beneath the main table.
 *
 * Drop-in for any dashboard — no props required.
 */
export function TrafficClassSplitPanel({ compact = false }: { compact?: boolean }) {
  const { data, isLoading, error } = useTrafficClassSplit();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Leaf className="h-4 w-4 text-emerald-500" />
          Organic vs Paid (last 24h)
          <Badge variant="outline" className="ml-auto text-[10px] uppercase tracking-wider">
            Canonical
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
          </div>
        ) : error ? (
          <div className="text-sm text-rose-400">Failed to load traffic split: {(error as Error).message}</div>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ClassCard
                label="Organic"
                icon={Leaf}
                accent="text-emerald-400 border-emerald-800/60 bg-emerald-500/5"
                row={data.organic}
                sessions={data.organic?.sessions ?? 0}
                priority
              />
              <ClassCard
                label="Paid"
                icon={DollarSign}
                accent="text-amber-400 border-amber-800/60 bg-amber-500/5"
                row={data.paid}
                sessions={data.paid?.sessions ?? 0}
              />
              <ClassCard
                label="Total (real)"
                icon={Users}
                accent="text-primary border-primary/40 bg-primary/5"
                row={data.totalReal}
                sessions={data.totalReal.sessions}
                total
              />
            </div>

            {!compact && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1">
                  <Info className="h-3 w-3" /> Excluded from business KPIs:
                </span>
                <span className="flex items-center gap-1">
                  <ShieldOff className="h-3 w-3 text-slate-400" />
                  Internal {data.internal?.sessions ?? 0} sess
                </span>
                <span className="flex items-center gap-1">
                  <Bot className="h-3 w-3 text-slate-400" />
                  Bot {data.bot?.sessions ?? 0} sess
                </span>
                <span className="flex items-center gap-1">
                  <HelpCircle className="h-3 w-3 text-slate-400" />
                  Unknown / low-confidence {data.unknown?.sessions ?? 0} sess
                </span>
                <span className="ml-auto opacity-70">
                  Source: <code>canonical_traffic_class_funnel_24h</code>
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ClassCard({
  label, icon: Icon, accent, row, sessions, priority, total,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  row: TrafficClassRow | null;
  sessions: number;
  priority?: boolean;
  total?: boolean;
}) {
  const cvr = convRate(row);
  return (
    <div className={`rounded-lg border p-3 ${accent}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        {priority && (
          <span className="text-[9px] uppercase tracking-wider rounded bg-emerald-500/15 border border-emerald-800/60 px-1.5 py-0.5">
            AI priority
          </span>
        )}
        {total && (
          <span className="text-[9px] uppercase tracking-wider rounded bg-primary/15 border border-primary/40 px-1.5 py-0.5">
            Business KPI
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold leading-tight">{sessions.toLocaleString()}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">sessions</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Stat label="Visitors" value={(row?.visitors ?? 0).toLocaleString()} />
        <Stat label="Page views" value={(row?.page_views ?? 0).toLocaleString()} />
        <Stat label="Product views" value={(row?.product_views ?? 0).toLocaleString()} />
        <Stat label="Add to cart" value={(row?.add_to_cart ?? 0).toLocaleString()} />
        <Stat label="Checkouts" value={(row?.checkout_started ?? 0).toLocaleString()} />
        <Stat label="Purchases" value={(row?.purchases ?? 0).toLocaleString()} />
        <Stat label="Revenue" value={fmtCents(row?.revenue_cents ?? 0)} />
        <Stat label="CVR" value={`${(cvr * 100).toFixed(2)}%`} />
      </div>
      {row?.avg_attribution_confidence != null && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Attribution confidence: <span className="font-mono">{row.avg_attribution_confidence.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1 min-w-0">
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}