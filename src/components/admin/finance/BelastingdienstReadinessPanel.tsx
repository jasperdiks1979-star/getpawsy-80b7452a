/**
 * Belastingdienst Readiness — pure view over canonical FinanceState.
 * Readiness % is upper-bounded by tax_readiness in reconcile.ts, and a
 * Verified badge is impossible while any contradiction exists.
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

export function BelastingdienstReadinessPanel(_props: { entityId?: string | null }) {
  const { state, refresh } = useFinanceState();
  const b = state.belastingdienst;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Landmark className="h-4 w-4" /> Belastingdienst Readiness
          <Badge variant="outline">{state.period.label}</Badge>
          <StatusBadge status={b.status} />
          <ExplainPopover title="Belastingdienst readiness" explanation={b.explanation} bullets={b.sources.map((s) => `Source: ${s}`)} />
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={state.loading}>
          <RefreshCw className={`h-3 w-3 ${state.loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Readiness</span>
            <span className="font-semibold tabular-nums">{b.value}%</span>
          </div>
          <Progress value={b.value} className="h-2" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          <Cell label="Recoverable VAT" value={formatMoneyMinor(state.vat.recoverable_minor.value)} />
          <Cell label="Reverse-charge" value={formatMoneyMinor(state.vat.reverse_charge_minor.value)} />
          <Cell label="Import VAT" value={formatMoneyMinor(state.vat.import_vat_minor.value)} />
          <Cell label="Non-deductible" value={formatMoneyMinor(state.vat.non_deductible_minor.value)} />
          <Cell label="Potential VAT" value={formatMoneyMinor(state.vat.potential_minor.value)} />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={state.missing_invoices.value ? "destructive" : "outline"}>
            {state.missing_invoices.value} missing invoices
          </Badge>
          <Badge variant={state.missing_receipts.value ? "destructive" : "outline"}>
            {state.missing_receipts.value} missing receipts
          </Badge>
          <Badge variant={state.unmatched_payments.value ? "destructive" : "outline"}>
            {state.unmatched_payments.value} unmatched payments
          </Badge>
          <Badge variant={state.low_confidence_documents.value ? "secondary" : "outline"}>
            {state.low_confidence_documents.value} low-confidence docs
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Finance Commander prepares the filing package — it never files returns automatically.
        </p>
      </CardContent>
    </Card>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
