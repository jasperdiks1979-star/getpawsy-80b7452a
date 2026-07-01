import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, RefreshCw } from "lucide-react";

type Reason = {
  code: string;
  label: string;
  sessions: number;
  share_pct: number;
  product_ids: string[];
  top_products: { product_id: string; dropped_sessions: number }[];
};

type Report = {
  ok: boolean;
  window_days: number;
  generated_at: string;
  totals: {
    pdp_sessions: number;
    atc_sessions: number;
    dropped_sessions: number;
    drop_rate_pct: number;
    diagnosed_sessions: number;
    undiagnosed_sessions: number;
    products_with_drops: number;
  };
  reasons: Reason[];
  notes: string[];
};

export default function PdpAtcDrilldownPage() {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(next = days) {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        `pdp-atc-dropoff-drilldown?days=${next}`,
        { method: "GET" },
      );
      if (error) throw error;
      setReport(data as Report);
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">PDP → ATC Drop-off Drilldown</h1>
          <p className="text-sm text-muted-foreground">
            Buckets sessions that viewed a PDP but never added to cart into concrete reason codes.
            Read-only — sources: canonical events, PDP health audits, inventory, frontend errors, UX signals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              onClick={() => {
                setDays(d);
                load(d);
              }}
            >
              {d}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => load(days)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="PDP sessions" value={report.totals.pdp_sessions} />
            <Stat label="ATC sessions" value={report.totals.atc_sessions} />
            <Stat label="Dropped" value={report.totals.dropped_sessions} />
            <Stat label="Drop rate" value={`${report.totals.drop_rate_pct}%`} />
            <Stat label="Products w/ drops" value={report.totals.products_with_drops} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reason codes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {report.reasons.map((r) => (
                <div key={r.code} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{r.code}</Badge>
                      <span className="text-sm font-medium">{r.label}</span>
                    </div>
                    <div className="text-sm tabular-nums text-muted-foreground">
                      {r.sessions} sessions · {r.share_pct}%
                    </div>
                  </div>
                  <Progress value={Math.min(100, r.share_pct)} />
                  {r.top_products.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Top products:{" "}
                      {r.top_products.map((p) => (
                        <span key={p.product_id} className="mr-2 font-mono">
                          {p.product_id.slice(0, 8)}…({p.dropped_sessions})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground">
            {report.notes.map((n, i) => (
              <div key={i}>• {n}</div>
            ))}
            <div className="mt-1">Generated {new Date(report.generated_at).toLocaleString()}</div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}