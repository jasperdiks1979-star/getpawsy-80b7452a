import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, Pause, Rocket, PlayCircle, ShieldCheck } from "lucide-react";

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

  async function load() {
    setLoading(true);
    const [s, a] = await Promise.all([
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
    ]);
    if (s.error) toast.error(`scores: ${s.error.message}`);
    if (a.error) toast.error(`actions: ${a.error.message}`);
    setScores((s.data as ScoreRow[]) ?? []);
    setActions((a.data as ActionRow[]) ?? []);
    setLoading(false);
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