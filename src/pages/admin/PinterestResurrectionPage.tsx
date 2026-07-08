/**
 * Pinterest Resurrection — Flagship Proof.
 *
 * Read-only admin panel that (a) triggers the flagship resurrection edge
 * function, and (b) shows the generated draft candidates. Approval into the
 * live pinterest_pin_queue is intentionally not wired yet — this is a proof
 * gate. The user reviews here first.
 */
import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, PlayCircle, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Candidate = {
  id: string;
  bucket: string;
  proposed_title: string;
  proposed_board_name: string | null;
  us_audience_score: number | null;
  duplicate_risk: number | null;
  confidence_score: number | null;
  ctr_prediction: number | null;
  revenue_prediction: number | null;
  status: string;
  batch_id: string | null;
  created_at: string;
};

type RunResult = {
  ok: boolean;
  batch_id?: string;
  product_slug?: string;
  original_rejected?: number;
  resurrectable_pool?: number;
  bucket_counts?: Record<string, number>;
  candidates_generated?: number;
  candidates_surviving?: number;
  candidates_written?: number;
  error?: string;
  message?: string;
};

const FLAGSHIP_SLUG = "automatic-cat-litter-box-self-cleaning-app-control";

export default function PinterestResurrectionPage() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pinterest_resurrection_candidates")
      .select("id,bucket,proposed_title,proposed_board_name,us_audience_score,duplicate_risk,confidence_score,ctr_prediction,revenue_prediction,status,batch_id,created_at")
      .eq("product_slug", FLAGSHIP_SLUG)
      .order("confidence_score", { ascending: false })
      .limit(100);
    setCandidates((data ?? []) as Candidate[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-resurrect-flagship", { body: {} });
      if (error) throw error;
      const r = data as RunResult;
      setLastRun(r);
      if (r.ok) {
        toast({
          title: "Resurrection batch complete",
          description: `${r.candidates_written} draft candidates written (of ${r.candidates_generated} generated).`,
        });
      } else {
        toast({ title: "Resurrection failed", description: r.error ?? "unknown", variant: "destructive" });
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Resurrection failed", description: msg, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const totalRev = candidates.reduce((s, c) => s + (Number(c.revenue_prediction) || 0), 0);

  return (
    <>
      <Helmet><title>Pinterest Resurrection — Flagship | Admin</title></Helmet>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-display font-bold">Pinterest Resurrection — Flagship</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Draft-only regeneration for <code>{FLAGSHIP_SLUG}</code>. Nothing publishes automatically. Every approved candidate re-enters the certified queue and passes every gate again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              Run flagship resurrection
            </Button>
          </div>
        </div>

        {lastRun && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Last run</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Badge variant={lastRun.ok ? "default" : "destructive"}>{lastRun.ok ? "ok" : "failed"}</Badge>
                <Badge variant="outline">rejected pool: {lastRun.original_rejected ?? "—"}</Badge>
                <Badge variant="outline">resurrectable: {lastRun.resurrectable_pool ?? "—"}</Badge>
                <Badge variant="outline">generated: {lastRun.candidates_generated ?? "—"}</Badge>
                <Badge variant="outline">surviving ≥0.80: {lastRun.candidates_surviving ?? "—"}</Badge>
                <Badge variant="outline">written: {lastRun.candidates_written ?? "—"}</Badge>
              </div>
              {lastRun.bucket_counts && (
                <pre className="text-[10px] bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(lastRun.bucket_counts, null, 2)}</pre>
              )}
              {lastRun.error && <p className="text-destructive">{lastRun.error} — {lastRun.message}</p>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Draft candidates ({candidates.length})</CardTitle>
            <div className="text-xs text-muted-foreground">
              Est. revenue value (EV per impression): ${totalRev.toFixed(3)}
            </div>
          </CardHeader>
          <CardContent>
            {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!loading && candidates.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No candidates yet. Click <b>Run flagship resurrection</b> to generate the first batch.
              </p>
            )}
            {candidates.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground text-left">
                    <tr>
                      <th className="p-2">Title</th>
                      <th className="p-2">Bucket</th>
                      <th className="p-2">Board</th>
                      <th className="p-2 text-right">US</th>
                      <th className="p-2 text-right">Dup risk</th>
                      <th className="p-2 text-right">Confidence</th>
                      <th className="p-2 text-right">CTR pred</th>
                      <th className="p-2 text-right">Rev pred</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="p-2 max-w-[320px]">{c.proposed_title}</td>
                        <td className="p-2"><Badge variant="outline">{c.bucket}</Badge></td>
                        <td className="p-2 max-w-[180px] truncate">{c.proposed_board_name ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{c.us_audience_score?.toFixed(2) ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{c.duplicate_risk?.toFixed(2) ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums font-medium">{c.confidence_score?.toFixed(2) ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{c.ctr_prediction != null ? (c.ctr_prediction * 100).toFixed(2) + "%" : "—"}</td>
                        <td className="p-2 text-right tabular-nums">${c.revenue_prediction?.toFixed(3) ?? "—"}</td>
                        <td className="p-2"><Badge>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}