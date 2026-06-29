import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Users, Sparkles, Compass, Heart, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Persona {
  id: string;
  slug: string;
  name: string;
  primary_emotion: string | null;
  confidence: number;
  evidence_count: number;
  intent: string | null;
  budget_band: string | null;
}
interface PerfRow {
  persona_id: string;
  slug: string;
  name: string;
  primary_emotion: string | null;
  confidence: number;
  impressions_30d: number;
  saves_30d: number;
  clicks_30d: number;
  purchases_30d: number;
  revenue_30d: number;
  ctr_30d: number;
  cvr_30d: number;
}
interface UntappedRow {
  persona_id: string;
  slug: string;
  name: string;
  confidence: number;
  published_creatives: number;
  purchases_30d: number;
}
interface MatchRow {
  product_id: string;
  persona_id: string;
  match_score: number;
  buying_probability: number;
  expected_revenue: number;
  rank: string;
}

function pct(n: number) { return `${Math.round((n || 0) * 100)}%`; }

export function AudienceIntelligenceTab() {
  const [busy, setBusy] = useState<string | null>(null);
  const [autopilot, setAutopilot] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [perf, setPerf] = useState<PerfRow[]>([]);
  const [untapped, setUntapped] = useState<UntappedRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  async function load() {
    const [p, v, u, m, s] = await Promise.all([
      supabase.from("gv35_audience_personas").select("*").order("confidence", { ascending: false }),
      supabase.from("gv35_audience_performance_v" as any).select("*"),
      supabase.from("gv35_untapped_audiences_v" as any).select("*").limit(10),
      supabase.from("gv35_product_audience_match").select("*").in("rank", ["best", "second"]).order("match_score", { ascending: false }).limit(25),
      supabase.from("gv35_settings").select("value").eq("key", "audience_first_mode").maybeSingle(),
    ]);
    setPersonas((p.data ?? []) as Persona[]);
    setPerf((v.data ?? []) as PerfRow[]);
    setUntapped((u.data ?? []) as UntappedRow[]);
    setMatches((m.data ?? []) as MatchRow[]);
    setAutopilot(!!(s.data?.value as any)?.enabled);
  }
  useEffect(() => { void load(); }, []);

  async function invoke(name: string, label: string) {
    setBusy(name);
    try {
      const { error, data } = await supabase.functions.invoke(name, { body: {} });
      if (error) throw error;
      toast.success(`${label} ✓ ${JSON.stringify(data)}`);
      await load();
    } catch (e: any) { toast.error(`${label} failed: ${e?.message ?? e}`); }
    finally { setBusy(null); }
  }

  async function toggleAutopilot(next: boolean) {
    setAutopilot(next);
    const { error } = await supabase.from("gv35_settings").upsert(
      { key: "audience_first_mode", value: { enabled: next }, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
    if (error) { toast.error(error.message); setAutopilot(!next); return; }
    toast.success(`Audience-first mode ${next ? "enabled" : "disabled"}`);
  }

  const topByConf = [...personas].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  const topByPurchases = [...perf].sort((a, b) => b.purchases_30d - a.purchases_30d).slice(0, 5);
  const topBySaves = [...perf].sort((a, b) => b.saves_30d - a.saves_30d).slice(0, 5);
  const topRevenue = [...perf].sort((a, b) => b.revenue_30d - a.revenue_30d)[0];
  const nextTarget = matches[0];
  const nextPersonaName = nextTarget ? personas.find((p) => p.id === nextTarget.persona_id)?.name ?? "—" : "—";

  const emotionTally = new Map<string, number>();
  for (const p of personas) {
    const k = p.primary_emotion ?? "unset";
    emotionTally.set(k, (emotionTally.get(k) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/40">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Pinterest Audience Intelligence (V3.5)</CardTitle>
            <CardDescription>Optimize for people, not products. Personas, matches and emotion targeting feed Autopilot.</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>Audience-first mode</span>
            <Switch checked={autopilot} onCheckedChange={toggleAutopilot} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => invoke("gv35-persona-discovery", "Persona discovery")}>
            {busy === "gv35-persona-discovery" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Discover personas
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => invoke("gv35-audience-matcher", "Audience matcher")}>
            {busy === "gv35-audience-matcher" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Re-match products
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => invoke("gv35-audience-evaluator", "Evaluator")}>
            {busy === "gv35-audience-evaluator" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Re-evaluate
          </Button>
          <Button size="sm" disabled={!!busy} onClick={() => invoke("gv35-audience-decision", "Audience decision loop")}>
            <Play className="h-3 w-3 mr-1" /> Run audience decision
          </Button>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Highest expected revenue audience</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{topRevenue?.name ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">${(topRevenue?.revenue_30d ?? 0).toFixed(0)} (30d) · CVR {pct(topRevenue?.cvr_30d ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Next audience to target</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{nextPersonaName}</div>
            <div className="text-xs text-muted-foreground mt-1">Match {(nextTarget?.match_score ?? 0).toFixed(2)} · Prob {pct(nextTarget?.buying_probability ?? 0)} · ${(nextTarget?.expected_revenue ?? 0).toFixed(0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Personas tracked</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{personas.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Avg conf {pct(personas.reduce((s, p) => s + p.confidence, 0) / Math.max(personas.length, 1))}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Top audiences by confidence</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topByConf.length === 0 && <p className="text-sm text-muted-foreground">No personas yet — run Discover personas.</p>}
            {topByConf.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate font-medium">{p.name}</span>
                {p.primary_emotion && <Badge variant="secondary" className="capitalize">{p.primary_emotion}</Badge>}
                <Badge variant="outline">{pct(p.confidence)}</Badge>
                <Badge>{p.evidence_count} ev</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Compass className="h-4 w-4" /> Untapped audiences</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {untapped.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
            {untapped.map((u) => (
              <div key={u.persona_id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate font-medium">{u.name}</span>
                <Badge variant="outline">{u.published_creatives} pins</Badge>
                <Badge>{u.purchases_30d} sales/30d</Badge>
                <Badge variant="secondary">{pct(u.confidence)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Best converting audiences (30d)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topByPurchases.length === 0 && <p className="text-sm text-muted-foreground">Awaiting attributed purchases.</p>}
            {topByPurchases.map((r) => (
              <div key={r.persona_id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate font-medium">{r.name}</span>
                <Badge variant="outline">{r.purchases_30d} buys</Badge>
                <Badge>${r.revenue_30d.toFixed(0)}</Badge>
                <Badge variant="secondary">CVR {pct(r.cvr_30d)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Highest save audiences (30d)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {topBySaves.length === 0 && <p className="text-sm text-muted-foreground">Awaiting Pinterest saves.</p>}
            {topBySaves.map((r) => (
              <div key={r.persona_id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate font-medium">{r.name}</span>
                <Badge variant="outline">{r.saves_30d} saves</Badge>
                <Badge>CTR {pct(r.ctr_30d)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Heart className="h-4 w-4" /> Emotion heatmap</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[...emotionTally.entries()].sort((a, b) => b[1] - a[1]).map(([emo, n]) => (
            <Badge key={emo} variant="secondary" className="capitalize">{emo} · {n}</Badge>
          ))}
          {emotionTally.size === 0 && <p className="text-sm text-muted-foreground">No emotions tagged yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top product × audience matches</CardTitle>
          <CardDescription>Queue into Autopilot as <code>audience_target</code> (dedup per persona × product × day).</CardDescription>
        </CardHeader>
        <CardContent>
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Run Re-match products to populate.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="text-left p-2">Persona</th><th className="text-left p-2">Product</th><th className="text-right p-2">Match</th><th className="text-right p-2">Buy prob</th><th className="text-right p-2">Est. $</th><th className="text-left p-2">Rank</th></tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const persona = personas.find((p) => p.id === m.persona_id);
                    return (
                      <tr key={`${m.product_id}-${m.persona_id}`} className="border-t">
                        <td className="p-2">{persona?.name ?? m.persona_id.slice(0, 8)}</td>
                        <td className="p-2 font-mono text-xs">{m.product_id.slice(0, 8)}</td>
                        <td className="p-2 text-right">{m.match_score.toFixed(2)}</td>
                        <td className="p-2 text-right">{pct(m.buying_probability)}</td>
                        <td className="p-2 text-right">${m.expected_revenue.toFixed(0)}</td>
                        <td className="p-2"><Badge variant={m.rank === "best" ? "default" : "outline"}>{m.rank}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}