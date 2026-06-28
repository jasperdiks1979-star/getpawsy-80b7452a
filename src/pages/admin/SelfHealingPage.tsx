import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, Activity } from "lucide-react";
import { toast } from "sonner";

type Subsystem = {
  id: string;
  name: string;
  category: string;
  severity: string;
  last_status: string | null;
  last_checked_at: string | null;
  last_evidence: Record<string, unknown> | null;
  default_playbook: string | null;
  enabled: boolean;
};

type Incident = {
  id: string;
  subsystem: string;
  severity: string;
  status: string;
  evidence: Record<string, unknown>;
  detected_at: string;
  recovered_at: string | null;
  mttr_seconds: number | null;
  signature_hash: string | null;
};

type Recovery = {
  id: string;
  incident_id: string;
  playbook_name: string;
  outcome: string | null;
  validation_passed: boolean | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
};

type Signature = {
  id: string;
  signature_hash: string;
  subsystem: string;
  symptom: string;
  preferred_playbook: string | null;
  occurrences: number;
  confidence: number;
  last_seen_at: string;
};

function statusColor(s: string | null) {
  switch (s) {
    case "green":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "yellow":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "red":
      return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function SelfHealingPage() {
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [subs, incs, recs, sigs] = await Promise.all([
      supabase.from("shil_subsystems").select("*").order("category"),
      supabase
        .from("shil_incidents")
        .select("id, subsystem, severity, status, evidence, detected_at, recovered_at, mttr_seconds, signature_hash")
        .order("detected_at", { ascending: false })
        .limit(50),
      supabase
        .from("shil_recoveries")
        .select("id, incident_id, playbook_name, outcome, validation_passed, duration_ms, started_at, finished_at")
        .order("started_at", { ascending: false })
        .limit(50),
      supabase
        .from("shil_signatures")
        .select("id, signature_hash, subsystem, symptom, preferred_playbook, occurrences, confidence, last_seen_at")
        .order("occurrences", { ascending: false })
        .limit(30),
    ]);
    setSubsystems((subs.data as Subsystem[]) ?? []);
    setIncidents((incs.data as Incident[]) ?? []);
    setRecoveries((recs.data as Recovery[]) ?? []);
    setSignatures((sigs.data as Signature[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);

  const runProbesNow = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("self-healing-orchestrator");
      if (error) throw error;
      toast.success("Probes triggered");
      setTimeout(refresh, 1500);
    } catch (e) {
      toast.error(`Failed to trigger probes: ${String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  const greenCount = subsystems.filter((s) => s.last_status === "green").length;
  const redCount = subsystems.filter((s) => s.last_status === "red").length;
  const yellowCount = subsystems.filter((s) => s.last_status === "yellow").length;

  const recoveredCount = recoveries.filter((r) => r.outcome === "success" && r.validation_passed).length;
  const escalatedCount = incidents.filter((i) => i.status === "escalated").length;

  const mttrAvg = (() => {
    const list = incidents.filter((i) => i.mttr_seconds != null).map((i) => i.mttr_seconds as number);
    if (!list.length) return null;
    return Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  })();

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Self-Healing Intelligence Layer
          </h1>
          <p className="text-sm text-muted-foreground">
            Detect · Diagnose · Recover · Validate · Learn. Probes run every 5 minutes.
          </p>
        </div>
        <Button onClick={runProbesNow} disabled={running} variant="default">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Run probes now
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Subsystems</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{subsystems.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Green</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{greenCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Yellow / Red</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <span className="text-amber-500">{yellowCount}</span>{" / "}
              <span className="text-red-500">{redCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Auto-recovered (50)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recoveredCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">Avg MTTR</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mttrAvg != null ? `${mttrAvg}s` : "—"}</div>
            <div className="text-xs text-muted-foreground">escalated: {escalatedCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Subsystem health
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {subsystems.map((s) => (
                <div key={s.id} className={`border rounded-md p-3 ${statusColor(s.last_status)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{s.name}</div>
                    <Badge variant="outline" className="capitalize">{s.last_status ?? "unknown"}</Badge>
                  </div>
                  <div className="text-xs opacity-80 mt-1">
                    {s.category} · severity {s.severity} · checked {timeAgo(s.last_checked_at)}
                  </div>
                  {s.default_playbook && (
                    <div className="text-xs mt-1 opacity-80">→ {s.default_playbook}</div>
                  )}
                  {s.last_evidence && Object.keys(s.last_evidence).length > 0 && (
                    <pre className="text-[10px] mt-2 opacity-75 max-h-20 overflow-auto">
                      {JSON.stringify(s.last_evidence, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Recent incidents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[480px] overflow-auto">
            {incidents.length === 0 && <div className="text-sm text-muted-foreground">No incidents recorded.</div>}
            {incidents.map((i) => (
              <div key={i.id} className="border rounded p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{i.subsystem}</span>
                  <Badge variant={i.status === "recovered" ? "secondary" : i.status === "escalated" ? "destructive" : "outline"}>
                    {i.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {i.severity} · detected {timeAgo(i.detected_at)}
                  {i.mttr_seconds != null && ` · recovered in ${i.mttr_seconds}s`}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recovery history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[480px] overflow-auto">
            {recoveries.length === 0 && <div className="text-sm text-muted-foreground">No recoveries yet.</div>}
            {recoveries.map((r) => (
              <div key={r.id} className="border rounded p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.playbook_name}</span>
                  <Badge variant={r.outcome === "success" ? "secondary" : r.outcome === "failed" ? "destructive" : "outline"}>
                    {r.outcome ?? "pending"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.duration_ms != null && `${r.duration_ms}ms · `}
                  validation: {r.validation_passed == null ? "—" : r.validation_passed ? "passed" : "failed"} · started {timeAgo(r.started_at)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Learned anomaly signatures</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Subsystem</th>
                  <th className="text-left p-2">Symptom</th>
                  <th className="text-left p-2">Playbook</th>
                  <th className="text-right p-2">Seen</th>
                  <th className="text-right p-2">Confidence</th>
                  <th className="text-right p-2">Last</th>
                </tr>
              </thead>
              <tbody>
                {signatures.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2">{s.subsystem}</td>
                    <td className="p-2">{s.symptom}</td>
                    <td className="p-2">{s.preferred_playbook ?? "—"}</td>
                    <td className="p-2 text-right">{s.occurrences}</td>
                    <td className="p-2 text-right">{Math.round(s.confidence * 100)}%</td>
                    <td className="p-2 text-right">{timeAgo(s.last_seen_at)}</td>
                  </tr>
                ))}
                {!signatures.length && (
                  <tr>
                    <td className="p-3 text-center text-muted-foreground" colSpan={6}>
                      No signatures learned yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}