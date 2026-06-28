import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Play, ShieldAlert, Activity, Bug, Wrench, GitBranch } from "lucide-react";
import { toast } from "sonner";

type Health = {
  ts: string;
  funnel_conversion: number | null;
  drop_pcts: Record<string, number>;
  pixel_health: number | null;
  api_health: number | null;
  tracking_health: number | null;
  lost_revenue_estimate_cents: number;
};

type Incident = {
  id: string;
  type: string;
  severity: string;
  confidence: number;
  affected_revenue_cents: number;
  affected_sessions: number;
  root_cause: string | null;
  suggested_repair: string | null;
  auto_repair_status: string;
  opened_at: string;
  resolved_at: string | null;
};

type Validation = {
  id: string;
  source_pair: string;
  window_label: string;
  expected: number | null;
  actual: number | null;
  drift_pct: number | null;
  severity: string;
  status: string;
  created_at: string;
};

type Synthetic = {
  id: string;
  persona: string;
  device: string;
  status: string;
  failure_stage: string | null;
  total_ms: number | null;
  created_at: string;
};

type Repair = {
  id: string;
  category: string;
  status: string;
  confidence: number;
  rollback_available: boolean;
  created_at: string;
};

const sev = (s: string) =>
  s === "critical" ? "destructive" : s === "high" ? "destructive" : s === "medium" ? "default" : "secondary";

export default function ArieCommandCenterPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [validations, setValidations] = useState<Validation[]>([]);
  const [synthetic, setSynthetic] = useState<Synthetic[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: h }, { data: i }, { data: v }, { data: s }, { data: r }] = await Promise.all([
        supabase
          .from("arie_health_snapshots")
          .select("*")
          .order("ts", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("arie_incidents").select("*").order("opened_at", { ascending: false }).limit(50),
        supabase.from("arie_validation_runs").select("*").order("created_at", { ascending: false }).limit(30),
        supabase.from("arie_synthetic_runs").select("*").order("created_at", { ascending: false }).limit(40),
        supabase.from("arie_repairs").select("*").order("created_at", { ascending: false }).limit(30),
      ]);
      setHealth((h as any) || null);
      setIncidents((i as any) || []);
      setValidations((v as any) || []);
      setSynthetic((s as any) || []);
      setRepairs((r as any) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const trigger = async (fn: string, label: string) => {
    setRunning(fn);
    try {
      const { error } = await supabase.functions.invoke(fn, { body: {} });
      if (error) throw error;
      toast.success(`${label} completed`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || `${label} failed`);
    } finally {
      setRunning(null);
    }
  };

  const usd = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="p-6 space-y-6">
      <Helmet>
        <title>ARIE — Autonomous Revenue Intelligence</title>
      </Helmet>
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="h-6 w-6" /> ARIE — Autonomous Revenue Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            End-to-end funnel monitoring, cross-source validation, synthetic robots, and safe auto-repair.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => trigger("arie-validator", "Validator")} disabled={!!running}>
            {running === "arie-validator" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Validator
          </Button>
          <Button size="sm" variant="outline" onClick={() => trigger("arie-drop-detector", "Drop detector")} disabled={!!running}>
            {running === "arie-drop-detector" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Drop detector
          </Button>
          <Button size="sm" variant="outline" onClick={() => trigger("arie-synthetic-robot", "Synthetic robot")} disabled={!!running}>
            {running === "arie-synthetic-robot" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Synthetic
          </Button>
          <Button size="sm" variant="outline" onClick={() => trigger("arie-health-rollup", "Health rollup")} disabled={!!running}>
            {running === "arie-health-rollup" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Health rollup
          </Button>
        </div>
      </header>

      <div className="grid md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Funnel conversion</div>
          <div className="text-2xl font-semibold">
            {health?.funnel_conversion != null ? `${(health.funnel_conversion * 100).toFixed(2)}%` : "—"}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Tracking health</div>
          <div className="text-2xl font-semibold">
            {health?.tracking_health != null ? `${Math.round(health.tracking_health * 100)}%` : "—"}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pixel health</div>
          <div className="text-2xl font-semibold">
            {health?.pixel_health != null ? `${Math.round(health.pixel_health * 100)}%` : "—"}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Estimated lost revenue</div>
          <div className="text-2xl font-semibold">{usd(health?.lost_revenue_estimate_cents || 0)}</div>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
        </div>
      ) : (
        <Tabs defaultValue="incidents">
          <TabsList>
            <TabsTrigger value="incidents"><ShieldAlert className="h-4 w-4 mr-1" />Incidents</TabsTrigger>
            <TabsTrigger value="validation"><Bug className="h-4 w-4 mr-1" />Validation</TabsTrigger>
            <TabsTrigger value="synthetic"><GitBranch className="h-4 w-4 mr-1" />Synthetic</TabsTrigger>
            <TabsTrigger value="repairs"><Wrench className="h-4 w-4 mr-1" />Repairs</TabsTrigger>
          </TabsList>

          <TabsContent value="incidents">
            <Card>
              <CardHeader><CardTitle className="text-base">Open & recent incidents</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {incidents.length === 0 ? <div className="text-sm text-muted-foreground">No incidents.</div> : incidents.map((i) => (
                  <div key={i.id} className="border rounded p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-medium">{i.type}</div>
                      <div className="flex gap-2">
                        <Badge variant={sev(i.severity) as any}>{i.severity}</Badge>
                        <Badge variant="outline">conf {Math.round((i.confidence || 0) * 100)}%</Badge>
                        <Badge variant="outline">{i.auto_repair_status}</Badge>
                      </div>
                    </div>
                    <div className="text-muted-foreground">{i.root_cause || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {usd(i.affected_revenue_cents)} · {i.affected_sessions} sessions · {new Date(i.opened_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="validation">
            <Card>
              <CardHeader><CardTitle className="text-base">Cross-source validation runs</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {validations.length === 0 ? <div className="text-muted-foreground">No runs yet.</div> : validations.map((v) => (
                  <div key={v.id} className="flex justify-between border-b last:border-0 py-1">
                    <span>{v.source_pair} · {v.window_label}</span>
                    <span className="text-xs">
                      exp {v.expected ?? "—"} / act {v.actual ?? "—"} · drift {v.drift_pct?.toFixed(1) ?? "—"}% ·{" "}
                      <Badge variant={sev(v.severity) as any}>{v.severity}</Badge>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="synthetic">
            <Card>
              <CardHeader><CardTitle className="text-base">Synthetic robot runs (last 40)</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-2 text-sm">
                {synthetic.length === 0 ? <div className="text-muted-foreground">No runs yet.</div> : synthetic.map((r) => (
                  <div key={r.id} className="border rounded p-2 flex justify-between items-center">
                    <span>{r.persona} · {r.device}</span>
                    <span>
                      <Badge variant={r.status === "pass" ? "secondary" : "destructive"}>{r.status}</Badge>
                      {r.failure_stage ? <span className="text-xs text-muted-foreground ml-2">{r.failure_stage}</span> : null}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="repairs">
            <Card>
              <CardHeader><CardTitle className="text-base">Repair changelog</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {repairs.length === 0 ? <div className="text-muted-foreground">No repairs applied.</div> : repairs.map((r) => (
                  <div key={r.id} className="flex justify-between border-b last:border-0 py-1">
                    <span>{r.category}</span>
                    <span className="text-xs">
                      <Badge variant="outline">{r.status}</Badge>{" "}
                      <Badge variant="outline">conf {Math.round((r.confidence || 0) * 100)}%</Badge>{" "}
                      <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}