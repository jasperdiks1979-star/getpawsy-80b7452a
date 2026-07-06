/**
 * Single status resolver. Any Finance status displayed in the UI must come
 * through this function — no panel is allowed to invent its own logic.
 */
import type { FinanceStatus } from "./types";

export type StatusInput = {
  /** Value being evaluated. Percent (0-100) or count. */
  value: number | null | undefined;
  /** If true, value is a percent 0..100. If false, it's a count. */
  isPercent?: boolean;
  /** True if the metric has *any* activity/data behind it. */
  hasActivity?: boolean;
  /** Blockers force downgrade. e.g. any missing invoice blocks Verified. */
  blockers?: {
    missing_invoices?: number;
    missing_receipts?: number;
    unmatched_payments?: number;
    low_confidence_documents?: number;
  };
  /** Upstream statuses that this metric depends on (weakest link wins). */
  upstream?: FinanceStatus[];
  /** Force No Activity if truly nothing is being tracked. */
  notApplicable?: boolean;
};

const STATUS_RANK: Record<FinanceStatus, number> = {
  Verified: 100,
  Estimated: 80,
  "Needs Review": 60,
  "Waiting Evidence": 40,
  Pending: 30,
  "Missing Evidence": 20,
  "No Activity": 10,
  "Not Applicable": 5,
  Unknown: 0,
};

export function weaker(a: FinanceStatus, b: FinanceStatus): FinanceStatus {
  return STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
}

export function resolveStatus(input: StatusInput): FinanceStatus {
  if (input.notApplicable) return "Not Applicable";
  const b = input.blockers ?? {};
  const anyMissing =
    (b.missing_invoices ?? 0) > 0 ||
    (b.missing_receipts ?? 0) > 0 ||
    (b.unmatched_payments ?? 0) > 0;

  let base: FinanceStatus;
  if (input.value == null) {
    base = input.hasActivity === false ? "No Activity" : "Waiting Evidence";
  } else if (input.isPercent) {
    const v = Math.max(0, Math.min(100, Number(input.value)));
    if (v === 0 && input.hasActivity === false) base = "No Activity";
    else if (v >= 95 && !anyMissing) base = "Verified";
    else if (v >= 70) base = "Needs Review";
    else if (v > 0) base = "Missing Evidence";
    else base = "Waiting Evidence";
  } else {
    // count metric: 0 is Verified only when we actually have activity to prove it
    const v = Number(input.value);
    if (v > 0) base = "Missing Evidence";
    else if (input.hasActivity === false) base = "No Activity";
    else base = "Verified";
  }

  if (anyMissing && base === "Verified") base = "Missing Evidence";

  // Weakest-link with upstream statuses.
  for (const u of input.upstream ?? []) {
    base = weaker(base, u);
  }
  return base;
}
