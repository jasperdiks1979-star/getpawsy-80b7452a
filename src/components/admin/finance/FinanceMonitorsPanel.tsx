import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radar, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Anomaly = {
  id: string;
  anomaly_type: string;
  title: string;
  detail: string | null;
  z_score: number | null;
  status: string;
  supplier_slug: string | null;
  detected_at: string;
  expected_minor: number | null;
  observed_minor: number | null;
  currency: string | null;
};

const fmtMinor = (m: number | null, cur = "EUR") =>
  m == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: cur }).format(m / 100);

function statusBadge(a: Anomaly): { text: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (a.status === "resolved") return { text: "Verified", variant: "default" };
  if (Math.abs(a.z_score ?? 0) >= 3) return { text: "Needs Review", variant: "destructive" };
  if ((a.z_score ?? 0) === 0) return { text: "Estimated", variant: "secondary" };
  return { text: "Needs Review", variant: "secondary" };
}

export function FinanceMonitorsPanel({ entityId: _ }: { entityId: string | null }) {
  const [rows, setRows] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<null | "anomaly" | "alerts">(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("finance_anomalies")
      .select("id,anomaly_type,title,detail,z_score,status,supplier_slug,detected_at,expected_minor,observed_minor,currency")
      .order("detected_at", { ascending: false })
      .limit(15);
    setRows((data ?? []) as Anomaly[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runMonitor = async (which: "anomaly" | "alerts") => {
    setRunning(which);
    const fn = which === "anomaly" ? "finance-anomaly-scan" : "finance-alerts-scan";
    const { error } = await supabase.functions.invoke(fn, { body: {} });
    setRunning(null);
    if (error) toast.error(`${fn} failed: ${error.message}`);
    else {
      toast.success(`${fn} completed`);
      void load();
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2"><Radar className="h-4 w-4" /> Finance AI Monitors</CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => runMonitor("anomaly")} disabled={running !== null}>
            <Play className="h-3 w-3 mr-1" /> Anomaly scan
          </Button>
          <Button size="sm" variant="outline" onClick={() => runMonitor("alerts")} disabled={running !== null}>
            <Play className="h-3 w-3 mr-1" /> Alerts scan
          </Button>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No anomalies detected. Run a scan to check now.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">Detected</th>
                  <th className="py-1 pr-3">Type</th>
                  <th className="py-1 pr-3">Title</th>
                  <th className="py-1 pr-3">Supplier</th>
                  <th className="py-1 pr-3 text-right">Observed</th>
                  <th className="py-1 pr-3 text-right">Expected</th>
                  <th className="py-1 pr-3 text-right">Z</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const s = statusBadge(a);
                  return (
                    <tr key={a.id} className="border-t align-top">
                      <td className="py-1 pr-3 text-xs">{new Date(a.detected_at).toLocaleString()}</td>
                      <td className="py-1 pr-3 text-xs">{a.anomaly_type}</td>
                      <td className="py-1 pr-3">
                        <div className="font-medium">{a.title}</div>
                        {a.detail && <div className="text-xs text-muted-foreground line-clamp-2">{a.detail}</div>}
                      </td>
                      <td className="py-1 pr-3 text-xs">{a.supplier_slug ?? "—"}</td>
                      <td className="py-1 pr-3 text-right">{fmtMinor(a.observed_minor, a.currency ?? "EUR")}</td>
                      <td className="py-1 pr-3 text-right">{fmtMinor(a.expected_minor, a.currency ?? "EUR")}</td>
                      <td className="py-1 pr-3 text-right">{a.z_score == null ? "—" : a.z_score.toFixed(1)}</td>
                      <td className="py-1"><Badge variant={s.variant}>{s.text}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}