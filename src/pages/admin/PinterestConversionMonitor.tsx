import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  overall_score: number | null;
  status: string | null;
  pins_total: number | null;
  pins_ready: number | null;
  pins_failed: number | null;
  pins_repaired: number | null;
  products_at_risk: number | null;
  broken_urls: number | null;
  redirect_issues: number | null;
  utm_failures: number | null;
  inventory_failures: number | null;
  cart_failures: number | null;
  alerts_opened: number | null;
  alerts_auto_closed: number | null;
};

type AuditRow = {
  id: string;
  pin_id: string | null;
  product_slug: string | null;
  destination_url: string | null;
  final_url: string | null;
  http_status: number | null;
  product_status: string | null;
  inventory_status: string | null;
  cart_status: string | null;
  utm_intact: boolean | null;
  conversion_risk_score: number;
  risk_reasons: string[] | null;
  audit_date: string;
};

type Alert = {
  id: string;
  alert_type: string;
  severity: string;
  product_slug: string | null;
  destination_url: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  auto_closed: boolean;
};

function lightColor(status?: string | null) {
  if (status === "green") return "bg-green-500";
  if (status === "orange") return "bg-amber-500";
  if (status === "red") return "bg-destructive";
  return "bg-muted";
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function PinterestConversionMonitor() {
  const [run, setRun] = useState<Run | null>(null);
  const [worst, setWorst] = useState<AuditRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [{ data: runs }, { data: a }, { data: al }] = await Promise.all([
      supabase
        .from("pinterest_conversion_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1),
      supabase
        .from("pinterest_conversion_audit")
        .select("*")
        .order("conversion_risk_score", { ascending: false })
        .limit(25),
      supabase
        .from("pinterest_conversion_alerts")
        .select("*")
        .order("opened_at", { ascending: false })
        .limit(50),
    ]);
    setRun((runs?.[0] as Run) ?? null);
    setWorst((a as AuditRow[]) ?? []);
    setAlerts((al as Alert[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function runNow() {
    setRunning(true);
    try {
      await supabase.functions.invoke("pinterest-conversion-nightly", {
        body: { trigger: "manual" },
      });
    } finally {
      setRunning(false);
      await refresh();
    }
  }

  const openAlerts = useMemo(() => alerts.filter((x) => x.status === "open"), [alerts]);

  return (
    <>
      <Helmet>
        <title>Pinterest Conversion Monitor | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="space-y-6">
        {/* Header strip */}
        <Card>
          <CardContent className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-5 h-5 rounded-full ${lightColor(run?.status)}`} />
              <div>
                <div className="text-sm text-muted-foreground">Pinterest Conversion Health</div>
                <div className="text-3xl font-bold">
                  {run?.overall_score ?? "—"}<span className="text-base text-muted-foreground">/100</span>
                  <Badge className="ml-3 uppercase" variant="secondary">
                    {run?.status ?? "no runs yet"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Last run:{" "}
                  {run?.finished_at
                    ? new Date(run.finished_at).toLocaleString()
                    : run?.started_at
                    ? `started ${new Date(run.started_at).toLocaleString()}`
                    : "never"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={runNow} disabled={running} size="sm">
                {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {running ? "Running…" : "Run audit now"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Phase 6 widgets */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Stat label="Active Pins" value={run?.pins_total ?? "—"} />
          <Stat label="Pins Ready" value={run?.pins_ready ?? "—"} />
          <Stat label="Pins Failed" value={run?.pins_failed ?? "—"} />
          <Stat label="Pins Repaired" value={run?.pins_repaired ?? "—"} />
          <Stat label="Products At Risk" value={run?.products_at_risk ?? "—"} />
          <Stat label="Broken URLs" value={run?.broken_urls ?? "—"} />
          <Stat label="Redirect Issues" value={run?.redirect_issues ?? "—"} />
          <Stat label="UTM Failures" value={run?.utm_failures ?? "—"} />
          <Stat label="Inventory Failures" value={run?.inventory_failures ?? "—"} />
          <Stat label="Add-To-Cart Failures" value={run?.cart_failures ?? "—"} />
          <Stat label="Alerts Opened" value={run?.alerts_opened ?? "—"} />
          <Stat label="Alerts Auto-Closed" value={run?.alerts_auto_closed ?? "—"} />
        </div>

        {/* At-risk table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Highest risk pins (latest audit)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {worst.length === 0 ? (
              <div className="text-sm text-muted-foreground">No audit rows yet. Run an audit.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Score</th>
                      <th className="text-left p-2">Product slug</th>
                      <th className="text-left p-2">HTTP</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Inventory</th>
                      <th className="text-left p-2">Cart</th>
                      <th className="text-left p-2">UTM</th>
                      <th className="text-left p-2">Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worst.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="p-2 font-mono">
                          <Badge variant={r.conversion_risk_score >= 60 ? "destructive" : "secondary"}>
                            {r.conversion_risk_score}
                          </Badge>
                        </td>
                        <td className="p-2 font-mono text-xs max-w-[260px] truncate">
                          {r.product_slug || "—"}
                        </td>
                        <td className="p-2">{r.http_status ?? "—"}</td>
                        <td className="p-2">{r.product_status ?? "—"}</td>
                        <td className="p-2">{r.inventory_status ?? "—"}</td>
                        <td className="p-2">{r.cart_status ?? "—"}</td>
                        <td className="p-2">
                          {r.utm_intact ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-destructive" />
                          )}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {(r.risk_reasons ?? []).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts feed */}
        <Card>
          <CardHeader>
            <CardTitle>Alerts ({openAlerts.length} open)</CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="text-sm text-muted-foreground">No alerts.</div>
            ) : (
              <div className="space-y-1">
                {alerts.slice(0, 30).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-sm border rounded p-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge
                        variant={a.severity === "critical" ? "destructive" : "secondary"}
                      >
                        {a.alert_type}
                      </Badge>
                      <span className="font-mono text-xs truncate max-w-[280px]">
                        {a.product_slug || a.destination_url || "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {a.status === "open" ? (
                        <Badge variant="outline">open</Badge>
                      ) : (
                        <Badge variant="outline">
                          {a.auto_closed ? "auto-closed" : "closed"}
                        </Badge>
                      )}
                      <span>{new Date(a.opened_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}