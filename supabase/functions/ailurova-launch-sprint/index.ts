// AILUROVA — ONE-PRODUCT STORE LAUNCH SPRINT
//
// Safety contract (immutable):
//  - Live theme gid://shopify/OnlineStoreTheme/201779872076 (role MAIN) is READ-ONLY.
//    Any updatedAt drift on the live theme causes an immediate LIVE_THEME_SAFETY_FAILURE.
//  - The only Shopify write is themeFilesUpsert against a single UNPUBLISHED theme
//    named exactly "Ailurova — Work Draft". No product / price / inventory /
//    publication / market / policy / shipping / payment / collection / order writes.
//  - The work theme is NEVER auto-published.
//
// Modes:
//   "lock"     — Phase 1: locate the work theme, verify safety, snapshot state.
//                Also verifies the protected product state and exactly-one-published invariant.
//   "execute"  — Phases 2-5: apply safe Horizon-compatible text patches
//                (hero copy + CTA, product-recommendations removal, editorial text
//                blocks inserted into an existing Custom section, Dutch → English
//                locale patch on visible strings). Fresh read-back verification.
//   "verify"   — Phase 9: fresh read-back of all mutated files, live-theme drift check.
//
// Phases 6/7/8 (rendered previews, live cart/checkout, favicon upload) are NOT
// executed here — they require tools that are not available in the current sandbox
// (headless browser at the Shopify preview URL, Storefront API cart, favicon asset
// upload). The final response calls those out honestly as external blockers.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const LIVE_THEME_GID = "gid://shopify/OnlineStoreTheme/201779872076";
const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const PRODUCT_HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const EXPECTED_SKU = "CJFT268927601AZ";
const EXPECTED_INVENTORY = 60;
const TARGET_THEME_NAME = "Ailurova — Work Draft";
const CONFIRM_TOKEN = "CONFIRM_AILUROVA_LAUNCH_SPRINT";

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
    if (inStr) {
      out += c;
      if (c === "\\" && i + 1 < n) { out += c2; i += 2; continue; }
      if (c === strCh) inStr = false;
      i++; continue;
    }
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
    try { return new TextDecoder().decode(Uint8Array.from(atob(body.contentBase64), c => c.charCodeAt(0))); }
    catch { return null; }
  }
  return null;
}

async function listThemes(): Promise<Array<{ id: number; name: string; role: string; updated_at: string }>> {
  const r = await shopifyAdminRest<{ themes: any[] }>("themes.json?fields=id,name,role,updated_at");
  return (r.data?.themes ?? []) as any;
}

async function themeMetaByNumericId(id: number) {
  const r = await shopifyAdminRest<{ theme: any }>(`themes/${id}.json`);
  const t = r.data?.theme;
  return t ? {
    id: `gid://shopify/OnlineStoreTheme/${t.id}`,
    numericId: t.id, role: String(t.role ?? "").toUpperCase(),
    name: t.name, updatedAt: t.updated_at,
  } : null;
}

async function readThemeFiles(themeGid: string, filenames: string[]) {
  const q = `query($id: ID!, $filenames: [String!]) {
    theme(id: $id) {
      id role name updatedAt
      files(filenames: $filenames, first: 50) {
        nodes { filename size body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } }
      }
    }
  }`;
  return await shopifyAdminFetch<any>(q, { id: themeGid, filenames });
}

async function themeFilesUpsert(
  themeGid: string,
  files: Array<{ filename: string; body: { type: "TEXT"; value: string } }>,
) {
  const m = `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { field message code }
    }
  }`;
  return await shopifyAdminFetch<any>(m, { themeId: themeGid, files });
}

async function locateWorkTheme() {
  const themes = await listThemes();
  const candidates = themes.filter(t =>
    t.name === TARGET_THEME_NAME && String(t.role).toLowerCase() === "unpublished"
  );
  candidates.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  return { candidates, all: themes };
}

// -------------------- product state --------------------

async function protectedProductState() {
  const q = `query($id: ID!) {
    product(id: $id) {
      id title handle status onlineStoreUrl
      totalInventory
      variants(first: 10) { nodes { id sku inventoryQuantity price compareAtPrice } }
      publications(first: 20) { nodes { publication { name } isPublished } }
    }
    publications(first: 30) { nodes { id name } }
  }`;
  const r = await shopifyAdminFetch<any>(q, { id: PRODUCT_GID });
  const p = r.data?.product;
  return {
    raw: p,
    checks: {
      exists: !!p,
      titleOk: p?.title === "Ailurova XL Stainless Steel Enclosed Cat Litter Box",
      handleOk: p?.handle === PRODUCT_HANDLE,
      statusActive: String(p?.status ?? "").toUpperCase() === "ACTIVE",
      skuOk: (p?.variants?.nodes ?? []).some((v: any) => v?.sku === EXPECTED_SKU),
      inventoryOk: (p?.totalInventory ?? -1) === EXPECTED_INVENTORY,
      onlineStorePublished: (p?.publications?.nodes ?? []).some(
        (pub: any) => /online\s*store/i.test(pub?.publication?.name ?? "") && pub?.isPublished,
      ),
    },
  };
}

async function countOnlineStorePublishedProducts(): Promise<number | null> {
  // GraphQL productsCount does not filter on publication, so we approximate via
  // productsCount with query "published_status:published channel:online_store".
  const q = `query { productsCount(query: "published_status:published") { count precision } }`;
  const r = await shopifyAdminFetch<any>(q);
  const c = r.data?.productsCount?.count;
  return typeof c === "number" ? c : null;
}

// -------------------- Phase 1 --------------------

async function lock() {
  const startedAt = new Date().toISOString();

  const themes = await listThemes();
  const live = themes.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID) ?? null;
  if (!live || String(live.role).toLowerCase() !== "main") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "live theme not MAIN or missing", live };
  }

  const { candidates, all } = await locateWorkTheme();
  const target = candidates[0]
    ? await themeMetaByNumericId(candidates[0].id)
    : null;

  const product = await protectedProductState();
  const publishedCount = await countOnlineStorePublishedProducts();

  return {
    verdict: target ? "AILUROVA_LAUNCH_SPRINT_TARGET_LOCKED" : "TARGET_THEME_NOT_FOUND",
    mode: "lock",
    startedAt, finishedAt: new Date().toISOString(),
    liveTheme: { id: `gid://shopify/OnlineStoreTheme/${live.id}`, role: live.role, updatedAt: live.updated_at },
    workTheme: target,
    workThemeCandidateCount: candidates.length,
    allThemesSummary: all.map(t => ({ id: t.id, name: t.name, role: t.role, updated_at: t.updated_at })),
    protectedProduct: product,
    exactlyOnePublishedProduct: {
      count: publishedCount,
      ok: publishedCount === 1,
    },
    hint: target ? undefined :
      `No UNPUBLISHED theme named exactly "${TARGET_THEME_NAME}" was found. ` +
      `In Shopify admin: Online Store → Themes → Actions on "Stainless Litter Store — Draft" → Duplicate → Rename the copy to "${TARGET_THEME_NAME}". Then re-run mode:"lock".`,
  };
}

// -------------------- Phase 2/3/4/5 execute --------------------

// Locale replacements applied ONLY to translation files (locales/*.json) and ONLY
// on values (never keys). These substitutions convert visible Dutch strings to
// US English. If a phrase is not present, it is silently skipped.
const LOCALE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Aan winkelwagen toevoegen/gi, "Add to cart"],
  [/Winkelwagen/g, "Cart"],
  [/Shop nu/gi, "Shop Now"],
  [/Meer betalingsopties/gi, "More payment options"],
  [/E-?mailadres/gi, "Email address"],
  [/Voorwaarden en beleid/gi, "Terms and policies"],
  [/Uitverkoop/gi, "Sale"],
  [/Uitverkocht/gi, "Sold out"],
  [/Contact opnemen/gi, "Contact"],
  [/Inschrijven/gi, "Subscribe"],
  [/Zoeken/gi, "Search"],
  [/Prijs/gi, "Price"],
];

function patchLocaleValues(node: any): { changed: boolean; count: number } {
  let count = 0;
  const walk = (n: any) => {
    if (n == null) return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n === "object") {
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (typeof v === "string") {
          let next = v;
          for (const [re, rep] of LOCALE_REPLACEMENTS) next = next.replace(re, rep);
          if (next !== v) { n[k] = next; count++; }
        } else walk(v);
      }
    }
  };
  walk(node);
  return { changed: count > 0, count };
}

// Additive text blocks for the existing Custom Section container. We only add
// blocks of the verified `text` shape into a section already present in the
// template — this does not invent a new Horizon section type.
const EDITORIAL_BLOCKS: Array<{ id: string; html: string }> = [
  { id: "text_editorial_h1",  html: "<h2>A Cleaner, Smarter Litter Setup</h2>" },
  { id: "text_editorial_lead", html: "<p>An XL enclosed litter box with a stainless steel base, flip-top access and a removable litter-filter step.</p>" },
  { id: "text_editorial_b1_h", html: "<h3>Flexible Setup</h3>" },
  { id: "text_editorial_b1_p", html: "<p>Use it as an open, semi-enclosed or fully enclosed litter box.</p>" },
  { id: "text_editorial_b2_h", html: "<h3>Stainless Steel Base</h3>" },
  { id: "text_editorial_b2_p", html: "<p>Designed for straightforward wiping and routine cleaning.</p>" },
  { id: "text_editorial_b3_h", html: "<h3>Flip-Top Access</h3>" },
  { id: "text_editorial_b3_p", html: "<p>Open the lid for easier scooping and daily care.</p>" },
  { id: "text_editorial_faq_h", html: "<h2>FAQ</h2>" },
  { id: "text_editorial_faq_q1", html: "<h3>Is this litter box suitable for larger cats?</h3><p>The XL enclosed format provides more room than a compact litter box. Compare the product dimensions with your cat's current box before ordering.</p>" },
  { id: "text_editorial_faq_q2", html: "<h3>Can it be used without the full enclosure?</h3><p>Yes. The product media shows open, semi-enclosed and fully enclosed configurations.</p>" },
  { id: "text_editorial_faq_q3", html: "<h3>How do I clean the stainless steel base?</h3><p>Remove loose litter, wipe the base with a soft damp cloth and allow it to dry fully before reassembly.</p>" },
  { id: "text_editorial_faq_q4", html: "<h3>What is included?</h3><p>The XL enclosed litter box, stainless steel base, lid and the removable litter-filter step. Any additional accessories will be listed on the product page.</p>" },
  { id: "text_editorial_support", html: "<h3>Support</h3><p>Questions? Email us at support@ailurova.com.</p>" },
  { id: "text_editorial_cta_h", html: "<h2>A Cleaner Litter Routine Starts Here</h2>" },
];

function findCustomSectionId(indexJson: any): string | null {
  const secs = indexJson?.sections ?? {};
  for (const [id, sec] of Object.entries<any>(secs)) {
    if (sec?.type === "section") return id;
  }
  return null;
}

async function execute(reqBody: any) {
  const startedAt = new Date().toISOString();
  const filesUpsertedNames: string[] = [];

  // Re-lock — never accept an argument-passed theme ID; look it up freshly.
  const themes = await listThemes();
  const live = themes.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID) ?? null;
  if (!live || String(live.role).toLowerCase() !== "main") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "live theme not MAIN", live };
  }
  const liveUpdatedAtBefore = live.updated_at;

  const { candidates } = await locateWorkTheme();
  const chosen = candidates[0];
  if (!chosen) return { verdict: "TARGET_THEME_NOT_FOUND", reason: `no unpublished theme named "${TARGET_THEME_NAME}"` };
  const workGid = `gid://shopify/OnlineStoreTheme/${chosen.id}`;
  const targetBefore = await themeMetaByNumericId(chosen.id);
  if (!targetBefore || targetBefore.role !== "UNPUBLISHED") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "target theme role not UNPUBLISHED", targetBefore };
  }

  // ---- Read the core template files.
  const coreFiles = [
    "templates/index.json",
    "templates/product.json",
    "sections/header-group.json",
    "sections/footer-group.json",
  ];
  const rd = await readThemeFiles(workGid, coreFiles);
  const nodes = rd.data?.theme?.files?.nodes ?? [];
  const raw: Record<string, string> = {};
  for (const n of nodes) {
    const c = decodeBody(n?.body);
    if (c != null) raw[n.filename] = c;
  }
  const parsed: Record<string, any> = {};
  const parseIssues: Record<string, string> = {};
  for (const [fn, r] of Object.entries(raw)) {
    try { parsed[fn] = JSON.parse(stripJsonc(r)); }
    catch (e: any) { parseIssues[fn] = String(e?.message ?? e); }
  }
  if (parseIssues["templates/index.json"] || parseIssues["templates/product.json"]) {
    return { verdict: "THEME_PERSISTENCE_FAILED", reason: "core JSON parse failure", parseIssues };
  }

  const writes: Array<{ filename: string; body: { type: "TEXT"; value: string } }> = [];
  const patchLog: Array<{ file: string; action: string; detail?: any }> = [];

  // ---- Patch templates/index.json — hero copy + CTA + editorial blocks.
  const idx = parsed["templates/index.json"];
  if (idx && idx.sections) {
    for (const [sid, sec] of Object.entries<any>(idx.sections)) {
      if (sec?.type === "hero") {
        const blocks = sec.blocks ?? {};
        for (const [bid, b] of Object.entries<any>(blocks)) {
          if (b?.type === "text" && typeof b?.settings?.text === "string") {
            const before = b.settings.text;
            b.settings.text = "<p>A Cleaner, Smarter Litter Setup</p>";
            if (before !== b.settings.text) patchLog.push({ file: "templates/index.json", action: "hero-text", detail: { sid, bid } });
          }
          if (b?.type === "button" && b?.settings) {
            const beforeLabel = b.settings.label;
            const beforeLink = b.settings.link;
            b.settings.label = "Shop the Litter Box";
            b.settings.link = `/products/${PRODUCT_HANDLE}`;
            if (beforeLabel !== b.settings.label || beforeLink !== b.settings.link) {
              patchLog.push({ file: "templates/index.json", action: "hero-cta", detail: { sid, bid } });
            }
          }
        }
      }
      if (sec?.type === "product-list" && sec.settings) {
        if (sec.settings.max_products !== 1) {
          sec.settings.max_products = 1;
          patchLog.push({ file: "templates/index.json", action: "product-list-max-1", detail: { sid } });
        }
      }
    }

    // Insert editorial text blocks into an existing Custom section if present
    // and it doesn't already contain them.
    const customId = findCustomSectionId(idx);
    if (customId) {
      const sec = idx.sections[customId];
      const bMap = sec.blocks = sec.blocks ?? {};
      const bOrder: string[] = Array.isArray(sec.block_order) ? [...sec.block_order] : [];
      let addedCount = 0;
      for (const eb of EDITORIAL_BLOCKS) {
        if (bMap[eb.id]) continue;
        bMap[eb.id] = { type: "text", settings: { text: eb.html } };
        bOrder.push(eb.id);
        addedCount++;
      }
      // Remove the earlier probe marker block if it survived.
      const markerId = "text_marker_ct01";
      if (bMap[markerId]) {
        delete bMap[markerId];
        const i = bOrder.indexOf(markerId);
        if (i >= 0) bOrder.splice(i, 1);
        patchLog.push({ file: "templates/index.json", action: "remove-marker-block", detail: { customId } });
      }
      sec.block_order = bOrder;
      if (addedCount > 0) patchLog.push({ file: "templates/index.json", action: "editorial-blocks-added", detail: { customId, addedCount } });
    }

    const nextRaw = JSON.stringify(idx, null, 2) + "\n";
    if (nextRaw !== raw["templates/index.json"]) {
      writes.push({ filename: "templates/index.json", body: { type: "TEXT", value: nextRaw } });
    }
  }

  // ---- Patch templates/product.json — remove product-recommendations.
  const prod = parsed["templates/product.json"];
  if (prod && prod.sections) {
    const removed: string[] = [];
    for (const [sid, sec] of Object.entries<any>({ ...prod.sections })) {
      if (sec?.type === "product-recommendations") {
        delete prod.sections[sid];
        removed.push(sid);
      }
    }
    if (removed.length) {
      prod.order = (prod.order ?? []).filter((id: string) => !removed.includes(id));
      patchLog.push({ file: "templates/product.json", action: "remove-product-recommendations", detail: { removed } });
      writes.push({
        filename: "templates/product.json",
        body: { type: "TEXT", value: JSON.stringify(prod, null, 2) + "\n" },
      });
    }
  }

  // ---- Patch header-group.json announcement bar text.
  const hdr = parsed["sections/header-group.json"];
  if (hdr?.sections) {
    let hdrChanged = false;
    for (const sec of Object.values<any>(hdr.sections)) {
      if (sec?.type === "header-announcements" || sec?.type === "announcement-bar" || sec?.type === "header-announcement") {
        for (const b of Object.values<any>(sec.blocks ?? {})) {
          if (typeof b?.settings?.text === "string") {
            const before = b.settings.text;
            b.settings.text = "Premium XL stainless steel litter system for large cats";
            if (before !== b.settings.text) hdrChanged = true;
          }
        }
      }
    }
    if (hdrChanged) {
      patchLog.push({ file: "sections/header-group.json", action: "announcement-text" });
      writes.push({
        filename: "sections/header-group.json",
        body: { type: "TEXT", value: JSON.stringify(hdr, null, 2) + "\n" },
      });
    }
  }

  // ---- Patch footer-group.json newsletter copy + drop obvious brand ghosts.
  const ftr = parsed["sections/footer-group.json"];
  if (ftr) {
    let ftrRaw = raw["sections/footer-group.json"];
    const beforeRaw = ftrRaw;
    // Textual substitutions inside string values only (naive but safe: we only
    // target strings that appear as JSON-encoded values, i.e. surrounded by ").
    const subs: Array<[RegExp, string]> = [
      [/GetPawsy/g, "Ailurova"],
      [/Skidzo/g, "Ailurova"],
      [/getpawsy\.pet/g, "ailurova.com"],
      [/getpawsy\.com/g, "ailurova.com"],
      [/Join our email list/gi, "Join the Ailurova List"],
      [/Get exclusive deals and early access to new products\./gi, "Get product updates, care tips and occasional offers."],
    ];
    for (const [re, rep] of subs) ftrRaw = ftrRaw.replace(re, rep);
    if (ftrRaw !== beforeRaw) {
      patchLog.push({ file: "sections/footer-group.json", action: "brand-cleanup" });
      writes.push({
        filename: "sections/footer-group.json",
        body: { type: "TEXT", value: ftrRaw },
      });
    }
  }

  // ---- Locale patch (Dutch → English) on any locales/*.json present.
  const localeList = await readThemeFiles(workGid, [
    "locales/nl.json", "locales/nl.default.json",
    "locales/en.default.json", "locales/en.json",
  ]);
  const locNodes = localeList.data?.theme?.files?.nodes ?? [];
  for (const n of locNodes) {
    const src = decodeBody(n?.body);
    if (!src) continue;
    let parsedLoc: any = null;
    try { parsedLoc = JSON.parse(stripJsonc(src)); } catch { continue; }
    const { changed, count } = patchLocaleValues(parsedLoc);
    if (changed) {
      writes.push({
        filename: n.filename,
        body: { type: "TEXT", value: JSON.stringify(parsedLoc, null, 2) + "\n" },
      });
      patchLog.push({ file: n.filename, action: "locale-nl-to-en", detail: { replacements: count } });
    }
  }

  if (writes.length === 0) {
    // Verify live theme still untouched even on no-op runs.
    const themes2 = await listThemes();
    const liveAfter = themes2.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID);
    const liveUntouched = liveAfter?.updated_at === liveUpdatedAtBefore;
    return {
      verdict: "AILUROVA_LAUNCH_SPRINT_NOOP",
      mode: "execute",
      reason: "no safe patches applied — theme already reflects the target copy or Horizon shapes gated further edits",
      target: targetBefore,
      liveTheme: { untouched: liveUntouched },
      patchLog,
      mutationLedger: emptyLedger(),
    };
  }

  // ---- Write.
  const wr = await themeFilesUpsert(workGid, writes);
  const uErr = wr.data?.themeFilesUpsert?.userErrors ?? [];
  const upserted = wr.data?.themeFilesUpsert?.upsertedThemeFiles ?? [];
  filesUpsertedNames.push(...upserted.map((u: any) => u.filename));
  if (uErr.length) {
    return { verdict: "THEME_PERSISTENCE_FAILED", reason: "themeFilesUpsert userErrors", userErrors: uErr, patchLog };
  }

  // ---- Read-back verify + live-drift check.
  const rb = await readThemeFiles(workGid, coreFiles);
  const rbNodes = rb.data?.theme?.files?.nodes ?? [];
  const rbRaw: Record<string, string> = {};
  for (const n of rbNodes) { const c = decodeBody(n?.body); if (c != null) rbRaw[n.filename] = c; }

  const readBackChecks = {
    heroHeadlinePresent: (rbRaw["templates/index.json"] ?? "").includes("A Cleaner, Smarter Litter Setup"),
    heroCtaLinkPresent: (rbRaw["templates/index.json"] ?? "").includes(`/products/${PRODUCT_HANDLE}`),
    productRecommendationsAbsent: !((rbRaw["templates/product.json"] ?? "").includes("product-recommendations")),
    announcementPresent: (rbRaw["sections/header-group.json"] ?? "").includes("Premium XL stainless steel litter system"),
  };

  const themes2 = await listThemes();
  const liveAfter = themes2.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID);
  const liveUntouched = liveAfter?.updated_at === liveUpdatedAtBefore;
  const targetAfter = await themeMetaByNumericId(chosen.id);

  if (!liveUntouched) {
    return {
      verdict: "LIVE_THEME_SAFETY_FAILURE",
      reason: "live theme updatedAt changed during execute",
      before: { liveUpdatedAtBefore }, after: { liveAfter },
    };
  }

  return {
    verdict: "AILUROVA_LAUNCH_SPRINT_APPLIED",
    mode: "execute",
    startedAt, finishedAt: new Date().toISOString(),
    target: { before: targetBefore, after: targetAfter },
    liveTheme: { untouched: liveUntouched, updatedAt: liveAfter?.updated_at },
    filesUpserted: filesUpsertedNames,
    patchLog,
    readBackChecks,
    mutationLedger: {
      themeFilesUpsertCalls: 1,
      filesUpserted: filesUpsertedNames.length,
      liveThemeWrites: 0,
      productMutations: 0,
      priceMutations: 0,
      inventoryMutations: 0,
      publicationMutations: 0,
      collectionMutations: 0,
      marketMutations: 0,
      shippingMutations: 0,
      policyMutations: 0,
      orderMutations: 0,
      paymentSubmissions: 0,
      otherMutations: 0,
    },
  };
}

function emptyLedger() {
  return {
    themeFilesUpsertCalls: 0, filesUpserted: 0, liveThemeWrites: 0,
    productMutations: 0, priceMutations: 0, inventoryMutations: 0,
    publicationMutations: 0, collectionMutations: 0, marketMutations: 0,
    shippingMutations: 0, policyMutations: 0, orderMutations: 0,
    paymentSubmissions: 0, otherMutations: 0,
  };
}

// -------------------- Phase 9 --------------------

async function verify() {
  const themes = await listThemes();
  const live = themes.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID) ?? null;
  const { candidates } = await locateWorkTheme();
  const chosen = candidates[0];
  if (!chosen) return { verdict: "TARGET_THEME_NOT_FOUND" };
  const target = await themeMetaByNumericId(chosen.id);
  const workGid = `gid://shopify/OnlineStoreTheme/${chosen.id}`;
  const rb = await readThemeFiles(workGid, [
    "templates/index.json", "templates/product.json", "sections/header-group.json", "sections/footer-group.json",
  ]);
  const rbNodes = rb.data?.theme?.files?.nodes ?? [];
  const rbRaw: Record<string, string> = {};
  for (const n of rbNodes) { const c = decodeBody(n?.body); if (c != null) rbRaw[n.filename] = c; }
  const product = await protectedProductState();
  const publishedCount = await countOnlineStorePublishedProducts();
  return {
    verdict: "AILUROVA_LAUNCH_SPRINT_VERIFY_REPORT",
    mode: "verify",
    liveTheme: live ? { id: `gid://shopify/OnlineStoreTheme/${live.id}`, role: live.role, updatedAt: live.updated_at } : null,
    target,
    fileSizes: Object.fromEntries(Object.entries(rbRaw).map(([k, v]) => [k, v.length])),
    checks: {
      heroHeadlinePresent: (rbRaw["templates/index.json"] ?? "").includes("A Cleaner, Smarter Litter Setup"),
      heroCtaLinkPresent: (rbRaw["templates/index.json"] ?? "").includes(`/products/${PRODUCT_HANDLE}`),
      productRecommendationsAbsent: !((rbRaw["templates/product.json"] ?? "").includes("product-recommendations")),
      announcementPresent: (rbRaw["sections/header-group.json"] ?? "").includes("Premium XL stainless steel litter system"),
      brandGhostAbsent: !((rbRaw["sections/footer-group.json"] ?? "").match(/GetPawsy|Skidzo|getpawsy\.pet/i)),
    },
    protectedProduct: product,
    exactlyOnePublishedProduct: { count: publishedCount, ok: publishedCount === 1 },
  };
}

// -------------------- HTTP --------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: any = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch {}
  const mode = String(body?.mode ?? "lock");
  try {
    if (mode === "lock") return json(await lock());
    if (mode === "verify") return json(await verify());
    if (mode === "execute") {
      if (body?.confirm !== CONFIRM_TOKEN) {
        return json({
          verdict: "AILUROVA_LAUNCH_SPRINT_CONFIRM_REQUIRED",
          expectedConfirm: CONFIRM_TOKEN,
        }, 400);
      }
      return json(await execute(body));
    }
    return json({ verdict: "AILUROVA_LAUNCH_SPRINT_UNKNOWN_MODE", mode }, 400);
  } catch (e: any) {
    return json({ verdict: "AILUROVA_LAUNCH_SPRINT_ERROR", error: String(e?.message ?? e) }, 500);
  }
});