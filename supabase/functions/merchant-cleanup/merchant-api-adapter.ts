// Dark adapter for merchant-cleanup: safe deletion by resolved ProductInput
// resource name plus report-based status inspection. NOT wired in Phase 1.

import { MerchantApiClient, deleteEnabled, readEnabled } from "../_shared/merchant-api.ts";

export async function deleteByOfferId(client: MerchantApiClient, offerId: string): Promise<{ ok: boolean; error?: string }> {
  if (!deleteEnabled()) return { ok: false, error: "MERCHANT_API_DELETE_ENABLED_false" };
  try {
    await client.deleteProductInput({ contentLanguage: "en", feedLabel: "US", offerId });
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

export async function listDisapprovedOfferIds(client: MerchantApiClient): Promise<{ ok: boolean; offerIds?: string[]; error?: string }> {
  if (!readEnabled()) return { ok: false, error: "MERCHANT_API_READ_ENABLED_false" };
  const query = `SELECT offer_id, aggregated_reporting_context_status, item_issues FROM product_view WHERE aggregated_reporting_context_status = 'NOT_ELIGIBLE_OR_DISAPPROVED'`;
  try {
    const r = await client.reportsSearch(query, 250);
    const offerIds = (r.results ?? []).map((row) => {
      const pv = (row as { productView?: { offerId?: string } }).productView;
      return pv?.offerId;
    }).filter((s): s is string => !!s);
    return { ok: true, offerIds };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}