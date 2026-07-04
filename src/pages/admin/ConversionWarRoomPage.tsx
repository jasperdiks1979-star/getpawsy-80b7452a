import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Activity, RefreshCw } from "lucide-react";
import { SessionJourneysPanel } from "@/components/admin/SessionJourneysPanel";
import { RevenueForensicsPanel } from "@/components/admin/RevenueForensicsPanel";
import { CanonicalKpiStrip } from "@/components/admin/CanonicalKpiStrip";

type Bottleneck = {
  rank: number;
  area: string;
  finding: string;
  evidence: Record<string, unknown>;
  est_revenue_loss_pct: number;
  confidence: number;
  reuses: string[];
  repair_action: string;
};
type Report = {
  generated_at: string;
  window_days: number;
  funnel: Record<string, number>;
  human_funnel: Record<string, number>;
  dropoffs: Record<string, number>;
  technical: any;
  bottlenecks: Bottleneck[];
  first_sale_probability_pct: number;
  first_sale_eta_hours: number;
  executive_summary: string;
};

const FUNNEL_ORDER = [
  "sessions", "landing", "engagement_start", "view_item",
  "add_to_cart", "view_cart", "begin_checkout", "payment", "purchase",
];

export default function ConversionWarRoomPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("genesis-v7-war-room", { body: {} });
      if (error) throw error;
      setReport(data as Report);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const top = report?.funnel?.sessions ?? 0;

  return (
    <div className="p-6 space-y-6">
      <CanonicalKpiStrip defaultRange="24h" title="Canonical truth — War Room" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="w-6 h-6" /> Conversion War Room · Genesis V7
          </h1>
          <p className="text-sm text-muted-foreground">
            Reuses Analytics Truth, CIE, CRO, PRE, Pinterest Analytics, Orders & PDP Health.
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Re-audit
        </Button>
      </div>

      {error && (
        <Card className="border-destructive"><CardContent className="p-4 text-sm text-destructive">{error}</CardContent></Card>
      )}

      {report && (
        <>
          <Card>
            <CardHeader><CardTitle>Executive Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>{report.executive_summary}</div>
              <div className="flex gap-4 pt-2">
                <Badge variant="outline">First-sale probability: <b className="ml-1">{report.first_sale_probability_pct}%</b></Badge>
                <Badge variant="outline">ETA: <b className="ml-1">{report.first_sale_eta_hours}h</b></Badge>
                <Badge variant="secondary">Window: {report.window_days}d</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Funnel (all traffic)</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-9 gap-2 text-xs">
                {FUNNEL_ORDER.map((k) => {
                  const v = report.funnel[k] ?? 0;
                  const pct = top > 0 ? Math.round((v / top) * 1000) / 10 : 0;
                  return (
                    <div key={k} className="rounded border p-2 text-center">
                      <div className="text-muted-foreground uppercase tracking-wide">{k}</div>
                      <div className="text-lg font-semibold">{v}</div>
                      <div className="text-muted-foreground">{pct}%</div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-5 gap-2 text-xs mt-4">
                {Object.entries(report.dropoffs).map(([k, v]) => (
                  <div key={k} className="rounded bg-muted p-2 text-center">
                    <div className="text-muted-foreground">{k}</div>
                    <div className="text-base font-semibold text-destructive">-{v}%</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Ranked Bottlenecks</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {report.bottlenecks.length === 0 && <div className="text-sm text-muted-foreground">No dominant blocker detected.</div>}
              {report.bottlenecks.map((b) => (
                <div key={b.rank} className="rounded border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium">#{b.rank} · {b.area}</div>
                    <div className="flex gap-2">
                      <Badge>Loss {b.est_revenue_loss_pct}%</Badge>
                      <Badge variant="outline">Conf {b.confidence}%</Badge>
                    </div>
                  </div>
                  <div className="text-sm mb-2">{b.finding}</div>
                  <div className="text-xs text-muted-foreground mb-1">Reuses: {b.reuses.join(" · ")}</div>
                  <div className="text-xs"><b>Repair:</b> {b.repair_action}</div>
                  <pre className="mt-2 text-[10px] bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(b.evidence, null, 2)}</pre>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Technical Signals</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{JSON.stringify(report.technical, null, 2)}</pre>
            </CardContent>
          </Card>

          <RevenueForensicsPanel />
          <SessionJourneysPanel />
        </>
      )}
    </div>
  );
}