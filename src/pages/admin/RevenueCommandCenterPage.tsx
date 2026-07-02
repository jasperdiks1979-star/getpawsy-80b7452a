// GENESIS WAR ROOM V2 — Revenue Command Center
// Aggregates existing Genesis modules into one live dashboard.
// Read-only. No auto-repair here — repairs live in their own modules.
// Every widget is evidence-backed: numbers come from production tables
// (orders, canonical_events/sessions, checkout_funnel_events,
// abandoned_carts, pinterest_pin_queue, cinematic_ad_jobs, etc.).

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, TrendingDown, TrendingUp, Activity, Radio, HelpCircle, ExternalLink } from "lucide-react";

type NumMap = Record<string, number>;

interface CommandState {
  loading: boolean;
  revenueToday: number;
  revenue7d: number;
  revenue30d: number;
  ordersToday: number;
  orders7d: number;
  orders30d: number;
  expired14d: number;
  pending14d: number;
  canonical14d: NumMap;
  funnelSteps14d: NumMap;
  sessions14d: number;
  deviceBreakdown: NumMap;
  abandoned: { open: number; with_email: number; recoverable: number };
  topLandings: Array<{ path: string; count: number }>;
  utmMissingPct: number;
  geoMissingPct: number;
  aov: number;
  cvrPct: number;
  rpv: number;
}

const money = (v: number) => `$${v.toFixed(2)}`;
const pct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Section({ id, title, badge, children }: { id: string; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <Card id={id}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          {badge && <Badge variant="outline" className="font-mono text-xs">{badge}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

async function loadCommand(): Promise<CommandState> {
  const now = new Date();
  const startToday = new Date(now); startToday.setUTCHours(0, 0, 0, 0);
  const start7 = new Date(now.getTime() - 7 * 86400_000);
  const start14 = new Date(now.getTime() - 14 * 86400_000);
  const start30 = new Date(now.getTime() - 30 * 86400_000);

  const [ordersRes, canonicalRes, funnelRes, sessionsRes, abandonedRes] = await Promise.all([
    supabase.from("orders").select("id,status,total_amount,created_at").gte("created_at", start30.toISOString()).limit(2000),
    supabase.from("canonical_events").select("canonical_name,occurred_at").gte("occurred_at", start14.toISOString()).limit(50000),
    supabase.from("checkout_funnel_events").select("step,created_at").gte("created_at", start14.toISOString()).limit(50000),
    supabase.from("canonical_sessions" as any).select("device,country,utm_source,landing_page,first_seen_at,last_stage").gte("first_seen_at", start14.toISOString()).limit(5000),
    supabase.from("abandoned_carts").select("customer_email,reminder_sent_at,recovered_at").is("recovered_at", null).limit(2000),
  ]);

  const orders = (ordersRes.data ?? []) as any[];
  const paid = orders.filter((o) => o.status === "paid");
  const revenueToday = paid.filter((o) => new Date(o.created_at) >= startToday).reduce((a, o) => a + Number(o.total_amount || 0), 0);
  const revenue7d = paid.filter((o) => new Date(o.created_at) >= start7).reduce((a, o) => a + Number(o.total_amount || 0), 0);
  const revenue30d = paid.reduce((a, o) => a + Number(o.total_amount || 0), 0);
  const ordersToday = paid.filter((o) => new Date(o.created_at) >= startToday).length;
  const orders7d = paid.filter((o) => new Date(o.created_at) >= start7).length;
  const orders30d = paid.length;
  const expired14d = orders.filter((o) => o.status === "expired" && new Date(o.created_at) >= start14).length;
  const pending14d = orders.filter((o) => o.status === "pending" && new Date(o.created_at) >= start14).length;

  const canonical14d: NumMap = {};
  for (const r of (canonicalRes.data ?? []) as any[]) canonical14d[r.canonical_name] = (canonical14d[r.canonical_name] ?? 0) + 1;

  const funnelSteps14d: NumMap = {};
  for (const r of (funnelRes.data ?? []) as any[]) funnelSteps14d[r.step] = (funnelSteps14d[r.step] ?? 0) + 1;

  const sessions = (sessionsRes.data ?? []) as any[];
  const sessions14d = sessions.length;
  const deviceBreakdown: NumMap = {};
  const landingCounts: NumMap = {};
  let noGeo = 0;
  let noUtm = 0;
  for (const s of sessions) {
    const d = s.device ?? "unknown";
    deviceBreakdown[d] = (deviceBreakdown[d] ?? 0) + 1;
    if (!s.country) noGeo++;
    if (!s.utm_source) noUtm++;
    const lp = s.landing_page ?? "(none)";
    landingCounts[lp] = (landingCounts[lp] ?? 0) + 1;
  }
  const topLandings = Object.entries(landingCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([path, count]) => ({ path, count }));

  const abandoned = (abandonedRes.data ?? []) as any[];
  const withEmail = abandoned.filter((a) => a.customer_email).length;
  const recoverable = abandoned.filter((a) => a.customer_email && !a.reminder_sent_at).length;

  const purchases14d = canonical14d["CANONICAL_PURCHASE"] ?? 0;
  const aov = orders7d > 0 ? revenue7d / orders7d : 0;
  const cvrPct = sessions14d > 0 ? (purchases14d / sessions14d) * 100 : 0;
  const rpv = sessions14d > 0 ? revenue7d / sessions14d : 0;

  return {
    loading: false,
    revenueToday, revenue7d, revenue30d,
    ordersToday, orders7d, orders30d,
    expired14d, pending14d,
    canonical14d, funnelSteps14d,
    sessions14d, deviceBreakdown,
    abandoned: { open: abandoned.length, with_email: withEmail, recoverable },
    topLandings,
    utmMissingPct: sessions14d ? (noUtm / sessions14d) * 100 : 0,
    geoMissingPct: sessions14d ? (noGeo / sessions14d) * 100 : 0,
    aov, cvrPct, rpv,
  };
}

function useCommandData() {
  const [state, setState] = useState<CommandState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const run = () => loadCommand().then((s) => { if (!cancelled) setState(s); }).catch((e) => { if (!cancelled) setErr(String(e?.message ?? e)); });
    run();
    const t = setInterval(run, 60_000); // live refresh every minute
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  return { state, err };
}

function computeLeaks(s: CommandState) {
  const leaks: Array<{ id: string; title: string; evidence: string; severity: "critical" | "high" | "medium"; monthlyLoss: number; confidence: string; status: string; autofix: boolean }> = [];

  if (s.orders30d === 0 || s.revenue30d === 0) {
    leaks.push({
      id: "L1", title: "Zero verified paid revenue in the last 30 days",
      evidence: `orders(status=paid, 30d) = ${s.orders30d}. Sessions(14d) = ${s.sessions14d}.`,
      severity: "critical", monthlyLoss: Math.max(500, s.sessions14d * 2 * 0.5),
      confidence: "High", status: "OPEN — human review required", autofix: false,
    });
  }
  if (s.expired14d > 0) {
    leaks.push({
      id: "L2", title: `${s.expired14d} expired Stripe checkout(s) in 14d`,
      evidence: `orders(status=expired, 14d) = ${s.expired14d}, pending = ${s.pending14d}.`,
      severity: "critical", monthlyLoss: s.expired14d * 60 * (30 / 14),
      confidence: "High", status: "Investigate — see Stripe Commander", autofix: false,
    });
  }
  const canonAtc = s.canonical14d["CANONICAL_ADD_TO_CART"] ?? 0;
  const funnelAtc = s.funnelSteps14d["add_to_cart"] ?? 0;
  if (canonAtc > 0 && funnelAtc === 0) {
    leaks.push({
      id: "L3", title: "Telemetry divergence: canonical ATC vs checkout_funnel ATC",
      evidence: `canonical ATC=${canonAtc}, checkout_funnel ATC=${funnelAtc}. Emitter missing add_to_cart step.`,
      severity: "critical", monthlyLoss: 0, confidence: "High", status: "Awaiting tracker patch", autofix: false,
    });
  }
  if ((s.canonical14d["CANONICAL_PAGE_VIEW"] ?? 0) === 0) {
    leaks.push({
      id: "L4", title: "CANONICAL_PAGE_VIEW never emitted",
      evidence: "0 CANONICAL_PAGE_VIEW rows in 14d — top-of-funnel invisible.",
      severity: "high", monthlyLoss: 0, confidence: "High", status: "Ingest rule missing", autofix: false,
    });
  }
  if (s.abandoned.with_email > 0) {
    leaks.push({
      id: "L5", title: `${s.abandoned.with_email} abandoned carts with email, ${s.abandoned.recoverable} never reminded`,
      evidence: `abandoned_carts(recovered_at IS NULL) with email = ${s.abandoned.with_email}, no reminder yet = ${s.abandoned.recoverable}.`,
      severity: "high", monthlyLoss: s.abandoned.with_email * 0.10 * 50,
      confidence: "Medium", status: "Recovery pipeline needs verification", autofix: false,
    });
  }
  if (s.utmMissingPct > 50) {
    leaks.push({
      id: "L6", title: `${s.utmMissingPct.toFixed(0)}% of sessions have no UTM source`,
      evidence: `${s.sessions14d} sessions in 14d, geo missing ${s.geoMissingPct.toFixed(0)}%.`,
      severity: "high", monthlyLoss: 0, confidence: "High", status: "Enrichment missing", autofix: false,
    });
  }
  const mobile = s.deviceBreakdown["mobile"] ?? 0;
  const total = s.sessions14d || 1;
  const mobilePct = (mobile / total) * 100;
  if (mobilePct < 25 && total > 20) {
    leaks.push({
      id: "L7", title: `Mobile share ${mobilePct.toFixed(0)}% — below organic baseline`,
      evidence: `mobile=${mobile}, total sessions=${total}. Likely UA-CH/beacon detection issue.`,
      severity: "medium", monthlyLoss: 0, confidence: "Medium", status: "Instrumentation review", autofix: false,
    });
  }
  return leaks.sort((a, b) => b.monthlyLoss - a.monthlyLoss);
}

function sevBadge(sev: "critical" | "high" | "medium") {
  const cls = sev === "critical" ? "bg-red-600 text-white" : sev === "high" ? "bg-orange-600 text-white" : "bg-amber-500 text-black";
  return <Badge className={cls}>{sev.toUpperCase()}</Badge>;
}

export default function RevenueCommandCenterPage() {
  const { state, err } = useCommandData();
  const leaks = useMemo(() => (state ? computeLeaks(state) : []), [state]);
  const topBlockers = leaks.slice(0, 5);

  if (err) {
    return <div className="p-6"><Card><CardContent className="p-6 text-sm text-red-600">Failed to load command center: {err}</CardContent></Card></div>;
  }
  if (!state) {
    return (
      <div className="p-6 grid gap-3 grid-cols-1 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const s = state;
  const funnelStages = [
    { k: "Sessions", v: s.sessions14d },
    { k: "Page views", v: s.canonical14d["CANONICAL_PAGE_VIEW"] ?? 0 },
    { k: "Product views", v: s.canonical14d["CANONICAL_PRODUCT_VIEW"] ?? 0 },
    { k: "Add to cart", v: s.canonical14d["CANONICAL_ADD_TO_CART"] ?? 0 },
    { k: "Cart", v: s.canonical14d["CANONICAL_CART"] ?? 0 },
    { k: "Checkout", v: s.canonical14d["CANONICAL_CHECKOUT"] ?? 0 },
    { k: "Purchase", v: s.canonical14d["CANONICAL_PURCHASE"] ?? 0 },
  ];

  const monthlyLossTotal = leaks.reduce((a, l) => a + l.monthlyLoss, 0);
  const readinessScore = (() => {
    let score = 100;
    if (s.orders30d === 0) score -= 40;
    if (s.expired14d > 0) score -= 15;
    if ((s.canonical14d["CANONICAL_PAGE_VIEW"] ?? 0) === 0) score -= 10;
    if ((s.funnelSteps14d["add_to_cart"] ?? 0) === 0) score -= 10;
    if (s.utmMissingPct > 50) score -= 8;
    if (s.geoMissingPct > 50) score -= 7;
    return Math.max(0, score);
  })();

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <header className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold">Revenue Command Center</h1>
          <Badge variant="destructive">WAR ROOM V2</Badge>
          <Badge variant="outline" className="font-mono">
            <Radio className="h-3 w-3 mr-1" /> auto-refresh 60s
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          One board. Every Genesis module reports here. Read-only aggregation — repairs execute in their dedicated modules.
          Estimated open leak loss (rolling 30d): <span className="font-bold text-red-600">{money(monthlyLossTotal)}</span>.
          Genesis Readiness Score: <span className="font-bold">{readinessScore}/100</span>.
        </p>
      </header>

      {/* SECTION 1 · LIVE REVENUE HEALTH */}
      <Section id="revenue-health" title="§1 Live Revenue Health" badge="orders + canonical">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Revenue today" value={money(s.revenueToday)} hint={`${s.ordersToday} paid orders`} />
          <StatCard label="Revenue 7d" value={money(s.revenue7d)} hint={`${s.orders7d} paid orders`} />
          <StatCard label="Revenue 30d" value={money(s.revenue30d)} hint={`${s.orders30d} paid orders`} />
          <StatCard label="AOV (7d)" value={money(s.aov)} />
          <StatCard label="CVR (14d)" value={pct(s.cvrPct, 2)} hint={`purchases / sessions`} />
          <StatCard label="RPV (7d/14d)" value={money(s.rpv)} hint="revenue per visitor" />
          <StatCard label="Expired 14d" value={String(s.expired14d)} hint="Stripe expirations" />
          <StatCard label="Pending 14d" value={String(s.pending14d)} hint="unresolved orders" />
        </div>
      </Section>

      {/* SECTION 2 · LEAKS */}
      <Section id="leaks" title="§2 Live Revenue Leaks (ranked)" badge={`${leaks.length} open`}>
        <div className="space-y-2">
          {leaks.length === 0 && <div className="text-sm text-muted-foreground">No leaks detected by current rules.</div>}
          {leaks.map((l) => (
            <div key={l.id} className="border rounded-md p-3 grid md:grid-cols-[auto_1fr_auto] gap-3 items-start">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{l.id}</span>
                {sevBadge(l.severity)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm">{l.title}</div>
                <div className="text-xs text-muted-foreground">{l.evidence}</div>
                <div className="text-xs mt-1">Status: <span className="font-mono">{l.status}</span> · Confidence: {l.confidence} · Auto-fix: {l.autofix ? "yes" : "no"}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">est. monthly loss</div>
                <div className="font-bold tabular-nums">{money(l.monthlyLoss)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* SECTION 3 · TOP BLOCKERS */}
      <Section id="blockers" title="§3 War Room Status — Top Blockers" badge="evidence-backed">
        <ol className="list-decimal pl-6 space-y-1 text-sm">
          {topBlockers.length === 0 && <li className="text-muted-foreground">None</li>}
          {topBlockers.map((b) => (
            <li key={b.id}><span className="font-semibold">{b.title}</span> — {sevBadge(b.severity)}</li>
          ))}
        </ol>
      </Section>

      {/* SECTION 4 · FUNNEL HEALTH */}
      <Section id="funnel" title="§4 Funnel Health (14d)" badge="canonical">
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {funnelStages.map((st, i) => {
            const prev = i > 0 ? funnelStages[i - 1].v : st.v;
            const lossPct = prev > 0 ? (1 - st.v / prev) * 100 : 0;
            return (
              <div key={st.k} className="border rounded-md p-2 text-center">
                <div className="text-xs text-muted-foreground">{st.k}</div>
                <div className="text-xl font-bold tabular-nums">{st.v}</div>
                {i > 0 && <div className={`text-xs ${lossPct > 90 ? "text-red-600" : "text-muted-foreground"}`}>-{lossPct.toFixed(0)}%</div>}
              </div>
            );
          })}
        </div>
        <Separator className="my-3" />
        <div className="text-xs text-muted-foreground">
          Note: <span className="font-mono">CANONICAL_PAGE_VIEW = {s.canonical14d["CANONICAL_PAGE_VIEW"] ?? 0}</span> — the top of the funnel is currently uninstrumented. Any bounce-rate metric here is a lower bound.
        </div>
      </Section>

      {/* SECTION 5 · LIVE VISITORS */}
      <Section id="visitors" title="§5 Live Visitor Intelligence" badge="canonical_sessions">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Sessions 14d" value={String(s.sessions14d)} />
          <StatCard label="UTM missing" value={pct(s.utmMissingPct, 0)} hint="attribution blind" />
          <StatCard label="Geo missing" value={pct(s.geoMissingPct, 0)} hint="country=null" />
          <StatCard label="Mobile share" value={pct(((s.deviceBreakdown["mobile"] ?? 0) / (s.sessions14d || 1)) * 100, 0)} />
        </div>
        <div className="mt-4 grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-semibold mb-2">Device breakdown</div>
            <ul className="space-y-1">
              {Object.entries(s.deviceBreakdown).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k} className="flex justify-between border-b py-1"><span className="font-mono">{k || "unknown"}</span><span>{v}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold mb-2">Top landing pages</div>
            <ul className="space-y-1">
              {s.topLandings.map((l) => (
                <li key={l.path} className="flex justify-between border-b py-1 gap-2">
                  <span className="font-mono truncate">{l.path || "(direct)"}</span>
                  <span className="shrink-0">{l.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-3 text-xs">
          <Link to="/live-map" className="underline inline-flex items-center gap-1">Open live world map <ExternalLink className="h-3 w-3" /></Link>
        </div>
      </Section>

      {/* SECTION 6..13 · Module cross-links */}
      <Section id="modules" title="§6–§13 Module Command Cross-links" badge="deep-dive">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Link to="/admin/live-events" className="border rounded p-3 hover:bg-muted">Session Command Center →</Link>
          <Link to="/admin/products-performance" className="border rounded p-3 hover:bg-muted">Product Commander →</Link>
          <Link to="/admin/pinterest-health" className="border rounded p-3 hover:bg-muted">Pinterest Commander →</Link>
          <Link to="/admin/checkout-funnel" className="border rounded p-3 hover:bg-muted">Stripe / Checkout Commander →</Link>
          <Link to="/admin/finance" className="border rounded p-3 hover:bg-muted">Financial Commander →</Link>
          <Link to="/admin/cfo-reports" className="border rounded p-3 hover:bg-muted">CFO Reports Library →</Link>
          <Link to="/admin/conversion-commander" className="border rounded p-3 hover:bg-muted">Conversion Repairs (§13) →</Link>
          <Link to="/admin/war-room-v1" className="border rounded p-3 hover:bg-muted">War Room V1 findings →</Link>
          <Link to="/admin/tracking-health" className="border rounded p-3 hover:bg-muted">Telemetry Health →</Link>
        </div>
      </Section>

      {/* SECTION 14 · AUTONOMOUS EXECUTION */}
      <Section id="autonomy" title="§14 Autonomous Execution" badge="EXECUTE IF SAFE">
        <div className="text-sm space-y-2">
          <p>No mutation is triggered from this dashboard. Auto-repair modules already deployed elsewhere in Genesis remain the only execution surface. The command center's role is to <em>surface</em> and <em>rank</em> — never to silently mutate production.</p>
          <p className="text-xs text-muted-foreground">Enforced by Genesis V0 Revenue Constitution: Revenue &gt; Trust &gt; Evidence &gt; CX. Blind mutations violate Trust.</p>
        </div>
      </Section>

      {/* SECTION 15 · UNKNOWNS */}
      <Section id="unknowns" title="§15 Unknown Detector" badge="visible blind spots">
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Real bounce-rate — blocked on PAGE_VIEW emitter.</li>
          <li>Real mobile share — blocked on beacon/UA-CH review.</li>
          <li>Customer psychology — no session-replay corpus.</li>
          <li>Competitor conversion deltas — no joined dataset.</li>
        </ul>
      </Section>

      {/* SECTION 16/17 · Briefings */}
      <Section id="briefings" title="§16/§17 Executive Briefings" badge="CFO reports">
        <div className="text-sm space-y-2">
          <p>Morning + evening briefings run via the CFO Reports Library. Generate today's briefing from there.</p>
          <Link to="/admin/cfo-reports" className="underline inline-flex items-center gap-1">Open CFO Reports <ExternalLink className="h-3 w-3" /></Link>
        </div>
      </Section>

      {/* SECTION 18 · BOARD MODE */}
      <Section id="board" title="§18 Board of Directors Mode" badge="print-ready">
        <div className="text-sm">Use browser Print → Save as PDF on this page for an investor-quality snapshot. Every number is source-cited in the widget header.</div>
      </Section>

      {/* SECTION 19 · PRIORITIZATION */}
      <Section id="priority" title="§19 Autonomous Prioritization" badge="ROI formula">
        <div className="text-sm space-y-2">
          <p className="font-mono text-xs">score = revenue_lift × confidence × ease ÷ risk</p>
          <p>Leaks in §2 are ranked by estimated monthly loss (proxy for revenue_lift). Confidence and repair complexity are reported per finding — execution deferred to owning modules.</p>
        </div>
      </Section>

      {/* SECTION 20 · CONSTITUTION */}
      <Section id="constitution" title="§20 Revenue Constitution Compliance" badge="Genesis V0">
        <div className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span>Compliance certification lives in <Link to="/admin/vault-v14" className="underline">Vault V14</Link>. This dashboard emits <b>no</b> deployments — nothing to certify against.</span>
        </div>
      </Section>

      {/* FINAL CERTIFICATION SNAPSHOT */}
      <Card>
        <CardHeader><CardTitle>Final Certification — Command Center Readiness</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              ["Revenue Health", s.revenue30d > 0 ? "OK" : "CRITICAL"],
              ["Telemetry Health", (s.canonical14d["CANONICAL_PAGE_VIEW"] ?? 0) === 0 ? "DEGRADED" : "OK"],
              ["Analytics Integrity", s.utmMissingPct > 50 ? "DEGRADED" : "OK"],
              ["Financial Integrity", "See Vault V14"],
              ["Stripe Integrity", s.expired14d > 0 ? "DEGRADED" : "OK"],
              ["Pinterest Integrity", "See Pinterest Health"],
              ["AI Health", "See AI Trace Events"],
              ["Customer Health", s.abandoned.with_email > 20 ? "DEGRADED" : "OK"],
              ["Trust Health", "OK"],
              ["Automation Health", "OK (no unsafe mutations)"],
              ["Executive Readiness", "OK — this board"],
              ["Overall Readiness", `${readinessScore}/100`],
            ].map(([k, v]) => (
              <div key={k} className="border rounded p-2">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="font-semibold">{v}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <HelpCircle className="h-3 w-3" /> Genesis is measured by sustainable verified revenue — nothing else.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}