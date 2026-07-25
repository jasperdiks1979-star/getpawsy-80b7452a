// AILUROVA — LIVE STOREFRONT HOTFIX
//
// Repairs `sections/ailurova-one-product-store.liquid` in the CURRENT MAIN
// (published) theme by replacing unsafe `media | image_url` / `featured_media |
// image_url` calls with image-safe references. No product / inventory /
// publication mutations. The theme is not (re)published — we only overwrite
// the section file on whatever theme is currently MAIN.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const PRODUCT_HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const SECTION_FILE = "sections/ailurova-one-product-store.liquid";
const CONFIRM_TOKEN = "CONFIRM_AILUROVA_LIVE_HOTFIX";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
async function readThemeFiles(themeGid: string, filenames: string[]) {
  const q = `query($id: ID!, $filenames: [String!]) {
    theme(id: $id) { id role name updatedAt
      files(filenames: $filenames, first: 20) {
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

// -----------------------------------------------------------------------------
// Section body — image-safe. Only `image_url` targets that are guaranteed
// Image objects (product.featured_image, images[N], media.preview_image with a
// blank check). Anchor links use literal "#ailurova-buy". Mailto is literal.
// -----------------------------------------------------------------------------
function buildFixedSection(): string {
  const PH = PRODUCT_HANDLE;
  return `{%- comment -%}
  Ailurova — One Product Store (hotfixed)
  Image-safe: never pipes a Media object into image_url; uses product.featured_image
  and media.preview_image with blank checks.
{%- endcomment -%}
{%- assign ail_product = all_products['${PH}'] -%}
{%- assign ail_variant = ail_product.selected_or_first_available_variant -%}
{%- assign ail_hero_img = ail_product.featured_image -%}
{%- assign ail_images = ail_product.images -%}

<style>
  .ailurova-root { --ail-bg:#ffffff; --ail-ivory:#faf6ef; --ail-stone:#f2ede4; --ail-line:#e6e0d5;
    --ail-ink:#1f1d1a; --ail-mute:#5b5750; --ail-accent:#8a6a3a; --ail-radius:14px;
    color:var(--ail-ink); background:var(--ail-bg);
    font-family: system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    line-height:1.55; -webkit-font-smoothing:antialiased; }
  .ailurova-root * { box-sizing:border-box; }
  .ailurova-wrap { max-width:1180px; margin:0 auto; padding:0 20px; }
  .ailurova-eyebrow { font-size:12px; letter-spacing:.18em; text-transform:uppercase;
    color:var(--ail-accent); font-weight:600; margin:0 0 12px; }
  .ailurova-h1 { font-size:34px; line-height:1.1; font-weight:700; letter-spacing:-.01em; margin:0 0 14px; }
  .ailurova-lede { font-size:17px; color:var(--ail-mute); margin:0 0 22px; max-width:560px; }
  .ailurova-btn { display:inline-flex; align-items:center; justify-content:center;
    padding:14px 22px; border-radius:999px; background:var(--ail-ink); color:#fff;
    font-weight:600; font-size:15px; letter-spacing:.01em; border:1px solid var(--ail-ink);
    text-decoration:none; cursor:pointer; }
  .ailurova-btn:hover { opacity:.92; }
  .ailurova-btn--wide { width:100%; padding:16px 22px; font-size:16px; }

  .ailurova-hero { background:var(--ail-ivory); padding:56px 0 40px; border-bottom:1px solid var(--ail-line); }
  .ailurova-hero-grid { display:grid; grid-template-columns:1fr; gap:28px; align-items:center; }
  .ailurova-hero-media { border-radius:var(--ail-radius); overflow:hidden; background:#fff; aspect-ratio:4/3; }
  .ailurova-hero-media img { width:100%; height:100%; object-fit:cover; display:block; }
  .ailurova-hero-trust { display:flex; flex-wrap:wrap; gap:14px; margin-top:18px; }
  .ailurova-hero-trust span { font-size:13px; color:var(--ail-mute); display:inline-flex; align-items:center; gap:6px; }
  .ailurova-hero-trust span::before { content:"•"; color:var(--ail-accent); margin-right:6px; }

  .ailurova-buy { padding:56px 0; background:#fff; }
  .ailurova-buy-grid { display:grid; grid-template-columns:1fr; gap:32px; }
  .ailurova-gallery-main { border-radius:var(--ail-radius); overflow:hidden; background:var(--ail-ivory); aspect-ratio:1/1; }
  .ailurova-gallery-main img { width:100%; height:100%; object-fit:cover; display:block; }
  .ailurova-thumbs { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:10px; }
  .ailurova-thumbs button { padding:0; border:1px solid var(--ail-line); background:#fff; border-radius:10px; overflow:hidden; cursor:pointer; aspect-ratio:1/1; }
  .ailurova-thumbs button.is-active { border-color:var(--ail-ink); }
  .ailurova-thumbs img { width:100%; height:100%; object-fit:cover; display:block; }
  .ailurova-title { font-size:26px; line-height:1.2; font-weight:700; margin:0 0 8px; }
  .ailurova-price-row { display:flex; align-items:baseline; gap:10px; margin:0 0 12px; }
  .ailurova-price { font-size:24px; font-weight:700; color:var(--ail-ink); }
  .ailurova-compare { font-size:16px; color:var(--ail-mute); text-decoration:line-through; }
  .ailurova-value { list-style:none; padding:0; margin:14px 0 20px; }
  .ailurova-value li { padding:6px 0; color:var(--ail-mute); font-size:15px; border-bottom:1px dashed var(--ail-line); }
  .ailurova-value li:last-child { border-bottom:none; }
  .ailurova-form label { display:block; font-size:13px; font-weight:600; margin:0 0 6px; text-transform:uppercase; letter-spacing:.06em; }
  .ailurova-form select, .ailurova-form input[type=number] {
    width:100%; padding:12px 14px; border:1px solid var(--ail-line); border-radius:10px;
    background:#fff; font-size:15px; }
  .ailurova-qty { max-width:120px; }
  .ailurova-stock { font-size:13px; color:var(--ail-mute); margin:10px 0 0; }
  .ailurova-stock--in { color:#2d6a4f; }
  .ailurova-stock--out { color:#9b1c1c; }
  .ailurova-reassure { margin-top:12px; font-size:12px; color:var(--ail-mute); text-align:center; }

  .ailurova-benefits { background:var(--ail-stone); padding:56px 0; }
  .ailurova-h2 { font-size:28px; line-height:1.2; font-weight:700; margin:0 0 28px; text-align:center; }
  .ailurova-cards { display:grid; grid-template-columns:1fr; gap:16px; }
  .ailurova-card { background:#fff; border:1px solid var(--ail-line); border-radius:var(--ail-radius); padding:22px; }
  .ailurova-card h3 { font-size:20px; margin:0 0 8px; font-weight:700; }
  .ailurova-card p { margin:0; color:var(--ail-mute); font-size:15px; }

  .ailurova-story { padding:56px 0; background:#fff; }
  .ailurova-story-row { display:grid; grid-template-columns:1fr; gap:20px; align-items:center; margin-bottom:36px; }
  .ailurova-story-row:last-child { margin-bottom:0; }
  .ailurova-story-media { border-radius:var(--ail-radius); overflow:hidden; background:var(--ail-ivory); aspect-ratio:4/3; }
  .ailurova-story-media img { width:100%; height:100%; object-fit:cover; display:block; }
  .ailurova-story h3 { font-size:22px; margin:0 0 10px; font-weight:700; }
  .ailurova-story p { color:var(--ail-mute); margin:0; }

  .ailurova-faq { padding:56px 0; background:var(--ail-ivory); }
  .ailurova-faq-list { max-width:760px; margin:0 auto; }
  .ailurova-faq details { border:1px solid var(--ail-line); border-radius:10px; background:#fff; padding:0; margin-bottom:10px; }
  .ailurova-faq summary { list-style:none; cursor:pointer; padding:14px 18px; font-size:18px; font-weight:600; display:flex; justify-content:space-between; align-items:center; }
  .ailurova-faq summary::-webkit-details-marker { display:none; }
  .ailurova-faq summary::after { content:"+"; font-size:20px; color:var(--ail-mute); }
  .ailurova-faq details[open] summary::after { content:"–"; }
  .ailurova-faq .ail-faq-body { padding:0 18px 16px; color:var(--ail-mute); font-size:15px; }

  .ailurova-support { padding:56px 0; background:#fff; border-top:1px solid var(--ail-line); text-align:center; }
  .ailurova-support h2 { font-size:26px; font-weight:700; margin:0 0 10px; }
  .ailurova-support p { color:var(--ail-mute); margin:0 0 16px; }
  .ailurova-support a.ailurova-email { display:inline-block; margin:0 0 20px; color:var(--ail-ink); text-decoration:underline; }

  .ailurova-root .shopify-payment-button { display:none !important; }

  @media (min-width: 780px) {
    .ailurova-wrap { padding:0 32px; }
    .ailurova-hero { padding:80px 0 64px; }
    .ailurova-hero-grid { grid-template-columns:1.05fr 1fr; gap:48px; }
    .ailurova-h1 { font-size:44px; }
    .ailurova-h2 { font-size:32px; }
    .ailurova-buy-grid { grid-template-columns:1.1fr 1fr; gap:56px; align-items:start; }
    .ailurova-cards { grid-template-columns:repeat(3, 1fr); gap:22px; }
    .ailurova-story-row { grid-template-columns:1fr 1fr; gap:40px; }
    .ailurova-story-row.is-reverse .ailurova-story-media { order:2; }
  }
</style>

<div class="ailurova-root">
  {%- comment -%} HERO {%- endcomment -%}
  <section class="ailurova-hero" aria-label="Hero">
    <div class="ailurova-wrap ailurova-hero-grid">
      <div>
        <p class="ailurova-eyebrow">Premium XL Litter System</p>
        <h1 class="ailurova-h1">A Cleaner, Smarter Litter Setup</h1>
        <p class="ailurova-lede">An XL enclosed litter box with a stainless steel base, flip-top access and a removable litter-filter step.</p>
        <a href="#ailurova-buy" class="ailurova-btn">Shop the Litter Box</a>
        <div class="ailurova-hero-trust">
          <span>XL enclosed design</span>
          <span>Easy-clean steel base</span>
          <span>Flexible 3-way setup</span>
        </div>
      </div>
      <div class="ailurova-hero-media">
        {%- if ail_hero_img != blank -%}
          {{ ail_hero_img | image_url: width: 1400 | image_tag: loading: 'eager', fetchpriority: 'high', alt: ail_product.title, widths: '480,720,1080,1400' }}
        {%- endif -%}
      </div>
    </div>
  </section>

  {%- comment -%} PURCHASE {%- endcomment -%}
  <section id="ailurova-buy" class="ailurova-buy" aria-label="Purchase">
    <div class="ailurova-wrap ailurova-buy-grid">
      <div>
        <div class="ailurova-gallery-main" id="ailurova-gallery-main">
          {%- if ail_hero_img != blank -%}
            {{ ail_hero_img | image_url: width: 1200 | image_tag: alt: ail_product.title, loading: 'lazy', widths: '480,720,1080,1200' }}
          {%- endif -%}
        </div>
        {%- if ail_images.size > 1 -%}
          <div class="ailurova-thumbs" role="tablist" aria-label="Product images">
            {%- for img in ail_images limit: 8 -%}
              {%- if img != blank -%}
                <button type="button" class="{% if forloop.first %}is-active{% endif %}" data-ail-thumb="{{ img | image_url: width: 1200 }}" aria-label="Show image {{ forloop.index }}">
                  {{ img | image_url: width: 200 | image_tag: alt: '', loading: 'lazy' }}
                </button>
              {%- endif -%}
            {%- endfor -%}
          </div>
        {%- endif -%}
      </div>

      <div>
        <h2 class="ailurova-title">{{ ail_product.title | default: 'Ailurova XL Stainless Steel Enclosed Cat Litter Box' }}</h2>
        <div class="ailurova-price-row">
          {%- if ail_variant != blank -%}
            <span class="ailurova-price">{{ ail_variant.price | money }}</span>
            {%- if ail_variant.compare_at_price and ail_variant.compare_at_price > ail_variant.price -%}
              <span class="ailurova-compare">{{ ail_variant.compare_at_price | money }}</span>
            {%- endif -%}
          {%- endif -%}
        </div>
        <ul class="ailurova-value">
          <li>XL enclosed design with flip-top access</li>
          <li>Stainless steel base for straightforward cleaning</li>
          <li>Removable litter-filter step to reduce tracking</li>
        </ul>

        {%- if ail_product != blank and ail_variant != blank -%}
          {%- form 'product', ail_product, class: 'ailurova-form', id: 'ailurova-product-form' -%}
            {%- if ail_product.variants.size > 1 -%}
              <div style="margin-bottom:16px;">
                <label for="ailurova-variant-select">Options</label>
                <select name="id" id="ailurova-variant-select" required>
                  {%- for v in ail_product.variants -%}
                    <option value="{{ v.id }}" {% if v == ail_variant %}selected{% endif %} {% unless v.available %}disabled{% endunless %}>
                      {{ v.title }} — {{ v.price | money }}{% unless v.available %} · Sold out{% endunless %}
                    </option>
                  {%- endfor -%}
                </select>
              </div>
            {%- else -%}
              <input type="hidden" name="id" value="{{ ail_variant.id }}">
            {%- endif -%}

            <div style="margin-bottom:16px;">
              <label for="ailurova-qty">Quantity</label>
              <input type="number" id="ailurova-qty" name="quantity" min="1" value="1" class="ailurova-qty">
            </div>

            <button type="submit" name="add" class="ailurova-btn ailurova-btn--wide" {% unless ail_variant.available %}disabled{% endunless %}>
              {%- if ail_variant.available -%}Add to cart{%- else -%}Sold out{%- endif -%}
            </button>

            <p class="ailurova-stock {% if ail_variant.available %}ailurova-stock--in{% else %}ailurova-stock--out{% endif %}">
              {%- if ail_variant.available -%}In stock — ships from our fulfillment partner{%- else -%}Currently unavailable{%- endif -%}
            </p>
            <p class="ailurova-reassure">Secure checkout · US shipping · Support available</p>
          {%- endform -%}
        {%- else -%}
          <p style="color:#9b1c1c;">Product is temporarily unavailable.</p>
        {%- endif -%}
      </div>
    </div>
  </section>

  {%- comment -%} BENEFITS {%- endcomment -%}
  <section class="ailurova-benefits" aria-label="Why Ailurova">
    <div class="ailurova-wrap">
      <h2 class="ailurova-h2">Why Ailurova</h2>
      <div class="ailurova-cards">
        <div class="ailurova-card"><h3>Flexible Setup</h3><p>Use it as an open, semi-enclosed or fully enclosed litter box.</p></div>
        <div class="ailurova-card"><h3>Stainless Steel Base</h3><p>Designed for straightforward wiping and routine cleaning.</p></div>
        <div class="ailurova-card"><h3>Flip-Top Access</h3><p>Open the lid for easier scooping and daily care.</p></div>
      </div>
    </div>
  </section>

  {%- comment -%} VISUAL STORY {%- endcomment -%}
  {%- assign ail_story_1 = ail_images[1] | default: ail_hero_img -%}
  {%- assign ail_story_2 = ail_images[2] | default: ail_hero_img -%}
  {%- assign ail_story_3 = ail_images[3] | default: ail_hero_img -%}
  <section class="ailurova-story" aria-label="Product Story">
    <div class="ailurova-wrap">
      <div class="ailurova-story-row">
        <div class="ailurova-story-media">
          {%- if ail_story_1 != blank -%}{{ ail_story_1 | image_url: width: 1200 | image_tag: alt: 'Three-way setup', loading: 'lazy' }}{%- endif -%}
        </div>
        <div><h3>Three Ways to Set It Up</h3><p>Switch between open, semi-enclosed and fully enclosed configurations to match your cat and your space.</p></div>
      </div>
      <div class="ailurova-story-row is-reverse">
        <div class="ailurova-story-media">
          {%- if ail_story_2 != blank -%}{{ ail_story_2 | image_url: width: 1200 | image_tag: alt: 'Flip-top access', loading: 'lazy' }}{%- endif -%}
        </div>
        <div><h3>Easy Flip-Top Access</h3><p>The hinged top opens fully so daily scooping and cleaning stay quick and simple.</p></div>
      </div>
      <div class="ailurova-story-row">
        <div class="ailurova-story-media">
          {%- if ail_story_3 != blank -%}{{ ail_story_3 | image_url: width: 1200 | image_tag: alt: 'Litter-filter step', loading: 'lazy' }}{%- endif -%}
        </div>
        <div><h3>Removable Litter-Filter Step</h3><p>The step-in filter catches loose litter as your cat exits, then lifts out for easy rinsing.</p></div>
      </div>
    </div>
  </section>

  {%- comment -%} FAQ {%- endcomment -%}
  <section class="ailurova-faq" aria-label="Frequently asked questions">
    <div class="ailurova-wrap">
      <h2 class="ailurova-h2">Frequently Asked Questions</h2>
      <div class="ailurova-faq-list">
        <details><summary>Is this litter box suitable for larger cats?</summary><div class="ail-faq-body">Yes. The XL enclosed design gives large cats comfortable room to turn, dig and cover.</div></details>
        <details><summary>Can it be used without the full enclosure?</summary><div class="ail-faq-body">Yes. The lid and side panels can be removed for an open or semi-enclosed setup, whichever your cat prefers.</div></details>
        <details><summary>How do I clean the stainless steel base?</summary><div class="ail-faq-body">Wipe the base with a mild soap and warm water, then dry. Stainless steel resists staining and holds up to routine cleaning.</div></details>
        <details><summary>What is included?</summary><div class="ail-faq-body">The stainless steel base, the enclosure lid, the flip-top access panel and the removable litter-filter step.</div></details>
      </div>
    </div>
  </section>

  {%- comment -%} SUPPORT CTA {%- endcomment -%}
  <section class="ailurova-support" aria-label="Support">
    <div class="ailurova-wrap">
      <h2>Questions Before Ordering?</h2>
      <p>Our support team is ready to help.</p>
      <a class="ailurova-email" href="mailto:support@ailurova.com">support@ailurova.com</a>
      <div><a href="#ailurova-buy" class="ailurova-btn">Shop the Litter Box</a></div>
    </div>
  </section>
</div>

<script>
  (function(){
    var main = document.getElementById('ailurova-gallery-main');
    if (!main) return;
    var img = main.querySelector('img');
    var thumbs = document.querySelectorAll('[data-ail-thumb]');
    thumbs.forEach(function(btn){
      btn.addEventListener('click', function(){
        var url = btn.getAttribute('data-ail-thumb');
        if (img && url) img.setAttribute('src', url);
        thumbs.forEach(function(b){ b.classList.remove('is-active'); });
        btn.classList.add('is-active');
      });
    });
  })();
</script>

{% schema %}
{
  "name": "Ailurova Storefront",
  "settings": [],
  "presets": [ { "name": "Ailurova Storefront" } ]
}
{% endschema %}
`;
}

async function run(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "execute";
  const confirm = url.searchParams.get("confirm") ?? "";

  const themes = await listThemes();
  const main = themes.find(t => String(t.role).toLowerCase() === "main");
  if (!main) return { verdict: "AILUROVA_LIVE_HOTFIX_BLOCKED", reason: "no MAIN theme found", themes };
  const mainGid = `gid://shopify/OnlineStoreTheme/${main.id}`;

  const rd = await readThemeFiles(mainGid, [SECTION_FILE, "templates/index.json"]);
  const raw: Record<string, string> = {};
  for (const n of rd.data?.theme?.files?.nodes ?? []) {
    const c = decodeBody(n?.body); if (c != null) raw[n.filename] = c;
  }
  const sectionBefore = raw[SECTION_FILE] ?? "";
  const indexRaw = raw["templates/index.json"] ?? "";
  const sectionOnLiveTheme = sectionBefore.length > 0;
  const indexReferencesSection = indexRaw.includes("ailurova-one-product-store");

  if (mode === "audit") {
    return {
      verdict: "AILUROVA_LIVE_HOTFIX_AUDIT",
      mainTheme: { id: main.id, name: main.name, role: main.role, updated_at: main.updated_at },
      sectionOnLiveTheme,
      indexReferencesSection,
      brokenPatterns: {
        featured_media_pipe_image_url: (sectionBefore.match(/featured_media\s*\|\s*image_url/g) ?? []).length,
        media_pipe_image_url:          (sectionBefore.match(/(?<!preview_)\bmedia\s*\|\s*image_url/g) ?? []).length,
        media_arr_pipe_image_url:      (sectionBefore.match(/ail_media_arr\[\d+\]\s*\|\s*image_url/g) ?? []).length,
      },
    };
  }

  if (confirm !== CONFIRM_TOKEN) {
    return { verdict: "CONFIRM_TOKEN_REQUIRED", required: CONFIRM_TOKEN };
  }
  if (!sectionOnLiveTheme || !indexReferencesSection) {
    return {
      verdict: "AILUROVA_LIVE_HOTFIX_BLOCKED",
      reason: "section or index reference missing on MAIN theme — nothing to hotfix here",
      mainTheme: { id: main.id, name: main.name, role: main.role },
      sectionOnLiveTheme, indexReferencesSection,
    };
  }

  const fixed = buildFixedSection();
  const up = await themeFilesUpsert(mainGid, [
    { filename: SECTION_FILE, body: { type: "TEXT", value: fixed } },
  ]);
  const userErrors = up.data?.themeFilesUpsert?.userErrors ?? [];
  if (userErrors.length > 0) {
    return { verdict: "AILUROVA_LIVE_HOTFIX_BLOCKED", reason: "themeFilesUpsert userErrors", userErrors };
  }

  const rb = await readThemeFiles(mainGid, [SECTION_FILE]);
  const rbBody = decodeBody(rb.data?.theme?.files?.nodes?.[0]?.body) ?? "";
  const badFeaturedMedia = /featured_media\s*\|\s*image_url/.test(rbBody);
  const badMediaPipe = /(?<!preview_)\bmedia\s*\|\s*image_url/.test(rbBody);
  const badMediaArr = /ail_media_arr\[\d+\]\s*\|\s*image_url/.test(rbBody);
  const hasForm = /\{%-?\s*form\s+'product'/.test(rbBody);
  const hasAnchor = rbBody.includes('href="#ailurova-buy"');
  const hasMailto = rbBody.includes('href="mailto:support@ailurova.com"');

  const passed = !badFeaturedMedia && !badMediaPipe && !badMediaArr && hasForm && hasAnchor && hasMailto;

  return {
    verdict: passed ? "AILUROVA_LIVE_HOTFIX_COMPLETE" : "AILUROVA_LIVE_HOTFIX_BLOCKED",
    mainTheme: { id: main.id, name: main.name, role: main.role },
    fileWritten: SECTION_FILE,
    checks: {
      no_featured_media_image_url: !badFeaturedMedia,
      no_bare_media_image_url: !badMediaPipe,
      no_media_arr_image_url: !badMediaArr,
      product_form_present: hasForm,
      anchor_link_literal: hasAnchor,
      mailto_literal: hasMailto,
    },
    protectedProduct: { handle: PRODUCT_HANDLE, mutations: 0 },
    publications: 0,
    inventoryMutations: 0,
    priceMutations: 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try { return json(await run(req)); }
  catch (e: any) { return json({ verdict: "AILUROVA_LIVE_HOTFIX_ERROR", error: String(e?.message ?? e) }, 500); }
});