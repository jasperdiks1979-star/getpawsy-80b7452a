// AILUROVA — REAL STOREFRONT REBUILD
//
// Rebuilds the homepage of the UNPUBLISHED work theme
// "Ailurova — Lovable Final Draft" (target GID 202525999436) into a
// premium one-product storefront:
//   1. Announcement bar (header-group, untouched)
//   2. Header (header-group, untouched)
//   3. Hero  (existing hero section, copy reasserted)
//   4. Featured product purchase section (Horizon native, pinned to protected product)
//   5. Three-benefit section (compact cards inside custom `section` container)
//   6. Compact FAQ (compact rows inside custom `section` container)
//   7. Footer (footer-group, untouched)
//
// Safety contract:
//  - Live theme 201779872076 (MAIN) is READ-ONLY.
//  - No product/price/inventory/publication/policy/shipping/order writes.
//  - Never auto-publishes the work theme.
//  - Only writes to templates/index.json + templates/product.json in the target theme.
//
// The function probes sections/*.liquid to discover a Horizon-native
// featured-product / product-information section it can safely instantiate.
// If none is available it returns AILUROVA_FEATURED_PRODUCT_SCHEMA_BLOCKED
// with the exact schemas discovered — it does NOT fall back to product-list.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const LIVE_THEME_GID = "gid://shopify/OnlineStoreTheme/201779872076";
const TARGET_THEME_NAME = "Ailurova — Lovable Final Draft";
const PRODUCT_HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const PRODUCT_NUMERIC_ID = 15889810194764;
const PRODUCT_URL = `/products/${PRODUCT_HANDLE}`;
const CONFIRM_TOKEN = "CONFIRM_AILUROVA_REAL_STOREFRONT_REBUILD";

// Compact benefit cards + compact FAQ. Two custom `section` containers keep
// the visual grouping clean and avoid one giant text column.
const BENEFITS_BLOCKS = [
  { id: "b_h",   type: "text", settings: { text: `<h2>Why Ailurova</h2>` } },
  { id: "b_1h",  type: "text", settings: { text: `<h3>Flexible Setup</h3>` } },
  { id: "b_1p",  type: "text", settings: { text: `<p>Use it as an open, semi-enclosed or fully enclosed litter box.</p>` } },
  { id: "b_2h",  type: "text", settings: { text: `<h3>Stainless Steel Base</h3>` } },
  { id: "b_2p",  type: "text", settings: { text: `<p>Designed for straightforward wiping and routine cleaning.</p>` } },
  { id: "b_3h",  type: "text", settings: { text: `<h3>Flip-Top Access</h3>` } },
  { id: "b_3p",  type: "text", settings: { text: `<p>Open the lid for easier scooping and daily care.</p>` } },
] as const;

const FAQ_BLOCKS = [
  { id: "f_h",    type: "text", settings: { text: `<h2>Frequently Asked Questions</h2>` } },
  { id: "f_q1h",  type: "text", settings: { text: `<h3>Is this litter box suitable for larger cats?</h3>` } },
  { id: "f_q1p",  type: "text", settings: { text: `<p>The XL enclosed format provides more room than a compact litter box. Compare the product dimensions with your cat's current box before ordering.</p>` } },
  { id: "f_q2h",  type: "text", settings: { text: `<h3>Can it be used without the full enclosure?</h3>` } },
  { id: "f_q2p",  type: "text", settings: { text: `<p>Yes. The product media shows open, semi-enclosed and fully enclosed configurations.</p>` } },
  { id: "f_q3h",  type: "text", settings: { text: `<h3>How do I clean the stainless steel base?</h3>` } },
  { id: "f_q3p",  type: "text", settings: { text: `<p>Remove loose litter, wipe the base with a soft damp cloth and allow it to dry fully before reassembly.</p>` } },
  { id: "f_q4h",  type: "text", settings: { text: `<h3>What is included?</h3>` } },
  { id: "f_q4p",  type: "text", settings: { text: `<p>The XL enclosed litter box, stainless steel base, lid and removable litter-filter step.</p>` } },
] as const;

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
      files(filenames: $filenames, first: 100) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } }
      } } }`;
  return await shopifyAdminFetch<any>(q, { id: themeGid, filenames });
}
async function listSectionFilenames(themeGid: string): Promise<string[]> {
  // Enumerate all writable theme files, paginating fully. Horizon draft
  // themes may store sections under `sections/*.liquid`, `blocks/*.liquid`,
  // or expose them exclusively via the theme app extension (in which case
  // no liquid files are returned and we cannot instantiate a new featured
  // product section from the server).
  const q = `query($id: ID!, $after: String) {
    theme(id: $id) {
      files(first: 250, after: $after) {
        nodes { filename }
        pageInfo { hasNextPage endCursor }
      } } }`;
  const all: string[] = [];
  let after: string | null = null;
  for (let i = 0; i < 20; i++) {
    const r = await shopifyAdminFetch<any>(q, { id: themeGid, after });
    const conn = r.data?.theme?.files;
    for (const n of conn?.nodes ?? []) all.push(n.filename);
    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return all.filter(n =>
    (n.startsWith("sections/") || n.startsWith("blocks/")) && n.endsWith(".liquid")
  );
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
  const c = themes
    .filter(t => t.name === TARGET_THEME_NAME && String(t.role).toLowerCase() === "unpublished")
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  return c[0] ?? null;
}

function extractSchemaJson(liquid: string): any | null {
  const m = liquid.match(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/**
 * Discover a Horizon-native product purchase section suitable for the
 * homepage. We prefer sections that declare a `product` setting of type
 * `product` AND advertise support on the `index` template (or omit the
 * `enabled_on/disabled_on` restriction entirely). Returns the best match
 * plus the full schema map for diagnostics.
 */
async function discoverFeaturedProductSection(themeGid: string) {
  const names = await listSectionFilenames(themeGid);
  // Batch schema reads in chunks of 40 to stay under GraphQL limits.
  const schemas: Record<string, { schema: any; sectionType: string }> = {};
  for (let i = 0; i < names.length; i += 40) {
    const batch = names.slice(i, i + 40);
    const r = await readThemeFiles(themeGid, batch);
    for (const n of r.data?.theme?.files?.nodes ?? []) {
      const body = decodeBody(n?.body);
      if (!body) continue;
      const s = extractSchemaJson(body);
      if (!s) continue;
      const sectionType = n.filename.replace(/^sections\//, "").replace(/\.liquid$/, "");
      schemas[n.filename] = { schema: s, sectionType };
    }
  }

  type Candidate = { filename: string; sectionType: string; productSetting: string; schema: any; score: number; reason: string };
  const candidates: Candidate[] = [];
  for (const [filename, { schema, sectionType }] of Object.entries(schemas)) {
    const settings = Array.isArray(schema?.settings) ? schema.settings : [];
    const productSetting = settings.find((s: any) => s?.type === "product");
    if (!productSetting) continue;
    // Determine template applicability.
    const enabledOn = schema?.enabled_on?.templates;
    const disabledOn = schema?.disabled_on?.templates;
    let allowedOnIndex = true;
    if (Array.isArray(enabledOn) && enabledOn.length > 0) {
      allowedOnIndex = enabledOn.includes("*") || enabledOn.includes("index");
    }
    if (Array.isArray(disabledOn) && (disabledOn.includes("*") || disabledOn.includes("index"))) {
      allowedOnIndex = false;
    }
    if (!allowedOnIndex) continue;
    // Score: prefer names that look like a purchase section.
    let score = 0; let reason = "";
    if (sectionType === "featured-product")                 { score += 12; reason = "featured-product"; }
    else if (sectionType === "product-information")         { score += 11; reason = "product-information"; }
    else if (/^featured[-_ ]?product/i.test(sectionType))   { score += 10; reason = "featured-product-family"; }
    else if (/product[-_ ]?information/i.test(sectionType)) { score += 9;  reason = "product-information-family"; }
    else if (/^product$/i.test(sectionType))                { score += 8;  reason = "product"; }
    else if (/product/i.test(sectionType) && !/list|recommend|card|grid|rail|carousel/i.test(sectionType)) {
      score += 5; reason = "product-related";
    } else {
      continue; // ignore product-list / recommendation / grid sections
    }
    candidates.push({ filename, sectionType, productSetting: productSetting.id, schema, score, reason });
  }
  candidates.sort((a, b) => b.score - a.score);
  return { candidates, schemaCount: Object.keys(schemas).length, sectionFilenames: names };
}

async function execute(req: Request) {
  const url = new URL(req.url);
  const confirm = url.searchParams.get("confirm") ?? "";
  const mode = url.searchParams.get("mode") ?? "execute";

  const target = await locateWorkTheme();
  if (!target) return { verdict: "TARGET_THEME_NOT_FOUND", targetName: TARGET_THEME_NAME };
  const workGid = `gid://shopify/OnlineStoreTheme/${target.id}`;
  const before = await themeMetaByNumericId(target.id);
  if (!before || before.role !== "UNPUBLISHED") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "target not UNPUBLISHED", before };
  }

  // ---- Section discovery
  const discovery = await discoverFeaturedProductSection(workGid);
  const chosenSection = discovery.candidates[0] ?? null;

  if (mode === "probe" || !chosenSection) {
    if (!chosenSection) {
      return {
        verdict: "AILUROVA_FEATURED_PRODUCT_SCHEMA_BLOCKED",
        reason: "no Horizon section with a `product` setting is available on the index template",
        target: before,
        sectionFilesInspected: discovery.schemaCount,
        sectionFilesTotal: discovery.sectionFilenames.length,
      sectionFilesSample: discovery.sectionFilenames.slice(0, 40),
        candidates: discovery.candidates.map(c => ({
          filename: c.filename, sectionType: c.sectionType, productSetting: c.productSetting, reason: c.reason,
        })),
      };
    }
    return {
      verdict: "AILUROVA_STOREFRONT_PROBE",
      target: before,
      chosenSection: {
        filename: chosenSection.filename,
        sectionType: chosenSection.sectionType,
        productSetting: chosenSection.productSetting,
        reason: chosenSection.reason,
      },
      alternatives: discovery.candidates.slice(1, 5).map(c => ({
        filename: c.filename, sectionType: c.sectionType, productSetting: c.productSetting,
      })),
      sectionFilesInspected: discovery.schemaCount,
    };
  }

  if (confirm !== CONFIRM_TOKEN) {
    return {
      verdict: "CONFIRM_TOKEN_REQUIRED",
      hint: `add ?confirm=${CONFIRM_TOKEN} to execute the rebuild`,
      chosenSection: { filename: chosenSection.filename, sectionType: chosenSection.sectionType },
    };
  }

  // ---- Live-theme safety snapshot
  const themes = await listThemes();
  const live = themes.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID);
  if (!live || String(live.role).toLowerCase() !== "main") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "live not MAIN", live };
  }
  const liveUpdatedAtBefore = live.updated_at;

  const coreFiles = ["templates/index.json", "templates/product.json"];
  const rd = await readThemeFiles(workGid, coreFiles);
  const raw: Record<string, string> = {};
  for (const n of rd.data?.theme?.files?.nodes ?? []) { const c = decodeBody(n?.body); if (c != null) raw[n.filename] = c; }

  // ---- Build new templates/index.json
  let idx: any = null;
  try { idx = JSON.parse(stripJsonc(raw["templates/index.json"] ?? "{}")); }
  catch (e: any) { return { verdict: "THEME_PERSISTENCE_FAILED", reason: "index parse", error: String(e?.message ?? e) }; }

  // Reuse existing hero section verbatim (keeps the current lifestyle image).
  const oldOrder: string[] = Array.isArray(idx?.order) ? idx.order : Object.keys(idx?.sections ?? {});
  const oldSections = idx?.sections ?? {};
  let heroId: string | null = null;
  let customId: string | null = null;
  for (const id of oldOrder) {
    const t = oldSections[id]?.type;
    if (t === "hero" && !heroId) heroId = id;
    else if (t === "section" && !customId) customId = id;
  }
  const heroSection = heroId ? oldSections[heroId] : null;
  const customSection = customId ? oldSections[customId] : null;
  if (heroSection) {
    // Reassert hero copy + CTA.
    for (const b of Object.values<any>(heroSection.blocks ?? {})) {
      if (b?.type === "button" && b?.settings) {
        b.settings.label = "Shop the Litter Box";
        b.settings.link = PRODUCT_URL;
      }
      if (b?.type === "heading" && b?.settings && typeof b.settings.heading === "string") {
        b.settings.heading = "A Cleaner, Smarter Litter Setup";
      }
      if (b?.type === "text" && b?.settings && typeof b.settings.text === "string") {
        b.settings.text = "<p>An XL enclosed litter box with a stainless steel base, flip-top access and a removable litter-filter step.</p>";
      }
    }
  }

  // Build the featured product section using the discovered schema.
  const featuredType = chosenSection.sectionType;
  const productSettingKey = chosenSection.productSetting;
  // Horizon product settings expect either the handle string or the numeric ID
  // depending on the theme version. We set both common shapes; the schema will
  // silently ignore whichever it doesn't understand.
  const featuredSettings: Record<string, unknown> = {};
  featuredSettings[productSettingKey] = PRODUCT_HANDLE;
  // Some Horizon builds also read `product_id`; harmless if unused.
  if (productSettingKey !== "product_id") featuredSettings["product_id"] = PRODUCT_NUMERIC_ID;

  const heroKey = "hero_ail";
  const featuredKey = "featured_product_ail";
  // Reuse the existing custom section container id if present — its schema
  // defaults are known to persist. Fall back to a fresh key only if none.
  const benefitsKey = customId ?? "benefits_ail";
  const faqKey = customId ? `${customId}_faq` : "faq_ail";

  const nextSections: Record<string, any> = {};
  if (heroSection) nextSections[heroKey] = heroSection;
  nextSections[featuredKey] = { type: featuredType, settings: featuredSettings };
  // Combine benefits + FAQ into one container to reuse the existing custom
  // section's proven settings. Prior split-container attempts failed with
  // FILE_VALIDATION_ERROR because a fresh `section` container lacks the
  // schema defaults Horizon requires on the `text` setting.
  const combined = [...BENEFITS_BLOCKS, ...FAQ_BLOCKS];
  const baseSettings = customSection?.settings ? { ...customSection.settings } : {};
  nextSections[benefitsKey] = {
    ...(customSection ?? { type: "section" }),
    type: (customSection?.type ?? "section"),
    settings: baseSettings,
    blocks: Object.fromEntries(combined.map(b => [b.id, { type: b.type, settings: { ...b.settings } }])),
    block_order: combined.map(b => b.id),
  };
  const nextOrder = [
    ...(heroSection ? [heroKey] : []),
    featuredKey,
    benefitsKey,
  ];

  const removed = oldOrder.filter(id => id !== heroId).map(id => ({ id, type: oldSections[id]?.type ?? "?" }));

  const nextIdx = { ...idx, sections: nextSections, order: nextOrder };
  const nextIndex = JSON.stringify(nextIdx, null, 2) + "\n";

  const writes: Array<{ filename: string; body: { type: "TEXT"; value: string } }> = [];
  if (nextIndex !== raw["templates/index.json"]) {
    writes.push({ filename: "templates/index.json", body: { type: "TEXT", value: nextIndex } });
  }

  // ---- templates/product.json — ensure no recommendations
  try {
    const prod = JSON.parse(stripJsonc(raw["templates/product.json"] ?? "{}"));
    if (prod?.sections) {
      const removedProd: string[] = [];
      for (const [sid, sec] of Object.entries<any>({ ...prod.sections })) {
        if (sec?.type === "product-recommendations") { delete prod.sections[sid]; removedProd.push(sid); }
      }
      if (removedProd.length) {
        prod.order = (prod.order ?? []).filter((id: string) => !removedProd.includes(id));
        const nextProd = JSON.stringify(prod, null, 2) + "\n";
        if (nextProd !== raw["templates/product.json"]) {
          writes.push({ filename: "templates/product.json", body: { type: "TEXT", value: nextProd } });
        }
      }
    }
  } catch { /* skip */ }

  if (writes.length === 0) {
    return { verdict: "AILUROVA_REAL_STOREFRONT_REBUILD_NOOP", target: before };
  }

  const wr = await themeFilesUpsert(workGid, writes);
  const uErr = wr.data?.themeFilesUpsert?.userErrors ?? [];
  if (uErr.length) {
    return { verdict: "THEME_PERSISTENCE_FAILED", reason: "themeFilesUpsert userErrors", userErrors: uErr };
  }

  // ---- Fresh read-back
  const rb = await readThemeFiles(workGid, coreFiles);
  const rbRaw: Record<string, string> = {};
  for (const n of rb.data?.theme?.files?.nodes ?? []) { const c = decodeBody(n?.body); if (c != null) rbRaw[n.filename] = c; }
  const idxAfter = (() => { try { return JSON.parse(stripJsonc(rbRaw["templates/index.json"] ?? "{}")); } catch { return null; } })();
  const orderAfter: string[] = idxAfter?.order ?? [];
  const typesAfter = orderAfter.map((id: string) => idxAfter?.sections?.[id]?.type ?? "?");
  const featuredSecs = orderAfter.filter(id => idxAfter?.sections?.[id]?.type === featuredType);
  const productListSecs = orderAfter.filter(id => idxAfter?.sections?.[id]?.type === "product-list");
  const featuredBoundToProduct = featuredSecs.some(id => {
    const s = idxAfter?.sections?.[id]?.settings ?? {};
    return Object.values(s).some(v => v === PRODUCT_HANDLE || v === PRODUCT_NUMERIC_ID);
  });
  const introOccurrences = (rbRaw["templates/index.json"] ?? "").split("A Cleaner Litter Routine Starts Here").length - 1;
  const supportOccurrences = (rbRaw["templates/index.json"] ?? "").split("mailto:support@ailurova.com").length - 1;
  const finalCtaFallback = (rbRaw["templates/index.json"] ?? "").includes("text_final_cta_link");
  const productRecsAbsent = !((rbRaw["templates/product.json"] ?? "").includes("product-recommendations"));

  const themes2 = await listThemes();
  const liveAfter = themes2.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID);
  const targetAfter = await themeMetaByNumericId(target.id);
  const liveUntouched = liveAfter?.updated_at === liveUpdatedAtBefore;
  if (!liveUntouched) {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "live updatedAt drifted", before: liveUpdatedAtBefore, after: liveAfter?.updated_at };
  }

  const checks = {
    liveUntouched,
    targetStillUnpublished: targetAfter?.role === "UNPUBLISHED",
    targetUpdatedAtAdvanced: (targetAfter?.updatedAt ?? "") > (before?.updatedAt ?? ""),
    finalOrderTypes: typesAfter,
    productListAbsent: productListSecs.length === 0,
    exactlyOneFeaturedProductSection: featuredSecs.length === 1,
    featuredBoundToProduct,
    duplicateFinalCtaRemoved: introOccurrences === 0 && !finalCtaFallback,
    newsletterAbsent: !typesAfter.some(t => /newsletter|email[-_]?signup/i.test(t)),
    supportBlockRemovedFromHomepage: supportOccurrences === 0,
    productRecommendationsAbsent: productRecsAbsent,
    removedSectionsFromHomepage: removed,
    chosenFeaturedType: featuredType,
  };

  const allOk = checks.targetStillUnpublished && checks.targetUpdatedAtAdvanced &&
    checks.productListAbsent && checks.exactlyOneFeaturedProductSection &&
    checks.featuredBoundToProduct && checks.duplicateFinalCtaRemoved &&
    checks.newsletterAbsent && checks.productRecommendationsAbsent;

  return {
    verdict: allOk ? "AILUROVA_REAL_STOREFRONT_REBUILD_COMPLETE" : "AILUROVA_REAL_STOREFRONT_REBUILD_PARTIAL",
    target: targetAfter,
    before,
    liveTheme: { id: LIVE_THEME_GID, updatedAtBefore: liveUpdatedAtBefore, updatedAtAfter: liveAfter?.updated_at, liveUntouched },
    chosenSection: { filename: chosenSection.filename, sectionType: featuredType, productSetting: productSettingKey },
    upserted: (wr.data?.themeFilesUpsert?.upsertedThemeFiles ?? []).map((u: any) => u.filename),
    checks,
    mutations: {
      themeFilesUpsertCalls: 1,
      filesUpserted: writes.length,
      liveThemeWrites: 0,
      productMutations: 0, priceMutations: 0, inventoryMutations: 0, publicationMutations: 0,
      policyMutations: 0, shippingMutations: 0, orderMutations: 0, paymentMutations: 0,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  try {
    const out = await execute(req);
    return json(out);
  } catch (e: any) {
    return json({ verdict: "REBUILD_ERROR", error: String(e?.message ?? e) }, 500);
  }
});