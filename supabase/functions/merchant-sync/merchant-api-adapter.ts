// Dark adapter: replaces the Content API v2.1 product upsert with a
// Merchant API v1 productInputs.insert call. NOT wired to the runtime path.

import { MerchantApiClient, writeEnabled, deleteEnabled } from "../_shared/merchant-api.ts";
import { contentV21ToProductInput, type LegacyProduct } from "../_shared/merchant-api-mapping.ts";

export type AdapterResult = { ok: true; name: string } | { ok: false; error: string; status?: number };

export async function insertProduct(client: MerchantApiClient, product: LegacyProduct): Promise<AdapterResult> {
  if (!writeEnabled()) return { ok: false, error: "MERCHANT_API_WRITE_ENABLED_false" };
  const { input, warnings } = contentV21ToProductInput(product);
  if (warnings.length) console.warn("[merchant-api-adapter:insert] mapping warnings", warnings);
  try {
    const r = await client.insertProductInput(input);
    return { ok: true, name: r.name };
  } catch (e) {
    const err = e as Error & { status?: number };
    return { ok: false, error: err.message, status: err.status };
  }
}

export async function deleteProduct(client: MerchantApiClient, offerId: string): Promise<AdapterResult> {
  if (!deleteEnabled()) return { ok: false, error: "MERCHANT_API_DELETE_ENABLED_false" };
  try {
    await client.deleteProductInput({ contentLanguage: "en", feedLabel: "US", offerId });
    return { ok: true, name: `deleted:${offerId}` };
  } catch (e) {
    const err = e as Error & { status?: number };
    return { ok: false, error: err.message, status: err.status };
  }
}