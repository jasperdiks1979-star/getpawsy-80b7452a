/**
 * Phase 1 — Autonomous Connector Ecosystem.
 * Pure view over finance-connector-health. Predictions are always labelled
 * "Estimated"; nothing here fabricates invoices or VAT.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlugZap, RefreshCw } from "lucide-react";
import { formatMoneyMinor } from "@/lib/finance/format";
import { ResponsiveTable, type Column } from "./shared/ResponsiveTable";
import { StatusBadge } from "./shared/StatusBadge";
import { ExplainPopover } from "./shared/ExplainPopover";
import type { FinanceStatus } from "@/lib/finance/state/types";

type Row = {
  supplier_slug: string;
  display_name: string;
  connection_method: string;
  status: string;
  cadence_days: number | null;
  last_invoice_at: string | null;
  expected_next_invoice_at: string | null;
  overdue_days: number | null;
  missing_invoices_predicted: number;
  verdict: "Healthy" | "Overdue" | "Silent" | "Unconfigured" | "Error";
  reasons: string[];
  invoice_count: number;
  avg_invoice_minor: number | null;
  currency: string | null;
};

const VERDICT_STATUS: Record<Row["verdict"], FinanceStatus> = {
  Healthy: "Verified",
  Overdue: "Needs Review",
  Silent: "Waiting Evidence",
  Unconfigured: "No Activity",
  Error: "Missing Evidence",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function ConnectorHealthPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("finance-connector-health", { body: {} });
    if (data?.ok) {
      setRows((data.connectors ?? []) as Row[]);
      setSummary(data.summary);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const columns: Column<Row>[] = [
    {
      key: "name", header: "Supplier", primary: true,
      cell: (r) => (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{r.display_name}</span>
          <StatusBadge status={VERDICT_STATUS[r.verdict]} className="text-[10px]" />
          <Badge variant="outline" className="text-[10px]">{r.connection_method}</Badge>
        </div>
      ),
    },
    {
      key: "verdict", header: "Health",
      cell: (r) => (
        <div className="flex items-center gap-1">
          <span>{r.verdict}</span>
          <ExplainPopover
            title={`${r.display_name} — ${r.verdict}`}
            explanation={
              r.verdict === "Healthy" ? "Invoices arrive on the expected cadence." :
              r.verdict === "Overdue" ? "An invoice is later than the observed cadence would predict. This is an estimate; no invoice has been fabricated." :
              r.verdict === "Silent" ? "This supplier is defined but no invoice has ever been uploaded." :
              r.verdict === "Unconfigured" ? "Connector is not yet configured and no evidence exists." :
              "The connector reports an error state."
            }
            bullets={r.reasons}
          />
        </div>
      ),
    },
    { key: "cadence", header: "Cadence", align: "right", cell: (r) => (r.cadence_days ? `${r.cadence_days}d` : "—") },
    { key: "last", header: "Last invoice", cell: (r) => fmtDate(r.last_invoice_at) },
    { key: "next", header: "Expected next", cell: (r) => fmtDate(r.expected_next_invoice_at) },
    {
      key: "missing", header: "Predicted missing", align: "right",
      cell: (r) =>
        r.missing_invoices_predicted > 0 ? (
          <div className="flex items-center justify-end gap-1">
            <span>{r.missing_invoices_predicted}</span>
            <Badge variant="secondary" className="text-[10px]">Estimated</Badge>
          </div>
        ) : "—",
    },
    {
      key: "avg", header: "Avg invoice", align: "right",
      cell: (r) => (r.avg_invoice_minor ? formatMoneyMinor(r.avg_invoice_minor, r.currency ?? "EUR") : "—"),
    },
    { key: "count", header: "Invoices", align: "right", cell: (r) => r.invoice_count },
  ];

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <PlugZap className="h-4 w-4" /> Autonomous Connector Health
          {summary && (
            <>
              <Badge variant="secondary">{summary.healthy}/{summary.total} healthy</Badge>
              {summary.overdue > 0 && <Badge variant="destructive">{summary.overdue} overdue</Badge>}
              {summary.total_predicted_missing_invoices > 0 && (
                <Badge variant="outline">~{summary.total_predicted_missing_invoices} missing invoices (Estimated)</Badge>
              )}
            </>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Recompute
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-2">
          Every prediction is derived from observed cadence and existing evidence only.
          No invoice, payment or VAT is ever fabricated.
        </p>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ResponsiveTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.supplier_slug}
            empty="No connectors defined."
          />
        )}
      </CardContent>
    </Card>
  );
}
