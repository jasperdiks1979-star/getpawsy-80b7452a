// Phase 4B classification buckets — mutually exclusive rules applied per
// canonical_events row. Kept in a shared module so the API branch, the
// CSV/MD exporter and the parity checker all agree byte-for-byte.

export type Bucket =
  | "internal"
  | "technical"
  | "bot"
  | "crawler"
  | "uncertain"
  | "human"
  | "legacy_unclassified";

export interface ClassifiableRow {
  session_id?: string | null;
  visitor_id?: string | null;
  occurred_at?: string | null;
  ingested_at?: string | null;
  is_internal?: boolean | null;
  technical_path?: string | null;
  is_bot?: boolean | null;
  bot_confidence?: number | null;
  traffic_quality?: string | null;
  classification_version?: string | null;
}

export function classifyRow(row: ClassifiableRow, phase4aCutoffIso: string): Bucket {
  if (row.is_internal === true) return "internal";
  if (row.technical_path && String(row.technical_path).length > 0) return "technical";
  if (row.is_bot === true && Number(row.bot_confidence ?? 0) >= 0.7) return "bot";
  const tq = String(row.traffic_quality || "").toLowerCase();
  if (tq === "crawler") return "crawler";
  if (tq === "uncertain") return "uncertain";
  if (tq === "human") return "human";
  // No classification yet: split by cutoff.
  const stamp = row.ingested_at || row.occurred_at;
  if (!stamp) return "legacy_unclassified";
  return stamp < phase4aCutoffIso ? "legacy_unclassified" : "uncertain";
}

export interface BucketAggregate {
  sessions: Record<Bucket, Set<string>>;
  visitors: Record<Bucket, Set<string>>;
  raw_events: number;
}

export function emptyAggregate(): BucketAggregate {
  const buckets: Bucket[] = ["internal", "technical", "bot", "crawler", "uncertain", "human", "legacy_unclassified"];
  const sessions = {} as Record<Bucket, Set<string>>;
  const visitors = {} as Record<Bucket, Set<string>>;
  for (const b of buckets) { sessions[b] = new Set(); visitors[b] = new Set(); }
  return { sessions, visitors, raw_events: 0 };
}

/**
 * Reduce raw rows into buckets. Each session_id is assigned to the WORST
 * (least-commercial) bucket it ever exhibited so a technical hit on the
 * same session cannot be laundered into `human`.
 * Bucket precedence (worst → best):
 *   internal > technical > bot > crawler > uncertain > human > legacy_unclassified
 */
const PRECEDENCE: Bucket[] = ["internal", "technical", "bot", "crawler", "uncertain", "human", "legacy_unclassified"];

export function aggregateBuckets(rows: ClassifiableRow[], phase4aCutoffIso: string): BucketAggregate {
  const agg = emptyAggregate();
  const sessionBucket = new Map<string, Bucket>();
  const sessionVisitor = new Map<string, string>();
  for (const r of rows) {
    agg.raw_events += 1;
    const sid = r.session_id || `no-session:${r.visitor_id ?? crypto.randomUUID()}`;
    const vid = r.visitor_id || sid;
    if (!sessionVisitor.has(sid)) sessionVisitor.set(sid, vid);
    const b = classifyRow(r, phase4aCutoffIso);
    const cur = sessionBucket.get(sid);
    if (!cur) { sessionBucket.set(sid, b); continue; }
    const curIdx = PRECEDENCE.indexOf(cur);
    const newIdx = PRECEDENCE.indexOf(b);
    if (newIdx < curIdx) sessionBucket.set(sid, b);
  }
  for (const [sid, b] of sessionBucket) {
    agg.sessions[b].add(sid);
    agg.visitors[b].add(sessionVisitor.get(sid) || sid);
  }
  return agg;
}

export interface V2Totals {
  raw_sessions: number;
  raw_visitors: number;
  commercial_sessions: number;
  commercial_visitors: number;
  human_sessions: number;
  uncertain_sessions: number;
  crawler_sessions: number;
  bot_sessions: number;
  technical_sessions: number;
  internal_sessions: number;
  legacy_unclassified_sessions: number;
  human_visitors: number;
  uncertain_visitors: number;
  crawler_visitors: number;
  bot_visitors: number;
  technical_visitors: number;
  internal_visitors: number;
  legacy_unclassified_visitors: number;
}

export function totalsFromAggregate(agg: BucketAggregate): V2Totals {
  const allSessions = new Set<string>();
  const allVisitors = new Set<string>();
  for (const b of PRECEDENCE) {
    for (const s of agg.sessions[b]) allSessions.add(s);
    for (const v of agg.visitors[b]) allVisitors.add(v);
  }
  const commercialSessions = new Set<string>([
    ...agg.sessions.human,
    ...agg.sessions.uncertain,
  ]);
  const commercialVisitors = new Set<string>([
    ...agg.visitors.human,
    ...agg.visitors.uncertain,
  ]);
  return {
    raw_sessions: allSessions.size,
    raw_visitors: allVisitors.size,
    commercial_sessions: commercialSessions.size,
    commercial_visitors: commercialVisitors.size,
    human_sessions: agg.sessions.human.size,
    uncertain_sessions: agg.sessions.uncertain.size,
    crawler_sessions: agg.sessions.crawler.size,
    bot_sessions: agg.sessions.bot.size,
    technical_sessions: agg.sessions.technical.size,
    internal_sessions: agg.sessions.internal.size,
    legacy_unclassified_sessions: agg.sessions.legacy_unclassified.size,
    human_visitors: agg.visitors.human.size,
    uncertain_visitors: agg.visitors.uncertain.size,
    crawler_visitors: agg.visitors.crawler.size,
    bot_visitors: agg.visitors.bot.size,
    technical_visitors: agg.visitors.technical.size,
    internal_visitors: agg.visitors.internal.size,
    legacy_unclassified_visitors: agg.visitors.legacy_unclassified.size,
  };
}

export function classificationCoverage(agg: BucketAggregate): number {
  const total = agg.sessions.human.size + agg.sessions.uncertain.size
    + agg.sessions.crawler.size + agg.sessions.bot.size
    + agg.sessions.technical.size + agg.sessions.internal.size
    + agg.sessions.legacy_unclassified.size;
  if (total === 0) return 0;
  const classified = total - agg.sessions.legacy_unclassified.size;
  return Math.round((classified / total) * 10000) / 100;
}