import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitMerge, PlayCircle, Check, X } from "lucide-react";
import { toast } from "sonner";
import { humanizeReconciliationReasoning, humanizeReconciliationSignals, formatMoneyMinor } from "@/lib/finance/format";

type Match = {
  id: string; invoice_document_id: string | null; payment_id: string | null;
  match_type: string; match_status: string; confidence: number;
  amount_delta_minor: number | null; date_delta_days: number | null;
  match_signals: any; reasoning: string | null; created_at: string;
};

function badgeFor(s: string) {
  if (s === "accepted") return "default" as const;
  if (s === "rejected") return "destructive" as const;
  if (s === "superseded") return "outline" as const;
  return "secondary" as const;
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
      match_status: status, reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    await load();
  }, [load]);

  const proposed = rows.filter(r => r.match_status === "proposed").length;
  const accepted = rows.filter(r => r.match_status === "accepted").length;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitMerge className="h-4 w-4" /> Reconciliation Center
          <Badge variant="secondary">{proposed} to review</Badge>
          <Badge variant="outline">{accepted} accepted</Badge>
        </CardTitle>
        <Button size="sm" onClick={runRecon} disabled={running}>
          <PlayCircle className={`h-3 w-3 mr-1 ${running ? "animate-pulse" : ""}`} /> Run reconciliation
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? <div className="text-sm text-muted-foreground">Loading…</div>
         : rows.length === 0 ? <div className="text-sm text-muted-foreground">No matches yet. Click Run reconciliation.</div>
         : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Type</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3 text-right">Confidence</th>
                <th className="py-1 pr-3 text-right">Δ amount</th>
                <th className="py-1 pr-3 text-right">Δ days</th>
                <th className="py-1 pr-3">Why</th>
                <th className="py-1"></th>
              </tr></thead>
              <tbody>{rows.map(r => (
                <tr key={r.id} className="border-t align-top">
                  <td className="py-1 pr-3">{r.match_type}</td>
                  <td className="py-1 pr-3"><Badge variant={badgeFor(r.match_status)}>{r.match_status}</Badge></td>
                  <td className="py-1 pr-3 text-right">{Number(r.confidence).toFixed(0)}</td>
                  <td className="py-1 pr-3 text-right">{r.amount_delta_minor != null ? formatMoneyMinor(r.amount_delta_minor) : "—"}</td>
                  <td className="py-1 pr-3 text-right">{r.date_delta_days ?? "—"}</td>
                  <td className="py-1 pr-3 text-xs text-muted-foreground max-w-[420px]">
                    {(() => {
                      const h = humanizeReconciliationReasoning(r.reasoning);
                      const bullets = h.bullets.length > 0 ? h.bullets : humanizeReconciliationSignals(r.match_signals);
                      return (
                        <div className="space-y-1">
                          <div>{h.summary}</div>
                          {bullets.length > 0 && (
                            <ul className="list-none space-y-0.5">
                              {bullets.slice(0, 6).map((b, i) => (
                                <li key={i} className="tabular-nums">{b}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-1 whitespace-nowrap">
                    {r.match_status === "proposed" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => decide(r.id, "accepted")}><Check className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => decide(r.id, "rejected")}><X className="h-3 w-3" /></Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}