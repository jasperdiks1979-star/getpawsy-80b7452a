import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PanelLoadingState } from "@/components/admin/PanelLoadingState";
import { Leaf, DollarSign, Users, ShieldOff, Bot, HelpCircle, Info, Wrench, Link2, MousePointerClick } from "lucide-react";
import {
  useTrafficClassSplit,
  fmtCents,
  convRate,
  type AcquisitionRow,
} from "@/hooks/useTrafficClassSplit";
import { useAnalyticsTruth } from "@/hooks/useAnalyticsTruth";
import {
  summarizeTrafficQuality,
  type ClassifierSession,
} from "@/lib/trafficQualityClassifier";


/**
 * TrafficClassSplitPanel — acquisition split (24h) on the v2 commercial
 * contract (`canonical_acquisition_funnel_24h`).
 *
 * Organic = organic search + Pinterest organic + other organic social ONLY.
 * Direct and Referral are separate. UNKNOWN / bot / internal / technical are
 * excluded from every KPI and carry no funnel events.
 */
export function TrafficClassSplitPanel({ compact = false }: { compact?: boolean }) {
  const { data, isLoading, error, refetch } = useTrafficClassSplit();
  // Source classification stays server-side; human eligibility is strict v3.
  // Same React-Query key as the rest of the 24h page — no extra pipeline.
  const truth = useAnalyticsTruth({ hours: 24, geo: "all" });
  const v3 = useMemo(
    () => summarizeTrafficQuality((truth.data?.sessions ?? []) as ClassifierSession[]),
    [truth.data],
  );


  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Leaf className="h-4 w-4 text-emerald-500" />
          Acquisition — Organic vs Paid (last 24h)
          <Badge variant="outline" className="ml-auto text-[10px] uppercase tracking-wider">
            Canonical v2
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || error ? (
          <PanelLoadingState
            isLoading={isLoading}
            isError={!!error}
            error={error}
            onRetry={() => refetch()}
            label="Organic vs Paid split"
            testId="traffic-class-split-loading"
            skeleton={
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" />
              </div>
            }
          />
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ClassCard
                label="Organic (unpaid channels)"
                icon={Leaf}
                accent="text-emerald-400 border-emerald-800/60 bg-emerald-500/5"
                row={data.organic}
                priority
              />
              <ClassCard
                label="Paid"
                icon={DollarSign}
                accent="text-amber-400 border-amber-800/60 bg-amber-500/5"
                row={data.paid}
              />
              <ClassCard
                label="Commercial total"
                icon={Users}
                accent="text-primary border-primary/40 bg-primary/5"
                row={data.commercial}
                total
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MiniStat label="Organic search" value={data.byBucket.ORGANIC_SEARCH?.sessions ?? 0} icon={Leaf} />
              <MiniStat label="Pinterest organic" value={data.byBucket.PINTEREST_ORGANIC?.sessions ?? 0} icon={MousePointerClick} />
              <MiniStat label="Referral" value={data.referral.sessions} icon={Link2} />
              <MiniStat label="Direct (human-evidence)" value={data.direct.sessions} icon={Users} />
            </div>

            {!compact && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1">
                  <Info className="h-3 w-3" /> Excluded from business KPIs and funnel:
                </span>
                <span className="flex items-center gap-1">
                  <HelpCircle className="h-3 w-3 text-slate-400" />
                  Unknown / no evidence {data.unknownExcluded.sessions} sess
                </span>
                <span className="flex items-center gap-1">
                  <ShieldOff className="h-3 w-3 text-slate-400" />
                  Internal {data.internalExcluded.sessions} sess
                </span>
                <span className="flex items-center gap-1">
                  <Bot className="h-3 w-3 text-slate-400" />
                  Bot / crawler {data.botExcluded.sessions} sess
                </span>
                <span className="flex items-center gap-1">
                  <Wrench className="h-3 w-3 text-slate-400" />
                  Technical {data.technicalExcluded.sessions} sess
                </span>
                <span className="w-full opacity-70">
                  Raw sessions {data.rawSessions.toLocaleString()} · unknown traffic is never counted as organic ·
                  source: <code>canonical_acquisition_funnel_24h</code>
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-md border bg-muted/20 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function ClassCard({
  label, icon: Icon, accent, row, priority, total,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  row: AcquisitionRow;
  priority?: boolean;
  total?: boolean;
}) {
  const cvr = convRate(row);
  return (
    <div className={`rounded-lg border p-3 ${accent}`}>
      <div className="flex items-center justify-between mb-2 gap-2">
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
      <div className="text-2xl font-semibold leading-tight">{row.sessions.toLocaleString()}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">commercial sessions</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Stat label="Visitors" value={row.visitors.toLocaleString()} />
        <Stat label="Page views" value={row.page_views.toLocaleString()} />
        <Stat label="Product views" value={row.product_views.toLocaleString()} />
        <Stat label="Add to cart" value={row.add_to_cart.toLocaleString()} />
        <Stat label="Checkouts" value={row.checkout_started.toLocaleString()} />
        <Stat label="Purchases" value={row.purchases.toLocaleString()} />
        <Stat label="Revenue" value={fmtCents(row.revenue_cents)} />
        <Stat label="CVR" value={`${(cvr * 100).toFixed(2)}%`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
