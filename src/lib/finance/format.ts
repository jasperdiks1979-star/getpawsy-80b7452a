/**
 * Finance Commander — canonical presentation layer.
 *
 * Every finance panel must use these helpers so numbers, statuses, placeholders
 * and reconciliation reasoning render consistently across the product.
 *
 * NO raw dashes, NaN, Infinity, long floats, raw JSON, or "unknown".
 */

export type FinanceStatus =
  | "Verified"
  | "Estimated"
  | "Needs Review"
  | "Missing Evidence"
  | "Pending"
  | "Not Applicable"
  | "No Activity";

export type FinanceStatusVariant = "default" | "secondary" | "destructive" | "outline";

export const STATUS_VARIANT: Record<FinanceStatus, FinanceStatusVariant> = {
  Verified: "default",
  Estimated: "secondary",
  "Needs Review": "secondary",
  "Missing Evidence": "destructive",
  Pending: "outline",
  "Not Applicable": "outline",
  "No Activity": "outline",
};

function isBadNumber(n: unknown): boolean {
  return typeof n !== "number" || !Number.isFinite(n) || Number.isNaN(n);
}

/** Format minor units (cents) as localized currency, never dash. */
export function formatMoneyMinor(
  minor: number | null | undefined,
  currency = "EUR",
  fallback = "No amount recorded",
): string {
  if (minor == null || isBadNumber(minor)) return fallback;
  const value = minor / 100;
  if (Object.is(value, -0)) return formatMoneyMinor(0, currency, fallback);
  const locale = currency === "USD" ? "en-US" : "nl-NL";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Format major-unit money (already in currency units). */
export function formatMoney(
  value: number | null | undefined,
  currency = "EUR",
  fallback = "No amount recorded",
): string {
  if (value == null || isBadNumber(value)) return fallback;
  return formatMoneyMinor(Math.round(value * 100), currency, fallback);
}

/** Whole-number percentage 0–100. Clamps and rounds; never NaN/Infinity/long floats. */
export function formatPct(
  value: number | null | undefined,
  fallback = "—",
): string {
  if (value == null || isBadNumber(value)) return fallback;
  const clamped = Math.max(0, Math.min(100, value));
  return `${Math.round(clamped)}%`;
}

/** Confidence 0..1 or 0..100 → whole percent, or a meaningful state. */
export function formatConfidence(
  value: number | null | undefined,
  waitingLabel = "Waiting evidence",
): string {
  if (value == null || isBadNumber(value)) return waitingLabel;
  const pct = value <= 1 ? value * 100 : value;
  if (pct <= 0) return waitingLabel;
  return formatPct(pct);
}

/** ROAS is always 2 decimals with × suffix. */
export function formatRoas(value: number | null | undefined, fallback = "No spend"): string {
  if (value == null || isBadNumber(value) || value <= 0) return fallback;
  return `${value.toFixed(2)}×`;
}

/** Whole-number score (health, quality). Clamped 0..100. */
export function formatScore(value: number | null | undefined, fallback = "Not scored"): string {
  if (value == null || isBadNumber(value)) return fallback;
  return String(Math.round(Math.max(0, Math.min(100, value))));
}

/** Date: locale short. Meaningful fallback if missing. */
export function formatDate(
  value: string | Date | null | undefined,
  fallback = "Invoice date missing",
): string {
  if (!value) return fallback;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("nl-NL", { year: "numeric", month: "short", day: "2-digit" });
}

/** Supplier display with meaningful fallback based on context. */
export function displaySupplier(input: {
  name?: string | null;
  slug?: string | null;
  hasEvidence?: boolean;
  paymentProvider?: string | null;
  invoiceNumber?: string | null;
}): string {
  const { name, slug, hasEvidence, paymentProvider, invoiceNumber } = input;
  const clean = (s?: string | null) => (s && s.trim() && s !== "unknown" ? s.trim() : null);
  if (clean(name)) return clean(name)!;
  if (clean(slug)) return clean(slug)!;
  if (clean(paymentProvider)) return `${clean(paymentProvider)} (supplier pending)`;
  if (clean(invoiceNumber)) return `Invoice ${clean(invoiceNumber)} — supplier pending`;
  return hasEvidence ? "Supplier not identified yet" : "Awaiting first import";
}

/** Document status derived from extraction fields. */
export function documentStatus(doc: {
  supplier_name?: string | null;
  invoice_date?: string | null;
  document_date?: string | null;
  total_minor?: number | null;
  amount_minor?: number | null;
  extraction_confidence?: number | null;
  validation_state?: string | null;
  missing_fields?: string[] | null;
}): { status: FinanceStatus; hint: string } {
  const hasSupplier = !!doc.supplier_name && doc.supplier_name !== "unknown";
  const hasDate = !!(doc.invoice_date || doc.document_date);
  const hasAmount = doc.total_minor != null || doc.amount_minor != null;
  const conf = doc.extraction_confidence == null ? null : (doc.extraction_confidence <= 1 ? doc.extraction_confidence * 100 : doc.extraction_confidence);

  if (doc.validation_state === "verified") return { status: "Verified", hint: "All key fields present" };
  if (!hasSupplier && !hasDate && !hasAmount && conf == null) return { status: "Pending", hint: "Waiting AI extraction" };
  if (!hasAmount && !hasDate) return { status: "Missing Evidence", hint: "Total not extracted · invoice date missing" };
  if (!hasAmount) return { status: "Needs Review", hint: "Total not extracted" };
  if (!hasDate) return { status: "Needs Review", hint: "Invoice date missing" };
  if (conf != null && conf < 60) return { status: "Needs Review", hint: "OCR confidence low" };
  if (hasSupplier && (!hasAmount || !hasDate)) return { status: "Needs Review", hint: "Supplier found · extraction incomplete" };
  return { status: "Estimated", hint: "Extraction complete, pending verification" };
}

/** Overall readiness → status. */
export function readinessStatus(input: {
  readinessPct: number | null | undefined;
  missingInvoices?: number;
  missingReceipts?: number;
  unmatchedPayments?: number;
  confidence?: number | null;
}): FinanceStatus {
  const {
    readinessPct,
    missingInvoices = 0,
    missingReceipts = 0,
    unmatchedPayments = 0,
    confidence,
  } = input;
  const pct = readinessPct ?? 0;
  const conf = confidence == null ? 100 : (confidence <= 1 ? confidence * 100 : confidence);
  const hasMissing = missingInvoices > 0 || missingReceipts > 0 || unmatchedPayments > 0;
  if (pct >= 95 && !hasMissing && conf >= 85) return "Verified";
  if (hasMissing) return "Missing Evidence";
  if (pct >= 70 || conf >= 70) return "Needs Review";
  if (pct === 0 && conf === 0 && !hasMissing) return "No Activity";
  return "Estimated";
}

/** Supplier confidence → clamped whole percent 0..100. */
export function normalizeSupplierConfidence(v: number | null | undefined): number {
  if (v == null || isBadNumber(v)) return 0;
  const pct = v <= 1 ? v * 100 : v;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

/** Convert reconciliation signal object → human bullet list. */
export function humanizeReconciliationSignals(signals: unknown): string[] {
  if (!signals || typeof signals !== "object") return [];
  const out: string[] = [];
  const record = signals as Record<string, unknown>;
  for (const [key, raw] of Object.entries(record)) {
    const label = SIGNAL_LABELS[key] ?? key.replace(/_/g, " ");
    if (raw === true) { out.push(`✓ ${label}`); continue; }
    if (raw === false) { out.push(`✗ ${label}`); continue; }
    if (raw == null || raw === "") continue;
    if (typeof raw === "number") {
      if (key.includes("delta") && key.includes("day")) out.push(`✓ ${label}: ${raw} days`);
      else if (key.includes("delta") && key.includes("minor")) out.push(`✓ ${label}: ${formatMoneyMinor(raw)}`);
      else out.push(`✓ ${label}: ${raw}`);
      continue;
    }
    if (typeof raw === "string") { out.push(`✓ ${label}: ${raw}`); continue; }
    // Skip nested arrays/objects — never render raw JSON.
  }
  return out;
}

const SIGNAL_LABELS: Record<string, string> = {
  currency: "Currency matched",
  amount: "Amount matched",
  amount_delta_minor: "Amount difference",
  date_delta_days: "Date difference",
  reference: "Reference matched",
  supplier: "Supplier matched",
  invoice_number: "Invoice # matched",
};

/** Convert reconciliation reasoning string/object → summary + bullets, never raw JSON. */
export function humanizeReconciliationReasoning(
  reasoning: unknown,
  fallback = "No reasoning recorded",
): { summary: string; bullets: string[] } {
  if (!reasoning) return { summary: fallback, bullets: [] };
  if (typeof reasoning === "string") {
    // Strip trailing "Signals: {json}" fragments produced by older engines.
    const cleaned = reasoning.replace(/Signals?:\s*\{[\s\S]*\}\s*\.?/i, "").trim();
    return { summary: cleaned || fallback, bullets: [] };
  }
  if (typeof reasoning === "object") {
    const r = reasoning as Record<string, unknown>;
    const summary = typeof r.summary === "string" ? r.summary
      : typeof r.reason === "string" ? r.reason
      : "See matched signals below";
    const bullets = humanizeReconciliationSignals(r.signals ?? r);
    return { summary, bullets };
  }
  return { summary: fallback, bullets: [] };
}

/** Small helper: ensures a value is displayed or shows a meaningful placeholder. */
export function display(value: string | number | null | undefined, fallback = "—"): string {
  if (value == null) return fallback;
  const s = String(value).trim();
  if (!s || s === "unknown" || s === "null" || s === "undefined" || s === "NaN") return fallback;
  return s;
}