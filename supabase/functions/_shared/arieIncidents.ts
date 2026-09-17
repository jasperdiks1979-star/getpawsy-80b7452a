// ARIE incident schema contract (single source of truth for AOS readers).
//
// The live `public.arie_incidents` table has NO `title` and NO `status`
// column. AOS queries used both, so every incident read failed, no incident
// was ever picked up, no resolution task was created, and health scoring read
// the failure as "zero open incidents".
//
// Real shape (see migrations):
//   id, type, severity, confidence, affected_revenue_cents, affected_sessions,
//   root_cause, suggested_repair, auto_repair_status, rollback_token,
//   source_pair, segment, details, opened_at, resolved_at, notes
//
// Open  = resolved_at IS NULL.
// Title = derived from `type` (+ root cause) — never stored on the row.

export const ARIE_INCIDENT_COLUMNS =
  "id,type,severity,confidence,root_cause,suggested_repair,auto_repair_status,opened_at,resolved_at";

export interface ArieIncidentRow {
  id: string;
  type: string;
  severity?: string | null;
  root_cause?: string | null;
  auto_repair_status?: string | null;
  opened_at?: string | null;
  resolved_at?: string | null;
}

/** Human-readable label for events/tasks; the table stores no title. */
export function incidentTitle(row: Pick<ArieIncidentRow, "type" | "root_cause">): string {
  const type = String(row.type ?? "unknown_incident").trim() || "unknown_incident";
  const cause = String(row.root_cause ?? "").trim();
  return cause ? `${type}: ${cause}` : type;
}

/** AOS task category derived from the incident type / root cause. */
export function incidentCategory(row: Pick<ArieIncidentRow, "type" | "root_cause">): string {
  const s = `${row.type ?? ""} ${row.root_cause ?? ""}`;
  if (/checkout|payment|cart/i.test(s)) return "checkout_broken";
  if (/track|attrib|pixel|event/i.test(s)) return "tracking_failure";
  return "revenue_drop";
}

export function isOpenIncident(row: Pick<ArieIncidentRow, "resolved_at">): boolean {
  return row.resolved_at == null;
}
