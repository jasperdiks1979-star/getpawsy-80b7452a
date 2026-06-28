import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles } from "lucide-react";

interface Module {
  key: string;
  name: string;
  description: string | null;
  category: string;
  concept_count: number;
  avg_confidence: number;
}
interface Concept {
  id: string;
  module_key: string;
  key: string;
  name: string;
  weight: number;
  confidence: number;
  evidence_count: number;
  version: number;
}
interface TopPin {
  pin_id: string;
  success_score: number | null;
  revenue_usd: number | null;
  saves: number | null;
  outbound_clicks: number | null;
  snapshot_date: string;
}

export default function PinterestIntelligencePage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [concepts, setConcepts] = useState<Record<string, Concept[]>>({});
  const [topPins, setTopPins] = useState<TopPin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: mods }, { data: cons }, { data: pins }] = await Promise.all([
        supabase.from("gpi_modules").select("*").order("category"),
        supabase.from("gpi_concepts").select("*").order("weight", { ascending: false }),
        supabase
          .from("gpi_performance")
          .select("pin_id, success_score, revenue_usd, saves, outbound_clicks, snapshot_date")
          .order("success_score", { ascending: false, nullsFirst: false })
          .limit(20),
      ]);
      const grouped: Record<string, Concept[]> = {};
      (cons ?? []).forEach((c: any) => {
        (grouped[c.module_key] = grouped[c.module_key] || []).push(c);
      });
      setModules((mods as Module[]) ?? []);
      setConcepts(grouped);
      setTopPins((pins as TopPin[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Pinterest Intelligence DNA…
      </div>
    );
  }

  const totalConcepts = modules.reduce((s, m) => s + m.concept_count, 0);
  const avgConf =
    modules.length > 0
      ? modules.reduce((s, m) => s + Number(m.avg_confidence ?? 0), 0) / modules.length
      : 0;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Genesis Pinterest Intelligence DNA</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Permanent intelligence layer · US/EN · consulted by every Pinterest engine before creation,
          scoring, scheduling and publishing.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">Modules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{modules.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">Concepts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalConcepts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">Avg Confidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(avgConf * 100).toFixed(0)}%</div>
            <Progress value={avgConf * 100} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-muted-foreground">Market</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">US · EN · USD</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={modules[0]?.key ?? "algorithm_factors"}>
        <TabsList className="flex-wrap h-auto">
          {modules.map((m) => (
            <TabsTrigger key={m.key} value={m.key} className="text-xs">
              {m.name}
              <Badge variant="secondary" className="ml-2">
                {m.concept_count}
              </Badge>
            </TabsTrigger>
          ))}
          <TabsTrigger value="__top_pins" className="text-xs">
            Top Pins
          </TabsTrigger>
        </TabsList>

        {modules.map((m) => (
          <TabsContent key={m.key} value={m.key} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{m.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{m.description}</p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {(concepts[m.key] ?? []).map((c) => (
                    <div
                      key={c.id}
                      className="rounded-md border border-border bg-card/50 p-3 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.name}</span>
                        <Badge variant="outline">v{c.version}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>
                          weight
                          <Progress value={Number(c.weight) * 100} className="h-1 mt-1" />
                        </div>
                        <div>
                          conf
                          <Progress value={Number(c.confidence) * 100} className="h-1 mt-1" />
                        </div>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        evidence: {c.evidence_count}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="__top_pins" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Pins by Success Score</CardTitle>
              <p className="text-sm text-muted-foreground">
                Weighted score blends CTR · Outbound CTR · Save rate · CVR · ROAS.
              </p>
            </CardHeader>
            <CardContent>
              {topPins.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No performance snapshots yet. Engines will populate via{" "}
                  <code>gpiApi.recordPerformance()</code>.
                </p>
              ) : (
                <div className="space-y-2">
                  {topPins.map((p) => (
                    <div
                      key={p.pin_id + p.snapshot_date}
                      className="flex items-center justify-between rounded-md border border-border bg-card/50 p-3 text-sm"
                    >
                      <div>
                        <div className="font-mono text-xs">{p.pin_id}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.snapshot_date} · saves {p.saves ?? 0} · outbound{" "}
                          {p.outbound_clicks ?? 0} · ${Number(p.revenue_usd ?? 0).toFixed(2)}
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {Number(p.success_score ?? 0).toFixed(1)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}