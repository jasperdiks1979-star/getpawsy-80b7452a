import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type KillSwitch = {
  status: string;
  reason: string | null;
  triggered_at: string | null;
  cleared_at: string | null;
  triggered_by: string | null;
  golden_run_id: string | null;
  updated_at: string;
};

type Certificate = {
  id: string;
  issued_at: string;
  certificate_status: string;
  kill_switch_status: string;
  anonymous_journey_ok: boolean | null;
  checkout_ok: boolean | null;
  stripe_ok: boolean | null;
  revenue_ok: boolean | null;
  regression_ok: boolean | null;
  confidence: number | null;
  sha256: string;
};

/**
 * GENESIS Ω∞ — Production Safety Certification.
 *
 * Single admin dashboard for the Zero-Regression Constitution. Reads from
 * `genesis_golden_runs` (populated by the `genesis-golden-customer` edge
 * function). Extends `/admin/production-validation`; does NOT replace it.
 */

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger_source: string;
  git_commit: string | null;
  deployment_id: string | null;
  migration_id: string | null;
  products_visible: number | null;
  dog_visible: number | null;
  cat_visible: number | null;
  search_visible: number | null;
  checkout_ok: boolean | null;
  stripe_session_ok: boolean | null;
  journey_ok: boolean | null;
  rls_ok: boolean | null;
  view_checksum: string | null;
  policy_checksum: string | null;
  sha256: string | null;
  passed_count: number;
  failed_count: number;
  warning_count: number;
  duration_ms: number | null;
};

type Check = {
  id: string;
  run_id: string;
  phase: string;
  category: string;
  name: string;
  status: string;
  observed: number | null;
  threshold: number | null;
  details: Record<string, unknown>;
};

function StatusBadge({ status }: { status: string }) {
  const v =
    status === "pass" ? "default" : status === "warning" || status === "warn" ? "secondary" : "destructive";
  return <Badge variant={v as "default" | "secondary" | "destructive"}>{status.toUpperCase()}</Badge>;
}

function BoolBadge({ value, label }: { value: boolean | null; label: string }) {
  if (value === null) return <Badge variant="secondary">{label}: —</Badge>;
  return <Badge variant={value ? "default" : "destructive"}>{label}: {value ? "OK" : "FAIL"}</Badge>;
}

export default function ProductionSafetyCertificationPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [killSwitch, setKillSwitch] = useState<KillSwitch | null>(null);
  const [cert, setCert] = useState<Certificate | null>(null);

  const loadStatus = useCallback(async () => {
    const [ks, c] = await Promise.all([
      supabase.from("ceo_kill_switch_state").select("*").eq("singleton", true).maybeSingle(),
      supabase.from("ceo_production_certificates").select("*").order("issued_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (ks.data) setKillSwitch(ks.data as unknown as KillSwitch);
    if (c.data) setCert(c.data as unknown as Certificate);
  }, []);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("genesis_golden_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []) as unknown as Run[];
    setRuns(rows);
    if (rows[0] && !selected) setSelected(rows[0]);
  }, [selected]);

  const loadChecks = useCallback(async (runId: string) => {
    const { data, error } = await supabase
      .from("genesis_golden_checks")
      .select("*")
      .eq("run_id", runId)
      .order("phase", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setChecks((data ?? []) as unknown as Check[]);
  }, []);

  useEffect(() => { void loadRuns(); void loadStatus(); }, [loadRuns, loadStatus]);
  useEffect(() => { if (selected) void loadChecks(selected.id); }, [selected, loadChecks]);

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("genesis-golden-customer", {
      body: { trigger: "manual_admin" },
    });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    const d = data as { status?: string; passed?: number; failed?: number };
    toast.success(`Golden Customer ${d?.status ?? "done"} — ${d?.passed ?? 0} pass, ${d?.failed ?? 0} fail`);
    await loadRuns();
    await loadStatus();
  };

  const setOverride = async (on: boolean) => {
    const { error } = await supabase.from("ceo_kill_switch_state")
      .update({
        status: on ? "hotfix_override" : "clear",
        reason: on ? "Hotfix override (admin)" : "Override cleared (admin)",
        cleared_at: on ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("singleton", true);
    if (error) { toast.error(error.message); return; }
    await supabase.from("ceo_kill_switch_events").insert({
      event: on ? "override_on" : "override_off",
      previous_status: killSwitch?.status ?? null,
      new_status: on ? "hotfix_override" : "clear",
      reason: on ? "Manual hotfix override" : "Manual override cleared",
      actor: "admin_ui",
    });
    toast.success(on ? "Hotfix override ENABLED" : "Override cleared");
    await loadStatus();
  };

  const latest = runs[0];
  const ksColor =
    killSwitch?.status === "tripped" ? "destructive"
    : killSwitch?.status === "degraded" ? "secondary"
    : killSwitch?.status === "hotfix_override" ? "secondary" : "default";
  const passRate = runs.length ? (runs.filter(r => r.status === "pass").length / runs.length) * 100 : 0;
  const meanDuration = runs.length
    ? Math.round(runs.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / runs.length)
    : 0;
  const lastFail = runs.find(r => r.status === "fail");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Production Safety Certification</h1>
          <p className="text-muted-foreground">
            Genesis Ω∞ Zero-Regression Constitution — every deployment gated on the Anonymous Golden Customer.
          </p>
        </div>
        <Button onClick={runNow} disabled={running}>
          {running ? "Running Golden Customer…" : "Run Golden Customer now"}
        </Button>
      </div>

      <Alert>
        <AlertDescription>
          Target: <strong>https://getpawsy.pet</strong> — validated as a fully anonymous visitor (no login, no cookies,
          no admin, no service role). Fails a deployment automatically when the anonymous storefront or checkout is broken.
        </AlertDescription>
      </Alert>

      <Card className={killSwitch?.status === "tripped" ? "border-destructive" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>CEO Kill Switch</span>
            <Badge variant={ksColor as "default" | "secondary" | "destructive"}>
              {(killSwitch?.status ?? "unknown").toUpperCase()}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {killSwitch?.reason ?? "No status recorded yet."}
          </div>
          <div className="text-xs font-mono">
            {killSwitch?.triggered_at && <>Tripped: {new Date(killSwitch.triggered_at).toLocaleString()} · </>}
            {killSwitch?.triggered_by && <>By: {killSwitch.triggered_by} · </>}
            Updated: {killSwitch ? new Date(killSwitch.updated_at).toLocaleString() : "—"}
          </div>
          <div className="flex gap-2">
            {killSwitch?.status !== "hotfix_override" ? (
              <Button variant="destructive" size="sm" onClick={() => setOverride(true)}>
                Enable hotfix override
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setOverride(false)}>
                Clear override
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            When TRIPPED: all standard deployments and migrations are blocked. Only hotfixes, rollbacks,
            diagnostics, monitoring, evidence collection, and production validation may proceed.
          </div>
        </CardContent>
      </Card>

      {cert && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Latest CEO Production Safety Certificate</span>
              <StatusBadge status={cert.certificate_status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <BoolBadge value={cert.anonymous_journey_ok} label="Journey" />
              <BoolBadge value={cert.checkout_ok} label="Checkout" />
              <BoolBadge value={cert.stripe_ok} label="Stripe" />
              <BoolBadge value={cert.revenue_ok} label="Revenue" />
              <BoolBadge value={cert.regression_ok} label="Regression" />
            </div>
            <div className="text-xs font-mono break-all">
              Confidence: {cert.confidence != null ? (cert.confidence * 100).toFixed(1) + "%" : "—"} ·
              SHA-256: {cert.sha256} · Issued: {new Date(cert.issued_at).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle>Certification</CardTitle></CardHeader>
          <CardContent><StatusBadge status={latest?.status ?? "unknown"} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Anonymous products</CardTitle></CardHeader>
          <CardContent className="text-2xl font-mono">{latest?.products_visible ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle>Dog / Cat</CardTitle></CardHeader>
          <CardContent className="text-2xl font-mono">
            {latest?.dog_visible ?? "—"} / {latest?.cat_visible ?? "—"}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Pass rate (50 runs)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-mono">{passRate.toFixed(1)}%</CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle>Journey Integrity</CardTitle></CardHeader>
          <CardContent className="space-x-2">
            <BoolBadge value={latest?.journey_ok ?? null} label="Journey" />
            <BoolBadge value={latest?.checkout_ok ?? null} label="Checkout" />
            <BoolBadge value={latest?.stripe_session_ok ?? null} label="Stripe" />
            <BoolBadge value={latest?.rls_ok ?? null} label="RLS" />
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Mean detection window</CardTitle></CardHeader>
          <CardContent className="text-sm">
            Cron every 5 min · mean run {meanDuration} ms<br/>
            Last fail: {lastFail ? new Date(lastFail.started_at).toLocaleString() : "none"}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Evidence</CardTitle></CardHeader>
          <CardContent className="text-xs font-mono break-all">
            SHA-256: {latest?.sha256 ?? "—"}<br/>
            View: {latest?.view_checksum?.slice(0, 12) ?? "—"} · Policy: {latest?.policy_checksum?.slice(0, 12) ?? "—"}
          </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Golden Customer runs</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div>Loading…</div> : (
            <div className="space-y-2">
              {runs.map(r => (
                <button key={r.id} onClick={() => setSelected(r)}
                  className={`w-full text-left p-3 border rounded-md flex items-center justify-between hover:bg-accent ${selected?.id === r.id ? "bg-accent" : ""}`}>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status} />
                    <span className="text-sm">{new Date(r.started_at).toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">{r.trigger_source}</span>
                    {r.migration_id && <Badge variant="outline">migration {r.migration_id.slice(0, 12)}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    prod:{r.products_visible ?? "—"} · dog:{r.dog_visible ?? "—"} · cat:{r.cat_visible ?? "—"} · {r.passed_count}✓ {r.failed_count}✗ · {r.duration_ms ?? 0}ms
                  </div>
                </button>
              ))}
              {runs.length === 0 && (
                <div className="text-sm text-muted-foreground">
                  No Golden runs yet — click "Run Golden Customer now".
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>Checks — {new Date(selected.started_at).toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {checks.map(c => (
                <div key={c.id} className="flex items-center justify-between border-b py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <StatusBadge status={c.status} />
                    <span className="font-mono text-xs text-muted-foreground">{c.phase}/{c.category}</span>
                    <span>{c.name}</span>
                    {c.threshold !== null && (
                      <Badge variant="outline">
                        {c.observed ?? "—"}/{c.threshold}
                      </Badge>
                    )}
                  </div>
                  <pre className="text-xs text-muted-foreground max-w-xl overflow-hidden text-ellipsis">
                    {JSON.stringify(c.details)}
                  </pre>
                </div>
              ))}
              {checks.length === 0 && (
                <div className="text-sm text-muted-foreground">No checks recorded for this run.</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}