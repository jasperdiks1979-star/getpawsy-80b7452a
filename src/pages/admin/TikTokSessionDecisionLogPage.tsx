import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, Search } from "lucide-react";

type Rule = "is_internal" | "country=NL" | "admin_route" | "bot_heuristic";

interface TimelineEvent {
  ts: string;
  event_id: string;
  activity_type: string | null;
  page_path: string | null;
  country: string | null;
  browser: string | null;
  device_type: string | null;
  screen: { w: number | null; h: number | null } | null;
  is_internal: boolean | null;
  utm_campaign: string | null;
  utm_content: string | null;
  triggered_rules: Rule[];
}

interface SessionDecision {
  session_id: string;
  first_seen: string;
  last_seen: string;
  event_count: number;
  is_excluded: boolean;
  session_rules: Rule[];
  last_hook: string | null;
  last_country: string | null;
  last_browser: string | null;
  last_device: string | null;
  rule_first_triggered: {
    is_internal: string | null;
    country_nl: string | null;
    admin_route: string | null;
    bot_heuristic: string | null;
  };
  timeline: TimelineEvent[];
}

interface RpcResponse {
  window_days: number;
  generated_at: string;
  session_count: number;
  sessions: SessionDecision[];
}

const RULE_COLORS: Record<Rule, string> = {
  is_internal: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  "country=NL": "bg-orange-500/15 text-orange-700 border-orange-500/30",
  admin_route: "bg-rose-500/15 text-rose-700 border-rose-500/30",
  bot_heuristic: "bg-violet-500/15 text-violet-700 border-violet-500/30",
};

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function TikTokSessionDecisionLogPage() {
  const [windowDays, setWindowDays] = useState(7);
  const [sessionFilter, setSessionFilter] = useState("");
  const [onlyExcluded, setOnlyExcluded] = useState(false);
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RpcResponse | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.rpc(
        "get_tiktok_session_decision_log" as never,
        {
          p_window_days: windowDays,
          p_session_id: sessionFilter.trim() || null,
          p_only_excluded: onlyExcluded,
          p_limit: limit,
        } as never
      );
      if (err) throw err;
      setData(res as unknown as RpcResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const sessions = data?.sessions ?? [];
    const total = sessions.length;
    const excluded = sessions.filter((s) => s.is_excluded).length;
    const byRule: Record<Rule, number> = {
      is_internal: 0,
      "country=NL": 0,
      admin_route: 0,
      bot_heuristic: 0,
    };
    for (const s of sessions) {
      for (const r of s.session_rules) byRule[r] = (byRule[r] ?? 0) + 1;
    }
    return { total, excluded, byRule };
  }, [data]);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">TikTok Session Decision Log</h1>
        <p className="text-sm text-muted-foreground">
          Per-session timeline of every filter decision (admin route, internal flag, country, bot heuristic) with timestamps. Use this to debug why specific datapoints are being excluded from TikTok performance reports.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-1">
            <Label htmlFor="window-days">Window (days)</Label>
            <Input
              id="window-days"
              type="number"
              min={1}
              max={90}
              value={windowDays}
              onChange={(e) => setWindowDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="session-filter">Session ID (optional)</Label>
            <Input
              id="session-filter"
              placeholder="exact session_id"
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="limit">Limit</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 100)))}
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch id="only-excluded" checked={onlyExcluded} onCheckedChange={setOnlyExcluded} />
              <Label htmlFor="only-excluded" className="cursor-pointer">Only excluded</Label>
            </div>
          </div>
          <div className="md:col-span-5 flex justify-end gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Reload
            </Button>
            <Button onClick={load} disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              Apply filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <SummaryCard label="Sessions" value={summary.total} />
        <SummaryCard label="Excluded" value={summary.excluded} />
        {(["is_internal", "country=NL", "admin_route", "bot_heuristic"] as Rule[]).map((r) => (
          <SummaryCard key={r} label={r} value={summary.byRule[r] ?? 0} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Sessions {data ? `(${data.session_count})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[640px]">
            <div className="divide-y">
              {(data?.sessions ?? []).map((s) => {
                const isOpen = openSession === s.session_id;
                return (
                  <div key={s.session_id} className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOpenSession(isOpen ? null : s.session_id)}
                      className="w-full text-left flex flex-wrap items-center gap-3"
                    >
                      <code className="text-xs font-mono truncate max-w-[260px]">{s.session_id}</code>
                      <Badge variant={s.is_excluded ? "destructive" : "secondary"}>
                        {s.is_excluded ? "excluded" : "kept"}
                      </Badge>
                      {s.session_rules.map((r) => (
                        <span
                          key={r}
                          className={`text-xs px-2 py-0.5 rounded border ${RULE_COLORS[r]}`}
                        >
                          {r}
                        </span>
                      ))}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {s.event_count} events · last {formatTs(s.last_seen)}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <Meta label="Hook" value={s.last_hook ?? "—"} />
                          <Meta label="Country" value={s.last_country ?? "—"} />
                          <Meta label="Browser" value={s.last_browser ?? "—"} />
                          <Meta label="Device" value={s.last_device ?? "—"} />
                          <Meta label="First internal" value={formatTs(s.rule_first_triggered.is_internal)} />
                          <Meta label="First NL" value={formatTs(s.rule_first_triggered.country_nl)} />
                          <Meta label="First admin" value={formatTs(s.rule_first_triggered.admin_route)} />
                          <Meta label="First bot" value={formatTs(s.rule_first_triggered.bot_heuristic)} />
                        </div>

                        <div className="rounded border bg-muted/30">
                          <div className="px-3 py-2 text-xs font-medium border-b">Timeline ({s.timeline.length})</div>
                          <div className="divide-y">
                            {s.timeline.map((ev) => (
                              <div key={ev.event_id} className="px-3 py-2 text-xs grid grid-cols-12 gap-2 items-start">
                                <div className="col-span-3 font-mono text-muted-foreground">{formatTs(ev.ts)}</div>
                                <div className="col-span-2">
                                  <Badge variant="outline" className="text-[10px]">{ev.activity_type ?? "—"}</Badge>
                                </div>
                                <div className="col-span-4 truncate" title={ev.page_path ?? ""}>
                                  {ev.page_path ?? "—"}
                                </div>
                                <div className="col-span-3 flex flex-wrap gap-1 justify-end">
                                  {ev.triggered_rules.length === 0 ? (
                                    <span className="text-muted-foreground">clean</span>
                                  ) : (
                                    ev.triggered_rules.map((r) => (
                                      <span
                                        key={r}
                                        className={`text-[10px] px-1.5 py-0.5 rounded border ${RULE_COLORS[r]}`}
                                      >
                                        {r}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!loading && (data?.sessions ?? []).length === 0 && (
                <div className="p-6 text-sm text-muted-foreground">No TikTok sessions matched the filters.</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-background px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono">{value}</div>
    </div>
  );
}