import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, MousePointerClick, ShoppingCart, CreditCard, DollarSign, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Kpi = {
  sessions: number;
  pdpViews: number;
  addToCart: number;
  checkout: number;
  purchases: number;
  revenue: number;
  capiOutboxPending: number;
  capiOutboxSent: number;
  topProducts: { product_id: string | null; events: number }[];
};

const empty: Kpi = {
  sessions: 0, pdpViews: 0, addToCart: 0, checkout: 0, purchases: 0,
  revenue: 0, capiOutboxPending: 0, capiOutboxSent: 0, topProducts: [],
};

export default function PinterestHealth() {
  const [kpi, setKpi] = useState<Kpi>(empty);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adsDiag, setAdsDiag] = useState<any>(null);
  const [adsDiagBusy, setAdsDiagBusy] = useState(false);

  async function runAdsDiagnostic() {
    setAdsDiagBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-ads-diagnostic", { body: {} });
      if (error) throw error;
      setAdsDiag(data);
      const v = (data as any)?.verification;
      toast({
        title: v?.all_endpoints_200 ? "Pinterest Ads APIs OK" : "Pinterest Ads APIs failing",
        description: v?.all_endpoints_200
          ? "All endpoints returned 200."
          : `Failed: ${(v?.failed || []).map((f: any) => `${f.name}=${f.status}`).join(", ")}`,
        variant: v?.all_endpoints_200 ? undefined : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Diagnostic failed", description: e?.message ?? "Failed", variant: "destructive" });
    } finally {
      setAdsDiagBusy(false);
    }
  }

  async function reconnectWithAdsScopes() {
    setBusy("reconnect_ads");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-oauth-start", {
        body: {
          extra_scopes: [
            "ads:read", "ads:write",
            "catalogs:read", "catalogs:write",
            "billing:read",
          ],
          auto_sync_catalog: true, // also lands us back on /admin/pinterest-health
        },
      });
      if (error) throw error;
      const authUrl = (data as any)?.auth_url;
      if (!authUrl) throw new Error("No auth_url returned");
      sessionStorage.setItem("pinterest_ads_reconnect_pending", "1");
      window.location.href = authUrl;
    } catch (e: any) {
      toast({ title: "Reconnect failed", description: e?.message ?? "Failed", variant: "destructive" });
      setBusy(null);
    }
  }

  async function loadCatalog() {
    const { data } = await (supabase as any)
      .from("pinterest_catalog_status")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    setCatalog(data);
  }

  async function callCatalog(action: "register" | "status") {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-catalog-sync", { body: { action } });
      if (error) throw error;
      if (!data?.ok) toast({ title: "Catalog", description: data?.message || data?.code || "Failed", variant: "destructive" });
      else toast({ title: action === "register" ? "Feed registered" : "Status refreshed", description: data?.processing_status || "ok" });
      await loadCatalog();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message ?? "Failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function reconnectWithCatalogScopes() {
    setBusy("reconnect");
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-oauth-start", {
        body: {
          extra_scopes: ["catalogs:read", "catalogs:write"],
          auto_sync_catalog: true,
        },
      });
      if (error) throw error;
      const authUrl = (data as any)?.auth_url;
      if (!authUrl) throw new Error("No auth_url returned");
      window.location.href = authUrl;
    } catch (e: any) {
      toast({ title: "Reconnect failed", description: e?.message ?? "Failed", variant: "destructive" });
      setBusy(null);
    }
  }

  // Surface the result of the auto-catalog-sync that runs after OAuth callback.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("oauth_success") === "true" && qs.has("catalog_synced")) {
      const ok = qs.get("catalog_synced") === "1";
      toast({
        title: ok ? "Pinterest reconnected · catalog sync started" : "Reconnected, but catalog sync failed",
        description: ok
          ? "Catalog scopes granted and feed (re)registered. Status will update shortly."
          : "Token was saved but the catalog sync call errored — try Check status.",
        variant: ok ? undefined : "destructive",
      });
      loadCatalog();
      // Clean the URL so the toast doesn't fire again on refresh.
      const cleaned = window.location.pathname;
      window.history.replaceState({}, "", cleaned);
    }
    // Auto-run Ads diagnostic immediately after an Ads-scope reconnect.
    if (qs.get("oauth_success") === "true" && sessionStorage.getItem("pinterest_ads_reconnect_pending") === "1") {
      sessionStorage.removeItem("pinterest_ads_reconnect_pending");
      runAdsDiagnostic();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

        const [sessRes, funnelRes, outboxPendRes, outboxSentRes] = await Promise.all([
          (supabase as any).from("pinterest_attribution_sessions").select("session_key", { count: "exact", head: true }).gte("last_seen", since),
          (supabase as any).from("pinterest_funnel_events").select("event_name, value, product_id").gte("created_at", since).limit(5000),
          (supabase as any).from("pinterest_capi_outbox").select("id", { count: "exact", head: true }).is("sent_at", null),
          (supabase as any).from("pinterest_capi_outbox").select("id", { count: "exact", head: true }).not("sent_at", "is", null),
        ]);

        if (cancelled) return;

        const rows: { event_name: string; value: number | null; product_id: string | null }[] = funnelRes.data || [];
        const counts: Record<string, number> = {};
        let revenue = 0;
        const prodAgg: Record<string, number> = {};
        for (const r of rows) {
          counts[r.event_name] = (counts[r.event_name] || 0) + 1;
          if (r.event_name === "purchase" && typeof r.value === "number") revenue += Number(r.value || 0);
          if (r.product_id) prodAgg[r.product_id] = (prodAgg[r.product_id] || 0) + 1;
        }
        const topProducts = Object.entries(prodAgg)
          .map(([product_id, events]) => ({ product_id, events }))
          .sort((a, b) => b.events - a.events)
          .slice(0, 10);

        setKpi({
          sessions: sessRes.count || 0,
          pdpViews: counts["view_content"] || counts["pdp_view"] || 0,
          addToCart: counts["add_to_cart"] || 0,
          checkout: counts["checkout"] || 0,
          purchases: counts["purchase"] || 0,
          revenue,
          capiOutboxPending: outboxPendRes.count || 0,
          capiOutboxSent: outboxSentRes.count || 0,
          topProducts,
        });
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadCatalog(); }, []);

  const cr = kpi.sessions > 0 ? ((kpi.purchases / kpi.sessions) * 100).toFixed(2) : "0.00";

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Pinterest health…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Helmet><title>Pinterest Health — Admin</title></Helmet>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pinterest Health</h1>
          <p className="text-sm text-muted-foreground">Last 30 days · tracking + funnel + CAPI outbox</p>
        </div>
        <Badge variant="outline">Domain verified · {`a2f2f61…`}</Badge>
      </header>
      {err && <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">{err}</div>}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            Pinterest Product Catalog
            {catalog?.accepted_at ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Accepted</Badge>
            ) : catalog?.feed_status === "scope_missing" ? (
              <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Scope missing</Badge>
            ) : catalog?.feed_id ? (
              <Badge variant="secondary">{catalog.processing_status || catalog.feed_status || "registered"}</Badge>
            ) : (
              <Badge variant="outline">Not registered</Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={reconnectWithCatalogScopes}
              title="Reconnect Pinterest and request catalogs:read + catalogs:write, then auto-run feed sync"
            >
              {busy === "reconnect" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
              Reconnect + grant catalog scopes
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => callCatalog("status")}>
              <RefreshCw className={`h-3 w-3 mr-1 ${busy === "status" ? "animate-spin" : ""}`} />Check status
            </Button>
            <Button size="sm" disabled={busy !== null} onClick={() => callCatalog("register")}>
              {busy === "register" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              {catalog?.feed_id ? "Re-register" : "Register feed"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Feed URL</span><span className="font-mono text-xs truncate max-w-[60%]" title={catalog?.feed_url || ""}>{catalog?.feed_url || "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Feed ID</span><span className="font-mono text-xs">{catalog?.feed_id || "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Items in feed</span><span>{catalog?.items_total ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Invalid items</span><span>{catalog?.items_invalid ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Accepted at</span><span>{catalog?.accepted_at ? new Date(catalog.accepted_at).toLocaleString() : "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Last checked</span><span>{catalog?.last_checked_at ? new Date(catalog.last_checked_at).toLocaleString() : "—"}</span></div>
          {catalog?.last_error && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs mt-2">{catalog.last_error}</div>
          )}
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Sessions", value: kpi.sessions, icon: Activity },
          { label: "PDP Views", value: kpi.pdpViews, icon: MousePointerClick },
          { label: "Add To Cart", value: kpi.addToCart, icon: ShoppingCart },
          { label: "Checkouts", value: kpi.checkout, icon: CreditCard },
          { label: "Purchases", value: kpi.purchases, icon: DollarSign },
          { label: "Revenue (USD)", value: `$${kpi.revenue.toFixed(2)}`, icon: DollarSign },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" />{label}</div>
              <div className="text-2xl font-semibold mt-1">{value}</div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Funnel quality</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Conversion rate</span><span className="font-medium">{cr}%</span></div>
            <div className="flex justify-between"><span>ATC → Purchase</span><span className="font-medium">{kpi.addToCart > 0 ? ((kpi.purchases / kpi.addToCart) * 100).toFixed(1) : "0.0"}%</span></div>
            <div className="flex justify-between"><span>Avg order value</span><span className="font-medium">${kpi.purchases > 0 ? (kpi.revenue / kpi.purchases).toFixed(2) : "0.00"}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">CAPI relay</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Outbox pending</span><Badge variant={kpi.capiOutboxPending > 50 ? "destructive" : "secondary"}>{kpi.capiOutboxPending}</Badge></div>
            <div className="flex justify-between"><span>Outbox sent (total)</span><span className="font-medium">{kpi.capiOutboxSent}</span></div>
            <div className="text-xs text-muted-foreground pt-1">Relay drains via <code>pinterest-capi-relay</code> cron.</div>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Top Pinterest-driven products (events)</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr><th className="text-left p-2">Product ID</th><th className="text-right p-2">Events</th></tr>
              </thead>
              <tbody>
                {kpi.topProducts.length === 0 ? (
                  <tr><td colSpan={2} className="p-4 text-center text-muted-foreground">No attributed product events in window.</td></tr>
                ) : kpi.topProducts.map((p) => (
                  <tr key={p.product_id || "unknown"} className="border-t">
                    <td className="p-2 font-mono text-xs">{p.product_id}</td>
                    <td className="p-2 text-right">{p.events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}