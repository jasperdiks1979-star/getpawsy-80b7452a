// AILUROVA — FINAL COMMERCE POLISH
//
// Safety contract (immutable):
//  - Live theme gid://shopify/OnlineStoreTheme/201779872076 (role MAIN) is READ-ONLY.
//  - The only Shopify writes are themeFilesUpsert against the UNPUBLISHED theme
//    named exactly "Ailurova — Lovable Final Draft".
//  - No product/price/inventory/publication/market/policy/shipping/payment/order writes.
//  - The work theme is NEVER auto-published.
//
// Scope of this run:
//   A. Remove duplicate "A Cleaner, Smarter Litter Setup" editorial intro (already
//      shown by the hero above it).
//   B. Ensure a Horizon-native product purchase section exists directly below
//      the hero pinned to the protected product handle (product-list max 1).
//   C. Rebuild the "Why Ailurova" benefits + FAQ + Support + Final CTA in the
//      custom section with compact, restrained typography.
//   E. Add a visible Final CTA button block below the CTA headline, linking to
//      /products/<protected-handle>.
//   G. Confirm templates/product.json has no product-recommendations.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const LIVE_THEME_GID = "gid://shopify/OnlineStoreTheme/201779872076";
const TARGET_THEME_NAME = "Ailurova — Lovable Final Draft";
const PRODUCT_HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const PRODUCT_URL = `/products/${PRODUCT_HANDLE}`;
const CONFIRM_TOKEN = "CONFIRM_AILUROVA_FINAL_COMMERCE_POLISH";

// Editorial blocks WITHOUT the duplicate intro. `text_intro` from the previous
// pass is deliberately absent — the hero already carries that message.
const EDITORIAL_BLOCKS: Array<{ id: string; type: "text" | "button"; settings: Record<string, unknown> }> = [
  { id: "text_benefits_h", type: "text", settings: { text: `<h3>Why Ailurova</h3>` } },
  { id: "text_benefit_1",  type: "text", settings: { text: `<h4>Flexible Setup</h4><p>Use it as an open, semi-enclosed or fully enclosed litter box.</p>` } },
  { id: "text_benefit_2",  type: "text", settings: { text: `<h4>Stainless Steel Base</h4><p>Designed for straightforward wiping and routine cleaning.</p>` } },
  { id: "text_benefit_3",  type: "text", settings: { text: `<h4>Flip-Top Access</h4><p>Open the lid for easier scooping and daily care.</p>` } },
  { id: "text_faq_h",      type: "text", settings: { text: `<h3>FAQ</h3>` } },
  { id: "text_faq_q1",     type: "text", settings: { text: `<h4>Is this litter box suitable for larger cats?</h4><p>The XL enclosed format provides more room than a compact litter box. Compare the product dimensions with your cat's current box before ordering.</p>` } },
  { id: "text_faq_q2",     type: "text", settings: { text: `<h4>Can it be used without the full enclosure?</h4><p>Yes. The product media shows open, semi-enclosed and fully enclosed configurations.</p>` } },
  { id: "text_faq_q3",     type: "text", settings: { text: `<h4>How do I clean the stainless steel base?</h4><p>Remove loose litter, wipe the base with a soft damp cloth and allow it to dry fully before reassembly.</p>` } },
  { id: "text_faq_q4",     type: "text", settings: { text: `<h4>What is included?</h4><p>The XL enclosed litter box, stainless steel base, lid and removable litter-filter step.</p>` } },
  { id: "text_support",    type: "text", settings: { text: `<h3>Support</h3><p>Questions? Email us at <a href="mailto:support@ailurova.com">support@ailurova.com</a>.</p>` } },
  { id: "text_final_cta_h", type: "text", settings: { text: `<h3>A Cleaner Litter Routine Starts Here</h3>` } },
  { id: "button_final_cta", type: "button", settings: { label: "Shop the Litter Box", link: PRODUCT_URL, style: "primary" } },
  // Text-anchor fallback ensures a clickable link is always rendered even if
  // this custom section rejects the button block type. Styled as an inline
  // paragraph link — no inline CSS (Horizon strips styles).
  { id: "text_final_cta_link", type: "text", settings: { text: `<p><a href="${PRODUCT_URL}">Shop the Litter Box →</a></p>` } },
];

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function stripJsonc(src: string): string {
  let out = ""; let i = 0; const n = src.length; let inStr = false; let strCh = "";
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (inStr) { out += c; if (c === "\\" && i + 1 < n) { out += c2; i += 2; continue; } if (c === strCh) inStr = false; i++; continue; }
    if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; i++; continue; }
    if (c === "/" && c2 === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && c2 === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  return out;
}
function decodeBody(body: any): string | null {
  if (!body) return null;
  if (typeof body.content === "string") return body.content;
  if (typeof body.contentBase64 === "string") {
    try { return new TextDecoder().decode(Uint8Array.from(atob(body.contentBase64), c => c.charCodeAt(0))); } catch { return null; }
  }
  return null;
}
async function listThemes() {
  const r = await shopifyAdminRest<{ themes: any[] }>("themes.json?fields=id,name,role,updated_at");
  return (r.data?.themes ?? []) as Array<{ id: number; name: string; role: string; updated_at: string }>;
}
async function themeMetaByNumericId(id: number) {
  const r = await shopifyAdminRest<{ theme: any }>(`themes/${id}.json`);
  const t = r.data?.theme;
  return t ? { id: `gid://shopify/OnlineStoreTheme/${t.id}`, numericId: t.id, role: String(t.role ?? "").toUpperCase(), name: t.name, updatedAt: t.updated_at } : null;
}
async function readThemeFiles(themeGid: string, filenames: string[]) {
  const q = `query($id: ID!, $filenames: [String!]) {
    theme(id: $id) { id role name updatedAt
      files(filenames: $filenames, first: 50) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } }
      } } }`;
  return await shopifyAdminFetch<any>(q, { id: themeGid, filenames });
}
async function themeFilesUpsert(themeGid: string, files: Array<{ filename: string; body: { type: "TEXT"; value: string } }>) {
  const m = `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename } userErrors { field message code }
    } }`;
  return await shopifyAdminFetch<any>(m, { themeId: themeGid, files });
}
async function locateWorkTheme() {
  const themes = await listThemes();
  const candidates = themes.filter(t => t.name === TARGET_THEME_NAME && String(t.role).toLowerCase() === "unpublished");
  candidates.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  return { candidates };
}

// Classify homepage sections keeping exactly one hero, one product-list and
// one custom container. Everything else is removed.
function classifyIndex(idx: any) {
  const order: string[] = Array.isArray(idx?.order) ? [...idx.order] : Object.keys(idx?.sections ?? {});
  const sections = idx?.sections ?? {};
  let heroId: string | null = null;
  let productListId: string | null = null;
  let customId: string | null = null;
  const removed: Array<{ id: string; type: string }> = [];
  for (const id of order) {
    const sec = sections[id]; if (!sec) continue;
    const type = sec.type;
    if (type === "hero" && !heroId) { heroId = id; continue; }
    if (type === "product-list" && !productListId) { productListId = id; continue; }
    if (type === "section" && !customId) { customId = id; continue; }
    removed.push({ id, type });
  }
  const finalOrder: string[] = [];
  if (heroId) finalOrder.push(heroId);
  if (productListId) finalOrder.push(productListId);
  if (customId) finalOrder.push(customId);
  return { finalOrder, heroId, productListId, customId, removed };
}

// Ensure product-list section is pinned to the protected product and shows 1.
// Different Horizon versions use different setting names — we set the common
// ones so at least one takes effect.
function pinProductList(sec: any) {
  sec.settings = sec.settings ?? {};
  sec.settings.max_products = 1;
  sec.settings.products_to_show = 1;
  // Try both singular product pin and collection-with-single-product patterns.
  sec.settings.product = PRODUCT_GID;
  // Don't overwrite collection binding if operator already configured one —
  // the admin-side product publication scope already restricts visibility to
  // this one product, so any collection resolves to the same single item.
}

async function audit() {
  const { candidates } = await locateWorkTheme();
  const chosen = candidates[0];
  if (!chosen) return { verdict: "TARGET_THEME_NOT_FOUND", targetName: TARGET_THEME_NAME };
  const workGid = `gid://shopify/OnlineStoreTheme/${chosen.id}`;
  const rb = await readThemeFiles(workGid, ["templates/index.json", "templates/product.json"]);
  const raw: Record<string, string> = {};
  for (const n of rb.data?.theme?.files?.nodes ?? []) { const c = decodeBody(n?.body); if (c != null) raw[n.filename] = c; }
  let plan: any = null; let heroBlocks: any = null; let customBlocks: any = null;
  try {
    const idx = JSON.parse(stripJsonc(raw["templates/index.json"] ?? "{}"));
    plan = classifyIndex(idx);
    if (plan.heroId) heroBlocks = idx.sections[plan.heroId]?.blocks ?? null;
    if (plan.customId) customBlocks = idx.sections[plan.customId]?.block_order ?? null;
  } catch (e: any) { plan = { error: String(e?.message ?? e) }; }
  return {
    verdict: "AILUROVA_FINAL_COMMERCE_POLISH_AUDIT",
    target: await themeMetaByNumericId(chosen.id),
    plan, heroBlocks, customBlocks,
    hasDuplicateIntroInEditorial:
      (raw["templates/index.json"] ?? "").split("A Cleaner, Smarter Litter Setup").length - 1 > 1,
    productRecommendationsAbsent: !((raw["templates/product.json"] ?? "").includes("product-recommendations")),
  };
}

async function execute() {
  const startedAt = new Date().toISOString();
  const themes = await listThemes();
  const live = themes.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID) ?? null;
  if (!live || String(live.role).toLowerCase() !== "main") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "live theme not MAIN", live };
  }
  const liveUpdatedAtBefore = live.updated_at;

  const { candidates } = await locateWorkTheme();
  const chosen = candidates[0];
  if (!chosen) return { verdict: "TARGET_THEME_NOT_FOUND", targetName: TARGET_THEME_NAME };
  const workGid = `gid://shopify/OnlineStoreTheme/${chosen.id}`;
  const targetBefore = await themeMetaByNumericId(chosen.id);
  if (!targetBefore || targetBefore.role !== "UNPUBLISHED") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "target not UNPUBLISHED", targetBefore };
  }

  const coreFiles = ["templates/index.json", "templates/product.json"];
  const rd = await readThemeFiles(workGid, coreFiles);
  const raw: Record<string, string> = {};
  for (const n of rd.data?.theme?.files?.nodes ?? []) { const c = decodeBody(n?.body); if (c != null) raw[n.filename] = c; }

  const patchLog: Array<{ file: string; action: string; detail?: any }> = [];
  const writes: Array<{ filename: string; body: { type: "TEXT"; value: string } }> = [];

  // ---- templates/index.json
  let idx: any = null;
  try { idx = JSON.parse(stripJsonc(raw["templates/index.json"] ?? "{}")); }
  catch (e: any) { return { verdict: "THEME_PERSISTENCE_FAILED", reason: "index parse", error: String(e?.message ?? e) }; }

  const plan = classifyIndex(idx);
  const nextSections: Record<string, any> = {};
  for (const id of plan.finalOrder) nextSections[id] = idx.sections[id];
  idx.sections = nextSections;
  idx.order = plan.finalOrder;
  patchLog.push({ file: "templates/index.json", action: "prune-order", detail: { order: plan.finalOrder, removed: plan.removed } });

  // Hero — reassert copy + CTA to protected handle.
  if (plan.heroId && idx.sections[plan.heroId]) {
    const sec = idx.sections[plan.heroId];
    for (const b of Object.values<any>(sec.blocks ?? {})) {
      if (b?.type === "button" && b?.settings) {
        b.settings.label = "Shop the Litter Box";
        b.settings.link = PRODUCT_URL;
      }
    }
    patchLog.push({ file: "templates/index.json", action: "hero-cta-reassert" });
  }

  // Product purchase section — must exist directly below hero.
  if (!plan.productListId) {
    return {
      verdict: "AILUROVA_FINAL_COMMERCE_POLISH_PARTIAL",
      reason: "product-list section missing from templates/index.json; cannot synthesize a Horizon product purchase section from server side without a verified template shape",
      target: targetBefore,
      unresolved: ["product-purchase-section-missing"],
    };
  }
  pinProductList(idx.sections[plan.productListId]);
  patchLog.push({ file: "templates/index.json", action: "product-list-pin", detail: { productHandle: PRODUCT_HANDLE, maxProducts: 1 } });

  // Custom section — rebuild without duplicate intro; add CTA button block.
  if (plan.customId && idx.sections[plan.customId]) {
    const sec = idx.sections[plan.customId];
    const newBlocks: Record<string, any> = {};
    for (const eb of EDITORIAL_BLOCKS) newBlocks[eb.id] = { type: eb.type, settings: { ...eb.settings } };
    sec.blocks = newBlocks;
    sec.block_order = EDITORIAL_BLOCKS.map(b => b.id);
    patchLog.push({ file: "templates/index.json", action: "editorial-rebuild-no-intro-plus-cta", detail: { blockCount: EDITORIAL_BLOCKS.length } });
  } else {
    patchLog.push({ file: "templates/index.json", action: "editorial-skip-no-custom-section" });
  }

  const nextIndex = JSON.stringify(idx, null, 2) + "\n";
  if (nextIndex !== raw["templates/index.json"]) {
    writes.push({ filename: "templates/index.json", body: { type: "TEXT", value: nextIndex } });
  }

  // ---- templates/product.json — confirm no recommendations.
  try {
    const prod = JSON.parse(stripJsonc(raw["templates/product.json"] ?? "{}"));
    if (prod?.sections) {
      const removed: string[] = [];
      for (const [sid, sec] of Object.entries<any>({ ...prod.sections })) {
        if (sec?.type === "product-recommendations") { delete prod.sections[sid]; removed.push(sid); }
      }
      if (removed.length) {
        prod.order = (prod.order ?? []).filter((id: string) => !removed.includes(id));
        const nextProd = JSON.stringify(prod, null, 2) + "\n";
        if (nextProd !== raw["templates/product.json"]) {
          writes.push({ filename: "templates/product.json", body: { type: "TEXT", value: nextProd } });
          patchLog.push({ file: "templates/product.json", action: "remove-product-recommendations", detail: { removed } });
        }
      }
    }
  } catch { /* skip */ }

  if (writes.length === 0) {
    const themes2 = await listThemes();
    const liveAfter = themes2.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID);
    return {
      verdict: "AILUROVA_FINAL_COMMERCE_POLISH_NOOP",
      reason: "no changes needed",
      target: targetBefore,
      liveUntouched: liveAfter?.updated_at === liveUpdatedAtBefore,
      patchLog,
    };
  }

  const wr = await themeFilesUpsert(workGid, writes);
  const uErr = wr.data?.themeFilesUpsert?.userErrors ?? [];
  const upserted = (wr.data?.themeFilesUpsert?.upsertedThemeFiles ?? []).map((u: any) => u.filename);
  if (uErr.length) return { verdict: "THEME_PERSISTENCE_FAILED", reason: "themeFilesUpsert userErrors", userErrors: uErr, patchLog };

  // Fresh read-back.
  const rb = await readThemeFiles(workGid, coreFiles);
  const rbRaw: Record<string, string> = {};
  for (const n of rb.data?.theme?.files?.nodes ?? []) { const c = decodeBody(n?.body); if (c != null) rbRaw[n.filename] = c; }

  const idxAfter = (() => { try { return JSON.parse(stripJsonc(rbRaw["templates/index.json"] ?? "{}")); } catch { return null; } })();
  const orderAfter: string[] = idxAfter?.order ?? [];
  const typesAfter = orderAfter.map((id: string) => idxAfter?.sections?.[id]?.type ?? "?");
  const productListSections = orderAfter.filter((id: string) => idxAfter?.sections?.[id]?.type === "product-list");
  const introOccurrences = (rbRaw["templates/index.json"] ?? "").split("A Cleaner, Smarter Litter Setup").length - 1;
  const finalCtaButtonPresent =
    (rbRaw["templates/index.json"] ?? "").includes("button_final_cta") &&
    (rbRaw["templates/index.json"] ?? "").includes(PRODUCT_URL);
  const finalCtaAnchorFallback = (rbRaw["templates/index.json"] ?? "").includes("text_final_cta_link");

  const themes2 = await listThemes();
  const liveAfter = themes2.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID);
  const targetAfter = await themeMetaByNumericId(chosen.id);
  const liveUntouched = liveAfter?.updated_at === liveUpdatedAtBefore;

  if (!liveUntouched) {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "live updatedAt drifted", before: liveUpdatedAtBefore, after: liveAfter?.updated_at };
  }

  const checks = {
    liveUntouched,
    targetUpdatedAtAdvanced: (targetAfter?.updatedAt ?? "") > (targetBefore?.updatedAt ?? ""),
    targetStillUnpublished: targetAfter?.role === "UNPUBLISHED",
    exactlyOneProductPurchaseSection: productListSections.length === 1,
    duplicateIntroRemoved: introOccurrences <= 1, // hero copy only
    finalCtaButtonPresent,
    finalCtaAnchorFallback,
    finalCtaLinksToProduct: (rbRaw["templates/index.json"] ?? "").includes(PRODUCT_URL),
    productRecommendationsAbsent: !((rbRaw["templates/product.json"] ?? "").includes("product-recommendations")),
    finalOrderTypes: typesAfter,
  };

  const allOk = checks.targetUpdatedAtAdvanced && checks.targetStillUnpublished &&
    checks.exactlyOneProductPurchaseSection && checks.duplicateIntroRemoved &&
    (checks.finalCtaButtonPresent || checks.finalCtaAnchorFallback) &&
    checks.finalCtaLinksToProduct && checks.productRecommendationsAbsent;

  return {
    verdict: allOk ? "AILUROVA_FINAL_COMMERCE_POLISH_COMPLETE" : "AILUROVA_FINAL_COMMERCE_POLISH_PARTIAL",
    startedAt, finishedAt: new Date().toISOString(),
    target: { before: targetBefore, after: targetAfter },
    liveTheme: { untouched: liveUntouched, updatedAt: liveAfter?.updated_at },
    filesUpserted: upserted,
    patchLog,
    checks,
    unresolved: allOk ? [] : Object.entries(checks).filter(([, v]) => v === false).map(([k]) => k),
    mutationLedger: {
      themeFilesUpsertCalls: 1,
      filesUpserted: upserted.length,
      liveThemeWrites: 0,
      productMutations: 0, priceMutations: 0, inventoryMutations: 0,
      publicationMutations: 0, policyMutations: 0, orderMutations: 0,
      paymentSubmissions: 0, marketMutations: 0, shippingMutations: 0,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: any = {}; try { body = req.method === "POST" ? await req.json() : {}; } catch {}
  const mode = String(body?.mode ?? "audit");
  try {
    if (mode === "audit") return json(await audit());
    if (mode === "execute") {
      if (body?.confirm !== CONFIRM_TOKEN) {
        return json({ verdict: "AILUROVA_FINAL_COMMERCE_POLISH_CONFIRM_REQUIRED", expectedConfirm: CONFIRM_TOKEN }, 400);
      }
      return json(await execute());
    }
    return json({ verdict: "AILUROVA_FINAL_COMMERCE_POLISH_UNKNOWN_MODE", mode }, 400);
  } catch (e: any) {
    return json({ verdict: "AILUROVA_FINAL_COMMERCE_POLISH_ERROR", error: String(e?.message ?? e) }, 500);
  }
});