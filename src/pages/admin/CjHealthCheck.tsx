import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCcw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type HealthReport = {
  ok: boolean;
  verdict: string;
  duration_ms: number;
  checked_at: string;
  checked_by: string;
  env: Record<string, boolean>;
  token_cache: Record<string, unknown>;
  token_fetch: Record<string, unknown>;
  account_probe: Record<string, unknown>;
  recent_errors: Array<Record<string, unknown>>;
  last_runs: Array<Record<string, unknown>>;
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, { label: string; cls: string; icon: JSX.Element }> = {
    healthy: {
      label: "Healthy",
      cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    missing_api_key: {
      label: "CJ_API_KEY missing",
      cls: "bg-red-500/15 text-red-700 border-red-500/30",
      icon: <XCircle className="h-4 w-4" />,
    },
    auth_failed: {
      label: "Auth failed",
      cls: "bg-red-500/15 text-red-700 border-red-500/30",
      icon: <XCircle className="h-4 w-4" />,
    },
    network_error: {
      label: "Network error",
      cls: "bg-amber-500/15 text-amber-700 border-amber-500/30",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    degraded: {
      label: "Degraded",
      cls: "bg-amber-500/15 text-amber-700 border-amber-500/30",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
  };
  const v = map[verdict] ?? map.degraded;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium ${v.cls}`}
    >
      {v.icon} {v.label}
    </span>
  );
}

function KV({ k, v }: { k: string; v: unknown }) {
  let display: string;
  if (v === null || v === undefined) display = "—";
  else if (typeof v === "boolean") display = v ? "yes" : "no";
  else if (typeof v === "object") display = JSON.stringify(v);
  else display = String(v);
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-foreground text-right break-all">{display}</span>
    </div>
  );
}

export default function CjHealthCheck() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("cj-health-check", {
        body: {},
      });
      if (err) throw err;
      if (!data?.ok) throw new Error(data?.message ?? "Unknown error");
      setReport(data as HealthReport);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(`Health check failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <Helmet>
        <title>CJ Health Check — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">CJ API Health Check</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live diagnose van CJ_API_KEY, token-cache, authenticatie en recente fouten.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {report && <VerdictBadge verdict={report.verdict} />}
          <Button onClick={run} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
            Re-check
          </Button>
        </div>
      </header>

      {error && (
        <Card className="border-red-500/40">
          <CardContent className="pt-4 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}

      {report && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Environment variables</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(report.env).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-1.5 text-sm border-b border-border/50 last:border-0">
                    <span className="font-mono">{k}</span>
                    {v ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">present</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30">missing</Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Token cache</CardTitle></CardHeader>
              <CardContent>
                {Object.entries(report.token_cache).map(([k, v]) => (
                  <KV key={k} k={k} v={v} />
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Live token fetch — <span className="font-mono text-xs text-muted-foreground">/authentication/getAccessToken</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.entries(report.token_fetch).map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Account probe — <span className="font-mono text-xs text-muted-foreground">/setting/getCountry</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.entries(report.account_probe).map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Last 5 sync runs</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {report.last_runs.length === 0 && (
                <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
              )}
              {report.last_runs.map((r) => (
                <div key={String(r.id)} className="text-xs font-mono border rounded p-2 bg-muted/30">
                  <div className="flex justify-between mb-1">
                    <span>{String(r.started_at)}</span>
                    <Badge variant="outline">{String(r.status)}</Badge>
                  </div>
                  <div className="text-muted-foreground break-all">{JSON.stringify(r.totals)}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Recent CJ fetch errors (last 20)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {report.recent_errors.length === 0 && (
                <p className="text-sm text-muted-foreground">No recent fetch errors. ✅</p>
              )}
              {report.recent_errors.map((e) => (
                <div key={String(e.id)} className="text-xs font-mono border rounded p-2 bg-muted/30">
                  <div className="flex justify-between mb-1">
                    <span>{String(e.created_at)}</span>
                    <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30">{String(e.action)}</Badge>
                  </div>
                  <div className="text-muted-foreground">product: {String(e.product_id)}</div>
                  <div className="text-muted-foreground break-all">{JSON.stringify(e.after)}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-right">
            Checked at {new Date(report.checked_at).toLocaleString()} by {report.checked_by} · {report.duration_ms}ms
          </p>
        </>
      )}
    </div>
  );
}