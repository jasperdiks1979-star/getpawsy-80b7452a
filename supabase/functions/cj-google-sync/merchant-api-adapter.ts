// Dark adapter for cj-google-sync: replaces upsertGoogleProduct() with a
// Merchant API v1 productInputs.insert call. NOT wired in Phase 1.

import { MerchantApiClient, writeEnabled } from "../_shared/merchant-api.ts";
import { contentV21ToProductInput, type LegacyProduct } from "../_shared/merchant-api-mapping.ts";

export async function upsertGoogleProductViaApi(client: MerchantApiClient, product: LegacyProduct): Promise<{ ok: boolean; error?: string; name?: string }> {
  if (!writeEnabled()) return { ok: false, error: "MERCHANT_API_WRITE_ENABLED_false" };
  const { input, warnings } = contentV21ToProductInput(product);
  if (warnings.length) console.warn("[cj-google-sync:merchant-api-adapter] mapping warnings", warnings);
  try {
    const r = await client.insertProductInput(input);
    return { ok: true, name: r.name };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}