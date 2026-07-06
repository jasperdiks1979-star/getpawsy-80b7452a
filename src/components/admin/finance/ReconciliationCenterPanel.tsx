/**
 * Reconciliation Center — CFO-readable UX.
 * No score numbers, no raw JSON, no candidate counts as debug text.
 * Match quality is labelled: Exact Match / Strong Match / Needs Review.
 * Every check is a ticked criterion. "N candidates evaluated" is the only count.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitMerge, PlayCircle, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatMoneyMinor } from "@/lib/finance/format";
import { ResponsiveTable, type Column } from "./shared/ResponsiveTable";
import { StatusBadge } from "./shared/StatusBadge";
import type { FinanceStatus } from "@/lib/finance/state/types";

type Match = {
  id: string;
  invoice_document_id: string | null;
  payment_id: string | null;
  match_type: string;
  match_status: string;
  confidence: number;
  amount_delta_minor: number | null;
  date_delta_days: number | null;
  match_signals: any;
  reasoning: string | null;
  created_at: string;
};

const CRITERIA_LABELS: Record<string, string> = {
  currency: "Currency",
  amount: "Amount",
  amount_delta_minor: "Amount",
  supplier: "Supplier",
  reference: "Reference",
  invoice_number: "Invoice number",
  date: "Date",
  date_delta_days: "Date",
};

function matchQuality(confidence: number, deltaAmount: number | null, deltaDays: number | null): {
  label: "Exact Match" | "Strong Match" | "Partial Match" | "Needs Review";
  status: FinanceStatus;
} {
  const c = Number(confidence) || 0;
  const exact = c >= 99 && (deltaAmount ?? 0) === 0 && (deltaDays ?? 0) === 0;
  if (exact) return { label: "Exact Match", status: "Verified" };
  if (c >= 85) return { label: "Strong Match", status: "Estimated" };
  if (c >= 65) return { label: "Partial Match", status: "Needs Review" };
  return { label: "Needs Review", status: "Needs Review" };
}

function criteria(row: Match): string[] {
  const out: string[] = [];
  const s = (row.match_signals ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();
  for (const [key, raw] of Object.entries(s)) {
    const label = CRITERIA_LABELS[key];
    if (!label || seen.has(label)) continue;
    if (raw === true || (typeof raw === "number" && raw !== 0)) {
      out.push(`✓ ${label}`);
      seen.add(label);
    } else if (raw === false) {
      out.push(`✗ ${label}`);
      seen.add(label);
    }
  }
  if ((row.amount_delta_minor ?? 0) === 0 && !seen.has("Amount")) out.push("✓ Amount");
  if ((row.date_delta_days ?? 0) === 0 && !seen.has("Date")) out.push("✓ Date");
  return out;
}

function candidatesEvaluated(row: Match): number {
  const s = (row.match_signals ?? {}) as any;
  return Number(s?.candidates_evaluated ?? s?.candidates ?? s?.n_candidates ?? 0) || 0;
}

export function ReconciliationCenterPanel({ entityId }: { entityId: string | null }) {
  const [rows, setRows] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("finance_reconciliation_matches")
      .select("id,invoice_document_id,payment_id,match_type,match_status,confidence,amount_delta_minor,date_delta_days,match_signals,reasoning,created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data ?? []) as Match[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const runRecon = useCallback(async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("finance-reconcile-payments", {
      body: { entity_id: entityId && entityId !== "all" ? entityId : null },
    });
    setRunning(false);
    if (error) toast.error(error.message);
    else toast.success(`Reconciled: ${data?.autoAccepted ?? 0} accepted, ${data?.proposed ?? 0} proposed`);
    await load();
  }, [entityId, load]);

  const decide = useCallback(async (id: string, status: "accepted" | "rejected") => {
    await supabase.from("finance_reconciliation_matches").update({
      match_status: status,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    await load();
  }, [load]);

  const proposed = rows.filter((r) => r.match_status === "proposed").length;
  const accepted = rows.filter((r) => r.match_status === "accepted").length;

  const columns: Column<Match>[] = [
    {
      key: "quality",
      header: "Match",
      primary: true,
      cell: (r) => {
        const q = matchQuality(r.confidence, r.amount_delta_minor, r.date_delta_days);
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{q.label}</span>
            <StatusBadge status={q.status} className="text-[10px]" />
          </div>
        );
      },
    },
    { key: "type", header: "Type", cell: (r) => <span className="capitalize">{r.match_type.replace(/_/g, " ")}</span> },
    { key: "status", header: "Review", cell: (r) => <span className="capitalize">{r.match_status}</span> },
    {
      key: "amount",
      header: "Δ amount",
      align: "right",
      cell: (r) => (r.amount_delta_minor == null ? "—" : formatMoneyMinor(r.amount_delta_minor)),
    },
    {
      key: "days",
      header: "Δ days",
      align: "right",
      cell: (r) => (r.date_delta_days == null ? "—" : String(r.date_delta_days)),
    },
    {
      key: "matched",
      header: "Matched on",
      cell: (r) => {
        const items = criteria(r);
        const evaluated = candidatesEvaluated(r);
        return (
          <div className="space-y-1 text-xs">
            {items.length > 0 ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {items.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : (
              <div className="text-muted-foreground">No criteria recorded</div>
            )}
            {evaluated > 0 && (
              <div className="text-muted-foreground">
                {evaluated} candidate{evaluated === 1 ? "" : "s"} evaluated
              </div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <GitMerge className="h-4 w-4" /> Reconciliation Center
          <Badge variant="secondary">{proposed} to review</Badge>
          <Badge variant="outline">{accepted} accepted</Badge>
        </CardTitle>
        <Button size="sm" onClick={runRecon} disabled={running}>
          <PlayCircle className={`h-3 w-3 mr-1 ${running ? "animate-pulse" : ""}`} /> Run reconciliation
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ResponsiveTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            empty="No matches yet. Click Run reconciliation."
            actions={(r) =>
              r.match_status === "proposed" ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => decide(r.id, "accepted")}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => decide(r.id, "rejected")}>
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : null
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
