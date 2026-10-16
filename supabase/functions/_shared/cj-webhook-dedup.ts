/**
 * Duplicate-handling decision for CJ webhook deliveries (pure, testable).
 * cj_webhook_logs.message_id is UNIQUE; a redelivery must not raise a
 * unique-violation, and must not silently drop an event that never finished.
 */
export interface ExistingLog {
  processed: boolean | null;
  webhook_type: string | null;
  message_type: string | null;
  payload: unknown;
}

export type DedupDecision =
  | { action: "process"; reason: "new" | "retry_unprocessed" }
  | { action: "skip"; reason: "already_processed"; conflicting: boolean };

function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}

export function isSamePayload(
  existing: ExistingLog,
  incoming: { type: string; messageType?: string | null; params: unknown },
): boolean {
  return (
    existing.webhook_type === incoming.type &&
    (existing.message_type ?? null) === (incoming.messageType ?? null) &&
    stable(existing.payload) === stable(incoming.params)
  );
}

/**
 * inserted=true  -> first delivery, process.
 * inserted=false -> row existed: reprocess only if it never completed;
 *                   otherwise skip (flag conflicting payloads for review).
 */
export function decideDedup(
  inserted: boolean,
  existing: ExistingLog | null,
  incoming: { type: string; messageType?: string | null; params: unknown },
): DedupDecision {
  if (inserted || !existing) return { action: "process", reason: "new" };
  if (!existing.processed) return { action: "process", reason: "retry_unprocessed" };
  return { action: "skip", reason: "already_processed", conflicting: !isSamePayload(existing, incoming) };
}
