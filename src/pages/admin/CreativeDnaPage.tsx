import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Dna } from "lucide-react";

interface Module {
  key: string; name: string; description: string | null; category: string;
  concept_count: number; avg_confidence: number;
}
interface Concept {
  id: string; module_key: string; key: string; name: string;
  weight: number; confidence: number; evidence_count: number; version: number;
}
interface Gene {
  id: string; family: string; gene_type: string; gene_value: string;
  weight: number; confidence: number; wins: number; losses: number;
}
interface TopCreative {
  creative_id: string; success_score: number | null; revenue_usd: number | null;
  saves: number | null; outbound_clicks: number | null; snapshot_date: string;
}

export default function CreativeDnaPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [concepts, setConcepts] = useState<Record<string, Concept[]>>({});
  const [genes, setGenes] = useState<Gene[]>([]);
  const [top, setTop] = useState<TopCreative[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: mods }, { data: cons }, { data: gs }, { data: tp }] = await Promise.all([
        supabase.from("gcd_modules").select("*").order("category"),
        supabase.from("gcd_concepts").select("*").order("weight", { ascending: false }),
        supabase.from("gcd_genes").select("*").order("weight", { ascending: false }).limit(80),
        supabase.from("gcd_performance")
          .select("creative_id,success_score,revenue_usd,saves,outbound_clicks,snapshot_date")
          .order("success_score", { ascending: false, nullsFirst: false }).limit(20),
      ]);
      const grouped: Record<string, Concept[]> = {};
      (cons ?? []).forEach((c: any) => { (grouped[c.module_key] ||= []).push(c); });
      setModules((mods as Module[]) ?? []);
      setConcepts(grouped);
      setGenes((gs as Gene[]) ?? []);
      setTop((tp as TopCreative[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Creative DNA…
      </div>
    );
  }

  const totalConcepts = modules.reduce((s, m) => s + m.concept_count, 0);
  const avgConf = modules.length
    ? modules.reduce((s, m) => s + Number(m.avg_confidence ?? 0), 0) / modules.length : 0;

  const genesByFamily: Record<string, Gene[]> = {};
  genes.forEach((g) => { (genesByFamily[g.family] ||= []).push(g); });

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Dna className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Genesis Creative DNA</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Permanent intelligence layer for every visual decision. Every creative engine consults this
          before generating, scoring or publishing.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Modules</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{modules.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Concepts</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalConcepts}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Genes</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{genes.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Avg Confidence</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{(avgConf * 100).toFixed(0)}%</div><Progress value={avgConf * 100} className="mt-2" /></CardContent></Card>
      </div>

      <Tabs defaultValue={modules[0]?.key ?? "creative_genome"}>
        <TabsList className="flex-wrap h-auto">
          {modules.map((m) => (
            <TabsTrigger key={m.key} value={m.key} className="text-xs">
              {m.name}<Badge variant="secondary" className="ml-2">{m.concept_count}</Badge>
            </TabsTrigger>
          ))}
          <TabsTrigger value="__genes" className="text-xs">Genes</TabsTrigger>
          <TabsTrigger value="__top" className="text-xs">Top Creatives</TabsTrigger>
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
                    <div key={c.id} className="rounded-md border border-border bg-card/50 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.name}</span>
                        <Badge variant="outline">v{c.version}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>weight<Progress value={Number(c.weight) * 100} className="h-1 mt-1" /></div>
                        <div>conf<Progress value={Number(c.confidence) * 100} className="h-1 mt-1" /></div>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">evidence: {c.evidence_count}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        <TabsContent value="__genes" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(genesByFamily).map(([family, list]) => (
              <Card key={family}>
                <CardHeader><CardTitle className="text-base capitalize">{family}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {list.map((g) => (
                      <div key={g.id} className="flex items-center justify-between rounded border border-border bg-card/50 px-3 py-2 text-xs">
                        <div>
                          <span className="font-mono">{g.gene_type}</span> · <span className="text-muted-foreground">{g.gene_value}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">W {g.wins}</Badge>
                          <Badge variant="secondary">{(Number(g.weight) * 100).toFixed(0)}%</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="__top" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Creatives by Success Score</CardTitle>
              <p className="text-sm text-muted-foreground">
                Weighted score blends CTR · Outbound · Save · ATC · CVR · ROAS.
              </p>
            </CardHeader>
            <CardContent>
              {top.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No performance snapshots yet. Engines record via <code>GCD.recordPerformance()</code>.
                </p>
              ) : (
                <div className="space-y-2">
                  {top.map((p) => (
                    <div key={p.creative_id + p.snapshot_date} className="flex items-center justify-between rounded-md border border-border bg-card/50 p-3 text-sm">
                      <div>
                        <div className="font-mono text-xs">{p.creative_id}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.snapshot_date} · saves {p.saves ?? 0} · outbound {p.outbound_clicks ?? 0} · ${Number(p.revenue_usd ?? 0).toFixed(2)}
                        </div>
                      </div>
                      <Badge variant="secondary">{Number(p.success_score ?? 0).toFixed(1)}</Badge>
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