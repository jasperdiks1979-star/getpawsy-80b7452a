import { useEffect, useMemo, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { Activity, RefreshCw, ShoppingCart, CreditCard, Eye, MousePointerClick, Radio, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Range = "15m" | "1h" | "6h" | "24h" | "7d";

const RANGE_MS: Record<Range, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

interface FunnelCounts {
  sessions: number;
  productViews: number;
  carts: number;
  checkouts: number;
}

interface RecentSession {
  session_id: string;
  created_at: string;
  page_path: string | null;
  utm_campaign: string | null;
  reachedCart: boolean;
  reachedCheckout: boolean;
}

function isTikTokRow(row: { utm_source?: string | null; referrer?: string | null; referrer_category?: string | null }) {
  const src = (row.utm_source || "").toLowerCase();
  const ref = (row.referrer || "").toLowerCase();
  if (src.includes("tiktok")) return true;
  if (ref.includes("tiktok")) return true;
  return false;
}

function pct(num: number, den: number) {
  if (!den) return 0;
  return (num / den) * 100;
}

export default function TikTokRealtimeFunnelPage() {
  const [range, setRange] = useState<Range>("24h");
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [pulse, setPulse] = useState(false);
  const [counts, setCounts] = useState<FunnelCounts>({ sessions: 0, productViews: 0, carts: 0, checkouts: 0 });
  const [recent, setRecent] = useState<RecentSession[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const cutoff = new Date(Date.now() - RANGE_MS[range]).toISOString();
      const { data, error: err } = await supabase
        .from("visitor_activity")
        .select("session_id, activity_type, page_path, utm_source, utm_campaign, referrer, referrer_category, created_at")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (err) throw err;

      const tiktokRows = (data || []).filter(isTikTokRow);

      // Aggregate per session
      const sessions = new Map<string, {
        firstSeen: string;
        lastPath: string | null;
        campaign: string | null;
        productView: boolean;
        cart: boolean;
        checkout: boolean;
      }>();

      for (const r of tiktokRows) {
        const cur = sessions.get(r.session_id) || {
          firstSeen: r.created_at,
          lastPath: r.page_path,
          campaign: r.utm_campaign,
          productView: false,
          cart: false,
          checkout: false,
        };
        if (r.created_at < cur.firstSeen) cur.firstSeen = r.created_at;
        if (!cur.lastPath && r.page_path) cur.lastPath = r.page_path;
        if (!cur.campaign && r.utm_campaign) cur.campaign = r.utm_campaign;
        // Activity-type mapping (UI label → DB activity_type):
        //   "Add to cart"    → activity_type = "cart"
        //   "Checkout"       → activity_type = "checkout"
        //   "Product view"   → activity_type = "browsing" on a /products/ path
        if (r.activity_type === "cart") cur.cart = true;
        if (r.activity_type === "checkout") cur.checkout = true;
        const path = r.page_path || "";
        const isProductPath = path.startsWith("/products/") || path.startsWith("/product/");
        if (isProductPath && (r.activity_type === "browsing" || r.activity_type === "cart" || r.activity_type === "checkout")) {
          cur.productView = true;
        }
        sessions.set(r.session_id, cur);
      }

      let productViews = 0, carts = 0, checkouts = 0;
      const recentList: RecentSession[] = [];
      for (const [sid, s] of sessions) {
        if (s.productView) productViews++;
        if (s.cart) carts++;
        if (s.checkout) checkouts++;
        recentList.push({
          session_id: sid,
          created_at: s.firstSeen,
          page_path: s.lastPath,
          utm_campaign: s.campaign,
          reachedCart: s.cart,
          reachedCheckout: s.checkout,
        });
      }

      recentList.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      setCounts({ sessions: sessions.size, productViews, carts, checkouts });
      setRecent(recentList.slice(0, 25));
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      console.error("[TikTokRealtimeFunnel] fetch error", e);
      setError(e instanceof Error ? e.message : "Onbekende fout");
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => {
    setInitialLoading(true);
    fetchData();
  }, [fetchData]);

  // Auto refresh every 30s
  useEffect(() => {
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel("tiktok-realtime-funnel")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visitor_activity" }, () => {
        // Pulse the "Live" indicator briefly when a fresh event lands
        setPulse(true);
        setTimeout(() => setPulse(false), 1200);
        fetchData();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLiveStatus("offline");
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchData]);

  const stats = useMemo(() => {
    const { sessions, productViews, carts, checkouts } = counts;
    return {
      pvRate: pct(productViews, sessions),
      cartRate: pct(carts, sessions),
      cartFromPv: pct(carts, productViews),
      checkoutRate: pct(checkouts, sessions),
      checkoutFromCart: pct(checkouts, carts),
    };
  }, [counts]);

  return (
    <>
      <Helmet>
        <title>TikTok Realtime Funnel | Admin</title>
      </Helmet>
      <div className="container py-6 space-y-6 max-w-6xl relative">
        {/* Top progress bar — visible during any background refresh */}
        <div
          aria-hidden
          className={`fixed top-0 left-0 right-0 h-0.5 z-50 overflow-hidden transition-opacity ${
            refreshing ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="h-full w-1/3 bg-primary animate-[progress-slide_1.2s_ease-in-out_infinite]" />
        </div>
        <style>{`@keyframes progress-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
              <Activity className="h-6 w-6 text-primary" />
              TikTok Realtime Funnel
              <LiveBadge status={liveStatus} pulse={pulse} />
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live: TikTok sessions → product views → cart → checkout, met conversiepercentages per stap. Realtime via Supabase + auto-refresh elke 30s.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Mapping: <code>browsing</code> op <code>/products/*</code> = Product view · <code>cart</code> = Add to cart · <code>checkout</code> = Checkout
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
              <TabsList>
                <TabsTrigger value="15m">15m</TabsTrigger>
                <TabsTrigger value="1h">1h</TabsTrigger>
                <TabsTrigger value="6h">6h</TabsTrigger>
                <TabsTrigger value="24h">24h</TabsTrigger>
                <TabsTrigger value="7d">7d</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={refreshing} title="Nu verversen">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportFunnelCsv({ range, counts, stats, recent })}
              disabled={initialLoading}
              title="Exporteer huidige funnel data als CSV"
            >
              <Download className="h-4 w-4 mr-1.5" />
              CSV
            </Button>
          </div>
        </div>

        {initialLoading ? (
          <InitialSkeleton />
        ) : (
          <>

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-sm text-destructive">Fout bij laden: {error}</CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FunnelStep
            icon={<MousePointerClick className="h-4 w-4" />}
            label="TikTok sessions"
            value={counts.sessions}
            sub="100%"
            tone="default"
          />
          <FunnelStep
            icon={<Eye className="h-4 w-4" />}
            label="Product views (browsing)"
            value={counts.productViews}
            sub={`${stats.pvRate.toFixed(1)}% van sessions`}
            tone="default"
          />
          <FunnelStep
            icon={<ShoppingCart className="h-4 w-4" />}
            label="Add to cart (cart)"
            value={counts.carts}
            sub={`${stats.cartRate.toFixed(2)}% van sessions · ${stats.cartFromPv.toFixed(1)}% van PV`}
            tone={counts.carts === 0 && counts.sessions > 20 ? "warn" : "default"}
          />
          <FunnelStep
            icon={<CreditCard className="h-4 w-4" />}
            label="Checkout (checkout)"
            value={counts.checkouts}
            sub={`${stats.checkoutRate.toFixed(2)}% van sessions · ${stats.checkoutFromCart.toFixed(1)}% van cart`}
            tone={counts.checkouts === 0 && counts.carts > 0 ? "warn" : "default"}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funnel breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <FunnelBar label="Sessions → Product view" num={counts.productViews} den={counts.sessions} />
            <FunnelBar label="Product view → Cart" num={counts.carts} den={counts.productViews} />
            <FunnelBar label="Cart → Checkout" num={counts.checkouts} den={counts.carts} />
            <FunnelBar label="Sessions → Checkout (overall)" num={counts.checkouts} den={counts.sessions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recente TikTok sessions</CardTitle>
            {lastUpdated && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                {refreshing && <RefreshCw className="h-3 w-3 animate-spin" />}
                {refreshing ? "Verversen…" : `Laatst bijgewerkt ${lastUpdated.toLocaleTimeString("nl-NL")}`}
              </span>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Geen TikTok sessions in dit tijdvenster.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Tijd</th>
                      <th className="text-left p-2">Session</th>
                      <th className="text-left p-2">Pagina</th>
                      <th className="text-left p-2">Campaign</th>
                      <th className="text-left p-2">Stap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r.session_id} className="border-t border-border">
                        <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleTimeString("nl-NL")}
                        </td>
                        <td className="p-2 font-mono text-xs">{r.session_id.slice(0, 10)}…</td>
                        <td className="p-2 truncate max-w-[200px]" title={r.page_path || ""}>
                          {r.page_path || "—"}
                        </td>
                        <td className="p-2 text-xs">{r.utm_campaign || "—"}</td>
                        <td className="p-2">
                          {r.reachedCheckout ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-600">Checkout</Badge>
                          ) : r.reachedCart ? (
                            <Badge className="bg-amber-500 hover:bg-amber-500">Cart</Badge>
                          ) : (
                            <Badge variant="outline">Browsing</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
          </>
        )}
      </div>
    </>
  );
}

function LiveBadge({ status, pulse }: { status: "connecting" | "live" | "offline"; pulse: boolean }) {
  const color =
    status === "live"
      ? "bg-emerald-500"
      : status === "connecting"
        ? "bg-amber-500"
        : "bg-muted-foreground";
  const label = status === "live" ? "Live" : status === "connecting" ? "Connecting…" : "Offline";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border border-border bg-background">
      <span className="relative inline-flex h-2 w-2">
        {status === "live" && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${color} opacity-60 ${pulse ? "animate-ping" : ""}`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
      </span>
      <Radio className="h-3 w-3 text-muted-foreground" />
      {label}
    </span>
  );
}

function InitialSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-4">
            <div className="h-3 w-20 bg-muted rounded animate-pulse" />
            <div className="h-7 w-16 bg-muted rounded animate-pulse mt-2" />
            <div className="h-3 w-28 bg-muted rounded animate-pulse mt-2" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border p-6">
        <div className="h-4 w-40 bg-muted rounded animate-pulse" />
        <div className="h-2 w-full bg-muted rounded animate-pulse mt-4" />
        <div className="h-2 w-5/6 bg-muted rounded animate-pulse mt-3" />
        <div className="h-2 w-4/6 bg-muted rounded animate-pulse mt-3" />
      </div>
      <p className="text-xs text-muted-foreground text-center">Live data laden…</p>
    </div>
  );
}

function FunnelStep({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  tone: "default" | "warn";
}) {
  return (
    <Card className={tone === "warn" ? "border-amber-500/60" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-bold mt-1">{value.toLocaleString("nl-NL")}</div>
        <div className="text-xs text-muted-foreground mt-1">{sub}</div>
      </CardContent>
    </Card>
  );
}

function FunnelBar({ label, num, den }: { label: string; num: number; den: number }) {
  const rate = den > 0 ? (num / den) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {num.toLocaleString("nl-NL")} / {den.toLocaleString("nl-NL")} · {rate.toFixed(2)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${Math.min(100, rate)}%` }}
        />
      </div>
    </div>
  );
}

function exportFunnelCsv({
  range,
  counts,
  stats,
  recent,
}: {
  range: Range;
  counts: FunnelCounts;
  stats: { pvRate: number; cartRate: number; cartFromPv: number; checkoutRate: number; checkoutFromCart: number };
  recent: RecentSession[];
}) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  const generatedAt = new Date().toISOString();

  lines.push(`# TikTok Realtime Funnel export`);
  lines.push(`# generated_at,${generatedAt}`);
  lines.push(`# range,${range}`);
  lines.push("");

  lines.push("section,metric,value,denominator,rate_pct");
  lines.push(`funnel,sessions,${counts.sessions},${counts.sessions},100`);
  lines.push(`funnel,product_views,${counts.productViews},${counts.sessions},${stats.pvRate.toFixed(2)}`);
  lines.push(`funnel,add_to_cart,${counts.carts},${counts.sessions},${stats.cartRate.toFixed(2)}`);
  lines.push(`funnel,checkout,${counts.checkouts},${counts.sessions},${stats.checkoutRate.toFixed(2)}`);
  lines.push(`step,product_view_to_cart,${counts.carts},${counts.productViews},${stats.cartFromPv.toFixed(2)}`);
  lines.push(`step,cart_to_checkout,${counts.checkouts},${counts.carts},${stats.checkoutFromCart.toFixed(2)}`);
  lines.push("");

  lines.push("session_id,first_seen,page_path,utm_campaign,reached_cart,reached_checkout");
  for (const r of recent) {
    lines.push(
      [
        esc(r.session_id),
        esc(r.created_at),
        esc(r.page_path || ""),
        esc(r.utm_campaign || ""),
        r.reachedCart ? "true" : "false",
        r.reachedCheckout ? "true" : "false",
      ].join(","),
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `tiktok-funnel-${range}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}