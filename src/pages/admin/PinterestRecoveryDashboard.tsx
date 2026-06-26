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
  const [canaryRunning, setCanaryRunning] = useState(false);
  const [canaryResult, setCanaryResult] = useState<any>(null);
  const [canaryMeta, setCanaryMeta] = useState<{ last_at: string | null; window_h: number; mode: boolean }>({ last_at: null, window_h: 24, mode: false });

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
    const { data: cfg } = await supabase.from("app_config")
      .select("key,value")
      .in("key", ["pinterest_canary_mode","pinterest_canary_window_hours","pinterest_last_canary_at"]);
    const map = Object.fromEntries((cfg ?? []).map(r => [r.key, r.value]));
    setCanaryMeta({
      mode: map.pinterest_canary_mode === true,
      window_h: Number(map.pinterest_canary_window_hours ?? 24),
      last_at: typeof map.pinterest_last_canary_at === "string" ? map.pinterest_last_canary_at : null,
    });
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

  async function runCanary() {
    setCanaryRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-canary-publish", { body: {} });
      if (error) throw error;
      setCanaryResult(data);
      const v = (data as any)?.verdict ?? "?";
      if (v === "PUBLISHED") toast.success(`Canary published pin ${(data as any).publish?.pinterest_pin_id ?? ""}`);
      else toast.message(`Canary ${v}: ${(data as any)?.reason ?? "see result"}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Canary failed");
    } finally { setCanaryRunning(false); }
  }

  const nextAllowed = canaryMeta.last_at
    ? new Date(new Date(canaryMeta.last_at).getTime() + canaryMeta.window_h * 3600 * 1000)
    : null;
  const canaryReady = !nextAllowed || nextAllowed <= new Date();

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

      <Card className="border-amber-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Week-0 Canary Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded border p-3 flex justify-between">
              <span className="text-muted-foreground">Technical blockers</span>
              <Badge variant="default">None</Badge>
            </div>
            <div className="rounded border p-3 flex justify-between">
              <span className="text-muted-foreground">Trust blocker</span>
              <Badge variant="destructive">Active (score &lt; 60)</Badge>
            </div>
            <div className="rounded border p-3 flex justify-between">
              <span className="text-muted-foreground">Canary mode</span>
              <Badge variant={canaryMeta.mode ? "default" : "secondary"}>{canaryMeta.mode ? "Enabled" : "Disabled"}</Badge>
            </div>
            <div className="rounded border p-3 flex justify-between">
              <span className="text-muted-foreground">Next allowed</span>
              <span className="font-semibold">{nextAllowed ? nextAllowed.toLocaleString() : "Now"}</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Publishes exactly 1 premium pin / {canaryMeta.window_h}h via the canonical PCIE2 pipeline. All gates enforced. Both safety locks restored immediately after.
            </p>
            <Button size="sm" onClick={runCanary} disabled={!canaryMeta.mode || !canaryReady || canaryRunning}>
              {canaryRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Run Week-0 Canary
            </Button>
          </div>
          {canaryResult && (
            <div className="rounded border p-3 text-xs space-y-1 bg-muted/40">
              <div><span className="text-muted-foreground">Last result:</span> <Badge variant={canaryResult.verdict === "PUBLISHED" ? "default" : "secondary"}>{canaryResult.verdict}</Badge></div>
              {canaryResult.reason && <div><span className="text-muted-foreground">Reason:</span> {canaryResult.reason}</div>}
              {canaryResult.publish?.pinterest_pin_id && (
                <div>
                  <span className="text-muted-foreground">Pin:</span> {canaryResult.publish.pinterest_pin_id} ·
                  HTTP {canaryResult.publish.http_status} · verify HTTP {canaryResult.publish.verification?.http_status}
                </div>
              )}
              <details className="mt-1">
                <summary className="cursor-pointer text-muted-foreground">Gate trace</summary>
                <pre className="overflow-auto max-h-64 mt-2 text-[10px]">{JSON.stringify(canaryResult.gates ?? [], null, 2)}</pre>
              </details>
            </div>
          )}
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