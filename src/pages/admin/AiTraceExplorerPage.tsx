import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Copy, Link as LinkIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type TraceRow = {
  id: string;
  trace_id: string;
  function_name: string;
  stage: string;
  status: string | null;
  product_slug: string | null;
  lane: string | null;
  model: string | null;
  cache_hit: boolean | null;
  credits_estimated: number | null;
  latency_ms: number | null;
  pin_queue_id: string | null;
  pre_evaluation_id: string | null;
  cache_key: string | null;
  lock_run_id: string | null;
  meta: any;
  created_at: string;
};

type Hotspot = {
  product_slug: string | null;
  function_name: string;
  lane: string | null;
  stage: string;
  status: string | null;
  events: number;
  cache_hits: number;
  cache_misses: number;
  failures: number;
  blocked: number;
  avg_latency_ms: number | null;
  credits_est_total: number | null;
  last_seen_at: string;
};

function statusBadge(status: string | null) {
  if (status === "fail") return <Badge variant="destructive">fail</Badge>;
  if (status === "blocked") return <Badge className="bg-amber-500 hover:bg-amber-500/90">blocked</Badge>;
  if (status === "skipped") return <Badge variant="outline">skipped</Badge>;
  return <Badge variant="secondary">ok</Badge>;
}

function fmt(ts: string) {
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export default function AiTraceExplorerPage() {
  const [rows, setRows] = useState<TraceRow[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState("");
  const [product, setProduct] = useState("");
  const [fn, setFn] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("ai_trace_events" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (trace.trim()) q = q.eq("trace_id", trace.trim());
    if (product.trim()) q = q.ilike("product_slug", `%${product.trim()}%`);
    if (fn.trim()) q = q.eq("function_name", fn.trim());
    const { data, error } = await q;
    if (error) toast({ title: "Failed to load traces", description: error.message, variant: "destructive" });
    setRows(((data as unknown) as TraceRow[]) || []);

    const { data: h } = await supabase
      .from("ai_trace_waste_hotspots_24h" as any)
      .select("*")
      .order("credits_est_total", { ascending: false })
      .limit(30);
    setHotspots(((h as unknown) as Hotspot[]) || []);
    setLoading(false);
  }, [trace, product, fn]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, TraceRow[]>();
    for (const r of rows) {
      const arr = map.get(r.trace_id) || [];
      arr.push(r);
      map.set(r.trace_id, arr);
    }
    return Array.from(map.entries()).map(([tid, items]) => ({
      trace_id: tid,
      items: items.sort((a, b) => a.created_at.localeCompare(b.created_at)),
      latest: items[0].created_at,
      product: items.find((i) => i.product_slug)?.product_slug ?? null,
      function_name: items[0].function_name,
      worst_status: items.some((i) => i.status === "fail")
        ? "fail"
        : items.some((i) => i.status === "blocked")
          ? "blocked"
          : "ok",
      credits: items.reduce((s, i) => s + (i.credits_estimated ?? 0), 0),
    })).sort((a, b) => b.latest.localeCompare(a.latest));
  }, [rows]);

  const copy = (v: string) => {
    navigator.clipboard?.writeText(v).then(
      () => toast({ title: "Copied", description: v.slice(0, 40) }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };

  return (
    <div className="container mx-auto px-3 py-4 pb-24 max-w-5xl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">AI Trace Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Every AI request is tied to its product, generation lock, and PRE outcome via a shared trace ID.
        </p>
      </header>

      <Card className="p-3 mb-4">
        <div className="text-sm font-medium mb-2">24h waste hotspots (top 30 by est. credits)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2">Product</th>
                <th className="py-1 pr-2">Function</th>
                <th className="py-1 pr-2">Lane</th>
                <th className="py-1 pr-2">Stage</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2 text-right">Events</th>
                <th className="py-1 pr-2 text-right">Hits</th>
                <th className="py-1 pr-2 text-right">Miss</th>
                <th className="py-1 pr-2 text-right">Fail</th>
                <th className="py-1 pr-2 text-right">Blocked</th>
                <th className="py-1 pr-2 text-right">Credits</th>
                <th className="py-1 pr-2 text-right">Avg ms</th>
              </tr>
            </thead>
            <tbody>
              {hotspots.length === 0 && (
                <tr><td colSpan={12} className="py-3 text-center text-muted-foreground">No trace events in the last 24h.</td></tr>
              )}
              {hotspots.map((h, idx) => (
                <tr key={idx} className="border-t border-border/50">
                  <td className="py-1 pr-2 font-mono">{h.product_slug ?? "—"}</td>
                  <td className="py-1 pr-2">{h.function_name}</td>
                  <td className="py-1 pr-2">{h.lane ?? "—"}</td>
                  <td className="py-1 pr-2">{h.stage}</td>
                  <td className="py-1 pr-2">{h.status ?? "—"}</td>
                  <td className="py-1 pr-2 text-right">{h.events}</td>
                  <td className="py-1 pr-2 text-right">{h.cache_hits}</td>
                  <td className="py-1 pr-2 text-right">{h.cache_misses}</td>
                  <td className="py-1 pr-2 text-right">{h.failures}</td>
                  <td className="py-1 pr-2 text-right">{h.blocked}</td>
                  <td className="py-1 pr-2 text-right">{h.credits_est_total ?? 0}</td>
                  <td className="py-1 pr-2 text-right">{h.avg_latency_ms ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4">
        <Input placeholder="Trace ID" value={trace} onChange={(e) => setTrace(e.target.value)} />
        <Input placeholder="Product slug" value={product} onChange={(e) => setProduct(e.target.value)} />
        <Input placeholder="Function name" value={fn} onChange={(e) => setFn(e.target.value)} />
        <Button onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No trace events match the current filters.</div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <Card key={g.trace_id} className="p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {statusBadge(g.worst_status)}
                <Badge variant="outline" className="text-xs">{g.function_name}</Badge>
                {g.product && <Badge variant="outline" className="text-xs font-mono">{g.product}</Badge>}
                <span className="text-xs text-muted-foreground">est. credits {g.credits.toFixed(2)}</span>
                <button
                  type="button"
                  onClick={() => copy(g.trace_id)}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground"
                >
                  <LinkIcon className="h-3 w-3" />
                  {g.trace_id.slice(0, 8)}…
                  <Copy className="h-3 w-3" />
                </button>
              </div>
              <ol className="space-y-1.5 border-l border-border pl-3">
                {g.items.map((r) => (
                  <li key={r.id} className="text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(r.status)}
                      <span className="text-muted-foreground">{fmt(r.created_at)}</span>
                      <span className="font-medium">{r.stage}</span>
                      {r.model && <span className="text-muted-foreground">· {r.model}</span>}
                      {r.lane && <span className="text-muted-foreground">· {r.lane}</span>}
                      {r.cache_hit !== null && (
                        <span className="text-muted-foreground">· cache {r.cache_hit ? "hit" : "miss"}</span>
                      )}
                      {r.latency_ms !== null && (
                        <span className="text-muted-foreground">· {r.latency_ms}ms</span>
                      )}
                      {r.credits_estimated !== null && (
                        <span className="text-muted-foreground">· ~{r.credits_estimated} credits</span>
                      )}
                    </div>
                    {(r.pin_queue_id || r.pre_evaluation_id || r.lock_run_id) && (
                      <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground font-mono flex-wrap">
                        {r.pin_queue_id && <span>pin:{r.pin_queue_id.slice(0, 8)}</span>}
                        {r.pre_evaluation_id && <span>pre:{r.pre_evaluation_id.slice(0, 8)}</span>}
                        {r.lock_run_id && <span>lock:{r.lock_run_id.slice(0, 8)}</span>}
                      </div>
                    )}
                    {r.meta && Object.keys(r.meta).length > 0 && (
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-[10px] leading-tight whitespace-pre-wrap break-words">
                        {JSON.stringify(r.meta, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}