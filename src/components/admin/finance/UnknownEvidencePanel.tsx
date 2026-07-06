/**
 * Phase 9 — Unknown Elimination.
 * Lists evidence documents that still have no confirmed supplier and shows the
 * highest-confidence LIKELY supplier from finance-evidence-discover, plus the
 * reasons. Never invents a supplier: rows below the auto-assign threshold stay
 * "Estimated" until a human or a higher-confidence signal confirms.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Wand2, Check, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveTable, type Column } from "./shared/ResponsiveTable";
import { StatusBadge } from "./shared/StatusBadge";
import { ExplainPopover } from "./shared/ExplainPopover";
import type { FinanceStatus } from "@/lib/finance/state/types";

type Candidate = { supplier_id: string; supplier_name: string; confidence: number; reasons: string[] };
type Result = { document_id: string; title?: string | null; verdict: "Verified" | "Estimated" | "Missing Evidence"; top: Candidate | null; candidates: Candidate[] };

function verdictStatus(v: Result["verdict"]): FinanceStatus {
  return v === "Verified" ? "Verified" : v === "Estimated" ? "Estimated" : "Missing Evidence";
}

export function UnknownEvidencePanel() {
  const [rows, setRows] = useState<Result[]>([]);
  const [summary, setSummary] = useState<{ scanned: number; auto_assigned: number; predictions_stored: number; unresolved: number; auto_assign_threshold: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async (persist = false) => {
    setLoading(true);
    const { data } = await supabase.functions.invoke("finance-evidence-discover", {
      body: { dry_run: !persist, limit: 100 },
    });
    if (data?.ok) {
      setRows((data.results ?? []) as Result[]);
      setSummary({
        scanned: data.scanned, auto_assigned: data.auto_assigned,
        predictions_stored: data.predictions_stored, unresolved: data.unresolved,
        auto_assign_threshold: data.auto_assign_threshold,
      });
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(false); }, [load]);

  const applyAll = useCallback(async () => {
    setRunning(true);
    await load(true);
    setRunning(false);
    toast.success("Discovery predictions written to evidence metadata");
  }, [load]);

  const assignOne = useCallback(async (docId: string, supplierId: string, supplierName: string) => {
    // Fetch existing metadata to merge (avoid clobber).
    const { data: doc } = await supabase.from("evidence_documents").select("metadata").eq("id", docId).maybeSingle();
    const meta = { ...((doc?.metadata as any) ?? {}), supplier_source: "human", human_assigned_at: new Date().toISOString() };
    const { error } = await supabase.from("evidence_documents")
      .update({ supplier_id: supplierId, supplier_name: supplierName, metadata: meta })
      .eq("id", docId);
    if (error) toast.error(error.message);
    else { toast.success(`Assigned to ${supplierName}`); setRows((r) => r.filter((x) => x.document_id !== docId)); }
  }, []);

  const rejectOne = useCallback(async (docId: string) => {
    const { data: doc } = await supabase.from("evidence_documents").select("metadata").eq("id", docId).maybeSingle();
    const meta = { ...((doc?.metadata as any) ?? {}), likely_supplier: null, discovery_rejected_at: new Date().toISOString(), supplier_source: "human" };
    await supabase.from("evidence_documents").update({ metadata: meta }).eq("id", docId);
    setRows((r) => r.filter((x) => x.document_id !== docId));
    toast.success("Prediction rejected — will not be auto-assigned.");
  }, []);

  const columns: Column<Result>[] = useMemo(() => [
    {
      key: "doc", header: "Document", primary: true,
      cell: (r) => (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate max-w-[220px]">{r.title || r.document_id.slice(0, 8)}</span>
          <StatusBadge status={verdictStatus(r.verdict)} className="text-[10px]" />
        </div>
      ),
    },
    {
      key: "likely", header: "Likely supplier",
      cell: (r) => r.top ? (
        <div className="flex items-center gap-1 flex-wrap">
          <span>Likely {r.top.supplier_name}</span>
          <Badge variant="secondary" className="text-[10px]">{r.top.confidence}%</Badge>
          <ExplainPopover
            title={`Why ${r.top.supplier_name}?`}
            explanation="Signals extracted from the uploaded document. No financial value is inferred."
            bullets={r.top.reasons}
          />
        </div>
      ) : <span className="text-muted-foreground">No candidate matched. Manual review needed.</span>,
    },
    {
      key: "alt", header: "Alternatives",
      cell: (r) => r.candidates.length > 1 ? (
        <span className="text-xs text-muted-foreground">
          {r.candidates.slice(1).map((c) => `${c.supplier_name} (${c.confidence}%)`).join(" · ")}
        </span>
      ) : "—",
    },
  ], []);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Search className="h-4 w-4" /> Unknown Evidence — Discovery
          {summary && (
            <>
              <Badge variant="secondary">{summary.scanned} scanned</Badge>
              {summary.auto_assigned > 0 && <Badge>{summary.auto_assigned} auto-assigned</Badge>}
              {summary.unresolved > 0 && <Badge variant="destructive">{summary.unresolved} unresolved</Badge>}
            </>
          )}
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => load(false)} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Preview
          </Button>
          <Button size="sm" onClick={applyAll} disabled={running}>
            <Wand2 className={`h-3 w-3 mr-1 ${running ? "animate-pulse" : ""}`} /> Apply discovery
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-2">
          Auto-assignment threshold: {summary?.auto_assign_threshold ?? 95}%. Predictions below this stay labelled
          "Estimated" and require confirmation. Human-corrected records are never overwritten.
        </p>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ResponsiveTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.document_id}
            empty="Every uploaded document has a confirmed supplier. Nothing to review."
            actions={(r) => r.top ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => assignOne(r.document_id, r.top!.supplier_id, r.top!.supplier_name)}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => rejectOne(r.document_id)}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : null}
          />
        )}
      </CardContent>
    </Card>
  );
}
