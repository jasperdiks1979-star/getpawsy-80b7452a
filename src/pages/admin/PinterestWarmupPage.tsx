import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Rocket, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  product_slug: string;
  product_name: string | null;
  category_key: string | null;
  pin_variant: string | null;
  pin_title: string | null;
  status: string;
  scheduled_at: string | null;
  hook_group: string | null;
  content_type: string | null;
  meta: any;
};

export default function PinterestWarmupPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("pinterest_pin_queue")
      .select("id,product_slug,product_name,category_key,pin_variant,pin_title,status,scheduled_at,hook_group,content_type,meta")
      .like("idempotency_key", "warmup30:%")
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(500);
    setRows((data || []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const run = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-warmup-orchestrator", { body: {} });
      if (error) throw error;
      toast.success(`Inserted ${(data as any)?.inserted ?? 0} drafts`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setRunning(false);
    }
  };

  const total = rows.length;
  const drafts = rows.filter((r) => r.status === "draft").length;
  const scheduled = rows.filter((r) => !!r.scheduled_at).length;
  const products = new Set(rows.map((r) => r.product_slug)).size;
  const byCat: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  let avgCtr = 0;
  let ctrCount = 0;
  for (const r of rows) {
    if (r.category_key) byCat[r.category_key] = (byCat[r.category_key] || 0) + 1;
    const day = r.scheduled_at ? new Date(r.scheduled_at).toISOString().slice(0, 10) : "unscheduled";
    byDay[day] = (byDay[day] || 0) + 1;
    const p = r.meta?.predicted_ctr_pct;
    if (typeof p === "number") { avgCtr += p; ctrCount++; }
  }
  const topPredicted = [...rows]
    .filter((r) => typeof r.meta?.predicted_ctr_pct === "number")
    .sort((a, b) => (b.meta.predicted_ctr_pct - a.meta.predicted_ctr_pct))
    .slice(0, 12);

  return (
    <div className="p-6 space-y-4">
      <Helmet><title>Pinterest Warm-Up — Admin</title></Helmet>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Rocket className="h-5 w-5" /> Pinterest 30-Day Warm-Up</h1>
          <p className="text-sm text-muted-foreground">Draft queue from <code>pinterest-warmup-orchestrator</code>. Nothing publishes until you approve.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
          <Button onClick={run} disabled={running}>{running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}Build / Refresh Drafts</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Total in plan", total],
          ["Drafts", drafts],
          ["Scheduled", scheduled],
          ["Products used", products],
          ["Avg predicted CTR", ctrCount ? `${(avgCtr / ctrCount).toFixed(2)}%` : "—"],
        ].map(([k, v]) => (
          <Card key={String(k)}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k}</div><div className="text-2xl font-semibold">{v}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">By category</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <Badge key={k} variant="secondary">{k}: {v}</Badge>
          ))}
          {Object.keys(byCat).length === 0 && <div className="text-sm text-muted-foreground">No data yet.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Daily schedule</CardTitle></CardHeader>
        <CardContent className="text-xs grid grid-cols-2 md:grid-cols-5 gap-1">
          {Object.entries(byDay).sort().map(([day, n]) => (
            <div key={day} className="rounded border px-2 py-1 flex items-center justify-between"><span>{day}</span><span className="font-mono">{n}</span></div>
          ))}
          {Object.keys(byDay).length === 0 && <div className="text-sm text-muted-foreground">No data yet.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Top predicted winners</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr><th className="text-left p-2">Product</th><th className="text-left p-2">Category</th><th className="text-left p-2">Hook</th><th className="text-left p-2">Type</th><th className="text-right p-2">Pred. CTR</th></tr></thead>
            <tbody>
              {topPredicted.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 max-w-[260px] truncate">{r.product_name}</td>
                  <td className="p-2">{r.category_key}</td>
                  <td className="p-2">{r.hook_group}</td>
                  <td className="p-2"><Badge variant={r.content_type === "idea_pin" ? "default" : "secondary"}>{r.content_type}</Badge></td>
                  <td className="p-2 text-right tabular-nums">{r.meta?.predicted_ctr_pct}%</td>
                </tr>
              ))}
              {topPredicted.length === 0 && <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Run the orchestrator to populate.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}