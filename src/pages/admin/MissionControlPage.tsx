import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MissionControlCertification, { type DrillCtx } from "@/components/admin/MissionControlCertification";
import {
  Activity, AlertTriangle, ArrowUpRight, Bot, DollarSign, Gauge, Globe,
  HeartPulse, LineChart, RefreshCw, Rocket, Search, ShieldCheck, Users, Wallet, Wrench, FileCheck2,
} from "lucide-react";

type Snap = {
  id: string;
  captured_at: string;
  overall_score: number;
  confidence: number;
  status: string;
  trend: number | null;
  yesterday_score: number | null;
  simulation: any;
  priorities: any[] | null;
  executive_summary: any;
  sha256: string | null;
};
type Briefing = {
  briefing_date: string;
  overall_score: number;
  yesterday_score: number | null;
  trend: number | null;
  top_opportunity: string | null;
  top_threat: string | null;
  top_revenue_leak: string | null;
  top_revenue_opportunity: string | null;
  highest_roi: string | null;
  critical_alerts: any[] | null;
  expected_revenue_today: number | null;
  expected_profit_today: number | null;
  confidence: number | null;
};
type Sub = {
  subscore_key: string; category: string; label: string;
  score: number; weight: number; confidence: number;
};

function statusPill(score: number) {
  if (score >= 85) return { label: "EXCELLENT", cls: "bg-emerald-600 text-white" };
  if (score >= 70) return { label: "HEALTHY", cls: "bg-emerald-500 text-white" };
  if (score >= 50) return { label: "WATCH", cls: "bg-amber-500 text-white" };
  if (score >= 30) return { label: "CRITICAL", cls: "bg-red-600 text-white" };
  return { label: "EMERGENCY", cls: "bg-red-800 text-white" };
}
function scoreColor(n: number) {
  if (n >= 80) return "text-emerald-600";
  if (n >= 60) return "text-emerald-500";
  if (n >= 40) return "text-amber-600";
  return "text-red-600";
}

function ScoreCard({ label, score, sub, icon: Icon }: { label: string; score: number | null; sub?: string; icon: any }) {
  const s = score ?? 0;
  const pill = statusPill(s);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="h-4 w-4" />
            {label}
          </div>
          <Badge className={pill.cls}>{pill.label}</Badge>
        </div>
        <div className={`text-3xl font-semibold ${scoreColor(s)}`}>{score == null ? "—" : s.toFixed(0)}</div>
        {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function fmtCurrency(n: number) {
  return `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

const REPORT_LINKS: { title: string; to: string; icon: any }[] = [
  { title: "Business Health Index", to: "/admin/business-health", icon: Gauge },
  { title: "Sales Readiness", to: "/admin/sales-readiness", icon: Rocket },
  { title: "Revenue Command Center", to: "/admin/revenue-command-center", icon: DollarSign },
  { title: "Revenue Scorecard V13", to: "/admin/revenue-scorecard-v13", icon: LineChart },
  { title: "AI Credit Intelligence", to: "/admin/ai-credit-intelligence", icon: Bot },
  { title: "Pinterest Health", to: "/admin/pinterest-health", icon: Activity },
  { title: "Pinterest Control Center", to: "/admin/pinterest-control-center", icon: Activity },
  { title: "Executive Twin", to: "/admin/enterprise-twin", icon: ShieldCheck },
  { title: "Genesis Omega", to: "/admin/omega", icon: Rocket },
  { title: "Genesis Genome", to: "/admin/genome", icon: Wrench },
  { title: "Live Visitor Map", to: "/live-map", icon: Globe },
  { title: "Growth Command Center", to: "/admin/growth-command-center", icon: LineChart },
  { title: "Autonomous Commerce", to: "/admin/autonomous-commerce", icon: Bot },
  { title: "CFO Chat", to: "/admin/cfo-chat", icon: Wallet },
];

export default function MissionControlPage() {
  const [snap, setSnap] = useState<Snap | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [salesReadiness, setSalesReadiness] = useState<{ score: number; status: string } | null>(null);
  const [today, setToday] = useState<{ orders: number; revenue: number; pinsToday: number; visitors: number }>({
    orders: 0, revenue: 0, pinsToday: 0, visitors: 0,
  });
  const [live, setLive] = useState<{ visitors: number; addToCart: number; checkout: number; purchase: number }>({
    visitors: 0, addToCart: 0, checkout: 0, purchase: 0,
  });
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [verify, setVerify] = useState<{
    running: boolean;
    newSha: string | null;
    newOverall: number | null;
    newConfidence: number | null;
    matches: boolean | null;
    error: string | null;
    ranAt: string | null;
  }>({ running: false, newSha: null, newOverall: null, newConfidence: null, matches: null, error: null, ranAt: null });

  const loadCore = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const bhiQ: any = supabase.from("bhi_snapshots").select("*").order("captured_at", { ascending: false }).limit(1).maybeSingle();
      const srQ: any = supabase.from("sales_readiness_snapshots").select("overall_score,status,captured_at")
        .order("captured_at", { ascending: false }).limit(1).maybeSingle();
      const brQ: any = supabase.from("bhi_briefings").select("*").order("briefing_date", { ascending: false }).limit(1).maybeSingle();
      const [bhiRes, srRes, brRes] = await Promise.all([bhiQ, srQ, brQ]);
      const firstErr = bhiRes?.error || srRes?.error || brRes?.error;
      if (firstErr) throw firstErr;
      const bhi = bhiRes?.data;
      const sr = srRes?.data;
      const br = brRes?.data;
      if (bhi) {
        setSnap(bhi as unknown as Snap);
        const { data: subRows } = await supabase
          .from("bhi_subscores").select("subscore_key,category,label,score,weight,confidence")
          .eq("snapshot_id", (bhi as { id: string }).id);
        setSubs((subRows ?? []) as Sub[]);
      }
      if (sr) setSalesReadiness({ score: Number((sr as any).overall_score) || 0, status: String((sr as any).status || "") });
      if (br) setBriefing(br as unknown as Briefing);
    } catch (e: any) {
      setLoadError(e?.message ?? "Failed to load BHI snapshot");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadToday = useCallback(async () => {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const iso = startOfDay.toISOString();

    const ordersQ: any = supabase.from("orders").select("total_amount,status", { count: "exact" });
    const pinsQ: any = supabase.from("pinterest_pins").select("id", { count: "exact", head: true });
    const visitorsQ: any = supabase.from("canonical_events").select("session_id", { count: "exact", head: true });
    const [ordersRes, pinsRes, visitorsRes] = await Promise.all([
      ordersQ.gte("created_at", iso).eq("status", "paid"),
      pinsQ.gte("created_at", iso),
      visitorsQ.gte("event_at", iso).eq("event_name", "page_view"),
    ]);

    const revenue = (ordersRes.data ?? []).reduce((acc, r: any) => acc + (Number(r.total_amount) || 0), 0);
    setToday({
      orders: ordersRes.count ?? 0,
      revenue,
      pinsToday: pinsRes.count ?? 0,
      visitors: visitorsRes.count ?? 0,
    });
  }, []);

  const loadLive = useCallback(async () => {
    const since = new Date(Date.now() - 5 * 60_000).toISOString();
    const eventBuckets = ["page_view", "add_to_cart", "begin_checkout", "purchase"];
    const results = await Promise.all(
      eventBuckets.map((name) => {
        const q: any = supabase.from("canonical_events").select("id", { count: "exact", head: true });
        return q.gte("event_at", since).eq("event_name", name);
      })
    );
    setLive({
      visitors: results[0].count ?? 0,
      addToCart: results[1].count ?? 0,
      checkout: results[2].count ?? 0,
      purchase: results[3].count ?? 0,
    });
  }, []);

  useEffect(() => {
    loadCore();
    loadToday();
    loadLive();
    const iv = setInterval(() => { loadLive(); loadToday(); }, 30_000);
    return () => clearInterval(iv);
  }, [loadCore, loadToday, loadLive]);

  const recomputeAndCompare = useCallback(async () => {
    setVerify((v) => ({ ...v, running: true, error: null }));
    try {
      const { data, error } = await supabase.functions.invoke("bhi-compute", { body: {} });
      if (error) throw error;
      const newSha: string | null = (data as any)?.sha256 ?? null;
      const newOverall = Number((data as any)?.overall ?? NaN);
      const newConfidence = Number((data as any)?.confidence ?? NaN);
      const priorSha = snap?.sha256 ?? null;
      setVerify({
        running: false,
        newSha,
        newOverall: Number.isFinite(newOverall) ? newOverall : null,
        newConfidence: Number.isFinite(newConfidence) ? newConfidence : null,
        matches: newSha && priorSha ? newSha === priorSha : null,
        error: null,
        ranAt: new Date().toISOString(),
      });
      await loadCore();
    } catch (e: any) {
      setVerify({
        running: false, newSha: null, newOverall: null, newConfidence: null,
        matches: null, error: e?.message ?? "Recompute failed", ranAt: new Date().toISOString(),
      });
    }
  }, [snap?.sha256, loadCore]);

  const subsByCategory = useMemo(() => {
    const map = new Map<string, Sub[]>();
    subs.forEach((s) => {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    });
    return Array.from(map.entries()).map(([cat, list]) => {
      const avg = list.reduce((a, x) => a + Number(x.score || 0), 0) / (list.length || 1);
      return { category: cat, avg, list };
    }).sort((a, b) => a.avg - b.avg);
  }, [subs]);

  const priorities = (snap?.priorities ?? []) as any[];
  const overallScore = snap?.overall_score ?? 0;
  const overall = statusPill(overallScore);
  const filteredReports = REPORT_LINKS.filter((r) =>
    q.trim() === "" ? true : r.title.toLowerCase().includes(q.trim().toLowerCase())
  );

  const drillCtx: DrillCtx = useMemo(() => {
    const lowest = [...subs]
      .sort((a, b) => Number(a.score) - Number(b.score))
      .slice(0, 5)
      .map((s) => ({ key: s.subscore_key, label: s.label, score: Number(s.score) }));
    const contributing = subs.filter((s) => Number(s.confidence) > 0).length;
    return {
      overall: snap?.overall_score ?? null,
      confidence: snap?.confidence ?? null,
      capturedAt: snap?.captured_at ?? null,
      sha256: snap?.sha256 ?? null,
      subCount: subs.length,
      contributingCount: contributing,
      lowestSubs: lowest,
    };
  }, [snap, subs]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Helmet>
        <title>Mission Control · Genesis Ω∞</title>
        <meta name="description" content="Single control center for GetPawsy — health, live activity, revenue, AI, Pinterest and reports in one place." />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Mission Control</h1>
          <p className="text-sm text-muted-foreground">
            Genesis HQ · Single source of operational truth ·{" "}
            {snap?.captured_at ? new Date(snap.captured_at).toLocaleString() : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={overall.cls}>Company: {overall.label}</Badge>
          <Button variant="outline" size="sm" onClick={() => { loadCore(); loadToday(); loadLive(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      {/* SECTION 1 — EXECUTIVE HEALTH */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Executive Health</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ScoreCard label="Business Health" score={overallScore} icon={Gauge} sub={`Confidence ${snap?.confidence?.toFixed(0) ?? "—"}%`} />
          <ScoreCard label="Sales Readiness" score={salesReadiness?.score ?? null} icon={Rocket} sub={salesReadiness?.status || "—"} />
          <ScoreCard
            label="Revenue Readiness"
            score={subs.find((s) => s.category?.toLowerCase().includes("revenue"))?.score ?? null}
            icon={DollarSign}
          />
          <ScoreCard
            label="Trust"
            score={subs.find((s) => s.subscore_key?.toLowerCase().includes("trust"))?.score ?? null}
            icon={ShieldCheck}
          />
          <ScoreCard
            label="AI Efficiency"
            score={subs.find((s) => s.category?.toLowerCase().includes("ai"))?.score ?? null}
            icon={Bot}
          />
          <ScoreCard
            label="Infrastructure"
            score={subs.find((s) => s.category?.toLowerCase().includes("infra"))?.score ?? null}
            icon={Wrench}
          />
          <ScoreCard
            label="Tracking Integrity"
            score={subs.find((s) => s.subscore_key?.toLowerCase().includes("track"))?.score ?? null}
            icon={Activity}
          />
          <ScoreCard
            label="Customer Satisfaction"
            score={subs.find((s) => s.category?.toLowerCase().includes("customer"))?.score ?? null}
            icon={HeartPulse}
          />
        </div>
      </section>

      {/* SECTION 4 — CEO BRIEFING */}
      <section>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Rocket className="h-4 w-4" /> CEO Briefing — Good morning, Jasper
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div><span className="text-muted-foreground">Business Health:</span> <span className={`font-medium ${scoreColor(overallScore)}`}>{overallScore.toFixed(0)} / 100</span></div>
              <div><span className="text-muted-foreground">Sales Readiness:</span> <span className="font-medium">{salesReadiness ? `${salesReadiness.score.toFixed(0)} / 100` : "—"}</span></div>
              <div><span className="text-muted-foreground">Expected Revenue Today:</span> <span className="font-medium">{briefing?.expected_revenue_today != null ? fmtCurrency(Number(briefing.expected_revenue_today)) : "—"}</span></div>
              <div><span className="text-muted-foreground">Expected Profit Today:</span> <span className="font-medium">{briefing?.expected_profit_today != null ? fmtCurrency(Number(briefing.expected_profit_today)) : "—"}</span></div>
              <div><span className="text-muted-foreground">Confidence:</span> <span className="font-medium">{briefing?.confidence?.toFixed(0) ?? snap?.confidence?.toFixed(0) ?? "—"}%</span></div>
            </div>
            <div className="space-y-2">
              <div><AlertTriangle className="inline h-3.5 w-3.5 mr-1 text-red-600" /><span className="text-muted-foreground">Biggest Threat:</span> <span className="font-medium">{briefing?.top_threat || "—"}</span></div>
              <div><ArrowUpRight className="inline h-3.5 w-3.5 mr-1 text-emerald-600" /><span className="text-muted-foreground">Biggest Opportunity:</span> <span className="font-medium">{briefing?.top_opportunity || "—"}</span></div>
              <div><DollarSign className="inline h-3.5 w-3.5 mr-1 text-red-500" /><span className="text-muted-foreground">Biggest Revenue Leak:</span> <span className="font-medium">{briefing?.top_revenue_leak || "—"}</span></div>
              <div><LineChart className="inline h-3.5 w-3.5 mr-1" /><span className="text-muted-foreground">Highest ROI Task:</span> <span className="font-medium">{briefing?.highest_roi || "—"}</span></div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SECTION 2 & 3 — LIVE + TODAY */}
      <section className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Live (last 5 min)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Visitors" value={String(live.visitors)} icon={Users} />
            <StatCard label="Add to Cart" value={String(live.addToCart)} icon={Activity} />
            <StatCard label="Checkout" value={String(live.checkout)} icon={Activity} />
            <StatCard label="Purchases" value={String(live.purchase)} icon={DollarSign} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <LineChart className="h-4 w-4" /> Today
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Revenue" value={fmtCurrency(today.revenue)} icon={DollarSign} />
            <StatCard label="Orders" value={String(today.orders)} icon={Wallet} />
            <StatCard label="Visitors" value={String(today.visitors)} icon={Users} />
            <StatCard label="Pins Published" value={String(today.pinsToday)} icon={Rocket} />
          </CardContent>
        </Card>
      </section>

      {/* SECTION 5 — MISSION BOARD (priorities from BHI) */}
      <section>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Mission Board — Prioritized by revenue impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            {priorities.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No priorities available. Compute a fresh BHI snapshot from{" "}
                <Link to="/admin/business-health" className="underline">Business Health</Link>.
              </div>
            ) : (
              <div className="divide-y">
                {priorities.slice(0, 10).map((p: any, i: number) => (
                  <div key={p.key ?? i} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.label ?? p.key}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.note ?? p.category}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      <div className={`font-medium ${scoreColor(Number(p.score) || 0)}`}>Score {Number(p.score || 0).toFixed(0)}</div>
                      <div className="text-muted-foreground">Gap {Number(p.gap_points || 0).toFixed(0)}</div>
                      <div className="text-emerald-600 font-medium">{fmtCurrency(Number(p.revenue_impact_est || 0))}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* SUBSCORE BREAKDOWN */}
      <section>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sub-indices by category</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {subsByCategory.map(({ category, avg, list }) => (
              <div key={category} className="border rounded-md p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium capitalize">{category}</div>
                  <div className={`text-sm ${scoreColor(avg)}`}>{avg.toFixed(0)}</div>
                </div>
                <div className="text-xs text-muted-foreground">{list.length} sub-indices</div>
              </div>
            ))}
            {subsByCategory.length === 0 ? (
              <div className="text-sm text-muted-foreground">No sub-index evidence yet.</div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/* SECTION 12 — REPORT CENTER + SECTION 15 — SEARCH */}
      <section>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" /> Report Center
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search dashboards & reports…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-md"
            />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {filteredReports.map(({ title, to, icon: Icon }) => (
                <Link key={to} to={to} className="border rounded-md p-3 hover:bg-muted/40 flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{title}</span>
                </Link>
              ))}
              {filteredReports.length === 0 ? (
                <div className="text-sm text-muted-foreground">No matching reports.</div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SECTION — DATA INTEGRITY */}
      <section>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck2 className="h-4 w-4" /> Data Integrity · Certification Fingerprint
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <p className="text-muted-foreground">
                The SHA-256 below is a cryptographic fingerprint of the exact BHI certification
                payload written to <code className="font-mono">bhi_snapshots</code> at capture time.
                Any change to the payload — even a single digit — produces a completely different hash,
                so this value proves the record has not been altered since it was minted.
              </p>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Hash covers</div>
                <ul className="list-disc pl-5 space-y-0.5 text-xs">
                  <li><b>Headline scores</b>: overall, confidence, status, trend, yesterday_score</li>
                  <li><b>All 40+ subscores</b>: key, category, label, weight, score, confidence, evidence, note</li>
                  <li><b>Priorities</b> (ranked mission board) and <b>simulation</b> (revenue projections)</li>
                  <li><b>Executive summary</b>: top opportunity / threat / leak, expected revenue &amp; profit today</li>
                  <li><b>Meta</b>: window_days, orders_window_days, contributing/total subs, generated_at</li>
                </ul>
                <div className="text-[11px] text-muted-foreground mt-2">
                  Algorithm: SHA-256 over <code className="font-mono">JSON.stringify(payload)</code> in canonical field order.
                  Because <code className="font-mono">meta.generated_at</code> is included, a fresh recompute
                  will always produce a new hash — that is expected and proves the pipeline is live.
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground mb-1">Current certification</div>
                <div className="text-[11px] mb-1">
                  Captured {snap?.captured_at ? new Date(snap.captured_at).toLocaleString() : "—"} ·
                  Overall <b>{snap?.overall_score?.toFixed?.(1) ?? "—"}</b> ·
                  Confidence <b>{snap?.confidence?.toFixed?.(0) ?? "—"}%</b>
                </div>
                <code className="font-mono text-xs break-all block">{snap?.sha256 ?? "—"}</code>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-muted-foreground">Recomputed now</div>
                  {verify.matches === true ? (
                    <Badge className="bg-emerald-600 text-white">HASH MATCH</Badge>
                  ) : verify.matches === false ? (
                    <Badge className="bg-amber-500 text-white">CHANGED — new snapshot</Badge>
                  ) : null}
                </div>
                {verify.error ? (
                  <div className="text-xs text-red-600">{verify.error}</div>
                ) : verify.newSha ? (
                  <>
                    <div className="text-[11px] mb-1">
                      Ran {verify.ranAt ? new Date(verify.ranAt).toLocaleString() : "—"} ·
                      Overall <b>{verify.newOverall?.toFixed?.(1) ?? "—"}</b> ·
                      Confidence <b>{verify.newConfidence?.toFixed?.(0) ?? "—"}%</b>
                    </div>
                    <code className="font-mono text-xs break-all block">{verify.newSha}</code>
                  </>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Click <b>Recompute &amp; compare</b> to mint a fresh certification and diff its
                    fingerprint against the current record.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={recomputeAndCompare} disabled={verify.running}>
                <RefreshCw className={`h-4 w-4 mr-2 ${verify.running ? "animate-spin" : ""}`} />
                {verify.running ? "Recomputing…" : "Recompute & compare"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Invokes <code className="font-mono">bhi-compute</code>, persists a new snapshot, and compares SHA-256.
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SECTION — COMPONENT CERTIFICATION DRILL-DOWN */}
      <section>
        <MissionControlCertification ctx={drillCtx} />
      </section>
    </div>
  );
}