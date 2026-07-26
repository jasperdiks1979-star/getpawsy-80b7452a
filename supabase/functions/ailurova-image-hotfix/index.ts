// AILUROVA — LIVE IMAGE RENDER HOTFIX v2
// Read-only diagnostic + safe image-render repair for the CURRENT MAIN theme's
// sections/ailurova-one-product-store.liquid. No product/inventory/publication/
// theme-publish mutations. Only the section file is upserted.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const PRODUCT_HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const SECTION_FILE = "sections/ailurova-one-product-store.liquid";
const CONFIRM_TOKEN = "CONFIRM_AILUROVA_IMAGE_HOTFIX";

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
async function inspectProduct() {
  const q = `query($id: ID!) {
    product(id: $id) {
      id handle title status onlineStoreUrl
      featuredImage { url altText }
      images(first: 20) { nodes { url altText width height } }
      media(first: 20) { nodes { mediaContentType alt preview { image { url altText } } } }
      variants(first: 5) { nodes { id title availableForSale inventoryQuantity price } }
    }
  }`;
  return await shopifyAdminFetch<any>(q, { id: PRODUCT_GID });
}

function buildSafeSection(): string {
  const PH = PRODUCT_HANDLE;
  return `{%- comment -%} Ailurova — One Product Store (image hotfix v2) {%- endcomment -%}
{%- assign ail_product = all_products['${PH}'] -%}
{%- if ail_product == blank or ail_product.id == blank -%}
  {%- assign ail_product = product -%}
{%- endif -%}
{%- assign ail_variant = ail_product.selected_or_first_available_variant -%}

{%- comment -%} Build a clean array of ONLY valid Image objects. {%- endcomment -%}
{%- assign ail_valid_images = '' | split: '' -%}
{%- if ail_product.featured_image != blank -%}
  {%- assign ail_valid_images = ail_valid_images | push: ail_product.featured_image -%}
{%- endif -%}
{%- for img in ail_product.images -%}
  {%- if img != blank and img.src != blank -%}
    {%- assign already = false -%}
    {%- for v in ail_valid_images -%}{%- if v.id == img.id -%}{%- assign already = true -%}{%- endif -%}{%- endfor -%}
    {%- unless already -%}{%- assign ail_valid_images = ail_valid_images | push: img -%}{%- endunless -%}
  {%- endif -%}
{%- endfor -%}
{%- for m in ail_product.media -%}
  {%- if m.media_type == 'image' and m.preview_image != blank and m.preview_image.src != blank -%}
    {%- assign p = m.preview_image -%}
    {%- assign already = false -%}
    {%- for v in ail_valid_images -%}{%- if v.id == p.id -%}{%- assign already = true -%}{%- endif -%}{%- endfor -%}
    {%- unless already -%}{%- assign ail_valid_images = ail_valid_images | push: p -%}{%- endunless -%}
  {%- endif -%}
{%- endfor -%}
{%- assign ail_hero_img = ail_valid_images[0] -%}
{%- assign ail_image_count = ail_valid_images | size -%}

<style>
  .ailurova-root{--ail-bg:#fff;--ail-ivory:#faf6ef;--ail-stone:#f2ede4;--ail-line:#e6e0d5;--ail-ink:#1f1d1a;--ail-mute:#5b5750;--ail-accent:#8a6a3a;--ail-radius:14px;color:var(--ail-ink);background:var(--ail-bg);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
  .ailurova-root *{box-sizing:border-box}
  .ailurova-wrap{max-width:1180px;margin:0 auto;padding:0 20px}
  .ailurova-eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--ail-accent);font-weight:600;margin:0 0 12px}
  .ailurova-h1{font-size:34px;line-height:1.1;font-weight:700;letter-spacing:-.01em;margin:0 0 14px}
  .ailurova-lede{font-size:17px;color:var(--ail-mute);margin:0 0 22px;max-width:560px}
  .ailurova-btn{display:inline-flex;align-items:center;justify-content:center;padding:14px 22px;border-radius:999px;background:var(--ail-ink);color:#fff;font-weight:600;font-size:15px;border:1px solid var(--ail-ink);text-decoration:none;cursor:pointer}
  .ailurova-btn--wide{width:100%;padding:16px 22px;font-size:16px}
  .ailurova-hero{background:var(--ail-ivory);padding:56px 0 40px;border-bottom:1px solid var(--ail-line)}
  .ailurova-hero-grid{display:grid;grid-template-columns:1fr;gap:28px;align-items:center}
  .ailurova-hero-media{border-radius:var(--ail-radius);overflow:hidden;background:#fff;aspect-ratio:4/3}
  .ailurova-hero-media img{width:100%;height:100%;object-fit:cover;display:block}
  .ailurova-buy{padding:56px 0;background:#fff}
  .ailurova-buy-grid{display:grid;grid-template-columns:1fr;gap:32px}
  .ailurova-gallery-main{border-radius:var(--ail-radius);overflow:hidden;background:var(--ail-ivory);aspect-ratio:1/1}
  .ailurova-gallery-main img{width:100%;height:100%;object-fit:cover;display:block}
  .ailurova-thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
  .ailurova-thumbs button{padding:0;border:1px solid var(--ail-line);background:#fff;border-radius:10px;overflow:hidden;cursor:pointer;aspect-ratio:1/1}
  .ailurova-thumbs img{width:100%;height:100%;object-fit:cover;display:block}
  .ailurova-title{font-size:26px;line-height:1.2;font-weight:700;margin:0 0 8px}
  .ailurova-price-row{display:flex;align-items:baseline;gap:10px;margin:0 0 12px}
  .ailurova-price{font-size:24px;font-weight:700}
  .ailurova-compare{font-size:16px;color:var(--ail-mute);text-decoration:line-through}
  .ailurova-value{list-style:none;padding:0;margin:14px 0 20px}
  .ailurova-value li{padding:6px 0;color:var(--ail-mute);font-size:15px;border-bottom:1px dashed var(--ail-line)}
  .ailurova-value li:last-child{border-bottom:none}
  .ailurova-form label{display:block;font-size:13px;font-weight:600;margin:0 0 6px;text-transform:uppercase;letter-spacing:.06em}
  .ailurova-form select,.ailurova-form input[type=number]{width:100%;padding:12px 14px;border:1px solid var(--ail-line);border-radius:10px;background:#fff;font-size:15px}
  .ailurova-qty{max-width:120px}
  .ailurova-stock{font-size:13px;margin:10px 0 0}
  .ailurova-stock--in{color:#2d6a4f}
  .ailurova-stock--out{color:#9b1c1c}
  .ailurova-reassure{margin-top:12px;font-size:12px;color:var(--ail-mute);text-align:center}
  .ailurova-benefits{background:var(--ail-stone);padding:56px 0}
  .ailurova-h2{font-size:28px;line-height:1.2;font-weight:700;margin:0 0 28px;text-align:center}
  .ailurova-cards{display:grid;grid-template-columns:1fr;gap:16px}
  .ailurova-card{background:#fff;border:1px solid var(--ail-line);border-radius:var(--ail-radius);padding:22px}
  .ailurova-card h3{font-size:20px;margin:0 0 8px;font-weight:700}
  .ailurova-card p{margin:0;color:var(--ail-mute);font-size:15px}
  .ailurova-story{padding:56px 0;background:#fff}
  .ailurova-story-row{display:grid;grid-template-columns:1fr;gap:20px;align-items:center;margin-bottom:36px}
  .ailurova-story-row:last-child{margin-bottom:0}
  .ailurova-story-media{border-radius:var(--ail-radius);overflow:hidden;background:var(--ail-ivory);aspect-ratio:4/3}
  .ailurova-story-media img{width:100%;height:100%;object-fit:cover;display:block}
  .ailurova-story h3{font-size:22px;margin:0 0 10px;font-weight:700}
  .ailurova-story p{color:var(--ail-mute);margin:0}
  .ailurova-faq{padding:56px 0;background:var(--ail-ivory)}
  .ailurova-faq-list{max-width:760px;margin:0 auto}
  .ailurova-faq details{border:1px solid var(--ail-line);border-radius:10px;background:#fff;margin-bottom:10px}
  .ailurova-faq summary{list-style:none;cursor:pointer;padding:14px 18px;font-size:18px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
  .ailurova-faq summary::-webkit-details-marker{display:none}
  .ailurova-faq summary::after{content:"+";font-size:20px;color:var(--ail-mute)}
  .ailurova-faq details[open] summary::after{content:"–"}
  .ailurova-faq .ail-faq-body{padding:0 18px 16px;color:var(--ail-mute);font-size:15px}
  .ailurova-support{padding:56px 0;background:#fff;border-top:1px solid var(--ail-line);text-align:center}
  .ailurova-support h2{font-size:26px;font-weight:700;margin:0 0 10px}
  .ailurova-support p{color:var(--ail-mute);margin:0 0 16px}
  .ailurova-support a.ailurova-email{display:inline-block;margin:0 0 20px;color:var(--ail-ink);text-decoration:underline}
  .ailurova-root .shopify-payment-button{display:none !important}
  @media (min-width:780px){
    .ailurova-wrap{padding:0 32px}
    .ailurova-hero{padding:80px 0 64px}
    .ailurova-hero-grid{grid-template-columns:1.05fr 1fr;gap:48px}
    .ailurova-h1{font-size:44px}
    .ailurova-h2{font-size:32px}
    .ailurova-buy-grid{grid-template-columns:1.1fr 1fr;gap:56px;align-items:start}
    .ailurova-cards{grid-template-columns:repeat(3,1fr);gap:22px}
    .ailurova-story-row{grid-template-columns:1fr 1fr;gap:40px}
    .ailurova-story-row.is-reverse .ailurova-story-media{order:2}
  }
</style>

<div class="ailurova-root">
  <section class="ailurova-hero" aria-label="Hero">
    <div class="ailurova-wrap ailurova-hero-grid">
      <div>
        <p class="ailurova-eyebrow">Premium XL Litter System</p>
        <h1 class="ailurova-h1">A Cleaner, Smarter Litter Setup</h1>
        <p class="ailurova-lede">An XL enclosed litter box with a stainless steel base, flip-top access and a removable litter-filter step.</p>
        <a href="#ailurova-buy" class="ailurova-btn">Shop the Litter Box</a>
      </div>
      {%- if ail_hero_img != blank -%}
        <div class="ailurova-hero-media">
          {{ ail_hero_img | image_url: width: 1600 | image_tag: loading: 'eager', fetchpriority: 'high', widths: '480,720,960,1200,1600', sizes: '100vw', alt: ail_hero_img.alt | default: ail_product.title }}
        </div>
      {%- endif -%}
    </div>
  </section>

  <section id="ailurova-buy" class="ailurova-buy" aria-label="Purchase">
    <div class="ailurova-wrap ailurova-buy-grid">
      <div>
        {%- if ail_hero_img != blank -%}
          <div class="ailurova-gallery-main">
            {{ ail_hero_img | image_url: width: 1400 | image_tag: loading: 'lazy', widths: '480,720,960,1200,1400', sizes: '(min-width:780px) 50vw, 100vw', alt: ail_hero_img.alt | default: ail_product.title }}
          </div>
        {%- endif -%}
        {%- if ail_image_count > 1 -%}
          <div class="ailurova-thumbs" aria-label="Product images">
            {%- for img in ail_valid_images limit: 8 -%}
              <button type="button" class="{% if forloop.first %}is-active{% endif %}" aria-label="Show image {{ forloop.index }}">
                {{ img | image_url: width: 240 | image_tag: loading: 'lazy', alt: '' }}
              </button>
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
                    <option value="{{ v.id }}" {% if v == ail_variant %}selected{% endif %} {% unless v.available %}disabled{% endunless %}>{{ v.title }} — {{ v.price | money }}{% unless v.available %} · Sold out{% endunless %}</option>
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

  {%- comment -%} VISUAL STORY — only render rows for images that actually exist {%- endcomment -%}
  {%- if ail_image_count > 1 -%}
    {%- assign ail_story_titles = 'Three Ways to Set It Up|Easy Flip-Top Access|Removable Litter-Filter Step' | split: '|' -%}
    {%- assign ail_story_bodies = 'Switch between open, semi-enclosed and fully enclosed configurations to match your cat and your space.|The hinged top opens fully so daily scooping and cleaning stay quick and simple.|The step-in filter catches loose litter as your cat exits, then lifts out for easy rinsing.' | split: '|' -%}
    <section class="ailurova-story" aria-label="Product Story">
      <div class="ailurova-wrap">
        {%- assign ail_story_max = 3 -%}
        {%- assign ail_story_avail = ail_image_count | minus: 1 -%}
        {%- if ail_story_avail < ail_story_max -%}{%- assign ail_story_max = ail_story_avail -%}{%- endif -%}
        {%- for i in (1..3) -%}
          {%- if forloop.index0 < ail_story_max -%}
            {%- assign story_img = ail_valid_images[forloop.index] -%}
            {%- if story_img != blank -%}
              <div class="ailurova-story-row {% if forloop.index0 == 1 %}is-reverse{% endif %}">
                <div class="ailurova-story-media">
                  {{ story_img | image_url: width: 1200 | image_tag: loading: 'lazy', widths: '480,720,1080,1200', sizes: '(min-width:780px) 50vw, 100vw', alt: story_img.alt | default: ail_story_titles[forloop.index0] }}
                </div>
                <div>
                  <h3>{{ ail_story_titles[forloop.index0] }}</h3>
                  <p>{{ ail_story_bodies[forloop.index0] }}</p>
                </div>
              </div>
            {%- endif -%}
          {%- endif -%}
        {%- endfor -%}
      </div>
    </section>
  {%- endif -%}

  <section class="ailurova-faq" aria-label="Frequently asked questions">
    <div class="ailurova-wrap">
      <h2 class="ailurova-h2">Frequently Asked Questions</h2>
      <div class="ailurova-faq-list">
        <details><summary>Is this litter box suitable for larger cats?</summary><div class="ail-faq-body">Yes. The XL enclosed design gives large cats comfortable room to turn, dig and cover.</div></details>
        <details><summary>Can it be used without the full enclosure?</summary><div class="ail-faq-body">Yes. The lid and side panels can be removed for an open or semi-enclosed setup, whichever your cat prefers.</div></details>
        <details><summary>How do I clean the stainless steel base?</summary><div class="ail-faq-body">Wipe the base with a mild soap and warm water, then dry. Stainless steel resists staining and holds up to routine cleaning.</div></details>
        <details><summary>Do you ship to the United States?</summary><div class="ail-faq-body">Yes. We ship to US customers from our fulfillment partner.</div></details>
      </div>
    </div>
  </section>

  <section class="ailurova-support" aria-label="Support">
    <div class="ailurova-wrap">
      <h2>Questions before you buy?</h2>
      <p>Reach our team and we'll help you decide if Ailurova is the right fit.</p>
      <a class="ailurova-email" href="mailto:support@ailurova.com">support@ailurova.com</a><br>
      <a class="ailurova-btn" href="#ailurova-buy">Shop the Litter Box</a>
    </div>
  </section>
</div>

{% schema %}
{ "name": "Ailurova Store", "settings": [], "presets": [{ "name": "Ailurova Store" }] }
{% endschema %}
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }
    const mode = (body.mode ?? url.searchParams.get("mode") ?? "audit").toString();
    const confirm = (body.confirm ?? url.searchParams.get("confirm") ?? "").toString();

    // 1) Detect MAIN theme
    const themes = await listThemes();
    const main = themes.find(t => t.role === "main");
    if (!main) return json({ verdict: "AILUROVA_IMAGE_HOTFIX_BLOCKED", reason: "no MAIN theme" }, 200);
    const mainGid = `gid://shopify/OnlineStoreTheme/${main.id}`;

    // 2) Product image inspection
    const prodRes = await inspectProduct();
    const p = prodRes.data?.product;
    const featured = p?.featuredImage?.url ?? null;
    const images: string[] = (p?.images?.nodes ?? []).map((n: any) => n.url).filter(Boolean);
    const mediaPreviews: string[] = (p?.media?.nodes ?? [])
      .map((n: any) => n.preview?.image?.url).filter(Boolean);
    const validCount = new Set<string>([featured, ...images, ...mediaPreviews].filter(Boolean) as string[]).size;

    // 3) Read live section
    const rb0 = await readThemeFiles(mainGid, [SECTION_FILE]);
    const beforeBody = decodeBody(rb0.data?.theme?.files?.nodes?.[0]?.body) ?? "";

    const audit = {
      mainTheme: { id: main.id, name: main.name, role: main.role },
      product: {
        gid: p?.id, handle: p?.handle, title: p?.title, status: p?.status,
        onlineStoreUrl: p?.onlineStoreUrl,
        featuredImageUrl: featured,
        imageCount: images.length,
        firstImageUrls: images.slice(0, 4),
        mediaPreviewCount: mediaPreviews.length,
        variantCount: p?.variants?.nodes?.length ?? 0,
        firstVariant: p?.variants?.nodes?.[0] ?? null,
        validRenderableImageCount: validCount,
      },
      productQueryErrors: prodRes.errors ?? null,
      liveSection: {
        exists: beforeBody.length > 0,
        lengthBefore: beforeBody.length,
      },
    };

    if (mode === "audit" || confirm !== CONFIRM_TOKEN) {
      return json({ verdict: "AILUROVA_IMAGE_HOTFIX_AUDIT", audit });
    }

    if (validCount === 0) {
      return json({ verdict: "AILUROVA_IMAGE_HOTFIX_BLOCKED_NO_PRODUCT_IMAGES", audit }, 200);
    }

    // 4) Write repaired section
    const fixed = buildSafeSection();
    const up = await themeFilesUpsert(mainGid, [{ filename: SECTION_FILE, body: { type: "TEXT", value: fixed } }]);
    const userErrors = up.data?.themeFilesUpsert?.userErrors ?? [];
    if (userErrors.length > 0) {
      return json({ verdict: "AILUROVA_IMAGE_HOTFIX_BLOCKED", reason: "themeFilesUpsert userErrors", userErrors, audit }, 200);
    }

    // 5) Read-back
    const rb1 = await readThemeFiles(mainGid, [SECTION_FILE]);
    const afterBody = decodeBody(rb1.data?.theme?.files?.nodes?.[0]?.body) ?? "";
    const checks = {
      uses_all_products: /all_products\['/.test(afterBody),
      builds_valid_image_array: /ail_valid_images/.test(afterBody),
      hero_blank_guard: /ail_hero_img != blank/.test(afterBody),
      no_bare_media_image_url: !/(?<!preview_)\bmedia\s*\|\s*image_url/.test(afterBody),
      no_featured_media_image_url: !/featured_media\s*\|\s*image_url/.test(afterBody),
      product_form_present: /\{%-?\s*form\s+'product'/.test(afterBody),
      story_conditional_on_count: /ail_image_count > 1/.test(afterBody),
    };
    const passed = Object.values(checks).every(Boolean);

    return json({
      verdict: passed ? "AILUROVA_LIVE_IMAGES_REPAIRED" : "AILUROVA_IMAGE_HOTFIX_BLOCKED",
      audit,
      changes: {
        fileWritten: SECTION_FILE,
        themeId: main.id,
        lengthBefore: beforeBody.length,
        lengthAfter: afterBody.length,
      },
      checks,
      mutationLedger: {
        themeFileUpserts: 1,
        productMutations: 0,
        priceMutations: 0,
        inventoryMutations: 0,
        publicationMutations: 0,
        themePublishes: 0,
      },
    });
  } catch (e) {
    return json({ verdict: "AILUROVA_IMAGE_HOTFIX_ERROR", error: String(e?.message ?? e) }, 200);
  }
});