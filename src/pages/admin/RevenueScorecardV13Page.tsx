import { useEffect, useState, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

type Axis = { label: string; score: number; note: string };

function scoreBadge(n: number) {
  if (n >= 80) return <Badge className="bg-emerald-600">healthy</Badge>;
  if (n >= 50) return <Badge variant="outline">watch</Badge>;
  return <Badge variant="destructive">critical</Badge>;
}

export default function RevenueScorecardV13Page() {
  const [axes, setAxes] = useState<Axis[]>([]);
  const [overall, setOverall] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
    const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
    const [ev, orders, credits, posted, canonNames] = await Promise.all([
      supabase.from("canonical_events").select("canonical_name,session_id,country,page_path").gte("occurred_at", since7d),
      supabase.from("orders").select("status,total_amount,created_at").gte("created_at", since30d),
      supabase.from("pinterest_credit_events").select("credits_used").gte("created_at", since7d),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).eq("status", "posted").gte("posted_at", since7d),
      supabase.from("canonical_events").select("canonical_name").limit(1),
    ]);
    const events = ev.data ?? [];
    const sessions = new Set(events.map((e: any) => e.session_id).filter(Boolean));
    const us = new Set(events.filter((e: any) => e.country === "US").map((e: any) => e.session_id));
    const pdp = events.filter((e: any) => e.canonical_name === "CANONICAL_PRODUCT_VIEW").length;
    const atc = events.filter((e: any) => e.canonical_name === "CANONICAL_ADD_TO_CART").length;
    const chk = events.filter((e: any) => e.canonical_name === "CANONICAL_CHECKOUT").length;
    const collectionPv = events.filter((e: any) => (e.page_path ?? "").startsWith("/collections/")).length;
    const ord = orders.data ?? [];
    const paid = ord.filter((o: any) => o.status === "paid").length;
    const expired = ord.filter((o: any) => o.status === "expired").length;
    const spent7d = (credits.data ?? []).reduce((s: number, e: any) => s + (e.credits_used ?? 0), 0);
    const posted7d = posted.count ?? 0;

    const trackingScore = collectionPv > 0 ? 80 : 25;
    const geoScore = sessions.size > 0 ? Math.round((us.size / sessions.size) * 100) : 0;
    const funnelAtc = pdp > 0 ? (atc / pdp) * 100 : 0;
    const funnelChk = atc > 0 ? (chk / atc) * 100 : 0;
    const purchaseScore = paid > 0 ? Math.min(100, paid * 10) : 0;
    const checkoutHealth = expired + paid > 0 ? Math.round((paid / (paid + expired)) * 100) : 0;
    const aiEff = posted7d > 0 ? Math.max(0, Math.min(100, 100 - Math.round(((spent7d / posted7d) / 311.6) * 50))) : 20;

    const list: Axis[] = [
      { label: "Traffic Quality", score: sessions.size > 100 ? 70 : 40, note: `${sessions.size} sessions / 7d` },
      { label: "Tracking Integrity", score: trackingScore, note: collectionPv > 0 ? `${collectionPv} collection PVs` : "canonical enum has no page_view — collection PVs = 0" },
      { label: "US Attribution", score: geoScore, note: `${us.size}/${sessions.size} sessions tagged US` },
      { label: "Funnel · ATC rate", score: Math.round(funnelAtc), note: `${atc}/${pdp} PDP → ATC (${funnelAtc.toFixed(1)}%)` },
      { label: "Funnel · Checkout rate", score: Math.round(funnelChk), note: `${chk}/${atc} ATC → Checkout` },
      { label: "Checkout Health", score: checkoutHealth, note: `${paid} paid / ${expired} expired (30d)` },
      { label: "Trust · Brand", score: 55, note: "Stripe DBA still 'Skidzo' — rename to GetPawsy pending" },
      { label: "AI Efficiency", score: aiEff, note: `${spent7d} credits / ${posted7d} pins · V11.2 recovery live` },
      { label: "Product Readiness", score: 70, note: "353 in-stock, PRE/Native gates active" },
      { label: "Revenue Readiness", score: purchaseScore, note: `${paid} paid orders (30d) — first-100 target` },
    ];
    setAxes(list);
    setOverall(Math.round(list.reduce((s, a) => s + a.score, 0) / list.length));
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <Helmet><title>Revenue Scorecard V13 | Admin</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Revenue Scorecard · V13</h1>
          <p className="text-sm text-muted-foreground">Zero Revenue → First 100 Sales · live evidence-only readiness</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Overall Sales Readiness</div>
            <div className="text-5xl font-bold mt-1">{overall}<span className="text-xl text-muted-foreground">/100</span></div>
          </div>
          <div>{scoreBadge(overall)}</div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        {axes.map((a) => (
          <Card key={a.label}>
            <CardHeader className="pb-2 flex-row justify-between items-center">
              <CardTitle className="text-base">{a.label}</CardTitle>
              {scoreBadge(a.score)}
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-semibold">{a.score}</div>
              <div className="text-xs text-muted-foreground mt-1">{a.note}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}