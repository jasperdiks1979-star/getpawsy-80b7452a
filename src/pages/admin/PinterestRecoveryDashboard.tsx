import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, AlertTriangle, Activity } from "lucide-react";
import { toast } from "sonner";

type Run = {
  id: string; run_type: string; status: string; verdict: string | null;
  publish_allowed: boolean; summary: any; phase: any; blockers: any;
  started_at: string; finished_at: string | null;
};
type TrustRow = {
  trust_score: number; publisher_quality: number; creative_diversity: number;
  board_diversity: number; topic_diversity: number; freshness: number;
  seo_score: number; conversion_score: number; account_health: number;
  created_at: string;
};

const verdictColor = (v: string | null) =>
  v === "GREEN" ? "bg-emerald-500" : v === "YELLOW" ? "bg-amber-500" : "bg-red-500";

export default function PinterestRecoveryDashboard() {
  const [latest, setLatest] = useState<Run | null>(null);
  const [trust, setTrust] = useState<TrustRow | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [classCounts, setClassCounts] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);

  async function load() {
    const { data: runs } = await supabase.from("pinterest_recovery_runs")
      .select("*").order("started_at", { ascending: false }).limit(20);
    setHistory(runs ?? []);
    const top = (runs ?? []).find(r => r.run_type === "full_recovery_scan") ?? null;
    setLatest(top);
    if (top) {
      const { data: t } = await supabase.from("pinterest_recovery_trust_scores")
        .select("*").eq("run_id", top.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setTrust(t ?? null);
      const { data: audits } = await supabase.from("pinterest_recovery_pin_audit")
        .select("classification").eq("run_id", top.id);
      const counts: Record<string, number> = {};
      (audits ?? []).forEach(a => { counts[a.classification] = (counts[a.classification] ?? 0) + 1; });
      setClassCounts(counts);
    }
  }

  useEffect(() => { load(); }, []);

  async function runRecovery() {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-recovery-orchestrator", { body: {} });
      if (error) throw error;
      toast.success(`Recovery scan complete — verdict ${data?.verdict ?? "?"}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Recovery scan failed");
    } finally { setRunning(false); }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Pinterest Account Recovery
          </h1>
          <p className="text-sm text-muted-foreground">
            Account rehabilitation — trust before traffic. Publishing remains
            locked until Trust ≥ 90 and zero blockers.
          </p>
        </div>
        <Button onClick={runRecovery} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
          Run Recovery Scan
        </Button>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Verdict</CardTitle></CardHeader>
          <CardContent><Badge className={`${verdictColor(latest?.verdict ?? null)} text-white`}>{latest?.verdict ?? "—"}</Badge></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Trust Score</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{trust?.trust_score ?? "—"}<span className="text-base text-muted-foreground">/100</span></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Account Health</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{trust?.account_health ?? "—"}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Publish Allowed</CardTitle></CardHeader>
          <CardContent>
            <Badge variant={latest?.publish_allowed ? "default" : "destructive"}>
              {latest?.publish_allowed ? "YES" : "LOCKED"}
            </Badge>
          </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Score Breakdown</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3 text-sm">
          {trust && Object.entries({
            "Publisher Quality": trust.publisher_quality,
            "Creative Diversity": trust.creative_diversity,
            "Board Diversity": trust.board_diversity,
            "Topic Diversity": trust.topic_diversity,
            "Freshness": trust.freshness,
            "SEO": trust.seo_score,
            "Conversion": trust.conversion_score,
            "Account Health": trust.account_health,
          }).map(([k,v]) => (
            <div key={k} className="rounded border p-3 flex justify-between">
              <span className="text-muted-foreground">{k}</span><span className="font-semibold">{v}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Live Pin Classification</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(classCounts).length === 0 && <span className="text-sm text-muted-foreground">No pins audited yet — run a scan.</span>}
          {Object.entries(classCounts).map(([c, n]) => (
            <Badge key={c} variant={c === "Spam Risk" ? "destructive" : c === "Excellent" ? "default" : "secondary"}>
              {c}: {n}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Blockers</CardTitle></CardHeader>
        <CardContent>
          {Array.isArray(latest?.blockers) && latest!.blockers.length > 0
            ? <ul className="text-sm list-disc pl-5 space-y-1">{(latest!.blockers as string[]).map((b,i)=>(<li key={i}>{b}</li>))}</ul>
            : <span className="text-sm text-muted-foreground">No active blockers.</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Runs</CardTitle></CardHeader>
        <CardContent className="text-xs">
          <table className="w-full">
            <thead><tr className="text-left text-muted-foreground"><th className="py-1">Started</th><th>Type</th><th>Verdict</th><th>Publish</th><th>Trust</th></tr></thead>
            <tbody>
              {history.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="py-1">{new Date(r.started_at).toLocaleString()}</td>
                  <td>{r.run_type}</td>
                  <td><Badge className={`${verdictColor(r.verdict)} text-white`}>{r.verdict ?? "—"}</Badge></td>
                  <td>{r.publish_allowed ? "✅" : "🔒"}</td>
                  <td>{r.summary?.trust_score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}