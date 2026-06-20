import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, RefreshCw, Loader2, AlertTriangle, ArrowRightLeft, Globe } from "lucide-react";
import { toast } from "sonner";

type Dash = {
  ok: boolean;
  kpis?: { protected: number; inRecovery: number; swaps24h: number; alertsOpen: number; candidatesPending: number };
  winners?: any[];
  candidates?: any[];
  swaps?: any[];
  runs?: any[];
  alerts?: any[];
  products?: Record<string, any>;
};

export default function ProductRecoveryEnginePanel() {
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("recovery-engine-dashboard");
      if (error) throw error;
      setData(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); const t = setInterval(load, 5 * 60 * 1000); return () => clearInterval(t); }, []);

  async function call(fn: string, body?: any, label = fn) {
    setRunning(label);
    try {
      const { data: res, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      toast.success(`${label} ok`, { description: JSON.stringify(res).slice(0, 160) });
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? `${label} failed`);
    } finally {
      setRunning(null);
    }
  }

  const products = data?.products ?? {};
  const pname = (id: string) => products[id]?.name ?? id.slice(0, 8);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Global Product Recovery Engine
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => call("winner-product-refresh", {}, "Refresh winners")} disabled={!!running}>
            {running === "Refresh winners" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Winners
          </Button>
          <Button size="sm" variant="outline" onClick={() => call("recovery-engine-tick", {}, "Run recovery")} disabled={!!running}>
            {running === "Run recovery" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />} Recover now
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {[
                ["Protected", data?.kpis?.protected ?? 0],
                ["In recovery", data?.kpis?.inRecovery ?? 0],
                ["Swaps 24h", data?.kpis?.swaps24h ?? 0],
                ["Candidates", data?.kpis?.candidatesPending ?? 0],
                ["Alerts", data?.kpis?.alertsOpen ?? 0],
              ].map(([label, v]) => (
                <div key={label as string} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-2xl font-semibold">{String(v)}</div>
                </div>
              ))}
            </div>

            <Tabs defaultValue="winners">
              <TabsList>
                <TabsTrigger value="winners">Winners</TabsTrigger>
                <TabsTrigger value="candidates">Supplier candidates</TabsTrigger>
                <TabsTrigger value="swaps">Swaps</TabsTrigger>
                <TabsTrigger value="runs">Runs</TabsTrigger>
                <TabsTrigger value="alerts">Alerts</TabsTrigger>
              </TabsList>

              <TabsContent value="winners" className="space-y-1">
                {(data?.winners ?? []).map((w: any) => {
                  const p = products[w.product_id] ?? {};
                  const stock = p.effective_stock ?? 0;
                  return (
                    <div key={w.product_id} className="flex items-center justify-between border-b py-2 text-sm">
                      <div>
                        <div className="font-medium">{p.name ?? w.product_id.slice(0, 8)}</div>
                        <div className="text-xs text-muted-foreground">
                          score {w.score} · niche {w.niche ?? "—"} · stock {stock}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {stock === 0 && <Badge variant="destructive">OOS</Badge>}
                        {w.is_protected && <Badge>Protected</Badge>}
                        <Button size="sm" variant="ghost"
                          onClick={() => call("product-global-audit", { productId: w.product_id }, `Audit ${pname(w.product_id)}`)}
                          disabled={!!running}>Audit</Button>
                        <Button size="sm" variant="ghost"
                          onClick={() => call("supplier-discovery", { productId: w.product_id }, `Discover ${pname(w.product_id)}`)}
                          disabled={!!running}>Discover</Button>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="candidates" className="space-y-1">
                {(data?.candidates ?? []).map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between border-b py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{c.title || c.supplier_product_id}</div>
                      <div className="text-xs text-muted-foreground">
                        for {pname(c.product_id)} · match {c.match_score}% · qty {c.global_qty} · {c.status}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" disabled={!!running || c.match_score < 70 || c.global_qty <= 0}
                      onClick={() => call("supplier-swap", { productId: c.product_id, candidateId: c.id, reason: "manual_promote" }, `Swap ${pname(c.product_id)}`)}>
                      <ArrowRightLeft className="h-3 w-3" /> Promote
                    </Button>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="swaps" className="space-y-1">
                {(data?.swaps ?? []).map((s: any) => (
                  <div key={s.id} className="border-b py-2 text-sm">
                    <div className="font-medium">{pname(s.product_id)} — {s.reason}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.executed_at).toLocaleString()} · {s.from_snapshot?.cj_product_id} → {s.to_snapshot?.cj_product_id}
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="runs" className="space-y-1">
                {(data?.runs ?? []).map((r: any) => (
                  <div key={r.id} className="border-b py-2 text-sm">
                    <div>{new Date(r.started_at).toLocaleString()} · scanned {r.scanned} · swapped {r.swapped} · replaced {r.replaced} · deactivated {r.deactivated}</div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="alerts" className="space-y-1">
                {(data?.alerts ?? []).length === 0 && (
                  <div className="text-sm text-muted-foreground">No open recovery alerts.</div>
                )}
                {(data?.alerts ?? []).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2 border-b py-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <div className="flex-1">{a.title}</div>
                    <Badge variant="destructive">{a.severity}</Badge>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
}