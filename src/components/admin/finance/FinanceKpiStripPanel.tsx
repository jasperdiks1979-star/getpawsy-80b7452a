/**
 * Finance KPI Strip — pure view over the canonical FinanceState.
 * No local fetches, no local status logic. Every number comes from the
 * FinanceStateProvider so KPI Strip can never disagree with Tax Readiness /
 * Belastingdienst / Health Signals.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gauge, RefreshCw } from "lucide-react";
import { formatMoneyMinor, formatPct } from "@/lib/finance/format";
import { useFinanceState } from "@/lib/finance/state/FinanceStateProvider";
import { StatusBadge } from "./shared/StatusBadge";
import { ExplainPopover } from "./shared/ExplainPopover";
import type { Metric } from "@/lib/finance/state/types";

export function FinanceKpiStripPanel(_props: { entityId?: string | null }) {
  const { state, refresh } = useFinanceState();
  const loading = state.loading;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Gauge className="h-4 w-4" /> Finance KPI Strip
          <Badge variant="outline">{state.period.label}</Badge>
          <StatusBadge status={state.overall} />
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <KpiCell label="Recoverable VAT" metric={state.vat.recoverable_minor} render={(v) => formatMoneyMinor(v)} />
          <KpiCell label="Tax readiness" metric={state.tax_readiness} render={(v) => formatPct(v)} />
          <KpiCell label="Evidence completeness" metric={state.evidence_confidence} render={(v) => formatPct(v)} />
          <KpiCell label="Unmatched payments" metric={state.unmatched_payments} render={(v) => String(v)} />
          <KpiCell label="Missing invoices" metric={state.missing_invoices} render={(v) => String(v)} />
          <KpiCell label="Supplier confidence" metric={state.supplier_confidence} render={(v) => formatPct(v)} />
          <KpiCell
            label="Subs annualized"
            metric={state.subscriptions_annualized_minor}
            render={(v) => formatMoneyMinor(v)}
          />
          <KpiCell
            label="Next VAT refund (est)"
            metric={state.vat.refund_estimate_minor}
            render={(v) => formatMoneyMinor(v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCell({
  label,
  metric,
  render,
}: {
  label: string;
  metric: Metric<number>;
  render: (value: number) => string;
}) {
  return (
    <div className="rounded border p-3 space-y-1">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        <ExplainPopover title={label} explanation={metric.explanation} bullets={metric.sources.map((s) => `Source: ${s}`)} />
      </div>
      <div className="text-lg font-semibold tabular-nums">{render(metric.value)}</div>
      <StatusBadge status={metric.status} className="text-[10px]" />
    </div>
  );
}
