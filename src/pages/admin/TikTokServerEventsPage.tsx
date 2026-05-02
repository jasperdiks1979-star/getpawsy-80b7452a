import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Row {
  id: string;
  created_at: string;
  event_name: string;
  event_id: string;
  pixel_id: string | null;
  status: string | null;
  response_status: number | null;
  tiktok_code: number | null;
  tiktok_message: string | null;
  error: string | null;
  payload: unknown;
  response_body: unknown;
}

interface Summary {
  status: string;
  count: number;
}

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  success: "default",
  http_error: "destructive",
  network_error: "destructive",
  config_error: "destructive",
  tiktok_error: "destructive",
};

export default function TikTokServerEventsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("tiktok_server_events")
      .select(
        "id, created_at, event_name, event_id, pixel_id, status, response_status, tiktok_code, tiktok_message, error, payload, response_body",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (!error && data) setRows(data as unknown as Row[]);

    // Last-24h status summary.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: agg } = await supabase
      .from("tiktok_server_events")
      .select("status")
      .gte("created_at", since);
    if (agg) {
      const counts = new Map<string, number>();
      for (const r of agg as { status: string | null }[]) {
        const k = r.status ?? "unknown";
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      setSummary(
        Array.from(counts.entries()).map(([status, count]) => ({ status, count })),
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="container mx-auto py-8 max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">TikTok Server-Side Events Log</h1>
        <p className="text-muted-foreground text-sm">
          Each row is one Events API dispatch. Use the status to find drop-offs:
          <code className="ml-1">success</code>,{" "}
          <code>http_error</code>, <code>network_error</code>,{" "}
          <code>tiktok_error</code> (HTTP 200 but TikTok rejected),{" "}
          <code>config_error</code> (token / pixel id missing).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 24h status breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {summary.length === 0 && (
            <p className="text-sm text-muted-foreground">No events in the last 24h.</p>
          )}
          {summary.map((s) => (
            <Badge key={s.status} variant={STATUS_VARIANT[s.status] ?? "secondary"}>
              {s.status}: {s.count}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">success</SelectItem>
            <SelectItem value="http_error">http_error</SelectItem>
            <SelectItem value="network_error">network_error</SelectItem>
            <SelectItem value="tiktok_error">tiktok_error</SelectItem>
            <SelectItem value="config_error">config_error</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">No events yet for this filter.</p>
        )}
        {rows.map((r) => {
          const isOpen = expanded === r.id;
          return (
            <div key={r.id} className="rounded-lg border bg-card">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : r.id)}
                className="w-full p-3 text-left flex items-center gap-3 flex-wrap"
              >
                <Badge variant={STATUS_VARIANT[r.status ?? ""] ?? "secondary"}>
                  {r.status ?? "unknown"}
                </Badge>
                <span className="font-mono font-semibold">{r.event_name}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  HTTP {r.response_status ?? "—"}
                </span>
                {r.tiktok_code !== null && (
                  <span className="text-xs font-mono">
                    code={r.tiktok_code}
                  </span>
                )}
                {r.tiktok_message && (
                  <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                    {r.tiktok_message}
                  </span>
                )}
                {r.error && (
                  <span className="text-xs text-destructive truncate max-w-[280px]">
                    {r.error}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold mb-1">Payload sent</p>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto max-h-72">
                      {JSON.stringify(r.payload, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-1">TikTok response</p>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto max-h-72">
                      {JSON.stringify(r.response_body, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
