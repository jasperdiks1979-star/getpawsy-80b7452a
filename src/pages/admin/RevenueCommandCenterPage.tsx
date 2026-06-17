import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, RefreshCw, AlertTriangle, TrendingUp, ShoppingCart, Pin, DollarSign, Bell } from "lucide-react";
import { toast } from "sonner";

type Snapshot = {
  ok: boolean;
  generated_at: string;
  traffic: { pinterest_visitors_24h: number; product_page_visitors_24h: number; top_pages: { path: string; visits: number }[] };
  conversion: { add_to_carts_24h: number; checkout_starts_24h: number; purchases_24h: number; sessions_24h: number; conversion_rate_pct: number };
  revenue: { today_cents: number; week_cents: number; month_cents: number; aov_cents: number; orders_month: number };
  products: { best: any[]; worst: any[]; out_of_stock: { id: string; name: string; slug: string }[] };
  pinterest: { published_today: number; queued: number; drafts: number; failures_24h: number; minutes_since_last_publish: number | null; top_pins: any[] };
};

type AlertConfig = {
  alert_pinterest_stall: boolean;
  pinterest_stall_minutes: number;
  alert_out_of_stock: boolean;
  alert_checkout_errors: boolean;
  checkout_error_threshold: number;
  alert_new_order: boolean;
  alert_revenue_threshold: boolean;
  revenue_threshold_today_cents: number;
  revenue_threshold_week_cents: number;
};

const usd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function Stat({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: string; icon?: any }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>
    </Card>
  );
}

export default function RevenueCommandCenterPage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<AlertConfig | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [runningMonitor, setRunningMonitor] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("revenue-command-center");
      if (error) throw error;
      setSnap(data as Snapshot);
      const { data: c } = await supabase.from("revenue_alert_config").select("*").eq("id", true).maybeSingle();
      if (c) setCfg(c as unknown as AlertConfig);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const saveCfg = async () => {
    if (!cfg) return;
    setSavingCfg(true);
    const { error } = await supabase.from("revenue_alert_config").update({ ...cfg, updated_at: new Date().toISOString() }).eq("id", true);
    setSavingCfg(false);
    if (error) toast.error(error.message);
    else toast.success("Alert settings saved");
  };

  const runMonitor = async () => {
    setRunningMonitor(true);
    const { data, error } = await supabase.functions.invoke("revenue-alert-monitor");
    setRunningMonitor(false);
    if (error) toast.error(error.message);
    else toast.success(`Monitor ran. Fired: ${(data?.fired ?? []).filter((r: any) => r.sent).length}`);
  };

  return (
    <div className="px-3 sm:px-6 py-4 max-w-7xl mx-auto">
      <Helmet><title>Revenue Command Center · Admin</title><meta name="robots" content="noindex" /></Helmet>

      <header className="flex items-center justify-between gap-2 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold">Revenue Command Center</h1>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </header>

      {!snap && loading && (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {snap && (
        <div className="space-y-6">
          {/* REVENUE */}
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><DollarSign className="h-4 w-4" /> Revenue</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <Stat label="Today" value={usd(snap.revenue.today_cents)} />
              <Stat label="7-day" value={usd(snap.revenue.week_cents)} />
              <Stat label="30-day" value={usd(snap.revenue.month_cents)} sub={`${snap.revenue.orders_month} orders`} />
              <Stat label="AOV" value={usd(snap.revenue.aov_cents)} />
            </div>
          </section>

          {/* CONVERSION */}
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> Conversion · 24h</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
              <Stat label="Sessions" value={snap.conversion.sessions_24h} />
              <Stat label="Add to Cart" value={snap.conversion.add_to_carts_24h} />
              <Stat label="Checkout" value={snap.conversion.checkout_starts_24h} />
              <Stat label="Purchases" value={snap.conversion.purchases_24h} />
              <Stat label="CVR" value={`${snap.conversion.conversion_rate_pct}%`} />
            </div>
          </section>

          {/* TRAFFIC */}
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Traffic · 24h</h2>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-2">
              <Stat label="Pinterest visitors" value={snap.traffic.pinterest_visitors_24h} />
              <Stat label="Product page visits" value={snap.traffic.product_page_visitors_24h} />
            </div>
            <Card className="p-3">
              <div className="text-xs uppercase text-muted-foreground mb-2">Top landing pages</div>
              <ul className="space-y-1 text-sm">
                {snap.traffic.top_pages.slice(0, 8).map((p) => (
                  <li key={p.path} className="flex justify-between gap-2">
                    <span className="truncate">{p.path}</span>
                    <span className="tabular-nums text-muted-foreground">{p.visits}</span>
                  </li>
                ))}
                {snap.traffic.top_pages.length === 0 && <li className="text-muted-foreground">No data yet.</li>}
              </ul>
            </Card>
          </section>

          {/* PINTEREST */}
          <section>
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><Pin className="h-4 w-4" /> Pinterest</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <Stat label="Published today" value={snap.pinterest.published_today} />
              <Stat label="Queued" value={snap.pinterest.queued} />
              <Stat label="Drafts" value={snap.pinterest.drafts} />
              <Stat label="Failures 24h" value={snap.pinterest.failures_24h}
                sub={snap.pinterest.minutes_since_last_publish != null ? `${snap.pinterest.minutes_since_last_publish}m since last` : undefined} />
            </div>
            {snap.pinterest.top_pins?.length > 0 && (
              <Card className="p-3 mt-2">
                <div className="text-xs uppercase text-muted-foreground mb-2">Top pins</div>
                <ul className="space-y-1 text-sm">
                  {snap.pinterest.top_pins.slice(0, 6).map((p: any, i: number) => (
                    <li key={p.pin_id ?? i} className="flex justify-between gap-2">
                      <span className="truncate">{p.pin_title ?? p.product_slug ?? p.pin_id}</span>
                      <span className="tabular-nums text-muted-foreground">{p.clicks ?? 0} clk</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          {/* PRODUCTS */}
          <section>
            <h2 className="text-sm font-semibold mb-2">Products · 30d</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-3">
              <Card className="p-3">
                <div className="text-xs uppercase text-muted-foreground mb-2">Best performing</div>
                <ul className="space-y-1 text-sm">
                  {snap.products.best.map((p, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="tabular-nums text-muted-foreground">{usd(p.revenue)}</span>
                    </li>
                  ))}
                  {snap.products.best.length === 0 && <li className="text-muted-foreground">No sales yet.</li>}
                </ul>
              </Card>
              <Card className="p-3">
                <div className="text-xs uppercase text-muted-foreground mb-2">Worst performing</div>
                <ul className="space-y-1 text-sm">
                  {snap.products.worst.map((p, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      <span className="tabular-nums text-muted-foreground">{p.units}u</span>
                    </li>
                  ))}
                  {snap.products.worst.length === 0 && <li className="text-muted-foreground">—</li>}
                </ul>
              </Card>
              <Card className="p-3">
                <div className="text-xs uppercase text-muted-foreground mb-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Out of stock</div>
                <ul className="space-y-1 text-sm">
                  {snap.products.out_of_stock.map((p) => (
                    <li key={p.id} className="truncate">{p.name}</li>
                  ))}
                  {snap.products.out_of_stock.length === 0 && <li className="text-muted-foreground">All in stock.</li>}
                </ul>
              </Card>
            </div>
          </section>

          {/* ALERTS */}
          {cfg && (
            <section>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"><Bell className="h-4 w-4" /> SMS Alerts</h2>
              <Card className="p-4 space-y-4">
                {[
                  { k: "alert_pinterest_stall", label: "Pinterest flow stops" },
                  { k: "alert_out_of_stock", label: "Product goes out of stock" },
                  { k: "alert_checkout_errors", label: "Checkout errors" },
                  { k: "alert_new_order", label: "New order arrives" },
                  { k: "alert_revenue_threshold", label: "Revenue threshold crossed" },
                ].map((row) => (
                  <div key={row.k} className="flex items-center justify-between gap-3">
                    <Label htmlFor={row.k} className="text-sm">{row.label}</Label>
                    <Switch id={row.k} checked={(cfg as any)[row.k]}
                      onCheckedChange={(v) => setCfg({ ...cfg, [row.k]: v } as AlertConfig)} />
                  </div>
                ))}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                  <div>
                    <Label className="text-xs">Pinterest stall (min)</Label>
                    <Input type="number" value={cfg.pinterest_stall_minutes}
                      onChange={(e) => setCfg({ ...cfg, pinterest_stall_minutes: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs">Checkout errors / hr</Label>
                    <Input type="number" value={cfg.checkout_error_threshold}
                      onChange={(e) => setCfg({ ...cfg, checkout_error_threshold: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs">Daily revenue threshold ($)</Label>
                    <Input type="number" value={Math.round(cfg.revenue_threshold_today_cents / 100)}
                      onChange={(e) => setCfg({ ...cfg, revenue_threshold_today_cents: Number(e.target.value) * 100 })} />
                  </div>
                  <div>
                    <Label className="text-xs">Weekly revenue threshold ($)</Label>
                    <Input type="number" value={Math.round(cfg.revenue_threshold_week_cents / 100)}
                      onChange={(e) => setCfg({ ...cfg, revenue_threshold_week_cents: Number(e.target.value) * 100 })} />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={saveCfg} disabled={savingCfg} size="sm">
                    {savingCfg && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save
                  </Button>
                  <Button onClick={runMonitor} disabled={runningMonitor} size="sm" variant="outline">
                    {runningMonitor && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Run monitor now
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">SMS goes to OWNER_ALERT_PHONE via Twilio. Configure secrets in SMS Alerts admin.</p>
              </Card>
            </section>
          )}

          <p className="text-xs text-muted-foreground text-center pt-2">Auto-refresh · 60s · Generated {new Date(snap.generated_at).toLocaleTimeString()}</p>
        </div>
      )}
    </div>
  );
}