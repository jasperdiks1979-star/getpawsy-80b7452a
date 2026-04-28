import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Loader2, RefreshCw, TrendingUp, MousePointerClick, ShoppingCart, CreditCard, DollarSign, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * TikTok Ads Performance — per-hook funnel dashboard.
 *
 * Reads from public.get_tiktok_hook_performance(window_days, pattern). Each
 * row represents one utm_campaign value (hook1..hook5 by convention) for
 * traffic where utm_source = 'tiktok'. Empty states are intentional: no
 * fake demo data is rendered while ads have not started yet.
 */

type HookRow = {
  hook: string;
  sessions: number;
  go_views: number;
  pdp_views: number;
  pdp_sessions: number;
  cart_events: number;
  cart_sessions: number;
  checkout_events: number;
  checkout_sessions: number;
  purchases: number;
  revenue: number;
  pdp_ctr: number;
  cart_rate: number;
  cvr: number;
  aov: number;
};

type Totals = {
  sessions: number;
  pdp_sessions: number;
  cart_sessions: number;
  checkout_sessions: number;
  purchases: number;
  revenue: number;
};

type DayRow = { date: string; sessions: number; purchases: number; revenue: number };

type Payload = {
  window_days: number;
  from: string;
  totals: Totals;
  per_hook: HookRow[];
  per_day: DayRow[];
};

const WINDOWS: { label: string; days: number }[] = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const EXPECTED_HOOKS = ["hook1", "hook2", "hook3", "hook4", "hook5"];

function fmtInt(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(n || 0));
}
function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}
function fmtPct(n: number) {
  return `${(n || 0).toFixed(2)}%`;
}

export default function TikTokAdsPerformancePage() {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (days: number) => {
    setLoading(true);
    setError(null);
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_tiktok_hook_performance" as any, {
      p_window_days: days,
      p_campaign_pattern: null,
    });
    if (rpcError) {
      setError(rpcError.message);
      setData(null);
    } else {
      setData(rpcData as unknown as Payload);
    }
    setLoading(false);
  };

  useEffect(() => {
    load(windowDays);
  }, [windowDays]);

  // Merge live rows with the 5 expected hooks so every hook is visible even
  // before its first click — gives the user a deterministic 5-row table that
  // mirrors the 5 ad URLs they generated.
  const hookRows = useMemo<HookRow[]>(() => {
    const live = data?.per_hook ?? [];
    const byHook = new Map(live.map((r) => [r.hook.toLowerCase(), r]));
    const merged: HookRow[] = EXPECTED_HOOKS.map(
      (h) =>
        byHook.get(h) ?? {
          hook: h,
          sessions: 0,
          go_views: 0,
          pdp_views: 0,
          pdp_sessions: 0,
          cart_events: 0,
          cart_sessions: 0,
          checkout_events: 0,
          checkout_sessions: 0,
          purchases: 0,
          revenue: 0,
          pdp_ctr: 0,
          cart_rate: 0,
          cvr: 0,
          aov: 0,
        },
    );
    // Append any unexpected campaigns (e.g. hook6, manual tests) below.
    for (const row of live) {
      if (!EXPECTED_HOOKS.includes(row.hook.toLowerCase())) merged.push(row);
    }
    return merged;
  }, [data]);

  const totals: Totals = data?.totals ?? {
    sessions: 0,
    pdp_sessions: 0,
    cart_sessions: 0,
    checkout_sessions: 0,
    purchases: 0,
    revenue: 0,
  };

  // Best/worst hooks among rows that have any traffic, so we don't crown an
  // empty hook just because it sorts first alphabetically.
  const bestHook = useMemo(() => {
    const withData = hookRows.filter((r) => r.sessions > 0);
    if (!withData.length) return null;
    return [...withData].sort((a, b) => b.cvr - a.cvr || b.revenue - a.revenue)[0];
  }, [hookRows]);

  return (
    <>
      <Helmet>
        <title>TikTok Ads Performance | GetPawsy Admin</title>
      </Helmet>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              TikTok Ads Performance
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Funnel per hook — sessions → product page → cart → checkout → purchase. Data flows in
              automatically as TikTok ad clicks arrive (matched by <code className="px-1 py-0.5 rounded bg-muted text-xs">utm_campaign=hook1..5</code>).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
              <TabsList>
                {WINDOWS.map((w) => (
                  <TabsTrigger key={w.days} value={String(w.days)}>
                    {w.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button variant="outline" size="icon" onClick={() => load(windowDays)} aria-label="Refresh">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        {error && (
          <Card className="p-4 border-destructive/50 bg-destructive/5 text-sm text-destructive">
            Failed to load: {error}
          </Card>
        )}

        {/* Top KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile icon={<MousePointerClick className="h-4 w-4" />} label="Sessions" value={fmtInt(totals.sessions)} />
          <KpiTile icon={<Target className="h-4 w-4" />} label="PDP visits" value={fmtInt(totals.pdp_sessions)} />
          <KpiTile icon={<ShoppingCart className="h-4 w-4" />} label="Add to cart" value={fmtInt(totals.cart_sessions)} />
          <KpiTile icon={<CreditCard className="h-4 w-4" />} label="Checkouts" value={fmtInt(totals.checkout_sessions)} />
          <KpiTile icon={<DollarSign className="h-4 w-4" />} label="Purchases" value={fmtInt(totals.purchases)} />
          <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="Revenue" value={fmtMoney(totals.revenue)} />
        </div>

        {/* Per-hook table */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Per-hook funnel</h2>
            {bestHook && (
              <span className="text-xs text-muted-foreground">
                Top performer: <span className="font-mono font-semibold text-primary">{bestHook.hook}</span> · CVR {fmtPct(bestHook.cvr)}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Hook</th>
                  <th className="text-right px-3 py-2 font-medium">Sessions</th>
                  <th className="text-right px-3 py-2 font-medium">PDP</th>
                  <th className="text-right px-3 py-2 font-medium">PDP CTR</th>
                  <th className="text-right px-3 py-2 font-medium">Cart</th>
                  <th className="text-right px-3 py-2 font-medium">Checkout</th>
                  <th className="text-right px-3 py-2 font-medium">Purchases</th>
                  <th className="text-right px-3 py-2 font-medium">CVR</th>
                  <th className="text-right px-3 py-2 font-medium">Revenue</th>
                  <th className="text-right px-4 py-2 font-medium">AOV</th>
                </tr>
              </thead>
              <tbody>
                {hookRows.map((r) => (
                  <tr
                    key={r.hook}
                    className={cn(
                      "border-t border-border/60 hover:bg-accent/40 transition-colors",
                      r.sessions === 0 && "opacity-60",
                    )}
                  >
                    <td className="px-4 py-2.5 font-mono font-semibold text-foreground">{r.hook}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.sessions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.pdp_sessions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtPct(r.pdp_ctr)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.cart_sessions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.checkout_sessions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtInt(r.purchases)}</td>
                    <td className={cn(
                      "px-3 py-2.5 text-right tabular-nums font-semibold",
                      r.cvr >= 2 ? "text-green-600 dark:text-green-400" : r.cvr > 0 ? "text-foreground" : "text-muted-foreground",
                    )}>
                      {fmtPct(r.cvr)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.revenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.purchases > 0 ? fmtMoney(r.aov) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totals.sessions === 0 && !loading && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground border-t border-border">
              No TikTok ad clicks recorded yet in this window. Once ads start running with{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-xs">utm_source=tiktok</code> and{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-xs">utm_campaign=hook1..5</code>, rows fill in automatically.
            </div>
          )}
        </Card>

        {/* Daily trend */}
        {data && data.per_day.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Daily trend (all hooks)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-right px-3 py-2 font-medium">Sessions</th>
                    <th className="text-right px-3 py-2 font-medium">Purchases</th>
                    <th className="text-right px-4 py-2 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.per_day.map((d) => (
                    <tr key={d.date} className="border-t border-border/60">
                      <td className="px-4 py-2 font-mono text-xs">{d.date}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInt(d.sessions)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtInt(d.purchases)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(d.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Source: <code>visitor_activity</code> filtered by <code>utm_source=tiktok</code>, grouped by{" "}
          <code>utm_campaign</code>. Internal traffic excluded. Funnel definitions: PDP = product page session, Cart =
          add-to-cart event, Checkout = checkout event, Purchase = order linked to session.
        </p>
      </div>
    </>
  );
}

function KpiTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-foreground tabular-nums">{value}</div>
    </Card>
  );
}