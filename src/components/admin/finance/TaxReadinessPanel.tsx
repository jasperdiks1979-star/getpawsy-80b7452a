/**
 * Tax Readiness Center — pure view over canonical FinanceState.
 * Counts, %, and status are guaranteed to match Belastingdienst + KPI Strip
 * because every panel reads the same reconciled object.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Landmark, RefreshCw } from "lucide-react";
import { useFinanceState } from "@/lib/finance/state/FinanceStateProvider";
import { StatusBadge } from "./shared/StatusBadge";
import { ExplainPopover } from "./shared/ExplainPopover";
import { formatMoneyMinor } from "@/lib/finance/format";

export function TaxReadinessPanel(_props: { entityId?: string | null }) {
  const { state, refresh } = useFinanceState();
  const t = state.tax_readiness;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Landmark className="h-4 w-4" /> Tax Readiness Center
          <Badge variant="outline">{state.period.label}</Badge>
          <StatusBadge status={t.status} />
          <ExplainPopover title="Tax readiness" explanation={t.explanation} bullets={t.sources.map((s) => `Source: ${s}`)} />
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={state.loading}>
          <RefreshCw className={`h-3 w-3 mr-1 ${state.loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Overall readiness</span>
            <span className="font-semibold tabular-nums">{t.value}%</span>
          </div>
          <Progress value={t.value} className="h-2" />
        </div>

        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Cell label="Missing invoices" value={String(state.missing_invoices.value)} status={state.missing_invoices.status} explanation={state.missing_invoices.explanation} />
          <Cell label="Missing receipts" value={String(state.missing_receipts.value)} status={state.missing_receipts.status} explanation={state.missing_receipts.explanation} />
          <Cell label="Unmatched payments" value={String(state.unmatched_payments.value)} status={state.unmatched_payments.status} explanation={state.unmatched_payments.explanation} />
          <Cell label="Evidence confidence" value={`${state.evidence_confidence.value}%`} status={state.evidence_confidence.status} explanation={state.evidence_confidence.explanation} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <VatRow label="Recoverable VAT" value={formatMoneyMinor(state.vat.recoverable_minor.value)} />
          <VatRow label="Reverse-charge VAT" value={formatMoneyMinor(state.vat.reverse_charge_minor.value)} />
          <VatRow label="Import VAT" value={formatMoneyMinor(state.vat.import_vat_minor.value)} />
          <VatRow label="Non-deductible VAT" value={formatMoneyMinor(state.vat.non_deductible_minor.value)} />
          <VatRow label="Potential VAT" value={formatMoneyMinor(state.vat.potential_minor.value)} />
          <VatRow label="Refund estimate" value={formatMoneyMinor(state.vat.refund_estimate_minor.value)} />
        </div>

        <p className="text-xs text-muted-foreground">
          Finance Commander prepares bookkeeping — it never files returns automatically.
        </p>
      </CardContent>
    </Card>
  );
}

function Cell({ label, value, status, explanation }: { label: string; value: string; status: string; explanation: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        <ExplainPopover title={label} explanation={explanation} />
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      <div className="mt-1"><StatusBadge status={status as any} className="text-[10px]" /></div>
    </div>
  );
}

function VatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
