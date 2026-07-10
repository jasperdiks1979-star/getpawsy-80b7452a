// Wave 5 — Production Enablement (write phase, dev store only).
// Executes: URL redirects (from shopify_redirect_plan), policy/content pages,
// and main/footer navigation menus. Idempotent via shopify_id_map.
// Auth: client_credentials via _shared/shopify-token-provider.ts.
// Never publishes theme, never enables Online Store, never touches DNS.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WAVE = "W5";

function pathOf(u: string): string {
  try { return new URL(u).pathname; } catch { return u.startsWith("/") ? u : `/${u}`; }
}

async function audit(action: string, entity_type: string, entity_id: string, ok: boolean, status: number, req: unknown, res: unknown, error?: string) {
  try {
    await sb.from("shopify_migration_audit_log").insert({
      wave: WAVE, action, entity_type, entity_id, actor: "shopify-wave5",
      dry_run: false, request_payload: req as any, response_payload: res as any,
      http_status: status, ok, error: error ?? null,
    });
  } catch { /* audit best-effort */ }
}

async function alreadyDone(source_type: string, source_id: string): Promise<string | null> {
  const { data } = await sb.from("shopify_id_map")
    .select("shopify_gid").eq("source_type", source_type).eq("source_id", source_id).maybeSingle();
  return (data?.shopify_gid as string | undefined) ?? null;
}

async function markDone(source_type: string, source_id: string, gid: string, handle?: string) {
  await sb.from("shopify_id_map").upsert({
    source_type, source_id, shopify_gid: gid, shopify_handle: handle ?? null,
    status: "created", wave: WAVE, last_synced_at: new Date().toISOString(),
  }, { onConflict: "source_type,source_id" });
}

// ─── Phase 3: Redirects ───────────────────────────────────────────────
const REDIRECT_MUTATION = `
mutation r($input: UrlRedirectInput!) {
  urlRedirectCreate(urlRedirect: $input) {
    urlRedirect { id path target }
    userErrors { field message code }
  }
}`;

async function runRedirects(limit: number) {
  const { data: rows, error } = await sb.from("shopify_redirect_plan")
    .select("id, old_url, new_url").eq("redirect_required", true).limit(limit);
  if (error) throw error;

  let created = 0, skipped = 0, failed = 0;
  const failures: any[] = [];

  for (const row of rows ?? []) {
    const src = String(row.id);
    if (await alreadyDone("redirect", src)) { skipped++; continue; }

    const path = pathOf(row.old_url as string);
    const target = pathOf(row.new_url as string);
    if (!path || !target || path === target) { skipped++; continue; }

    const input = { path, target };
    const t0 = Date.now();
    const resp = await shopifyAdminFetch<any>(REDIRECT_MUTATION, { input });
    const dt = Date.now() - t0;
    const ue = resp.data?.urlRedirectCreate?.userErrors ?? [];
    const ur = resp.data?.urlRedirectCreate?.urlRedirect;

    if (ur?.id) {
      await markDone("redirect", src, ur.id, path);
      created++;
      await audit("urlRedirectCreate", "redirect", src, true, resp.status, input, { id: ur.id }, undefined);
    } else if (ue.some((e: any) => /already exists|has already been taken/i.test(e.message ?? ""))) {
      // Treat existing redirect as success (idempotent).
      await markDone("redirect", src, `existing:${path}`, path);
      skipped++;
      await audit("urlRedirectCreate", "redirect", src, true, resp.status, input, { existing: true }, undefined);
    } else {
      failed++;
      failures.push({ id: src, path, target, errors: ue, status: resp.status });
      await audit("urlRedirectCreate", "redirect", src, false, resp.status, input, resp, JSON.stringify(ue));
    }
  }
  return { created, skipped, failed, failures, considered: rows?.length ?? 0 };
}

// ─── Phase 6: Pages ──────────────────────────────────────────────────
const PAGE_CREATE = `
mutation p($page: PageCreateInput!) {
  pageCreate(page: $page) {
    page { id handle title isPublished }
    userErrors { field message code }
  }
}`;

const PAGES: Array<{ key: string; title: string; handle: string; body: string }> = [
  { key: "about", title: "About GetPawsy", handle: "about",
    body: "<p>GetPawsy curates pet essentials designed to make everyday life easier for pets and their people.</p>" },
  { key: "faq", title: "Frequently Asked Questions", handle: "faq",
    body: "<h2>Shipping</h2><p>Most orders ship within 2–5 business days.</p><h2>Returns</h2><p>30-day satisfaction guarantee.</p>" },
  { key: "shipping", title: "Shipping Policy", handle: "shipping",
    body: "<p>We ship worldwide. Delivery times vary by destination. Tracking is provided on every order.</p>" },
  { key: "returns", title: "Returns & Refunds", handle: "returns",
    body: "<p>Return unused items within 30 days for a full refund. Contact support@getpawsy.pet to start a return.</p>" },
  { key: "privacy", title: "Privacy Policy", handle: "privacy-policy",
    body: "<p>We respect your privacy. See how we collect, use, and protect your data.</p>" },
  { key: "terms", title: "Terms of Service", handle: "terms-of-service",
    body: "<p>By using GetPawsy you agree to these terms.</p>" },
  { key: "contact", title: "Contact Us", handle: "contact",
    body: "<p>Email us at support@getpawsy.pet. We reply within one business day.</p>" },
  { key: "guides-landing", title: "Pet Care Guides", handle: "guides",
    body: "<p>Expert guides on caring for dogs, cats, and small pets.</p>" },
  { key: "blog-landing", title: "GetPawsy Blog", handle: "blog",
    body: "<p>News, product picks, and pet care stories.</p>" },
];

async function runPages() {
  let created = 0, skipped = 0, failed = 0;
  const failures: any[] = [];
  for (const p of PAGES) {
    if (await alreadyDone("page", p.key)) { skipped++; continue; }
    const input = { title: p.title, handle: p.handle, body: p.body, isPublished: false };
    const t0 = Date.now();
    const resp = await shopifyAdminFetch<any>(PAGE_CREATE, { page: input });
    const dt = Date.now() - t0;
    const page = resp.data?.pageCreate?.page;
    const ue = resp.data?.pageCreate?.userErrors ?? [];
    if (page?.id) {
      await markDone("page", p.key, page.id, page.handle);
      created++;
      await audit("pageCreate", "page", p.key, true, resp.status, input, { id: page.id, handle: page.handle }, undefined);
    } else if (ue.some((e: any) => /taken|exists/i.test(e.message ?? ""))) {
      await markDone("page", p.key, `existing:${p.handle}`, p.handle);
      skipped++;
    } else {
      failed++;
      failures.push({ key: p.key, errors: ue, status: resp.status });
      await audit("pageCreate", "page", p.key, false, resp.status, input, resp, JSON.stringify(ue));
    }
  }
  return { created, skipped, failed, failures };
}

// ─── Phase 2: Menus ──────────────────────────────────────────────────
const MENU_CREATE = `
mutation m($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
  menuCreate(title: $title, handle: $handle, items: $items) {
    menu { id handle title }
    userErrors { field message code }
  }
}`;

async function buildMainMenuItems() {
  // Pull created collections as top-level menu targets.
  const { data: collections } = await sb.from("shopify_collection_map")
    .select("handle, title, shopify_collection_gid").eq("status", "created").limit(12);

  const items: any[] = [
    { title: "Shop All", type: "HTTP", url: "/collections/all" },
  ];
  for (const c of collections ?? []) {
    if (!c.handle) continue;
    items.push({
      title: c.title,
      type: "COLLECTION",
      resourceId: c.shopify_collection_gid,
    });
  }
  items.push({ title: "Guides", type: "HTTP", url: "/pages/guides" });
  items.push({ title: "Blog", type: "HTTP", url: "/pages/blog" });
  items.push({ title: "Contact", type: "HTTP", url: "/pages/contact" });
  return items;
}

function footerMenuItems() {
  return [
    { title: "About", type: "HTTP", url: "/pages/about" },
    { title: "FAQ", type: "HTTP", url: "/pages/faq" },
    { title: "Shipping", type: "HTTP", url: "/pages/shipping" },
    { title: "Returns", type: "HTTP", url: "/pages/returns" },
    { title: "Privacy Policy", type: "HTTP", url: "/pages/privacy-policy" },
    { title: "Terms of Service", type: "HTTP", url: "/pages/terms-of-service" },
    { title: "Contact", type: "HTTP", url: "/pages/contact" },
  ];
}

async function createMenu(key: string, title: string, handle: string, items: any[]) {
  if (await alreadyDone("menu", key)) return { skipped: true };
  const resp = await shopifyAdminFetch<any>(MENU_CREATE, { title, handle, items });
  const menu = resp.data?.menuCreate?.menu;
  const ue = resp.data?.menuCreate?.userErrors ?? [];
  if (menu?.id) {
    await markDone("menu", key, menu.id, menu.handle);
    await audit("menuCreate", "menu", key, true, resp.status, { title, handle, itemCount: items.length }, { id: menu.id }, undefined);
    return { created: true, id: menu.id };
  }
  if (ue.some((e: any) => /taken|exists/i.test(e.message ?? ""))) {
    await markDone("menu", key, `existing:${handle}`, handle);
    return { skipped: true };
  }
  await audit("menuCreate", "menu", key, false, resp.status, { title, handle }, resp, JSON.stringify(ue));
  return { failed: true, errors: ue };
}

async function runMenus() {
  const main = await createMenu("main", "Main menu", "main-menu", await buildMainMenuItems());
  const footer = await createMenu("footer", "Footer menu", "footer", footerMenuItems());
  return { main, footer };
}

// ─── HTTP entry ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const phase = String(body.phase ?? "all");
    const limit = Number(body.limit ?? 300);

    const out: any = { wave: WAVE, phase };
    if (phase === "redirects" || phase === "all") out.redirects = await runRedirects(limit);
    if (phase === "pages" || phase === "all") out.pages = await runPages();
    if (phase === "menus" || phase === "all") out.menus = await runMenus();

    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});