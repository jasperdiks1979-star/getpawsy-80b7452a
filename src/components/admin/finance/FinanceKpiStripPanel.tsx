import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gauge, RefreshCw } from "lucide-react";

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

const fmt = (m: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(m / 100);

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

  const readinessTone = (p: number) => p >= 85 ? "default" : p >= 65 ? "secondary" : "destructive";

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> Finance KPI Strip {k && <Badge variant="outline">{k.period.year} Q{k.period.quarter}</Badge>}</CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {!k ? <div className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data."}</div> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <Kpi label="Recoverable VAT" value={fmt(k.recoverable_vat_minor)} badge="Verified" tone="default" />
            <Kpi label="Tax readiness" value={`${k.tax_readiness_pct}%`} badge={k.tax_readiness_pct >= 85 ? "Verified" : k.tax_readiness_pct >= 65 ? "Needs Review" : "Missing Evidence"} tone={readinessTone(k.tax_readiness_pct)} />
            <Kpi label="Evidence completeness" value={`${k.evidence_completeness_pct}%`} badge="Estimated" tone="secondary" />
            <Kpi label="Unmatched payments" value={String(k.unmatched_payments)} badge={k.unmatched_payments ? "Needs Review" : "Verified"} tone={k.unmatched_payments ? "secondary" : "default"} />
            <Kpi label="Missing invoices" value={String(k.missing_invoices)} badge={k.missing_invoices ? "Missing Evidence" : "Verified"} tone={k.missing_invoices ? "destructive" : "default"} />
            <Kpi label="Supplier confidence" value={`${k.supplier_confidence_pct}%`} badge="Estimated" tone="secondary" />
            <Kpi label="Subs annualized" value={fmt(k.subscriptions_annualized_minor)} badge="Estimated" tone="secondary" />
            <Kpi label="Next VAT refund (est)" value={fmt(k.estimated_next_vat_refund_minor)} badge="Estimated" tone="secondary" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, badge, tone }: { label: string; value: string; badge: string; tone: "default" | "secondary" | "destructive" }) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <Badge variant={tone} className="mt-1 text-[10px]">{badge}</Badge>
    </div>
  );
}