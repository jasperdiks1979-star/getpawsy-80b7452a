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

type AssemblyRun = {
  id: string; started_at: string; finished_at: string | null;
  drafts_scanned: number; passed: number; repaired: number; rejected: number;
  skipped: number; queued: number; reason_counts: Record<string, number>; status: string;
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
  const [asmRun, setAsmRun] = useState<AssemblyRun | null>(null);
  const [asmRunning, setAsmRunning] = useState(false);
  const [queueReady, setQueueReady] = useState<number>(0);
  const [draftStats, setDraftStats] = useState<{ total: number; with_headline: number }>({ total: 0, with_headline: 0 });
  const [rejected, setRejected] = useState<any[]>([]);
  const [showRejected, setShowRejected] = useState(false);
  const [lastRepublish, setLastRepublish] = useState<{
    id: string; status: string; params: any; posted: number | null;
    attempted: number | null; skipped: number | null; failed: number | null;
    created_at: string; completed_at: string | null;
  } | null>(null);
  const [pendingRepublish, setPendingRepublish] = useState<{ id: string; status: string } | null>(null);
  const [enqueueBusy, setEnqueueBusy] = useState(false);

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

    const { data: asm } = await supabase.from("pcie2_assembly_runs")
      .select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
    setAsmRun((asm as AssemblyRun) ?? null);
    const { count: rdy } = await supabase.from("pcie2_publish_queue")
      .select("id", { count: "exact", head: true }).eq("status", "ready");
    setQueueReady(rdy ?? 0);
    const { count: total } = await supabase.from("pcie2_creatives")
      .select("id", { count: "exact", head: true }).eq("status", "draft");
    const { count: hl } = await supabase.from("pcie2_creatives")
      .select("id", { count: "exact", head: true }).eq("status", "draft").not("headline", "is", null);
    setDraftStats({ total: total ?? 0, with_headline: hl ?? 0 });

    // ── Last republish_deleted_remote job + any pending/running one ──────────
    const { data: repJobs } = await supabase
      .from("pinterest_recovery_jobs")
      .select("id,status,params,result,created_at,completed_at")
      .eq("phase", "republish_deleted_remote")
      .order("created_at", { ascending: false })
      .limit(10);
    const pending = (repJobs ?? []).find((r: any) => r.status === "pending" || r.status === "running") ?? null;
    setPendingRepublish(pending ? { id: pending.id, status: pending.status } : null);
    const lastDone = (repJobs ?? []).find((r: any) => r.status === "completed") ?? null;
    if (lastDone) {
      const steps = ((lastDone as any).result?.steps ?? []) as any[];
      const rep = steps.find((s) => s?.step === "republish")?.body ?? {};
      setLastRepublish({
        id: lastDone.id,
        status: lastDone.status,
        params: lastDone.params,
        posted: rep.posted ?? null,
        attempted: rep.attempted ?? null,
        skipped: rep.skipped ?? null,
        failed: rep.failed ?? null,
        created_at: lastDone.created_at,
        completed_at: (lastDone as any).completed_at ?? null,
      });
    } else {
      setLastRepublish(null);
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

  async function runAssembler() {
    setAsmRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pcie2-publish-assembler", { body: { limit: 200, target: 100, verify_images: false } });
      if (error) throw error;
      toast.success(`Assembler: queued ${(data as any)?.queued ?? 0} / scanned ${(data as any)?.scanned ?? 0}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Assembler failed");
    } finally { setAsmRunning(false); }
  }

  async function loadRejected() {
    if (!asmRun) return;
    const { data } = await supabase.from("pcie2_assembly_results")
      .select("creative_id,product_id,verdict,reason,detail")
      .eq("run_id", asmRun.id).neq("verdict", "PASS").neq("verdict", "REPAIRED").limit(50);
    setRejected(data ?? []);
    setShowRejected(true);
  }

  async function enqueueNextRepublish10() {
    if (pendingRepublish) {
      toast.error(`A ${pendingRepublish.status} republish job already exists (${pendingRepublish.id.slice(0, 8)})`);
      return;
    }
    setEnqueueBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-recovery-enqueue", {
        body: {
          phase: "republish_deleted_remote",
          confirm: true,
          limit: 10,
          use_regeneration: true,
        },
      });
      if (error) throw error;
      const res = data as any;
      if (res?.ok === false) throw new Error(res?.reason || res?.error || "enqueue_failed");
      if (res?.deduplicated) {
        toast.message(`Reused existing ${res.status} job ${String(res.job_id).slice(0, 8)}`);
      } else {
        toast.success(`Enqueued republish LIMIT 10 — job ${String(res.job_id).slice(0, 8)}`);
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Enqueue failed");
    } finally {
      setEnqueueBusy(false);
    }
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

      <Card className="border-sky-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Next Republish — one-click (LIMIT 10)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="rounded border p-3">
              <div className="text-xs text-muted-foreground">Last posted</div>
              <div className="text-2xl font-semibold">{lastRepublish?.posted ?? "—"}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs text-muted-foreground">Last attempted</div>
              <div className="text-2xl font-semibold">{lastRepublish?.attempted ?? "—"}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs text-muted-foreground">Last skipped / failed</div>
              <div className="text-2xl font-semibold">
                {lastRepublish?.skipped ?? "—"} / {lastRepublish?.failed ?? "—"}
              </div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs text-muted-foreground">Last job</div>
              <div className="text-xs font-mono truncate">{lastRepublish?.id?.slice(0, 8) ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                {lastRepublish?.completed_at ? new Date(lastRepublish.completed_at).toLocaleString() : "—"}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Enqueues exactly one <code>republish_deleted_remote</code> job with
              <code> limit=10</code>, <code>confirm=true</code>, <code>use_regeneration=true</code>.
              Deduplicated server-side against any pending/running job.
            </p>
            <Button
              size="sm"
              onClick={enqueueNextRepublish10}
              disabled={enqueueBusy || !!pendingRepublish}
            >
              {enqueueBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {pendingRepublish
                ? `Job ${pendingRepublish.status} (${pendingRepublish.id.slice(0, 8)})`
                : "Enqueue next republish (LIMIT 10)"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Draft → Publish-Ready Queue Assembler
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Drafts total</div><div className="text-2xl font-semibold">{draftStats.total}</div></div>
            <div className="rounded border p-3"><div className="text-xs text-muted-foreground">With headline</div><div className="text-2xl font-semibold">{draftStats.with_headline}</div></div>
            <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Publish-ready queue</div><div className="text-2xl font-semibold">{queueReady}</div></div>
            <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Last queued (run)</div><div className="text-2xl font-semibold">{asmRun?.queued ?? 0}</div></div>
          </div>
          {asmRun && (
            <div className="grid md:grid-cols-5 gap-3 text-xs">
              <div className="rounded border p-2"><span className="text-muted-foreground">Scanned</span><div className="font-semibold">{asmRun.drafts_scanned}</div></div>
              <div className="rounded border p-2"><span className="text-muted-foreground">Repaired</span><div className="font-semibold">{asmRun.repaired}</div></div>
              <div className="rounded border p-2"><span className="text-muted-foreground">Rejected</span><div className="font-semibold">{asmRun.rejected}</div></div>
              <div className="rounded border p-2"><span className="text-muted-foreground">Skipped</span><div className="font-semibold">{asmRun.skipped}</div></div>
              <div className="rounded border p-2"><span className="text-muted-foreground">Last run</span><div className="font-semibold">{new Date(asmRun.started_at).toLocaleString()}</div></div>
            </div>
          )}
          {asmRun?.reason_counts && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(asmRun.reason_counts).sort((a,b)=>(b[1] as number)-(a[1] as number)).slice(0,8).map(([k,v]) => (
                <Badge key={k} variant={k === "queued_successfully" ? "default" : "secondary"}>{k}: {v as number}</Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={runAssembler} disabled={asmRunning}>
              {asmRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Run Draft → Queue Assembler
            </Button>
            <Button size="sm" variant="outline" onClick={loadRejected} disabled={!asmRun}>Show rejected drafts</Button>
          </div>
          {showRejected && rejected.length > 0 && (
            <details open className="rounded border p-3 bg-muted/30">
              <summary className="cursor-pointer text-xs">Rejected/skipped drafts ({rejected.length})</summary>
              <pre className="text-[10px] overflow-auto max-h-64 mt-2">{JSON.stringify(rejected, null, 2)}</pre>
            </details>
          )}
          <p className="text-xs text-muted-foreground">Assembler only fills the queue. Publishing remains locked (global stop + canary cap). Legacy publishers blocked by pcie2-legacy-guard.</p>
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