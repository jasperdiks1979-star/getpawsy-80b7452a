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
  const [connection, setConnection] = useState<ConnectionRow | null>(null);
  const [cronRuns, setCronRuns] = useState<CronRow[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewRow[]>([]);
  const [varietySamples, setVarietySamples] = useState<VarietySample[]>([]);

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