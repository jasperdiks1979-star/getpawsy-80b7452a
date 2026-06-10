import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, MousePointerClick, Bookmark, Eye, DollarSign, ShoppingBag, Layers, Sparkles } from "lucide-react";

interface Dashboard {
  today: { published: number };
  pipeline: { drafts: number; ready: number };
  last7d: { impressions: number; clicks: number; saves: number; ctr: number };
  monthlyTrend: Array<{ day: string; impressions: number; outbound_clicks: number; saves: number }>;
  topBoards: Array<{ name: string; count: number }>;
  topProducts: Array<{ slug: string; name: string; clicks: number; saves: number; impressions: number }>;
  revenue30d: { revenue: number; orders: number };
  productionBoards: number;
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof TrendingUp; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4 flex items-start gap-3">
      <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
      <div>
        <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </Card>
  );
}

export default function PinterestGrowthEnginePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<unknown>(null);

  async function load() {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("pinterest-growth-engine", {
      body: { action: "dashboard" },
    });
    if (!error && res) setData(res as Dashboard);
    setLoading(false);
  }

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    const { data: res } = await supabase.functions.invoke("pinterest-growth-engine", {
      body: { action: "run" },
    });
    setRunResult(res);
    setRunning(false);
    await load();
  }

  useEffect(() => { load(); }, []);

  return (
    <>
      <Helmet>
        <title>Pinterest Growth Engine | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" /> Pinterest Growth Engine
            </h1>
            <p className="text-sm text-muted-foreground">Autonomous daily product selection · variant generation · safe auto-approval</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}</Button>
            <Button onClick={runNow} disabled={running}>{running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Run Now</Button>
          </div>
        </header>

        {!data ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={TrendingUp} label="Pins published today" value={String(data.today.published)} />
              <Stat icon={Eye} label="Impressions (7d)" value={data.last7d.impressions.toLocaleString()} />
              <Stat icon={MousePointerClick} label="Outbound clicks (7d)" value={data.last7d.clicks.toLocaleString()} sub={`CTR ${(data.last7d.ctr * 100).toFixed(2)}%`} />
              <Stat icon={Bookmark} label="Saves (7d)" value={data.last7d.saves.toLocaleString()} />
              <Stat icon={DollarSign} label="Revenue (30d)" value={`$${data.revenue30d.revenue.toLocaleString()}`} sub={`${data.revenue30d.orders} orders attributed`} />
              <Stat icon={ShoppingBag} label="Drafts pending" value={String(data.pipeline.drafts)} sub={`${data.pipeline.ready} approved`} />
              <Stat icon={Layers} label="Production boards" value={String(data.productionBoards)} />
              <Stat icon={Sparkles} label="Engine status" value={data.productionBoards ? "Healthy" : "Halted"} sub={data.productionBoards ? "Safety guardrails active" : "No production boards"} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4">
                <h2 className="font-semibold mb-3">Top boards (7d, published)</h2>
                <div className="space-y-2 text-sm">
                  {data.topBoards.length === 0 && <div className="text-muted-foreground">No data yet.</div>}
                  {data.topBoards.map((b) => (
                    <div key={b.name} className="flex justify-between border-b pb-1">
                      <span>{b.name}</span><span className="font-mono">{b.count}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-4">
                <h2 className="font-semibold mb-3">Top products by clicks (30d)</h2>
                <div className="space-y-2 text-sm">
                  {data.topProducts.length === 0 && <div className="text-muted-foreground">No data yet.</div>}
                  {data.topProducts.map((p) => (
                    <div key={p.slug} className="flex justify-between border-b pb-1 gap-2">
                      <span className="truncate">{p.name || p.slug}</span>
                      <span className="font-mono text-xs">{p.clicks} clicks · {p.saves} saves</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="p-4">
              <h2 className="font-semibold mb-3">Monthly trend (30d)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1">Day</th><th>Impr.</th><th>Clicks</th><th>Saves</th></tr></thead>
                  <tbody>
                    {data.monthlyTrend.slice(-14).map((d) => (
                      <tr key={d.day} className="border-t">
                        <td className="py-1">{d.day}</td>
                        <td>{d.impressions.toLocaleString()}</td>
                        <td>{d.outbound_clicks.toLocaleString()}</td>
                        <td>{d.saves.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {runResult ? (
              <Card className="p-4">
                <h2 className="font-semibold mb-2">Last run result</h2>
                <pre className="text-xs overflow-auto max-h-96 bg-muted/50 p-3 rounded">{JSON.stringify(runResult, null, 2)}</pre>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}