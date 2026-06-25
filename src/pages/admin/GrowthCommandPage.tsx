import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, AlertTriangle, CheckCircle2, Play } from "lucide-react";
import { toast } from "sonner";

type Scorecard = {
  day: string; growth_score: number; revenue_score: number; pinterest_score: number;
  conversion_score: number; seo_score: number; inventory_score: number;
  highlights: string[]; alerts: string[]; components: any;
};
type PdpAudit = { product_id: string; overall_score: number; issues: string[]; suggestions: string[]; audited_at: string };
type Reco = { id: string; recommendation: string; rationale: string; priority: string; status: string; metrics: any; scope_id: string };

export default function GrowthCommandPage() {
  const [loading, setLoading] = useState(true);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [trend, setTrend] = useState<Scorecard[]>([]);
  const [pdp, setPdp] = useState<PdpAudit[]>([]);
  const [recos, setRecos] = useState<Reco[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [sc, tr, pd, rc] = await Promise.all([
      supabase.from("growth_daily_scorecard").select("*").order("day", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("growth_daily_scorecard").select("*").order("day", { ascending: false }).limit(14),
      supabase.from("pdp_health_audits").select("*").order("overall_score", { ascending: true }).limit(20),
      supabase.from("pinterest_campaign_recommendations").select("*").eq("status", "pending").order("generated_at", { ascending: false }).limit(20),
    ]);
    setScorecard(sc.data as any);
    setTrend((tr.data ?? []) as any);
    setPdp((pd.data ?? []) as any);
    setRecos((rc.data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const run = async (fn: string) => {
    setRunning(fn);
    try {
      const { error } = await supabase.functions.invoke(fn, { body: { source: "manual" } });
      if (error) throw error;
      toast.success(`${fn} complete`);
      await load();
    } catch (e) {
      toast.error(`${fn} failed: ${String(e)}`);
    } finally { setRunning(null); }
  };

  const updateReco = async (id: string, status: string) => {
    const { error } = await supabase.from("pinterest_campaign_recommendations").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success(status); load(); }
  };

  if (loading) return <div className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  const score = Math.round(scorecard?.growth_score ?? 0);
  const scoreColor = score >= 75 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-destructive";

  return (
    <>
      <Helmet><title>Growth Command | GetPawsy Admin</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Activity className="h-6 w-6" /> Growth Command</h1>
            <p className="text-sm text-muted-foreground">Autonomous Growth Intelligence Engine V1 — unified scorecard, PDP health, campaign advisor.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => run("growth-intelligence-orchestrator")} disabled={!!running}>
              {running === "growth-intelligence-orchestrator" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Run full orchestrator
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("growth-scorecard-compute")} disabled={!!running}>Recompute scorecard</Button>
            <Button size="sm" variant="outline" onClick={() => run("pdp-health-audit")} disabled={!!running}>Audit PDPs</Button>
            <Button size="sm" variant="outline" onClick={() => run("pinterest-campaign-advisor")} disabled={!!running}>Refresh advisor</Button>
          </div>
        </div>

        <Card className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
            <div className="md:col-span-2 text-center">
              <div className={`text-6xl font-bold ${scoreColor}`}>{score}</div>
              <div className="text-sm text-muted-foreground mt-1">Daily Growth Score</div>
              <div className="text-xs text-muted-foreground">{scorecard?.day ?? "—"}</div>
            </div>
            {[
              ["Revenue", scorecard?.revenue_score],
              ["Pinterest", scorecard?.pinterest_score],
              ["Conversion", scorecard?.conversion_score],
              ["SEO", scorecard?.seo_score],
              ["Inventory", scorecard?.inventory_score],
            ].map(([k, v]) => (
              <div key={k as string} className="text-center border rounded p-3">
                <div className="text-2xl font-semibold">{Math.round(Number(v ?? 0))}</div>
                <div className="text-xs text-muted-foreground">{k}</div>
              </div>
            ))}
          </div>
          {(scorecard?.highlights?.length || scorecard?.alerts?.length) ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {(scorecard?.highlights ?? []).map((h, i) => (
                <div key={i} className="flex items-start gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />{h}</div>
              ))}
              {(scorecard?.alerts ?? []).map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />{a}</div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-3">14-day trend</h2>
          <div className="flex items-end gap-1 h-32">
            {trend.slice().reverse().map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${Math.round(d.growth_score)}`}>
                <div className="w-full bg-primary/70 rounded-t" style={{ height: `${Math.max(2, d.growth_score)}%` }} />
                <div className="text-[10px] text-muted-foreground">{d.day.slice(5)}</div>
              </div>
            ))}
            {trend.length === 0 && <div className="text-sm text-muted-foreground">No data yet — run the orchestrator.</div>}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-3">PDP health — lowest 20</h2>
          {pdp.length === 0 ? <p className="text-sm text-muted-foreground">No audits yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-2 pr-3">Product</th><th>Score</th><th>Issues</th><th>Top suggestion</th></tr>
                </thead>
                <tbody>
                  {pdp.map(p => (
                    <tr key={p.product_id} className="border-t">
                      <td className="py-2 pr-3 font-mono text-xs">{p.product_id.slice(0, 8)}</td>
                      <td><Badge variant={p.overall_score < 50 ? "destructive" : "secondary"}>{p.overall_score}</Badge></td>
                      <td className="py-2 pr-3 text-xs">{(p.issues || []).slice(0, 2).join("; ")}</td>
                      <td className="py-2 text-xs">{(p.suggestions || [])[0] ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-3">Campaign Advisor (review-only)</h2>
          {recos.length === 0 ? <p className="text-sm text-muted-foreground">No pending recommendations.</p> : (
            <div className="space-y-2">
              {recos.map(r => (
                <div key={r.id} className="border rounded p-3 flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={r.priority === "high" ? "default" : "secondary"}>{r.priority}</Badge>
                      <span className="font-medium text-sm">{r.recommendation}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{r.rationale}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => updateReco(r.id, "approved")}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => updateReco(r.id, "dismissed")}>Dismiss</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}