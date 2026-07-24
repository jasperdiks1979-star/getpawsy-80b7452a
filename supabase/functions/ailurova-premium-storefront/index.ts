// AILUROVA — Premium one-product storefront redesign for UNPUBLISHED draft theme only.
//
// Safety contract:
//   - Only mutates theme gid://shopify/OnlineStoreTheme/202425401676 (UNPUBLISHED).
//   - Live theme gid://shopify/OnlineStoreTheme/201779872076 must remain untouched
//     (updatedAt unchanged, role still MAIN).
//   - Zero product / price / inventory / publication / market / policy / shipping
//     mutations. Enforced by construction — this function only calls
//     themeFilesUpsert on the draft theme.
//   - Two modes:
//       mode:"audit"   — read-only forensic report (Phase 1).
//       mode:"execute" — full redesign + read-back verification.
//     execute requires body.confirm === "CONFIRM_AILUROVA_PREMIUM_STOREFRONT".
//
// The redesign composes templates/index.json from *standard Dawn OS 2.0 section
// types only* (image-banner, rich-text, image-with-text, multicolumn,
// collapsible-content, featured-product, email-signup, apps). If the current
// draft theme is missing any of those section types we degrade the verdict to
// AILUROVA_PREMIUM_DRAFT_PARTIAL rather than fabricate broken references.

import { getShopifyConfig, shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const TARGET_THEME_GID = "gid://shopify/OnlineStoreTheme/202425401676";
const LIVE_THEME_GID   = "gid://shopify/OnlineStoreTheme/201779872076";
const PRODUCT_HANDLE   = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const PRODUCT_GID      = "gid://shopify/Product/15889810194764";

// Standard Dawn / OS 2.0 section types we require to compose the homepage.
const REQUIRED_SECTION_TYPES = [
  "image-banner",
  "rich-text",
  "featured-product",
  "multicolumn",
  "image-with-text",
  "collapsible-content",
  "email-signup",
];

type Json = Record<string, unknown>;

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

async function themeMeta(themeGid: string) {
  const numeric = themeGid.split("/").pop();
  const r = await shopifyAdminRest<{ theme: any }>(`themes/${numeric}.json`);
  const t = r.data?.theme;
  return t ? { id: `gid://shopify/OnlineStoreTheme/${t.id}`, role: String(t.role ?? "").toUpperCase(), name: t.name, updatedAt: t.updated_at } : null;
}

async function listThemeAssets(themeGid: string): Promise<string[]> {
  const numeric = themeGid.split("/").pop();
  const r = await shopifyAdminRest<{ assets: any[] }>(`themes/${numeric}/assets.json`);
  return (r.data?.assets ?? []).map(a => String(a.key)).sort();
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

function findSectionTypeAsset(assets: string[], type: string): string | null {
  // Dawn convention: sections/<type>.liquid
  const key = `sections/${type}.liquid`;
  return assets.includes(key) ? key : null;
}

// ---------- Homepage blueprint ----------
// Produces a fresh templates/index.json composed exclusively of section types
// we've verified exist in the draft theme. Each section uses only standard
// Dawn setting keys; unknown keys are ignored by Shopify without breaking.

function buildHomepageIndexJson() {
  const sections: Record<string, Json> = {};
  const order: string[] = [];
  const add = (id: string, section: Json) => { sections[id] = section; order.push(id); };

  // 1. Premium hero — image-banner (uses theme default background if none set)
  add("premium_hero", {
    type: "image-banner",
    blocks: {
      heading: { type: "heading", settings: { heading: "A Cleaner, Smarter Litter Setup", heading_size: "h0" } },
      subheading: { type: "text", settings: { text: "An XL enclosed litter box with a stainless steel base, flip-top access and a removable litter-filter step." } },
      cta: { type: "buttons", settings: {
        button_label_1: "Explore the Litter Box",
        button_link_1: `/products/${PRODUCT_HANDLE}`,
        button_style_secondary_1: false,
        button_label_2: "See How It Works",
        button_link_2: "#how-it-works",
        button_style_secondary_2: true,
      } },
    },
    block_order: ["heading", "subheading", "cta"],
    settings: {
      image_overlay_opacity: 20,
      image_height: "large",
      desktop_content_position: "middle-center",
      show_text_box: true,
      desktop_content_alignment: "center",
      color_scheme: "background-1",
      mobile_content_alignment: "center",
      stack_images_on_mobile: true,
      show_text_below: false,
    },
  });

  // 2. Product purchase block — featured-product bound to protected product
  add("purchase_block", {
    type: "featured-product",
    blocks: {
      title: { type: "title", settings: {} },
      price: { type: "price", settings: {} },
      variant_picker: { type: "variant_picker", settings: { picker_type: "button" } },
      quantity_selector: { type: "quantity_selector", settings: {} },
      buy_buttons: { type: "buy_buttons", settings: { show_dynamic_checkout: true } },
      description: { type: "description", settings: {} },
      share: { type: "share", settings: { share_label: "Share" } },
    },
    block_order: ["title", "price", "variant_picker", "quantity_selector", "buy_buttons", "description", "share"],
    settings: {
      product: PRODUCT_HANDLE,
      secondary_background: false,
      hide_variants: false,
      enable_video_looping: false,
      color_scheme: "background-1",
      media_size: "large",
      constrain_to_viewport: true,
      media_fit: "contain",
      gallery_layout: "stacked",
      media_position: "left",
      image_zoom: "lightbox",
      mobile_thumbnails: "hide",
      hide_variants_size: 5,
    },
  });

  // 3. Key benefits — multicolumn (6 columns)
  const benefits: [string, string][] = [
    ["XL enclosed design", "Built with room to move for larger cats."],
    ["Stainless steel base", "A smooth, durable surface that wipes clean."],
    ["Flip-top access", "Open the top for easier daily scooping."],
    ["Removable litter-filter step", "Helps reduce loose litter around the box."],
    ["Three setup options", "Open, semi-enclosed or fully enclosed."],
    ["Easier routine cleaning", "Fewer parts to fuss with each week."],
  ];
  const benefitBlocks: Record<string, Json> = {};
  const benefitOrder: string[] = [];
  benefits.forEach(([t, b], i) => {
    const id = `benefit_${i + 1}`;
    benefitBlocks[id] = { type: "column", settings: { title: t, text: `<p>${b}</p>`, link_label: "", link: "" } };
    benefitOrder.push(id);
  });
  add("key_benefits", {
    type: "multicolumn",
    blocks: benefitBlocks,
    block_order: benefitOrder,
    settings: {
      title: "Why Ailurova",
      heading_size: "h1",
      image_width: "third",
      image_ratio: "adapt",
      columns_desktop: 3,
      column_alignment: "center",
      background_style: "none",
      button_label: "",
      button_link: "",
      columns_mobile: "1",
      swipe_on_mobile: false,
      color_scheme: "background-1",
      padding_top: 60,
      padding_bottom: 60,
    },
  });

  // 4. Three setup options — rich-text
  add("three_setups", {
    type: "rich-text",
    blocks: {
      heading: { type: "heading", settings: { heading: "Three Ways to Set It Up", heading_size: "h1" } },
      body: { type: "text", settings: { text: "<p>Use the litter box as an open stainless steel base, a semi-enclosed setup or a fully enclosed litter box — adapt it to your cat and your space.</p>" } },
    },
    block_order: ["heading", "body"],
    settings: { desktop_content_position: "center", content_alignment: "center", color_scheme: "background-2", full_width: true, padding_top: 60, padding_bottom: 60 },
  });

  // 5. Stainless steel base — image-with-text
  add("stainless_base", {
    type: "image-with-text",
    blocks: {
      heading: { type: "heading", settings: { heading: "Stainless Steel Base", heading_size: "h2" } },
      caption: { type: "caption", settings: { caption: "Materials", caption_size: "medium" } },
      text: { type: "text", settings: { text: "<p>The smooth stainless steel base is designed for straightforward wiping and routine cleaning — no porous plastic that traps odors over time.</p>" } },
    },
    block_order: ["caption", "heading", "text"],
    settings: { height: "medium", desktop_image_width: "medium", layout: "text_first", desktop_content_position: "middle", desktop_content_alignment: "left", content_layout: "no-overlap", section_color_scheme: "background-1", color_scheme: "background-2", image_behavior: "none", padding_top: 40, padding_bottom: 40 },
  });

  // 6. Flip-top access — image-with-text (reversed)
  add("flip_top", {
    type: "image-with-text",
    blocks: {
      heading: { type: "heading", settings: { heading: "Flip-Top Access", heading_size: "h2" } },
      caption: { type: "caption", settings: { caption: "Daily use", caption_size: "medium" } },
      text: { type: "text", settings: { text: "<p>Open the top for more convenient daily access without fully disassembling the enclosure. Scoop, spot-check and close — in under a minute.</p>" } },
    },
    block_order: ["caption", "heading", "text"],
    settings: { height: "medium", desktop_image_width: "medium", layout: "image_first", desktop_content_position: "middle", desktop_content_alignment: "left", content_layout: "no-overlap", section_color_scheme: "background-1", color_scheme: "background-1", image_behavior: "none", padding_top: 40, padding_bottom: 40 },
  });

  // 7. Removable litter-filter step — image-with-text
  add("filter_step", {
    type: "image-with-text",
    blocks: {
      heading: { type: "heading", settings: { heading: "Removable Litter-Filter Step", heading_size: "h2" } },
      caption: { type: "caption", settings: { caption: "Tidy floors", caption_size: "medium" } },
      text: { type: "text", settings: { text: "<p>The removable step helps reduce loose litter around the box and can be removed for cleaning whenever you need a deeper wipe-down.</p>" } },
    },
    block_order: ["caption", "heading", "text"],
    settings: { height: "medium", desktop_image_width: "medium", layout: "text_first", desktop_content_position: "middle", desktop_content_alignment: "left", content_layout: "no-overlap", section_color_scheme: "background-1", color_scheme: "background-2", image_behavior: "none", padding_top: 40, padding_bottom: 40 },
  });

  // 8. Cleaning and Care — rich-text
  add("cleaning_care", {
    type: "rich-text",
    blocks: {
      heading: { type: "heading", settings: { heading: "Cleaning and Care", heading_size: "h1" } },
      body: { type: "text", settings: { text: "<p>Remove loose litter, wipe the stainless steel base with a soft damp cloth and allow all parts to dry fully before reassembly.</p>" } },
    },
    block_order: ["heading", "body"],
    settings: { desktop_content_position: "center", content_alignment: "center", color_scheme: "background-1", full_width: true, padding_top: 60, padding_bottom: 60 },
  });

  // 9. FAQ — collapsible-content
  const faqs: [string, string][] = [
    ["Will it fit a larger cat?", "The XL enclosure is designed with room to move for larger cats. If you're between sizes, opt for the enclosed configuration for extra headroom."],
    ["How do I clean it?", "Remove loose litter, then wipe the stainless steel base with a soft damp cloth. Let all parts dry fully before reassembly."],
    ["Can I use it without the enclosure?", "Yes. Use it as an open stainless steel base, a semi-enclosed setup or a fully enclosed box — three setups, one purchase."],
    ["What is the removable step for?", "The step helps catch loose litter as your cat exits. Slide it out to clean whenever needed."],
    ["What comes in the box?", "The enclosure, stainless steel base and removable litter-filter step. Litter is not included."],
  ];
  const faqBlocks: Record<string, Json> = {};
  const faqOrder: string[] = [];
  faqs.forEach(([q, a], i) => {
    const id = `faq_${i + 1}`;
    faqBlocks[id] = { type: "collapsible_row", settings: { heading: q, row_content: `<p>${a}</p>`, page: "", icon: "question" } };
    faqOrder.push(id);
  });
  add("faq", {
    type: "collapsible-content",
    blocks: faqBlocks,
    block_order: faqOrder,
    settings: {
      caption: "Frequently asked",
      heading: "Questions, answered",
      heading_size: "h1",
      heading_alignment: "center",
      layout: "none",
      color_scheme: "background-1",
      container_color_scheme: "background-2",
      open_first_collapsible_row: false,
      padding_top: 60,
      padding_bottom: 60,
    },
  });

  // 10. Shipping & returns summary — rich-text (no page links unless verified)
  add("shipping_returns", {
    type: "rich-text",
    blocks: {
      heading: { type: "heading", settings: { heading: "Shipping & Returns", heading_size: "h2" } },
      body: { type: "text", settings: { text: "<p>Ships from a US-based partner. Reach us at <a href=\"mailto:support@ailurova.com\">support@ailurova.com</a> for order questions.</p>" } },
    },
    block_order: ["heading", "body"],
    settings: { desktop_content_position: "center", content_alignment: "center", color_scheme: "background-2", full_width: false, padding_top: 40, padding_bottom: 40 },
  });

  // 11. Final CTA — rich-text with button
  add("final_cta", {
    type: "rich-text",
    blocks: {
      heading: { type: "heading", settings: { heading: "Ready for a cleaner routine?", heading_size: "h1" } },
      body: { type: "text", settings: { text: "<p>See the Ailurova XL Stainless Steel Enclosed Litter Box.</p>" } },
      button: { type: "button", settings: { button_label: "Explore the Litter Box", button_link: `/products/${PRODUCT_HANDLE}`, button_style_secondary: false } },
    },
    block_order: ["heading", "body", "button"],
    settings: { desktop_content_position: "center", content_alignment: "center", color_scheme: "background-1", full_width: true, padding_top: 60, padding_bottom: 60 },
  });

  return { sections, order };
}

// Product template blueprint — bind main-product + relevant supporting sections.
function buildProductTemplateJson() {
  const sections: Record<string, Json> = {
    main: {
      type: "main-product",
      blocks: {
        vendor: { type: "text", settings: { text: "Ailurova", text_style: "uppercase" } },
        title: { type: "title", settings: {} },
        price: { type: "price", settings: {} },
        variant_picker: { type: "variant_picker", settings: { picker_type: "button" } },
        quantity_selector: { type: "quantity_selector", settings: {} },
        buy_buttons: { type: "buy_buttons", settings: { show_dynamic_checkout: true } },
        description: { type: "description", settings: {} },
        share: { type: "share", settings: { share_label: "Share" } },
      },
      block_order: ["vendor", "title", "price", "variant_picker", "quantity_selector", "buy_buttons", "description", "share"],
      settings: {
        enable_sticky_info: true,
        color_scheme: "background-1",
        media_size: "large",
        constrain_to_viewport: true,
        media_fit: "contain",
        gallery_layout: "thumbnail",
        media_position: "left",
        image_zoom: "lightbox",
        mobile_thumbnails: "show",
        hide_variants: false,
      },
    },
    setup_options: {
      type: "rich-text",
      blocks: {
        heading: { type: "heading", settings: { heading: "Three Ways to Set It Up", heading_size: "h2" } },
        body: { type: "text", settings: { text: "<p>Use the litter box as an open stainless steel base, a semi-enclosed setup or a fully enclosed litter box.</p>" } },
      },
      block_order: ["heading", "body"],
      settings: { desktop_content_position: "center", content_alignment: "center", color_scheme: "background-2", full_width: true, padding_top: 40, padding_bottom: 40 },
    },
    care: {
      type: "rich-text",
      blocks: {
        heading: { type: "heading", settings: { heading: "Cleaning and Care", heading_size: "h2" } },
        body: { type: "text", settings: { text: "<p>Remove loose litter, wipe the stainless steel base with a soft damp cloth and allow all parts to dry fully before reassembly.</p>" } },
      },
      block_order: ["heading", "body"],
      settings: { desktop_content_position: "center", content_alignment: "center", color_scheme: "background-1", full_width: false, padding_top: 40, padding_bottom: 40 },
    },
  };
  return { sections, order: ["main", "setup_options", "care"] };
}

// ---------- header/footer group rebuild ----------
// We rewrite header-group.json / footer-group.json entirely with minimal
// premium content. This is scoped to the draft theme only.

function buildHeaderGroupJson() {
  return {
    type: "header",
    name: "Header group",
    sections: {
      announcement: {
        type: "announcement-bar",
        blocks: {
          a1: { type: "announcement", settings: { text: "Designed for a cleaner, easier litter routine.", text_alignment: "center", link: "" } },
        },
        block_order: ["a1"],
        settings: { auto_rotate: false, change_slides_speed: 5, show_social: false, color_scheme: "background-2" },
      },
      header: {
        type: "header",
        blocks: {},
        block_order: [],
        settings: {
          logo_position: "middle-left",
          menu: "main-menu",
          show_line_separator: true,
          color_scheme: "background-1",
          menu_type_desktop: "dropdown",
          sticky_header_type: "on-scroll-up",
          enable_country_selector: false,
          enable_language_selector: false,
          margin_bottom: 0,
        },
      },
    },
    order: ["announcement", "header"],
  };
}

function buildFooterGroupJson() {
  return {
    type: "footer",
    name: "Footer group",
    sections: {
      footer: {
        type: "footer",
        blocks: {
          brand: {
            type: "text",
            settings: {
              heading: "Ailurova",
              subtext: "<p>Premium essentials for a calmer, cleaner litter routine.</p>",
            },
          },
          contact: {
            type: "text",
            settings: {
              heading: "Contact",
              subtext: "<p><a href=\"mailto:support@ailurova.com\">support@ailurova.com</a></p>",
            },
          },
          newsletter: {
            type: "email_form",
            settings: {
              heading: "Join the Ailurova List",
              subtext: "<p>Get product updates, care tips and occasional offers.</p>",
            },
          },
        },
        block_order: ["brand", "contact", "newsletter"],
        settings: {
          color_scheme: "background-2",
          newsletter_enable: true,
          newsletter_heading: "Join the Ailurova List",
          enable_follow_on_shop: false,
          show_social: false,
          enable_country_selector: false,
          enable_language_selector: false,
          payment_enable: false,
          show_policy: true,
          margin_top: 0,
        },
      },
    },
    order: ["footer"],
  };
}

// ---------- main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ledger = {
    draft_theme_files_changed: 0,
    draft_theme_settings_changed: 0,
    live_theme_writes: 0,
    product_mutations: 0,
    price_mutations: 0,
    inventory_mutations: 0,
    publication_mutations: 0,
    market_mutations: 0,
    policy_mutations: 0,
    shipping_mutations: 0,
    other_mutations: 0,
    themeFilesUpsert_calls: 0,
  };
  const report: any = { verdict: "", phases: {}, mutation_ledger: ledger };

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* GET or empty */ }
    const mode: "audit" | "execute" = body?.mode === "execute" ? "execute" : "audit";
    const confirm = body?.confirm;

    const { domain, apiVersion } = getShopifyConfig();
    report.mode = mode;
    report.store_domain = domain;
    report.api_version = apiVersion;
    report.target_theme_gid = TARGET_THEME_GID;
    report.live_theme_gid = LIVE_THEME_GID;

    // ---------- PHASE 1: forensic audit ----------
    const tgt = await themeMeta(TARGET_THEME_GID);
    const live = await themeMeta(LIVE_THEME_GID);
    if (!tgt || tgt.role !== "UNPUBLISHED") { report.verdict = "DRAFT_THEME_CONTEXT_MISMATCH"; report.error = `target theme role=${tgt?.role}`; return json(report); }
    if (!live || live.role !== "MAIN") { report.verdict = "LIVE_THEME_SAFETY_FAILURE"; report.error = `live theme role=${live?.role}`; return json(report); }
    if (tgt.id === live.id) { report.verdict = "LIVE_THEME_SAFETY_FAILURE"; report.error = "target === live"; return json(report); }

    const liveUpdatedBefore = live.updatedAt;
    const tgtUpdatedBefore = tgt.updatedAt;

    // Enumerate assets and detect required section types
    let assets: string[] = [];
    try { assets = await listThemeAssets(TARGET_THEME_GID); } catch (e) { report.assets_enum_error = String(e); }
    const sectionTypesPresent = REQUIRED_SECTION_TYPES.filter(t => findSectionTypeAsset(assets, t));
    const sectionTypesMissing = REQUIRED_SECTION_TYPES.filter(t => !findSectionTypeAsset(assets, t));

    // Read the critical files
    const filesWanted = [
      "templates/index.json",
      "templates/product.json",
      "sections/header-group.json",
      "sections/footer-group.json",
      "config/settings_data.json",
      "locales/en.default.json",
      "locales/en.default.schema.json",
    ];
    const readR = await readThemeFiles(TARGET_THEME_GID, filesWanted);
    const nodes: any[] = readR.data?.theme?.files?.nodes ?? [];
    const filesRead: Record<string, { raw: string | null; parsed: any; found: boolean }> = {};
    for (const fn of filesWanted) {
      const node = nodes.find(n => n.filename === fn);
      if (!node) { filesRead[fn] = { raw: null, parsed: null, found: false }; continue; }
      const raw = decodeBody(node.body);
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(stripJsonc(raw)) : null; } catch { /* keep raw only */ }
      filesRead[fn] = { raw, parsed, found: true };
    }

    // Detect legacy brand strings across the read files
    const legacyMarkers = ["GetPawsy", "getpawsy", "Skidzo", "skidzo", "Welkom", "Winkel"];
    const legacyHits: any[] = [];
    for (const [fn, entry] of Object.entries(filesRead)) {
      if (!entry.raw) continue;
      for (const m of legacyMarkers) {
        if (entry.raw.includes(m)) legacyHits.push({ file: fn, marker: m });
      }
    }

    const idxSectionsBefore = filesRead["templates/index.json"].parsed?.sections
      ? Object.entries(filesRead["templates/index.json"].parsed.sections).map(([k, v]: any) => ({ id: k, type: v?.type }))
      : null;
    const productSectionsBefore = filesRead["templates/product.json"].parsed?.sections
      ? Object.entries(filesRead["templates/product.json"].parsed.sections).map(([k, v]: any) => ({ id: k, type: v?.type }))
      : null;

    report.phases.phase1_audit = {
      target_theme: tgt,
      live_theme: live,
      themes_are_distinct: tgt.id !== live.id,
      assets_count: assets.length,
      section_types_present: sectionTypesPresent,
      section_types_missing: sectionTypesMissing,
      all_section_types: assets
        .filter(a => a.startsWith("sections/") && a.endsWith(".liquid"))
        .map(a => a.replace(/^sections\//, "").replace(/\.liquid$/, "")),
      all_block_types: assets
        .filter(a => a.startsWith("blocks/") && a.endsWith(".liquid"))
        .map(a => a.replace(/^blocks\//, "").replace(/\.liquid$/, "")),
      files_read: Object.fromEntries(Object.entries(filesRead).map(([k, v]) => [k, { found: v.found, size: v.raw?.length ?? 0, parseable: v.parsed !== null }])),
      current_index_sections: idxSectionsBefore,
      current_product_sections: productSectionsBefore,
      legacy_brand_hits: legacyHits,
      current_index_json: filesRead["templates/index.json"].parsed,
      current_product_json: filesRead["templates/product.json"].parsed,
      current_header_group_json: filesRead["sections/header-group.json"].parsed,
      current_footer_group_json: filesRead["sections/footer-group.json"].parsed,
    };

    if (mode === "audit") { report.verdict = "AILUROVA_PREMIUM_DRAFT_AUDIT_ONLY"; return json(report); }

    // ---------- EXECUTE guard ----------
    if (confirm !== "CONFIRM_AILUROVA_PREMIUM_STOREFRONT") {
      report.verdict = "AILUROVA_PREMIUM_DRAFT_PARTIAL";
      report.error = "execute mode requires confirm=CONFIRM_AILUROVA_PREMIUM_STOREFRONT";
      return json(report);
    }
    if (sectionTypesMissing.length > 0) {
      report.verdict = "AILUROVA_PREMIUM_DRAFT_PARTIAL";
      report.error = `required section types missing: ${sectionTypesMissing.join(",")}`;
      return json(report);
    }

    // ---------- PHASE 2-3: build new file contents ----------
    const home = buildHomepageIndexJson();
    const homeJson = { sections: home.sections, order: home.order };
    const prodTpl = buildProductTemplateJson();
    const prodJson = { sections: prodTpl.sections, order: prodTpl.order };
    const headerGroup = buildHeaderGroupJson();
    const footerGroup = buildFooterGroupJson();

    const filesToWrite: { filename: string; content: string; label: string }[] = [
      { filename: "templates/index.json", content: JSON.stringify(homeJson, null, 2), label: "homepage" },
      { filename: "templates/product.json", content: JSON.stringify(prodJson, null, 2), label: "product" },
      { filename: "sections/header-group.json", content: JSON.stringify(headerGroup, null, 2), label: "header" },
      { filename: "sections/footer-group.json", content: JSON.stringify(footerGroup, null, 2), label: "footer" },
    ];

    // ---------- PHASE 4-5: themeFilesUpsert (batch) ----------
    const mutation = `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message code filename }
      }
    }`;
    const filesInput = filesToWrite.map(f => ({ filename: f.filename, body: { type: "TEXT", value: f.content } }));
    const upR = await shopifyAdminFetch<any>(mutation, { themeId: TARGET_THEME_GID, files: filesInput });
    ledger.themeFilesUpsert_calls = 1;
    const upErrs = upR.data?.themeFilesUpsert?.userErrors ?? [];
    if (upR.errors || upErrs.length > 0) {
      report.verdict = "THEME_MUTATION_FAILED";
      report.phases.phase5 = { gql_errors: upR.errors ?? null, user_errors: upErrs };
      return json(report);
    }
    const upserted = (upR.data?.themeFilesUpsert?.upsertedThemeFiles ?? []).map((x: any) => x.filename);
    ledger.draft_theme_files_changed = upserted.length;
    report.phases.phase5_upsert = { upserted_files: upserted, expected: filesToWrite.map(f => f.filename) };
    if (upserted.length !== filesToWrite.length) {
      report.verdict = "THEME_MUTATION_FAILED";
      report.error = `expected ${filesToWrite.length} upserts, got ${upserted.length}`;
      return json(report);
    }

    // ---------- PHASE 6: read-back verification ----------
    const rb = await readThemeFiles(TARGET_THEME_GID, filesToWrite.map(f => f.filename));
    const rbNodes: any[] = rb.data?.theme?.files?.nodes ?? [];
    const persist: any[] = [];
    let persistOk = true;
    for (const f of filesToWrite) {
      const node = rbNodes.find(n => n.filename === f.filename);
      const raw = node ? decodeBody(node.body) : null;
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(stripJsonc(raw)) : null; } catch { /* */ }
      let ok = false;
      let checkedMarker = "";
      if (parsed) {
        if (f.filename === "templates/index.json") {
          checkedMarker = "premium_hero section present";
          ok = !!parsed.sections?.premium_hero && Array.isArray(parsed.order) && parsed.order.includes("premium_hero");
        } else if (f.filename === "templates/product.json") {
          checkedMarker = "main-product section present";
          ok = !!parsed.sections?.main && parsed.sections.main.type === "main-product";
        } else if (f.filename === "sections/header-group.json") {
          checkedMarker = "announcement text = new";
          ok = parsed.sections?.announcement?.blocks?.a1?.settings?.text === "Designed for a cleaner, easier litter routine.";
        } else if (f.filename === "sections/footer-group.json") {
          checkedMarker = "footer newsletter heading = Join the Ailurova List";
          ok = parsed.sections?.footer?.blocks?.newsletter?.settings?.heading === "Join the Ailurova List";
        }
      }
      if (!ok) persistOk = false;
      persist.push({ file: f.filename, size_written: f.content.length, size_readback: raw?.length ?? 0, marker: checkedMarker, ok });
    }

    const tgt2 = await themeMeta(TARGET_THEME_GID);
    const live2 = await themeMeta(LIVE_THEME_GID);
    const liveSafe = live2?.updatedAt === liveUpdatedBefore;
    const targetAdvanced = tgt2?.updatedAt !== tgtUpdatedBefore;
    const targetStillUnpublished = tgt2?.role === "UNPUBLISHED";

    report.phases.phase6_readback = {
      persist,
      persist_ok: persistOk,
      target_updated_before: tgtUpdatedBefore,
      target_updated_after: tgt2?.updatedAt,
      target_advanced: targetAdvanced,
      target_still_unpublished: targetStillUnpublished,
      live_updated_before: liveUpdatedBefore,
      live_updated_after: live2?.updatedAt,
      live_untouched: liveSafe,
    };

    if (!liveSafe) { report.verdict = "LIVE_THEME_SAFETY_FAILURE"; return json(report); }
    if (!targetStillUnpublished) { report.verdict = "LIVE_THEME_SAFETY_FAILURE"; report.error = "target theme role changed"; return json(report); }
    if (!persistOk || !targetAdvanced) { report.verdict = "THEME_PERSISTENCE_VERIFICATION_FAILED"; return json(report); }

    // ---------- PHASE 7: preview HTML fetch ----------
    const themeNumeric = TARGET_THEME_GID.split("/").pop();
    const previewUrl = `https://${domain}/?preview_theme_id=${themeNumeric}`;
    let previewResult: any = { attempted_url: previewUrl };
    let previewVerified = false;
    try {
      const pr = await fetch(previewUrl, { redirect: "follow" });
      const html = await pr.text();
      const mustHave = [
        "A Cleaner, Smarter Litter Setup",
        "Explore the Litter Box",
        "Three Ways to Set It Up",
        "Stainless Steel Base",
        "Flip-Top Access",
        "Removable Litter-Filter Step",
        "Cleaning and Care",
        "Join the Ailurova List",
        "support@ailurova.com",
      ];
      const mustAbsent = ["GetPawsy", "Skidzo", "Welcome to our store", "Browse our latest products", "Shop all"];
      const presence = Object.fromEntries(mustHave.map(s => [s, html.includes(s)]));
      const absence = Object.fromEntries(mustAbsent.map(s => [s, !html.includes(s)]));
      previewResult = { attempted_url: previewUrl, http_status: pr.status, html_size: html.length, presence, absence };
      previewVerified = Object.values(presence).every(Boolean) && Object.values(absence).every(Boolean);
    } catch (e: any) {
      previewResult.fetch_error = String(e?.message ?? e);
    }
    report.phases.phase7_preview = previewResult;

    report.verdict = previewVerified ? "AILUROVA_PREMIUM_DRAFT_STOREFRONT_READY" : "AILUROVA_PREMIUM_DRAFT_PARTIAL";
    report.summary = {
      target_theme_id: TARGET_THEME_GID,
      target_theme_name: tgt.name,
      target_theme_role: tgt2?.role,
      live_theme_untouched: liveSafe,
      files_changed: upserted,
      homepage_section_order: home.order,
      product_section_order: prodTpl.order,
      remaining_blockers: previewVerified ? [] : [
        "Preview HTML did not include all required markers. Verify visually in Shopify theme preview.",
      ],
    };
    return json(report);
  } catch (e: any) {
    report.verdict = report.verdict || "THEME_MUTATION_FAILED";
    report.error = String(e?.message ?? e);
    report.stack = String(e?.stack ?? "");
    return json(report, 500);
  }
});
