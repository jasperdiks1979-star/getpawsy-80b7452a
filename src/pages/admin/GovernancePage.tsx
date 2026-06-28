import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, ShieldCheck, AlertTriangle, ScrollText, Activity } from "lucide-react";

type Row = Record<string, any>;

export default function GovernancePage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [trust, setTrust] = useState<Row[]>([]);
  const [ledger, setLedger] = useState<Row[]>([]);
  const [anoms, setAnoms] = useState<Row[]>([]);
  const [validations, setValidations] = useState<Row[]>([]);
  const [constitution, setConstitution] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);

  async function load() {
    setLoading(true);
    const [t, l, a, v, c, r] = await Promise.all([
      supabase.from("agal_trust_scores").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("agal_decision_ledger").select("id,sequence_no,engine_key,decision_type,confidence,recorded_at").order("sequence_no", { ascending: false }).limit(100),
      supabase.from("agal_anomalies").select("*").order("detected_at", { ascending: false }).limit(50),
      supabase.from("agal_truth_validations").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("agal_constitution").select("*").order("created_at", { ascending: true }),
      supabase.from("agal_audit_runs").select("*").order("started_at", { ascending: false }).limit(20),
    ]);
    setTrust(t.data ?? []);
    setLedger(l.data ?? []);
    setAnoms(a.data ?? []);
    setValidations(v.data ?? []);
    setConstitution(c.data ?? []);
    setRuns(r.data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function runAudit() {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("agal-auditor", { body: { trigger: "manual" } });
    setRunning(false);
    if (error) { toast.error("Audit failed: " + error.message); return; }
    toast.success(`Audit complete: ${data?.totalValidations ?? 0} validations, ${data?.totalAnoms ?? 0} anomalies`);
    load();
  }

  const leaderboard = [...trust].sort((a, b) => (b.overall_trust ?? 0) - (a.overall_trust ?? 0));

  return (
    <div className="container py-6 space-y-6">
      <Helmet>
        <title>AI Governance & Audit | GetPawsy</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> AI Governance & Audit Layer
          </h1>
          <p className="text-sm text-muted-foreground">Independent authority — no AI evaluates itself.</p>
        </div>
        <Button onClick={runAudit} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
          Run Audit
        </Button>
      </div>

      <Tabs defaultValue="trust">
        <TabsList>
          <TabsTrigger value="trust">Trust Rankings</TabsTrigger>
          <TabsTrigger value="ledger">Decision Ledger</TabsTrigger>
          <TabsTrigger value="validations">Truth Validations</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
          <TabsTrigger value="constitution">Constitution</TabsTrigger>
          <TabsTrigger value="runs">Audit Runs</TabsTrigger>
        </TabsList>

        <TabsContent value="trust">
          <Card>
            <CardHeader><CardTitle>AI Reputation Rankings</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Loader2 className="animate-spin" /> : leaderboard.length === 0 ? (
                <p className="text-sm text-muted-foreground">No scores yet — run audit.</p>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((s) => (
                    <div key={s.id} className="flex items-center justify-between border rounded p-3">
                      <div>
                        <div className="font-medium">{s.engine_key}</div>
                        <div className="text-xs text-muted-foreground">sample {s.sample_size ?? 0} · {s.period_start}</div>
                      </div>
                      <Badge variant={(s.overall_trust ?? 0) >= 0.85 ? "default" : (s.overall_trust ?? 0) >= 0.6 ? "secondary" : "destructive"}>
                        {((s.overall_trust ?? 0) * 100).toFixed(1)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ScrollText className="h-4 w-4" /> Immutable Decision Ledger</CardTitle></CardHeader>
            <CardContent className="text-xs font-mono space-y-1 max-h-[600px] overflow-auto">
              {ledger.map((r) => (
                <div key={r.id} className="border-b py-1">
                  #{r.sequence_no} · {r.engine_key} · {r.decision_type} · conf={r.confidence ?? "–"} · {new Date(r.recorded_at).toLocaleString()}
                </div>
              ))}
              {ledger.length === 0 && <p className="text-muted-foreground">No decisions recorded.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validations">
          <Card>
            <CardHeader><CardTitle>Truth Validations (predicted vs actual)</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-auto">
              {validations.map((v) => (
                <div key={v.id} className="flex justify-between border rounded p-2 text-sm">
                  <div>{v.engine_key} · {v.metric}</div>
                  <div className="font-mono">{v.predicted} → {v.actual} ({v.verdict})</div>
                </div>
              ))}
              {validations.length === 0 && <p className="text-muted-foreground text-sm">No validations yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anomalies">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Anomalies</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-auto">
              {anoms.map((a) => (
                <div key={a.id} className="border rounded p-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{a.anomaly_type}</span>
                    <Badge variant={a.severity === "high" ? "destructive" : "secondary"}>{a.severity}</Badge>
                  </div>
                  <div className="text-muted-foreground text-xs">{a.source} · {new Date(a.detected_at).toLocaleString()}</div>
                  {a.description && <div className="text-xs">{a.description}</div>}
                </div>
              ))}
              {anoms.length === 0 && <p className="text-muted-foreground text-sm">No anomalies detected.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="constitution">
          <Card>
            <CardHeader><CardTitle>AI Constitution (Immutable)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {constitution.map((p) => (
                <div key={p.id} className="border rounded p-3">
                  <div className="font-medium">{p.principle}</div>
                  {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardHeader><CardTitle>Audit Runs</CardTitle></CardHeader>
            <CardContent className="space-y-2 max-h-[600px] overflow-auto">
              {runs.map((r) => (
                <div key={r.id} className="border rounded p-2 text-sm">
                  <div className="flex justify-between">
                    <span>{new Date(r.started_at).toLocaleString()} · {r.trigger}</span>
                    <Badge variant={r.status === "ok" ? "default" : "secondary"}>{r.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    engines {r.engines_audited} · validations {r.validations} · anomalies {r.anomalies_found} · trust updates {r.trust_updates}
                  </div>
                </div>
              ))}
              {runs.length === 0 && <p className="text-muted-foreground text-sm">No runs yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}