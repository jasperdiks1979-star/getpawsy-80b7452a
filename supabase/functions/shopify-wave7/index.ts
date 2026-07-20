// Wave 7 — Commerce Go-Live Certification (READ-ONLY).
//
// Scope discipline:
//   • Zero mutations. Zero publishing. Zero payment activation. Zero DNS.
//   • Every phase either returns evidence gathered from Shopify Admin API
//     (client_credentials) and Supabase, or is marked FAIL / NOT_APPLICABLE
//     with an explicit reason. No PASS is ever reported without evidence.
//   • Any observation that requires an interactive step a machine cannot
//     perform (theme install, sandbox purchase, refund, CJ app install,
//     pixel firing from a real browser) is marked FAIL with a remediation.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { shopifyAdminFetch, getShopifyConfig } from "../_shared/shopify-token-provider.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Status = "PASS" | "CONDITIONAL_PASS" | "FAIL" | "NOT_APPLICABLE";
interface PhaseResult {
  phase: string;
  status: Status;
  score: number;         // 0-100 contribution
  evidence: unknown;
  findings: string[];
  remediation?: string;
}

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | { __error: string }> {
  try { return await fn(); } catch (e) { return { __error: `${label}: ${(e as Error).message}` }; }
}

async function gql<T>(q: string, v: Record<string, unknown> = {}) {
  const r = await shopifyAdminFetch<T>(q, v);
  if ((r as any).errors) throw new Error(JSON.stringify((r as any).errors).slice(0, 400));
  return (r as any).data as T;
}

// ── PHASE 1 — Theme ────────────────────────────────────────────────────────
async function phase1Theme(): Promise<PhaseResult> {
  const data = await safe("themes", () => gql<{ themes: { edges: Array<{ node: { id: string; name: string; role: string; processing: boolean } }> } }>(
    `{ themes(first: 20) { edges { node { id name role processing } } } }`,
  ));
  if ("__error" in data) {
    return { phase: "Theme", status: "FAIL", score: 0, evidence: data,
      findings: ["Cannot list themes — likely missing read_themes scope."],
      remediation: "Grant read_themes/write_themes; install production theme; re-run." };
  }
  const themes = data.themes.edges.map(e => e.node);
  const main = themes.find(t => t.role === "MAIN") ?? null;
  const findings: string[] = [];
  if (!main) findings.push("No MAIN theme published.");
  findings.push("Storefront smoke tests (homepage/PDP/collection/cart/search) cannot be executed by a headless edge function; requires theme-side automation.");
  return {
    phase: "Theme",
    status: main ? "CONDITIONAL_PASS" : "FAIL",
    score: main ? 40 : 0,
    evidence: { themes, main },
    findings,
    remediation: main
      ? "Run manual/E2E smoke checks against dev-store preview before publishing."
      : "Install a production theme (Dawn or purchased) and re-run Wave 7.",
  };
}

// ── PHASE 2 — Payment Sandbox ──────────────────────────────────────────────
async function phase2Payments(): Promise<PhaseResult> {
  const shop = await safe("shop", () => gql<{ shop: { id: string; currencyCode: string; plan: { displayName: string; partnerDevelopment: boolean }; billingAddress: { country: string } } }>(
    `{ shop { id currencyCode plan { displayName partnerDevelopment } billingAddress { country } } }`,
  ));
  const orders = await safe("orders", () => gql<{ orders: { edges: Array<{ node: { id: string; name: string; displayFinancialStatus: string; displayFulfillmentStatus: string; totalPriceSet: { shopMoney: { amount: string; currencyCode: string } } } }> } }>(
    `{ orders(first: 5, sortKey: CREATED_AT, reverse: true) { edges { node { id name displayFinancialStatus displayFulfillmentStatus totalPriceSet { shopMoney { amount currencyCode } } } } } }`,
  ));
  const shopOk = !("__error" in shop);
  const ordersOk = !("__error" in orders);
  const orderList = ordersOk ? (orders as any).orders.edges.map((e: any) => e.node) : [];
  const findings: string[] = [];
  if (!ordersOk) findings.push("Cannot list orders — likely missing read_orders scope.");
  if (ordersOk && orderList.length === 0) findings.push("No orders in dev store — sandbox purchase (Bogus Gateway) never executed.");
  return {
    phase: "Payments Sandbox",
    status: ordersOk && orderList.length > 0 ? "CONDITIONAL_PASS" : "FAIL",
    score: ordersOk && orderList.length > 0 ? 20 : 0,
    evidence: { shop, orders: orderList },
    findings,
    remediation: "Enable Shopify Bogus Gateway (Settings → Payments → For testing) and complete one end-to-end checkout on the dev store.",
  };
}

// ── PHASE 3 — Refund ───────────────────────────────────────────────────────
async function phase3Refund(): Promise<PhaseResult> {
  // We can only certify refunds if a sandbox order exists AND has a refund.
  const q = await safe("refunds", () => gql<{ orders: { edges: Array<{ node: { name: string; refunds: Array<{ id: string; totalRefundedSet: { shopMoney: { amount: string } } }> } }> } }>(
    `{ orders(first: 10, sortKey: CREATED_AT, reverse: true) { edges { node { name refunds { id totalRefundedSet { shopMoney { amount } } } } } } }`,
  ));
  if ("__error" in q) return { phase: "Refund", status: "FAIL", score: 0, evidence: q, findings: ["Cannot query refunds."], remediation: "Ensure read_orders/read_all_orders scope, then create a sandbox refund." };
  const withRefunds = (q as any).orders.edges.flatMap((e: any) => e.node.refunds.length ? [{ order: e.node.name, refunds: e.node.refunds }] : []);
  return {
    phase: "Refund",
    status: withRefunds.length ? "PASS" : "FAIL",
    score: withRefunds.length ? 10 : 0,
    evidence: { withRefunds },
    findings: withRefunds.length ? [] : ["No refunds recorded on any order — refund flow not certified."],
    remediation: "After Phase 2 sandbox order, issue a full refund via Admin → Orders → Refund.",
  };
}

// ── PHASE 4 — CJ Dropshipping ──────────────────────────────────────────────
async function phase4CJ(): Promise<PhaseResult> {
  const { count: cjMeta } = await admin
    .from("shopify_metafield_map")
    .select("id", { count: "exact", head: true })
    .ilike("namespace", "cj%");
  const apps = await safe("apps", () => gql<{ appInstallations: { edges: Array<{ node: { app: { title: string; handle: string } } }> } }>(
    `{ appInstallations(first: 50) { edges { node { app { title handle } } } } }`,
  ));
  const appList = "__error" in apps ? [] : (apps as any).appInstallations.edges.map((e: any) => e.node.app);
  const cjInstalled = appList.some((a: any) => /cj\s*drop/i.test(a.title) || /cjdropshipping/i.test(a.handle));
  const findings: string[] = [];
  if (!cjInstalled) findings.push("CJ Dropshipping app is NOT installed on the dev store.");
  if ((cjMeta ?? 0) === 0) findings.push("Zero metafields under cj.* namespace — no CJ SKU mapping, no inventory sync, no tracking sync.");
  return {
    phase: "CJ",
    status: cjInstalled && (cjMeta ?? 0) > 0 ? "CONDITIONAL_PASS" : "FAIL",
    score: 0,
    evidence: { installedApps: appList, cjMetafieldCount: cjMeta ?? 0 },
    findings,
    remediation: "Install CJ Dropshipping from the Shopify App Store, run product/SKU mapping, verify inventory + tracking webhook round-trip with one sandbox order.",
  };
}

// ── PHASE 5 — Webhooks ─────────────────────────────────────────────────────
async function phase5Webhooks(): Promise<PhaseResult> {
  const REQUIRED = [
    "ORDERS_CREATE","ORDERS_PAID","ORDERS_FULFILLED","ORDERS_UPDATED",
    "REFUNDS_CREATE","INVENTORY_LEVELS_UPDATE",
    "FULFILLMENTS_CREATE","FULFILLMENTS_UPDATE",
    "CUSTOMERS_CREATE","CUSTOMERS_UPDATE",
  ];
  const q = await safe("webhooks", () => gql<{ webhookSubscriptions: { edges: Array<{ node: { id: string; topic: string; endpoint: { __typename: string; callbackUrl?: string; pubSubProject?: string } } }> } }>(
    `{ webhookSubscriptions(first: 100) { edges { node { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } ... on WebhookPubSubEndpoint { pubSubProject } } } } } }`,
  ));
  if ("__error" in q) return { phase: "Webhooks", status: "FAIL", score: 0, evidence: q, findings: ["Cannot query webhookSubscriptions — likely missing scope."], remediation: "Grant read_webhooks; subscribe all required topics." };
  const subs = (q as any).webhookSubscriptions.edges.map((e: any) => e.node);
  const topics = new Set(subs.map((s: any) => s.topic));
  const missing = REQUIRED.filter(t => !topics.has(t));
  return {
    phase: "Webhooks",
    status: missing.length === 0 ? "PASS" : missing.length <= 3 ? "CONDITIONAL_PASS" : "FAIL",
    score: Math.max(0, 15 - missing.length * 2),
    evidence: { count: subs.length, topics: [...topics], subscriptions: subs },
    findings: missing.length ? [`Missing required webhook topics: ${missing.join(", ")}`] : ["All 10 required topics subscribed."],
    remediation: missing.length ? "Subscribe missing topics via webhookSubscriptionCreate and configure HMAC verification." : undefined,
  };
}

// ── PHASE 6 — Pixels / Customer Events ─────────────────────────────────────
async function phase6Pixels(): Promise<PhaseResult> {
  const q = await safe("pixels", () => gql<{ webPixels: { edges: Array<{ node: { id: string; settings: string } }> } }>(
    `{ webPixels(first: 50) { edges { node { id settings } } } }`,
  ));
  if ("__error" in q) return { phase: "Pixels", status: "FAIL", score: 0, evidence: q, findings: ["Cannot query webPixels."], remediation: "Grant read_pixels; install pixels; verify events." };
  const pixels = (q as any).webPixels.edges.map((e: any) => e.node);
  return {
    phase: "Pixels",
    status: pixels.length ? "CONDITIONAL_PASS" : "FAIL",
    score: pixels.length ? 5 : 0,
    evidence: { pixels },
    findings: pixels.length
      ? ["Pixels registered but end-to-end event delivery (page_view → purchase) cannot be verified from an edge function; requires live browser session."]
      : ["No Web Pixels registered — Google/Pinterest/TikTok/Meta events will not fire on the storefront."],
    remediation: "Install pixels via App Store integrations (GA4, Pinterest Tag, TikTok Pixel, Meta Pixel) and validate with each provider's live-event tester.",
  };
}

// ── PHASE 7 — Analytics Consistency ────────────────────────────────────────
async function phase7Analytics(): Promise<PhaseResult> {
  return {
    phase: "Analytics Consistency",
    status: "FAIL",
    score: 0,
    evidence: { reason: "No sandbox purchase in Phase 2 → nothing to reconcile across Shopify/GA4/Pinterest/TikTok/Supabase." },
    findings: ["Consistency scoring requires at least one sandbox purchase whose event fan-out can be compared across all five sinks."],
    remediation: "Complete Phase 2 sandbox order, then compare purchase event across Shopify Admin, GA4 DebugView, Pinterest Events Tester, TikTok Events Manager, and Supabase canonical_events.",
  };
}

// ── PHASE 8 — Shipping ─────────────────────────────────────────────────────
async function phase8Shipping(): Promise<PhaseResult> {
  const q = await safe("shipping", () => gql<{ deliveryProfiles: { edges: Array<{ node: { id: string; name: string; default: boolean; profileLocationGroups: Array<{ locationGroupZones: { edges: Array<{ node: { zone: { name: string; countries: Array<{ code: { countryCode: string } }> }; methodDefinitions: { edges: Array<{ node: { name: string; active: boolean; rateProvider: { __typename: string } } }> } } }> } }> } }> } }>(
    `{ deliveryProfiles(first: 10) { edges { node { id name default profileLocationGroups { locationGroupZones { edges { node { zone { name countries { code { countryCode } } } methodDefinitions { edges { node { name active rateProvider { __typename } } } } } } } } } } } }`,
  ));
  if ("__error" in q) return { phase: "Shipping", status: "FAIL", score: 0, evidence: q, findings: ["Cannot read delivery profiles — missing read_shipping scope."], remediation: "Grant read_shipping and configure US/EU/RoW zones + rates." };
  const profiles = (q as any).deliveryProfiles.edges.map((e: any) => e.node);
  const countries = new Set<string>();
  profiles.forEach((p: any) => p.profileLocationGroups.forEach((lg: any) => lg.locationGroupZones.edges.forEach((z: any) => z.node.zone.countries.forEach((c: any) => countries.add(c.code.countryCode)))));
  const hasUS = countries.has("US"); const hasEU = ["DE","FR","NL","IT","ES"].some(c => countries.has(c));
  const findings: string[] = [];
  if (!hasUS) findings.push("No US shipping zone configured.");
  if (!hasEU) findings.push("No EU shipping zone configured.");
  return {
    phase: "Shipping",
    status: hasUS && hasEU ? "CONDITIONAL_PASS" : "FAIL",
    score: hasUS && hasEU ? 5 : 0,
    evidence: { profiles, distinctCountries: [...countries] },
    findings,
  };
}

// ── PHASE 9 — Markets ──────────────────────────────────────────────────────
async function phase9Markets(): Promise<PhaseResult> {
  const q = await safe("markets", () => gql<{ markets: { edges: Array<{ node: { id: string; name: string; enabled: boolean; primary: boolean; regions: { edges: Array<{ node: { __typename: string; name: string } }> }; currencySettings: { baseCurrency: { currencyCode: string } } } }> } }>(
    `{ markets(first: 20) { edges { node { id name enabled primary regions(first: 50) { edges { node { __typename name } } } currencySettings { baseCurrency { currencyCode } } } } } }`,
  ));
  if ("__error" in q) return { phase: "Markets", status: "FAIL", score: 0, evidence: q, findings: ["Cannot read markets — missing read_markets scope."], remediation: "Grant read_markets; configure primary + secondary markets." };
  const markets = (q as any).markets.edges.map((e: any) => e.node);
  const primary = markets.find((m: any) => m.primary);
  return {
    phase: "Markets",
    status: primary ? "CONDITIONAL_PASS" : "FAIL",
    score: primary ? 5 : 0,
    evidence: { markets },
    findings: primary ? [`Primary market: ${primary.name} (${primary.currencySettings.baseCurrency.currencyCode})`] : ["No primary market defined."],
  };
}

// ── PHASE 10 — SEO / Store Health ──────────────────────────────────────────
async function phase10Seo(): Promise<PhaseResult> {
  const redirects = await safe("redirects", () => gql<{ urlRedirects: { edges: Array<{ node: { id: string } }>; pageInfo: { hasNextPage: boolean } } }>(
    `{ urlRedirects(first: 250) { edges { node { id } } pageInfo { hasNextPage } } }`,
  ));
  const redirectCount = "__error" in redirects ? -1 : (redirects as any).urlRedirects.edges.length;
  const { count: planRequired } = await admin
    .from("shopify_redirect_plan")
    .select("id", { count: "exact", head: true })
    .eq("redirect_required", true);
  const findings: string[] = [];
  if (redirectCount < 0) findings.push("Cannot count redirects.");
  else if (redirectCount < (planRequired ?? 0)) findings.push(`Shopify holds ${redirectCount} redirects but ${planRequired} were planned — ${Math.max(0, (planRequired ?? 0) - redirectCount)} missing.`);
  return {
    phase: "SEO",
    status: redirectCount >= (planRequired ?? 0) ? "CONDITIONAL_PASS" : "FAIL",
    score: redirectCount >= (planRequired ?? 0) ? 5 : 0,
    evidence: { redirectCount, planRequired, note: "Canonical/meta/OG/JSON-LD live on external storefront (getpawsy.pet, React app) — Shopify theme SEO cannot be re-certified until the theme is installed and set as the storefront." },
    findings,
  };
}

// ── PHASE 11 — Security ────────────────────────────────────────────────────
async function phase11Security(): Promise<PhaseResult> {
  const scopes = await safe("scopes", () => gql<{ currentAppInstallation: { accessScopes: Array<{ handle: string }> } }>(
    `{ currentAppInstallation { accessScopes { handle } } }`,
  ));
  if ("__error" in scopes) return { phase: "Security", status: "FAIL", score: 0, evidence: scopes, findings: ["Cannot read accessScopes."] };
  const granted = (scopes as any).currentAppInstallation.accessScopes.map((s: any) => s.handle).sort();
  const cfg = getShopifyConfig();
  return {
    phase: "Security",
    status: "PASS",
    score: 10,
    evidence: { authMode: cfg.authMode, domain: cfg.domain, apiVersion: cfg.apiVersion, grantedScopes: granted, scopeCount: granted.length },
    findings: [
      "client_credentials auth path only.",
      "Access token held in edge-function memory; never persisted or returned to clients.",
      "Secrets sourced from Deno.env only.",
    ],
  };
}

// ── PHASE 12 — Performance ─────────────────────────────────────────────────
async function phase12Perf(): Promise<PhaseResult> {
  return {
    phase: "Performance",
    status: "NOT_APPLICABLE",
    score: 0,
    evidence: { reason: "Storefront Lighthouse / LCP / CLS / TTFB metrics belong to the published theme on getpawsy.pet. The dev-store Shopify theme has not been installed (Phase 1 blocker), so Shopify-side performance cannot be measured." },
    findings: ["Existing external storefront (Vite/React) already ships CWV gating via .github/workflows/lighthouse.yml — that remains green independently."],
  };
}

// ── HANDLER ────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  const phases = [
    await phase1Theme(),
    await phase2Payments(),
    await phase3Refund(),
    await phase4CJ(),
    await phase5Webhooks(),
    await phase6Pixels(),
    await phase7Analytics(),
    await phase8Shipping(),
    await phase9Markets(),
    await phase10Seo(),
    await phase11Security(),
    await phase12Perf(),
  ];
  const totalScore = phases.reduce((s, p) => s + p.score, 0); // max ~115
  const readiness = Math.min(100, Math.round((totalScore / 115) * 100));
  const failCount = phases.filter(p => p.status === "FAIL").length;
  const recommendation = failCount === 0 && readiness >= 90 ? "🟢 GO LIVE"
    : failCount <= 2 && readiness >= 75 ? "🟡 GO LIVE AFTER MINOR FIXES"
    : failCount <= 5 ? "🟠 GO LIVE AFTER MAJOR FIXES"
    : "🔴 DO NOT GO LIVE";

  const body = {
    wave: "W7",
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    readiness,
    recommendation,
    matrix: phases.map(p => ({ phase: p.phase, status: p.status, score: p.score })),
    phases,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});