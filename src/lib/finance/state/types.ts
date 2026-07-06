/**
 * Canonical Finance State — one shape every Finance Commander panel reads from.
 * Panels MUST NOT compute status/counts/percents; they render this object.
 */

export type FinanceStatus =
  | "Verified"
  | "Estimated"
  | "Needs Review"
  | "Missing Evidence"
  | "Pending"
  | "Waiting Evidence"
  | "No Activity"
  | "Not Applicable"
  | "Unknown";

export type StatusVariant = "default" | "secondary" | "destructive" | "outline";

export const STATUS_VARIANT: Record<FinanceStatus, StatusVariant> = {
  Verified: "default",
  Estimated: "secondary",
  "Needs Review": "secondary",
  "Missing Evidence": "destructive",
  Pending: "outline",
  "Waiting Evidence": "outline",
  "No Activity": "outline",
  "Not Applicable": "outline",
  Unknown: "outline",
};

export type Metric<T = number | null> = {
  value: T;
  status: FinanceStatus;
  explanation: string;
  sources: string[];
  stage?: string;
};

export type PeriodRef = { year: number; quarter: number; label: string };

export type Contradiction = {
  id: string;
  severity: "critical" | "warning";
  message: string;
  fields: string[];
  sources: string[];
};

export type FinanceState = {
  period: PeriodRef;
  finance_readiness: Metric<number>;
  tax_readiness: Metric<number>;
  evidence_confidence: Metric<number>;
  supplier_confidence: Metric<number>;
  document_confidence: Metric<number>;

  missing_invoices: Metric<number>;
  missing_receipts: Metric<number>;
  unmatched_payments: Metric<number>;
  low_confidence_documents: Metric<number>;

  vat: {
    recoverable_minor: Metric<number>;
    reverse_charge_minor: Metric<number>;
    import_vat_minor: Metric<number>;
    non_deductible_minor: Metric<number>;
    potential_minor: Metric<number>;
    refund_estimate_minor: Metric<number>;
    refund_confidence: Metric<number>;
  };

  subscriptions_annualized_minor: Metric<number>;
  belastingdienst: Metric<number>;

  reconciliation: { proposed: number; accepted: number; rejected: number };

  overall: FinanceStatus;
  contradictions: Contradiction[];
  raw: Record<string, unknown>;

  loading: boolean;
  error: string | null;
};
