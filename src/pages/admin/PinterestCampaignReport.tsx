import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type Report = {
  ok: boolean;
  campaign: string;
  window_days: number;
  since_iso: string;
  totals: Record<string, number>;
  rates_pct: Record<string, number>;
  per_pin: Array<{
    pin_id: string;
    sessions: number;
    outbound_clicks: number;
    atc_sessions: number;
    purchase_sessions: number;
    revenue_usd: number;
  }>;
  generated_at: string;
  error?: string;
};

export default function PinterestCampaignReport() {
  const [campaign, setCampaign] = useState("golden_pin");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-campaign-report", {
        body: { campaign, days },
      });
      if (error) throw error;
      setReport(data as Report);
    } catch (e) {
      setError((e as Error).message ?? "failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = report?.totals;
  const r = report?.rates_pct;

  const kpis = useMemo(
    () => [
      { label: "Outbound clicks", value: t?.outbound_clicks ?? 0 },
      { label: "Attributed sessions", value: t?.attributed_sessions ?? 0 },
      { label: "Add to cart", value: t?.add_to_cart_sessions ?? 0 },
      { label: "Checkout", value: t?.checkout_sessions ?? 0 },
      { label: "Purchases", value: t?.purchase_sessions ?? 0 },
      { label: "Revenue (USD)", value: t?.revenue_usd ?? 0 },
      { label: "Click → ATC %", value: r?.click_to_atc ?? 0 },
      { label: "Click → Purchase %", value: r?.click_to_purchase ?? 0 },
      { label: "Rev/Click USD", value: r?.revenue_per_click_usd ?? 0 },
    ],
    [t, r],
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pinterest Campaign Report</h1>
        <p className="text-sm text-muted-foreground">
          Outbound clicks and downstream conversions attributed via <code>utm_campaign</code>.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">utm_campaign</label>
          <Input value={campaign} onChange={(e) => setCampaign(e.target.value)} className="w-56" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Window (days)</label>
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
            className="w-28"
          />
        </div>
        <Button onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      {error && <div className="text-sm text-destructive">Error: {error}</div>}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {kpis.map((k) => (
              <Card key={k.label} className="p-4">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="text-2xl font-semibold tabular-nums">{k.value}</div>
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <div className="text-sm font-medium mb-3">Per-pin breakdown</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-4">Pin</th>
                    <th className="py-2 pr-4">Sessions</th>
                    <th className="py-2 pr-4">Clicks</th>
                    <th className="py-2 pr-4">ATC</th>
                    <th className="py-2 pr-4">Purchases</th>
                    <th className="py-2 pr-4">Revenue (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.per_pin.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-muted-foreground">
                        No sessions attributed to this campaign in the selected window.
                      </td>
                    </tr>
                  )}
                  {report.per_pin.map((p) => (
                    <tr key={p.pin_id} className="border-t border-border">
                      <td className="py-2 pr-4 font-mono text-xs">{p.pin_id}</td>
                      <td className="py-2 pr-4 tabular-nums">{p.sessions}</td>
                      <td className="py-2 pr-4 tabular-nums">{p.outbound_clicks}</td>
                      <td className="py-2 pr-4 tabular-nums">{p.atc_sessions}</td>
                      <td className="py-2 pr-4 tabular-nums">{p.purchase_sessions}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {p.revenue_usd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="text-xs text-muted-foreground">
            Generated {new Date(report.generated_at).toLocaleString()} • window since{" "}
            {new Date(report.since_iso).toLocaleString()}
          </div>
        </>
      )}
    </div>
  );
}