import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type SupplierRule = {
  supplier_id: string;
  acceptance_rate: number;
  avg_amount_delta_minor: number;
  avg_date_delta_days: number;
  suggested_amount_tolerance_minor: number;
  suggested_date_tolerance_days: number;
  sample_size: number;
};

type Resp = {
  ok: boolean;
  updated_supplier_rules: number;
  total_matches_considered: number;
  supplier_rules: SupplierRule[];
  recent_anomaly_status_counts: Record<string, number>;
  reasoning: string;
};

export function AnomalyLearningMonitorPanel({ entityId: _ }: { entityId: string | null }) {
  const [d, setD] = useState<Resp | null>(null);
  const [running, setRunning] = useState(false);

  const fetchExisting = useCallback(async () => {
    // Show previously learned rules
    const { data } = await supabase.from("finance_supplier_memory")
      .select("supplier_id,rule_value,confidence,updated_at")
      .eq("rule_key", "anomaly_weights")
      .order("updated_at", { ascending: false }).limit(20);
    if (data) {
      setD({
        ok: true,
        updated_supplier_rules: data.length,
        total_matches_considered: 0,
        supplier_rules: data.map((r: any) => ({ supplier_id: r.supplier_id, ...(r.rule_value ?? {}) })),
        recent_anomaly_status_counts: {},
        reasoning: "Loaded from finance_supplier_memory (rule_key='anomaly_weights').",
      });
    }
  }, []);

  useEffect(() => { void fetchExisting(); }, [fetchExisting]);

  const run = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("finance-anomaly-learn", { body: {} });
    setRunning(false);
    if (error) return toast.error(`Learning failed: ${error.message}`);
    setD(data as Resp);
    toast.success(`Learned ${(data as Resp).updated_supplier_rules} rule(s)`);
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Anomaly Learning Monitor</CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={run} disabled={running}>
            <Play className="h-3 w-3 mr-1" /> Learn from corrections
          </Button>
          <Button size="sm" variant="ghost" onClick={fetchExisting} disabled={running}><RefreshCw className={`h-3 w-3 ${running ? "animate-spin" : ""}`} /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!d ? <div className="text-sm text-muted-foreground">No learned rules yet. Click “Learn from corrections”.</div> : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{d.updated_supplier_rules} supplier rules</Badge>
              {d.total_matches_considered > 0 && <Badge variant="outline">{d.total_matches_considered} matches considered</Badge>}
              {Object.entries(d.recent_anomaly_status_counts).map(([k, v]) => (
                <Badge key={k} variant="secondary">{k}: {v}</Badge>
              ))}
              <Badge variant="secondary">Versioned · Reversible</Badge>
            </div>
            {d.supplier_rules.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">Supplier</th><th className="text-right pr-3">Acceptance</th><th className="text-right pr-3">Avg Δ€</th><th className="text-right pr-3">Avg Δd</th><th className="text-right pr-3">Tol €</th><th className="text-right pr-3">Tol d</th><th className="text-right">N</th></tr></thead>
                  <tbody>
                    {d.supplier_rules.map((r) => (
                      <tr key={r.supplier_id} className="border-t">
                        <td className="py-1 pr-3 truncate max-w-[220px]" title={r.supplier_id}>{r.supplier_id.slice(0, 8)}…</td>
                        <td className="text-right pr-3">{r.acceptance_rate != null ? `${Math.round(r.acceptance_rate * 100)}%` : "—"}</td>
                        <td className="text-right pr-3 tabular-nums">{r.avg_amount_delta_minor != null ? (r.avg_amount_delta_minor / 100).toFixed(2) : "—"}</td>
                        <td className="text-right pr-3 tabular-nums">{r.avg_date_delta_days ?? "—"}</td>
                        <td className="text-right pr-3 tabular-nums">{r.suggested_amount_tolerance_minor != null ? (r.suggested_amount_tolerance_minor / 100).toFixed(2) : "—"}</td>
                        <td className="text-right pr-3 tabular-nums">{r.suggested_date_tolerance_days ?? "—"}</td>
                        <td className="text-right tabular-nums">{r.sample_size ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{d.reasoning}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}