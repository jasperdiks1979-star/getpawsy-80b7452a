import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Window = 7 | 30 | 90;

type RunRow = {
  id: string;
  trigger: string;
  dry_run: boolean;
  started_at: string;
  finished_at: string | null;
  recomputed: boolean;
  winners_amplified: number;
  losers_suppressed: number;
  opportunities_found: number;
  drafts_enqueued: number;
  dedupe_skipped: number;
  errors: number;
};

type TierRow = {
  product_id: string;
  product_slug: string | null;
  tier: string;
  score: number | null;
  status: string;
  priority: string;
  publish_multiplier: number;
  hidden_opportunity: boolean;
  block_reason: string | null;
  last_amplified_at: string | null;
};

type Kpis = {
  sessions: number;
  pageviews: number;
  atc: number;
  checkouts: number;
  purchases: number;
  ctr: number; // outbound / sessions, simple proxy
  impressions: number;
  outboundClicks: number;
  publishedToday: number;
  published7d: number;
};

type Projection = {
  expectedPinsPerDay: number;
  expectedMonthlyTraffic: number;
  daysToStatisticalDataset: number;
  bottlenecks: string[];
};

const fmt = (n: number) => n.toLocaleString();
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const delta = (cur: number, prev: number) => {
  if (!prev) return cur > 0 ? "+∞" : "0%";
  const d = ((cur - prev) / prev) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`;
};

export default function PinterestGrowthPage() {
  const [days, setDays] = useState<Window>(30);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [prev, setPrev] = useState<Kpis | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAll(window: Window) {
    const now = Date.now();
    const since = new Date(now - window * 86400_000).toISOString();
    const prevSince = new Date(now - 2 * window * 86400_000).toISOString();
    const prevUntil = since;
    const today = new Date(); today.setHours(0,0,0,0);
    const todayIso = today.toISOString();
    const sevenIso = new Date(now - 7 * 86400_000).toISOString();

    const buildKpis = async (fromIso: string, toIso?: string): Promise<Kpis> => {
      const sessQ = supabase.from("pinterest_attribution_sessions")
        .select("id, click_counted, last_seen").gte("last_seen", fromIso).limit(5000);
      const evtQ = supabase.from("lp_funnel_events")
        .select("event_name, utm_source").gte("created_at", fromIso)
        .or("is_bot.is.null,is_bot.eq.false").eq("utm_source", "pinterest").limit(10000);
      const sinceDate = fromIso.slice(0,10);
      const adQ = supabase.from("pinterest_analytics_daily")
        .select("impressions, outbound_clicks, day").gte("day", sinceDate).limit(5000);
      const [s, e, a] = await Promise.all([
        toIso ? sessQ.lt("last_seen", toIso) : sessQ,
        toIso ? evtQ.lt("created_at", toIso) : evtQ,
        toIso ? adQ.lt("day", toIso.slice(0,10)) : adQ,
      ]);
      const sessions = s.data?.length ?? 0;
      const outboundClicks = s.data?.filter((x: any) => x.click_counted).length ?? 0;
      const evt = e.data ?? [];
      const count = (name: string) => evt.filter((x: any) => (x.event_name ?? "") === name).length;
      const impressions = (a.data ?? []).reduce((acc: number, r: any) => acc + (r.impressions || 0), 0);
      const apiClicks   = (a.data ?? []).reduce((acc: number, r: any) => acc + (r.outbound_clicks || 0), 0);
      return {
        sessions, pageviews: count("view_item") + count("page_view"),
        atc: count("add_to_cart"), checkouts: count("begin_checkout"),
        purchases: count("purchase"),
        ctr: sessions > 0 ? outboundClicks / sessions : 0,
        impressions, outboundClicks: Math.max(outboundClicks, apiClicks),
        publishedToday: 0, published7d: 0,
      };
    };

    const [runRes, tierRes, curK, prvK, pubToday, pub7d] = await Promise.all([
      supabase.from("pinterest_growth_runs")
        .select("id, trigger, dry_run, started_at, finished_at, recomputed, winners_amplified, losers_suppressed, opportunities_found, drafts_enqueued, dedupe_skipped, errors")
        .order("started_at", { ascending: false })
        .limit(14),
      supabase.from("pinterest_product_tiers")
        .select("product_id, product_slug, tier, score, status, priority, publish_multiplier, hidden_opportunity, block_reason, last_amplified_at"),
      buildKpis(since),
      buildKpis(prevSince, prevUntil),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).gte("posted_at", todayIso),
      supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true }).gte("posted_at", sevenIso),
    ]);

    if (runRes.data) setRuns(runRes.data as RunRow[]);
    if (tierRes.data) setTiers(tierRes.data as TierRow[]);
    curK.publishedToday = pubToday.count ?? 0;
    curK.published7d = pub7d.count ?? 0;
    setKpis(curK);
    setPrev(prvK);

    // Projection — assumes 4 → 25 pins/day warm-up, ~25 sessions/active-pin/month at maturity.
    const lastRun = runRes.data?.[0] as any;
    const dailyBudget = lastRun?.summary?.daily_publish_budget ?? Math.max(4, Math.round(curK.published7d / 7));
    const expectedMonthly = Math.round(dailyBudget * 30 * 1.2); // 1.2 sessions per published pin baseline
    const sessionsPerDay = curK.sessions / Math.max(1, window);
    const daysToDataset = sessionsPerDay > 0 ? Math.ceil(1000 / sessionsPerDay) : 999;
    const bottlenecks: string[] = [];
    if (curK.impressions === 0) bottlenecks.push("No Pinterest analytics sync — connect/refresh Pinterest API.");
    if (curK.publishedToday === 0) bottlenecks.push("No pins published today — check publish governor + warm-up cap.");
    if (curK.ctr < 0.01 && curK.sessions > 50) bottlenecks.push("CTR < 1% — refresh creative variants or hooks.");
    if (curK.atc === 0 && curK.sessions > 50) bottlenecks.push("Sessions without ATC — review PDP intent match.");
    if ((tierRes.data?.filter((t: any) => t.tier === "winner").length ?? 0) === 0) {
      bottlenecks.push("No winners yet — keep publishing, scoring needs ≥1000 sessions.");
    }
    setProjection({
      expectedPinsPerDay: dailyBudget,
      expectedMonthlyTraffic: expectedMonthly,
      daysToStatisticalDataset: daysToDataset,
      bottlenecks,
    });
  }

  useEffect(() => { loadAll(days); }, [days]);

  async function runOrchestrator(dry: boolean) {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("pinterest-growth-orchestrator", {
        body: { trigger: "manual", dry_run: dry },
      });
      if (error) throw error;
      const s = (data as any)?.stats ?? {};
      toast.success(`${dry ? "Dry-run" : "Run"} complete — winners ${s.winners_amplified ?? 0}, losers ${s.losers_suppressed ?? 0}, opp ${s.opportunities_found ?? 0}, drafts ${s.drafts_enqueued ?? 0}`);
      await loadAll(days);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const winners = useMemo(() => tiers.filter(t => t.tier === "winner"), [tiers]);
  const losers  = useMemo(() => tiers.filter(t => t.tier === "loser"),  [tiers]);
  const opps    = useMemo(() => tiers.filter(t => t.hidden_opportunity), [tiers]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pinterest Growth Engine</h1>
          <p className="text-sm text-muted-foreground">
            Autonomous publishing, winner amplification, loser suppression, and hidden-opportunity mining.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex gap-1">
            {[7, 30, 90].map((w) => (
              <Button key={w} variant={days === w ? "default" : "outline"} size="sm" onClick={() => setDays(w as Window)}>
                {w}d
              </Button>
            ))}
          </div>
          <Button variant="outline" onClick={() => runOrchestrator(true)} disabled={busy}>Dry-run</Button>
          <Button onClick={() => runOrchestrator(false)} disabled={busy}>Run now</Button>
        </div>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis && [
          ["Pins today",   fmt(kpis.publishedToday), null],
          ["Pins last 7d", fmt(kpis.published7d),   null],
          ["Impressions",  fmt(kpis.impressions),   prev ? delta(kpis.impressions, prev.impressions) : null],
          ["Outbound clicks", fmt(kpis.outboundClicks), prev ? delta(kpis.outboundClicks, prev.outboundClicks) : null],
          ["Sessions",     fmt(kpis.sessions),      prev ? delta(kpis.sessions, prev.sessions) : null],
          ["Pageviews",    fmt(kpis.pageviews),     prev ? delta(kpis.pageviews, prev.pageviews) : null],
          ["Add-to-cart",  fmt(kpis.atc),           prev ? delta(kpis.atc, prev.atc) : null],
          ["Checkouts",    fmt(kpis.checkouts),     prev ? delta(kpis.checkouts, prev.checkouts) : null],
          ["Purchases",    fmt(kpis.purchases),     prev ? delta(kpis.purchases, prev.purchases) : null],
          ["CTR",          pct(kpis.ctr),           null],
        ].map(([k, v, d]) => (
          <Card key={k as string}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{k}</CardTitle></CardHeader>
            <CardContent className="text-xl font-semibold flex items-baseline gap-2">
              <span>{v}</span>
              {d && <span className={`text-xs ${String(d).startsWith("-") ? "text-destructive" : "text-emerald-600"}`}>{d}</span>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Projection */}
      {projection && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Growth projection</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-4 text-sm">
            <div><div className="text-muted-foreground text-xs">Expected pins / day</div><div className="text-lg font-semibold">{projection.expectedPinsPerDay}</div></div>
            <div><div className="text-muted-foreground text-xs">Expected traffic / month</div><div className="text-lg font-semibold">{fmt(projection.expectedMonthlyTraffic)}</div></div>
            <div><div className="text-muted-foreground text-xs">Days to 1k sessions</div><div className="text-lg font-semibold">{projection.daysToStatisticalDataset >= 999 ? "—" : projection.daysToStatisticalDataset}</div></div>
            <div>
              <div className="text-muted-foreground text-xs">Bottlenecks</div>
              {projection.bottlenecks.length === 0
                ? <div className="text-emerald-600 text-sm">None detected</div>
                : <ul className="text-xs list-disc pl-4">{projection.bottlenecks.map((b,i) => <li key={i}>{b}</li>)}</ul>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier panels */}
      <div className="grid md:grid-cols-3 gap-4">
        <Panel title="Winners (amplified)" rows={winners} kind="winner" />
        <Panel title="Losers (suppressed)" rows={losers} kind="loser" />
        <Panel title="Hidden opportunities" rows={opps} kind="opportunity" />
      </div>

      {/* Run log */}
      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 px-2">When</th>
                <th className="text-left py-2 px-2">Trigger</th>
                <th className="text-right py-2 px-2">Winners</th>
                <th className="text-right py-2 px-2">Losers</th>
                <th className="text-right py-2 px-2">Opp</th>
                <th className="text-right py-2 px-2">Drafts</th>
                <th className="text-right py-2 px-2">Dedupe</th>
                <th className="text-right py-2 px-2">Errors</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="py-1.5 px-2">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="py-1.5 px-2">
                    {r.trigger}{r.dry_run && <Badge variant="secondary" className="ml-2">dry</Badge>}
                  </td>
                  <td className="text-right">{r.winners_amplified}</td>
                  <td className="text-right">{r.losers_suppressed}</td>
                  <td className="text-right">{r.opportunities_found}</td>
                  <td className="text-right">{r.drafts_enqueued}</td>
                  <td className="text-right">{r.dedupe_skipped}</td>
                  <td className="text-right">{r.errors}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">No runs yet — hit "Run now".</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Panel({ title, rows, kind }: { title: string; rows: TierRow[]; kind: "winner" | "loser" | "opportunity" }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{title}</CardTitle>
        <Badge variant="secondary">{rows.length}</Badge>
      </CardHeader>
      <CardContent className="max-h-72 overflow-y-auto space-y-1.5">
        {rows.slice(0, 25).map(r => (
          <div key={r.product_id} className="text-xs border-b last:border-0 pb-1">
            <div className="font-medium truncate">{r.product_slug ?? r.product_id.slice(0, 8)}</div>
            <div className="text-muted-foreground">
              {kind === "winner"  && `score ${Math.round(Number(r.score ?? 0))} · ×${r.publish_multiplier} · ${r.priority}`}
              {kind === "loser"   && `score ${Math.round(Number(r.score ?? 0))} · ${r.status} · ${r.block_reason ?? "—"}`}
              {kind === "opportunity" && `score ${Math.round(Number(r.score ?? 0))} · ${r.status}`}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-xs text-muted-foreground">None yet.</div>}
      </CardContent>
    </Card>
  );
}