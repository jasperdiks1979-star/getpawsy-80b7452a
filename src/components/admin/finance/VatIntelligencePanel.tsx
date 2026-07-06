/**
 * Phase 6 — VAT Intelligence.
 * Reads finance-vat-intelligence: splits VAT into Recoverable / Potential /
 * Blocked / Missing Evidence, with reasons. No writes, no fabrication.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calculator, RefreshCw } from "lucide-react";
import { formatMoneyMinor } from "@/lib/finance/format";
import { StatusBadge } from "./shared/StatusBadge";
import { ExplainPopover } from "./shared/ExplainPopover";
import type { FinanceStatus } from "@/lib/finance/state/types";

type Resp = {
  ok: boolean;
  buckets: {
    recoverable_minor: number;
    potential_minor: number;
    blocked_minor: number;
    missing_evidence_minor: number;
  };
  total_minor: number;
  classification_coverage_pct: number;
  counts: { financial_documents: number; classified: number; missing_evidence_documents: number };
  reasons: { potential: Record<string, number>; blocked: Record<string, number> };
};

export function VatIntelligencePanel({ entityId }: { entityId: string | null }) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res } = await supabase.functions.invoke("finance-vat-intelligence", {
      body: { entity_id: entityId },
    });
    setData(res as Resp);
    setLoading(false);
  }, [entityId]);
  useEffect(() => { void load(); }, [load]);

  const cells: Array<{ label: string; minor: number; status: FinanceStatus; explanation: string; reasons?: Record<string, number> }> = data ? [
    { label: "Recoverable now", minor: data.buckets.recoverable_minor, status: "Verified", explanation: "Classified 21%/9%/import VAT with confidence ≥70%. Ready for the Belastingdienst filing package." },
    { label: "Potential (unblock evidence)", minor: data.buckets.potential_minor, status: "Estimated", explanation: "VAT that could become recoverable once classification confidence rises or reasons below are resolved.", reasons: data.reasons.potential },
    { label: "Blocked (structural)", minor: data.buckets.blocked_minor, status: "Needs Review", explanation: "VAT that will not be recovered by design: reverse-charge, outside-EU, private use, or 0/no-VAT rows.", reasons: data.reasons.blocked },
    { label: "Missing Evidence", minor: data.buckets.missing_evidence_minor, status: "Missing Evidence", explanation: "Theoretical NL 21% cap on financial documents with no VAT figure and no classification. Re-upload the invoice or receipt." },
  ] : [];

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Calculator className="h-4 w-4" /> VAT Intelligence
          {data && (
            <>
              <Badge variant="outline">{data.counts.classified}/{data.counts.financial_documents} classified</Badge>
              <Badge variant={data.classification_coverage_pct >= 80 ? "secondary" : "destructive"}>
                {data.classification_coverage_pct}% coverage
              </Badge>
            </>
          )}
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !data ? (
          <div className="text-sm text-muted-foreground col-span-full">Loading…</div>
        ) : cells.map((c) => (
          <div key={c.label} className="rounded-md border p-3 space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              {c.label}
              <ExplainPopover
                title={c.label}
                explanation={c.explanation}
                bullets={c.reasons ? Object.entries(c.reasons).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v} doc${v === 1 ? "" : "s"}`) : undefined}
              />
            </div>
            <div className="text-lg font-semibold tabular-nums">{formatMoneyMinor(c.minor)}</div>
            <StatusBadge status={c.status} className="text-[10px]" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}