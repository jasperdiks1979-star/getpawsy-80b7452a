import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { gbd, type GbdModule } from "@/lib/gbd/client";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";

type FactRow = {
  topic: string;
  fact_key: string;
  value: unknown;
  confidence: number;
  version: number;
  updated_at: string;
};

export default function BusinessDnaPage() {
  const [modules, setModules] = useState<GbdModule[]>([]);
  const [selected, setSelected] = useState<string>("identity");
  const [facts, setFacts] = useState<Record<string, Record<string, FactRow>>>({});
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [learnings, setLearnings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const list = await gbd.listModules() as { ok: boolean; data: GbdModule[] };
      setModules(list.data ?? []);
      const { data: learn } = await supabase
        .from("gbd_learnings")
        .select("engine,decision_type,subject,why,confidence,created_at")
        .order("created_at", { ascending: false }).limit(15);
      setLearnings(learn ?? []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const r = await gbd.moduleStatus(selected) as { ok: boolean; data: { facts: Record<string, Record<string, FactRow>> } };
      setFacts(r.data.facts ?? {});
    })();
  }, [selected]);

  const overallCompleteness = useMemo(() => {
    if (!modules.length) return 0;
    return modules.reduce((a, m) => a + Number(m.completeness ?? 0), 0) / modules.length;
  }, [modules]);
  const overallConfidence = useMemo(() => {
    if (!modules.length) return 0;
    return modules.reduce((a, m) => a + Number(m.confidence ?? 0), 0) / modules.length;
  }, [modules]);

  async function runSearch() {
    const r = await gbd.search(search) as { ok: boolean; data: any[] };
    setResults(r.data ?? []);
  }

  return (
    <>
      <Helmet><title>Business DNA — Genesis</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="container mx-auto p-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Genesis Business DNA</h1>
          <p className="text-muted-foreground text-sm">Permanent intelligence layer consulted by every AI engine before strategic, creative, commercial or operational decisions.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardHeader><CardTitle className="text-sm">DNA Completeness</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold mb-2">{(overallCompleteness * 100).toFixed(0)}%</div><Progress value={overallCompleteness * 100} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Avg Confidence</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold mb-2">{(overallConfidence * 100).toFixed(0)}%</div><Progress value={overallConfidence * 100} /></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-sm">Modules Online</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-semibold">{modules.filter(m => m.is_active !== false).length} / {modules.length}</div></CardContent></Card>
        </div>

        <Tabs defaultValue="modules">
          <TabsList>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="search">Search Knowledge</TabsTrigger>
            <TabsTrigger value="learnings">Recent Learnings</TabsTrigger>
          </TabsList>

          <TabsContent value="modules" className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
            <Card><CardContent className="p-2">
              {loading ? <div className="p-4"><Loader2 className="animate-spin h-4 w-4" /></div> :
                modules.map(m => (
                  <button key={m.key} onClick={() => setSelected(m.key)}
                    className={`w-full text-left px-3 py-2 rounded-md hover:bg-muted ${selected === m.key ? "bg-muted" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{m.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{m.category}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">v{m.current_version} · {(Number(m.confidence) * 100).toFixed(0)}% conf</div>
                  </button>
                ))}
            </CardContent></Card>

            <Card><CardHeader><CardTitle className="text-base">{modules.find(m => m.key === selected)?.name ?? selected}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {Object.keys(facts).length === 0 && <p className="text-sm text-muted-foreground">No facts yet.</p>}
                {Object.entries(facts).map(([topic, keys]) => (
                  <div key={topic} className="border rounded-md">
                    <div className="px-3 py-2 bg-muted text-xs font-semibold uppercase tracking-wide">{topic}</div>
                    <div className="divide-y">
                      {Object.entries(keys).map(([k, row]) => (
                        <div key={k} className="px-3 py-2 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{k}</span>
                            <span className="text-muted-foreground">v{row.version} · {(row.confidence * 100).toFixed(0)}%</span>
                          </div>
                          <pre className="text-[11px] bg-background border rounded p-2 overflow-x-auto">{JSON.stringify(row.value, null, 2)}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent></Card>
          </TabsContent>

          <TabsContent value="search">
            <Card><CardContent className="p-4 space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Search knowledge (e.g. margin, US, charm)" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && runSearch()} />
                <button onClick={runSearch} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm">Search</button>
              </div>
              <div className="space-y-2">
                {results.map((r, i) => (
                  <div key={i} className="border rounded p-2 text-xs">
                    <div className="flex justify-between mb-1"><span className="font-medium">{r.module_key} · {r.topic} · {r.fact_key}</span><span className="text-muted-foreground">{(r.confidence * 100).toFixed(0)}%</span></div>
                    <pre className="text-[11px]">{JSON.stringify(r.value, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="learnings">
            <Card><CardContent className="p-4 space-y-2">
              {learnings.length === 0 && <p className="text-sm text-muted-foreground">No learnings recorded yet. Engines log here via <code>gbd.recordLearning()</code>.</p>}
              {learnings.map((l, i) => (
                <div key={i} className="border rounded p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{l.engine} · {l.decision_type}</span>
                    <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                  </div>
                  {l.subject && <div className="text-muted-foreground">{l.subject}</div>}
                  <div className="mt-1">{l.why}</div>
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}