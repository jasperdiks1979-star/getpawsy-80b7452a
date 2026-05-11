import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Copy, AlertTriangle, Info, AlertCircle, Link as LinkIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type LogRow = {
  id: string;
  function_name: string;
  trace_id: string;
  level: "info" | "warn" | "error" | string;
  message: string;
  payload: any | null;
  queue_id: string | null;
  asset_id: string | null;
  created_at: string;
};

const FN_OPTIONS = [
  { value: "all", label: "All functions" },
  { value: "pinterest-video-discovery", label: "Discovery" },
  { value: "pinterest-video-publisher", label: "Publisher" },
  { value: "pinterest-video-metrics-sync", label: "Metrics sync" },
] as const;

const LEVEL_OPTIONS = ["all", "info", "warn", "error"] as const;

function levelBadge(level: string) {
  if (level === "error") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />error</Badge>;
  if (level === "warn") return <Badge className="gap-1 bg-amber-500 hover:bg-amber-500/90"><AlertCircle className="h-3 w-3" />warn</Badge>;
  return <Badge variant="secondary" className="gap-1"><Info className="h-3 w-3" />info</Badge>;
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function PinterestVideoLogsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fn, setFn] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [trace, setTrace] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("pinterest_video_function_logs" as any)
      .select("id, function_name, trace_id, level, message, payload, queue_id, asset_id, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (fn !== "all") q = q.eq("function_name", fn);
    if (level !== "all") q = q.eq("level", level);
    if (trace.trim()) q = q.ilike("trace_id", `%${trace.trim()}%`);
    const { data, error } = await q;
    if (error) toast({ title: "Failed to load logs", description: error.message, variant: "destructive" });
    setRows(((data as unknown) as LogRow[]) || []);
    setLoading(false);
  }, [fn, level, trace]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const grouped = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const r of rows) {
      const arr = map.get(r.trace_id) || [];
      arr.push(r);
      map.set(r.trace_id, arr);
    }
    return Array.from(map.entries()).map(([tid, items]) => ({
      trace_id: tid,
      items: items.sort((a, b) => a.created_at.localeCompare(b.created_at)),
      latest: items[0].created_at,
      worst: items.some((i) => i.level === "error") ? "error" : items.some((i) => i.level === "warn") ? "warn" : "info",
      function_name: items[0].function_name,
    })).sort((a, b) => b.latest.localeCompare(a.latest));
  }, [rows]);

  const copyTrace = (tid: string) => {
    navigator.clipboard?.writeText(tid).then(
      () => toast({ title: "Trace ID copied", description: tid }),
      () => toast({ title: "Copy failed", variant: "destructive" }),
    );
  };

  return (
    <div className="container mx-auto px-3 py-4 pb-24 max-w-4xl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Pinterest Video Logs</h1>
        <p className="text-sm text-muted-foreground">Correlated diagnostics for discovery, publisher, and metrics-sync.</p>
      </header>

      <div className="flex flex-wrap gap-2 mb-3">
        {FN_OPTIONS.map((o) => (
          <Button key={o.value} size="sm" variant={fn === o.value ? "default" : "outline"} className="h-9" onClick={() => setFn(o.value)}>
            {o.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {LEVEL_OPTIONS.map((l) => (
          <Button key={l} size="sm" variant={level === l ? "default" : "outline"} className="h-8 text-xs" onClick={() => setLevel(l)}>
            {l}
          </Button>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input
          placeholder="Filter by trace ID…"
          value={trace}
          onChange={(e) => setTrace(e.target.value)}
          className="h-10"
        />
        <div className="flex gap-2">
          <Button onClick={load} disabled={loading} className="h-10 flex-1 sm:flex-none">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh
          </Button>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            onClick={() => setAutoRefresh((v) => !v)}
            className="h-10"
          >
            Live {autoRefresh ? "on" : "off"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No log entries match the current filters.</div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <Card key={g.trace_id} className="p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {levelBadge(g.worst)}
                <Badge variant="outline" className="text-xs">{g.function_name}</Badge>
                <button
                  type="button"
                  onClick={() => copyTrace(g.trace_id)}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground"
                  aria-label="Copy trace ID"
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
                      {levelBadge(r.level)}
                      <span className="text-muted-foreground">{fmtTime(r.created_at)}</span>
                      <span className="font-medium">{r.message}</span>
                    </div>
                    {r.payload && (
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-[10px] leading-tight whitespace-pre-wrap break-words">
                        {JSON.stringify(r.payload, null, 2)}
                      </pre>
                    )}
                    {(r.queue_id || r.asset_id) && (
                      <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground font-mono">
                        {r.queue_id && <span>queue:{r.queue_id.slice(0, 8)}</span>}
                        {r.asset_id && <span>asset:{r.asset_id.slice(0, 8)}</span>}
                      </div>
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