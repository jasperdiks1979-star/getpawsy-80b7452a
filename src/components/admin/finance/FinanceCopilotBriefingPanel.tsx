import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, ShieldCheck } from "lucide-react";

type Action = {
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  detail: string;
  source: string;
};

type Briefing = {
  generated_at: string;
  health: {
    score: number | null;
    grade: string | null;
    reason: string | null;
    top_weak_signals: Array<{ key: string; label: string; score: number; reason: string; action?: string }>;
  } | null;
  totals: Record<string, number>;
  recommended_actions: Action[];
  readiness: { can_export_accountant: boolean; can_reclaim_vat: boolean; blockers: string[] };
};

const priColor: Record<Action["priority"], string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-slate-500 text-white",
};

export function FinanceCopilotBriefingPanel({ entityId }: { entityId: string | null }) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [certifying, setCertifying] = useState(false);
  const [certReport, setCertReport] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("finance-copilot-briefing", {
        body: { entity_id: entityId },
      });
      if (error) throw error;
      setBriefing(data?.briefing ?? null);
    } catch (e) {
      console.error("[copilot-briefing]", e);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => { void load(); }, [load]);

  const runCertify = useCallback(async () => {
    setCertifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("finance-production-certify", {
        body: { entity_id: entityId },
      });
      if (error) throw error;
      setCertReport(data?.report ?? null);
    } catch (e) {
      console.error("[production-certify]", e);
    } finally {
      setCertifying(false);
    }
  }, [entityId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Finance Copilot Briefing
          {briefing?.health?.grade && (
            <Badge variant="outline">Health {briefing.health.score}/100 · {briefing.health.grade}</Badge>
          )}
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={runCertify} disabled={certifying}>
            <ShieldCheck className="h-3 w-3 mr-1" />
            {certifying ? "Certifying…" : "Run Production Certification"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !briefing ? (
          <div className="text-sm text-muted-foreground">Loading briefing…</div>
        ) : briefing ? (
          <>
            {/* Readiness */}
            <div className="flex flex-wrap gap-2">
              <Badge variant={briefing.readiness.can_export_accountant ? "outline" : "destructive"}>
                Accountant export {briefing.readiness.can_export_accountant ? "READY" : "BLOCKED"}
              </Badge>
              <Badge variant={briefing.readiness.can_reclaim_vat ? "outline" : "secondary"}>
                VAT reclaim {briefing.readiness.can_reclaim_vat ? "READY" : "PENDING"}
              </Badge>
              {briefing.readiness.blockers.map((b) => (
                <Badge key={b} variant="destructive">{b}</Badge>
              ))}
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
              {Object.entries(briefing.totals).map(([k, v]) => (
                <div key={k} className="rounded-md border p-2">
                  <div className="text-muted-foreground">{k.replace(/_/g, " ")}</div>
                  <div className="text-lg font-semibold">{v}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            {briefing.recommended_actions.length > 0 ? (
              <div>
                <div className="text-xs font-medium mb-2">Prioritized actions ({briefing.recommended_actions.length})</div>
                <ul className="space-y-2">
                  {briefing.recommended_actions.slice(0, 8).map((a, i) => (
                    <li key={i} className="flex items-start gap-2 border rounded-md p-2">
                      <Badge className={priColor[a.priority]}>{a.priority}</Badge>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{a.title}</div>
                        <div className="text-xs text-muted-foreground">{a.detail}</div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">{a.category} · {a.source}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No recommended actions — finance state is clean.</div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No briefing available.</div>
        )}

        {/* Certification report */}
        {certReport && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <div className="text-sm font-medium">Production certification</div>
              <Badge variant={certReport.overall_verdict === "PASS" ? "outline" : certReport.overall_verdict === "FAIL" ? "destructive" : "secondary"}>
                {certReport.overall_verdict}
              </Badge>
              {certReport.overall_score != null && (
                <Badge variant="outline">{certReport.overall_score}/100</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(certReport.generated_at).toLocaleString()} · {certReport.duration_ms}ms
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">Category</th>
                  <th className="py-1 pr-3">Verdict</th>
                  <th className="py-1 pr-3 text-right">Score</th>
                  <th className="py-1">Remaining actions</th>
                </tr></thead>
                <tbody>{certReport.categories.map((c: any) => (
                  <tr key={c.name} className="border-t align-top">
                    <td className="py-1 pr-3">{c.name}</td>
                    <td className="py-1 pr-3">
                      <Badge variant={c.verdict === "PASS" ? "outline" : c.verdict === "FAIL" ? "destructive" : "secondary"}>
                        {c.verdict}
                      </Badge>
                    </td>
                    <td className="py-1 pr-3 text-right">{c.score ?? "—"}</td>
                    <td className="py-1 text-muted-foreground">
                      {c.remaining_manual_actions.length === 0 ? "—" : (
                        <ul className="list-disc list-inside">
                          {c.remaining_manual_actions.map((a: string, i: number) => <li key={i}>{a}</li>)}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}