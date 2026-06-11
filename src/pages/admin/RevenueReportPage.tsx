import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Totals = { sessions: number; purchases: number; revenue_cents: number };
type ReportData = {
  top_winners: Array<{ product_id: string; product_slug: string | null; score_0_1000: number; tier: string }>;
  totals: { d7: Totals; d30: Totals; d90: Totals };
  last_run: { started_at: string; products_scanned: number; opportunities_found: number; drafts_promoted: number } | null;
};

const fmtUsd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function RevenueReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("pinterest-revenue-brain", { body: { action: "report" } });
      if (error) throw error;
      setData(r as ReportData);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  useEffect(() => { load(); }, []);

  function exportCsv() {
    if (!data) return;
    const header = "rank,slug,score,tier";
    const rows = data.top_winners.map((w, i) => `${i + 1},${w.product_slug ?? w.product_id},${w.score_0_1000},${w.tier}`);
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `revenue-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Revenue Report</h1>
          <p className="text-muted-foreground text-sm mt-1">Daily forecast + recommended actions. Auto-refresh on load.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={load}>Refresh</Button>
          <Button disabled={busy || !data} onClick={exportCsv}>Export CSV</Button>
        </div>
      </div>

      {data?.last_run && (
        <Card>
          <CardHeader><CardTitle>Last Run</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-muted-foreground">Started</div><div>{new Date(data.last_run.started_at).toLocaleString()}</div></div>
            <div><div className="text-muted-foreground">Products scanned</div><div className="font-semibold">{data.last_run.products_scanned}</div></div>
            <div><div className="text-muted-foreground">Opportunities</div><div className="font-semibold">{data.last_run.opportunities_found}</div></div>
            <div><div className="text-muted-foreground">Drafts promoted</div><div className="font-semibold">{data.last_run.drafts_promoted}</div></div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["d7", "d30", "d90"] as const).map((k) => {
          const t = data?.totals[k] ?? { sessions: 0, purchases: 0, revenue_cents: 0 };
          return (
            <Card key={k}>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{k.toUpperCase()} forecast</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="text-3xl font-bold">{fmtUsd(t.revenue_cents)}</div>
                <div className="text-muted-foreground">{t.sessions.toLocaleString()} sessions · {t.purchases.toLocaleString()} purchases</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle>Top 20 winners likely to generate revenue in the next 30 days</CardTitle></CardHeader>
        <CardContent>
          {!data || data.top_winners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data. Run the brain first.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="py-2">#</th><th>Product</th><th>Score</th><th>Tier</th></tr>
                </thead>
                <tbody>
                  {data.top_winners.slice(0, 20).map((w, i) => (
                    <tr key={w.product_id} className="border-t border-border">
                      <td className="py-2">{i + 1}</td>
                      <td className="font-mono text-xs">{w.product_slug ?? w.product_id.slice(0, 12)}</td>
                      <td><Badge variant={w.score_0_1000 >= 700 ? "default" : "secondary"}>{w.score_0_1000}</Badge></td>
                      <td><Badge variant="outline">{w.tier}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recommended actions</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>• Promote top 25 by score ≥700 — already auto-handled by nightly run.</p>
          <p>• Manually review "high_opp" tier on /admin/revenue-brain for hidden gems.</p>
          <p>• Check Pinterest Spy for new competitor patterns to seed Creative Director.</p>
          <p>• Validate forecast accuracy weekly against actual Pinterest revenue.</p>
        </CardContent>
      </Card>
    </div>
  );
}