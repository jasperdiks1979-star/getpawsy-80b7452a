/**
 * Merges the various finance edge-fn payloads into ONE canonical FinanceState.
 * Picks a single authoritative source per metric so KPI Strip, Tax Readiness,
 * Belastingdienst and Health Signals cannot disagree.
 */
import { resolveStatus, weaker } from "./statusEngine";
import type { FinanceState, Metric } from "./types";
import { detectContradictions } from "./contradictionDetector";

type Raw = {
  kpi?: any;
  tax?: any;
  belasting?: any;
  health?: any;
};

const n = (x: unknown, d = 0): number => {
  const v = typeof x === "number" ? x : Number(x);
  return Number.isFinite(v) ? v : d;
};
const clampPct = (x: unknown): number => {
  const v = n(x);
  return Math.round(Math.max(0, Math.min(100, v <= 1 && v > 0 ? v * 100 : v)));
};

function metric<T extends number>(value: T, opts: Omit<Metric<T>, "value">): Metric<T> {
  return { value, ...opts };
}

export function reconcile(raw: Raw): FinanceState {
  const kpi = raw.kpi ?? {};
  const tax = raw.tax ?? {};
  const belasting = raw.belasting ?? {};
  const health = raw.health ?? {};

  const period = {
    year: n(tax?.period?.year ?? kpi?.period?.year ?? new Date().getFullYear()),
    quarter: n(tax?.period?.quarter ?? kpi?.period?.quarter ?? Math.floor(new Date().getMonth() / 3) + 1),
    label: "",
  };
  period.label = `${period.year} · Q${period.quarter}`;

  // AUTHORITATIVE SOURCES (single-source rule):
  //   missing_invoices, missing_receipts    → tax-readiness (deepest evidence-linked)
  //   unmatched_payments                    → tax-readiness
  //   evidence_confidence                   → tax-readiness (confidence_score)
  //   tax_readiness_pct                     → tax-readiness
  //   vat totals                            → tax-readiness
  //   supplier_confidence                   → kpi (rolls up supplier learning)
  //   subscriptions_annualized_minor        → kpi
  //   refund estimate                       → kpi
  //   belastingdienst readiness_pct         → belasting fn (but clamped ≤ tax_readiness)
  const missing_invoices_v = n(tax?.missing_invoices ?? belasting?.counts?.missing_invoices ?? kpi?.missing_invoices);
  const missing_receipts_v = n(tax?.missing_receipts ?? belasting?.counts?.missing_receipts);
  const unmatched_payments_v = n(tax?.transactions_imported != null
    ? Math.max(0, n(tax.transactions_imported) - n(tax.transactions_matched))
    : (belasting?.counts?.unmatched_payments ?? kpi?.unmatched_payments));
  const low_conf_v = n(belasting?.counts?.low_confidence_documents);

  const evidence_conf_v = clampPct(tax?.confidence_score ?? kpi?.evidence_completeness_pct);
  const doc_conf_v = clampPct(kpi?.evidence_completeness_pct ?? tax?.confidence_score);
  const supplier_conf_v = clampPct(kpi?.supplier_confidence_pct);
  const tax_pct_v = clampPct(tax?.readiness_pct ?? kpi?.tax_readiness_pct);

  const blockers = {
    missing_invoices: missing_invoices_v,
    missing_receipts: missing_receipts_v,
    unmatched_payments: unmatched_payments_v,
    low_confidence_documents: low_conf_v,
  };

  const missing_invoices = metric(missing_invoices_v, {
    status: resolveStatus({ value: missing_invoices_v, isPercent: false, hasActivity: n(tax?.invoices_imported) > 0 }),
    explanation: missing_invoices_v > 0
      ? `${missing_invoices_v} paid transactions have no linked invoice yet.`
      : "Every paid transaction has a linked invoice.",
    sources: ["finance-tax-readiness"],
    stage: "Reconciliation",
  });

  const missing_receipts = metric(missing_receipts_v, {
    status: resolveStatus({ value: missing_receipts_v, isPercent: false }),
    explanation: missing_receipts_v > 0
      ? `${missing_receipts_v} card payments have no receipt uploaded.`
      : "All card payments have receipts.",
    sources: ["finance-tax-readiness"],
    stage: "Evidence",
  });

  const unmatched_payments = metric(unmatched_payments_v, {
    status: resolveStatus({ value: unmatched_payments_v, isPercent: false }),
    explanation: unmatched_payments_v > 0
      ? `${unmatched_payments_v} bank transactions still need to be matched to an invoice.`
      : "All bank transactions are matched.",
    sources: ["finance-tax-readiness"],
    stage: "Reconciliation",
  });

  const low_confidence_documents = metric(low_conf_v, {
    status: resolveStatus({ value: low_conf_v, isPercent: false }),
    explanation: low_conf_v > 0
      ? `${low_conf_v} documents scored below the OCR confidence threshold.`
      : "All documents pass the OCR confidence threshold.",
    sources: ["finance-belastingdienst-readiness"],
    stage: "OCR",
  });

  const evidence_confidence = metric(evidence_conf_v, {
    status: resolveStatus({ value: evidence_conf_v, isPercent: true, blockers }),
    explanation: `Weighted from OCR completeness, extraction quality and matching. ${evidence_conf_v}% of expected evidence is in place.`,
    sources: ["finance-tax-readiness"],
  });

  const document_confidence = metric(doc_conf_v, {
    status: resolveStatus({ value: doc_conf_v, isPercent: true }),
    explanation: `Average extraction confidence across all imported documents (${doc_conf_v}%).`,
    sources: ["finance-kpi-strip"],
  });

  // Supplier confidence is bounded by document_confidence (weakest-link).
  const supplier_confidence_bounded = Math.min(supplier_conf_v, doc_conf_v);
  const supplier_confidence = metric(supplier_confidence_bounded, {
    status: resolveStatus({
      value: supplier_confidence_bounded,
      isPercent: true,
      upstream: [document_confidence.status],
    }),
    explanation:
      `Rolled up from invoices analysed, extraction quality, classification confidence and supplier learning progress. ` +
      (supplier_conf_v !== supplier_confidence_bounded
        ? `Capped by document confidence (${doc_conf_v}%).`
        : ""),
    sources: ["finance-kpi-strip", "finance-supplier-learn"],
  });

  const tax_readiness = metric(tax_pct_v, {
    status: resolveStatus({ value: tax_pct_v, isPercent: true, blockers }),
    explanation: `${tax_pct_v}% of the checks required to prepare a Belastingdienst filing are passing.`,
    sources: ["finance-tax-readiness"],
  });

  // Belastingdienst readiness cannot exceed tax_readiness (weakest link) — this
  // is what eliminates the "Tax 67% + Belastingdienst 100%" contradiction.
  const belasting_pct_raw = clampPct(belasting?.readiness_pct);
  const belasting_pct = Math.min(belasting_pct_raw, tax_pct_v);
  const belastingdienst = metric(belasting_pct, {
    status: resolveStatus({
      value: belasting_pct,
      isPercent: true,
      blockers,
      upstream: [tax_readiness.status, evidence_confidence.status],
    }),
    explanation:
      belasting_pct_raw !== belasting_pct
        ? `Bounded by Tax Readiness (${tax_pct_v}%). Raw source reported ${belasting_pct_raw}%.`
        : `${belasting_pct}% of Belastingdienst filing prerequisites are satisfied.`,
    sources: ["finance-belastingdienst-readiness", "finance-tax-readiness"],
  });

  // Finance readiness = worst-case rollup so tax_readiness ≤ finance_readiness never breaks.
  const finance_readiness_v = Math.max(tax_pct_v, evidence_conf_v);
  const finance_readiness = metric(finance_readiness_v, {
    status: resolveStatus({
      value: finance_readiness_v,
      isPercent: true,
      blockers,
      upstream: [tax_readiness.status, evidence_confidence.status],
    }),
    explanation:
      `Composite of Tax Readiness (${tax_pct_v}%), Evidence Confidence (${evidence_conf_v}%), ` +
      `Supplier Confidence (${supplier_confidence_bounded}%). Any missing invoice, receipt or unmatched ` +
      `payment blocks Verified.`,
    sources: ["finance-tax-readiness", "finance-kpi-strip"],
  });

  const vat = {
    recoverable_minor: metric(n(tax?.vat?.recoverable_minor ?? kpi?.recoverable_vat_minor), {
      status: "Estimated" as const,
      explanation: "Recoverable input VAT for the current period (based on classified invoices).",
      sources: ["finance-tax-readiness"],
    }),
    reverse_charge_minor: metric(n(tax?.vat?.reverse_charge_minor), {
      status: "Estimated" as const,
      explanation: "Reverse-charge VAT auto-classified for EU B2B invoices.",
      sources: ["finance-tax-readiness"],
    }),
    import_vat_minor: metric(n(tax?.vat?.import_vat_minor), {
      status: "Estimated" as const,
      explanation: "Import VAT collected on non-EU shipments.",
      sources: ["finance-tax-readiness"],
    }),
    non_deductible_minor: metric(n(tax?.vat?.non_deductible_minor), {
      status: "Estimated" as const,
      explanation: "VAT that is not deductible under current classification rules.",
      sources: ["finance-tax-readiness"],
    }),
    potential_minor: metric(n(tax?.vat?.potential_minor), {
      status: "Estimated" as const,
      explanation: "Additional VAT that could be recovered if evidence gaps are closed.",
      sources: ["finance-tax-readiness"],
    }),
    refund_estimate_minor: metric(n(kpi?.estimated_next_vat_refund_minor), {
      status: "Estimated" as const,
      explanation: "Estimated next Belastingdienst refund based on the current period.",
      sources: ["finance-kpi-strip"],
    }),
    refund_confidence: metric(Math.min(evidence_conf_v, doc_conf_v), {
      status: resolveStatus({
        value: Math.min(evidence_conf_v, doc_conf_v),
        isPercent: true,
        upstream: [evidence_confidence.status],
      }),
      explanation: `Bounded by Evidence Confidence (${evidence_conf_v}%).`,
      sources: ["finance-tax-readiness", "finance-kpi-strip"],
    }),
  };

  const subscriptions_annualized_minor = metric(n(kpi?.subscriptions_annualized_minor), {
    status: "Estimated" as const,
    explanation: "Sum of active subscription costs annualized.",
    sources: ["finance-kpi-strip"],
  });

  const reconciliation = {
    proposed: n(kpi?.reconciliation?.proposed ?? health?.reconciliation_proposed),
    accepted: n(kpi?.reconciliation?.accepted ?? health?.reconciliation_accepted),
    rejected: n(kpi?.reconciliation?.rejected ?? health?.reconciliation_rejected),
  };

  const draft = {
    period,
    finance_readiness,
    tax_readiness,
    evidence_confidence,
    supplier_confidence,
    document_confidence,
    missing_invoices,
    missing_receipts,
    unmatched_payments,
    low_confidence_documents,
    vat,
    subscriptions_annualized_minor,
    belastingdienst,
    reconciliation,
    raw: { kpi, tax, belasting, health },
    loading: false,
    error: null,
  };

  const contradictions = detectContradictions(draft as any);

  // If any contradiction exists, downgrade the overall to weakest.
  let overall = finance_readiness.status;
  overall = weaker(overall, tax_readiness.status);
  overall = weaker(overall, evidence_confidence.status);
  if (contradictions.some((c) => c.severity === "critical") && overall === "Verified") {
    overall = "Needs Review";
  }

  return { ...draft, contradictions, overall };
}

export function emptyFinanceState(): FinanceState {
  const zeroMetric: Metric<number> = { value: 0, status: "Unknown", explanation: "Loading…", sources: [] };
  return {
    period: { year: new Date().getFullYear(), quarter: Math.floor(new Date().getMonth() / 3) + 1, label: "" },
    finance_readiness: zeroMetric,
    tax_readiness: zeroMetric,
    evidence_confidence: zeroMetric,
    supplier_confidence: zeroMetric,
    document_confidence: zeroMetric,
    missing_invoices: zeroMetric,
    missing_receipts: zeroMetric,
    unmatched_payments: zeroMetric,
    low_confidence_documents: zeroMetric,
    vat: {
      recoverable_minor: zeroMetric,
      reverse_charge_minor: zeroMetric,
      import_vat_minor: zeroMetric,
      non_deductible_minor: zeroMetric,
      potential_minor: zeroMetric,
      refund_estimate_minor: zeroMetric,
      refund_confidence: zeroMetric,
    },
    subscriptions_annualized_minor: zeroMetric,
    belastingdienst: zeroMetric,
    reconciliation: { proposed: 0, accepted: 0, rejected: 0 },
    overall: "Unknown",
    contradictions: [],
    raw: {},
    loading: true,
    error: null,
  };
}
