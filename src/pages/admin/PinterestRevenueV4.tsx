import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, Rocket, Wrench } from "lucide-react";
import { toast } from "sonner";
import WarehouseInventoryPanel from "@/components/admin/WarehouseInventoryPanel";
import GoldStandardCreativePanel from "@/components/admin/GoldStandardCreativePanel";

interface DashData {
  blocked_by_inventory: number;
  blocked_by_media: number;
  avg_media_score: number;
  replacements_generated: number;
  creative_winners: any[];
  top_ctr_pins: any[];
  video_quality: { v4_pass: number; v4_total: number; pass_rate: number };
  creative_source_tiers: Record<string, number>;
}

export default function PinterestRevenueV4() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("pinterest-revenue-v4-dashboard");
    setLoading(false);
    if (error) return toast.error(error.message);
    if (res?.ok) setData(res);
  }
  useEffect(() => {
    load();
  }, []);

  async function run(fn: string, label: string) {
    setBusy(fn);
    try {
      const { data: res, error } = await supabase.functions.invoke(fn);
      if (error) throw error;
      toast.success(`${label}: ${JSON.stringify(res).slice(0, 140)}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <Helmet>
        <title>Pinterest Revenue V4 — Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Pinterest Revenue Engine V4</h1>
          <p className="text-sm text-muted-foreground">
            Inventory safety, media quality, winner replacement, sales-mode optimization.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button disabled={!!busy} onClick={() => run("pinterest-revenue-v4-bootstrap", "Bootstrap audit")}>
            <Rocket className="h-4 w-4 mr-1" /> Run audit
          </Button>
          <Button variant="secondary" disabled={!!busy} onClick={() => run("pinterest-winner-replacement", "Winner replacement")}>
            <Wrench className="h-4 w-4 mr-1" /> Replace OOS winners
          </Button>
          <Button variant="secondary" disabled={!!busy} onClick={() => run("pinterest-queue-cleanup-daily", "Cleanup")}>
            <Wrench className="h-4 w-4 mr-1" /> Cleanup queues
          </Button>
          <Button variant="outline" onClick={load}>
            <RefreshCcw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground">No data yet. Click "Run audit" to seed.</div>
      ) : (
        <>
          <WarehouseInventoryPanel />
          <GoldStandardCreativePanel />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Blocked by inventory" value={String(data.blocked_by_inventory)} />
            <Stat label="Blocked by media quality" value={String(data.blocked_by_media)} />
            <Stat label="Avg media score" value={`${data.avg_media_score}/100`} />
            <Stat label="Replacements (7d)" value={String(data.replacements_generated)} />
            <Stat
              label="V4 video pass rate"
              value={`${Math.round(data.video_quality.pass_rate * 100)}% (${data.video_quality.v4_pass}/${data.video_quality.v4_total})`}
            />
            {Object.entries(data.creative_source_tiers).map(([k, v]) => (
              <Stat key={k} label={`Source: ${k}`} value={String(v)} />
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Top CTR pins</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th>Pin</th>
                      <th>CTR</th>
                      <th>Outbound</th>
                      <th>Saves</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_ctr_pins.map((p: any) => (
                      <tr key={p.pin_id} className="border-t">
                        <td className="font-mono">{p.pin_id}</td>
                        <td>{((p.ctr ?? 0) * 100).toFixed(2)}%</td>
                        <td>{p.outbound_clicks ?? 0}</td>
                        <td>{p.saves ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Creative winners</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th>ID</th>
                      <th>Composite score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.creative_winners.map((w: any) => (
                      <tr key={w.id} className="border-t">
                        <td className="font-mono">{String(w.id).slice(0, 8)}</td>
                        <td>{Number(w.composite_score ?? 0).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}