import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, ArrowLeft, Bot, Crown, DollarSign, Gauge, Loader2, RefreshCw, Rocket, ShieldAlert, Sparkles, Target, TrendingUp, Users, Wallet, Zap } from "lucide-react";
import { toast } from "sonner";

// ---------- Types ----------
type Priority = { key?: string; label?: string; category?: string; score?: number; confidence?: number; gap_points?: number; revenue_impact_est?: number; note?: string };
type Sub = { subscore_key: string; category: string; label: string; score: number | null; weight: number; confidence: number | null };

function fmt$(n: number) {
  if (!Number.isFinite(n)) return "UNKNOWN";
  return `$${Math.round(n).toLocaleString()}`;
}

function ConfBadge({ n }: { n: number | null | undefined }) {
  if (n == null) return <Badge variant="outline">UNKNOWN</Badge>;
  const v = Number(n);
  if (v >= 80) return <Badge className="bg-emerald-600 text-white">HIGH</Badge>;
  if (v >= 55) return <Badge className="bg-amber-500 text-white">MED</Badge>;
  return <Badge className="bg-red-600 text-white">LOW</Badge>;
}

function Leak({ icon: Icon, title, value, sub, tone = "red" }: { icon: any; title: string; value: string; sub?: string; tone?: "red" | "emerald" | "amber" }) {
  const cls = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-red-600";
  return (
    <div className="border rounded p-3 flex flex-col gap-1">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {title}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground truncate">{sub}</div> : null}
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="border rounded p-3">
      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default function ExecutiveWarRoomPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<{ overall_score: number; confidence: number; priorities: Priority[]; captured_at: string; sha256: string | null } | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [today, setToday] = useState({ revenue: 0, orders: 0, visitors: 0, pins: 0 });
  const [funnel, setFunnel] = useState({ pv: 0, atc: 0, checkout: 0, purchase: 0 });
  const [topProduct, setTopProduct] = useState<{ name: string; count: number } | null>(null);
  const [topCampaign, setTopCampaign] = useState<{ name: string; count: number } | null>(null);
  const [pendingDecisions, setPendingDecisions] = useState<any[]>([]);
  const [briefing, setBriefing] = useState<{ top_threat: string | null; top_opportunity: string | null; top_revenue_leak: string | null; highest_roi: string | null; confidence: number | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
      const dayIso = startOfDay.toISOString();
      const since5m = new Date(Date.now() - 5 * 60_000).toISOString();

      const bhiQ: any = supabase.from("bhi_snapshots").select("overall_score,confidence,priorities,captured_at,sha256,id").order("captured_at", { ascending: false }).limit(1).maybeSingle();
      const brQ: any = supabase.from("bhi_briefings").select("top_threat,top_opportunity,top_revenue_leak,highest_roi,confidence").order("briefing_date", { ascending: false }).limit(1).maybeSingle();
      const ordersQ: any = supabase.from("orders").select("total_amount,created_at").eq("status", "paid").gte("created_at", dayIso);
      const pinsQ: any = supabase.from("pinterest_pins").select("id", { count: "exact", head: true }).gte("created_at", dayIso);
      const pvQ: any = supabase.from("canonical_events").select("id", { count: "exact", head: true }).eq("canonical_name", "page_view").gte("occurred_at", dayIso);
      const atcQ: any = supabase.from("canonical_events").select("id", { count: "exact", head: true }).eq("canonical_name", "add_to_cart").gte("occurred_at", dayIso);
      const chkQ: any = supabase.from("canonical_events").select("id", { count: "exact", head: true }).eq("canonical_name", "begin_checkout").gte("occurred_at", dayIso);
      const purchQ: any = supabase.from("canonical_events").select("id", { count: "exact", head: true }).eq("canonical_name", "purchase").gte("occurred_at", dayIso);
      const liveQ: any = supabase.from("canonical_events").select("id", { count: "exact", head: true }).eq("canonical_name", "page_view").gte("occurred_at", since5m);
      const topProdQ: any = supabase.from("canonical_events").select("product_id").eq("canonical_name", "add_to_cart").gte("occurred_at", dayIso).not("product_id", "is", null).limit(500);
      const topCampQ: any = supabase.from("canonical_events").select("utm_campaign").gte("occurred_at", dayIso).not("utm_campaign", "is", null).limit(500);
      const pendingQ: any = supabase.from("governance_decision_log").select("id,timestamp,source_engine,decision_type,proposal,expected_metric,expected_value,confidence,outcome").is("outcome", null).order("timestamp", { ascending: false }).limit(15);

      const [bhi, br, ords, pins, pv, atc, chk, prch, live, topProd, topCamp, pending] = await Promise.all([
        bhiQ, brQ, ordersQ, pinsQ, pvQ, atcQ, chkQ, purchQ, liveQ, topProdQ, topCampQ, pendingQ,
      ]);

      const firstErr = bhi?.error || br?.error || ords?.error;
      if (firstErr) throw firstErr;

      if (bhi?.data) {
        setSnap(bhi.data as any);
        const { data: subRows } = await supabase.from("bhi_subscores").select("subscore_key,category,label,score,weight,confidence").eq("snapshot_id", (bhi.data as any).id);
        setSubs((subRows ?? []) as Sub[]);
      }
      setBriefing((br?.data as any) ?? null);

      const revenue = (ords?.data ?? []).reduce((a: number, r: any) => a + (Number(r.total_amount) || 0), 0);
      setToday({ revenue, orders: (ords?.data ?? []).length, visitors: pv?.count ?? 0, pins: pins?.count ?? 0 });
      setFunnel({ pv: pv?.count ?? 0, atc: atc?.count ?? 0, checkout: chk?.count ?? 0, purchase: prch?.count ?? 0 });

      // Live visitors bucket separate — reuse liveQ for the header
      (window as any).__liveVisitors = live?.count ?? 0;

      // Top product / campaign (client-side frequency)
      const prodTally = new Map<string, number>();
      for (const r of (topProd?.data ?? []) as any[]) {
        const k = String(r.product_id); prodTally.set(k, (prodTally.get(k) ?? 0) + 1);
      }
      const tp = [...prodTally.entries()].sort((a, b) => b[1] - a[1])[0];
      setTopProduct(tp ? { name: tp[0], count: tp[1] } : null);

      const campTally = new Map<string, number>();
      for (const r of (topCamp?.data ?? []) as any[]) {
        const k = String(r.utm_campaign); campTally.set(k, (campTally.get(k) ?? 0) + 1);
      }
      const tc = [...campTally.entries()].sort((a, b) => b[1] - a[1])[0];
      setTopCampaign(tc ? { name: tc[0], count: tc[1] } : null);

      setPendingDecisions(pending?.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load war room");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  // Priority engine — ranks by revenue × confidence, dedup, top-line answer
  const ranked = useMemo(() => {
    const rows: Array<{ key: string; label: string; category: string; revenue: number; confidence: number | null; roiScore: number; auto: boolean }> = [];
    const seen = new Set<string>();
    for (const p of (snap?.priorities ?? []) as Priority[]) {
      const key = String(p.key ?? p.label ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const rev = Number(p.revenue_impact_est ?? 0);
      const conf = p.confidence == null ? null : Number(p.confidence);
      rows.push({ key, label: String(p.label ?? key), category: String(p.category ?? "general"), revenue: rev, confidence: conf, roiScore: rev * ((conf ?? 50) / 100), auto: false });
    }
    return rows.sort((a, b) => b.roiScore - a.roiScore);
  }, [snap]);

  const expectedRecoveryMo = useMemo(() => ranked.reduce((a, r) => a + r.roiScore, 0), [ranked]);
  const top = ranked[0] ?? null;

  // Find weakest sub for AI/tracking/trust to fill leak cards
  const weakest = (needle: string) => {
    return [...subs].filter((s) => (s.category + " " + s.label + " " + s.subscore_key).toLowerCase().includes(needle))
      .filter((s) => s.score != null)
      .sort((a, b) => Number(a.score) - Number(b.score))[0] ?? null;
  };
  const trackW = weakest("track");
  const trustW = weakest("trust");
  const aiW = weakest("ai");
  const seoW = weakest("seo");
  const pinW = weakest("pin");

  const conv = funnel.pv > 0 ? (funnel.purchase / funnel.pv) * 100 : null;

  const decide = async (id: string, decision: "approved" | "rejected") => {
    try {
      const { error: e } = await supabase.from("governance_decision_log").update({
        outcome: decision, executed_at: decision === "approved" ? new Date().toISOString() : null,
      } as any).eq("id", id);
      if (e) throw e;
      toast.success(decision === "approved" ? "Approved" : "Rejected");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Helmet>
        <title>Executive War Room · Genesis AROS</title>
        <meta name="description" content="Autonomous Revenue Operating System — single-page command surface for GetPawsy: revenue, funnel, leaks, opportunities, and pending approvals." />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/admin/mission-control" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="h-3 w-3" /> Mission Control</Link>
            <span>/</span><span>Executive War Room</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2"><Crown className="h-6 w-6 text-amber-500" /> Executive War Room</h1>
          <p className="text-sm text-muted-foreground">Autonomous Revenue OS · single answer to "what earns the next dollar?"</p>
        </div>
        <div className="flex items-center gap-2">
          {snap ? <Badge variant="outline">BHI {snap.overall_score.toFixed(0)} · <ConfBadge n={snap.confidence} /></Badge> : null}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </header>

      {error ? <div className="text-sm text-red-600 border border-red-200 rounded p-3">{error}</div> : null}

      {/* HEADLINE ANSWER */}
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> Single highest-value action right now</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {!top ? (
            <div className="text-muted-foreground">
              {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Ranking evidence…</span> : "UNKNOWN — no ranked evidence yet. Compute a fresh BHI snapshot."}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{top.label}</span>
                <Badge variant="outline">{top.category}</Badge>
                <ConfBadge n={top.confidence} />
              </div>
              <div className="text-emerald-700 font-medium">Expected recovery: {fmt$(top.revenue)}/mo · Weighted ROI {fmt$(top.roiScore)}/mo</div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" asChild><Link to={`/admin/evidence-explorer?metric=${encodeURIComponent(top.key)}`}>View evidence</Link></Button>
                <Button size="sm" variant="outline" asChild><Link to="/admin/mission-control">Approve in Mission Control</Link></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LIVE / TODAY */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Revenue today" value={fmt$(today.revenue)} icon={DollarSign} />
        <Stat label="Orders today" value={String(today.orders)} icon={Wallet} />
        <Stat label="Visitors today" value={String(today.visitors)} icon={Users} />
        <Stat label="Conversion" value={conv == null ? "UNKNOWN" : `${conv.toFixed(2)}%`} icon={Target} />
      </section>

      {/* CONVERSION FUNNEL */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Conversion Funnel (today)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 text-sm">
            {[
              { label: "Pageview", n: funnel.pv },
              { label: "Add to cart", n: funnel.atc },
              { label: "Begin checkout", n: funnel.checkout },
              { label: "Purchase", n: funnel.purchase },
            ].map((s, i, arr) => {
              const prev = i === 0 ? s.n : arr[i - 1].n;
              const rate = prev > 0 ? (s.n / prev) * 100 : null;
              return (
                <div key={s.label} className="border rounded p-3">
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                  <div className="text-xl font-semibold">{s.n.toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground">{i === 0 ? "start" : rate == null ? "UNKNOWN" : `${rate.toFixed(1)}% from prev`}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* LEAKS / OPPORTUNITIES */}
      <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        <Leak icon={AlertTriangle} title="Top revenue leak" value={briefing?.top_revenue_leak || top?.label || "UNKNOWN"} sub={top ? `${fmt$(top.revenue)}/mo est` : undefined} />
        <Leak icon={ShieldAlert} title="Top trust issue" tone="amber" value={trustW?.label ?? "UNKNOWN"} sub={trustW ? `Score ${Number(trustW.score).toFixed(0)}` : undefined} />
        <Leak icon={Activity} title="Top tracking issue" tone="amber" value={trackW?.label ?? "UNKNOWN"} sub={trackW ? `Score ${Number(trackW.score).toFixed(0)}` : undefined} />
        <Leak icon={Bot} title="Top AI waste" tone="amber" value={aiW?.label ?? "UNKNOWN"} sub={aiW ? `Score ${Number(aiW.score).toFixed(0)}` : undefined} />
        <Leak icon={Gauge} title="Top SEO opportunity" tone="emerald" value={seoW?.label ?? "UNKNOWN"} sub={seoW ? `Gap ${Math.max(0, 100 - Number(seoW.score)).toFixed(0)} pts` : undefined} />
        <Leak icon={Rocket} title="Top Pinterest opportunity" tone="emerald" value={pinW?.label ?? "UNKNOWN"} sub={pinW ? `Gap ${Math.max(0, 100 - Number(pinW.score)).toFixed(0)} pts` : undefined} />
        <Leak icon={Sparkles} title="Top product (today)" tone="emerald" value={topProduct?.name || "UNKNOWN"} sub={topProduct ? `${topProduct.count} ATC` : undefined} />
        <Leak icon={Sparkles} title="Top campaign (today)" tone="emerald" value={topCampaign?.name || "UNKNOWN"} sub={topCampaign ? `${topCampaign.count} events` : undefined} />
        <Leak icon={Sparkles} title="Expected monthly recovery" tone="emerald" value={fmt$(expectedRecoveryMo)} sub={`from ${ranked.length} ranked fixes`} />
      </section>

      {/* PRIORITY QUEUE */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Priority Queue — ranked by ROI × confidence</CardTitle></CardHeader>
        <CardContent>
          {ranked.length === 0 ? (
            <div className="text-sm text-muted-foreground">No ranked priorities. Compute a fresh BHI snapshot to populate.</div>
          ) : (
            <div className="divide-y">
              {ranked.slice(0, 10).map((r, i) => (
                <div key={r.key} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-muted-foreground w-6 text-right">#{i + 1}</span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.label}</div>
                      <div className="text-[11px] text-muted-foreground">{r.category}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <ConfBadge n={r.confidence} />
                    <span className="text-emerald-700 font-medium">{fmt$(r.revenue)}/mo</span>
                    <Button size="sm" variant="ghost" asChild><Link to={`/admin/evidence-explorer?metric=${encodeURIComponent(r.key)}`}>Evidence</Link></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* PENDING APPROVALS */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Pending Approvals (governance)</CardTitle></CardHeader>
        <CardContent>
          {pendingDecisions.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing awaiting human review — safe-execution queue empty.</div>
          ) : (
            <div className="divide-y">
              {pendingDecisions.map((d: any) => (
                <div key={d.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.proposal?.label ?? d.decision_type}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{d.source_engine} · {new Date(d.timestamp).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    {d.expected_value != null ? <span className="text-emerald-700 font-medium">{fmt$(Number(d.expected_value))}/mo</span> : null}
                    <ConfBadge n={d.confidence} />
                    <Button size="sm" onClick={() => decide(d.id, "approved")}>Approve</Button>
                    <Button size="sm" variant="outline" onClick={() => decide(d.id, "rejected")}>Reject</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
