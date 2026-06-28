import { useEffect, useState } from "react";
import { GMD } from "@/lib/gmd/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Stats = {
  modules: Array<{ key: string; name: string; concept_count: number; avg_confidence: number; category: string }>;
  active_trend_count: number;
  hot_trends: Array<any> | null;
  opportunities: Array<any> | null;
  risks: Array<any> | null;
  categories: Array<{ key: string; name: string; growth: number; demand: number; competition: number; profitability: number }> | null;
  social_trends: Array<any> | null;
  assumptions: Array<any> | null;
};

export default function MarketIntelligenceDnaPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeModule, setActiveModule] = useState("");
  const [concepts, setConcepts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    GMD.stats().then((s: any) => { setStats(s); if (s?.modules?.[0]?.key) setActiveModule(s.modules[0].key); })
      .catch((e) => setErr(e?.message ?? String(e)));
  }, []);
  useEffect(() => {
    if (!activeModule) return;
    GMD.consult(activeModule, 50).then((r: any) => setConcepts(r?.concepts ?? []))
      .catch((e) => setErr(e?.message ?? String(e)));
  }, [activeModule]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Market Intelligence DNA</h1>
        <p className="text-muted-foreground">
          Permanent external awareness layer. Recommendations only — pricing, inventory, supplier and budget changes always require approval.
        </p>
      </div>

      {err && <Card><CardContent className="p-4 text-destructive">{err}</CardContent></Card>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-sm">Modules</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.modules?.length ?? "—"}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Active trends</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.active_trend_count ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Open opportunities</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.opportunities?.length ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Open risks</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{stats?.risks?.length ?? 0}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Search Market Knowledge</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. cat tree, fall, BFCM, refund risk" />
          <Button onClick={async () => {
            try { setSearchResults(await GMD.searchKnowledge(search)); } catch (e: any) { setErr(e?.message); }
          }}>Search</Button>
        </CardContent>
        {searchResults && (
          <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-semibold mb-1">Concepts</div>
              <ul className="space-y-1">{(searchResults.concepts ?? []).map((c: any) => (
                <li key={`${c.module_key}-${c.key}`} className="border-b py-1"><Badge variant="outline" className="mr-2">{c.module_key}</Badge>{c.name}</li>
              ))}</ul>
            </div>
            <div>
              <div className="font-semibold mb-1">Trends</div>
              <ul className="space-y-1">{(searchResults.trends ?? []).map((t: any) => (
                <li key={t.id} className="border-b py-1"><Badge className="mr-2">{t.trend_type}</Badge>{t.label}</li>
              ))}</ul>
            </div>
            <div>
              <div className="font-semibold mb-1">Opportunities</div>
              <ul className="space-y-1">{(searchResults.opportunities ?? []).map((o: any) => (
                <li key={o.id} className="border-b py-1"><Badge variant="secondary" className="mr-2">{o.opportunity_type}</Badge>{o.label}</li>
              ))}</ul>
            </div>
            <div>
              <div className="font-semibold mb-1">Search signals</div>
              <ul className="space-y-1">{(searchResults.search_signals ?? []).map((s: any, i: number) => (
                <li key={i} className="border-b py-1"><Badge variant="outline" className="mr-2">{s.source}</Badge>{s.query}</li>
              ))}</ul>
            </div>
          </CardContent>
        )}
      </Card>

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
        <Card><CardHeader><CardTitle>Trend radar</CardTitle></CardHeader><CardContent>
          {!stats?.hot_trends?.length && <p className="text-sm text-muted-foreground">No active trends.</p>}
          <ul className="space-y-1 text-sm">{stats?.hot_trends?.map((t: any) => (
            <li key={t.id} className="flex justify-between border-b py-1">
              <span><Badge className="mr-2">{t.trend_type}</Badge>{t.label} {t.category_key && <span className="text-muted-foreground">· {t.category_key}</span>}</span>
              <span>{Number(t.signal_strength).toFixed(2)}</span>
            </li>
          ))}</ul>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Category health</CardTitle></CardHeader><CardContent>
          {!stats?.categories?.length && <p className="text-sm text-muted-foreground">No category snapshots yet.</p>}
          <ul className="space-y-1 text-sm">{stats?.categories?.map((c) => (
            <li key={c.key} className="flex justify-between border-b py-1">
              <span>{c.name}</span>
              <span className="text-muted-foreground">growth {Number(c.growth ?? 0).toFixed(2)} · comp {Number(c.competition ?? 0).toFixed(2)}</span>
            </li>
          ))}</ul>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Opportunity queue</CardTitle></CardHeader><CardContent>
          {!stats?.opportunities?.length && <p className="text-sm text-muted-foreground">No opportunities.</p>}
          <ul className="space-y-2 text-sm">{stats?.opportunities?.map((o: any) => (
            <li key={o.id} className="border rounded p-2">
              <div className="flex justify-between"><Badge>{o.opportunity_type}</Badge><span className="text-xs text-muted-foreground">rank {Number(o.rank_score).toFixed(2)}</span></div>
              <div className="mt-1">{o.label}</div>
              {o.expected_revenue_usd != null && <div className="text-xs text-muted-foreground">Expected: ${Number(o.expected_revenue_usd).toLocaleString()}</div>}
            </li>
          ))}</ul>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Risk dashboard</CardTitle></CardHeader><CardContent>
          {!stats?.risks?.length && <p className="text-sm text-muted-foreground">No open risks.</p>}
          <ul className="space-y-2 text-sm">{stats?.risks?.map((r: any) => (
            <li key={r.id} className="border rounded p-2">
              <div className="flex justify-between"><Badge variant="destructive">{r.risk_type}</Badge>
                <span className="text-xs text-muted-foreground">p {Number(r.probability).toFixed(2)} × sev {Number(r.severity).toFixed(2)}</span></div>
              <div className="mt-1">{r.label}</div>
              {r.time_horizon_days != null && <div className="text-xs text-muted-foreground">Horizon: {r.time_horizon_days}d</div>}
            </li>
          ))}</ul>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Social/visual trends</CardTitle></CardHeader><CardContent>
          {!stats?.social_trends?.length && <p className="text-sm text-muted-foreground">No social trends yet.</p>}
          <ul className="space-y-1 text-sm">{stats?.social_trends?.map((t: any, i: number) => (
            <li key={i} className="flex justify-between border-b py-1">
              <span><Badge variant="outline" className="mr-2">{t.visual_type}</Badge>{t.trend_label}</span>
              <span>{Number(t.signal_strength).toFixed(2)}</span>
            </li>
          ))}</ul>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Active assumptions</CardTitle></CardHeader><CardContent>
          {!stats?.assumptions?.length && <p className="text-sm text-muted-foreground">No active assumptions.</p>}
          <ul className="space-y-1 text-sm">{stats?.assumptions?.map((a: any) => (
            <li key={a.id} className="border-b py-1">
              <div>{a.assumption}</div>
              <div className="text-xs text-muted-foreground">{a.module_key ?? "—"} · {new Date(a.created_at).toLocaleDateString()}</div>
            </li>
          ))}</ul>
        </CardContent></Card>
      </div>
    </div>
  );
}