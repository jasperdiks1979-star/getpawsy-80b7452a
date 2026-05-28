import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, RefreshCw, ShieldAlert } from "lucide-react";

/**
 * Bot-filtered traffic drilldown.
 *
 * Surfaces sessions flagged by the client-side bot classifier
 * (`src/lib/botDetection.ts`) and writes to `lp_funnel_events`
 * (is_bot / bot_reason / traffic_quality_score). Lets the operator
 * confirm bot filtering is working and inspect example flagged
 * sessions with their funnel step counts before automated
 * decisions (autopilot, AI Revenue) consume the data.
 */

type RangeOpt = "1h" | "24h" | "7d" | "30d";
type Mode = "bots" | "low_quality" | "clean";

type Row = {
  session_id: string;
  event_name: string | null;
  is_bot: boolean | null;
  bot_reason: string | null;
  traffic_quality_score: number | null;
  utm_source: string | null;
  page_path: string | null;
  created_at: string;
};

type SessionAgg = {
  session_id: string;
  events: number;
  first_seen: string;
  last_seen: string;
  bot_reasons: string[];
  min_score: number | null;
  utm_source: string | null;
  pages: string[];
  step_counts: Record<string, number>;
};

const RANGE_HOURS: Record<RangeOpt, number> = { "1h": 1, "24h": 24, "7d": 168, "30d": 720 };

const FUNNEL_STEPS = [
  "lp_view",
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "purchase",
] as const;

function sinceFor(r: RangeOpt): string {
  return new Date(Date.now() - RANGE_HOURS[r] * 3600_000).toISOString();
}

export default function BotTrafficDrilldownPage() {
  const [range, setRange] = useState<RangeOpt>("24h");
  const [mode, setMode] = useState<Mode>("bots");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalSessions, setTotalSessions] = useState(0);
  const [cleanSessions, setCleanSessions] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const since = sinceFor(range);
      let q = supabase
        .from("lp_funnel_events")
        .select(
          "session_id, event_name, is_bot, bot_reason, traffic_quality_score, utm_source, page_path, created_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (mode === "bots") q = q.eq("is_bot", true);
      else if (mode === "low_quality") q = q.lt("traffic_quality_score", 50).or("is_bot.is.null,is_bot.eq.false");
      else q = q.or("is_bot.is.null,is_bot.eq.false").gte("traffic_quality_score", 50);

      const [{ data }, totals] = await Promise.all([
        q,
        loadTotals(since),
      ]);
      setRows((data as Row[]) || []);
      setTotalSessions(totals.total);
      setCleanSessions(totals.clean);
    } finally {
      setLoading(false);
    }
  };

  const loadTotals = async (since: string) => {
    const { data } = await supabase
      .from("lp_funnel_events")
      .select("session_id, is_bot, traffic_quality_score")
      .gte("created_at", since)
      .limit(20000);
    const sessions = new Map<string, { bot: boolean; score: number }>();
    for (const r of (data as any[]) || []) {
      const cur = sessions.get(r.session_id);
      const bot = r.is_bot === true || (typeof r.traffic_quality_score === "number" && r.traffic_quality_score < 50);
      const score = typeof r.traffic_quality_score === "number" ? r.traffic_quality_score : 100;
      if (!cur) sessions.set(r.session_id, { bot, score });
      else sessions.set(r.session_id, { bot: cur.bot || bot, score: Math.min(cur.score, score) });
    }
    let clean = 0;
    sessions.forEach((v) => { if (!v.bot) clean++; });
    return { total: sessions.size, clean };
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [range, mode]);

  const sessions = useMemo<SessionAgg[]>(() => {
    const map = new Map<string, SessionAgg>();
    for (const r of rows) {
      const sid = r.session_id;
      let s = map.get(sid);
      if (!s) {
        s = {
          session_id: sid,
          events: 0,
          first_seen: r.created_at,
          last_seen: r.created_at,
          bot_reasons: [],
          min_score: r.traffic_quality_score,
          utm_source: r.utm_source,
          pages: [],
          step_counts: {},
        };
        map.set(sid, s);
      }
      s.events++;
      if (r.created_at < s.first_seen) s.first_seen = r.created_at;
      if (r.created_at > s.last_seen) s.last_seen = r.created_at;
      if (r.bot_reason && !s.bot_reasons.includes(r.bot_reason)) s.bot_reasons.push(r.bot_reason);
      if (typeof r.traffic_quality_score === "number") {
        s.min_score = s.min_score == null ? r.traffic_quality_score : Math.min(s.min_score, r.traffic_quality_score);
      }
      if (r.utm_source && !s.utm_source) s.utm_source = r.utm_source;
      if (r.page_path && !s.pages.includes(r.page_path) && s.pages.length < 4) s.pages.push(r.page_path);
      if (r.event_name) s.step_counts[r.event_name] = (s.step_counts[r.event_name] || 0) + 1;
    }
    return Array.from(map.values()).sort((a, b) => b.events - a.events);
  }, [rows]);

  const reasonCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) {
      const key = s.bot_reasons.length ? s.bot_reasons.join(",") : "(no reason)";
      // split each individual reason token for clarity
      const tokens = key === "(no reason)" ? ["(no reason)"] : key.split(",").map((t) => t.trim()).filter(Boolean);
      for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  const stepTotals = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const s of sessions) {
      for (const step of FUNNEL_STEPS) acc[step] = (acc[step] || 0) + (s.step_counts[step] || 0);
    }
    return acc;
  }, [sessions]);

  const botShare = totalSessions > 0 ? ((totalSessions - cleanSessions) / totalSessions) * 100 : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold">Bot traffic drilldown</h1>
            <p className="text-sm text-muted-foreground">
              Sessions flagged by the client-side bot classifier with their funnel step counts.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-2 py-1 text-sm bg-background"
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="bots">Bots (is_bot)</option>
            <option value="low_quality">Low quality (&lt;50, not flagged)</option>
            <option value="clean">Clean (≥50)</option>
          </select>
          <select
            className="border rounded px-2 py-1 text-sm bg-background"
            value={range}
            onChange={(e) => setRange(e.target.value as RangeOpt)}
          >
            <option value="1h">Last 1h</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total sessions ({range})</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalSessions}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Bot / low-quality share</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{botShare.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">{totalSessions - cleanSessions} of {totalSessions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Sessions in view</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{sessions.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Events in view</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{rows.length}</div></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Top flag reasons</CardTitle></CardHeader>
          <CardContent>
            {reasonCounts.length === 0 && <p className="text-sm text-muted-foreground">No flagged sessions in this window.</p>}
            <div className="space-y-2">
              {reasonCounts.slice(0, 15).map(([reason, n]) => (
                <div key={reason} className="flex items-center justify-between border rounded px-3 py-1.5">
                  <code className="text-xs">{reason}</code>
                  <Badge variant="secondary">{n}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Funnel step events ({mode})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {FUNNEL_STEPS.map((step) => (
                <div key={step} className="flex items-center justify-between border rounded px-3 py-1.5">
                  <span className="text-sm font-mono">{step}</span>
                  <Badge variant={step === "purchase" && (stepTotals[step] || 0) > 0 && mode === "bots" ? "destructive" : "outline"}>
                    {stepTotals[step] || 0}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {mode === "bots"
                ? "If 'purchase' is &gt;0 here, real humans are being misclassified — review the flag reasons."
                : mode === "low_quality"
                ? "Borderline sessions (score &lt;50 but is_bot not set). Inspect before tightening the threshold."
                : "Baseline funnel counts for clean human traffic only."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Example sessions (top {Math.min(sessions.length, 50)} by event volume)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Session</th>
                  <th className="py-2 pr-3">Events</th>
                  <th className="py-2 pr-3">Score</th>
                  <th className="py-2 pr-3">Reasons</th>
                  <th className="py-2 pr-3">UTM</th>
                  {FUNNEL_STEPS.map((s) => (
                    <th key={s} className="py-2 pr-3 text-xs">{s}</th>
                  ))}
                  <th className="py-2 pr-3">Pages</th>
                  <th className="py-2 pr-3">First → Last</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 50).map((s) => (
                  <tr key={s.session_id} className="border-b align-top">
                    <td className="py-2 pr-3 font-mono text-xs max-w-[180px] truncate" title={s.session_id}>{s.session_id}</td>
                    <td className="py-2 pr-3"><Badge>{s.events}</Badge></td>
                    <td className="py-2 pr-3">{s.min_score ?? "—"}</td>
                    <td className="py-2 pr-3 max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {s.bot_reasons.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                        {s.bot_reasons.flatMap((r) => r.split(",")).slice(0, 4).map((r, i) => (
                          <Badge key={`${s.session_id}-${i}`} variant="outline" className="text-xs">{r.trim()}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs">{s.utm_source || "—"}</td>
                    {FUNNEL_STEPS.map((step) => (
                      <td key={step} className="py-2 pr-3 text-center">
                        {s.step_counts[step] ? (
                          <Badge variant={step === "purchase" ? "destructive" : "secondary"} className="text-xs">
                            {s.step_counts[step]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">·</span>
                        )}
                      </td>
                    ))}
                    <td className="py-2 pr-3 max-w-[220px] text-xs">
                      <div className="truncate" title={s.pages.join("\n")}>{s.pages.join(", ") || "—"}</div>
                    </td>
                    <td className="py-2 pr-3 text-xs whitespace-nowrap">
                      {new Date(s.first_seen).toLocaleTimeString()} → {new Date(s.last_seen).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr><td colSpan={6 + FUNNEL_STEPS.length + 2} className="py-6 text-center text-muted-foreground">No sessions matching this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Data source: <code>lp_funnel_events</code> (client-side classifier in <code>src/lib/botDetection.ts</code>).
        Pairs with the server-side quarantine view at{" "}
        <Link className="underline" to="/admin/rejected-spam">Rejected spam events</Link>.
      </p>
    </div>
  );
}