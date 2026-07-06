import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gauge, RefreshCw } from "lucide-react";
import {
  formatMoneyMinor,
  formatPct,
  readinessStatus,
  STATUS_VARIANT,
  type FinanceStatus,
} from "@/lib/finance/format";

type Kpi = {
  recoverable_vat_minor: number;
  tax_readiness_pct: number;
  evidence_completeness_pct: number;
  unmatched_payments: number;
  missing_invoices: number;
  supplier_confidence_pct: number;
  subscriptions_annualized_minor: number;
  estimated_next_vat_refund_minor: number;
  period: { year: number; quarter: number };
};

type FinanceStatusVariant = "default" | "secondary" | "destructive" | "outline";

export function FinanceKpiStripPanel({ entityId: _ }: { entityId: string | null }) {
  const [k, setK] = useState<Kpi | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("finance-kpi-strip", { body: {} });
    setK(data as Kpi);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const overallStatus: FinanceStatus | null = k
    ? readinessStatus({
        readinessPct: k.tax_readiness_pct,
        missingInvoices: k.missing_invoices,
        unmatchedPayments: k.unmatched_payments,
        confidence: k.supplier_confidence_pct,
      })
    : null;

  // Never mark a KPI Verified if the underlying evidence is incomplete.
  const badgeFor = (kind: "recoverable" | "readiness" | "evidence" | "unmatched" | "missing" | "supplier" | "subs" | "refund"): { label: FinanceStatus; tone: FinanceStatusVariant } => {
    if (!k) return { label: "Pending", tone: "outline" };
    const contradicts = k.missing_invoices > 0 || k.unmatched_payments > 0;
    const cannotVerify = contradicts || k.evidence_completeness_pct < 95;
    switch (kind) {
      case "recoverable":
        return { label: cannotVerify ? "Estimated" : "Verified", tone: cannotVerify ? "secondary" : "default" };
      case "readiness": {
        const s: FinanceStatus = k.missing_invoices > 0 || k.unmatched_payments > 0
          ? "Missing Evidence"
          : k.tax_readiness_pct >= 95 ? "Verified"
          : k.tax_readiness_pct >= 65 ? "Needs Review" : "Missing Evidence";
        return { label: s, tone: STATUS_VARIANT[s] };
      }
      case "evidence": {
        const s: FinanceStatus = k.evidence_completeness_pct >= 95 ? "Verified"
          : k.evidence_completeness_pct >= 70 ? "Needs Review" : "Missing Evidence";
        return { label: s, tone: STATUS_VARIANT[s] };
      }
      case "unmatched":
        return k.unmatched_payments
          ? { label: "Needs Review", tone: "secondary" }
          : { label: "Verified", tone: "default" };
      case "missing":
        return k.missing_invoices
          ? { label: "Missing Evidence", tone: "destructive" }
          : { label: "Verified", tone: "default" };
      case "supplier": {
        const s: FinanceStatus = k.supplier_confidence_pct >= 85 ? "Verified"
          : k.supplier_confidence_pct >= 50 ? "Needs Review"
          : k.supplier_confidence_pct > 0 ? "Estimated" : "Pending";
        return { label: s, tone: STATUS_VARIANT[s] };
      }
      case "subs":
        return { label: "Estimated", tone: "secondary" };
      case "refund":
        return k.estimated_next_vat_refund_minor > 0
          ? { label: "Estimated", tone: "secondary" }
          : { label: "Pending", tone: "outline" };
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="h-4 w-4" /> Finance KPI Strip
          {k && <Badge variant="outline">{k.period.year} Q{k.period.quarter}</Badge>}
          {overallStatus && <Badge variant={STATUS_VARIANT[overallStatus]}>{overallStatus}</Badge>}
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {!k ? <div className="text-sm text-muted-foreground">{loading ? "Loading…" : "No activity yet."}</div> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {(() => { const b = badgeFor("recoverable"); return <Kpi label="Recoverable VAT" value={formatMoneyMinor(k.recoverable_vat_minor)} badge={b.label} tone={b.tone} />; })()}
            {(() => { const b = badgeFor("readiness"); return <Kpi label="Tax readiness" value={formatPct(k.tax_readiness_pct)} badge={b.label} tone={b.tone} />; })()}
            {(() => { const b = badgeFor("evidence"); return <Kpi label="Evidence completeness" value={formatPct(k.evidence_completeness_pct)} badge={b.label} tone={b.tone} />; })()}
            {(() => { const b = badgeFor("unmatched"); return <Kpi label="Unmatched payments" value={String(k.unmatched_payments)} badge={b.label} tone={b.tone} />; })()}
            {(() => { const b = badgeFor("missing"); return <Kpi label="Missing invoices" value={String(k.missing_invoices)} badge={b.label} tone={b.tone} />; })()}
            {(() => { const b = badgeFor("supplier"); return <Kpi label="Supplier confidence" value={formatPct(k.supplier_confidence_pct)} badge={b.label} tone={b.tone} />; })()}
            {(() => { const b = badgeFor("subs"); return <Kpi label="Subs annualized" value={formatMoneyMinor(k.subscriptions_annualized_minor)} badge={b.label} tone={b.tone} />; })()}
            {(() => { const b = badgeFor("refund"); return <Kpi label="Next VAT refund (est)" value={formatMoneyMinor(k.estimated_next_vat_refund_minor)} badge={b.label} tone={b.tone} />; })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, badge, tone }: { label: string; value: string; badge: string; tone: "default" | "secondary" | "destructive" | "outline" }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <Badge variant={tone} className="mt-1 text-[10px]">{badge}</Badge>
    </div>
  );
}