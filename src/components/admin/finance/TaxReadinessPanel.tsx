import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Landmark, RefreshCw, AlertTriangle, CheckCircle2, Info } from "lucide-react";

type Light = "green" | "amber" | "red";

type Readiness = {
  ok: boolean;
  period: { year: number; quarter: number; start: string; end: string };
  invoices_imported: number;
  invoices_matched: number;
  receipts_imported: number;
  transactions_imported: number;
  transactions_matched: number;
  vat: {
    recoverable_minor: number;
    reverse_charge_minor: number;
    import_vat_minor: number;
    non_deductible_minor: number;
    potential_minor: number;
    missing_vat_docs: number;
  };
  missing_invoices: number;
  missing_receipts: number;
  confidence_score: number;
  readiness_pct: number;
  traffic_lights: Record<string, Light>;
};

const fmtEUR = (m: number | null | undefined) =>
  m == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(m / 100);

const lightClass = (l: Light | undefined) =>
  l === "green" ? "bg-emerald-500" : l === "amber" ? "bg-amber-500" : l === "red" ? "bg-red-500" : "bg-slate-400";

const statusLabel = (readiness: number) =>
  readiness >= 90 ? { label: "Verified", tone: "text-emerald-600", Icon: CheckCircle2 }
  : readiness >= 70 ? { label: "Needs Review", tone: "text-amber-600", Icon: Info }
  : { label: "Missing Evidence", tone: "text-red-600", Icon: AlertTriangle };

export function TaxReadinessPanel({ entityId }: { entityId: string | null }) {
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("finance-tax-readiness", {
      body: { entity_id: entityId && entityId !== "all" ? entityId : null },
    });
    if (error) setErr(error.message);
    else setData(data as Readiness);
    setLoading(false);
  }, [entityId]);

  useEffect(() => { void load(); }, [load]);

  const p = data?.period;
  const st = data ? statusLabel(data.readiness_pct) : null;
  const StIcon = st?.Icon;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Tax Readiness Center
          </CardTitle>
          {p && <Badge variant="outline">{p.year} · Q{p.quarter}</Badge>}
          {st && StIcon && (
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${st.tone}`}>
              <StIcon className="h-3 w-3" /> {st.label}
            </span>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {err && <div className="text-sm text-red-600">{err}</div>}

        {data && (
          <>
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-muted-foreground">Overall readiness</span>
                <span className="font-semibold">{data.readiness_pct}%</span>
              </div>
              <Progress value={data.readiness_pct} className="h-2" />
            </div>

            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <TrafficCell label="Invoices matched" light={data.traffic_lights.invoices_matched}
                value={`${data.invoices_matched}/${data.invoices_imported}`} />
              <TrafficCell label="Transactions matched" light={data.traffic_lights.transactions_matched}
                value={`${data.transactions_matched}/${data.transactions_imported}`} />
              <TrafficCell label="VAT completeness" light={data.traffic_lights.vat_completeness}
                value={data.vat.missing_vat_docs === 0 ? "Complete" : `${data.vat.missing_vat_docs} missing`} />
              <TrafficCell label="Evidence confidence" light={data.traffic_lights.evidence_confidence}
                value={`${data.confidence_score}%`} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <VatRow label="Recoverable VAT" value={fmtEUR(data.vat.recoverable_minor)} />
              <VatRow label="Reverse-charge VAT" value={fmtEUR(data.vat.reverse_charge_minor)} />
              <VatRow label="Import VAT" value={fmtEUR(data.vat.import_vat_minor)} />
              <VatRow label="Non-deductible VAT" value={fmtEUR(data.vat.non_deductible_minor)} />
              <VatRow label="Potential VAT" value={fmtEUR(data.vat.potential_minor)} />
              <VatRow label="Docs missing VAT" value={String(data.vat.missing_vat_docs)}
                tone={data.vat.missing_vat_docs > 0 ? "text-amber-600" : undefined} />
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={data.missing_invoices ? "destructive" : "outline"}>
                {data.missing_invoices} missing invoices
              </Badge>
              <Badge variant={data.missing_receipts ? "destructive" : "outline"}>
                {data.missing_receipts} missing receipts
              </Badge>
              <Badge variant="secondary">Prepares bookkeeping — never files returns automatically</Badge>
            </div>
          </>
        )}
        {!data && !loading && !err && (
          <div className="text-sm text-muted-foreground">No data yet.</div>
        )}
      </CardContent>
    </Card>
  );
}

function TrafficCell({ label, value, light }: { label: string; value: string; light: Light }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${lightClass(light)}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function VatRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between rounded border px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-medium tabular-nums ${tone ?? ""}`}>{value}</span>
    </div>
  );
}