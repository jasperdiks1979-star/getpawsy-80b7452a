import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, RefreshCw, Sparkles, Rocket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type GroupRow = { key: string; revenue_cents: number; orders: number; pins: number };

interface ReportData {
  window_days: number;
  totals: { revenue_cents: number; orders: number; clicks: number; revenue_per_click: number; revenue_per_pin: number; roas: number };
  top_pins: any[];
  top_categories: GroupRow[];
  top_headlines: GroupRow[];
  top_ctas: GroupRow[];
  top_hooks: GroupRow[];
  top_angles: GroupRow[];
  daily_trend: { day: string; revenue_cents: number; orders: number }[];
}

const fmt$ = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function PinterestProfitCenter() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<1 | 7 | 30>(30);
  const [diag, setDiag] = useState<any[] | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  async function load(w = windowDays) {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("pinterest-revenue-attribution-v3", {
        body: { action: "report", window_days: w },
      });
      if (error) throw error;
      setData(res as ReportData);
    } catch (e: any) { toast.error(e?.message ?? "Failed to load"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(windowDays); /* eslint-disable-next-line */ }, [windowDays]);

  async function trigger(action: "rebuild" | "learn" | "run_full") {
    setBusy(action);
    try {
      const { data: res, error } = await supabase.functions.invoke("pinterest-revenue-attribution-v3", { body: { action } });
      if (error) throw error;
      toast.success(`${action} ok`);
      console.log(action, res);
      await load();
    } catch (e: any) { toast.error(e?.message ?? `${action} failed`); }
    finally { setBusy(null); }
  }

  async function loadDiagnostics() {
    setDiagBusy(true);
    try {
      const { data: rows, error } = await supabase
        .from("pinterest_pin_queue")
        .select("id, pinterest_pin_id, destination_link, posted_at, board_name, category_key, hook_group, status")
        .eq("status", "posted")
        .not("pinterest_pin_id", "is", null)
        .order("posted_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const parsed = (rows ?? []).map((r) => {
        let url: URL | null = null;
        try { url = new URL(r.destination_link ?? ""); } catch { /* ignore */ }
        const params = url?.searchParams;
        const pinId = params?.get("pin_id") ?? null;
        const utmSource = params?.get("utm_source") ?? null;
        const utmCampaign = params?.get("utm_campaign") ?? null;
        const utmContent = params?.get("utm_content") ?? null;
        const ok = !!pinId && utmSource === "pinterest";
        return {
          id: r.id,
          pinterest_pin_id: r.pinterest_pin_id,
          url: r.destination_link,
          pin_id: pinId,
          utm_source: utmSource,
          utm_campaign: utmCampaign,
          utm_content: utmContent,
          status: ok ? "OK" : "MISSING_ATTR",
          posted_at: r.posted_at,
        };
      });
      setDiag(parsed);
    } catch (e: any) { toast.error(e?.message ?? "Diagnostics failed"); }
    finally { setDiagBusy(false); }
  }

  useEffect(() => { void loadDiagnostics(); }, []);

  async function publishTestPin() {
    setBusy("test");
    try {
      const { data: res, error } = await supabase.functions.invoke("pinterest-publish-now", { body: { mode: "next" } });
      if (error) throw error;
      toast.success(`Test publish: ${JSON.stringify(res).slice(0, 200)}`);
      console.log("test publish", res);
      await loadDiagnostics();
    } catch (e: any) { toast.error(e?.message ?? "Test publish failed"); }
    finally { setBusy(null); }
  }

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Pinterest Profit Center — Admin</title></Helmet>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><DollarSign className="h-5 w-5" /> Pinterest Profit Center</h1>
          <p className="text-sm text-muted-foreground">Revenue attribution V3 — pins → products → orders. Optimization target: revenue.</p>
        </div>
        <div className="flex items-center gap-2">
          {[1, 7, 30].map((w) => (
            <Button key={w} size="sm" variant={windowDays === w ? "default" : "outline"} onClick={() => setWindowDays(w as 1 | 7 | 30)}>{w}d</Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => trigger("rebuild")} disabled={!!busy}>
            {busy === "rebuild" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />} Rebuild
          </Button>
          <Button size="sm" onClick={() => trigger("run_full")} disabled={!!busy}>
            {busy === "run_full" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />} Rebuild + Learn
          </Button>
          <Button size="sm" variant="secondary" onClick={publishTestPin} disabled={!!busy}>
            {busy === "test" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Rocket className="h-3 w-3 mr-1" />} Publish test pin
          </Button>
        </div>
      </header>

      {loading || !data ? (
        <div className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Revenue" value={fmt$(data.totals.revenue_cents)} />
            <Stat label="Orders" value={String(data.totals.orders)} />
            <Stat label="Clicks" value={String(data.totals.clicks)} />
            <Stat label="Rev / click" value={`$${data.totals.revenue_per_click.toFixed(2)}`} />
            <Stat label="Rev / pin" value={`$${data.totals.revenue_per_pin.toFixed(2)}`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GroupCard title="Top Revenue Categories" rows={data.top_categories} />
            <GroupCard title="Top Revenue Headlines" rows={data.top_headlines} />
            <GroupCard title="Top Revenue CTAs" rows={data.top_ctas} />
            <GroupCard title="Top Revenue Hooks" rows={data.top_hooks} />
            <GroupCard title="Top Revenue Angles" rows={data.top_angles} />
            <Card>
              <CardHeader><CardTitle className="text-base">Daily Revenue Trend</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {data.daily_trend.length === 0 && <p className="text-muted-foreground">No purchases attributed yet.</p>}
                {data.daily_trend.map((d) => (
                  <div key={d.day} className="flex justify-between border-b py-1">
                    <span>{d.day}</span>
                    <span className="text-muted-foreground">{d.orders} orders</span>
                    <span className="font-medium">{fmt$(d.revenue_cents)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Top Pins by Revenue</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="p-2">Pin</th><th className="p-2">Product</th><th className="p-2">Headline</th>
                    <th className="p-2 text-right">Clicks</th><th className="p-2 text-right">Orders</th><th className="p-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_pins.slice(0, 30).map((p: any) => (
                    <tr key={p.pin_id} className="border-t">
                      <td className="p-2 font-mono text-xs">{p.pin_id}</td>
                      <td className="p-2 text-xs">{p.product_slug ?? p.product_id ?? "—"}</td>
                      <td className="p-2 text-xs truncate max-w-[260px]">{p.headline ?? "—"}</td>
                      <td className="p-2 text-right">{p.clicks}</td>
                      <td className="p-2 text-right">{p.orders}</td>
                      <td className="p-2 text-right font-medium">{fmt$(p.revenue_cents)}</td>
                    </tr>
                  ))}
                  {data.top_pins.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No attributed pins in this window.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Attribution Diagnostics — last 20 posted pins</CardTitle>
              <Button size="sm" variant="ghost" onClick={loadDiagnostics} disabled={diagBusy}>
                {diagBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="p-2">Pin URL</th>
                    <th className="p-2">Pin ID</th>
                    <th className="p-2">utm_source</th>
                    <th className="p-2">utm_campaign</th>
                    <th className="p-2">utm_content</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(diag ?? []).map((d) => (
                    <tr key={d.id} className="border-t">
                      <td className="p-2 max-w-[320px] truncate"><a href={d.url} target="_blank" rel="noreferrer" className="underline">{d.url}</a></td>
                      <td className="p-2 font-mono">{d.pin_id ?? "—"}</td>
                      <td className="p-2">{d.utm_source ?? "—"}</td>
                      <td className="p-2">{d.utm_campaign ?? "—"}</td>
                      <td className="p-2">{d.utm_content ?? "—"}</td>
                      <td className="p-2">
                        <Badge variant={d.status === "OK" ? "secondary" : "destructive"}>{d.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {(!diag || diag.length === 0) && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No posted pins yet.</td></tr>
                  )}
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
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </CardContent></Card>
  );
}

function GroupCard({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {rows.length === 0 && <p className="text-muted-foreground">No data.</p>}
        {rows.slice(0, 10).map((r) => (
          <div key={r.key} className="flex items-center gap-2 border-b py-1">
            <span className="flex-1 truncate" title={r.key}>{r.key}</span>
            <Badge variant="outline">{r.pins} pins</Badge>
            <Badge variant="secondary">{r.orders} ord</Badge>
            <span className="font-medium w-20 text-right">{fmt$(r.revenue_cents)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}