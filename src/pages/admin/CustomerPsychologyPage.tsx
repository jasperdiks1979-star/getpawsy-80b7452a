import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Brain } from "lucide-react";

interface GcpModule {
  key: string;
  name: string;
  description: string | null;
  category: string;
  concept_count: number;
  avg_confidence: number;
}

interface GcpConcept {
  id: string;
  module_key: string;
  key: string;
  name: string;
  weight: number;
  confidence: number;
  evidence_count: number;
  version: number;
}

export default function CustomerPsychologyPage() {
  const [modules, setModules] = useState<GcpModule[]>([]);
  const [concepts, setConcepts] = useState<Record<string, GcpConcept[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: mods } = await supabase
        .from("gcp_modules")
        .select("*")
        .order("category", { ascending: true });
      const { data: cons } = await supabase
        .from("gcp_concepts")
        .select("*")
        .order("weight", { ascending: false });
      const grouped: Record<string, GcpConcept[]> = {};
      (cons ?? []).forEach((c: any) => {
        (grouped[c.module_key] = grouped[c.module_key] || []).push(c);
      });
      setModules((mods as GcpModule[]) ?? []);
      setConcepts(grouped);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading Customer Psychology DNA…
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
          <Brain className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Genesis Customer Psychology DNA</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Permanent behavioral intelligence layer · US pet market · consulted by every AI engine.
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
            <CardTitle className="text-xs uppercase text-muted-foreground">Primary Market</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">United States</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={modules[0]?.key ?? "emotional_drivers"}>
        <TabsList className="flex-wrap h-auto">
          {modules.map((m) => (
            <TabsTrigger key={m.key} value={m.key} className="text-xs">
              {m.name}
              <Badge variant="secondary" className="ml-2">
                {m.concept_count}
              </Badge>
            </TabsTrigger>
          ))}
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
      </Tabs>
    </div>
  );
}