import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calculator, RefreshCw } from "lucide-react";
import { formatMoneyMinor, STATUS_VARIANT, type FinanceStatus } from "@/lib/finance/format";

type Period = {
  label: string;
  recoverable_minor: number;
  potential_minor: number;
  missing_evidence_impact_minor: number;
  confidence: number;
  assumptions: string[];
  calculation: string;
  status: "Verified" | "Estimated" | "Needs Review" | "Missing Evidence";
};

const fmt = (m: number) => formatMoneyMinor(m, "EUR", "No amount recorded");

function effectiveStatus(p: Period): FinanceStatus {
  // If we have no confidence and no recoverable amount, this is Waiting Evidence, not a status.
  if ((p.confidence ?? 0) <= 0 && p.recoverable_minor === 0 && p.potential_minor === 0) return "Pending";
  if (p.status === "Missing Evidence") return "Missing Evidence";
  return p.status as FinanceStatus;
}

export function VatRefundEstimatorPanel({ entityId }: { entityId: string | null }) {
  const [data, setData] = useState<{ current: Period; previous: Period; ytd: Period; projection: Period } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("finance-vat-refund-estimate", { body: { entity_id: entityId } });
    setData(data as any);
    setLoading(false);
  }, [entityId]);

  useEffect(() => { void load(); }, [load]);

  const cards: Period[] = data ? [data.current, data.previous, data.ytd, data.projection] : [];

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4" /> VAT Refund Estimator</CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.length === 0 && <div className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data."}</div>}
        {cards.map((p) => (
          <div key={p.label} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{p.label}</div>
              {(() => { const s = effectiveStatus(p); return <Badge variant={STATUS_VARIANT[s]}>{s === "Pending" ? "Waiting Evidence" : s}</Badge>; })()}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{fmt(p.recoverable_minor)}</div>
            <div className="text-xs text-muted-foreground">Potential {fmt(p.potential_minor)} · Missing impact {fmt(p.missing_evidence_impact_minor)}</div>
            <div className="text-xs">
              Confidence:{" "}
              <span className="font-medium">
                {(p.confidence ?? 0) > 0 ? `${Math.round(p.confidence * 100)}%` : "Waiting evidence"}
              </span>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Calculation & assumptions</summary>
              <div className="mt-1"><strong>Formula:</strong> {p.calculation}</div>
              <ul className="list-disc pl-4 mt-1">
                {p.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </details>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}