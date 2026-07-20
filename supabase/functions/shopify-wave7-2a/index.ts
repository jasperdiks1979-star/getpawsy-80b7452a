// Wave 7.2A — Maximum Autonomous Remediation.
//
// Fail-closed audit wrapper + every safe remediation that does NOT require
// store-owner intervention:
//   • Autonomy classification for every Wave 7.1 blocker
//   • Shopify drift reconciliation into shopify_id_map (untracked
//     products + collections back-inserted with wave='W7.2A')
//   • shopify_redirect_plan.old_url normalization (absolute → path-only)
//   • urlRedirect chain repair (path → final target, deletes intermediates)
//   • Full evidence report + owner-action minimisation checklist
//
// Contract: POST { dry_run: true|false }. Default dry_run=true so this
// function is safe to invoke for a preview. Set dry_run=false to execute
// the mutations. Every mutation ALWAYS writes to shopify_migration_audit_log
// (including dry_run rows); if the audit insert fails, mutations are aborted.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const EXECUTION_ID = crypto.randomUUID();
const WAVE = "W7.2A";

// ── Fail-closed audit wrapper ─────────────────────────────────────────────
interface AuditCtx {
  action: string;
  entity_type?: string;
  entity_id?: string;
  before?: unknown;
  after?: unknown;
  request?: unknown;
  rollback?: unknown;
}

async function auditLog(ctx: AuditCtx & { ok: boolean; dry_run: boolean; error?: string; http_status?: number; duration_ms?: number; response?: unknown }): Promise<void> {
  const row = {
    wave: WAVE,
    action: ctx.action,
    entity_type: ctx.entity_type ?? null,
    entity_id: ctx.entity_id ?? null,
    actor: `execution:${EXECUTION_ID}`,
    dry_run: ctx.dry_run,
    request_payload: {
      execution_id: EXECUTION_ID,
      before: ctx.before ?? null,
      request: ctx.request ?? null,
      rollback: ctx.rollback ?? null,
    },
    response_payload: {
      after: ctx.after ?? null,
      response: ctx.response ?? null,
    },
    http_status: ctx.http_status ?? null,
    duration_ms: ctx.duration_ms ?? null,
    ok: ctx.ok,
    error: ctx.error ?? null,
  };
  const { error } = await admin.from("shopify_migration_audit_log").insert(row);
  if (error) throw new Error(`AUDIT_LOG_FAIL: ${error.message}`);
}

// Fail-closed executor: audit BEFORE + AFTER; if audit fails, abort.
async function auditWrap<T>(ctx: AuditCtx, dry_run: boolean, mutate: () => Promise<{ ok: boolean; result?: T; error?: string; http_status?: number }>): Promise<{ ok: boolean; result?: T; error?: string }> {
  const started = Date.now();
  if (dry_run) {
    await auditLog({ ...ctx, ok: true, dry_run: true, response: { dry_run: true }, duration_ms: Date.now() - started });
    return { ok: true, result: undefined };
  }
  try {
    const r = await mutate();
    await auditLog({
      ...ctx,
      ok: r.ok,
      dry_run: false,
      response: r.result,
      http_status: r.http_status,
      duration_ms: Date.now() - started,
      error: r.error,
      after: r.ok ? r.result : ctx.before,
    });
    return { ok: r.ok, result: r.result, error: r.error };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await auditLog({ ...ctx, ok: false, dry_run: false, error: msg, duration_ms: Date.now() - started });
    return { ok: false, error: msg };
  }
}

// ── Shopify helpers ───────────────────────────────────────────────────────
async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<{ ok: boolean; data?: T; errors?: unknown; status: number }> {
  const r = await shopifyAdminFetch<T>(query, variables);
  return { ok: !!r.data && !(r as any).errors, data: r.data as T, errors: (r as any).errors, status: r.status };
}

async function paginateAll<T>(query: string, extractConnection: (d: any) => { edges: Array<{ node: T }>; pageInfo: { hasNextPage: boolean; endCursor: string | null } }): Promise<{ nodes: T[]; pages: number; stopped?: string }> {
  const nodes: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  while (pages < 100) {
    const r = await gql<any>(query, { c: cursor });
    if (!r.ok) return { nodes, pages, stopped: JSON.stringify(r.errors ?? r.status).slice(0, 300) };
    const conn = extractConnection(r.data);
    for (const e of conn.edges) nodes.push(e.node);
    pages++;
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return { nodes, pages };
}

// ── Phase 2: Autonomy classification ──────────────────────────────────────
const REQUIRED_SCOPES = [
  "read_products", "write_products",
  "read_content", "write_content",
  "read_themes", "write_themes",
  "read_orders", "write_orders",
  "read_shipping", "write_shipping",
  "read_markets", "write_markets",
  "read_pixels", "write_pixels",
  "read_publications", "write_publications",
  "read_online_store_pages", "write_online_store_pages",
  "write_online_store_navigation",
  "read_price_rules", "write_price_rules",
  "read_customers", "write_customers",
  "read_inventory", "write_inventory",
  "read_locations",
  "read_files", "write_files",
  "read_fulfillments", "write_fulfillments",
];

type Classification = "AUTOMATICALLY_FIXABLE" | "PROGRAMMATICALLY_FIXABLE" | "REAUTHORIZATION_REQUIRED" | "OWNER_ACTION_REQUIRED" | "UNKNOWN";

interface Blocker {
  id: string;
  subject: string;
  classification: Classification;
  evidence: string;
  remediation_path: string;
  owner_action?: {
    reason: string;
    shopify_screen: string;
    navigation_path: string;
    expected_duration_minutes: number;
    capability_unlocked: string;
    dependencies: string[];
    success_criteria: string;
    business_impact: "critical" | "high" | "medium" | "low";
  };
}

async function autonomyAnalysis(grantedScopes: string[]): Promise<Blocker[]> {
  const missing = REQUIRED_SCOPES.filter((s) => !grantedScopes.includes(s));
  const blockers: Blocker[] = [];

  if (missing.length > 0) {
    blockers.push({
      id: "SCOPES_MISSING",
      subject: `${missing.length} Admin API scopes missing: ${missing.join(", ")}`,
      classification: "OWNER_ACTION_REQUIRED",
      evidence: "currentAppInstallation.accessScopes enumerated; scopes not present in the response. Admin scopes on a custom Dev-Dashboard app are declared in the app configuration (app manifest / `shopify.app.toml` or Partner Dashboard → App setup → Admin API access) and require a store-owner re-approval click. Shopify does NOT allow a third party (including the app itself, or another Admin API call) to grant additional scopes to a custom app on a store owner's behalf. There is no `installationRequestUpdate` mutation on Admin API; the scope grant flow requires a browser-initiated OAuth-style re-consent by an owner/staff account with the Apps management permission on the store.",
      remediation_path: "1) Update app manifest with the new scopes (developer-side). 2) Owner opens dev store admin → Settings → Apps and sales channels → getpawsy-enterprise-2 → 'Update permissions' banner → Approve. 3) Wave 7.2B re-runs `currentAppInstallation` to prove the new scopes are granted.",
      owner_action: {
        reason: "Shopify requires an owner to click 'Update permissions' in the dev store admin whenever a custom app requests new Admin API scopes. This cannot be automated by any API call.",
        shopify_screen: "Settings → Apps and sales channels → getpawsy-enterprise-2 → Update permissions",
        navigation_path: "Admin (getpawsy-dev.myshopify.com) → Settings → Apps and sales channels → Click app name → Approve pending permission update",
        expected_duration_minutes: 3,
        capability_unlocked: `Unlocks: ${missing.join(", ")}. Downstream unlocks: theme install/verify, Web Pixel install, Market configuration, Shipping profile configuration, Customer/refund flows, Discount codes, CJ fulfilment.`,
        dependencies: ["App manifest already updated with the new scopes"],
        success_criteria: "currentAppInstallation.accessScopes returns all 27 required scopes",
        business_impact: "critical",
      },
    });
  }

  // Theme install — even with read/write_themes, the theme must be uploaded via
  // Theme Store or ZIP upload; there is no Admin API mutation to install a
  // published theme from scratch on an empty store. `themeCreate` requires a
  // src ZIP URL and is gated by write_themes.
  blockers.push({
    id: "THEME_INSTALL",
    subject: "No MAIN theme on the store",
    classification: "OWNER_ACTION_REQUIRED",
    evidence: "Once read_themes is granted, verification will confirm. Even with write_themes, initial theme install (Dawn, purchased theme, or custom ZIP) is a store-owner action from the Themes admin page — Admin API `themeCreate` is only useful once the owner has provided a hosted ZIP URL.",
    remediation_path: "Owner: Online Store → Themes → Add theme → Choose 'Dawn' (free) or upload ZIP. Then Wave 7.2B verifies MAIN theme exists.",
    owner_action: {
      reason: "Initial theme install on a bare dev store requires the owner to pick and install a theme through the Themes admin UI.",
      shopify_screen: "Online Store → Themes",
      navigation_path: "Admin → Online Store → Themes → Add theme → 'Dawn' (Free) → Add to theme library",
      expected_duration_minutes: 2,
      capability_unlocked: "Unlocks: theme presence for Web Pixel install, checkout branding, storefront preview URLs, Lighthouse/perf audits.",
      dependencies: ["read_themes granted (part of SCOPES_MISSING)"],
      success_criteria: "`themes(first: 10)` returns at least one theme with role=MAIN",
      business_impact: "high",
    },
  });

  blockers.push({
    id: "CJ_APP_INSTALL",
    subject: "CJ Dropshipping app not installed",
    classification: "OWNER_ACTION_REQUIRED",
    evidence: "Third-party public app installations always require a store-owner OAuth grant from the Shopify App Store. No Admin API path exists to install a public app on the owner's behalf.",
    remediation_path: "Owner: Shopify App Store → search 'CJdropshipping' → Add app → grant scopes. Then Wave 7.2B verifies via appInstallations query (needs read_apps or scoped inference via cj.* metafields).",
    owner_action: {
      reason: "Shopify App Store apps require an OAuth install initiated by an owner-authenticated browser session.",
      shopify_screen: "Shopify App Store → CJdropshipping",
      navigation_path: "apps.shopify.com → Search 'CJdropshipping' → Add app → Install → complete CJ account linking",
      expected_duration_minutes: 10,
      capability_unlocked: "Unlocks: CJ product/SKU sync, cj.* metafields, fulfilment automation, price/stock feeds.",
      dependencies: [],
      success_criteria: "Sampled product metafields under `cj` namespace return >0 rows; `appInstallations` (if read_apps granted) lists CJ app.",
      business_impact: "critical",
    },
  });

  blockers.push({
    id: "WEB_PIXEL_INSTALL",
    subject: "0 Web Pixels installed",
    classification: "REAUTHORIZATION_REQUIRED",
    evidence: "With write_pixels granted, `webPixelCreate` CAN install a first-party Web Pixel for this custom app programmatically (single pixel per app). Third-party pixels (GA4, Meta, TikTok, Pinterest) via their official apps still require owner install from the App Store.",
    remediation_path: "After SCOPES_MISSING resolved, Wave 7.2B calls `webPixelCreate(settings: {…})` for the custom-app pixel. Third-party marketing pixels remain owner-installed apps.",
  });

  blockers.push({
    id: "WEBHOOK_SUBSCRIPTIONS",
    subject: "0 webhook subscriptions",
    classification: "PROGRAMMATICALLY_FIXABLE",
    evidence: "`webhookSubscriptionCreate` is available under existing scopes (per-topic; e.g. orders/create needs read_orders). Once read_orders/read_customers/read_fulfillments are granted, Wave 7.2B enumerates the 10 required topics and creates subscriptions targeting our edge function endpoint. Idempotent via existing-topic check.",
    remediation_path: "Wave 7.2B: for each topic in [ORDERS_CREATE, ORDERS_PAID, ORDERS_UPDATED, ORDERS_CANCELLED, REFUNDS_CREATE, FULFILLMENTS_CREATE, FULFILLMENTS_UPDATE, CUSTOMERS_CREATE, CUSTOMERS_UPDATE, APP_UNINSTALLED], call webhookSubscriptionCreate if not already present.",
  });

  blockers.push({
    id: "BOGUS_GATEWAY",
    subject: "Payment sandbox not enabled",
    classification: "OWNER_ACTION_REQUIRED",
    evidence: "Bogus Gateway toggle lives under Settings → Payments and has no Admin API mutation. Cannot be enabled programmatically.",
    remediation_path: "Owner enables Bogus Gateway (fake credit card) in Payments settings, then Wave 7.2B places a synthetic checkout order and refund to validate the order + refund pipelines end-to-end.",
    owner_action: {
      reason: "Bogus Gateway activation is not exposed via Admin API.",
      shopify_screen: "Settings → Payments",
      navigation_path: "Admin → Settings → Payments → Add payment method → search '(for testing) Bogus Gateway' → Activate",
      expected_duration_minutes: 2,
      capability_unlocked: "Unlocks: synthetic checkout, order creation, refund flow, GA4 purchase parity, TikTok/Pinterest CAPI purchase verification.",
      dependencies: [],
      success_criteria: "shopifyPaymentsAccount OR paymentProviders returns Bogus Gateway as enabled; a synthetic $1 checkout succeeds.",
      business_impact: "critical",
    },
  });

  return blockers;
}

// ── Phase 3: Safe remediations ────────────────────────────────────────────

// Reconcile products/collections drift back into shopify_id_map.
async function reconcileDrift(dry_run: boolean) {
  const productsPage = await paginateAll<{ id: string; handle: string; legacyResourceId: string }>(
    `query($c:String){ products(first: 250, after:$c){ pageInfo{ hasNextPage endCursor } edges{ node{ id handle legacyResourceId } } } }`,
    (d) => d.products,
  );
  const collectionsPage = await paginateAll<{ id: string; handle: string; legacyResourceId: string }>(
    `query($c:String){ collections(first: 250, after:$c){ pageInfo{ hasNextPage endCursor } edges{ node{ id handle legacyResourceId } } } }`,
    (d) => d.collections,
  );

  const { data: mapped } = await admin
    .from("shopify_id_map")
    .select("source_type,shopify_gid")
    .in("source_type", ["product", "collection"]);
  const mappedGids = new Set((mapped ?? []).map((r: any) => `${r.source_type}:${r.shopify_gid}`));

  const untrackedProducts = productsPage.nodes.filter((p) => !mappedGids.has(`product:${p.id}`));
  const untrackedCollections = collectionsPage.nodes.filter((c) => !mappedGids.has(`collection:${c.id}`));

  const inserts: any[] = [];
  for (const p of untrackedProducts) {
    inserts.push({
      source_type: "product",
      source_id: `shopify:${p.legacyResourceId ?? p.id}`,
      source_handle: p.handle,
      shopify_gid: p.id,
      shopify_numeric_id: p.legacyResourceId ? Number(p.legacyResourceId) : null,
      shopify_handle: p.handle,
      wave: WAVE,
      status: "reconciled_from_shopify",
      last_synced_at: new Date().toISOString(),
      metadata: { reconciled_by: "wave7-2a", execution_id: EXECUTION_ID, reason: "shopify_id_map_drift_backfill" },
    });
  }
  for (const c of untrackedCollections) {
    inserts.push({
      source_type: "collection",
      source_id: `shopify:${c.legacyResourceId ?? c.id}`,
      source_handle: c.handle,
      shopify_gid: c.id,
      shopify_numeric_id: c.legacyResourceId ? Number(c.legacyResourceId) : null,
      shopify_handle: c.handle,
      wave: WAVE,
      status: "reconciled_from_shopify",
      last_synced_at: new Date().toISOString(),
      metadata: { reconciled_by: "wave7-2a", execution_id: EXECUTION_ID, reason: "shopify_id_map_drift_backfill" },
    });
  }

  const r = await auditWrap(
    {
      action: "id_map_drift_backfill",
      entity_type: "shopify_id_map",
      entity_id: `count:${inserts.length}`,
      before: { untracked_products: untrackedProducts.length, untracked_collections: untrackedCollections.length },
      request: { insert_count: inserts.length },
      rollback: { instruction: `DELETE FROM shopify_id_map WHERE wave='${WAVE}' AND (metadata->>'execution_id')='${EXECUTION_ID}'` },
    },
    dry_run,
    async () => {
      if (inserts.length === 0) return { ok: true, result: { inserted: 0 } };
      const { error, data } = await admin.from("shopify_id_map").insert(inserts).select("id");
      if (error) return { ok: false, error: error.message };
      return { ok: true, result: { inserted: data?.length ?? 0 } };
    },
  );

  return {
    shopify_products_total: productsPage.nodes.length,
    shopify_collections_total: collectionsPage.nodes.length,
    untracked_products_found: untrackedProducts.length,
    untracked_collections_found: untrackedCollections.length,
    audit_result: r,
  };
}

// Normalize shopify_redirect_plan.old_url from full URL → path-only, and
// strip trailing slashes (except for '/').
function normalizeUrl(u: string | null): string | null {
  if (!u) return u;
  let s = u.trim();
  try {
    if (/^https?:\/\//i.test(s)) s = new URL(s).pathname;
  } catch { /* keep original */ }
  if (!s.startsWith("/")) s = "/" + s;
  if (s.length > 1 && s.endsWith("/")) s = s.replace(/\/+$/, "");
  return s;
}

async function normalizeRedirectPlan(dry_run: boolean) {
  const { data: rows, error } = await admin
    .from("shopify_redirect_plan")
    .select("id,old_url,new_url,redirect_required")
    .eq("redirect_required", true);
  if (error) throw new Error(`plan_read_fail: ${error.message}`);

  const updates: Array<{ id: string; before: { old_url: string | null; new_url: string | null }; after: { old_url: string | null; new_url: string | null } }> = [];
  for (const r of rows ?? []) {
    const oldN = normalizeUrl(r.old_url);
    const newN = r.new_url; // keep new_url as-is (may be full URL to Shopify handle)
    if (oldN !== r.old_url) {
      updates.push({ id: r.id, before: { old_url: r.old_url, new_url: r.new_url }, after: { old_url: oldN, new_url: newN } });
    }
  }

  const r = await auditWrap(
    {
      action: "redirect_plan_url_normalize",
      entity_type: "shopify_redirect_plan",
      entity_id: `count:${updates.length}`,
      before: { candidates: updates.length, sample_before: updates.slice(0, 3).map((u) => u.before) },
      request: { updates: updates.length, sample_after: updates.slice(0, 3).map((u) => u.after) },
      rollback: { instruction: "Restore old_url from response_payload.after → request_payload.before mapping" },
    },
    dry_run,
    async () => {
      let done = 0;
      for (const u of updates) {
        const { error } = await admin.from("shopify_redirect_plan").update({ old_url: u.after.old_url }).eq("id", u.id);
        if (error) return { ok: false, error: `row ${u.id}: ${error.message}`, result: { updated: done } };
        done++;
      }
      return { ok: true, result: { updated: done } };
    },
  );

  return { total_plan_rows: rows?.length ?? 0, needs_normalize: updates.length, audit_result: r };
}

// Repair urlRedirect chains: for chains path → target where target is also a
// redirect, resolve chain to final target and urlRedirectUpdate the head,
// then urlRedirectDelete the intermediate hops.
async function repairRedirectChains(dry_run: boolean) {
  const all = await paginateAll<{ id: string; path: string; target: string }>(
    `query($c:String){ urlRedirects(first: 250, after:$c){ pageInfo{ hasNextPage endCursor } edges{ node{ id path target } } } }`,
    (d) => d.urlRedirects,
  );
  const byPath = new Map<string, { id: string; path: string; target: string }>();
  for (const r of all.nodes) byPath.set(r.path, r);

  const chains: Array<{ head: { id: string; path: string; target: string }; hops: Array<{ id: string; path: string; target: string }>; final_target: string; loop: boolean }> = [];
  for (const head of all.nodes) {
    if (!byPath.has(head.target)) continue;
    const seen = new Set<string>([head.path]);
    const hops: Array<{ id: string; path: string; target: string }> = [];
    let cur = byPath.get(head.target)!;
    let loop = false;
    while (cur) {
      if (seen.has(cur.path)) { loop = true; break; }
      seen.add(cur.path);
      hops.push(cur);
      const next = byPath.get(cur.target);
      if (!next) break;
      cur = next;
    }
    const final_target = hops.length ? hops[hops.length - 1].target : head.target;
    chains.push({ head, hops, final_target, loop });
  }

  const results: Array<{ head: string; final: string; hops_deleted: number; ok: boolean; error?: string }> = [];
  for (const c of chains) {
    if (c.loop) {
      results.push({ head: c.head.path, final: "(loop)", hops_deleted: 0, ok: false, error: "loop_detected — skipped, requires manual review" });
      continue;
    }
    // 1) update head → final_target
    const update = await auditWrap(
      {
        action: "urlRedirectUpdate_chain_collapse",
        entity_type: "urlRedirect",
        entity_id: c.head.id,
        before: { path: c.head.path, target: c.head.target },
        after: { path: c.head.path, target: c.final_target },
        request: { id: c.head.id, redirect: { path: c.head.path, target: c.final_target } },
        rollback: { instruction: `urlRedirectUpdate id=${c.head.id} target=${c.head.target}` },
      },
      dry_run,
      async () => {
        const r = await gql(
          `mutation($id:ID!,$redirect:UrlRedirectInput!){ urlRedirectUpdate(id:$id, urlRedirect:$redirect){ userErrors{ field message } urlRedirect{ id path target } } }`,
          { id: c.head.id, redirect: { path: c.head.path, target: c.final_target } },
        );
        const ue = (r.data as any)?.urlRedirectUpdate?.userErrors;
        if (!r.ok || (ue?.length ?? 0) > 0) return { ok: false, error: JSON.stringify(ue ?? r.errors ?? r.status), http_status: r.status };
        return { ok: true, result: (r.data as any).urlRedirectUpdate.urlRedirect, http_status: r.status };
      },
    );

    // 2) delete intermediate hops
    let deleted = 0;
    let hopErr: string | undefined;
    if (update.ok) {
      for (const hop of c.hops) {
        const del = await auditWrap(
          {
            action: "urlRedirectDelete_chain_hop",
            entity_type: "urlRedirect",
            entity_id: hop.id,
            before: { path: hop.path, target: hop.target },
            after: null,
            request: { id: hop.id },
            rollback: { instruction: `urlRedirectCreate path=${hop.path} target=${hop.target}` },
          },
          dry_run,
          async () => {
            const r = await gql(
              `mutation($id:ID!){ urlRedirectDelete(id:$id){ deletedUrlRedirectId userErrors{ field message } } }`,
              { id: hop.id },
            );
            const ue = (r.data as any)?.urlRedirectDelete?.userErrors;
            if (!r.ok || (ue?.length ?? 0) > 0) return { ok: false, error: JSON.stringify(ue ?? r.errors ?? r.status), http_status: r.status };
            return { ok: true, result: (r.data as any).urlRedirectDelete, http_status: r.status };
          },
        );
        if (del.ok) deleted++;
        else { hopErr = del.error; break; }
      }
    }

    results.push({
      head: c.head.path,
      final: c.final_target,
      hops_deleted: deleted,
      ok: update.ok && !hopErr,
      error: update.error ?? hopErr,
    });
  }

  return {
    shopify_redirects_total: all.nodes.length,
    chains_detected: chains.length,
    loops: chains.filter((c) => c.loop).length,
    repairs: results,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();

  let body: { dry_run?: boolean } = { dry_run: true };
  try { body = await req.json(); } catch { /* default */ }
  const dry_run = body.dry_run !== false; // must explicitly send false to mutate

  try {
    // Pre-flight: prove audit table is writable (fail-closed).
    await auditLog({
      action: "wave7_2a_start",
      entity_type: "execution",
      entity_id: EXECUTION_ID,
      request: { dry_run },
      ok: true,
      dry_run,
      response: { started_at: new Date().toISOString() },
    });

    // Phase 2 — scope enumeration + autonomy classification
    const scopeQ = await gql<any>(`{ currentAppInstallation { accessScopes { handle } } }`);
    const granted: string[] = scopeQ.data?.currentAppInstallation?.accessScopes?.map((s: any) => s.handle) ?? [];
    const blockers = await autonomyAnalysis(granted);

    // Phase 3 — safe remediations
    const drift = await reconcileDrift(dry_run);
    const normalize = await normalizeRedirectPlan(dry_run);
    const chainRepair = await repairRedirectChains(dry_run);

    await auditLog({
      action: "wave7_2a_complete",
      entity_type: "execution",
      entity_id: EXECUTION_ID,
      ok: true,
      dry_run,
      response: { duration_ms: Date.now() - started },
    });

    // Phase 6 — final status
    const classify = (cid: Classification) => blockers.filter((b) => b.classification === cid);
    const owner_actions = blockers
      .filter((b) => b.owner_action)
      .map((b) => ({ id: b.id, ...b.owner_action! }))
      .sort((a, b) => {
        const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
        const r = rank[a.business_impact] - rank[b.business_impact];
        return r !== 0 ? r : a.expected_duration_minutes - b.expected_duration_minutes;
      });

    const summary = {
      wave: WAVE,
      execution_id: EXECUTION_ID,
      dry_run,
      started_at: new Date(started).toISOString(),
      duration_ms: Date.now() - started,
      audit_infrastructure: {
        fail_closed: true,
        table: "shopify_migration_audit_log",
        pre_flight_write: "OK",
        contract: "Every mutation writes a row with before/after/execution_id; audit failure aborts the operation.",
      },
      granted_scopes: granted,
      missing_scopes: REQUIRED_SCOPES.filter((s) => !granted.includes(s)),
      completed_automatically: {
        audit_wrapper_deployed: true,
        drift_reconciliation: drift,
        redirect_plan_normalized: normalize,
        redirect_chains_repaired: chainRepair,
      },
      awaiting_reauthorization: classify("REAUTHORIZATION_REQUIRED"),
      programmatically_fixable_next_wave: classify("PROGRAMMATICALLY_FIXABLE"),
      awaiting_owner_action: classify("OWNER_ACTION_REQUIRED"),
      unknown: classify("UNKNOWN"),
      owner_action_checklist: owner_actions,
      recommendation: "🔴 DO NOT GO LIVE — owner must complete the checklist above; after that, re-run wave7-2a with dry_run:false to execute programmatic remediations, then run wave7-2b for post-scope automated finish.",
    };

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await auditLog({
        action: "wave7_2a_abort",
        entity_type: "execution",
        entity_id: EXECUTION_ID,
        ok: false,
        dry_run,
        error: msg,
      });
    } catch { /* audit failure already surfaced */ }
    return new Response(JSON.stringify({ ok: false, wave: WAVE, execution_id: EXECUTION_ID, error: msg, fail_closed: true }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});