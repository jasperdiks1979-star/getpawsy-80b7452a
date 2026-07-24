// AILUROVA POLICY SCOPE AUDIT — read-only. No mutations of any kind.
import { getShopifyConfig, shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const REQUIRED_POLICY_SCOPES = ["read_legal_policies", "write_legal_policies"];
const REQUIRED_PAGE_SCOPES_MODERN = ["read_online_store_pages", "write_online_store_pages"];
const REQUIRED_PAGE_SCOPES_LEGACY = ["read_content", "write_content"];

async function getGrantedScopes(): Promise<{ scopes: string[]; status: number; raw?: unknown }> {
  const { domain, apiVersion } = getShopifyConfig();
  // Access scopes REST endpoint — read-only, safe.
  const meta = await shopifyAdminFetch<{ __typename?: string }>(`{ shop { id name } }`);
  // We reuse the same authenticated fetcher pattern via REST:
  const url = `https://${domain}/admin/oauth/access_scopes.json`;
  // Need raw token — reuse shopifyAdminFetch is GraphQL only. Do a direct fetch with the same token via a trick:
  // We call GraphQL currentAppInstallation which exposes accessScopes.
  const q = `query { currentAppInstallation { id app { id title apiKey } accessScopes { handle } } }`;
  const r = await shopifyAdminFetch<{ currentAppInstallation: { id: string; app: { id: string; title: string; apiKey: string }; accessScopes: { handle: string }[] } }>(q);
  const scopes = r.data?.currentAppInstallation?.accessScopes?.map(s => s.handle) ?? [];
  return { scopes, status: r.status, raw: { app: r.data?.currentAppInstallation?.app, apiVersion, domain, shopMetaStatus: meta.status } };
}

async function readShopPolicies() {
  const q = `query { shop { shopPolicies { id title type url body createdAt updatedAt } } }`;
  const r = await shopifyAdminFetch<{ shop: { shopPolicies: unknown[] } }>(q);
  return { status: r.status, errors: r.errors ?? null, count: (r.data?.shop?.shopPolicies ?? []).length, sample: r.data?.shop?.shopPolicies };
}

async function readContactPage() {
  const q = `query($q: String!) { pages(first: 5, query: $q) { edges { node { id handle title updatedAt } } } }`;
  const r = await shopifyAdminFetch<{ pages: { edges: { node: { id: string; handle: string; title: string; updatedAt: string } }[] } }>(q, { q: "handle:contact" });
  return { status: r.status, errors: r.errors ?? null, page: r.data?.pages?.edges?.find((e: any) => e.node.handle === "contact")?.node ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const cfg = getShopifyConfig();
    const granted = await getGrantedScopes();
    const policies = await readShopPolicies();
    const contact = await readContactPage();

    const grantedSet = new Set(granted.scopes);
    const hasPolicyRead = grantedSet.has("read_legal_policies");
    const hasPolicyWrite = grantedSet.has("write_legal_policies");
    const hasModernPageR = grantedSet.has("read_online_store_pages");
    const hasModernPageW = grantedSet.has("write_online_store_pages");
    const hasLegacyContentR = grantedSet.has("read_content");
    const hasLegacyContentW = grantedSet.has("write_content");

    const missingPolicy = REQUIRED_POLICY_SCOPES.filter(s => !grantedSet.has(s));
    const pageOk = (hasModernPageR && hasModernPageW) || (hasLegacyContentR && hasLegacyContentW);
    const missingPage = pageOk ? [] : REQUIRED_PAGE_SCOPES_MODERN.filter(s => !grantedSet.has(s));

    // Detect ACCESS_DENIED on policy read
    const policyDenied = JSON.stringify(policies.errors ?? "").includes("ACCESS_DENIED") || policies.count === 0 && policies.errors;
    const contactDenied = JSON.stringify(contact.errors ?? "").includes("ACCESS_DENIED");

    let verdict: string;
    if (missingPolicy.length === 0 && pageOk && !policyDenied && !contactDenied && contact.page) {
      verdict = "AILUROVA_POLICY_SCOPES_READY";
    } else if (missingPolicy.length > 0 || !pageOk) {
      verdict = "MERCHANT_REAUTHORIZATION_REQUIRED";
    } else if (policyDenied || contactDenied) {
      verdict = "AILUROVA_SCOPE_VERIFICATION_FAILED";
    } else {
      verdict = "AILUROVA_POLICY_SCOPES_PARTIAL";
    }

    const report = {
      verdict,
      phase1_authorization: {
        app: granted.raw && (granted.raw as any).app,
        api_version: cfg.apiVersion,
        store_domain: cfg.domain,
        auth_mode: cfg.authMode,
        granted_scopes: granted.scopes.sort(),
        scopes_present: {
          read_legal_policies: hasPolicyRead,
          write_legal_policies: hasPolicyWrite,
          read_online_store_pages: hasModernPageR,
          write_online_store_pages: hasModernPageW,
          read_content: hasLegacyContentR,
          write_content: hasLegacyContentW,
        },
        app_type: "custom_app_client_credentials_grant",
        scope_change_process: "Changing requested scopes for a client_credentials custom app requires editing the app configuration in the Shopify Partner/Admin app definition and reinstalling (or re-approving) the app on ukz3v8-0n.myshopify.com. Merchant approval is required.",
      },
      phase2_minimum_required: {
        for_reading_policies: ["read_legal_policies"],
        for_writing_policies: ["write_legal_policies"],
        for_reading_existing_contact_page: ["read_online_store_pages"],
        for_updating_existing_contact_page: ["write_online_store_pages"],
        alternative_legacy_scopes_accepted_by_api: {
          note: "read_content / write_content are the legacy pre-2024-07 equivalents. Modern Admin API versions (2024-07+) prefer read_online_store_pages / write_online_store_pages. Only one pair is required, not both.",
          minimum_valid_page_scope_pair: cfg.apiVersion >= "2024-07" ? "read_online_store_pages + write_online_store_pages" : "read_content + write_content (or the modern pair)",
        },
        optional_navigation: ["read_online_store_navigation", "write_online_store_navigation"],
        not_required: ["write_products", "write_inventory", "write_price_rules", "write_themes", "write_shipping"],
      },
      phase3_configuration_mutation: {
        performed: false,
        reason: "This is a Shopify custom app using client_credentials. Requested scopes are declared in the Shopify app definition (Partner Dashboard / Admin custom app scopes UI), NOT in this codebase. The edge function has no API surface to programmatically edit the app's requested-scope manifest — Shopify requires the app owner to update scopes in the Shopify app configuration UI, after which the merchant must approve.",
      },
      phase4_reauthorization: {
        merchant_approval_required: true,
        exact_next_manual_action: [
          "1. In Shopify Admin → Settings → Apps and sales channels → Develop apps (or Partner Dashboard for the app owning SHOPIFY_CLIENT_ID), open the app currently connected to ukz3v8-0n.myshopify.com.",
          "2. Edit Admin API access scopes and ADD the missing scopes: " + [...missingPolicy, ...missingPage].join(", ") + ".",
          "3. Save. Shopify will prompt to reinstall / re-approve the app on the store — approve.",
          "4. Wait ~30 seconds for the new access token to propagate, then re-run this ailurova-scope-audit function in read-only mode to confirm.",
          "5. Only after this audit returns verdict AILUROVA_POLICY_SCOPES_READY may the ailurova-policies-launch execute mode be retried.",
        ],
      },
      phase5_readonly_verification: {
        legal_policy_read: policies,
        contact_page_read: contact,
      },
      mutation_ledger: {
        oauth_configuration_changes: 0,
        app_reauthorization_actions: 0,
        policy_mutations: 0,
        page_mutations: 0,
        product_mutations: 0,
        publication_mutations: 0,
        theme_mutations: 0,
        menu_mutations: 0,
        other_shopify_mutations: 0,
      },
    };

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ verdict: "AILUROVA_SCOPE_CONFIGURATION_FAILED", error: String(e?.message ?? e) }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
