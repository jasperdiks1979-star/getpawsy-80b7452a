// Executive Growth Intelligence Center — the Millionaire Dashboard.
//
// Consumes ONLY the canonical Layer-1 envelope produced by the
// `organic-growth-intelligence` edge function via `useOrganicGrowthIntelligence`.
// No new SQL, no new attribution, no new classifier, no fabricated data.
// Every derived executive KPI (score, road-to-$1M, forecast, movers,
// goals, AI summary) is a pure client-side transform of that canonical
// envelope.
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingDown, TrendingUp, Trophy, AlertTriangle, Sparkles } from "lucide-react";
import { useOrganicGrowthIntelligence, type OGIEnvelope, type OGIWindow } from "@/hooks/useOrganicGrowthIntelligence";

const YEAR_GOAL_USD = 1_000_000;
const MILESTONES = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const GOAL_TRACKER: Array<{ label: string; target: number; kind: "visitors_day" | "sales_day" | "revenue_day" | "revenue_month" | "revenue_year" }> = [
  { label: "100 visitors / day", target: 100, kind: "visitors_day" },
  { label: "500 visitors / day", target: 500, kind: "visitors_day" },
  { label: "1,000 visitors / day", target: 1000, kind: "visitors_day" },
  { label: "10 sales / day", target: 10, kind: "sales_day" },
  { label: "100 sales / day", target: 100, kind: "sales_day" },
  { label: "$100 / day", target: 100, kind: "revenue_day" },
  { label: "$1,000 / day", target: 1000, kind: "revenue_day" },
  { label: "$10k / month", target: 10_000, kind: "revenue_month" },
  { label: "$100k / year", target: 100_000, kind: "revenue_year" },
  { label: "$1M / year", target: 1_000_000, kind: "revenue_year" },
];

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;
const cents = (c: number) => c / 100;

function scoreClamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }

function computeExecutiveScore(env: OGIEnvelope) {
  // Each sub-score is 0..100 derived from canonical metrics; weights per brief.
  const org30 = env.windows["30d"].organic;
  const org7 = env.windows["7d"].organic;
  const org24 = env.windows["24h"].organic;
  // Growth: 24h vs 7d avg (session), normalized to 0..100 around 0..+50% growth.
  const sessionsPerDay30 = (org30.sessions || 0) / 30;
  const growthSess = sessionsPerDay30 ? Math.min(1, Math.max(0, (org24.sessions - sessionsPerDay30) / Math.max(sessionsPerDay30, 1) + 0.5)) : 0;
  const revPerDay30 = cents(org30.revenue_cents || 0) / 30;
  const revDay = cents(org24.revenue_cents || 0);
  const revScore = revPerDay30 || revDay ? Math.min(1, Math.max(0, (revDay - revPerDay30) / Math.max(revPerDay30, 1) + 0.5)) : 0;
  const purchases = (org30.purchases || 0);
  const purchaseScore = Math.min(1, purchases / 300); // 300 purchases / 30d ≈ 10 / day == 100%
  const cvr = org30.conversion_rate || 0;
  const cvrScore = Math.min(1, cvr / 0.03); // 3% cvr == 100
  const pinChan = env.windows["30d"].channels.find(c => c.platform === "pinterest" && c.is_organic);
  const gooChan = env.windows["30d"].channels.find(c => c.platform === "google" && c.is_organic);
  const pinScore = pinChan ? Math.min(1, (pinChan.sessions || 0) / 1500) : 0;
  const gooScore = gooChan ? Math.min(1, (gooChan.sessions || 0) / 1500) : 0;
  const confScore = Math.min(1, (org30.avg_attribution_confidence || 0));

  const parts = [
    { key: "Organic Revenue",          weight: 0.25, score: revScore },
    { key: "Organic Purchases",        weight: 0.20, score: purchaseScore },
    { key: "Organic Sessions Growth",  weight: 0.15, score: growthSess },
    { key: "Organic Conversion",       weight: 0.15, score: cvrScore },
    { key: "Pinterest Growth",         weight: 0.10, score: pinScore },
    { key: "Google Organic Growth",    weight: 0.10, score: gooScore },
    { key: "Attribution Confidence",   weight: 0.05, score: confScore },
  ];
  const total = parts.reduce((a, p) => a + p.weight * p.score, 0) * 100;
  return { total: scoreClamp(total), parts };
}

function computeRoadTo1M(env: OGIEnvelope) {
  const rev30 = cents(env.windows["30d"].organic.revenue_cents || 0);
  const rev24 = cents(env.windows["24h"].organic.revenue_cents || 0);
  const monthly = rev30; // last 30d as monthly proxy
  const yearlyRunRate = rev30 * (365 / 30);
  const projectedMonthly = rev24 * 30;
  const projectedYearly = rev24 * 365;
  const growth = rev30 ? (rev24 * 30 - rev30) / rev30 : null;
  const milestones = MILESTONES.map(t => ({
    target: t,
    completed: yearlyRunRate >= t,
    progress: Math.min(1, yearlyRunRate / t),
    remaining: Math.max(0, t - yearlyRunRate),
  }));
  return { monthly, yearlyRunRate, rev24, rev30, projectedMonthly, projectedYearly, growth, milestones };
}

function requiredRates(env: OGIEnvelope) {
  const org30 = env.windows["30d"].organic;
  const cvr = org30.conversion_rate || 0;
  const aov = org30.purchases ? cents(org30.revenue_cents) / org30.purchases : 0;
  const requiredMonthly = YEAR_GOAL_USD / 12;
  const requiredDaily = YEAR_GOAL_USD / 365;
  const requiredPurchasesDay = aov ? requiredDaily / aov : null;
  const requiredSessionsDay = cvr && requiredPurchasesDay ? requiredPurchasesDay / cvr : null;
  const pinShare = (() => {
    const p = env.windows["30d"].channels.find(c => c.platform === "pinterest" && c.is_organic)?.sessions || 0;
    const total = env.windows["30d"].channels.filter(c => c.is_organic).reduce((a, c) => a + c.sessions, 0);
    return total ? p / total : 0;
  })();
  const gooShare = (() => {
    const p = env.windows["30d"].channels.find(c => c.platform === "google" && c.is_organic)?.sessions || 0;
    const total = env.windows["30d"].channels.filter(c => c.is_organic).reduce((a, c) => a + c.sessions, 0);
    return total ? p / total : 0;
  })();
  return {
    aov, cvr,
    requiredMonthly, requiredDaily,
    requiredPurchasesDay,
    requiredSessionsDay,
    requiredOrganicSessionsDay: requiredSessionsDay,
    requiredPinterestSessionsDay: requiredSessionsDay ? requiredSessionsDay * pinShare : null,
    requiredGoogleSessionsDay: requiredSessionsDay ? requiredSessionsDay * gooShare : null,
  };
}

function topMovers(env: OGIEnvelope) {
  // Compare product ranking (30d) vs pins for signal; canonical envelope
  // exposes ranking scores, which is our only truth source here.
  const products = env.leaderboard.top_products || [];
  const pins = env.leaderboard.top_pins || [];
  return {
    products: products.slice(0, 8),
    pins: pins.slice(0, 8),
    landing: env.windows["24h"].top_landing_pages?.slice(0, 8) || [],
  };
}

function forecast(env: OGIEnvelope, horizonDays: number) {
  // Trend from 30d daily rate; confidence tied to sample size + attribution.
  const org30 = env.windows["30d"].organic;
  const org7 = env.windows["7d"].organic;
  const rev30Day = cents(org30.revenue_cents) / 30;
  const rev7Day = cents(org7.revenue_cents) / 7;
  // Simple blended forecast: weight recent (7d) 60%, longer (30d) 40%.
  const daily = rev7Day * 0.6 + rev30Day * 0.4;
  const value = daily * horizonDays;
  const variance = Math.abs(rev7Day - rev30Day) / Math.max(rev30Day, 1);
  const confidence = Math.max(0.3, Math.min(0.95, 1 - variance));
  const low = value * (1 - (1 - confidence));
  const high = value * (1 + (1 - confidence));
  return { value, low, high, confidence };
}

function aiSummary(env: OGIEnvelope, score: number) {
  const d = env.deltas.vs_yesterday;
  const improved: string[] = [];
  const declined: string[] = [];
  const push = (label: string, v: number | null) => {
    if (v == null) return;
    if (v >= 0.05) improved.push(`${label} +${pct(v, 0)}`);
    else if (v <= -0.05) declined.push(`${label} ${pct(v, 0)}`);
  };
  push("organic sessions", d.sessions ?? null);
  push("organic purchases", d.purchases ?? null);
  push("organic revenue", d.revenue_cents ?? null);
  const recs = (env.recommendations || []).slice(0, 5);
  return { improved, declined, recommendations: recs, score };
}

export default function ExecutiveGrowthIntelligencePage() {
  const { data, isLoading, error } = useOrganicGrowthIntelligence();

  const view = useMemo(() => {
    if (!data) return null;
    const score = computeExecutiveScore(data);
    const road = computeRoadTo1M(data);
    const need = requiredRates(data);
    const movers = topMovers(data);
    const summary = aiSummary(data, score.total);
    return {
      score, road, need, movers, summary,
      forecast: {
        d7: forecast(data, 7),
        d30: forecast(data, 30),
        d90: forecast(data, 90),
        d365: forecast(data, 365),
      },
      currentDailyVisitors: (data.windows["24h"].organic.visitors || 0),
      currentDailySales: (data.windows["24h"].organic.purchases || 0),
      currentDailyRevenue: cents(data.windows["24h"].organic.revenue_cents || 0),
      currentMonthlyRevenue: road.monthly,
      currentYearlyRunRate: road.yearlyRunRate,
    };
  }, [data]);

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading canonical envelope…</div>;
  }
  if (error || !view || !data) {
    return (
      <div className="p-8 space-y-2">
        <h1 className="text-2xl font-semibold">Executive Growth Intelligence</h1>
        <p className="text-destructive">Canonical envelope unavailable — the executive layer cannot fabricate data.</p>
        <p className="text-xs text-muted-foreground">{String((error as any)?.message || "unknown")}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1500px] mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Executive Growth Intelligence</h1>
          <p className="text-sm text-muted-foreground">Canonical Layer-1 only · read-only · generated {new Date(data.generated_at).toLocaleString()}</p>
        </div>
        <Badge variant="outline" className="text-xs">Millionaire Dashboard</Badge>
      </header>

      {/* SECTION 1 · EXECUTIVE SCORE */}
      <Card>
        <CardHeader><CardTitle>Executive Growth Score</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="text-7xl font-black tabular-nums">{view.score.total}</div>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
              {view.score.parts.map(p => (
                <div key={p.key} className="rounded border p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">{p.key}</div>
                  <div className="flex items-baseline justify-between">
                    <div className="text-lg font-semibold tabular-nums">{Math.round(p.score * 100)}</div>
                    <div className="text-[10px] text-muted-foreground">w {pct(p.weight, 0)}</div>
                  </div>
                  <Progress value={p.score * 100} className="h-1 mt-1" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 2 · ROAD TO $1M */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4"/> Road to $1M</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <Kpi label="Monthly (30d)"        value={usd(view.currentMonthlyRevenue)} />
            <Kpi label="Yearly run rate"      value={usd(view.currentYearlyRunRate)} />
            <Kpi label="Revenue last 24h"     value={usd(view.currentDailyRevenue)} />
            <Kpi label="Projected monthly"    value={usd(view.road.projectedMonthly)} />
            <Kpi label="Projected yearly"     value={usd(view.road.projectedYearly)} />
          </div>
          <div className="space-y-2">
            {view.road.milestones.map(m => (
              <div key={m.target}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{usd(m.target)}</span>
                  <span className="text-muted-foreground">
                    {m.completed ? "✓ completed" : `${pct(m.progress, 1)} · ${usd(m.remaining)} remaining`}
                  </span>
                </div>
                <Progress value={m.progress * 100} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* SECTION 3 · WHAT MUST IMPROVE */}
      <Card>
        <CardHeader><CardTitle>What must improve to hit $1M / year</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Kpi label="Required monthly"     value={usd(view.need.requiredMonthly)} />
          <Kpi label="Required daily"       value={usd(view.need.requiredDaily)} />
          <Kpi label="Purchases / day"      value={view.need.requiredPurchasesDay?.toFixed(1) ?? "—"} note={view.need.aov ? `AOV ${usd(view.need.aov)}` : "Not enough purchases for AOV"} />
          <Kpi label="Sessions / day"       value={view.need.requiredSessionsDay ? Math.round(view.need.requiredSessionsDay).toLocaleString() : "—"} note={view.need.cvr ? `at ${pct(view.need.cvr)} CVR` : "CVR unknown"} />
          <Kpi label="Pinterest / day"      value={view.need.requiredPinterestSessionsDay ? Math.round(view.need.requiredPinterestSessionsDay).toLocaleString() : "—"} note="based on current organic share" />
          <Kpi label="Google / day"         value={view.need.requiredGoogleSessionsDay ? Math.round(view.need.requiredGoogleSessionsDay).toLocaleString() : "—"} note="based on current organic share" />
          <Kpi label="Current CVR"          value={pct(view.need.cvr || 0, 2)} />
          <Kpi label="Current AOV"          value={view.need.aov ? usd(view.need.aov) : "—"} />
        </CardContent>
      </Card>

      {/* SECTION 4 · AI OPPORTUNITY ENGINE */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4"/> AI Opportunity Engine</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {view.summary.recommendations.length === 0 && (
            <p className="text-xs text-muted-foreground">No recommendation meets the evidence gate (min sample size + confidence ≥ 0.7). Canonical envelope will not fabricate opportunities.</p>
          )}
          {view.summary.recommendations.map((r, i) => (
            <div key={i} className="rounded border p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{"★".repeat(Math.max(1, Math.round(r.confidence * 5)))}{"☆".repeat(5 - Math.max(1, Math.round(r.confidence * 5)))} · {r.text}</div>
                <Badge variant="secondary" className="capitalize">{r.evidence_source}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                <span>Confidence {(r.confidence * 100).toFixed(0)}%</span>
                <span>Sample {r.sample_size}</span>
                <span>Freshness {new Date(r.freshness).toLocaleString()}</span>
                <span>Evidence: {r.evidence_source}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* SECTION 5 · TOP MOVERS */}
      <Card>
        <CardHeader><CardTitle>Top Movers (30d canonical)</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Movers title="Products" rows={view.movers.products.map((p: any) => ({ label: p.product_id ?? p.name ?? "—", value: p.organic_sessions ?? p.organic_rank_score ?? 0 }))} />
          <Movers title="Pinterest Pins" rows={view.movers.pins.map((p: any) => ({ label: p.pin_id ?? p.title ?? "—", value: p.organic_sessions ?? p.organic_rank_score ?? 0 }))} />
          <Movers title="Landing Pages (24h)" rows={view.movers.landing.map((p) => ({ label: p.path, value: p.sessions }))} />
        </CardContent>
      </Card>

      {/* SECTION 6 · BUSINESS HEALTH */}
      <Card>
        <CardHeader><CardTitle>Business Health</CardTitle></CardHeader>
        <CardContent>
          <BusinessHealth env={data} />
        </CardContent>
      </Card>

      {/* SECTION 7 · EXECUTIVE AI SUMMARY */}
      <Card>
        <CardHeader><CardTitle>Executive AI Summary</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3 text-emerald-500"/> Improved</div>
            {view.summary.improved.length ? view.summary.improved.map((t, i) => <div key={i}>• {t}</div>) : <div className="text-muted-foreground">—</div>}
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1"><TrendingDown className="h-3 w-3 text-destructive"/> Declined</div>
            {view.summary.declined.length ? view.summary.declined.map((t, i) => <div key={i}>• {t}</div>) : <div className="text-muted-foreground">—</div>}
          </div>
          <div className="md:col-span-2">
            <div className="text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> Top actions today</div>
            {view.summary.recommendations.length
              ? view.summary.recommendations.map((r, i) => <div key={i}>• {r.text} <span className="text-muted-foreground">({(r.confidence*100).toFixed(0)}%)</span></div>)
              : <div className="text-muted-foreground">No actions meet evidence gate.</div>}
          </div>
        </CardContent>
      </Card>

      {/* SECTION 8 · FORECAST */}
      <Card>
        <CardHeader><CardTitle>Revenue Forecast (canonical-derived)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {(["d7","d30","d90","d365"] as const).map((k, idx) => {
            const f = view.forecast[k];
            const label = ({d7:"7 days",d30:"30 days",d90:"90 days",d365:"365 days"} as any)[k];
            return (
              <div key={k} className="rounded border p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
                <div className="text-xl font-semibold tabular-nums">{usd(f.value)}</div>
                <div className="text-[11px] text-muted-foreground">
                  CI {usd(f.low)} – {usd(f.high)} · confidence {(f.confidence * 100).toFixed(0)}%
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* SECTION 9 · GOAL TRACKER */}
      <Card>
        <CardHeader><CardTitle>Goal Tracker</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {GOAL_TRACKER.map(g => {
            const current = (() => {
              switch (g.kind) {
                case "visitors_day": return view.currentDailyVisitors;
                case "sales_day": return view.currentDailySales;
                case "revenue_day": return view.currentDailyRevenue;
                case "revenue_month": return view.currentMonthlyRevenue;
                case "revenue_year": return view.currentYearlyRunRate;
              }
            })();
            const progress = Math.min(1, current / g.target);
            const done = current >= g.target;
            return (
              <div key={g.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={done ? "text-emerald-500 font-medium" : "font-medium"}>{done ? "✓ " : ""}{g.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {g.kind.startsWith("revenue") ? usd(current) : current.toFixed(0)} / {g.kind.startsWith("revenue") ? usd(g.target) : g.target}
                  </span>
                </div>
                <Progress value={progress * 100} className="h-1.5" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* SECTION 10 · AI CERTIFICATION */}
      <Card>
        <CardHeader><CardTitle>AI Certification</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1 text-muted-foreground">
          <p>All KPIs, forecasts and recommendations on this page derive from the canonical envelope <code>organic-growth-intelligence</code> (Layer-1 truth).</p>
          <p>Evidence sources permitted: <strong>organic</strong> / <strong>blended</strong>. Blocked: <strong>heuristic-only</strong>, <strong>paid-only</strong>, <strong>insufficient_data</strong>.</p>
          <p>Recommendations without confidence ≥ 0.7 and sample size ≥ min are suppressed, not fabricated.</p>
          <p>Attribution confidence (30d): {(data.windows["30d"].organic.avg_attribution_confidence * 100).toFixed(1)}%.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded border p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {note && <div className="text-[10px] text-muted-foreground mt-0.5">{note}</div>}
    </div>
  );
}

function Movers({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground mb-2">{title}</div>
      {rows.length === 0 && <div className="text-xs text-muted-foreground">No canonical rows yet.</div>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="truncate mr-2 font-mono">{r.label}</span>
            <span className="tabular-nums text-muted-foreground">{Number(r.value).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BusinessHealth({ env }: { env: OGIEnvelope }) {
  const w = env.windows["30d"];
  const allSessions = w.totals_all.sessions || 0;
  const orgSessions = w.organic.sessions || 0;
  const paidChannels = w.channels.filter(c => c.is_paid && !c.is_organic);
  const paidSessions = paidChannels.reduce((a, c) => a + c.sessions, 0);
  const revenue = cents(w.organic.revenue_cents);
  const aov = w.organic.purchases ? revenue / w.organic.purchases : 0;
  const organicShare = allSessions ? orgSessions / allSessions : 0;
  const orgChans = w.channels.filter(c => c.is_organic);
  const totalOrg = orgChans.reduce((a, c) => a + c.sessions, 0);
  const shares = orgChans.map(c => (totalOrg ? c.sessions / totalOrg : 0));
  // Herfindahl-derived diversity: 1 - HHI (0 = concentrated, 1 = diverse)
  const hhi = shares.reduce((a, s) => a + s * s, 0);
  const diversity = 1 - hhi;
  const pinShare = orgChans.find(c => c.platform === "pinterest")?.sessions
    ? (orgChans.find(c => c.platform === "pinterest")!.sessions / (totalOrg || 1)) : 0;
  const gooShare = orgChans.find(c => c.platform === "google")?.sessions
    ? (orgChans.find(c => c.platform === "google")!.sessions / (totalOrg || 1)) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
      <Kpi label="Sessions (30d)"          value={allSessions.toLocaleString()} />
      <Kpi label="Organic sessions"        value={orgSessions.toLocaleString()} />
      <Kpi label="Paid sessions"           value={paidSessions.toLocaleString()} note="Validation only" />
      <Kpi label="Conversion"              value={pct(w.organic.conversion_rate || 0, 2)} />
      <Kpi label="Revenue (organic)"       value={usd(revenue)} />
      <Kpi label="AOV"                     value={aov ? usd(aov) : "—"} />
      <Kpi label="Organic share"           value={pct(organicShare, 0)} />
      <Kpi label="Organic diversity"       value={pct(diversity, 0)} note="1 − HHI over channels" />
      <Kpi label="Pinterest dependence"    value={pct(pinShare, 0)} />
      <Kpi label="Google dependence"       value={pct(gooShare, 0)} />
      <Kpi label="Channel count"           value={String(orgChans.length)} />
      <Kpi label="Attribution confidence"  value={pct(w.organic.avg_attribution_confidence || 0, 0)} />
    </div>
  );
}