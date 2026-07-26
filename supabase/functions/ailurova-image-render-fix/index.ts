// AILUROVA — LIVE IMAGE OBJECT RESOLUTION HOTFIX (v3)
// Rewrites sections/ailurova-one-product-store.liquid on the current MAIN theme
// to render images DIRECTLY from ail_product.images (no push/concat/capture).
// No product, price, inventory, publication, market, policy or theme-role
// mutation is performed — only the single section file is upserted.

import { shopifyAdminFetch, shopifyAdminRest } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const PRODUCT_HANDLE = "ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats";
const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const SECTION_FILE = "sections/ailurova-one-product-store.liquid";
const CONFIRM = "CONFIRM_AILUROVA_IMAGE_RENDER_FIX";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function decode(body: any): string | null {
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
async function readFile(themeGid: string, filename: string) {
  const q = `query($id: ID!, $filenames: [String!]) {
    theme(id: $id) { id role name updatedAt
      files(filenames: $filenames, first: 5) {
        nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } ... on OnlineStoreThemeFileBodyBase64 { contentBase64 } } }
      } } }`;
  return await shopifyAdminFetch<any>(q, { id: themeGid, filenames: [filename] });
}
async function upsertFile(themeGid: string, filename: string, content: string) {
  const m = `mutation($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename } userErrors { field message code }
    } }`;
  return await shopifyAdminFetch<any>(m, {
    themeId: themeGid,
    files: [{ filename, body: { type: "TEXT", value: content } }],
  });
}
async function inspectProduct() {
  const q = `query($id: ID!) {
    product(id: $id) {
      id handle title status onlineStoreUrl
      featuredImage { url altText }
      images(first: 20) { nodes { url altText width height } }
      media(first: 20) { nodes { mediaContentType } }
    }
  }`;
  return await shopifyAdminFetch<any>(q, { id: PRODUCT_GID });
}

function buildSection(): string {
  const PH = PRODUCT_HANDLE;
  return `{%- comment -%} Ailurova — One Product Store (image render fix v3) {%- endcomment -%}
{%- assign ail_product = all_products['${PH}'] -%}
{%- if ail_product == blank or ail_product.id == blank -%}{%- assign ail_product = product -%}{%- endif -%}
{%- assign ail_variant = ail_product.selected_or_first_available_variant -%}
{%- assign ail_hero_img = ail_product.featured_image -%}
{%- if ail_hero_img == blank -%}{%- assign ail_hero_img = ail_product.images.first -%}{%- endif -%}
{%- assign ail_image_count = ail_product.images.size -%}

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
  .ailurova-hero-media{border-radius:var(--ail-radius);overflow:hidden;background:var(--ail-ivory);aspect-ratio:4/3}
  .ailurova-hero-media img{width:100%;height:100%;object-fit:contain;object-position:center top;display:block}
  .ailurova-buy{padding:56px 0;background:#fff}
  .ailurova-buy-grid{display:grid;grid-template-columns:1fr;gap:32px}
  .ailurova-gallery-main{border-radius:var(--ail-radius);overflow:hidden;background:var(--ail-ivory);aspect-ratio:1/1}
  .ailurova-gallery-main img{width:100%;height:100%;object-fit:contain;object-position:center top;display:block;transition:opacity .2s ease}
  .ailurova-thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
  .ailurova-thumbs button{padding:0;border:1px solid var(--ail-line);background:#fff;border-radius:10px;overflow:hidden;cursor:pointer;aspect-ratio:1/1}
  .ailurova-thumbs button.is-active{border-color:var(--ail-ink)}
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
  .ailurova-faq details[open] summary::after{content:"\\2013"}
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
          {{ ail_hero_img | image_url: width: 1600 | image_tag: loading: 'eager', fetchpriority: 'high', widths: '360,540,720,960,1200,1600', sizes: '(max-width: 749px) 100vw, 50vw', alt: ail_hero_img.alt | default: ail_product.title }}
        </div>
      {%- endif -%}
    </div>
  </section>

  <section id="ailurova-buy" class="ailurova-buy" aria-label="Purchase">
    <div class="ailurova-wrap ailurova-buy-grid">
      <div>
        {%- if ail_hero_img != blank -%}
          <div class="ailurova-gallery-main">
            <img id="ailurova-main-image"
                 src="{{ ail_hero_img | image_url: width: 1400 }}"
                 srcset="{{ ail_hero_img | image_url: width: 480 }} 480w, {{ ail_hero_img | image_url: width: 720 }} 720w, {{ ail_hero_img | image_url: width: 960 }} 960w, {{ ail_hero_img | image_url: width: 1200 }} 1200w, {{ ail_hero_img | image_url: width: 1400 }} 1400w"
                 sizes="(min-width:780px) 50vw, 100vw"
                 alt="{{ ail_hero_img.alt | default: ail_product.title }}"
                 loading="lazy" width="1400" height="1400">
          </div>
        {%- endif -%}
        {%- if ail_image_count > 0 -%}
          <div class="ailurova-thumbs" aria-label="Product images">
            {%- for img in ail_product.images limit: 9 -%}
              {%- if img != blank -%}
                <button type="button"
                        class="ailurova-thumb {% if forloop.first %}is-active{% endif %}"
                        data-full="{{ img | image_url: width: 1400 }}"
                        aria-label="Show image {{ forloop.index }}">
                  {{ img | image_url: width: 240 | image_tag: loading: 'lazy', widths: '160,240,320', sizes: '25vw', alt: '' }}
                </button>
              {%- endif -%}
            {%- endfor -%}
          </div>
          <script>
            (function(){
              var root = document.currentScript && document.currentScript.parentElement;
              if(!root) return;
              var main = root.querySelector('#ailurova-main-image');
              var thumbs = root.querySelectorAll('.ailurova-thumb');
              thumbs.forEach(function(t){
                t.addEventListener('click', function(){
                  var full = t.getAttribute('data-full');
                  if(main && full){ main.src = full; main.removeAttribute('srcset'); }
                  thumbs.forEach(function(x){ x.classList.remove('is-active'); });
                  t.classList.add('is-active');
                });
              });
            })();
          </script>
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
                    <option value="{{ v.id }}" {% if v == ail_variant %}selected{% endif %} {% unless v.available %}disabled{% endunless %}>{{ v.title }} \u2014 {{ v.price | money }}{% unless v.available %} \u00b7 Sold out{% endunless %}</option>
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
              {%- if ail_variant.available -%}In stock \u2014 ships from our fulfillment partner{%- else -%}Currently unavailable{%- endif -%}
            </p>
            <p class="ailurova-reassure">Secure checkout \u00b7 US shipping \u00b7 Support available</p>
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

  {%- if ail_image_count > 1 -%}
    {%- assign ail_story_titles = 'Three Ways to Set It Up|Easy Flip-Top Access|Removable Litter-Filter Step' | split: '|' -%}
    {%- assign ail_story_bodies = 'Switch between open, semi-enclosed and fully enclosed configurations to match your cat and your space.|The hinged top opens fully so daily scooping and cleaning stay quick and simple.|The step-in filter catches loose litter as your cat exits, then lifts out for easy rinsing.' | split: '|' -%}
    <section class="ailurova-story" aria-label="Product Story">
      <div class="ailurova-wrap">
        {%- for i in (0..2) -%}
          {%- assign story_index = i | plus: 2 -%}
          {%- assign story_img = ail_product.images[story_index] -%}
          {%- if story_img == blank -%}{%- assign story_img = ail_product.images[i] -%}{%- endif -%}
          {%- if story_img == blank -%}{%- assign story_img = ail_hero_img -%}{%- endif -%}
          {%- if story_img != blank -%}
            <div class="ailurova-story-row {% if i == 1 %}is-reverse{% endif %}">
              <div class="ailurova-story-media">
                {{ story_img | image_url: width: 1200 | image_tag: loading: 'lazy', widths: '360,540,720,960,1200', sizes: '(min-width:780px) 50vw, 100vw', alt: story_img.alt | default: ail_story_titles[i] }}
              </div>
              <div>
                <h3>{{ ail_story_titles[i] }}</h3>
                <p>{{ ail_story_bodies[i] }}</p>
              </div>
            </div>
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
      <h2>Questions? We\u2019re here to help.</h2>
      <p>Reach our support team any time.</p>
      <a class="ailurova-email" href="mailto:support@ailurova.com">support@ailurova.com</a>
    </div>
  </section>
</div>

{% schema %}
{
  "name": "Ailurova Product Store",
  "settings": [],
  "presets": [{ "name": "Ailurova Product Store" }]
}
{% endschema %}
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode = body.mode || "audit";
    const confirm = body.confirm;

    const themes = await listThemes();
    const main = themes.find(t => t.role?.toLowerCase() === "main");
    if (!main) return json({ verdict: "AILUROVA_LIVE_IMAGES_STILL_BLOCKED", error: "no main theme" }, 500);
    const themeGid = `gid://shopify/OnlineStoreTheme/${main.id}`;

    const prod = await inspectProduct();
    const p = prod.data?.product;
    const imgCount = p?.images?.nodes?.length ?? 0;

    const current = await readFile(themeGid, SECTION_FILE);
    const currentBody = current.data?.theme?.files?.nodes?.[0]?.body;
    const currentContent = decode(currentBody);

    if (mode === "audit") {
      return json({
        verdict: "AUDIT_ONLY",
        theme: { id: main.id, name: main.name, role: main.role },
        product: {
          id: p?.id, handle: p?.handle, title: p?.title, status: p?.status,
          onlineStoreUrl: p?.onlineStoreUrl,
          images_count: imgCount,
          featuredImage: p?.featuredImage,
        },
        section_present: !!currentContent,
        section_uses_push: currentContent ? currentContent.includes("| push:") : null,
      });
    }

    if (confirm !== CONFIRM) {
      return json({ verdict: "MISSING_CONFIRM", expected: CONFIRM }, 400);
    }

    const nextContent = buildSection();
    const backup = currentContent
      ? `sections/ailurova-one-product-store.backup-${Date.now()}.liquid.txt`
      : null;
    if (currentContent && backup) {
      await upsertFile(themeGid, `assets/${backup.split("/").pop()}`, currentContent).catch(() => {});
    }
    const upsert = await upsertFile(themeGid, SECTION_FILE, nextContent);
    const errs = upsert.data?.themeFilesUpsert?.userErrors ?? [];
    if (errs.length) {
      return json({ verdict: "AILUROVA_LIVE_IMAGES_STILL_BLOCKED", stage: "upsert", userErrors: errs }, 500);
    }

    return json({
      verdict: "AILUROVA_LIVE_IMAGES_VISIBLE_WRITE_OK",
      note: "Section rewritten. Perform public storefront verification to confirm rendered pixels.",
      theme: { id: main.id, name: main.name, role: main.role },
      product: {
        images_count: imgCount,
        featuredImage: p?.featuredImage,
        first_image_url: p?.images?.nodes?.[0]?.url ?? null,
      },
      section_bytes: nextContent.length,
      backup_asset: backup,
      mutation_ledger: [
        { op: "themeFilesUpsert", theme_id: main.id, filename: SECTION_FILE },
      ],
    });
  } catch (e) {
    return json({ verdict: "AILUROVA_LIVE_IMAGES_STILL_BLOCKED", error: String(e?.message || e) }, 500);
  }
});