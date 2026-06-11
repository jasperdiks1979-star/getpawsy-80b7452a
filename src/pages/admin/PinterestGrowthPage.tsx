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
};

const fmt = (n: number) => n.toLocaleString();
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function PinterestGrowthPage() {
  const [days, setDays] = useState<Window>(30);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAll(window: Window) {
    const since = new Date(Date.now() - window * 86400_000).toISOString();

    const [runRes, tierRes, sessRes, evtRes] = await Promise.all([
      supabase.from("pinterest_growth_runs")
        .select("id, trigger, dry_run, started_at, finished_at, recomputed, winners_amplified, losers_suppressed, opportunities_found, drafts_enqueued, dedupe_skipped, errors")
        .order("started_at", { ascending: false })
        .limit(14),
      supabase.from("pinterest_product_tiers")
        .select("product_id, product_slug, tier, score, status, priority, publish_multiplier, hidden_opportunity, block_reason, last_amplified_at"),
      supabase.from("pinterest_attribution_sessions")
        .select("id, click_counted, last_seen", { count: "exact", head: false })
        .gte("last_seen", since)
        .limit(5000),
      supabase.from("lp_funnel_events")
        .select("event_name, utm_source")
        .gte("created_at", since)
        .or("is_bot.is.null,is_bot.eq.false")
        .eq("utm_source", "pinterest")
        .limit(10000),
    ]);

    if (runRes.data) setRuns(runRes.data as RunRow[]);
    if (tierRes.data) setTiers(tierRes.data as TierRow[]);

    const sessions = sessRes.data?.length ?? 0;
    const outboundClicks = sessRes.data?.filter(s => s.click_counted).length ?? 0;
    const evt = evtRes.data ?? [];
    const count = (name: string) => evt.filter(e => (e.event_name ?? "") === name).length;
    const pageviews = count("view_item") + count("page_view");
    const atc = count("add_to_cart");
    const checkouts = count("begin_checkout");
    const purchases = count("purchase");
    setKpis({
      sessions,
      pageviews,
      atc,
      checkouts,
      purchases,
      ctr: sessions > 0 ? outboundClicks / sessions : 0,
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
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {kpis && [
          ["Sessions", fmt(kpis.sessions)],
          ["Pageviews", fmt(kpis.pageviews)],
          ["Add-to-cart", fmt(kpis.atc)],
          ["Checkouts", fmt(kpis.checkouts)],
          ["Purchases", fmt(kpis.purchases)],
          ["CTR", pct(kpis.ctr)],
        ].map(([k, v]) => (
          <Card key={k as string}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{k}</CardTitle></CardHeader>
            <CardContent className="text-xl font-semibold">{v}</CardContent>
          </Card>
        ))}
      </div>

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