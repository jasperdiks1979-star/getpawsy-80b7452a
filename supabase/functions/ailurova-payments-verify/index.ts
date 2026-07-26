import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const PRODUCT_ID = "gid://shopify/Product/15889810194764";

const Q = `query($id: ID!) {
  shop {
    name myshopifyDomain currencyCode
    paymentSettings { supportedDigitalWallets acceptedCardBrands countryCode currencyCode }
  }
  product(id:$id){ id handle status
    variants(first:5){ nodes { id sku availableForSale inventoryQuantity } } }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { domain } = getShopifyConfig();
  let g: any = null, gErr: any = null;
  try { g = await shopifyAdminFetch<any>(Q, { id: PRODUCT_ID }); }
  catch (e: any) { gErr = String(e?.message ?? e); }
  const shop = g.data?.shop;
  const variant = g.data?.product?.variants?.nodes?.[0];
  const numericVid = variant?.id?.split("/").pop();

  const probes: any = {};
  async function probe(name: string, url: string, follow = true) {
    try {
      const r = await fetch(url, {
        redirect: follow ? "follow" : "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      const body = await r.text();
      const lower = body.toLowerCase();
      const flags: Record<string, boolean> = {};
      for (const kw of ["test mode","bogus gateway","shop pay","paypal","apple pay","google pay",
        "card number","credit card","payment method","no payment methods","not been configured",
        "cannot accept payments","stripe","checkout is in test"]) {
        flags[kw] = lower.includes(kw);
      }
      probes[name] = { status: r.status, finalUrl: r.url, size: body.length, flags,
        contentType: r.headers.get("content-type") };
    } catch (e: any) { probes[name] = { error: String(e) }; }
  }

  const primaryHost = "ailurova.com";
  const myshop = domain;
  if (numericVid) {
    await probe("cart_permalink_public", `https://${primaryHost}/cart/${numericVid}:1?checkout`);
    await probe("cart_permalink_myshopify", `https://${myshop}/cart/${numericVid}:1?checkout`);
    await probe("checkout_direct_public", `https://${primaryHost}/checkouts/cn/new?variant=${numericVid}`);
  }

  return new Response(JSON.stringify({
    domain, gErr, gqlErrors: g?.errors ?? null,
    shop,
    product: { id: g.data?.product?.id, status: g.data?.product?.status, handle: g.data?.product?.handle },
    variant: { id: variant?.id, numericVid, availableForSale: variant?.availableForSale, qty: variant?.inventoryQuantity },
    probes,
  }, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
});
