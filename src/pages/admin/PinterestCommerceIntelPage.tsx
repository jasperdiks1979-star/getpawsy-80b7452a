import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { RefreshCw, Sparkles, TrendingUp, Target, Zap } from "lucide-react";

type StrategyState = {
  id: number;
  quality_threshold: number;
  exploit_ratio: number;
  archetype_boosts: Record<string, number>;
  hook_boosts: Record<string, number>;
  trend_modifiers: Record<string, unknown>;
  last_evolved_at: string | null;
  updated_at: string;
};

type WinnerDim = {
  niche_key: string;
  pin_mode: string | null;
  hook_category: string | null;
  composite_score: number;
  sample_size: number;
  is_active: boolean;
};

type TrendSignal = {
  id: string;
  niche_key: string;
  pin_mode: string | null;
  aesthetic_tone: string | null;
  trend_label: string;
  source: string;
  weight: number;
  rationale: string | null;
  is_active: boolean;
};

type EvolutionLog = {
  id: string;
  decision_type: string;
  target_dimension: string | null;
  niche_key: string | null;
  old_value: unknown;
  new_value: unknown;
  rationale: string | null;
  metrics: unknown;
  created_at: string;
};

export default function PinterestCommerceIntelPage() {
  const qc = useQueryClient();

  const state = useQuery({
    queryKey: ["pinterest-strategy-state"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_strategy_state" as any)
        .select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as StrategyState | null;
    },
  });

  const winners = useQuery({
    queryKey: ["pinterest-winner-dimensions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_winner_dimensions" as any)
        .select("niche_key,pin_mode,hook_category,composite_score,sample_size,is_active")
        .eq("is_active", true)
        .order("composite_score", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as WinnerDim[];
    },
  });

  const trends = useQuery({
    queryKey: ["pinterest-trend-signals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_trend_signals" as any)
        .select("*").eq("is_active", true)
        .order("weight", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as TrendSignal[];
    },
  });

  const evolution = useQuery({
    queryKey: ["pinterest-evolution-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pinterest_evolution_log" as any)
        .select("*").order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      return (data ?? []) as EvolutionLog[];
    },
  });

  const refreshTrends = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-trend-intelligence", { body: {}, method: "POST" });
      // GET via query string equivalent
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Trend signals refreshed");
      qc.invalidateQueries({ queryKey: ["pinterest-trend-signals"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to refresh trends"),
  });

  const runEvolve = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "pinterest-auto-evolve", { body: {}, method: "POST" });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Auto-evolution complete");
      qc.invalidateQueries({ queryKey: ["pinterest-strategy-state"] });
      qc.invalidateQueries({ queryKey: ["pinterest-evolution-log"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Evolution failed"),
  });

  const s = state.data;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Helmet>
        <title>Pinterest Commerce Intelligence — GetPawsy Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pinterest Commerce Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Live strategy state, winning archetypes, US trend bias and the auto-evolution journal.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
            onClick={() => refreshTrends.mutate()} disabled={refreshTrends.isPending}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Trends
          </Button>
          <Button size="sm"
            onClick={() => runEvolve.mutate()} disabled={runEvolve.isPending}>
            <Sparkles className="w-4 h-4 mr-2" /> Run Auto-Evolve
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Target className="w-3 h-3" /> Quality Threshold
            </CardDescription>
            <CardTitle className="text-3xl">{s?.quality_threshold ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Min total score for an accepted pin (auto-tuned 72–90).
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Zap className="w-3 h-3" /> Exploit Ratio
            </CardDescription>
            <CardTitle className="text-3xl">
              {s ? `${Math.round(Number(s.exploit_ratio) * 100)}%` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            How often the top winning archetype is forced for the first brief.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Active Winners
            </CardDescription>
            <CardTitle className="text-3xl">{winners.data?.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Niche × archetype × hook combos meeting min sample size.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Last Evolved
            </CardDescription>
            <CardTitle className="text-base">
              {s?.last_evolved_at ? new Date(s.last_evolved_at).toLocaleString() : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Auto-evolution runs every 2 hours via cron.
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="winners">
        <TabsList>
          <TabsTrigger value="winners">Winners</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="boosts">Boosts</TabsTrigger>
          <TabsTrigger value="evolution">Evolution Log</TabsTrigger>
        </TabsList>

        <TabsContent value="winners">
          <Card>
            <CardHeader>
              <CardTitle>Top Winning Dimensions</CardTitle>
              <CardDescription>
                Distilled from rolled-up performance signals (CTR, saves, ATC, conversion).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Niche</TableHead>
                    <TableHead>Pin Mode</TableHead>
                    <TableHead>Hook</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Samples</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(winners.data ?? []).map((w, i) => (
                    <TableRow key={`${w.niche_key}-${w.pin_mode}-${w.hook_category}-${i}`}>
                      <TableCell className="font-medium">{w.niche_key}</TableCell>
                      <TableCell>{w.pin_mode ?? "—"}</TableCell>
                      <TableCell>{w.hook_category ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(w.composite_score).toFixed(1)}</TableCell>
                      <TableCell className="text-right">{w.sample_size}</TableCell>
                    </TableRow>
                  ))}
                  {!winners.data?.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        No winners distilled yet — needs more performance signal volume.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Active Trend Signals</CardTitle>
              <CardDescription>
                Seasonal + curated US ecommerce trend bias merged into the planner.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Niche</TableHead>
                    <TableHead>Pin Mode</TableHead>
                    <TableHead>Tone</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(trends.data ?? []).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.trend_label}</TableCell>
                      <TableCell>{t.niche_key}</TableCell>
                      <TableCell>{t.pin_mode ?? "—"}</TableCell>
                      <TableCell>{t.aesthetic_tone ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{t.source}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{Number(t.weight).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {!trends.data?.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No active trend signals — click “Refresh Trends”.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="boosts">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Archetype Boosts</CardTitle>
                <CardDescription>niche:pin_mode → boost (0–0.3)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(s?.archetype_boosts ?? {}).length === 0 && (
                  <p className="text-muted-foreground">No archetype boosts yet.</p>
                )}
                {Object.entries(s?.archetype_boosts ?? {})
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <code className="text-xs">{k}</code>
                      <Badge>{Number(v).toFixed(2)}</Badge>
                    </div>
                  ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Hook Boosts</CardTitle>
                <CardDescription>niche:hook_category → boost (0–0.3)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {Object.entries(s?.hook_boosts ?? {}).length === 0 && (
                  <p className="text-muted-foreground">No hook boosts yet.</p>
                )}
                {Object.entries(s?.hook_boosts ?? {})
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <code className="text-xs">{k}</code>
                      <Badge>{Number(v).toFixed(2)}</Badge>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="evolution">
          <Card>
            <CardHeader>
              <CardTitle>Auto-Evolution Journal</CardTitle>
              <CardDescription>
                Each tuning decision the system made, with metrics + rationale.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Dim</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead>Rationale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(evolution.data ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{e.decision_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{e.target_dimension ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-[260px] truncate">
                        {(() => {
                          const ov = (e.old_value as any)?.value;
                          const nv = (e.new_value as any)?.value;
                          if (ov !== undefined && nv !== undefined) {
                            return `${ov} → ${nv}`;
                          }
                          return "(boost refresh)";
                        })()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.rationale}</TableCell>
                    </TableRow>
                  ))}
                  {!evolution.data?.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        No auto-evolution decisions logged yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}