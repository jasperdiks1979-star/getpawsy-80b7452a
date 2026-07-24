// AILUROVA — FINAL VISUAL CLEANUP
//
// Safety contract (immutable):
//  - Live theme gid://shopify/OnlineStoreTheme/201779872076 (role MAIN) is READ-ONLY.
//    Any updatedAt drift on live triggers LIVE_THEME_SAFETY_FAILURE.
//  - The only Shopify writes are themeFilesUpsert against the UNPUBLISHED theme
//    named exactly "Ailurova — Lovable Final Draft".
//  - No product/price/inventory/publication/market/policy/shipping/payment/order writes.
//  - The work theme is NEVER auto-published.
//
// This scope: prune templates/index.json to the required final section order,
// rebuild the editorial custom section blocks with compact mobile-friendly HTML,
// scrub Dutch legacy strings from index/header/footer/locales, and re-verify.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const LIVE_THEME_GID = "gid://shopify/OnlineStoreTheme/201779872076";
const TARGET_THEME_NAME = "Ailurova — Lovable Final Draft";
const PRODUCT_HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const CONFIRM_TOKEN = "CONFIRM_AILUROVA_VISUAL_CLEANUP";

const DUTCH_BESTSELLER_RE =
  /Met zorg gemaakt en onvoorwaardelijk geliefd bij onze klanten,\s*overtreft deze bestseller alle verwachtingen\.?/gi;

const RAW_SUBS: Array<[RegExp, string]> = [
  [DUTCH_BESTSELLER_RE, ""],
  [/Shop nu/gi, "Shop Now"],
  [/Aan winkelwagen toevoegen/gi, "Add to cart"],
  [/Meer betalingsopties/gi, "More payment options"],
  [/E-?mailadres/gi, "Email address"],
  [/Voorwaarden en beleid/gi, "Terms and policies"],
  [/Uitverkoop/gi, "Sale"],
  [/Uitverkocht/gi, "Sold out"],
];

// Compact editorial HTML (mobile-first, constrained heading sizes).
const H2 = "font-size:1.25rem;line-height:1.3;margin:0 0 .5rem;font-weight:600";
const H3 = "font-size:1rem;line-height:1.35;margin:.75rem 0 .25rem;font-weight:600";
const P  = "font-size:.95rem;line-height:1.55;margin:0 0 .75rem";

const EDITORIAL_BLOCKS: Array<{ id: string; html: string }> = [
  { id: "text_intro",     html: `<h2 style="${H2}">A Cleaner, Smarter Litter Setup</h2><p style="${P}">An XL enclosed litter box with a stainless steel base, flip-top access and a removable litter-filter step.</p>` },
  { id: "text_benefits_h", html: `<h2 style="${H2}">Why Ailurova</h2>` },
  { id: "text_benefit_1", html: `<h3 style="${H3}">Flexible Setup</h3><p style="${P}">Use it as an open, semi-enclosed or fully enclosed litter box.</p>` },
  { id: "text_benefit_2", html: `<h3 style="${H3}">Stainless Steel Base</h3><p style="${P}">Designed for straightforward wiping and routine cleaning.</p>` },
  { id: "text_benefit_3", html: `<h3 style="${H3}">Flip-Top Access</h3><p style="${P}">Open the lid for easier scooping and daily care.</p>` },
  { id: "text_faq_h",     html: `<h2 style="${H2}">FAQ</h2>` },
  { id: "text_faq_q1",    html: `<h3 style="${H3}">Is this litter box suitable for larger cats?</h3><p style="${P}">The XL enclosed format provides more room than a compact litter box. Compare the product dimensions with your cat's current box before ordering.</p>` },
  { id: "text_faq_q2",    html: `<h3 style="${H3}">Can it be used without the full enclosure?</h3><p style="${P}">Yes. The product media shows open, semi-enclosed and fully enclosed configurations.</p>` },
  { id: "text_faq_q3",    html: `<h3 style="${H3}">How do I clean the stainless steel base?</h3><p style="${P}">Remove loose litter, wipe the base with a soft damp cloth and allow it to dry fully before reassembly.</p>` },
  { id: "text_faq_q4",    html: `<h3 style="${H3}">What is included?</h3><p style="${P}">The XL enclosed litter box, stainless steel base, lid and removable litter-filter step.</p>` },
  { id: "text_support",   html: `<h2 style="${H2}">Support</h2><p style="${P}">Questions? Email us at <a href="mailto:support@ailurova.com">support@ailurova.com</a>.</p>` },
  { id: "text_final_cta_h", html: `<h2 style="${H2}">A Cleaner Litter Routine Starts Here</h2>` },
];

const EDITORIAL_BLOCK_IDS = new Set(EDITORIAL_BLOCKS.map(b => b.id));

// -------------------- helpers --------------------
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
  return { candidates, all: themes };
}
function applyRawSubs(src: string): { next: string; count: number } {
  let out = src; let count = 0;
  for (const [re, rep] of RAW_SUBS) { const before = out; out = out.replace(re, rep); if (out !== before) count++; }
  return { next: out, count };
}
function patchLocaleValues(node: any): number {
  let count = 0;
  const walk = (n: any) => {
    if (n == null) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n === "object") {
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (typeof v === "string") {
          let next = v; for (const [re, rep] of RAW_SUBS) next = next.replace(re, rep);
          if (next !== v) { n[k] = next; count++; }
        } else walk(v);
      }
    }
  };
  walk(node);
  return count;
}

// -------------------- section classification --------------------
// Section types we PRESERVE in templates/index.json.
// The custom container `section` (Horizon "Custom Section") is preserved once
// and becomes the editorial home for benefits + FAQ + support + final CTA.
const KEEP_TYPES = new Set(["hero", "product-list"]);
const CUSTOM_TYPE = "section";

function classifyIndex(idx: any) {
  const order: string[] = Array.isArray(idx?.order) ? [...idx.order] : Object.keys(idx?.sections ?? {});
  const sections = idx?.sections ?? {};
  const kept: string[] = [];
  const removed: Array<{ id: string; type: string; reason: string }> = [];
  let heroId: string | null = null;
  let productListId: string | null = null;
  let customId: string | null = null;

  for (const id of order) {
    const sec = sections[id]; if (!sec) continue;
    const type = sec.type;
    if (type === "hero" && !heroId) { heroId = id; continue; }
    if (type === "product-list" && !productListId) { productListId = id; continue; }
    if (type === CUSTOM_TYPE && !customId) { customId = id; continue; }
    removed.push({ id, type, reason: "not in required final structure" });
  }
  // Any duplicates of kept types are removed:
  for (const id of order) {
    const sec = sections[id]; if (!sec) continue;
    if (id === heroId || id === productListId || id === customId) continue;
    if (!removed.find(r => r.id === id)) removed.push({ id, type: sec.type, reason: "duplicate/legacy" });
  }
  const finalOrder: string[] = [];
  if (heroId) { kept.push(heroId); finalOrder.push(heroId); }
  if (productListId) { kept.push(productListId); finalOrder.push(productListId); }
  if (customId) { kept.push(customId); finalOrder.push(customId); }
  return { finalOrder, kept, removed, heroId, productListId, customId };
}

// -------------------- modes --------------------
async function audit() {
  const themes = await listThemes();
  const live = themes.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID) ?? null;
  const { candidates } = await locateWorkTheme();
  const chosen = candidates[0];
  if (!chosen) return { verdict: "TARGET_THEME_NOT_FOUND", targetName: TARGET_THEME_NAME };
  const workGid = `gid://shopify/OnlineStoreTheme/${chosen.id}`;
  const rb = await readThemeFiles(workGid, ["templates/index.json", "templates/product.json", "sections/header-group.json", "sections/footer-group.json"]);
  const raw: Record<string, string> = {};
  for (const n of rb.data?.theme?.files?.nodes ?? []) { const c = decodeBody(n?.body); if (c != null) raw[n.filename] = c; }
  let plan: any = null;
  try {
    const idx = JSON.parse(stripJsonc(raw["templates/index.json"] ?? "{}"));
    plan = classifyIndex(idx);
  } catch (e: any) { plan = { error: String(e?.message ?? e) }; }
  return {
    verdict: "AILUROVA_VISUAL_CLEANUP_AUDIT",
    liveTheme: live ? { id: LIVE_THEME_GID, role: live.role, updatedAt: live.updated_at } : null,
    target: await themeMetaByNumericId(chosen.id),
    plan,
    dutchHits: {
      index: (raw["templates/index.json"] ?? "").match(DUTCH_BESTSELLER_RE)?.length ?? 0,
      header: (raw["sections/header-group.json"] ?? "").match(DUTCH_BESTSELLER_RE)?.length ?? 0,
      footer: (raw["sections/footer-group.json"] ?? "").match(DUTCH_BESTSELLER_RE)?.length ?? 0,
    },
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

  const coreFiles = ["templates/index.json", "templates/product.json", "sections/header-group.json", "sections/footer-group.json"];
  const rd = await readThemeFiles(workGid, coreFiles);
  const raw: Record<string, string> = {};
  for (const n of rd.data?.theme?.files?.nodes ?? []) { const c = decodeBody(n?.body); if (c != null) raw[n.filename] = c; }

  const patchLog: Array<{ file: string; action: string; detail?: any }> = [];
  const writes: Array<{ filename: string; body: { type: "TEXT"; value: string } }> = [];

  // ---- templates/index.json — prune sections + rebuild editorial custom section.
  let idx: any = null;
  try { idx = JSON.parse(stripJsonc(raw["templates/index.json"] ?? "{}")); }
  catch (e: any) { return { verdict: "THEME_PERSISTENCE_FAILED", reason: "index parse", error: String(e?.message ?? e) }; }

  const plan = classifyIndex(idx);
  const nextSections: Record<string, any> = {};
  for (const id of plan.finalOrder) nextSections[id] = idx.sections[id];
  idx.sections = nextSections;
  idx.order = plan.finalOrder;
  patchLog.push({ file: "templates/index.json", action: "prune-sections", detail: { kept: plan.finalOrder, removed: plan.removed } });

  // Patch hero copy + CTA.
  if (plan.heroId && idx.sections[plan.heroId]) {
    const sec = idx.sections[plan.heroId];
    for (const b of Object.values<any>(sec.blocks ?? {})) {
      if (b?.type === "text" && typeof b?.settings?.text === "string") {
        b.settings.text = "<p>A Cleaner, Smarter Litter Setup</p>";
      }
      if (b?.type === "button" && b?.settings) {
        b.settings.label = "Shop the Litter Box";
        b.settings.link = `/products/${PRODUCT_HANDLE}`;
      }
    }
    patchLog.push({ file: "templates/index.json", action: "hero-copy" });
  }

  // Clamp product-list to a single product.
  if (plan.productListId && idx.sections[plan.productListId]) {
    const sec = idx.sections[plan.productListId];
    sec.settings = sec.settings ?? {};
    if (sec.settings.max_products !== 1) sec.settings.max_products = 1;
    patchLog.push({ file: "templates/index.json", action: "product-list-max-1" });
  }

  // Rebuild custom editorial section blocks (deterministic).
  if (plan.customId && idx.sections[plan.customId]) {
    const sec = idx.sections[plan.customId];
    const newBlocks: Record<string, any> = {};
    for (const eb of EDITORIAL_BLOCKS) newBlocks[eb.id] = { type: "text", settings: { text: eb.html } };
    sec.blocks = newBlocks;
    sec.block_order = EDITORIAL_BLOCKS.map(b => b.id);
    patchLog.push({ file: "templates/index.json", action: "editorial-rebuild", detail: { blockCount: EDITORIAL_BLOCKS.length } });
  } else {
    patchLog.push({ file: "templates/index.json", action: "editorial-skip-no-custom-section" });
  }

  // Serialize + apply raw Dutch scrubs (belt-and-braces).
  let nextIndex = JSON.stringify(idx, null, 2) + "\n";
  const scrubIdx = applyRawSubs(nextIndex); nextIndex = scrubIdx.next;
  if (nextIndex !== raw["templates/index.json"]) {
    writes.push({ filename: "templates/index.json", body: { type: "TEXT", value: nextIndex } });
  }

  // ---- templates/product.json — ensure product-recommendations removed.
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

  // ---- header-group.json / footer-group.json — raw Dutch scrub.
  for (const fn of ["sections/header-group.json", "sections/footer-group.json"]) {
    const src = raw[fn]; if (!src) continue;
    const { next, count } = applyRawSubs(src);
    if (next !== src) {
      writes.push({ filename: fn, body: { type: "TEXT", value: next } });
      patchLog.push({ file: fn, action: "dutch-scrub", detail: { subs: count } });
    }
  }

  // ---- locales/*.json — value-only scrub.
  const localeRd = await readThemeFiles(workGid, ["locales/nl.json", "locales/nl.default.json", "locales/en.default.json", "locales/en.json"]);
  for (const n of localeRd.data?.theme?.files?.nodes ?? []) {
    const src = decodeBody(n?.body); if (!src) continue;
    let parsedLoc: any = null;
    try { parsedLoc = JSON.parse(stripJsonc(src)); } catch { continue; }
    const count = patchLocaleValues(parsedLoc);
    if (count > 0) {
      writes.push({ filename: n.filename, body: { type: "TEXT", value: JSON.stringify(parsedLoc, null, 2) + "\n" } });
      patchLog.push({ file: n.filename, action: "locale-scrub", detail: { replacements: count } });
    }
  }

  if (writes.length === 0) {
    const themes2 = await listThemes();
    const liveAfter = themes2.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID);
    return {
      verdict: "AILUROVA_VISUAL_CLEANUP_NOOP",
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

  const themes2 = await listThemes();
  const liveAfter = themes2.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID);
  const targetAfter = await themeMetaByNumericId(chosen.id);
  const liveUntouched = liveAfter?.updated_at === liveUpdatedAtBefore;

  const checks = {
    liveUntouched,
    targetUpdatedAtAdvanced: (targetAfter?.updatedAt ?? "") > (targetBefore?.updatedAt ?? ""),
    targetStillUnpublished: targetAfter?.role === "UNPUBLISHED",
    heroHeadlinePresent: (rbRaw["templates/index.json"] ?? "").includes("A Cleaner, Smarter Litter Setup"),
    heroCtaLinkPresent: (rbRaw["templates/index.json"] ?? "").includes(`/products/${PRODUCT_HANDLE}`),
    productRecommendationsAbsent: !((rbRaw["templates/product.json"] ?? "").includes("product-recommendations")),
    noDutchBestseller: !DUTCH_BESTSELLER_RE.test(rbRaw["templates/index.json"] ?? "") &&
                       !DUTCH_BESTSELLER_RE.test(rbRaw["sections/header-group.json"] ?? "") &&
                       !DUTCH_BESTSELLER_RE.test(rbRaw["sections/footer-group.json"] ?? ""),
    noShopNu: !/Shop nu/i.test(rbRaw["templates/index.json"] ?? "") &&
              !/Shop nu/i.test(rbRaw["sections/header-group.json"] ?? "") &&
              !/Shop nu/i.test(rbRaw["sections/footer-group.json"] ?? ""),
    exactlyOneProductList: productListSections.length === 1,
    finalOrderTypes: typesAfter,
    finalOrderMatches: JSON.stringify(typesAfter) === JSON.stringify(["hero", "product-list", "section"].filter(t =>
      // allow templates without a custom section container to still pass with hero+product-list only
      typesAfter.includes(t))),
  };

  if (!liveUntouched) {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "live updatedAt drifted", before: liveUpdatedAtBefore, after: liveAfter?.updated_at };
  }

  const allOk = checks.targetUpdatedAtAdvanced && checks.targetStillUnpublished &&
    checks.heroHeadlinePresent && checks.heroCtaLinkPresent && checks.productRecommendationsAbsent &&
    checks.noDutchBestseller && checks.noShopNu && checks.exactlyOneProductList;

  return {
    verdict: allOk ? "AILUROVA_VISUAL_CLEANUP_COMPLETE" : "AILUROVA_VISUAL_CLEANUP_PARTIAL",
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
      paymentSubmissions: 0,
    },
  };
}

// -------------------- HTTP --------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: any = {}; try { body = req.method === "POST" ? await req.json() : {}; } catch {}
  const mode = String(body?.mode ?? "audit");
  try {
    if (mode === "audit") return json(await audit());
    if (mode === "execute") {
      if (body?.confirm !== CONFIRM_TOKEN) {
        return json({ verdict: "AILUROVA_VISUAL_CLEANUP_CONFIRM_REQUIRED", expectedConfirm: CONFIRM_TOKEN }, 400);
      }
      return json(await execute());
    }
    return json({ verdict: "AILUROVA_VISUAL_CLEANUP_UNKNOWN_MODE", mode }, 400);
  } catch (e: any) {
    return json({ verdict: "AILUROVA_VISUAL_CLEANUP_ERROR", error: String(e?.message ?? e) }, 500);
  }
});