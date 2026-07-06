import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListTodo, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  batch_id: string;
  source: string;
  source_filename: string | null;
  status: string;
  attempts: number;
  last_error: string | null;
  queued_at: string;
  finished_at: string | null;
};

export function ImportQueueMonitorPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.functions.invoke("finance-import-queue-worker", { body: { action: "status" } });
    setRows(((data as any)?.rows ?? []) as Row[]);
    setSummary(((data as any)?.summary ?? {}) as Record<string, number>);
  }, []);

  const process = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("finance-import-queue-worker", { body: { action: "process", batch_size: 10 } });
    setBusy(false);
    if (error) toast.error(String(error));
    else { toast.success(`Processed ${(data as any)?.processed ?? 0} items`); load(); }
  };

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ListTodo className="h-4 w-4" /> Import Queue Monitor
          <Badge variant="outline" className="ml-2">D4</Badge>
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3 w-3" /></Button>
          <Button size="sm" onClick={process} disabled={busy}><Play className="h-3 w-3 mr-1" /> Process next</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          {Object.entries(summary).map(([k, v]) => (
            <Badge key={k} variant="outline">{k}: {v}</Badge>
          ))}
          {Object.keys(summary).length === 0 && <span className="text-muted-foreground">No queued items yet.</span>}
        </div>
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 pr-3">Queued</th><th className="pr-3">File</th><th className="pr-3">Source</th><th className="pr-3">Status</th><th className="pr-3">Attempts</th><th className="pr-3">Error</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="py-1 pr-3 whitespace-nowrap">{new Date(r.queued_at).toLocaleString()}</td>
                    <td className="pr-3 max-w-[220px] truncate">{r.source_filename ?? "—"}</td>
                    <td className="pr-3">{r.source}</td>
                    <td className="pr-3">
                      <Badge variant={r.status === "success" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                    </td>
                    <td className="pr-3">{r.attempts}</td>
                    <td className="pr-3 max-w-[260px] truncate text-destructive">{r.last_error ?? ""}</td>
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