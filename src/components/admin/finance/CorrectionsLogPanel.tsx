import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";

type Correction = {
  id: string;
  entity_type: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  applied_to_memory: boolean;
  reverted: boolean;
  created_at: string;
  supplier_id: string | null;
  document_id: string | null;
};

export function CorrectionsLogPanel() {
  const [rows, setRows] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("finance-corrections-log", { body: { action: "list", limit: 100 } });
    if (!error) setRows(((data as any)?.corrections ?? []) as Correction[]);
    setLoading(false);
  }, []);

  const revert = async (id: string) => {
    const { error } = await supabase.functions.invoke("finance-corrections-log", { body: { action: "revert", id } });
    if (error) toast.error(String(error)); else { toast.success("Reverted"); load(); }
  };

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" /> Corrections Log
          <Badge variant="outline" className="ml-2">D4</Badge>
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No corrections recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 pr-3">When</th><th className="pr-3">Type</th><th className="pr-3">Field</th><th className="pr-3">Old → New</th><th className="pr-3">Reason</th><th className="pr-3">State</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="py-1 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="pr-3">{r.entity_type}</td>
                    <td className="pr-3 font-mono">{r.field}</td>
                    <td className="pr-3 max-w-[280px] truncate">{JSON.stringify(r.old_value)} → {JSON.stringify(r.new_value)}</td>
                    <td className="pr-3 max-w-[220px] truncate">{r.reason ?? "—"}</td>
                    <td className="pr-3">
                      {r.reverted ? <Badge variant="destructive">reverted</Badge>
                        : r.applied_to_memory ? <Badge>learned</Badge>
                        : <Badge variant="secondary">pending</Badge>}
                    </td>
                    <td className="pr-3">
                      {!r.reverted && (
                        <Button size="sm" variant="outline" onClick={() => revert(r.id)}>
                          <Undo2 className="h-3 w-3 mr-1" /> Revert
                        </Button>
                      )}
                    </td>
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