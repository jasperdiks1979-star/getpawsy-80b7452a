import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Activity, ExternalLink, Loader2 } from "lucide-react";

export default function ProofOfLifePanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function run() {
    if (!confirm("Run end-to-end proof-of-life test? Publishes 3 real pins to Pinterest.")) return;
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-proof-of-life", { body: {} });
      if (error) throw error;
      setResult(data);
      const ok = (data as any)?.success_count ?? 0;
      toast({ title: "Proof-of-life finished", description: `${ok}/${(data as any)?.total_attempted ?? 0} pins published.` });
    } catch (e: any) {
      toast({ title: "Test failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  const pins: any[] = result?.report?.pins ?? [];

  return (
    <Card className="mb-4 border-2 border-amber-300">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" /> Proof-of-Life End-to-End Test
          <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">ONE-TIME</Badge>
        </CardTitle>
        <Button size="sm" onClick={run} disabled={running}>
          {running ? (<><Loader2 className="h-3 w-3 animate-spin mr-2" />Running (~2.5 min)…</>) : "Run proof-of-life test"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="text-xs text-muted-foreground">
          Picks 3 already-approved premium drafts from distinct categories, assigns a production-verified
          board to each, and publishes via the Pinterest API. No rendering, no QA, no sleeps — target &lt; 30s.
          Verifies queue selection · board assignment · Pinterest API · URL routing.
        </div>
        {result && (
          <>
            <div className="rounded border p-2">
              <div className="text-xs font-medium mb-1">
                Result: {result.success_count}/{result.total_attempted} published
                {typeof result.runtime_ms === "number" ? ` · ${(result.runtime_ms / 1000).toFixed(1)}s` : ""}
              </div>
              {result.message && (
                <div className="text-xs text-amber-700">{result.message}</div>
              )}
            </div>
            {pins.length > 0 && (
              <div className="space-y-2">
                {pins.map((p, i) => (
                  <div key={i} className="rounded border p-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-xs">
                        {p.bucket}: {p.product_name ?? p.product?.name}
                      </div>
                      {p.published ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">PUBLISHED</Badge>
                      ) : (
                        <Badge variant="destructive">FAILED</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Board: {p.board_name ?? "—"} · Pin ID: {p.pinterest_pin_id ?? "—"}
                    </div>
                    {p.live_url && (
                      <a href={p.live_url} target="_blank" rel="noreferrer"
                         className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                        Open on Pinterest <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {!p.published && (
                      <div className="text-xs text-red-600 mt-1 break-words">
                        {p.error ?? p.publish_response?.message ?? p.publish_response?.stage ?? "see logs"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Raw report JSON</summary>
              <pre className="overflow-auto max-h-96 mt-2 p-2 bg-muted rounded">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}