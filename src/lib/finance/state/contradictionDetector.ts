/**
 * Contradiction Detector — proves the canonical state is internally consistent.
 * If it returns any entries, no panel is allowed to show Verified.
 */
import type { Contradiction, FinanceState } from "./types";

export function detectContradictions(s: Omit<FinanceState, "contradictions" | "overall">): Contradiction[] {
  const out: Contradiction[] = [];
  const push = (c: Contradiction) => out.push(c);

  // 1. Belastingdienst Verified requires zero missing everything AND full confidence.
  if (
    s.belastingdienst.status === "Verified" &&
    (s.missing_invoices.value > 0 ||
      s.missing_receipts.value > 0 ||
      s.unmatched_payments.value > 0 ||
      s.evidence_confidence.value < 100)
  ) {
    push({
      id: "belastingdienst-verified-with-gaps",
      severity: "critical",
      message:
        `Belastingdienst is marked Verified but ${s.missing_invoices.value} invoices, ` +
        `${s.missing_receipts.value} receipts and ${s.unmatched_payments.value} payments are still missing ` +
        `(evidence confidence ${s.evidence_confidence.value}%).`,
      fields: ["belastingdienst", "missing_invoices", "missing_receipts", "unmatched_payments", "evidence_confidence"],
      sources: [
        ...s.belastingdienst.sources,
        ...s.missing_invoices.sources,
        ...s.evidence_confidence.sources,
      ],
    });
  }

  // 2. Tax readiness cannot exceed finance readiness.
  if (s.tax_readiness.value > s.finance_readiness.value + 0.5) {
    push({
      id: "tax-exceeds-finance",
      severity: "warning",
      message: `Tax readiness (${s.tax_readiness.value}%) exceeds Finance readiness (${s.finance_readiness.value}%).`,
      fields: ["tax_readiness", "finance_readiness"],
      sources: [...s.tax_readiness.sources, ...s.finance_readiness.sources],
    });
  }

  // 3. VAT refund confidence cannot exceed evidence confidence.
  if (s.vat.refund_confidence.value > s.evidence_confidence.value + 0.5) {
    push({
      id: "refund-exceeds-evidence",
      severity: "warning",
      message: `VAT refund confidence (${s.vat.refund_confidence.value}%) exceeds evidence confidence (${s.evidence_confidence.value}%).`,
      fields: ["vat.refund_confidence", "evidence_confidence"],
      sources: [...s.vat.refund_confidence.sources, ...s.evidence_confidence.sources],
    });
  }

  // 4. Supplier confidence cannot exceed document confidence.
  if (s.supplier_confidence.value > s.document_confidence.value + 0.5) {
    push({
      id: "supplier-exceeds-doc",
      severity: "warning",
      message: `Supplier confidence (${s.supplier_confidence.value}%) exceeds document confidence (${s.document_confidence.value}%).`,
      fields: ["supplier_confidence", "document_confidence"],
      sources: [...s.supplier_confidence.sources, ...s.document_confidence.sources],
    });
  }

  return out;
}
