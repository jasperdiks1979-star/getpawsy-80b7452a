import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Brain, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type Run = { id: string; status: string; target_label: string | null; created_at: string; duration_ms: number | null; steps_completed: number };
type Report = { id: string; run_id: string; target_label: string | null; summary: string | null; report_md: string | null; report_json: any; created_at: string };
type DNA = { id: string; sample_size: number; dna: any; similar_products: any[]; similar_creatives: any[]; recommendations: any[]; created_at: string };
type Attribution = { id: string; order_label: string | null; funnel_stages: any; attribution: any; strengths: string[]; weaknesses: string[]; why_converted: string | null };

export default function OrganicIntelligencePage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [dna, setDna] = useState<DNA | null>(null);
  const [attr, setAttr] = useState<Attribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: rs }, { data: rep }, { data: dn }, { data: at }] = await Promise.all([
        supabase.from("organic_intelligence_runs").select("id,status,target_label,created_at,duration_ms,steps_completed").order("created_at", { ascending: false }).limit(15),
        supabase.from("organic_intelligence_reports").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("organic_success_dna").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("organic_sale_attribution").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setRuns((rs as any) || []);
      setReport((rep as any) || null);
      setDna((dn as any) || null);
      setAttr((at as any) || null);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const trigger = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("organic-intelligence-loop", { body: { label: "Sale #538", triggered_by: "admin_ui" } });
      if (error) throw error;
      toast.success("Organic Intelligence loop complete");
      await load();
    } catch (e: any) { toast.error(e?.message || "Loop failed"); }
    finally { setRunning(false); }
  };

  const funnel: any[] = Array.isArray(attr?.funnel_stages) ? (attr!.funnel_stages as any[]) : [];

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Organic Intelligence — Sales Brain</title></Helmet>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Brain className="h-6 w-6" /> Organic Intelligence Loop</h1>
          <p className="text-sm text-muted-foreground">Reconstruct each verified organic sale, learn the Success DNA, and make the next 461 sales increasingly predictable.</p>
        </div>
        <Button onClick={trigger} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />} Run loop
        </Button>
      </header>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Executive report{report?.target_label ? ` — ${report.target_label}` : ""}</CardTitle></CardHeader>
            <CardContent>
              {report?.report_md ? (
                <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{report.report_md}</pre>
              ) : <p className="text-muted-foreground">No report yet. Run the loop.</p>}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">13-step funnel</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {funnel.length === 0 ? <span className="text-muted-foreground">No session joined.</span> : funnel.map((s: any, i: number) => (
                  <div key={i} className="flex justify-between"><span>{s.reached ? "✅" : "⬜"} {s.stage}</span><span className="text-xs text-muted-foreground">{s.at ? new Date(s.at).toLocaleTimeString() : ""}</span></div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Success DNA</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {dna ? (
                  <>
                    <div><Badge variant="outline">sample {dna.sample_size}</Badge> <Badge variant="outline">{dna.dna?.confidence}</Badge></div>
                    <div><b>Categories:</b> {(dna.dna?.top_categories || []).map((c: any) => `${c.value}(${c.count})`).join(", ") || "—"}</div>
                    <div><b>Hooks:</b> {(dna.dna?.top_hooks || []).map((c: any) => `${c.value}(${c.count})`).join(", ") || "—"}</div>
                    <div><b>AOV:</b> €{Number(dna.dna?.avg_order_value || 0).toFixed(2)}</div>
                    <div><b>Recommendations:</b> {dna.recommendations?.length || 0}</div>
                    <div><b>Similar products:</b> {dna.similar_products?.length || 0}</div>
                    <div><b>Similar creatives:</b> {dna.similar_creatives?.length || 0}</div>
                  </>
                ) : <span className="text-muted-foreground">No DNA yet.</span>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Recent runs</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                {runs.map((r) => (
                  <div key={r.id} className="flex justify-between"><span>{r.target_label}</span><span className="text-muted-foreground">{r.status} · {r.steps_completed}/10 · {r.duration_ms ?? "—"}ms</span></div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}