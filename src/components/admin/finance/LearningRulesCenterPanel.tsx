import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Rule = {
  supplier_id: string;
  rule_key: string;
  rule_value: Record<string, unknown>;
  confidence: number;
  source: string | null;
  updated_at: string;
};

export function LearningRulesCenterPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("finance_supplier_memory")
      .select("supplier_id,rule_key,rule_value,confidence,source,updated_at")
      .order("updated_at", { ascending: false }).limit(100);
    setRules((data ?? []) as Rule[]);
  }, []);

  const runLearn = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("finance-learn-from-corrections", { body: {} });
    setBusy(false);
    if (error) toast.error(String(error));
    else { toast.success(`Promoted ${(data as any)?.promoted ?? 0} corrections`); load(); }
  };

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4" /> Learning Rules Center
          <Badge variant="outline" className="ml-2">D4</Badge>
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3 w-3" /></Button>
          <Button size="sm" onClick={runLearn} disabled={busy}><Play className="h-3 w-3 mr-1" /> Learn from corrections</Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-2">
          Human corrections override machine inference (confidence 1.0). Removing a rule row here reverts the learned behavior — nothing is destructive.
        </p>
        {rules.length === 0 ? (
          <div className="text-sm text-muted-foreground">No learned rules yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 pr-3">Updated</th><th className="pr-3">Supplier</th><th className="pr-3">Rule</th><th className="pr-3">Confidence</th><th className="pr-3">Source</th><th className="pr-3">Value</th></tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={`${r.supplier_id}-${r.rule_key}`} className="border-t align-top">
                    <td className="py-1 pr-3 whitespace-nowrap">{new Date(r.updated_at).toLocaleString()}</td>
                    <td className="pr-3 font-mono text-[10px]">{r.supplier_id.slice(0, 8)}…</td>
                    <td className="pr-3">{r.rule_key}</td>
                    <td className="pr-3">{Number(r.confidence ?? 0).toFixed(2)}</td>
                    <td className="pr-3">{r.source ?? "—"}</td>
                    <td className="pr-3 max-w-[360px] truncate font-mono text-[10px]">{JSON.stringify(r.rule_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}