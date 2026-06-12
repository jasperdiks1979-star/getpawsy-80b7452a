import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radio, ShieldX, CalendarClock, Layers } from "lucide-react";

type QueueRow = {
  id: string;
  status: string;
  scheduled_at: string | null;
  board_id: string | null;
  board_name: string | null;
  product_slug: string | null;
  product_name: string | null;
  pin_title: string | null;
  pinterest_pin_id: string | null;
  rejection_reason: string | null;
  approved_at: string | null;
  updated_at: string | null;
};

const REFRESH_MS = 10_000;
const REJECT_WINDOW_HOURS = 24;

export default function PinterestLiveCyclePage() {
  const [upcoming, setUpcoming] = useState<QueueRow[]>([]);
  const [rejected, setRejected] = useState<QueueRow[]>([]);
  const [publishedRecent, setPublishedRecent] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastTick, setLastTick] = useState<Date | null>(null);

  const load = async () => {
    const sinceIso = new Date(
      Date.now() - REJECT_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString();

    const cols =
      "id,status,scheduled_at,board_id,board_name,product_slug,product_name,pin_title,pinterest_pin_id,rejection_reason,approved_at,updated_at";

    const [u, r, p] = await Promise.all([
      (supabase as any)
        .from("pinterest_pin_queue")
        .select(cols)
        .in("status", ["queued", "publishing"])
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .limit(20),
      (supabase as any)
        .from("pinterest_pin_queue")
        .select(cols)
        .eq("status", "rejected")
        .gte("updated_at", sinceIso)
        .order("updated_at", { ascending: false })
        .limit(100),
      (supabase as any)
        .from("pinterest_pin_queue")
        .select(cols)
        .eq("status", "published")
        .gte("updated_at", sinceIso)
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    setUpcoming((u.data || []) as QueueRow[]);
    setRejected((r.data || []) as QueueRow[]);
    setPublishedRecent((p.data || []) as QueueRow[]);
    setLastTick(new Date());
    setLoading(false);
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => clearInterval(iv);
  }, []);

  // Per-board distribution across the upcoming 20
  const boardDist = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const r of upcoming) {
      const key = r.board_id || "unassigned";
      const name = r.board_name || (r.board_id ? r.board_id.slice(0, 8) : "Unassigned");
      const cur = map.get(key) || { name, count: 0 };
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [upcoming]);

  // Governor rejection breakdown (24h)
  const rejectionBuckets = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rejected) {
      const raw = (r.rejection_reason || "unknown").toLowerCase();
      let bucket = "other";
      if (raw.includes("banned") || raw.includes("phrase")) bucket = "banned_phrase";
      else if (raw.includes("slug") || raw.includes("8 active") || raw.includes("max_per_slug")) bucket = "slug_cap";
      else if (raw.includes("board") || raw.includes("max_per_board")) bucket = "board_cap";
      else if (raw.includes("headline") || raw.includes("overlay") || raw.includes("cta") || raw.includes("lookback") || raw.includes("repeat")) bucket = "copy_repeat";
      else if (raw.includes("governor")) bucket = "governor_other";
      map.set(bucket, (map.get(bucket) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rejected]);

  const distinctSlugs = new Set(upcoming.map((r) => r.product_slug).filter(Boolean)).size;
  const maxBoardShare = upcoming.length
    ? Math.max(...boardDist.map((b) => b.count)) / upcoming.length
    : 0;
  const diversityPct = boardDist.length
    ? Math.round((boardDist.length / Math.max(upcoming.length, 1)) * 100)
    : 0;

  return (
    <div className="p-6 space-y-4">
      <Helmet>
        <title>Pinterest Live Cycle — Admin</title>
      </Helmet>

      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Radio className="h-5 w-5 text-emerald-500 animate-pulse" />
            Pinterest Live Cycle
          </h1>
          <p className="text-sm text-muted-foreground">
            Next 20 pins, board distribution, and governor rejections — auto-refresh every 10s.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {lastTick ? `Updated ${lastTick.toLocaleTimeString()}` : "—"}
        </div>
      </header>

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading cycle…
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="In queue" value={upcoming.length} icon={<CalendarClock className="h-4 w-4" />} />
            <Kpi label="Distinct slugs" value={distinctSlugs} icon={<Layers className="h-4 w-4" />} />
            <Kpi label="Boards used" value={boardDist.length} />
            <Kpi
              label="Max board share"
              value={`${Math.round(maxBoardShare * 100)}%`}
              tone={maxBoardShare > 0.4 ? "warn" : "ok"}
            />
            <Kpi
              label="Rejections (24h)"
              value={rejected.length}
              icon={<ShieldX className="h-4 w-4" />}
              tone={rejected.length > 0 ? "warn" : "ok"}
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* Next 20 */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Next 20 in queue</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {upcoming.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">Queue is empty.</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left">
                        <tr>
                          <th className="p-2 w-32">Scheduled</th>
                          <th className="p-2">Title / Product</th>
                          <th className="p-2">Board</th>
                          <th className="p-2 w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcoming.map((r) => (
                          <tr key={r.id} className="border-t align-top">
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                              {r.scheduled_at
                                ? new Date(r.scheduled_at).toLocaleString([], {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "America/New_York",
                                  }) + " ET"
                                : "—"}
                            </td>
                            <td className="p-2">
                              <div className="line-clamp-1">{r.pin_title || r.product_name || "—"}</div>
                              <div className="text-[11px] text-muted-foreground font-mono line-clamp-1">
                                {r.product_slug || "—"}
                              </div>
                            </td>
                            <td className="p-2 text-xs">{r.board_name || (r.board_id ? r.board_id.slice(0, 8) : "—")}</td>
                            <td className="p-2">
                              <Badge variant={r.status === "publishing" ? "default" : "secondary"}>
                                {r.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Board distribution + rejections */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Board distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {boardDist.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No queued pins.</div>
                  ) : (
                    <ul className="space-y-2">
                      {boardDist.map((b) => {
                        const pct = Math.round((b.count / upcoming.length) * 100);
                        return (
                          <li key={b.id}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="truncate pr-2">{b.name}</span>
                              <span className="text-muted-foreground">
                                {b.count} · {pct}%
                              </span>
                            </div>
                            <div className="h-1.5 bg-muted rounded overflow-hidden">
                              <div
                                className={
                                  pct > 40
                                    ? "h-full bg-amber-500"
                                    : "h-full bg-emerald-500"
                                }
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    Diversity score: {diversityPct}% (boards / pins)
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldX className="h-4 w-4 text-destructive" /> Governor rejections (24h)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {rejectionBuckets.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No rejections — governor clean.</div>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {rejectionBuckets.map(([bucket, n]) => (
                        <li
                          key={bucket}
                          className="flex items-center justify-between border rounded px-2 py-1"
                        >
                          <span className="capitalize">{bucket.replace(/_/g, " ")}</span>
                          <Badge variant="outline">{n}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 text-[11px] text-muted-foreground">
                    Published in last 24h: {publishedRecent.length}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent rejection details */}
          {rejected.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recent rejections</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-72">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left sticky top-0">
                      <tr>
                        <th className="p-2 w-40">When</th>
                        <th className="p-2">Slug</th>
                        <th className="p-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejected.slice(0, 25).map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                            {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                          </td>
                          <td className="p-2 text-xs font-mono">{r.product_slug || "—"}</td>
                          <td className="p-2 text-xs">{r.rejection_reason || "unspecified"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone = "ok",
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: "ok" | "warn";
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </div>
        <div
          className={
            "text-xl font-semibold mt-0.5 " +
            (tone === "warn" ? "text-amber-600 dark:text-amber-400" : "")
          }
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}