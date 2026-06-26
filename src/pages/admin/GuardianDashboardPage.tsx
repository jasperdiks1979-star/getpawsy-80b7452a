import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, RefreshCw } from "lucide-react";

type GuardianStatus = {
  color: "green" | "yellow" | "red" | "gray";
  score: number;
  blockers: string[];
  last_run_at: string | null;
  build_hash: string | null;
  publish_gate_open: boolean;
};

const colorMap: Record<string, string> = {
  green: "bg-green-500/15 text-green-700 border-green-500/40",
  yellow: "bg-yellow-500/15 text-yellow-700 border-yellow-500/40",
  red: "bg-red-500/15 text-red-700 border-red-500/40",
  gray: "bg-muted text-muted-foreground border-border",
};

const StatusIcon = ({ color }: { color: string }) => {
  if (color === "green") return <ShieldCheck className="h-5 w-5 text-green-600" />;
  if (color === "yellow") return <ShieldAlert className="h-5 w-5 text-yellow-600" />;
  if (color === "red") return <ShieldX className="h-5 w-5 text-red-600" />;
  return <ShieldAlert className="h-5 w-5 text-muted-foreground" />;
};

export default function GuardianDashboardPage() {
  const [status, setStatus] = useState<GuardianStatus | null>(null);
  const [checks, setChecks] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [gateLog, setGateLog] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [{ data: st }, { data: lastRun }, { data: lastScan }, { data: gates }] = await Promise.all([
      supabase.from("guardian_status").select("*").eq("id", true).maybeSingle(),
      supabase.from("guardian_sentinel_runs").select("id").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("guardian_legacy_scans").select("id").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("guardian_publish_gate_log").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setStatus(st as any);
    setGateLog(gates ?? []);
    if (lastRun?.id) {
      const { data: c } = await supabase.from("guardian_sentinel_checks").select("*").eq("run_id", lastRun.id).order("severity", { ascending: false });
      setChecks(c ?? []);
    }
    if (lastScan?.id) {
      const { data: f } = await supabase.from("guardian_legacy_findings").select("*").eq("scan_id", lastScan.id).order("risk", { ascending: false });
      setFindings(f ?? []);
    }
  }

  useEffect(() => { load(); }, []);

  async function runSentinel() {
    setBusy("sentinel");
    try {
      const { data, error } = await supabase.functions.invoke("guardian-sentinel-run", { body: { trigger: "manual" } });
      if (error) throw error;
      toast.success(`Sentinel: ${(data as any)?.verdict?.toUpperCase()} (score ${(data as any)?.score})`);
      await load();
    } catch (e: any) { toast.error(`Sentinel failed: ${e.message ?? e}`); }
    finally { setBusy(null); }
  }

  async function runScan() {
    setBusy("scan");
    try {
      const { data, error } = await supabase.functions.invoke("guardian-legacy-scanner", { body: {} });
      if (error) throw error;
      const violated = (data as any)?.single_publisher_violated;
      toast[violated ? "error" : "success"](`Scan complete — ${(data as any)?.totals?.total ?? 0} findings${violated ? " (Single Publisher VIOLATED)" : ""}`);
      await load();
    } catch (e: any) { toast.error(`Scan failed: ${e.message ?? e}`); }
    finally { setBusy(null); }
  }

  const color = status?.color ?? "gray";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Production Sentinel</h1>
          <p className="text-sm text-muted-foreground">Real probes. No mocks. Single source of truth for Pinterest publish gate.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
          <Button onClick={runSentinel} disabled={busy !== null}>
            {busy === "sentinel" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
            Run Sentinel
          </Button>
          <Button variant="secondary" onClick={runScan} disabled={busy !== null}>
            {busy === "scan" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Run Legacy Scanner
          </Button>
        </div>
      </div>

      <Card className={colorMap[color]}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><StatusIcon color={color} /> Guardian Status: {color.toUpperCase()}</CardTitle>
          <Badge variant={status?.publish_gate_open ? "default" : "destructive"}>
            Publish Gate: {status?.publish_gate_open ? "OPEN" : "CLOSED"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm">Score: <span className="font-mono font-bold">{status?.score ?? "—"}</span></div>
          <div className="text-sm">Last run: {status?.last_run_at ? new Date(status.last_run_at).toLocaleString() : "never"}</div>
          <div className="text-sm">Build hash: <span className="font-mono">{status?.build_hash ?? "—"}</span></div>
          {status?.blockers?.length ? (
            <div className="text-sm">
              <div className="font-medium">Blockers:</div>
              <ul className="list-disc list-inside text-xs">{status.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="checks">
        <TabsList>
          <TabsTrigger value="checks">Sentinel Checks ({checks.length})</TabsTrigger>
          <TabsTrigger value="findings">Legacy Findings ({findings.length})</TabsTrigger>
          <TabsTrigger value="gate">Publish Gate Log ({gateLog.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="checks">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr><th className="text-left p-2">Check</th><th className="text-left p-2">Category</th><th className="text-left p-2">Status</th><th className="text-left p-2">Severity</th><th className="text-left p-2">Message</th></tr></thead>
              <tbody>
                {checks.map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{c.name}</td>
                    <td className="p-2">{c.category}</td>
                    <td className="p-2"><Badge variant={c.status === "pass" ? "default" : c.status === "fail" ? "destructive" : "secondary"}>{c.status}</Badge></td>
                    <td className="p-2 text-xs">{c.severity}</td>
                    <td className="p-2 text-xs">{c.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="findings">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr><th className="text-left p-2">Category</th><th className="text-left p-2">Identifier</th><th className="text-left p-2">Risk</th><th className="text-left p-2">Recommendation</th><th className="text-left p-2">Status</th></tr></thead>
              <tbody>
                {findings.map(f => (
                  <tr key={f.id} className="border-t">
                    <td className="p-2 text-xs">{f.category}</td>
                    <td className="p-2 font-mono text-xs">{f.identifier}</td>
                    <td className="p-2"><Badge variant={f.risk === "critical" ? "destructive" : f.risk === "high" ? "destructive" : "secondary"}>{f.risk}</Badge></td>
                    <td className="p-2 text-xs">{f.recommendation}</td>
                    <td className="p-2 text-xs">{f.status}</td>
                  </tr>
                ))}
                {!findings.length && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-sm">No legacy findings yet. Run the scanner.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="gate">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted"><tr><th className="text-left p-2">When</th><th className="text-left p-2">Pipeline</th><th className="text-left p-2">Decision</th><th className="text-left p-2">Reason</th><th className="text-left p-2">Color/Score</th></tr></thead>
              <tbody>
                {gateLog.map(g => (
                  <tr key={g.id} className="border-t">
                    <td className="p-2 text-xs">{new Date(g.created_at).toLocaleString()}</td>
                    <td className="p-2 text-xs font-mono">{g.pipeline}</td>
                    <td className="p-2"><Badge variant={g.decision === "allow" ? "default" : "destructive"}>{g.decision}</Badge></td>
                    <td className="p-2 text-xs">{g.reason}</td>
                    <td className="p-2 text-xs">{g.guardian_color}/{g.guardian_score}</td>
                  </tr>
                ))}
                {!gateLog.length && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-sm">No publish gate activity yet.</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}