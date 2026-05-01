import { useEffect, useState, useCallback, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { AlertTriangle, RefreshCw, ShieldAlert, PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface AnomalyRow {
  id: string;
  session_id: string;
  anomaly_type: string;
  source_channel: string | null;
  severity: string;
  sample_event_ids: string[];
  details: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  missing_utm_log: "UTM-log ontbreekt",
  orphan_cart: "Cart zonder browsing",
  orphan_checkout: "Checkout zonder cart",
  session_id_mismatch: "Session-id mismatch",
  multi_visitor_collision: "Meerdere visitors per session",
};

function severityBadge(s: string) {
  if (s === "critical") return <Badge variant="destructive">Critical</Badge>;
  if (s === "warn") return <Badge className="bg-amber-500 hover:bg-amber-500">Warn</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

export default function TrackingAnomaliesPage() {
  const [rows, setRows] = useState<AnomalyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from("tracking_anomalies")
        .select("id, session_id, anomaly_type, source_channel, severity, sample_event_ids, details, resolved, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (err) throw err;
      setRows((data || []) as AnomalyRow[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    const ch = supabase
      .channel("tracking-anomalies")
      .on("postgres_changes", { event: "*", schema: "public", table: "tracking_anomalies" }, () => fetchRows())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchRows]);

  const runValidator = async () => {
    setRunning(true);
    try {
      const { error: err } = await supabase.functions.invoke("tracking-session-validator", { body: {} });
      if (err) throw err;
      await fetchRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validator failed");
    } finally {
      setRunning(false);
    }
  };

  const summary = useMemo(() => {
    const byType: Record<string, number> = {};
    let critical = 0;
    for (const r of rows) {
      byType[r.anomaly_type] = (byType[r.anomaly_type] || 0) + 1;
      if (r.severity === "critical") critical++;
    }
    return { byType, critical, total: rows.length };
  }, [rows]);

  return (
    <>
      <Helmet>
        <title>Tracking Anomalies | Admin</title>
      </Helmet>
      <div className="container py-6 space-y-6 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" />
              Tracking Anomalies
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sessies waarbij events niet correct gekoppeld konden worden aan een sessie of UTM-log. Validator draait elke 30 min automatisch.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={runValidator} disabled={running}>
              <PlayCircle className={`h-4 w-4 mr-1 ${running ? "animate-spin" : ""}`} />
              {running ? "Running…" : "Run nu"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">Fout: {error}</CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Totaal anomalies</p>
              <p className="text-2xl font-bold mt-1">{summary.total}</p>
            </CardContent>
          </Card>
          <Card className={summary.critical > 0 ? "border-destructive/60" : ""}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Critical</p>
              <p className="text-2xl font-bold mt-1">{summary.critical}</p>
            </CardContent>
          </Card>
          {Object.entries(summary.byType).slice(0, 2).map(([t, n]) => (
            <Card key={t}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground truncate">{TYPE_LABELS[t] || t}</p>
                <p className="text-2xl font-bold mt-1">{n}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recente anomalies</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Geen anomalies gedetecteerd. 🎉
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Tijd</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Severity</th>
                      <th className="text-left p-2">Session</th>
                      <th className="text-left p-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-border align-top">
                        <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("nl-NL")}
                        </td>
                        <td className="p-2 text-xs font-medium">{TYPE_LABELS[r.anomaly_type] || r.anomaly_type}</td>
                        <td className="p-2">{severityBadge(r.severity)}</td>
                        <td className="p-2 font-mono text-xs">{r.session_id.slice(0, 12)}…</td>
                        <td className="p-2 text-xs max-w-[420px]">
                          <code className="text-[11px] break-all whitespace-pre-wrap">
                            {JSON.stringify(r.details)}
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}