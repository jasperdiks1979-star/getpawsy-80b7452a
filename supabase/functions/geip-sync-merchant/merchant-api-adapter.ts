// Dark adapter for geip-sync-merchant: replaces productstatuses ingestion with
// reports.search on product_view. NOT wired in Phase 1.
//
// Note: the existing ./index.ts already contains a schema mismatch (queries
// columns access_token/refresh_token/expires_at/merchant_id that do not exist
// on merchant_oauth_tokens). Documented in the Phase 1 report; fix belongs to
// the canary flip, not Phase 1.

import { MerchantApiClient, readEnabled } from "../_shared/merchant-api.ts";

export type GeipRow = {
  merchant_id: string;
  product_id: string;
  title: string | null;
  status: string;
  destination: string;
  disapproval_reasons: unknown[];
  warnings: unknown[];
  captured_at: string;
  raw: unknown;
};

export async function fetchMerchantProductStatuses(client: MerchantApiClient, merchantId: string): Promise<{ rows: GeipRow[]; error?: string }> {
  if (!readEnabled()) return { rows: [], error: "MERCHANT_API_READ_ENABLED_false" };
  const query = `SELECT offer_id, id, title, aggregated_reporting_context_status, item_issues FROM product_view LIMIT 250`;
  try {
    const r = await client.reportsSearch(query, 250);
    const rows: GeipRow[] = (r.results ?? []).map((row) => {
      const pv = (row as { productView?: Record<string, unknown> }).productView ?? {};
      const issues = (pv.itemIssues as Array<Record<string, unknown>> | undefined) ?? [];
      return {
        merchant_id: merchantId,
        product_id: String(pv.id ?? pv.offerId ?? ""),
        title: (pv.title as string | null) ?? null,
        status: String(pv.aggregatedReportingContextStatus ?? "").toLowerCase(),
        destination: "Shopping",
        disapproval_reasons: issues.filter((i) => i.resolution === "MERCHANT_ACTION" || i.severity === "critical"),
        warnings: issues.filter((i) => i.severity === "warning"),
        captured_at: new Date().toISOString(),
        raw: pv,
      };
    });
    return { rows };
  } catch (e) { return { rows: [], error: (e as Error).message }; }
}