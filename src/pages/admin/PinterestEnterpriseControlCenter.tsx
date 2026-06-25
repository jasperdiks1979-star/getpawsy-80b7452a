import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

type Snapshot = {
  id?: string; captured_at?: string;
  full_access?: boolean; oauth_status?: string; token_expires_at?: string | null;
  scopes_granted?: string[]; scopes_missing?: string[];
  organic_health?: string; ads_health?: string; catalog_health?: string;
  tracking_health?: string; billing_health?: string; alert_count?: number;
};
type Check = {
  id: string; checked_at: string; area: string; endpoint: string;
  http_code: number | null; ok: boolean; required_scope: string | null;
  missing_scope: string | null; root_cause: string | null; fix: string | null;
  auto_fixable: boolean;
};
type Issue = {
  id: string; created_at: string; area: string; severity: string;
  root_cause: string | null; recommended_fix: string | null; status: string;
};
type Approval = {
  id: string; created_at: string; proposed_action: string; reason: string | null;
  risk: string | null; expected_benefit: string | null; status: string;
};
type Reco = {
  id: string; created_at: string; optimizer: string; recommendation: string;
  confidence: number | null; expected_impact: string | null; safe_to_auto_apply: boolean;
};

function healthColor(s?: string) {
  switch (s) {
    case "green": return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    case "yellow": return "bg-amber-500/15 text-amber-700 border-amber-500/30";
    case "red": return "bg-red-500/15 text-red-700 border-red-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function MetricCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function PinterestEnterpriseControlCenter() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [recos, setRecos] = useState<Reco[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = async () => {
    const [{ data: snapRow }, { data: checkRows }, { data: issueRows }, { data: appRows }, { data: recoRows }] =
      await Promise.all([
        supabase.from("pe_health_snapshots").select("*").order("captured_at",{ascending:false}).limit(1).maybeSingle(),
        supabase.from("pe_endpoint_checks").select("*").order("checked_at",{ascending:false}).limit(50),
        supabase.from("pe_issue_log").select("*").order("created_at",{ascending:false}).limit(50),
        supabase.from("pe_manual_approval_queue").select("*").eq("status","pending").order("created_at",{ascending:false}).limit(50),
        supabase.from("pe_ai_recommendations").select("*").eq("status","open").order("created_at",{ascending:false}).limit(50),
      ]);
    setSnap((snapRow ?? null) as Snapshot | null);
    setChecks((checkRows ?? []) as Check[]);
    setIssues((issueRows ?? []) as Issue[]);
    setApprovals((appRows ?? []) as Approval[]);
    setRecos((recoRows ?? []) as Reco[]);
    setUpdated(new Date());
  };

  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, []);

  // De-dupe latest check per endpoint
  const latestChecks = useMemo(() => {
    const seen = new Map<string, Check>();
    for (const c of checks) if (!seen.has(c.endpoint)) seen.set(c.endpoint, c);
    return Array.from(seen.values());
  }, [checks]);

  const runMatrix = async () => {
    setBusy("matrix");
    try {
      const { error } = await supabase.functions.invoke("pe-endpoint-matrix", { body: {} });
      if (error) throw error;
      toast.success("Endpoint matrix complete");
      await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const runOperator = async () => {
    setBusy("operator");
    try {
      const { error } = await supabase.functions.invoke("pe-ai-operator", { body: {} });
      if (error) throw error;
      toast.success("AI Operator pass complete");
      await load();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const reconnect = async () => {
    setBusy("reconnect");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-oauth-start", {
        body: { extra_scopes: [
          "ads:read","ads:write","catalogs:read","catalogs:write","billing:read","billing:write",
          "user_accounts:write","boards:read_secret","boards:write_secret",
          "pins:read_secret","pins:write_secret","biz_access:read","biz_access:write",
        ]},
      });
      if (error) throw error;
      const url = (data as any)?.authorize_url ?? (data as any)?.url;
      if (url) {
        sessionStorage.setItem("pe_full_access_pending","1");
        window.location.href = url;
      } else { toast.error("No authorize URL returned"); }
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const downloadJson = () => {
    const payload = { generated_at: new Date().toISOString(), snapshot: snap, checks: latestChecks, issues, approvals, recos };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pinterest-enterprise-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  useEffect(() => {
    if (sessionStorage.getItem("pe_full_access_pending") === "1") {
      sessionStorage.removeItem("pe_full_access_pending");
      void runMatrix();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Enterprise Control Center</h1>
          <p className="text-sm text-muted-foreground">
            Single source of truth for Pinterest organic, ads, catalog, tracking, and conversion health. Auto-refresh 30s.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="default" disabled={busy!==null} onClick={reconnect}>
            {busy==="reconnect" ? "Redirecting…" : "Reconnect Full Access"}
          </Button>
          <Button variant="outline" disabled={busy!==null} onClick={runMatrix}>
            {busy==="matrix" ? "Running…" : "Run Full Diagnostic"}
          </Button>
          <Button variant="outline" disabled={busy!==null} onClick={runOperator}>
            {busy==="operator" ? "Scanning…" : "Run AI Operator"}
          </Button>
          <Button variant="ghost" onClick={downloadJson}>Download JSON</Button>
        </div>
      </header>

      {/* Global Health */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <MetricCard label="Full Access" value={
          <Badge variant="outline" className={snap?.full_access ? healthColor("green") : healthColor("red")}>
            {snap?.full_access ? "YES" : "NO"}
          </Badge>
        } sub={snap?.oauth_status ?? "—"} />
        <MetricCard label="Organic" value={<Badge variant="outline" className={healthColor(snap?.organic_health)}>{snap?.organic_health ?? "—"}</Badge>} />
        <MetricCard label="Ads" value={<Badge variant="outline" className={healthColor(snap?.ads_health)}>{snap?.ads_health ?? "—"}</Badge>} />
        <MetricCard label="Catalog" value={<Badge variant="outline" className={healthColor(snap?.catalog_health)}>{snap?.catalog_health ?? "—"}</Badge>} />
        <MetricCard label="Tracking" value={<Badge variant="outline" className={healthColor(snap?.tracking_health)}>{snap?.tracking_health ?? "—"}</Badge>} />
        <MetricCard label="Billing" value={<Badge variant="outline" className={healthColor(snap?.billing_health)}>{snap?.billing_health ?? "—"}</Badge>} />
        <MetricCard label="Open alerts" value={snap?.alert_count ?? 0} sub={updated ? `as of ${updated.toLocaleTimeString()}` : "—"} />
      </section>

      <Tabs defaultValue="endpoints">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="endpoints">Endpoint Matrix</TabsTrigger>
          <TabsTrigger value="scopes">Scopes</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="approvals">Approval Queue</TabsTrigger>
          <TabsTrigger value="recos">AI Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="endpoints">
          <Card>
            <CardHeader><CardTitle>Live Endpoint Verification</CardTitle></CardHeader>
            <CardContent>
              {latestChecks.length===0 ? (
                <p className="text-sm text-muted-foreground">No checks yet — click Run Full Diagnostic.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left border-b">
                      <th className="py-2 pr-3">Area</th><th className="pr-3">Endpoint</th><th className="pr-3">HTTP</th>
                      <th className="pr-3">Status</th><th className="pr-3">Missing scope</th>
                      <th className="pr-3">Root cause</th><th className="pr-3">Fix</th><th>Auto-fixable</th>
                    </tr></thead>
                    <tbody>
                      {latestChecks.map(c => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 capitalize">{c.area}</td>
                          <td className="pr-3 font-mono">{c.endpoint}</td>
                          <td className="pr-3">{c.http_code ?? "—"}</td>
                          <td className="pr-3">
                            <Badge variant="outline" className={c.ok ? healthColor("green") : healthColor("red")}>
                              {c.ok ? "200 OK" : "blocked"}
                            </Badge>
                          </td>
                          <td className="pr-3 text-xs">{c.missing_scope ?? "—"}</td>
                          <td className="pr-3 text-xs text-muted-foreground">{c.root_cause ?? "—"}</td>
                          <td className="pr-3 text-xs">{c.fix ?? "—"}</td>
                          <td className="text-xs">{c.auto_fixable ? "yes" : "no"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scopes">
          <Card>
            <CardHeader><CardTitle>OAuth Scopes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Granted ({snap?.scopes_granted?.length ?? 0})</div>
                <div className="flex flex-wrap gap-1">
                  {(snap?.scopes_granted ?? []).map(s => <Badge key={s} variant="secondary">{s}</Badge>)}
                  {(snap?.scopes_granted?.length ?? 0)===0 && <span className="text-xs text-muted-foreground">none</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Missing required ({snap?.scopes_missing?.length ?? 0})</div>
                <div className="flex flex-wrap gap-1">
                  {(snap?.scopes_missing ?? []).map(s => <Badge key={s} variant="outline" className={healthColor("red")}>{s}</Badge>)}
                  {(snap?.scopes_missing?.length ?? 0)===0 && <span className="text-xs text-muted-foreground">all required scopes granted</span>}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Token expiry: {snap?.token_expires_at ? new Date(snap.token_expires_at).toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues">
          <Card>
            <CardHeader><CardTitle>Issue Log</CardTitle></CardHeader>
            <CardContent>
              {issues.length===0 ? <p className="text-sm text-muted-foreground">No issues detected.</p> : (
                <ul className="space-y-2">
                  {issues.map(i => (
                    <li key={i.id} className="flex items-start gap-3 text-sm border-b pb-2 last:border-0">
                      <Badge variant={i.severity==="CRITICAL"||i.severity==="HIGH" ? "destructive" : "secondary"}>{i.severity}</Badge>
                      <div className="flex-1">
                        <div className="font-medium">{i.area} · {i.root_cause}</div>
                        <div className="text-xs text-muted-foreground">fix: {i.recommended_fix ?? "—"}</div>
                      </div>
                      <Badge variant="outline">{i.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals">
          <Card>
            <CardHeader><CardTitle>Manual Approval Queue</CardTitle></CardHeader>
            <CardContent>
              {approvals.length===0 ? <p className="text-sm text-muted-foreground">Nothing waiting for approval.</p> : (
                <ul className="space-y-3">
                  {approvals.map(a => (
                    <li key={a.id} className="border rounded p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{a.proposed_action}</span>
                        <Badge variant="outline">{a.risk ?? "—"}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{a.reason}</div>
                      <div className="text-xs mt-1">Benefit: {a.expected_benefit ?? "—"}</div>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="outline"
                          onClick={async()=>{ await supabase.from("pe_manual_approval_queue").update({ status:"approved", decided_at: new Date().toISOString() }).eq("id", a.id); await load(); }}>
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost"
                          onClick={async()=>{ await supabase.from("pe_manual_approval_queue").update({ status:"rejected", decided_at: new Date().toISOString() }).eq("id", a.id); await load(); }}>
                          Reject
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recos">
          <Card>
            <CardHeader><CardTitle>AI Recommendations</CardTitle></CardHeader>
            <CardContent>
              {recos.length===0 ? <p className="text-sm text-muted-foreground">No open recommendations yet. Optimizers run on the hourly cron.</p> : (
                <ul className="space-y-2">
                  {recos.map(r => (
                    <li key={r.id} className="border-b pb-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{r.optimizer}</span>
                        <Badge variant="outline">{Math.round((r.confidence ?? 0)*100)}% confidence</Badge>
                      </div>
                      <div className="text-xs">{r.recommendation}</div>
                      <div className="text-xs text-muted-foreground">{r.expected_impact ?? ""}</div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}