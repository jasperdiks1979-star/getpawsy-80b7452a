// Shopify scope re-verification (READ-ONLY).
// Queries currentAppInstallation.accessScopes and diffs against the required set.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

// Required Admin API scopes for full Wave 7.2 remediation coverage.
const REQUIRED_SCOPES = [
  // Core catalog
  "read_products", "write_products",
  "read_product_listings",
  "read_inventory", "write_inventory",
  "read_publications", "write_publications",
  // Content
  "read_content", "write_content",
  "read_online_store_pages", "write_online_store_pages",
  "read_online_store_navigation", "write_online_store_navigation",
  "read_themes", "write_themes",
  // Orders / customers / checkout
  "read_orders", "write_orders",
  "read_customers", "write_customers",
  "read_draft_orders", "write_draft_orders",
  "read_fulfillments", "write_fulfillments",
  "read_assigned_fulfillment_orders", "write_assigned_fulfillment_orders",
  "read_merchant_managed_fulfillment_orders", "write_merchant_managed_fulfillment_orders",
  "read_shipping", "write_shipping",
  "read_price_rules", "write_price_rules",
  "read_discounts", "write_discounts",
  "read_gift_cards", "write_gift_cards",
  // Markets & pixels
  "read_markets", "write_markets",
  "read_pixels", "write_pixels",
  "read_customer_events",
  // Locations / files / metafields / translations
  "read_locations", "write_locations",
  "read_files", "write_files",
  "read_metaobjects", "write_metaobjects",
  "read_translations", "write_translations",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = new Date().toISOString();
  try {
    const cfg = getShopifyConfig();
    const q = `{
      currentAppInstallation {
        id
        app { id title handle }
        accessScopes { handle }
      }
      shop { name myshopifyDomain }
    }`;
    const r = await shopifyAdminFetch<{
      currentAppInstallation: {
        id: string;
        app: { id: string; title: string; handle: string };
        accessScopes: { handle: string }[];
      };
      shop: { name: string; myshopifyDomain: string };
    }>(q);

    if (r.status !== 200 || !r.data) {
      return new Response(JSON.stringify({
        ok: false, status: r.status, errors: r.errors, started,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const granted = (r.data.currentAppInstallation?.accessScopes ?? [])
      .map((s) => s.handle).sort();
    const grantedSet = new Set(granted);
    const missing = REQUIRED_SCOPES.filter((s) => !grantedSet.has(s)).sort();
    const extra = granted.filter((s) => !REQUIRED_SCOPES.includes(s)).sort();

    // Actions unlocked by newly-granted scopes.
    const capabilities = {
      themes: grantedSet.has("read_themes") && grantedSet.has("write_themes"),
      pixels: grantedSet.has("read_pixels") && grantedSet.has("write_pixels"),
      markets: grantedSet.has("read_markets") && grantedSet.has("write_markets"),
      shipping: grantedSet.has("read_shipping") && grantedSet.has("write_shipping"),
      customers: grantedSet.has("read_customers") && grantedSet.has("write_customers"),
      price_rules: grantedSet.has("read_price_rules") && grantedSet.has("write_price_rules"),
      fulfillments: grantedSet.has("read_fulfillments") && grantedSet.has("write_fulfillments"),
      publications: grantedSet.has("write_publications"),
      navigation: grantedSet.has("write_online_store_navigation"),
      translations: grantedSet.has("write_translations"),
      metaobjects: grantedSet.has("write_metaobjects"),
    };

    return new Response(JSON.stringify({
      ok: true,
      started,
      finished: new Date().toISOString(),
      shop: r.data.shop,
      app: r.data.currentAppInstallation?.app,
      domain: cfg.domain,
      apiVersion: cfg.apiVersion,
      counts: {
        required: REQUIRED_SCOPES.length,
        granted: granted.length,
        missing: missing.length,
        extra: extra.length,
      },
      granted_scopes: granted,
      required_scopes: REQUIRED_SCOPES,
      missing_scopes: missing,
      extra_granted_scopes: extra,
      capabilities,
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false, error: e instanceof Error ? e.message : String(e), started,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});