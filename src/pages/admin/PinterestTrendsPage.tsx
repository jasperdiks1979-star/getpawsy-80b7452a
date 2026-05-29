import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp } from "lucide-react";

export default function PinterestTrendsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: res, error } = await supabase.functions.invoke("pinterest-intelligence-api", {
          body: { panel: "trends" },
        });
        if (error) throw error;
        setData(res);
      } catch (e: any) {
        setErr(e?.message || "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const trends: any[] = (data?.trends || data?.signals || []) as any[];

  return (
    <div className="p-6 space-y-4">
      <Helmet><title>Pinterest Trends — Admin</title></Helmet>
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Pinterest Trends</h1>
        <p className="text-sm text-muted-foreground">US seasonal calendar + evergreen pet keywords. Sourced from <code>pinterest_trend_signals</code>.</p>
      </header>
      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading trends…</div>
      ) : err ? (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">{err}</div>
      ) : trends.length === 0 ? (
        <div className="text-sm text-muted-foreground">No trend signals yet — cron runs daily 04:00 UTC.</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-2">Keyword</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Source</th>
                  <th className="p-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {trends.map((t, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-medium">{t.keyword || t.term || "—"}</td>
                    <td className="p-2">{t.category || t.niche || "—"}</td>
                    <td className="p-2"><Badge variant="outline">{t.source || "seasonal"}</Badge></td>
                    <td className="p-2 text-right">{typeof t.score === "number" ? Math.round(t.score) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}