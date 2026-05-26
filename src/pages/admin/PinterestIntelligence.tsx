import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Trophy, AlertTriangle, Clock, Sparkles, DollarSign } from "lucide-react";

type Panel = "headline" | "categories" | "variants" | "verdicts" | "windows" | "trends" | "revenue";

async function fetchPanel<T = unknown>(panel: Panel): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke("pinterest-intelligence-api", {
    method: "GET",
    headers: {},
    body: undefined,
    // @ts-expect-error supabase-js v2 doesn't have query, fall back to direct fetch
    query: { panel },
  });
  if (!error && data) return data as T;
  // Fallback to direct fetch (URL parameter)
  const url = `https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/pinterest-intelligence-api?panel=${panel}`;
  const r = await fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
  return (await r.json()) as T;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export default function PinterestIntelligence() {
  const [loading, setLoading] = useState(true);
  const [headline, setHeadline] = useState<{ current: { impressions: number; outbound_clicks: number; saves: number }; previous: { impressions: number; outbound_clicks: number; saves: number }; ctr: number; winners_7d: number } | null>(null);
  const [categories, setCategories] = useState<Array<{ category_key: string; impressions: number; outbound_clicks: number; saves: number; ctr: number; save_rate: number; samples: number }>>([]);
  const [variants, setVariants] = useState<Array<{ hook: string; copy: string; cta: string; imp: number; out: number; ctr: number }>>([]);
  const [verdicts, setVerdicts] = useState<Array<{ id: string; pin_id: string; verdict: string; reason: string | null; ctr: number | null; scored_at: string }>>([]);
  const [windows, setWindows] = useState<Array<{ category_key: string; timezone: string; hour_of_day: number; score: number }>>([]);
  const [trends, setTrends] = useState<Array<{ id: string; keyword: string; source: string; strength: number; category_key: string | null; valid_to: string | null }>>([]);
  const [revenue, setRevenue] = useState<{ revenue: number; purchases: number } | null>(null);

  async function reload() {
    setLoading(true);
    const [h, c, v, vd, w, t, r] = await Promise.all([
      fetchPanel("headline"), fetchPanel("categories"), fetchPanel("variants"),
      fetchPanel("verdicts"), fetchPanel("windows"), fetchPanel("trends"), fetchPanel("revenue"),
    ]);
    setHeadline((h as { ok: boolean } | null)?.ok ? (h as never) : null);
    setCategories(((c as { rows?: never[] } | null)?.rows ?? []) as never);
    setVariants(((v as { rows?: never[] } | null)?.rows ?? []) as never);
    setVerdicts(((vd as { rows?: never[] } | null)?.rows ?? []) as never);
    setWindows(((w as { rows?: never[] } | null)?.rows ?? []) as never);
    setTrends(((t as { rows?: never[] } | null)?.rows ?? []) as never);
    setRevenue((r as { ok: boolean } | null)?.ok ? (r as never) : null);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  async function runJob(name: string) {
    await supabase.functions.invoke(name, { body: {} });
    await reload();
  }

  if (loading) return (
    <Card className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading Pinterest intelligence…</Card>
  );

  const cur = headline?.current ?? { impressions: 0, outbound_clicks: 0, saves: 0 };
  const prev = headline?.previous ?? { impressions: 0, outbound_clicks: 0, saves: 0 };
  const delta = (a: number, b: number) => b ? `${(((a - b) / b) * 100).toFixed(0)}% vs prev 7d` : "";

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Sparkles className="h-5 w-5" /> Pinterest Intelligence</h1>
          <p className="text-sm text-muted-foreground">Self-learning growth engine: winners, losers, trends, attribution.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => runJob("pinterest-analytics-sync")}>Sync analytics</Button>
          <Button size="sm" variant="outline" onClick={() => runJob("pinterest-benchmarks-rollup")}>Recompute benchmarks</Button>
          <Button size="sm" variant="outline" onClick={() => runJob("pinterest-winner-detector")}>Score winners</Button>
          <Button size="sm" variant="outline" onClick={() => runJob("pinterest-trend-harvester")}>Refresh trends</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Impressions (7d)" value={cur.impressions.toLocaleString()} sub={delta(cur.impressions, prev.impressions)} />
        <Stat label="Outbound clicks" value={cur.outbound_clicks.toLocaleString()} sub={delta(cur.outbound_clicks, prev.outbound_clicks)} />
        <Stat label="Saves" value={cur.saves.toLocaleString()} sub={delta(cur.saves, prev.saves)} />
        <Stat label="CTR" value={`${((headline?.ctr ?? 0) * 100).toFixed(2)}%`} />
        <Stat label="Winners (7d)" value={String(headline?.winners_7d ?? 0)} />
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Trophy className="h-4 w-4" /> Category leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2 pr-3">Category</th><th>Impr.</th><th>Clicks</th><th>Saves</th><th>CTR</th><th>Save rate</th></tr>
            </thead>
            <tbody>
              {categories.length === 0 && <tr><td colSpan={6} className="py-4 text-muted-foreground">No data yet.</td></tr>}
              {categories.map((c) => (
                <tr key={c.category_key} className="border-t">
                  <td className="py-2 pr-3 font-medium">{c.category_key}</td>
                  <td>{c.impressions.toLocaleString()}</td>
                  <td>{c.outbound_clicks.toLocaleString()}</td>
                  <td>{c.saves.toLocaleString()}</td>
                  <td>{(c.ctr * 100).toFixed(2)}%</td>
                  <td>{(c.save_rate * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4" /> Top hook × copy × CTA</h2>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {variants.length === 0 && <p className="text-sm text-muted-foreground">No variants tracked yet.</p>}
            {variants.map((v, i) => (
              <div key={i} className="flex justify-between text-sm border-b py-1">
                <span className="truncate">{v.hook} · {v.copy} · {v.cta}</span>
                <Badge variant="outline">{(v.ctr * 100).toFixed(2)}%</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Latest verdicts</h2>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {verdicts.length === 0 && <p className="text-sm text-muted-foreground">No verdicts yet.</p>}
            {verdicts.map((v) => (
              <div key={v.id} className="flex justify-between text-sm border-b py-1 gap-2">
                <span className="truncate" title={v.reason ?? ""}>
                  <Badge variant={v.verdict === "winner" ? "default" : v.verdict === "loser" ? "destructive" : "secondary"} className="mr-2">{v.verdict}</Badge>
                  {v.pin_id}
                </span>
                <span className="text-muted-foreground text-xs">{v.ctr ? `${(v.ctr * 100).toFixed(2)}%` : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Clock className="h-4 w-4" /> Best publishing windows</h2>
        <div className="text-sm grid md:grid-cols-3 gap-3">
          {["America/New_York", "America/Chicago", "America/Los_Angeles"].map((tz) => {
            const top = windows.filter(w => w.timezone === tz).slice(0, 6);
            return (
              <div key={tz} className="border rounded p-3">
                <div className="font-medium mb-1">{tz}</div>
                {top.length === 0 ? <div className="text-muted-foreground text-xs">No data.</div> : top.map((t, i) => (
                  <div key={i} className="flex justify-between"><span>{String(t.hour_of_day).padStart(2, "0")}:00 — {t.category_key}</span><Badge variant="outline">{t.score}</Badge></div>
                ))}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Active trend signals</h2>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {trends.length === 0 && <p className="text-sm text-muted-foreground">No trends loaded.</p>}
            {trends.map((t) => (
              <div key={t.id} className="flex justify-between text-sm border-b py-1">
                <span>{t.keyword} <span className="text-muted-foreground">· {t.source} · {t.category_key ?? "—"}</span></span>
                <Badge variant="outline">{Number(t.strength).toFixed(2)}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4" /> Revenue attribution (30d)</h2>
          <Stat label="Pinterest revenue" value={`$${(revenue?.revenue ?? 0).toFixed(0)}`} sub={`${revenue?.purchases ?? 0} purchases attributed`} />
          <p className="text-xs text-muted-foreground">From <code>pinterest_funnel_events</code>. Connect order webhooks to populate purchase values.</p>
        </Card>
      </div>
    </div>
  );
}