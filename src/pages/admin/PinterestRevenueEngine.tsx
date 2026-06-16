import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, Pause, Rocket, PlayCircle, ShieldCheck } from "lucide-react";
import { Link2, Clock, Eye, Sparkles, CheckCircle2, XCircle } from "lucide-react";

type FunnelRow = {
  day: string;
  pin_id: string;
  product_id: string | null;
  product_slug: string | null;
  category_key: string | null;
  board_name: string | null;
  impressions: number;
  saves: number;
  outbound_clicks: number;
  product_views: number;
  add_to_carts: number;
  checkouts: number;
  purchases: number;
  revenue_cents: number;
};

type ScoreRow = FunnelRow & {
  ctr: number;
  save_rate: number;
  atc_rate: number;
  purchase_rate: number;
  pinterest_score: number;
  classification: "winner" | "average" | "loser" | "insufficient_data" | "unknown";
};

type ActionRow = {
  id: string;
  action_type: string;
  product_slug: string | null;
  reason: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

type ConnectionRow = {
  account_name: string | null;
  status: string | null;
  token_expires_at: string | null;
  last_account_status: number | null;
  last_boards_status: number | null;
  board_count: number | null;
  last_publish_at: string | null;
  last_error: string | null;
};

type CronRow = {
  id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  success: boolean | null;
  items_processed: number | null;
  items_failed: number | null;
  error_message: string | null;
};

type ReviewRow = {
  id: string;
  product_slug: string | null;
  product_name: string | null;
  pin_title: string | null;
  overlay_text: string | null;
  board_name: string | null;
  category_key: string | null;
  pin_image_url: string | null;
  destination_link: string | null;
  created_at: string;
};

type VarietySample = {
  overlay_text: string | null;
  pin_title: string | null;
  hook_group: string | null;
  board_name: string | null;
  category_key: string | null;
};

type VarietyReport = {
  ok: boolean;
  traceId: string;
  generated_at: string;
  totals: Record<string, number>;
  goal: { rule: string; violations_in_90: number; compliant: boolean };
  overused_overlays_last_90: { value: string; count: number }[];
  overused_overlays_all_time: { value: string; count: number }[];
  top_repeated: Record<string, { value: string; count: number }[]>;
  diversity_by_board: { board: string; total: number; uniques: number; diversity: number }[];
  diversity_by_category: { category: string; total: number; uniques: number; diversity: number }[];
  replacement_pools: Record<string, Record<string, string[]>>;
  replacement_pools_summary: Record<string, Record<string, number>>;
  publishing_status: string;
  message: string;
};

function fmt(n: number) {
  return n.toLocaleString("en-US");
}
function pct(n: number, digits = 2) {
  return `${(n * 100).toFixed(digits)}%`;
}
function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PinterestRevenueEngine() {
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [running, setRunning] = useState<"score" | "validate" | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [optReport, setOptReport] = useState<any>(null);
  const [connection, setConnection] = useState<ConnectionRow | null>(null);
  const [cronRuns, setCronRuns] = useState<CronRow[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewRow[]>([]);
  const [varietySamples, setVarietySamples] = useState<VarietySample[]>([]);
  const [varietyReport, setVarietyReport] = useState<VarietyReport | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [simulation, setSimulation] = useState<null | {
    summary: {
      pass: number;
      fail: number;
      replaced_from_pool: number;
      projected_global_diversity: number;
      delta_global_diversity: number;
    };
    before: { global: number };
    after: { global: number };
    input: { requested: number; considered: number };
    results: Array<{ id: string; product_slug: string | null; headline: string; cta: string; pass: boolean; reasons: string[]; replaced: Record<string, { from: string; to: string }>; category: string | null; }>;
    caps: Record<string, number | boolean>;
  }>(null);
  const [simulating, setSimulating] = useState(false);
  const [attribution, setAttribution] = useState<{
    total: number;
    sessions: number;
    views: number;
    atcs: number;
    checkouts: number;
    purchases: number;
    revenueCents: number;
    lastEventAt: string | null;
  } | null>(null);
  const [testingAttribution, setTestingAttribution] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    sessionId?: string;
    inserted?: number;
    verified?: Array<{ event_type: string; occurred_at: string; revenue_cents: number }>;
    message?: string;
  } | null>(null);
  const [recentPublished, setRecentPublished] = useState<Array<{
    id: string;
    posted_at: string | null;
    headline: string;
    cta: string;
    hook: string | null;
    category: string | null;
    board: string | null;
    pinterest_pin_id: string | null;
    external_url: string | null;
    destination_url: string | null;
    diversity_score: number | null;
    impressions: number;
    clicks: number;
    saves: number;
  }>>([]);

  async function runAttributionTest() {
    setTestingAttribution(true);
    try {
      const { data, error } = await supabase.functions.invoke("attribution-health-test", { body: { mode: "run" } });
      if (error) throw error;
      setTestResult(data as typeof testResult);
      if ((data as { ok?: boolean })?.ok) {
        toast.success("Synthetic Pinterest funnel inserted — refreshing widget");
        await load();
      } else {
        toast.error((data as { message?: string })?.message ?? "Test failed");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingAttribution(false);
    }
  }

  async function cleanupAttributionTests() {
    try {
      const { data, error } = await supabase.functions.invoke("attribution-health-test", { body: { mode: "cleanup" } });
      if (error) throw error;
      toast.success(`Removed ${(data as { deleted?: number })?.deleted ?? 0} synthetic test events`);
      setTestResult(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function runVarietyAudit() {
    setAuditing(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-creative-variety-audit", { body: {} });
      if (error) throw error;
      setVarietyReport(data as VarietyReport);
      const v = (data as VarietyReport).goal?.violations_in_90 ?? 0;
      v === 0
        ? toast.success("Variety audit clean: no headline repeats >5 in last 90 pins")
        : toast.warning(`Variety audit: ${v} overused overlay(s) in last 90 pins`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAuditing(false);
    }
  }

  async function runDiversitySimulation() {
    setSimulating(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-diversity-simulate", { body: { limit: 30 } });
      if (error) throw error;
      if (!(data as { ok?: boolean })?.ok) throw new Error((data as { message?: string })?.message ?? "simulation failed");
      setSimulation(data as never);
      const s = (data as { summary: { pass: number; fail: number } }).summary;
      toast.success(`Simulation: ${s.pass} would pass, ${s.fail} would fail`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSimulating(false);
    }
  }

  async function load() {
    setLoading(true);
    const [s, a, c, cr, rq, vs] = await Promise.all([
      supabase
        .from("pinterest_revenue_scores")
        .select("*")
        .gte("day", new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10))
        .order("day", { ascending: false })
        .limit(2000),
      supabase
        .from("pinterest_winner_actions_log")
        .select("id,action_type,product_slug,reason,details,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("pinterest_connection")
        .select("account_name,status,token_expires_at,last_account_status,last_boards_status,board_count,last_publish_at,last_error")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("cron_job_logs")
        .select("id,job_name,started_at,completed_at,success,items_processed,items_failed,error_message")
        .ilike("job_name", "%pinterest%")
        .order("started_at", { ascending: false })
        .limit(20),
      supabase
        .from("pinterest_pin_queue")
        .select("id,product_slug,product_name,pin_title,overlay_text,board_name,category_key,pin_image_url,destination_link,created_at")
        .eq("validation_status", "ready_for_review")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("pinterest_pin_queue")
        .select("overlay_text,pin_title,hook_group,board_name,category_key")
        .eq("status", "posted")
        .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString())
        .limit(2000),
    ]);
    if (s.error) toast.error(`scores: ${s.error.message}`);
    if (a.error) toast.error(`actions: ${a.error.message}`);
    if (c.error) console.warn("connection:", c.error.message);
    if (cr.error) console.warn("cron:", cr.error.message);
    if (rq.error) console.warn("review:", rq.error.message);
    if (vs.error) console.warn("variety:", vs.error.message);
    setScores((s.data as ScoreRow[]) ?? []);
    setActions((a.data as ActionRow[]) ?? []);
    setConnection((c.data as ConnectionRow) ?? null);
    setCronRuns((cr.data as CronRow[]) ?? []);
    setReviewQueue((rq.data as ReviewRow[]) ?? []);
    setVarietySamples((vs.data as VarietySample[]) ?? []);
    setLoading(false);
    // Attribution health (last 24h, pinterest only)
    const since = new Date(Date.now() - 86400_000).toISOString();
    const { data: attrRows } = await supabase
      .from("gi_attribution_events")
      .select("session_id,event_type,revenue_cents,occurred_at,meta")
      .gte("occurred_at", since)
      .contains("meta", { source: "pinterest" })
      .order("occurred_at", { ascending: false })
      .limit(5000);
    const rows = (attrRows as Array<{ session_id: string; event_type: string; revenue_cents: number | null; occurred_at: string }> | null) ?? [];
    const sessions = new Set<string>();
    let views = 0, atcs = 0, checkouts = 0, purchases = 0, revenueCents = 0;
    for (const r of rows) {
      sessions.add(r.session_id);
      if (r.event_type === "view") views++;
      else if (r.event_type === "add_to_cart") atcs++;
      else if (r.event_type === "checkout") checkouts++;
      else if (r.event_type === "purchase") { purchases++; revenueCents += r.revenue_cents ?? 0; }
    }
    setAttribution({
      total: rows.length,
      sessions: sessions.size,
      views, atcs, checkouts, purchases, revenueCents,
      lastEventAt: rows[0]?.occurred_at ?? null,
    });

    // Recent Published Pins — last 50 posted pins with diversity + perf joins
    const { data: published } = await supabase
      .from("pinterest_pin_queue")
      .select("id,posted_at,overlay_text,pin_title,hook_group,category_key,board_name,pinterest_pin_id,external_url,destination_link,meta")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(50);
    const pubRows = (published as Array<{
      id: string; posted_at: string | null; overlay_text: string | null; pin_title: string | null;
      hook_group: string | null; category_key: string | null; board_name: string | null;
      pinterest_pin_id: string | null; external_url: string | null; destination_link: string | null;
      meta: Record<string, unknown> | null;
    }> | null) ?? [];
    const externalIds = pubRows.map((r) => r.pinterest_pin_id).filter(Boolean) as string[];
    let perfMap = new Map<string, { impressions: number; clicks: number; saves: number }>();
    if (externalIds.length > 0) {
      const { data: perf } = await supabase
        .from("pinterest_pin_performance")
        .select("pin_id,impressions,clicks,saves")
        .in("pin_id", externalIds);
      for (const p of (perf as Array<{ pin_id: string; impressions: number | null; clicks: number | null; saves: number | null }> | null) ?? []) {
        perfMap.set(p.pin_id, {
          impressions: Number(p.impressions ?? 0),
          clicks: Number(p.clicks ?? 0),
          saves: Number(p.saves ?? 0),
        });
      }
    }
    const splitOv = (s: string | null): [string, string] => {
      const t = (s || "").trim();
      const sep = t.includes(" • ") ? " • " : t.includes(" | ") ? " | " : null;
      if (!sep) return [t, ""];
      const [h, c] = t.split(sep);
      return [(h || "").trim(), (c || "").trim()];
    };
    setRecentPublished(pubRows.map((r) => {
      const [headline, cta] = splitOv(r.overlay_text);
      const perf = r.pinterest_pin_id ? perfMap.get(r.pinterest_pin_id) : undefined;
      const ds = (r.meta as { diversity_score?: number } | null)?.diversity_score ?? null;
      return {
        id: r.id,
        posted_at: r.posted_at,
        headline: headline || r.pin_title || "(no overlay)",
        cta,
        hook: r.hook_group,
        category: r.category_key,
        board: r.board_name,
        pinterest_pin_id: r.pinterest_pin_id,
        external_url: r.external_url,
        destination_url: r.destination_link,
        diversity_score: ds,
        impressions: perf?.impressions ?? 0,
        clicks: perf?.clicks ?? 0,
        saves: perf?.saves ?? 0,
      };
    }));
  }

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    return scores.reduce(
      (acc, r) => {
        acc.impressions += r.impressions;
        acc.saves += r.saves;
        acc.outbound_clicks += r.outbound_clicks;
        acc.product_views += r.product_views;
        acc.add_to_carts += r.add_to_carts;
        acc.checkouts += r.checkouts;
        acc.purchases += r.purchases;
        acc.revenue_cents += r.revenue_cents;
        return acc;
      },
      { impressions: 0, saves: 0, outbound_clicks: 0, product_views: 0, add_to_carts: 0, checkouts: 0, purchases: 0, revenue_cents: 0 },
    );
  }, [scores]);

  const ctr = totals.impressions > 0 ? totals.outbound_clicks / totals.impressions : 0;
  const saveRate = totals.impressions > 0 ? totals.saves / totals.impressions : 0;
  const atcRate = totals.product_views > 0 ? totals.add_to_carts / totals.product_views : 0;
  const purchRate = totals.product_views > 0 ? totals.purchases / totals.product_views : 0;

  // Top winners & losers by product
  const byProduct = useMemo(() => {
    const m = new Map<string, ScoreRow & { count: number }>();
    for (const r of scores) {
      if (!r.product_id) continue;
      const cur = m.get(r.product_id);
      if (!cur) m.set(r.product_id, { ...r, count: 1 });
      else {
        cur.impressions += r.impressions;
        cur.outbound_clicks += r.outbound_clicks;
        cur.saves += r.saves;
        cur.add_to_carts += r.add_to_carts;
        cur.purchases += r.purchases;
        cur.revenue_cents += r.revenue_cents;
        cur.count += 1;
      }
    }
    return Array.from(m.values());
  }, [scores]);

  const winners = useMemo(
    () =>
      [...byProduct]
        .filter((p) => p.impressions >= 200)
        .sort((a, b) => b.outbound_clicks / Math.max(1, a.impressions) - a.outbound_clicks / Math.max(1, b.impressions))
        .sort((a, b) => b.purchases - a.purchases || b.outbound_clicks - a.outbound_clicks)
        .slice(0, 10),
    [byProduct],
  );
  const losers = useMemo(
    () => [...byProduct].filter((p) => p.impressions >= 400 && p.outbound_clicks <= 1).slice(0, 10),
    [byProduct],
  );

  // ---- Token health
  const tokenStatus = useMemo(() => {
    if (!connection?.token_expires_at) return { level: "unknown" as const, daysLeft: 0, label: "Unknown" };
    const days = Math.floor((new Date(connection.token_expires_at).getTime() - Date.now()) / 86400_000);
    if (days < 0) return { level: "expired" as const, daysLeft: days, label: "Expired" };
    if (days < 7) return { level: "critical" as const, daysLeft: days, label: `${days}d left` };
    if (days < 14) return { level: "warn" as const, daysLeft: days, label: `${days}d left` };
    return { level: "ok" as const, daysLeft: days, label: `${days}d left` };
  }, [connection]);

  // ---- Variety audit (top 30d posted)
  const variety = useMemo(() => {
    const total = varietySamples.length;
    const tally = (key: keyof VarietySample) => {
      const m = new Map<string, number>();
      for (const r of varietySamples) {
        const v = (r[key] as string | null)?.trim();
        if (!v) continue;
        m.set(v, (m.get(v) ?? 0) + 1);
      }
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
    };
    const overlays = tally("overlay_text");
    const titles = tally("pin_title");
    const hooks = tally("hook_group");
    const byBoard = new Map<string, Map<string, number>>();
    for (const r of varietySamples) {
      const b = r.board_name ?? "—";
      const o = r.overlay_text ?? r.pin_title ?? "—";
      if (!byBoard.has(b)) byBoard.set(b, new Map());
      const inner = byBoard.get(b)!;
      inner.set(o, (inner.get(o) ?? 0) + 1);
    }
    const boardDiversity = Array.from(byBoard.entries()).map(([board, inner]) => {
      const sum = Array.from(inner.values()).reduce((a, b) => a + b, 0);
      const unique = inner.size;
      const diversity = sum > 0 ? unique / sum : 0;
      return { board, sum, unique, diversity };
    }).sort((a, b) => a.diversity - b.diversity);
    const overlayDup = overlays.filter(([, c]) => c >= 15).length;
    return { total, overlays, titles, hooks, boardDiversity, overlayDup };
  }, [varietySamples]);

  async function runScoring() {
    setRunning("score");
    const { data, error } = await supabase.functions.invoke("pinterest-revenue-engine", { body: { days: 30 } });
    setRunning(null);
    if (error) return toast.error(error.message);
    toast.success(`Scoring: ${data?.scored ?? 0} rows, ${data?.actionsPlanned ?? 0} actions`);
    load();
  }
  async function runValidator() {
    setRunning("validate");
    const { data, error } = await supabase.functions.invoke("pinterest-draft-validator", { body: { onlyCleanup: true } });
    setRunning(null);
    if (error) return toast.error(error.message);
    toast.success(`Validated: ${data?.passed ?? 0} pass / ${data?.failed ?? 0} fail`);
    load();
  }

  async function runRevenueOptimisation() {
    setOptimizing(true);
    setOptReport(null);
    try {
      toast.info("Chaining growth orchestrator → auto-evolve → learning loop → revenue brain → optimiser. This may take 30–90s.");
      const { data, error } = await supabase.functions.invoke("pinterest-revenue-optimize", { body: { chain: true } });
      if (error) throw error;
      if (!(data as { ok?: boolean })?.ok) throw new Error((data as { message?: string })?.message ?? "optimisation failed");
      setOptReport((data as { report: unknown }).report);
      const r = (data as any).report;
      toast.success(`Optimisation done — ${r.losers_blocked} losers blocked, ${r.patterns_upserted} patterns learned, 30d forecast ${money(r.revenue_forecast.forecast_30d_cents)}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Pinterest Revenue Engine | GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pinterest Revenue Engine</h1>
          <p className="text-muted-foreground">
            Live funnel from impressions to purchases. Publishing remains paused until validation passes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runValidator} disabled={running !== null}>
            {running === "validate" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
            Validate cleanup drafts
          </Button>
          <Button onClick={runScoring} disabled={running !== null}>
            {running === "score" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            Run scoring now
          </Button>
        </div>
      </header>

      {/* Token health banner */}
      {connection && (tokenStatus.level === "critical" || tokenStatus.level === "expired" || tokenStatus.level === "warn") && (
        <Card className={
          tokenStatus.level === "expired" || tokenStatus.level === "critical"
            ? "border-rose-500/60 bg-rose-50 dark:bg-rose-950/30"
            : "border-amber-500/60 bg-amber-50 dark:bg-amber-950/30"
        }>
          <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">
                  Pinterest token {tokenStatus.level === "expired" ? "expired" : `expires in ${tokenStatus.daysLeft} day(s)`}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  Account: <span className="font-mono">{connection.account_name ?? "—"}</span>
                  {" · "}publishing will stop until reconnected.
                </div>
              </div>
            </div>
            <Button asChild size="sm" variant="default">
              <a href="/admin/pinterest-health">Reconnect</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Connection status strip */}
      <Card>
        <CardContent className="p-4 flex items-center gap-6 flex-wrap text-sm">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            <span className="font-medium">{connection?.account_name ?? "Not connected"}</span>
            <Badge variant={connection?.status === "connected" ? "default" : "destructive"}>
              {connection?.status ?? "unknown"}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Token:</span>
            <Badge variant={tokenStatus.level === "ok" ? "secondary" : tokenStatus.level === "warn" ? "outline" : "destructive"}>
              {tokenStatus.label}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Boards:</span>
            <span className="font-medium">{connection?.board_count ?? 0}</span>
            <Badge variant={connection?.last_boards_status === 200 ? "secondary" : "destructive"}>
              {connection?.last_boards_status ?? "?"}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Last publish:</span>
            <span className="font-medium">
              {connection?.last_publish_at ? new Date(connection.last_publish_at).toLocaleString() : "—"}
            </span>
          </div>
          {connection?.last_error && (
            <div className="text-xs text-rose-600 truncate max-w-md" title={connection.last_error}>
              ⚠ {connection.last_error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funnel KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Kpi label="Impressions" value={fmt(totals.impressions)} />
        <Kpi label="Saves" value={fmt(totals.saves)} sub={pct(saveRate)} />
        <Kpi label="Outbound clicks" value={fmt(totals.outbound_clicks)} sub={pct(ctr)} />
        <Kpi label="Product views" value={fmt(totals.product_views)} />
        <Kpi label="Add to cart" value={fmt(totals.add_to_carts)} sub={pct(atcRate)} />
        <Kpi label="Checkouts" value={fmt(totals.checkouts)} />
        <Kpi label="Purchases" value={fmt(totals.purchases)} sub={pct(purchRate)} />
        <Kpi label="Revenue" value={money(totals.revenue_cents)} />
      </div>

      {/* Recent Published Pins — last 50 with diversity score + Pinterest perf */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" /> Recent Published Pins
            <Badge variant="outline">{recentPublished.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentPublished.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pins published yet — waiting for the cron worker.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Headline</th>
                    <th className="py-2 pr-3">CTA</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Board</th>
                    <th className="py-2 pr-3">Div</th>
                    <th className="py-2 pr-3 text-right">Impr</th>
                    <th className="py-2 pr-3 text-right">Clicks</th>
                    <th className="py-2 pr-3 text-right">Saves</th>
                    <th className="py-2 pr-3">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPublished.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{p.posted_at ? new Date(p.posted_at).toLocaleString() : "—"}</td>
                      <td className="py-2 pr-3 max-w-[260px] truncate" title={p.headline}>{p.headline}</td>
                      <td className="py-2 pr-3 max-w-[140px] truncate" title={p.cta}>{p.cta}</td>
                      <td className="py-2 pr-3">{p.category ?? "—"}</td>
                      <td className="py-2 pr-3">{p.board ?? "—"}</td>
                      <td className="py-2 pr-3">{p.diversity_score ?? "—"}</td>
                      <td className="py-2 pr-3 text-right">{p.impressions}</td>
                      <td className="py-2 pr-3 text-right">{p.clicks}</td>
                      <td className="py-2 pr-3 text-right">{p.saves}</td>
                      <td className="py-2 pr-3">
                        {p.external_url ? (
                          <a href={p.external_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">view</a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attribution Health (last 24h) — Pinterest-attributed funnel from gi_attribution_events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" /> Attribution Health (last 24h)
          </CardTitle>
          {(() => {
            const a = attribution;
            const stages = a ? [a.views, a.atcs, a.checkouts, a.purchases].filter((n) => n > 0).length : 0;
            const tone = !a ? "secondary" : a.total === 0 ? "destructive" : stages >= 4 ? "default" : "outline";
            const dot = !a ? "bg-muted" : a.total === 0 ? "bg-rose-500" : stages >= 4 ? "bg-emerald-500" : "bg-amber-500";
            const label = !a ? "loading" : a.total === 0 ? "RED — no events" : stages >= 4 ? "GREEN — full funnel" : `YELLOW — ${stages}/4 stages`;
            return (
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${dot}`} />
                <Badge variant={tone as "default" | "destructive" | "outline" | "secondary"}>{label}</Badge>
              </div>
            );
          })()}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Kpi label="Events" value={fmt(attribution?.total ?? 0)} />
            <Kpi label="Attributed sessions" value={fmt(attribution?.sessions ?? 0)} />
            <Kpi label="Product views" value={fmt(attribution?.views ?? 0)} />
            <Kpi label="Add to cart" value={fmt(attribution?.atcs ?? 0)} />
            <Kpi label="Checkouts" value={fmt(attribution?.checkouts ?? 0)} />
            <Kpi label="Purchases" value={fmt(attribution?.purchases ?? 0)} sub={money(attribution?.revenueCents ?? 0)} />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Source: <span className="font-mono">gi_attribution_events</span> · meta.source=pinterest ·{" "}
            Last event: {attribution?.lastEventAt ? new Date(attribution.lastEventAt).toLocaleString() : "—"}
          </div>
          {attribution && attribution.total === 0 && (
            <div className="mt-3 text-xs text-amber-600">
              No Pinterest-attributed events captured in the last 24h. Run the synthetic funnel test below to verify the pipeline end-to-end.
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            <Button size="sm" onClick={runAttributionTest} disabled={testingAttribution}>
              {testingAttribution ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              Run live test funnel
            </Button>
            <Button size="sm" variant="outline" onClick={cleanupAttributionTests}>
              Remove synthetic test events
            </Button>
            <span className="text-xs text-muted-foreground">
              Inserts product_view → add_to_cart → begin_checkout → purchase into <span className="font-mono">gi_attribution_events</span> (meta.test=true).
            </span>
          </div>

          {testResult && (
            <div className="mt-3 rounded-md border bg-muted/30 p-3 text-xs">
              <div className="font-semibold mb-1">
                Last test: {testResult.ok ? "✅ inserted" : "❌ failed"}
                {testResult.sessionId && <> · session <span className="font-mono">{testResult.sessionId}</span></>}
              </div>
              {testResult.verified && testResult.verified.length > 0 && (
                <ul className="ml-4 list-disc">
                  {testResult.verified.map((v, i) => (
                    <li key={i}>
                      <span className="font-mono">{v.event_type}</span> @ {new Date(v.occurred_at).toLocaleTimeString()}
                      {v.revenue_cents > 0 && <> · {money(v.revenue_cents)}</>}
                    </li>
                  ))}
                </ul>
              )}
              {testResult.message && <div className="mt-1 text-muted-foreground">{testResult.message}</div>}
            </div>
          )}

          {/* Readiness Report — generated from live signals */}
          {(() => {
            const a = attribution;
            const stages = a ? [a.views, a.atcs, a.checkouts, a.purchases].filter((n) => n > 0).length : 0;
            const attrOk = !!a && a.total > 0;
            const tokenOk = !!connection?.token_expires_at && new Date(connection.token_expires_at) > new Date();
            const queueOk = reviewQueue.length >= 5;
            const varietyOk = !varietyReport || varietyReport.goal?.compliant !== false;
            const checks = [
              { ok: attrOk, label: "Attribution pipeline writing to gi_attribution_events" },
              { ok: stages >= 4, label: "Full funnel observed (view → atc → checkout → purchase)" },
              { ok: tokenOk, label: "Pinterest token valid" },
              { ok: queueOk, label: "≥5 drafts ready for review" },
              { ok: varietyOk, label: "Creative variety guard clean (≤5 repeats / 90 pins)" },
            ];
            const goNoGo = checks.every((c) => c.ok);
            return (
              <div className="mt-4 rounded-md border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold">Readiness Report — first batch of 5 drafts</div>
                  <Badge variant={goNoGo ? "default" : "destructive"}>
                    {goNoGo ? "GO" : "HOLD"}
                  </Badge>
                </div>
                <ul className="text-xs space-y-1">
                  {checks.map((c, i) => (
                    <li key={i} className="flex items-center gap-2">
                      {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-rose-600" />}
                      <span className={c.ok ? "" : "text-muted-foreground"}>{c.label}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-xs text-muted-foreground">
                  Publishing remains paused until all checks are GO and a real Pinterest-attributed session has been observed.
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" /> Top winners (30d)
            </CardTitle>
            <Badge variant="secondary">{winners.length}</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : winners.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No winners yet. Run scoring after a few days of post-publish data.
              </div>
            ) : (
              <ul className="divide-y">
                {winners.map((w) => (
                  <li key={w.product_id ?? w.pin_id} className="py-2 flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{w.product_slug ?? w.product_id}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmt(w.impressions)} imp · {fmt(w.outbound_clicks)} clk · {fmt(w.purchases)} buy · {money(w.revenue_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-rose-600" /> Losers to pause
            </CardTitle>
            <Badge variant="secondary">{losers.length}</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : losers.length === 0 ? (
              <div className="text-sm text-muted-foreground">No clear losers yet.</div>
            ) : (
              <ul className="divide-y">
                {losers.map((l) => (
                  <li key={l.product_id ?? l.pin_id} className="py-2 flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">{l.product_slug ?? l.product_id}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmt(l.impressions)} imp · {fmt(l.outbound_clicks)} clk
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily run status: cron health */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" /> Daily automation runs (last 20)
          </CardTitle>
          <Badge variant="secondary">{cronRuns.length}</Badge>
        </CardHeader>
        <CardContent>
          {cronRuns.length === 0 ? (
            <div className="text-sm text-muted-foreground">No Pinterest cron runs recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Job</th>
                    <th className="py-2 pr-3">Started</th>
                    <th className="py-2 pr-3 text-right">Processed</th>
                    <th className="py-2 pr-3 text-right">Failed</th>
                    <th className="py-2 pr-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {cronRuns.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        {r.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : r.completed_at ? (
                          <XCircle className="w-4 h-4 text-rose-600" />
                        ) : (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.job_name}</td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap">{new Date(r.started_at).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right">{r.items_processed ?? "—"}</td>
                      <td className="py-2 pr-3 text-right">{r.items_failed ?? 0}</td>
                      <td className="py-2 pr-3 text-xs text-rose-600 truncate max-w-xs" title={r.error_message ?? ""}>
                        {r.error_message ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval queue (read-only inline) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" /> Ready for review
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{reviewQueue.length}</Badge>
            <Button asChild size="sm" variant="outline">
              <a href="/admin/pinterest-pin-status">Open approval workflow</a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reviewQueue.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing pending review. Drafts will appear here after validation passes.</div>
          ) : (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {reviewQueue.slice(0, 12).map((p) => (
                <li key={p.id} className="border rounded-lg overflow-hidden flex flex-col">
                  {p.pin_image_url ? (
                    <img src={p.pin_image_url} alt={p.overlay_text ?? p.pin_title ?? ""} loading="lazy" className="w-full aspect-[3/4] object-cover bg-muted" />
                  ) : (
                    <div className="w-full aspect-[3/4] bg-muted" />
                  )}
                  <div className="p-2 space-y-1 text-xs">
                    <div className="font-medium truncate" title={p.overlay_text ?? ""}>{p.overlay_text ?? p.pin_title ?? "—"}</div>
                    <div className="text-muted-foreground truncate">{p.product_slug ?? p.product_name}</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {p.board_name && <Badge variant="outline" className="text-[10px]">{p.board_name}</Badge>}
                      {p.category_key && <Badge variant="secondary" className="text-[10px]">{p.category_key}</Badge>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {reviewQueue.length > 12 && (
            <p className="text-xs text-muted-foreground mt-3">
              Showing 12 of {reviewQueue.length}. Approve/Reject in the full workflow.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Creative variety audit (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> Creative variety audit
            <Badge variant="secondary" className="ml-2">{variety.total} posted (30d)</Badge>
            {variety.overlayDup > 0 && (
              <Badge variant="destructive">{variety.overlayDup} overlay(s) reused ≥15×</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid lg:grid-cols-3 gap-6 text-sm">
          <VarietyList title="Most repeated overlays" rows={variety.overlays.slice(0, 10)} />
          <VarietyList title="Most repeated titles" rows={variety.titles.slice(0, 10)} />
          <VarietyList title="Most repeated hooks" rows={variety.hooks.slice(0, 10)} />
          <div className="lg:col-span-3">
            <h4 className="font-semibold mb-2">Diversity per board (lower = more repetitive)</h4>
            {variety.boardDiversity.length === 0 ? (
              <div className="text-muted-foreground">No board data.</div>
            ) : (
              <ul className="divide-y">
                {variety.boardDiversity.map((b) => (
                  <li key={b.board} className="py-1.5 flex items-center justify-between gap-3">
                    <span className="truncate">{b.board}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {b.unique} unique / {b.sum} pins ·{" "}
                      <Badge variant={b.diversity < 0.3 ? "destructive" : b.diversity < 0.6 ? "outline" : "secondary"} className="text-[10px]">
                        {(b.diversity * 100).toFixed(0)}%
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Creative Variety Engine — 90-day rule + replacement pools */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> Creative Variety Engine
            {varietyReport && (
              <Badge variant={varietyReport.goal.compliant ? "secondary" : "destructive"}>
                {varietyReport.goal.compliant
                  ? "Compliant: ≤5 per overlay in last 90"
                  : `${varietyReport.goal.violations_in_90} overlay(s) over 5× in last 90`}
              </Badge>
            )}
            <Badge variant="outline">Publishing paused</Badge>
            <Button size="sm" className="ml-auto" disabled={auditing} onClick={runVarietyAudit}>
              {auditing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              {varietyReport ? "Re-run audit" : "Run variety audit"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          {!varietyReport ? (
            <div className="text-muted-foreground">
              Run the audit to analyse all published pins, score diversity per board & category, and surface
              repeated overlays, hooks, CTAs, angles, and benefits — plus the replacement creative pools.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Published pins (total)" value={fmt(varietyReport.totals.published_pins_total)} />
                <Kpi label="In last 90" value={fmt(varietyReport.totals.pins_in_window_90)} />
                <Kpi label="Unique overlays (all-time)" value={fmt(varietyReport.totals.unique_overlays_total)} />
                <Kpi label="Unique overlays (last 90)" value={fmt(varietyReport.totals.unique_overlays_in_90)} />
              </div>
              {(() => {
                const board = varietyReport.diversity_by_board;
                const cat = varietyReport.diversity_by_category;
                const avg = (xs: { diversity: number }[]) =>
                  xs.length ? Math.round(xs.reduce((a, b) => a + b.diversity, 0) / xs.length) : 0;
                const total = varietyReport.totals.published_pins_total;
                const uniq = varietyReport.totals.unique_overlays_total;
                const global = total ? Math.round((uniq / total) * 100) : 0;
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <Kpi label="Global diversity" value={`${global}%`} />
                    <Kpi label="Avg board diversity" value={`${avg(board)}%`} />
                    <Kpi label="Avg category diversity" value={`${avg(cat)}%`} />
                  </div>
                );
              })()}

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  Rule: {varietyReport.goal.rule}
                  {varietyReport.goal.compliant ? (
                    <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" /> pass</Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> fail</Badge>
                  )}
                </h4>
                {varietyReport.overused_overlays_last_90.length === 0 ? (
                  <div className="text-muted-foreground text-xs">No overlay exceeds 5 uses within the last 90 pins.</div>
                ) : (
                  <ul className="divide-y border rounded">
                    {varietyReport.overused_overlays_last_90.map((o) => (
                      <li key={o.value} className="py-1.5 px-2 flex justify-between gap-3 text-xs">
                        <span className="truncate" title={o.value}>{o.value}</span>
                        <Badge variant="destructive" className="shrink-0">×{o.count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <ReportList title="Top repeated overlays (all-time)" rows={varietyReport.top_repeated.overlays} threshold={15} />
                <ReportList title="Top repeated titles" rows={varietyReport.top_repeated.titles} threshold={15} />
                <ReportList title="Top repeated hooks" rows={varietyReport.top_repeated.hooks} threshold={15} />
                <ReportList title="Top CTAs" rows={varietyReport.top_repeated.ctas} threshold={50} />
                <ReportList title="Top emotional angles" rows={varietyReport.top_repeated.angles} threshold={50} />
                <ReportList title="Top benefit statements" rows={varietyReport.top_repeated.benefits} threshold={50} />
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Diversity per board</h4>
                  <ul className="divide-y border rounded">
                    {varietyReport.diversity_by_board.map((b) => (
                      <li key={b.board} className="py-1.5 px-2 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate" title={b.board}>{b.board}</span>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {b.uniques}/{b.total} ·{" "}
                          <Badge variant={b.diversity < 30 ? "destructive" : b.diversity < 60 ? "outline" : "secondary"} className="text-[10px]">
                            {b.diversity}%
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Diversity per category</h4>
                  <ul className="divide-y border rounded">
                    {varietyReport.diversity_by_category.map((c) => (
                      <li key={c.category} className="py-1.5 px-2 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate" title={c.category}>{c.category}</span>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {c.uniques}/{c.total} ·{" "}
                          <Badge variant={c.diversity < 30 ? "destructive" : c.diversity < 60 ? "outline" : "secondary"} className="text-[10px]">
                            {c.diversity}%
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Replacement creative pools (ready for next generation)</h4>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(varietyReport.replacement_pools).map(([cat, byType]) => (
                    <div key={cat} className="border rounded p-3">
                      <div className="font-semibold text-xs mb-2 uppercase tracking-wide">{cat}</div>
                      <ul className="space-y-1 text-xs">
                        {Object.entries(byType).map(([t, arr]) => (
                          <li key={t} className="flex justify-between gap-2">
                            <span className="text-muted-foreground">{t}</span>
                            <Badge variant="secondary" className="text-[10px]">{arr.length}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  These pools feed the next creative generation cycle so no headline crosses the 5/90 threshold. Publishing remains paused until manual approval.
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Diversity readiness simulation — replays next 30 drafts through the guard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5" /> Diversity readiness simulation
            <Badge variant="outline">Publishing paused</Badge>
            <Button size="sm" className="ml-auto" disabled={simulating} onClick={runDiversitySimulation}>
              {simulating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              {simulation ? "Re-run simulation" : "Run simulation against 30 drafts"}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!simulation ? (
            <div className="text-muted-foreground">
              Pulls the next 30 approval-ready drafts and replays them through the diversity guard
              (headline ≤5/90, CTA/angle/benefit ≤2/90, no exact overlay duplicate in last 25).
              No pins are created, modified, or published.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Kpi label="Considered" value={fmt(simulation.input.considered)} />
                <Kpi label="Would pass" value={fmt(simulation.summary.pass)} />
                <Kpi label="Would fail" value={fmt(simulation.summary.fail)} />
                <Kpi label="Replaced from pool" value={fmt(simulation.summary.replaced_from_pool)} />
                <Kpi
                  label="Projected global diversity"
                  value={`${simulation.summary.projected_global_diversity}% (${simulation.summary.delta_global_diversity >= 0 ? "+" : ""}${simulation.summary.delta_global_diversity})`}
                />
              </div>
              <div className="border rounded divide-y max-h-[420px] overflow-auto">
                {simulation.results.map((r) => (
                  <div key={r.id} className="p-2 text-xs flex items-start gap-3">
                    <Badge variant={r.pass ? "secondary" : "destructive"} className="shrink-0">
                      {r.pass ? "pass" : "fail"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {r.headline} <span className="text-muted-foreground">• {r.cta}</span>
                      </div>
                      <div className="text-muted-foreground truncate">
                        {r.product_slug || "—"} · {r.category || "—"}
                      </div>
                      {Object.keys(r.replaced).length > 0 && (
                        <div className="text-amber-600">
                          swapped: {Object.entries(r.replaced).map(([k, v]) => `${k}: "${v.from}" → "${v.to}"`).join(" · ")}
                        </div>
                      )}
                      {r.reasons.length > 0 && (
                        <div className="text-destructive">{r.reasons.join(" · ")}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Automation log (latest 100)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No actions yet.</div>
          ) : (
            <ul className="divide-y">
              {actions.map((a) => (
                <li key={a.id} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {a.action_type === "pause_loser" && <Pause className="w-3 h-3" />}
                      {a.action_type === "scale_winner" && <Rocket className="w-3 h-3" />}
                      {a.action_type === "validate_draft" && <ShieldCheck className="w-3 h-3" />}
                      <span>{a.action_type}</span>
                      {a.product_slug && <span className="text-muted-foreground">· {a.product_slug}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{a.reason}</div>
                  </div>
                  <time className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(a.created_at).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Separator() {
  return <span className="h-4 w-px bg-border" aria-hidden />;
}

function VarietyList({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div>
      <h4 className="font-semibold mb-2">{title}</h4>
      {rows.length === 0 ? (
        <div className="text-muted-foreground text-xs">No data.</div>
      ) : (
        <ul className="divide-y">
          {rows.map(([v, c]) => (
            <li key={v} className="py-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="truncate" title={v}>{v}</span>
              <Badge variant={c >= 15 ? "destructive" : c >= 8 ? "outline" : "secondary"} className="text-[10px] shrink-0">×{c}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportList({
  title,
  rows,
  threshold,
}: {
  title: string;
  rows: { value: string; count: number }[];
  threshold: number;
}) {
  return (
    <div>
      <h4 className="font-semibold mb-2">{title}</h4>
      {rows.length === 0 ? (
        <div className="text-muted-foreground text-xs">No data.</div>
      ) : (
        <ul className="divide-y border rounded">
          {rows.map((r) => (
            <li key={r.value} className="py-1.5 px-2 flex items-center justify-between gap-3 text-xs">
              <span className="truncate" title={r.value}>{r.value}</span>
              <Badge
                variant={r.count >= threshold ? "destructive" : r.count >= Math.ceil(threshold / 2) ? "outline" : "secondary"}
                className="text-[10px] shrink-0"
              >
                ×{r.count}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}