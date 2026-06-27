import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import TrafficFilterToggle, { useTrafficFilter } from "@/components/admin/TrafficFilterToggle";

type Cell = number | null;
type Row = { layer: string; clicks: Cell; lpv: Cell; pv: Cell; engagement: Cell; sessions: Cell; atc: Cell; checkout: Cell; purchase: Cell };

function diff(values: Cell[]): boolean {
  const v = values.filter((x): x is number => typeof x === "number" && x > 0);
  if (v.length < 2) return false;
  const max = Math.max(...v); const min = Math.min(...v);
  return min === 0 || (max - min) / max > 0.1;
}

export default function AttributionComparePage() {
  const [filter] = useTrafficFilter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      // Server (visitor_activity sessions)
      const va = await supabase.from("visitor_activity").select("session_id", { count: "exact", head: true }).gte("created_at", since);

      // Engagement starts
      const es = await supabase.from("analytics_engagement_starts").select("session_id", { count: "exact", head: true }).gte("fired_at", since);

      // Funnel waterfall counts
      const fw = await supabase.from("analytics_funnel_waterfall").select("page_view_at,add_to_cart_at,begin_checkout_at,purchase_at").gte("updated_at", since);
      const fwRows = fw.data || [];
      const pv = fwRows.filter((r: any) => r.page_view_at).length;
      const atc = fwRows.filter((r: any) => r.add_to_cart_at).length;
      const co = fwRows.filter((r: any) => r.begin_checkout_at).length;
      const pur = fwRows.filter((r: any) => r.purchase_at).length;

      // UTM session log (server-classified sessions)
      const utm = await supabase.from("utm_session_log").select("session_id,utm_source", { count: "exact" }).gte("created_at", since);
      const utmRows = utm.data || [];
      const ttClicks = utmRows.filter((r: any) => (r.utm_source || "").toLowerCase() === "tiktok").length;
      const piClicks = utmRows.filter((r: any) => (r.utm_source || "").toLowerCase().includes("pinterest")).length;
      const fbClicks = utmRows.filter((r: any) => (r.utm_source || "").toLowerCase() === "facebook").length;

      // Classification filter (best-effort)
      const cls = await supabase.from("analytics_traffic_classification").select("session_id,traffic_type").gte("created_at", since);
      const clsRows = cls.data || [];
      const matches = (t: string) => {
        if (filter === "all") return true;
        if (filter === "human") return t === "human";
        if (filter === "bot") return t === "bot" || t === "crawler";
        return t === filter;
      };
      const humanIds = new Set(clsRows.filter((r: any) => matches(r.traffic_type)).map((r: any) => r.session_id));
      const humanFilter = (sessionId: string) => humanIds.size === 0 ? true : humanIds.has(sessionId);

      setRows([
        { layer: "Server (/go)", clicks: utmRows.length, lpv: null, pv: null, engagement: null, sessions: null, atc: null, checkout: null, purchase: null },
        { layer: "TikTok", clicks: ttClicks, lpv: null, pv: null, engagement: null, sessions: null, atc: null, checkout: null, purchase: null },
        { layer: "Pinterest", clicks: piClicks, lpv: null, pv: null, engagement: null, sessions: null, atc: null, checkout: null, purchase: null },
        { layer: "Meta", clicks: fbClicks, lpv: null, pv: null, engagement: null, sessions: null, atc: null, checkout: null, purchase: null },
        { layer: "GA4 (proxy via funnel)", clicks: null, lpv: null, pv: pv, engagement: null, sessions: null, atc: atc, checkout: co, purchase: pur },
        { layer: "Visitor Activity", clicks: null, lpv: null, pv: null, engagement: null, sessions: va.count ?? 0, atc: null, checkout: null, purchase: null },
        { layer: "Engagement Start", clicks: null, lpv: null, pv: null, engagement: es.count ?? 0, sessions: null, atc: null, checkout: null, purchase: null },
      ]);
      setLoading(false);
    })();
  }, [filter]);

  const cols: (keyof Row)[] = ["clicks","lpv","pv","engagement","sessions","atc","checkout","purchase"];
  const colHead = ["Clicks","LPV","PV","Engagement","Sessions","ATC","Checkout","Purchase"];

  // Highlight discrepancies per column
  const flags = cols.map((c) => diff(rows.map((r) => r[c] as Cell)));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attribution Compare</h1>
          <p className="text-sm text-muted-foreground">Last 24h, side-by-side per layer. Highlighted columns differ by &gt;10%.</p>
        </div>
        <TrafficFilterToggle />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-2">Layer</th>
              {colHead.map((h, i) => (
                <th key={h} className={`text-right p-2 ${flags[i] ? "text-amber-300" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="p-4 text-muted-foreground">Loading…</td></tr>}
            {rows.map((r) => (
              <tr key={r.layer} className="border-t border-border">
                <td className="p-2 font-medium">{r.layer}</td>
                {cols.map((c) => (
                  <td key={c} className="p-2 text-right tabular-nums">{r[c] === null ? "—" : r[c]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}