import { useEffect, useState } from "react";
import { GPD } from "@/lib/gpd/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Stats = {
  modules: Array<{ key: string; name: string; concept_count: number; avg_confidence: number; category: string }>;
  product_count: number;
  top_health: Array<{ product_id: string; overall_score: number; snapshot_date: string }> | null;
  open_opportunities: Array<{ id: string; opportunity_type: string; recommendation: string; priority: number; expected_revenue_gain_usd: number }> | null;
  bundles: Array<{ id: string; primary_product_id: string; bundle_type: string; expected_profit_lift: number }> | null;
  discoveries: Array<{ id: string; discovery_type: string; label: string; score: number }> | null;
};

export default function ProductIntelligenceDnaPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [activeModule, setActiveModule] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    GPD.stats()
      .then((s: any) => {
        setStats(s);
        if (s?.modules?.[0]?.key) setActiveModule(s.modules[0].key);
      })
      .catch((e) => setErr(e?.message ?? String(e)));
  }, []);

  useEffect(() => {
    if (!activeModule) return;
    GPD.consult(activeModule, 50)
      .then((r: any) => setConcepts(r?.concepts ?? []))
      .catch((e) => setErr(e?.message ?? String(e)));
  }, [activeModule]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Product Intelligence DNA</h1>
        <p className="text-muted-foreground">
          Permanent commercial intelligence layer. Every product becomes a living, versioned, evidence-driven business entity.
        </p>
      </div>

      {err && <Card><CardContent className="p-4 text-destructive">{err}</CardContent></Card>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">Modules</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.modules?.length ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Products tracked</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.product_count ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Open opportunities</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.open_opportunities?.length ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Proposed bundles</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.bundles?.length ?? 0}</CardContent></Card>
      </div>

      <Tabs value={activeModule} onValueChange={setActiveModule}>
        <TabsList className="flex flex-wrap h-auto">
          {stats?.modules?.map((m) => (
            <TabsTrigger key={m.key} value={m.key} className="capitalize">
              {m.name} <Badge variant="secondary" className="ml-2">{m.concept_count}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
        {stats?.modules?.map((m) => (
          <TabsContent key={m.key} value={m.key}>
            <Card>
              <CardHeader>
                <CardTitle>{m.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Category: {m.category} • Avg confidence: {(Number(m.avg_confidence) * 100).toFixed(0)}%
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {concepts.length === 0 && <p className="text-sm text-muted-foreground">No concepts yet.</p>}
                  {concepts.map((c) => (
                    <div key={c.id} className="border rounded p-3">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <div className="font-medium">{c.name}</div>
                          {c.description && <div className="text-sm text-muted-foreground">{c.description}</div>}
                          {c.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {c.tags.map((t: string) => <Badge key={t} variant="outline">{t}</Badge>)}
                            </div>
                          )}
                        </div>
                        <div className="text-right text-xs whitespace-nowrap">
                          <div>weight {(Number(c.weight) * 100).toFixed(0)}%</div>
                          <div className="text-muted-foreground">conf {(Number(c.confidence) * 100).toFixed(0)}%</div>
                          <div className="text-muted-foreground">v{c.version}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top product health</CardTitle></CardHeader>
          <CardContent>
            {!stats?.top_health?.length && <p className="text-sm text-muted-foreground">No health snapshots yet.</p>}
            <ul className="space-y-1 text-sm">
              {stats?.top_health?.map((h) => (
                <li key={h.product_id} className="flex justify-between border-b py-1">
                  <span className="font-mono text-xs truncate max-w-[60%]">{h.product_id}</span>
                  <span>{Number(h.overall_score).toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Opportunity queue</CardTitle></CardHeader>
          <CardContent>
            {!stats?.open_opportunities?.length && <p className="text-sm text-muted-foreground">No opportunities yet.</p>}
            <ul className="space-y-2 text-sm">
              {stats?.open_opportunities?.map((o) => (
                <li key={o.id} className="border rounded p-2">
                  <div className="flex justify-between">
                    <Badge>{o.opportunity_type}</Badge>
                    <span className="text-xs text-muted-foreground">priority {Number(o.priority).toFixed(2)}</span>
                  </div>
                  <div className="mt-1">{o.recommendation}</div>
                  {o.expected_revenue_gain_usd != null && (
                    <div className="text-xs text-muted-foreground">Expected gain: ${Number(o.expected_revenue_gain_usd).toLocaleString()}</div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Proposed bundles</CardTitle></CardHeader>
          <CardContent>
            {!stats?.bundles?.length && <p className="text-sm text-muted-foreground">No bundles proposed yet.</p>}
            <ul className="space-y-1 text-sm">
              {stats?.bundles?.map((b) => (
                <li key={b.id} className="flex justify-between border-b py-1">
                  <span className="font-mono text-xs truncate max-w-[60%]">{b.primary_product_id}</span>
                  <span>+${Number(b.expected_profit_lift ?? 0).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Discovery queue</CardTitle></CardHeader>
          <CardContent>
            {!stats?.discoveries?.length && <p className="text-sm text-muted-foreground">No discoveries yet.</p>}
            <ul className="space-y-1 text-sm">
              {stats?.discoveries?.map((d) => (
                <li key={d.id} className="flex justify-between border-b py-1">
                  <span><Badge variant="outline" className="mr-2">{d.discovery_type}</Badge>{d.label}</span>
                  <span>{Number(d.score).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}