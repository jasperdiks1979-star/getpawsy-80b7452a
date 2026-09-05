import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const PRODUCT_ID = "gid://shopify/Product/15889810194764";
const VARIANT_ID = "gid://shopify/ProductVariant/58044850536780";
const NEW_PRICE = "99.00";
const COMPARE = "138.99";

const MUT = `
mutation Update($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id price compareAtPrice }
    userErrors { field message }
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "CONFIRM_AILUROVA_PRICE_99") {
    return json({ verdict: "PREFLIGHT", hint: "POST { confirm:'CONFIRM_AILUROVA_PRICE_99' }" });
  }
  const r = await shopifyAdminFetch<any>(MUT, {
    productId: PRODUCT_ID,
    variants: [{ id: VARIANT_ID, price: NEW_PRICE, compareAtPrice: COMPARE }],
  });
  const errs = r.data?.productVariantsBulkUpdate?.userErrors ?? [];
  const vs = r.data?.productVariantsBulkUpdate?.productVariants ?? [];
  const ok = !r.errors && errs.length === 0 && vs[0]?.price === NEW_PRICE;
  return json({ verdict: ok ? "AILUROVA_PRICE_SET_99" : "AILUROVA_PRICE_SET_FAILED", price_mutations: 1, variants: vs, userErrors: errs, gqlErrors: r.errors ?? null });
});

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o, null, 2), { status: s, headers: { ...corsHeaders, "content-type": "application/json" } });
}
