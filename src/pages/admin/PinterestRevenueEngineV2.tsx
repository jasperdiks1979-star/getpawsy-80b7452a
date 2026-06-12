import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Rocket, Archive, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

type Dash = {
  impressions: number;
  outbound: number;
  saves: number;
  ctr: number;
  jobs_by_status: Record<string, number>;
  replacement_success_rate: number;
  top_headlines: { headline: string; live_count: number }[];
  top_categories: { category: string; posted: number }[];
  worst_categories: { category: string; posted: number }[];
  recent_runs: any[];
};

export default function PinterestRevenueEngineV2() {
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("pinterest-revenue-engine-v2", {
      body: { action: "dashboard" },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (res?.ok) setData(res as Dash);
  }
  useEffect(() => { load(); }, []);

  async function run(action: string, body: any = {}) {
    setBusy(action);
    try {
      const { data: res, error } = await supabase.functions.invoke("pinterest-revenue-engine-v2", {
        body: { action, ...body },
      });
      if (error) throw error;
      toast.success(`${action}: ${JSON.stringify(res).slice(0, 120)}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally { setBusy(null); }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Helmet><title>Pinterest Revenue Engine V2 — Admin</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Revenue Engine V2</h1>
          <p className="text-sm text-muted-foreground">Auto-publishing replacement engine. Banned phrases enforced. 24h archive grace. Runs nightly.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" disabled={!!busy} onClick={() => run("seed", { perType: 50 })}>
            <Sparkles className="h-4 w-4 mr-1" /> Seed templates
          </Button>
          <Button disabled={!!busy} onClick={() => run("tick", { batch: 5 })}>
            <Rocket className="h-4 w-4 mr-1" /> Publish batch
          </Button>
          <Button variant="secondary" disabled={!!busy} onClick={() => run("archive", { limit: 50 })}>
            <Archive className="h-4 w-4 mr-1" /> Archive due
          </Button>
          <Button variant="outline" disabled={!!busy} onClick={load}>
            <RefreshCcw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground">No data yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Impressions (30d)" value={data.impressions.toLocaleString()} />
            <Stat label="Outbound clicks" value={data.outbound.toLocaleString()} />
            <Stat label="Saves" value={data.saves.toLocaleString()} />
            <Stat label="CTR" value={`${(data.ctr * 100).toFixed(2)}%`} />
            <Stat label="Replacement success" value={`${(data.replacement_success_rate * 100).toFixed(0)}%`} />
            {Object.entries(data.jobs_by_status).slice(0, 3).map(([k, v]) => (
              <Stat key={k} label={k} value={String(v)} />
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Top live headlines</CardTitle></CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1">
                  {data.top_headlines.map((h, i) => (
                    <li key={i} className="flex items-center justify-between border-b py-1">
                      <span className="truncate pr-2">{h.headline}</span>
                      <Badge variant={h.live_count > 3 ? "destructive" : "outline"}>{h.live_count}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Categories (posted last 30d)</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-semibold mb-1">Top</div>
                    {data.top_categories.map((c) => (
                      <div key={c.category} className="flex justify-between border-b py-1">
                        <span>{c.category}</span><span>{c.posted}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="font-semibold mb-1">Worst</div>
                    {data.worst_categories.map((c) => (
                      <div key={c.category} className="flex justify-between border-b py-1 text-muted-foreground">
                        <span>{c.category}</span><span>{c.posted}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Recent engine runs</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th>When</th><th>Action</th><th>Seeded</th><th>Published</th><th>Archived</th><th>Errors</th></tr>
                </thead>
                <tbody>
                  {data.recent_runs.map((r: any) => (
                    <tr key={r.id} className="border-t">
                      <td>{new Date(r.created_at).toLocaleString()}</td>
                      <td>{r.action}</td>
                      <td>{r.templates_seeded}</td>
                      <td>{r.pins_published}</td>
                      <td>{r.pins_archived}</td>
                      <td>{r.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </CardContent></Card>
  );
}