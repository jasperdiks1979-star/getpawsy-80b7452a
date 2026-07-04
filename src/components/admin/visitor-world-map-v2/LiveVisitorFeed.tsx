import { useMemo } from "react";
import type { LiveVisitorActivityRow } from "@/lib/liveVisitorTimeline";

export interface LiveVisitorFeedProps {
  rows: LiveVisitorActivityRow[];
  selectedSessionId?: string | null;
  onSelect: (sessionId: string) => void;
  maxRows?: number;
}

interface Row {
  session_id: string;
  country: string | null;
  city: string | null;
  page_path: string | null;
  activity_type: string;
  last_seen_at: string;
}

function dedupe(rows: LiveVisitorActivityRow[], max: number): Row[] {
  const bySession = new Map<string, LiveVisitorActivityRow>();
  for (const r of rows) {
    const existing = bySession.get(r.session_id);
    const t = new Date(r.last_seen_at || r.created_at).getTime();
    const existingT = existing ? new Date(existing.last_seen_at || existing.created_at).getTime() : -1;
    if (!existing || t > existingT) bySession.set(r.session_id, r);
  }
  return Array.from(bySession.values())
    .sort(
      (a, b) =>
        new Date(b.last_seen_at || b.created_at).getTime() -
        new Date(a.last_seen_at || a.created_at).getTime(),
    )
    .slice(0, max)
    .map((r) => ({
      session_id: r.session_id,
      country: r.country ?? null,
      city: r.city ?? null,
      page_path: r.page_path ?? null,
      activity_type: (r.activity_type ?? "browsing").toLowerCase(),
      last_seen_at: r.last_seen_at || r.created_at,
    }));
}

function ageLabel(iso: string, nowMs: number = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m`;
}

function activityColor(t: string): string {
  if (t === "purchase") return "bg-emerald-500";
  if (t === "begin_checkout" || t === "checkout") return "bg-blue-500";
  if (t === "add_to_cart" || t === "view_cart") return "bg-amber-500";
  return "bg-zinc-400";
}

/**
 * Compact live visitor feed. Virtualization is intentionally naive (top-N
 * slice) — hundreds of concurrent visitors are supported without a windowed
 * list because rows are cheap and the feed caps at `maxRows`.
 */
export function LiveVisitorFeed({ rows, selectedSessionId, onSelect, maxRows = 100 }: LiveVisitorFeedProps) {
  const items = useMemo(() => dedupe(rows, maxRows), [rows, maxRows]);

  return (
    <div data-testid="live-visitor-feed" className="flex h-full min-h-[400px] flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide">
          Live visitors
        </div>
        <span className="text-[10px] text-muted-foreground">{items.length} active</span>
      </div>
      <ul role="list" className="max-h-[540px] overflow-y-auto">
        {items.length === 0 && (
          <li className="p-3 text-xs text-muted-foreground">No live visitors right now.</li>
        )}
        {items.map((r) => {
          const selected = r.session_id === selectedSessionId;
          return (
            <li key={r.session_id}>
              <button
                type="button"
                onClick={() => onSelect(r.session_id)}
                data-testid={`live-visitor-row-${r.session_id}`}
                aria-pressed={selected}
                className={`flex w-full items-start gap-2 border-b px-3 py-2 text-left text-xs transition ${
                  selected ? "bg-accent/60" : "hover:bg-accent/30"
                }`}
              >
                <span
                  className={`mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full ${activityColor(r.activity_type)}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">
                      {r.city || r.country || "Unknown"}
                      {r.city && r.country ? `, ${r.country}` : ""}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{ageLabel(r.last_seen_at)}</span>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {r.page_path || "—"}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        Presence only. Not counted in canonical KPIs.
      </p>
    </div>
  );
}