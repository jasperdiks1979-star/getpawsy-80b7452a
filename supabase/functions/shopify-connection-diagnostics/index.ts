// Read-only Shopify connection diagnostics.
// - Validates env
// - Exchanges client_credentials for a short-lived token (server-side only)
// - Runs read-only GraphQL: shop + currentAppInstallation.accessScopes
// - Reports missing / unexpected scopes vs the W1/W2 required set
// - Never returns token material, client secret, or auth headers
// - Performs ZERO mutations
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  getShopifyConfig,
  getShopifyTokenMeta,
  shopifyAdminFetch,
} from "../_shared/shopify-token-provider.ts";

const REQUIRED_SCOPES = [
  "read_orders",
  "read_files",
  "write_files",
  "read_inventory",
  "write_inventory",
  "read_locations",
  "read_products",
  "write_products",
  "read_publications",
  "read_content",
  "write_content",
];

const SHOP_QUERY = /* GraphQL */ `
  query DiagShop {
    shop {
      name
      myshopifyDomain
      primaryDomain { host url }
      plan { displayName partnerDevelopment shopifyPlus }
    }
    currentAppInstallation {
      accessScopes { handle }
      app { title apiKey }
    }
  }
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const out: Record<string, unknown> = {
    ok: false,
    generated_at: new Date().toISOString(),
    auth_mode: "client_credentials",
    secrets_exposed: false,
    mutations_performed: 0,
  };

  try {
    const cfg = getShopifyConfig();
    out.store_domain = cfg.domain;
    out.api_version = cfg.apiVersion;
    out.domain_valid = /\.myshopify\.com$/i.test(cfg.domain);

    // Token exchange (no token in response)
    const meta = await getShopifyTokenMeta();
    out.token_exchange = "ok";
    out.token_expires_in_sec = meta.expiresInSec;
    out.token_auto_refresh_ready = meta.expiresInSec > 0;

    // Read-only shop query
    const shopRes = await shopifyAdminFetch<{
      shop: { name: string; myshopifyDomain: string; primaryDomain: { host: string; url: string }; plan: { displayName: string; partnerDevelopment: boolean; shopifyPlus: boolean } };
      currentAppInstallation: { accessScopes: { handle: string }[]; app: { title: string; apiKey: string } };
    }>(SHOP_QUERY);

    if (shopRes.status !== 200 || !shopRes.data) {
      out.graphql_status = shopRes.status;
      out.graphql_errors = shopRes.errors ?? "no data";
      return json(out, 200);
    }

    const shop = shopRes.data.shop;
    const install = shopRes.data.currentAppInstallation;
    const grantedScopes = (install?.accessScopes ?? []).map((s) => s.handle).sort();

    out.graphql_status = 200;
    out.shop = {
      name: shop.name,
      myshopify_domain: shop.myshopifyDomain,
      primary_host: shop.primaryDomain?.host,
      plan: shop.plan?.displayName,
      is_partner_dev_store: !!shop.plan?.partnerDevelopment,
    };
    out.app = {
      title: install?.app?.title,
      api_key_matches_env: install?.app?.apiKey === Deno.env.get("SHOPIFY_CLIENT_ID"),
    };
    out.store_domain_matches_env = shop.myshopifyDomain?.toLowerCase() === cfg.domain.toLowerCase();
    out.granted_scopes = grantedScopes;
    out.missing_scopes = REQUIRED_SCOPES.filter((s) => !grantedScopes.includes(s));
    out.unexpected_scopes = grantedScopes.filter((s) => !REQUIRED_SCOPES.includes(s));
    out.scopes_ok = (out.missing_scopes as string[]).length === 0;

    out.ok = out.domain_valid === true
      && out.token_exchange === "ok"
      && out.store_domain_matches_env === true
      && out.scopes_ok === true;

    return json(out, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // msg is our own hand-written text (see token provider); never contains secrets.
    out.error = msg;
    return json(out, 200);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}