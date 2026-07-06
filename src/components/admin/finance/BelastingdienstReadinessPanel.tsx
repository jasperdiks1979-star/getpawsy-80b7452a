import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Landmark, RefreshCw } from "lucide-react";

type Resp = {
  ok: boolean;
  period: { year: number; quarter: number; start: string; end: string };
  totals: {
    recoverable_minor: number; reverse_charge_minor: number;
    import_vat_minor: number; non_deductible_minor: number; potential_minor: number;
  };
  counts: {
    invoices: number; receipts: number; payments: number;
    missing_invoices: number; missing_receipts: number;
    unmatched_payments: number; low_confidence_documents: number;
    vat_classifications: number;
  };
  readiness_pct: number;
  status: "ready" | "review" | "unsafe";
  disclaimer: string;
};

const fmt = (m: number | null | undefined) =>
  m == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(m / 100);

const statusBadge = (s: Resp["status"]) => {
  if (s === "ready") return { label: "Verified", variant: "default" as const };
  if (s === "review") return { label: "Needs Review", variant: "secondary" as const };
  return { label: "Missing Evidence", variant: "destructive" as const };
};

export function BelastingdienstReadinessPanel({ entityId }: { entityId: string | null }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("finance-belastingdienst-readiness", {
      body: { entity_id: entityId },
    });
    setData(data as Resp);
    setLoading(false);
  }, [entityId]);

  useEffect(() => { void load(); }, [load]);

  const st = data ? statusBadge(data.status) : null;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" /> Belastingdienst Readiness
          {data && <Badge variant="outline">{data.period.year} Q{data.period.quarter}</Badge>}
          {st && <Badge variant={st.variant}>{st.label}</Badge>}
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!data ? (
          <div className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data."}</div>
        ) : (
          <>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Readiness</span>
                <span className="font-semibold">{data.readiness_pct}%</span>
              </div>
              <Progress value={data.readiness_pct} className="h-2" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <Cell label="Recoverable VAT" value={fmt(data.totals.recoverable_minor)} />
              <Cell label="Reverse-charge" value={fmt(data.totals.reverse_charge_minor)} />
              <Cell label="Import VAT" value={fmt(data.totals.import_vat_minor)} />
              <Cell label="Non-deductible" value={fmt(data.totals.non_deductible_minor)} />
              <Cell label="Potential VAT" value={fmt(data.totals.potential_minor)} />
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={data.counts.missing_invoices ? "destructive" : "outline"}>{data.counts.missing_invoices} missing invoices</Badge>
              <Badge variant={data.counts.missing_receipts ? "destructive" : "outline"}>{data.counts.missing_receipts} missing receipts</Badge>
              <Badge variant={data.counts.unmatched_payments ? "destructive" : "outline"}>{data.counts.unmatched_payments} unmatched payments</Badge>
              <Badge variant={data.counts.low_confidence_documents ? "secondary" : "outline"}>{data.counts.low_confidence_documents} low-confidence docs</Badge>
              <Badge variant="outline">{data.counts.vat_classifications} VAT classifications</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
          </>
        )}
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