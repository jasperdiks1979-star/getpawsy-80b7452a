// AILUROVA — FIX FEATURED PRODUCT PURCHASE CONTROLS
//
// Repairs the homepage `featured-product` section in the UNPUBLISHED work
// theme "Ailurova — Lovable Final Draft" so a customer can purchase the
// protected product directly from the homepage.
//
// Strategy:
//   1) Read templates/index.json, templates/product.json and
//      sections/featured-product.liquid schema from the target theme.
//   2) Clone the block tree of the working product-information section in
//      templates/product.json into the homepage featured-product section,
//      filtered by the block types the featured-product schema actually
//      allows.
//   3) Remove any newsletter / email-signup sections from templates/index.json
//      and hide them in sections/footer-group.json / config/settings_data.json
//      style groups where possible.
//   4) Read back and report block IDs / order / purchase-block presence.
//
// Safety:
//   - Live theme 201779872076 (MAIN) is read-only.
//   - No product / price / inventory / publication mutations.
//   - Never publishes the target theme.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const LIVE_THEME_GID = "gid://shopify/OnlineStoreTheme/201779872076";
const TARGET_THEME_NAME = "Ailurova — Lovable Final Draft";
const PRODUCT_HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const PRODUCT_NUMERIC_ID = 15889810194764;
const CONFIRM_TOKEN = "CONFIRM_AILUROVA_PURCHASE_CONTROLS_REPAIR";

// Full preset structure of Horizon's `featured-product-information` section.
// Verified by reading `sections/featured-product-information.liquid` schema
// from the target theme. This section (unlike `featured-product`) accepts
// `@theme` / `@app` blocks and exposes real purchase controls via the
// static `_product-details` block: variant-picker, quantity, add-to-cart
// and accelerated-checkout.
function buildFeaturedProductInformationSection(productHandle: string) {
  return {
    type: "featured-product-information",
    settings: {
      product: productHandle,
      gap: 48,
      "padding-block-start": 40,
      "padding-block-end": 40,
      equal_columns: true,
    },
    blocks: {
      "media-gallery": {
        type: "_featured-product-information-carousel",
        static: true,
        settings: {
          constrain_to_viewport: true,
          media_fit: "contain",
          media_radius: 0,
          extend_media: false,
          hide_variants: true,
          slideshow_controls_style: "counter",
          slideshow_mobile_controls_style: "dots",
          thumbnail_position: "bottom",
          thumbnail_width: 44,
        },
      },
      "product-details": {
        type: "_product-details",
        static: true,
        settings: {
          gap: 28,
          sticky_details_desktop: true,
          "padding-block-start": 24,
          "padding-block-end": 24,
        },
        blocks: {
          header: {
            type: "group",
            name: "Header",
            settings: { gap: 12 },
            blocks: {
              title: {
                type: "product-title",
                name: "Title",
                settings: { type_preset: "rte" },
              },
              price: {
                type: "price",
                name: "Product price",
                settings: { show_installments: true, show_tax_info: true },
              },
            },
            block_order: ["title", "price"],
          },
          variant_picker: {
            type: "variant-picker",
            name: "Variant picker",
          },
          buy_buttons: {
            type: "buy-buttons",
            name: "Buy buttons",
            blocks: {
              quantity: { type: "quantity", static: true },
              "add-to-cart": { type: "add-to-cart", static: true },
              "accelerated-checkout": { type: "accelerated-checkout", static: true },
            },
          },
        },
        block_order: ["header", "variant_picker", "buy_buttons"],
      },
    },
  } as any;
}

// Ordered list of purchase-related block "type" hints — used both to detect
// missing controls and to score which product-information blocks to keep.
const PURCHASE_TYPES: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "media",             patterns: [/^media$/i, /gallery/i, /^product-media$/i, /product[-_ ]?media/i] },
  { key: "title",             patterns: [/^title$/i, /^product-title$/i, /product[-_ ]?title/i] },
  { key: "price",             patterns: [/^price$/i, /^product-price$/i, /product[-_ ]?price/i] },
  { key: "variant_picker",    patterns: [/^variant[-_ ]?picker$/i, /^variant[-_ ]?selector$/i, /variant/i] },
  { key: "quantity",          patterns: [/^quantity[-_ ]?selector$/i, /^quantity$/i, /quantity/i] },
  { key: "buy_buttons",       patterns: [/^buy[-_ ]?buttons?$/i, /^add[-_ ]?to[-_ ]?cart$/i, /buy[-_ ]?button/i, /add[-_ ]?to[-_ ]?cart/i, /checkout/i] },
  { key: "inventory_status",  patterns: [/inventory/i, /availability/i, /stock/i] },
];

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
function extractSchemaJson(liquid: string): any | null {
  const m = liquid.match(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
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

function classifyType(t: string | undefined): string | null {
  if (!t) return null;
  for (const p of PURCHASE_TYPES) if (p.patterns.some(rx => rx.test(t))) return p.key;
  return null;
}

function findMainProductSection(prodTmpl: any): { id: string; sec: any } | null {
  const sections = prodTmpl?.sections ?? {};
  const order: string[] = Array.isArray(prodTmpl?.order) ? prodTmpl.order : Object.keys(sections);
  let best: { id: string; sec: any; score: number } | null = null;
  for (const id of order) {
    const sec = sections[id]; if (!sec) continue;
    const type = String(sec.type ?? "");
    let score = 0;
    if (/product[-_ ]?information/i.test(type)) score += 100;
    if (/^main-product$/i.test(type)) score += 90;
    if (/^product$/i.test(type)) score += 80;
    if (/product/i.test(type)) score += 10;
    const blocks = sec.blocks ?? {};
    for (const b of Object.values<any>(blocks)) if (classifyType(b?.type)) score += 5;
    if (score > 0 && (!best || score > best.score)) best = { id, sec, score };
  }
  return best ? { id: best.id, sec: best.sec } : null;
}

async function execute(req: Request) {
  const url = new URL(req.url);
  const confirm = url.searchParams.get("confirm") ?? "";
  const mode = url.searchParams.get("mode") ?? "execute"; // "audit" | "execute"

  // Raw dump for schema forensics
  if (mode === "raw") {
    const target0 = await locateWorkTheme();
    if (!target0) return { verdict: "TARGET_THEME_NOT_FOUND" };
    const gid = `gid://shopify/OnlineStoreTheme/${target0.id}`;
    const rrd = await readThemeFiles(gid, [
      "sections/featured-product.liquid",
      "sections/product-information.liquid",
      "sections/featured-product-information.liquid",
      "blocks/_featured-product.liquid",
      "blocks/_product-details.liquid",
      "templates/product.json",
    ]);
    const out: Record<string, any> = {};
    for (const n of rrd.data?.theme?.files?.nodes ?? []) {
      const c = decodeBody(n?.body) ?? "";
      if (n.filename.endsWith(".liquid")) {
        const s = extractSchemaJson(c);
        out[n.filename] = { schema: s, size: c.length };
      } else {
        out[n.filename] = c;
      }
    }
    // list all sections + blocks filenames
    const q = `query($id: ID!, $after: String) { theme(id: $id) { files(first: 250, after: $after) { nodes { filename } pageInfo { hasNextPage endCursor } } } }`;
    const all: string[] = [];
    let after: string | null = null;
    for (let i = 0; i < 20; i++) {
      const r = await shopifyAdminFetch<any>(q, { id: gid, after });
      const conn = r.data?.theme?.files;
      for (const n of conn?.nodes ?? []) all.push(n.filename);
      if (!conn?.pageInfo?.hasNextPage) break;
      after = conn.pageInfo.endCursor;
    }
    return {
      verdict: "AILUROVA_RAW_DUMP",
      dump: out,
      sectionFiles: all.filter(n => n.startsWith("sections/")),
      blockFiles: all.filter(n => n.startsWith("blocks/")),
    };
  }


  const target = await locateWorkTheme();
  if (!target) return { verdict: "TARGET_THEME_NOT_FOUND", targetName: TARGET_THEME_NAME };
  const workGid = `gid://shopify/OnlineStoreTheme/${target.id}`;
  const before = await themeMetaByNumericId(target.id);
  if (!before || before.role !== "UNPUBLISHED") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "target not UNPUBLISHED", before };
  }

  // Live safety snapshot up front
  const themes = await listThemes();
  const live = themes.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID);
  if (!live || String(live.role).toLowerCase() !== "main") {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "live not MAIN", live };
  }
  const liveUpdatedAtBefore = live.updated_at;

  // ---- Phase 1: Forensic read
  const coreFiles = [
    "templates/index.json",
    "templates/product.json",
    "sections/featured-product.liquid",
    "sections/footer-group.json",
  ];
  const rd = await readThemeFiles(workGid, coreFiles);
  const raw: Record<string, string> = {};
  for (const n of rd.data?.theme?.files?.nodes ?? []) {
    const c = decodeBody(n?.body); if (c != null) raw[n.filename] = c;
  }

  const idxRaw = raw["templates/index.json"];
  const prodRaw = raw["templates/product.json"];
  const featLiquid = raw["sections/featured-product.liquid"];
  if (!idxRaw || !prodRaw || !featLiquid) {
    return { verdict: "AILUROVA_FORENSIC_READ_FAILED", missing: coreFiles.filter(f => !raw[f]) };
  }

  let idx: any, prod: any;
  try { idx = JSON.parse(stripJsonc(idxRaw)); prod = JSON.parse(stripJsonc(prodRaw)); }
  catch (e: any) { return { verdict: "AILUROVA_FORENSIC_READ_FAILED", reason: "json parse", error: String(e?.message ?? e) }; }

  const featSchema = extractSchemaJson(featLiquid);
  const featAllowedBlocks: any[] = Array.isArray(featSchema?.blocks) ? featSchema.blocks : [];
  const featAllowedTypes = new Set<string>(featAllowedBlocks.map(b => String(b?.type)).filter(Boolean));
  const featAcceptsAtType = featAllowedBlocks.some(b => String(b?.type) === "@app" || String(b?.type) === "@theme");

  // Locate the homepage featured-product section
  const idxSections: Record<string, any> = idx?.sections ?? {};
  const idxOrder: string[] = Array.isArray(idx?.order) ? idx.order : Object.keys(idxSections);
  let featuredEntry: { id: string; sec: any } | null = null;
  for (const id of idxOrder) {
    const sec = idxSections[id];
    if (sec?.type === "featured-product") { featuredEntry = { id, sec }; break; }
  }

  // Locate working product-information block tree
  const mainProduct = findMainProductSection(prod);
  const workingBlocks = mainProduct?.sec?.blocks ?? {};
  const workingOrder: string[] = Array.isArray(mainProduct?.sec?.block_order)
    ? mainProduct!.sec.block_order
    : Object.keys(workingBlocks);

  // Which purchase categories exist in the current featured-product?
  const featuredCurrentBlocks: Record<string, any> = featuredEntry?.sec?.blocks ?? {};
  const featuredCurrentOrder: string[] = Array.isArray(featuredEntry?.sec?.block_order)
    ? featuredEntry!.sec.block_order
    : Object.keys(featuredCurrentBlocks);
  const presentBefore = new Set<string>();
  for (const bid of featuredCurrentOrder) {
    const k = classifyType(featuredCurrentBlocks[bid]?.type); if (k) presentBefore.add(k);
  }
  const missingBefore = PURCHASE_TYPES.map(p => p.key).filter(k => !presentBefore.has(k));

  // Build the candidate purchase block list from product-information, keeping
  // only block types the featured-product schema advertises (or all when the
  // section is @app/@theme wildcard).
  const desiredOrder = ["media", "title", "price", "variant_picker", "quantity", "buy_buttons", "inventory_status"];
  const cloned: Array<{ id: string; type: string; settings: any; category: string }> = [];
  const skipped: Array<{ id: string; type: string; reason: string }> = [];
  const seenCategory = new Set<string>();
  for (const bid of workingOrder) {
    const b = workingBlocks[bid]; if (!b?.type) continue;
    const cat = classifyType(String(b.type));
    if (!cat) { skipped.push({ id: bid, type: b.type, reason: "non-purchase block" }); continue; }
    if (seenCategory.has(cat)) { skipped.push({ id: bid, type: b.type, reason: `duplicate ${cat}` }); continue; }
    if (!featAcceptsAtType && featAllowedTypes.size > 0 && !featAllowedTypes.has(String(b.type))) {
      skipped.push({ id: bid, type: b.type, reason: "type not allowed by featured-product schema" });
      continue;
    }
    seenCategory.add(cat);
    cloned.push({ id: `fp_${cat}`, type: String(b.type), settings: { ...(b.settings ?? {}) }, category: cat });
  }
  cloned.sort((a, b) => desiredOrder.indexOf(a.category) - desiredOrder.indexOf(b.category));

  // Newsletter detection
  const newsletterIdsInIdx = idxOrder.filter(id => {
    const t = String(idxSections[id]?.type ?? "");
    return /newsletter|email[-_]?signup/i.test(t);
  });

  const audit = {
    target: before,
    live: { id: LIVE_THEME_GID, updatedAtBefore: liveUpdatedAtBefore, role: live.role },
    featuredProductSchema: {
      allowedBlockTypes: [...featAllowedTypes],
      acceptsAppOrThemeWildcard: featAcceptsAtType,
      totalBlockDefs: featAllowedBlocks.length,
    },
    homepageFeaturedProduct: featuredEntry
      ? {
          sectionId: featuredEntry.id,
          settings: featuredEntry.sec.settings ?? {},
          block_order: featuredCurrentOrder,
          blocks: Object.fromEntries(featuredCurrentOrder.map(bid => [bid, {
            type: featuredCurrentBlocks[bid]?.type,
            category: classifyType(featuredCurrentBlocks[bid]?.type),
          }])),
          presentPurchaseCategories: [...presentBefore],
          missingPurchaseCategories: missingBefore,
        }
      : null,
    productTemplateMainSection: mainProduct
      ? {
          sectionId: mainProduct.id,
          sectionType: mainProduct.sec.type,
          block_order: workingOrder,
          blocks: Object.fromEntries(workingOrder.map(bid => [bid, {
            type: workingBlocks[bid]?.type,
            category: classifyType(workingBlocks[bid]?.type),
          }])),
        }
      : null,
    plannedFeaturedBlocks: cloned.map(c => ({ id: c.id, type: c.type, category: c.category })),
    plannedSkippedBlocks: skipped,
    newsletterSectionsOnIndex: newsletterIdsInIdx,
  };

  if (mode === "audit") {
    return { verdict: "AILUROVA_PURCHASE_CONTROLS_AUDIT", audit };
  }

  if (!featuredEntry) {
    return { verdict: "AILUROVA_HOMEPAGE_PURCHASE_CONTROLS_BLOCKED", reason: "no featured-product section on homepage", audit };
  }

  if (confirm !== CONFIRM_TOKEN) {
    return {
      verdict: "CONFIRM_TOKEN_REQUIRED",
      hint: `add ?confirm=${CONFIRM_TOKEN} to execute the repair`,
      audit,
    };
  }

  // ---- Phase 2: REPLACE `featured-product` with `featured-product-information`
  //
  // Forensic finding: sections/featured-product.liquid declares zero
  // `blocks` (no @theme/@app wildcard, no add-to-cart / quantity / buy-buttons
  // block types). It is a title+price+gallery+swatches showcase only and
  // cannot host purchase controls.
  //
  // sections/featured-product-information.liquid IS Horizon-native, has a
  // `product` setting to bind a specific product on the homepage, accepts
  // `@theme` + `@app` blocks, and its preset instantiates a static
  // `_product-details` block containing variant-picker, quantity, add-to-cart
  // and accelerated-checkout. This is the correct homepage-compatible clone
  // of the verified product-information section from templates/product.json.
  const newFeaturedId = `fpinfo_ail`;
  const nextSections: Record<string, any> = { ...idxSections };
  delete nextSections[featuredEntry.id];
  nextSections[newFeaturedId] = buildFeaturedProductInformationSection(PRODUCT_HANDLE);

  // ---- Phase 3: Remove newsletter sections from index
  const removedNewsletterIds: string[] = [];
  for (const id of newsletterIdsInIdx) {
    delete nextSections[id];
    removedNewsletterIds.push(id);
  }
  const nextOrder = idxOrder
    .map(id => (id === featuredEntry!.id ? newFeaturedId : id))
    .filter(id => !removedNewsletterIds.includes(id));

  const nextIdx = { ...idx, sections: nextSections, order: nextOrder };
  const nextIndexStr = JSON.stringify(nextIdx, null, 2) + "\n";

  const writes: Array<{ filename: string; body: { type: "TEXT"; value: string } }> = [];
  if (nextIndexStr !== idxRaw) writes.push({ filename: "templates/index.json", body: { type: "TEXT", value: nextIndexStr } });

  // Also scrub newsletter blocks from footer-group.json if present
  let footerRemoved: string[] = [];
  const footerRawStr = raw["sections/footer-group.json"];
  if (footerRawStr) {
    try {
      const fg = JSON.parse(stripJsonc(footerRawStr));
      const fgSections: Record<string, any> = fg?.sections ?? {};
      const fgOrder: string[] = Array.isArray(fg?.order) ? fg.order : Object.keys(fgSections);
      let mutated = false;
      for (const sid of Object.keys(fgSections)) {
        const sec = fgSections[sid]; if (!sec) continue;
        // Remove blocks whose type includes newsletter/email-signup
        if (sec.blocks) {
          const newBlocks: Record<string, any> = {};
          const newBlockOrder: string[] = [];
          const prevOrder: string[] = Array.isArray(sec.block_order) ? sec.block_order : Object.keys(sec.blocks);
          for (const bid of prevOrder) {
            const b = sec.blocks[bid]; if (!b) continue;
            const t = String(b.type ?? "");
            if (/newsletter|email[-_]?signup/i.test(t)) { footerRemoved.push(`${sid}.${bid}:${t}`); mutated = true; continue; }
            newBlocks[bid] = b; newBlockOrder.push(bid);
          }
          if (mutated) { sec.blocks = newBlocks; sec.block_order = newBlockOrder; }
        }
        if (/newsletter|email[-_]?signup/i.test(String(sec.type ?? ""))) {
          footerRemoved.push(`${sid}:${sec.type}`);
          delete fgSections[sid];
          mutated = true;
        }
      }
      if (mutated) {
        fg.order = fgOrder.filter((id: string) => id in fgSections);
        writes.push({ filename: "sections/footer-group.json", body: { type: "TEXT", value: JSON.stringify(fg, null, 2) + "\n" } });
      }
    } catch { /* skip */ }
  }

  if (writes.length === 0) {
    return { verdict: "AILUROVA_PURCHASE_CONTROLS_NOOP", audit };
  }

  const wr = await themeFilesUpsert(workGid, writes);
  const uErr = wr.data?.themeFilesUpsert?.userErrors ?? [];
  if (uErr.length) {
    return { verdict: "THEME_PERSISTENCE_FAILED", reason: "themeFilesUpsert userErrors", userErrors: uErr, planned: cloned };
  }

  // ---- Phase 4: Fresh read-back
  const rb = await readThemeFiles(workGid, ["templates/index.json"]);
  const rbRaw = decodeBody(rb.data?.theme?.files?.nodes?.[0]?.body) ?? "";
  let idxAfter: any = null;
  try { idxAfter = JSON.parse(stripJsonc(rbRaw)); } catch { /* */ }
  const orderAfter: string[] = idxAfter?.order ?? [];
  const sectionsAfter: Record<string, any> = idxAfter?.sections ?? {};
  const featEntryAfter = orderAfter
    .map(id => ({ id, sec: sectionsAfter[id] }))
    .find(x => x.sec?.type === "featured-product-information" || x.sec?.type === "featured-product") ?? null;
  const featBlocksAfter: Record<string, any> = featEntryAfter?.sec?.blocks ?? {};
  const featOrderAfter: string[] = Array.isArray(featEntryAfter?.sec?.block_order) ? featEntryAfter!.sec.block_order : Object.keys(featBlocksAfter);
  // Walk the block tree recursively (static blocks are nested in the JSON)
  const presentAfter = new Set<string>();
  const walk = (blocks: any) => {
    if (!blocks || typeof blocks !== "object") return;
    for (const [_bid, b] of Object.entries<any>(blocks)) {
      const k = classifyType(String(b?.type ?? ""));
      if (k) presentAfter.add(k);
      if (b?.blocks) walk(b.blocks);
    }
  };
  walk(featBlocksAfter);
  const missingAfter = PURCHASE_TYPES.map(p => p.key).filter(k => !presentAfter.has(k));

  const themes2 = await listThemes();
  const liveAfter = themes2.find(t => `gid://shopify/OnlineStoreTheme/${t.id}` === LIVE_THEME_GID);
  const targetAfter = await themeMetaByNumericId(target.id);
  const liveUntouched = liveAfter?.updated_at === liveUpdatedAtBefore;
  if (!liveUntouched) {
    return { verdict: "LIVE_THEME_SAFETY_FAILURE", reason: "live updatedAt drifted", before: liveUpdatedAtBefore, after: liveAfter?.updated_at };
  }

  const featuredBoundToProduct = (() => {
    const s = featEntryAfter?.sec?.settings ?? {};
    return Object.values(s).some(v => v === PRODUCT_HANDLE || v === PRODUCT_NUMERIC_ID || v === String(PRODUCT_NUMERIC_ID));
  })();
  const newsletterAbsent = !orderAfter.some(id => /newsletter|email[-_]?signup/i.test(String(sectionsAfter[id]?.type ?? "")));
  const hasQuantity = presentAfter.has("quantity");
  const hasBuyButtons = presentAfter.has("buy_buttons");

  const allOk = !!featEntryAfter && featuredBoundToProduct && hasQuantity && hasBuyButtons && newsletterAbsent && targetAfter?.role === "UNPUBLISHED";

  return {
    verdict: allOk ? "AILUROVA_PURCHASE_CONTROLS_REPAIRED" : "AILUROVA_HOMEPAGE_PURCHASE_CONTROLS_BLOCKED",
    reason: allOk ? undefined : `post-write checks failed: quantity=${hasQuantity} buy_buttons=${hasBuyButtons} bound=${featuredBoundToProduct} newsletterAbsent=${newsletterAbsent}`,
    target: targetAfter,
    before,
    liveTheme: { id: LIVE_THEME_GID, updatedAtBefore: liveUpdatedAtBefore, updatedAtAfter: liveAfter?.updated_at, liveUntouched },
    featuredProductAfter: featEntryAfter
      ? {
          sectionId: featEntryAfter.id,
          type: featEntryAfter.sec.type,
          settings: featEntryAfter.sec.settings,
          block_order: featOrderAfter,
          blocks: Object.fromEntries(featOrderAfter.map(bid => [bid, {
            type: featBlocksAfter[bid]?.type,
            category: classifyType(featBlocksAfter[bid]?.type),
          }])),
          presentPurchaseCategories: [...presentAfter],
          missingPurchaseCategories: missingAfter,
        }
      : null,
    boundToProduct: featuredBoundToProduct,
    newsletterAbsentFromIndex: newsletterAbsent,
    newsletterSectionsRemoved: removedNewsletterIds,
    footerNewsletterBlocksRemoved: footerRemoved,
    upserted: (wr.data?.themeFilesUpsert?.upsertedThemeFiles ?? []).map((u: any) => u.filename),
    schemaAllowedTypes: [...featAllowedTypes],
    mutations: {
      themeFilesUpsertCalls: 1,
      filesUpserted: writes.length,
      liveThemeWrites: 0,
      productMutations: 0, priceMutations: 0, inventoryMutations: 0, publicationMutations: 0,
    },
    audit,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const out = await execute(req);
    return json(out);
  } catch (e: any) {
    return json({ verdict: "REPAIR_ERROR", error: String(e?.message ?? e) }, 500);
  }
});