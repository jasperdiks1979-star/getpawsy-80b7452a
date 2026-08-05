// AILUROVA STOREFRONT REBUILD — scoped, snapshot-first, rollback-safe.
// modes: "snapshot" (read-only) | "apply" | "verify"
// Scope is hard-limited to: product copy/SEO/media-alt, About+FAQ pages,
// support-email replacement in theme files & pages. Nothing else is touched.
import { getShopifyConfig, shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const OLD_EMAIL = "support@getpawsy.pet";
const NEW_EMAIL = "support@ailurova.com";

async function gql<T>(q: string, v: Record<string, unknown> = {}) {
  const r = await shopifyAdminFetch<T>(q, v);
  if (r.errors) throw new Error(`GraphQL error: ${JSON.stringify(r.errors).slice(0, 800)}`);
  return r.data as T;
}

const PRODUCT_Q = `query($id:ID!){ product(id:$id){
  id title handle status vendor descriptionHtml
  seo{title description}
  onlineStoreUrl
  variants(first:5){nodes{id title sku price compareAtPrice inventoryQuantity availableForSale}}
  media(first:25){nodes{ id alt mediaContentType ... on MediaImage { image{url width height} } }}
} }`;

const PAGES_Q = `query{ pages(first:50){nodes{id title handle bodySummary body }} }`;

const THEMES_Q = `query{ themes(first:20, roles:[MAIN]){nodes{id name role}} }`;

async function themeFiles(themeId: string, filenames?: string[]) {
  const q = `query($id:ID!,$f:[String!]){ theme(id:$id){ id name files(first:250, filenames:$f){ nodes{ filename body{ ... on OnlineStoreThemeFileBodyText { content } } } } } }`;
  return await gql<{ theme: { id: string; name: string; files: { nodes: { filename: string; body: { content?: string } }[] } } }>(q, { id: themeId, f: filenames ?? null });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode = body.mode ?? "snapshot";
    const { domain } = getShopifyConfig();

    const product = (await gql<{ product: any }>(PRODUCT_Q, { id: PRODUCT_GID })).product;
    const pages = (await gql<{ pages: { nodes: any[] } }>(PAGES_Q)).pages.nodes;
    const theme = (await gql<{ themes: { nodes: any[] } }>(THEMES_Q)).themes.nodes[0];

    // scan main theme for the legacy email + shipping wording
    const tf = await themeFiles(theme.id);
    const hits = tf.theme.files.nodes
      .filter((f) => (f.body?.content ?? "").includes(OLD_EMAIL) || /1[–-]3 business days/i.test(f.body?.content ?? ""))
      .map((f) => ({
        filename: f.filename,
        emailHits: ((f.body?.content ?? "").match(new RegExp(OLD_EMAIL, "g")) || []).length,
        shipHits: ((f.body?.content ?? "").match(/Ships? in 1[–-]3 business days/gi) || []).length,
      }));

    const pageHits = pages
      .filter((p) => (p.body ?? "").includes(OLD_EMAIL))
      .map((p) => ({ handle: p.handle, id: p.id }));

    const snapshot = {
      shop: domain,
      theme: { id: theme.id, name: theme.name, fileCount: tf.theme.files.nodes.length },
      product: {
        id: product.id, title: product.title, handle: product.handle, status: product.status,
        vendor: product.vendor, descriptionHtmlLength: (product.descriptionHtml ?? "").length,
        descriptionHtml: product.descriptionHtml, seo: product.seo,
        variants: product.variants.nodes,
        media: product.media.nodes.map((m: any, i: number) => ({ i, id: m.id, alt: m.alt, url: m.image?.url })),
      },
      pages: pages.map((p) => ({ handle: p.handle, id: p.id, title: p.title })),
      legacyEmailInThemeFiles: hits,
      legacyEmailInPages: pageHits,
    };

    if (mode === "snapshot") {
      return new Response(JSON.stringify({ ok: true, mode, snapshot }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ---------------- APPLY ----------------
    if (mode === "apply") {
      const rollback: Record<string, unknown> = {
        product: {
          descriptionHtml: product.descriptionHtml,
          seo: product.seo,
          media: product.media.nodes.map((m: any) => ({ id: m.id, alt: m.alt })),
        },
        pages: {},
      };
      const mutations: any[] = [];

      // 1) Product description + SEO
      const DESC = `
<h2>A calmer litter routine, in one enclosed box</h2>
<p>The Ailurova XL is a large enclosed cat litter box built around a <strong>stainless steel base tray</strong> with an enclosed upper section. The high-sided steel tray gives you a smooth, seamless surface to wipe down, while the enclosure and flip-top lid keep the litter area contained and out of sight.</p>
<h3>What makes it different</h3>
<ul>
<li><strong>Stainless steel base tray.</strong> A smooth metal surface that wipes clean with a cloth and warm water &mdash; no textured plastic corners to scrub.</li>
<li><strong>Enclosed upper section.</strong> The hood keeps the litter area private for your cat and visually tidy in your room.</li>
<li><strong>Flip-top lid.</strong> The top opens wide so you can scoop and clean without dismantling the box.</li>
<li><strong>Extra-large footprint.</strong> Designed as an XL box for cats that want room to turn around.</li>
<li><strong>Filter step at the entrance.</strong> Litter caught on paws falls through the step instead of travelling across your floor.</li>
<li><strong>Light Gray finish.</strong> A neutral, modern look made to sit in a living space rather than be hidden away.</li>
</ul>
<h3>Cleaning &amp; care</h3>
<p>Scoop daily as usual. For a deeper clean, empty the tray and wipe the stainless steel base with warm water and a mild household cleaner, then dry it. Rinse and dry the plastic parts of the enclosure and the step in the same way.</p>
<h3>Shipping &amp; returns</h3>
<p><strong>Free US shipping</strong> &middot; Processing time: 1&ndash;3 business days &middot; Estimated delivery after dispatch: 5&ndash;10 business days &middot; 30-day returns.</p>
<p>Questions before you order? Email <a href="mailto:${NEW_EMAIL}">${NEW_EMAIL}</a> and we will get back to you.</p>
<h3>Frequently asked</h3>
<p><strong>Is the whole box stainless steel?</strong><br>No. The <em>base tray</em> is stainless steel. The upper enclosure and lid are the moulded shell around it. We describe it this way on purpose so you know exactly what you are buying.</p>
<p><strong>What colour is it?</strong><br>It ships in Light Gray.</p>
<p><strong>Where do you ship?</strong><br>We ship to the United States. Shipping is free on this product.</p>
<p><strong>What if it is not right for us?</strong><br>You have 30 days to return it. Email <a href="mailto:${NEW_EMAIL}">${NEW_EMAIL}</a> with your order number and we will send return instructions.</p>
<p><strong>Can you confirm the exact measurements?</strong><br>We are confirming the final assembled measurements with our manufacturer before we publish them. If you need them before ordering, email <a href="mailto:${NEW_EMAIL}">${NEW_EMAIL}</a> and we will send the confirmed figures.</p>
`.trim();

      const SEO_TITLE = "Ailurova XL Enclosed Cat Litter Box | Stainless Steel Base";
      const SEO_DESC = "XL enclosed cat litter box with a stainless steel base tray, flip-top lid and filter step. Free US shipping, 30-day returns. Light Gray.";

      const upd = await gql<any>(`mutation($input:ProductInput!){ productUpdate(input:$input){ product{ id descriptionHtml seo{title description} } userErrors{field message} } }`, {
        input: { id: PRODUCT_GID, descriptionHtml: DESC, seo: { title: SEO_TITLE, description: SEO_DESC } },
      });
      mutations.push({ op: "productUpdate(description+seo)", userErrors: upd.productUpdate.userErrors });

      // 2) Media alt text — remove every GetPawsy remnant
      const ALTS = [
        "Ailurova XL enclosed cat litter box in Light Gray with dual-door entry and filter step",
        "Dual-door entry of the Ailurova XL enclosed cat litter box with a cat using the filter step",
        "Light Gray Ailurova XL enclosed cat litter box in a living room with a cat beside it",
        "Ailurova XL litter box shown open-base, semi-enclosed and fully enclosed",
        "Flip-top lid of the Ailurova XL cat litter box opened wide for scooping and cleaning",
        "Person opening the flip-top lid of the Light Gray Ailurova XL enclosed cat litter box",
        "High-sided stainless steel base tray of the Ailurova XL litter box with a cat inside",
        "Cat standing inside the roomy XL interior of the Ailurova enclosed litter box",
        "Stainless steel base tray of the Ailurova XL cat litter box shown with two cats",
      ];
      const mediaInputs = product.media.nodes.map((m: any, i: number) => ({ id: m.id, alt: ALTS[i] ?? ALTS[0] }));
      const mu = await gql<any>(`mutation($pid:ID!,$media:[UpdateMediaInput!]!){ productUpdateMedia(productId:$pid, media:$media){ media{ ... on MediaImage { id alt } } mediaUserErrors{field message} } }`, {
        pid: PRODUCT_GID, media: mediaInputs,
      });
      mutations.push({ op: "productUpdateMedia(alt)", userErrors: mu.productUpdateMedia.mediaUserErrors });

      // 3) About + FAQ pages (email consistency + Skidzo transparency)
      const about = pages.find((p: any) => p.handle === "about");
      const faq = pages.find((p: any) => p.handle === "faq");
      const contact = pages.find((p: any) => p.handle === "contact");
      for (const pg of [about, faq, contact]) if (pg) (rollback.pages as any)[pg.handle] = { id: pg.id, body: pg.body, title: pg.title };

      const ABOUT_BODY = `
<p>Ailurova makes one thing: a large, enclosed litter box that we would want in our own homes.</p>
<p>We started from a simple frustration. Litter boxes are either practical and ugly, or good-looking and miserable to clean. So we focused on the part that actually matters day to day &mdash; a <strong>stainless steel base tray</strong> you can wipe out in seconds, inside an enclosed shell that keeps the whole thing tidy and private for your cat.</p>
<h3>How we work</h3>
<ul>
<li><strong>One product, done properly.</strong> We would rather sell one box well than a catalogue badly.</li>
<li><strong>We say what we know.</strong> If we have not verified a specification with our manufacturer, we do not print it. Ask us and we will tell you honestly where things stand.</li>
<li><strong>Real support.</strong> Every email goes to a person. Write to <a href="mailto:${NEW_EMAIL}">${NEW_EMAIL}</a>.</li>
</ul>
<h3>Shipping &amp; returns</h3>
<p>Free US shipping &middot; Processing time: 1&ndash;3 business days &middot; Estimated delivery after dispatch: 5&ndash;10 business days &middot; 30-day returns.</p>
<h3>Who operates Ailurova</h3>
<p>Ailurova is operated by Skidzo, a Netherlands-based ecommerce business. Orders are supported in English and shipped to customers in the United States. For anything at all, contact <a href="mailto:${NEW_EMAIL}">${NEW_EMAIL}</a>.</p>
`.trim();

      const FAQ_BODY = `
<h3>Is the whole litter box stainless steel?</h3>
<p>No. The base tray is stainless steel. The upper enclosure and flip-top lid are the shell that sits around it. We describe it as a stainless steel base with an enclosed upper section so there are no surprises.</p>
<h3>How do I clean it?</h3>
<p>Scoop daily. For a deeper clean, empty the tray and wipe the stainless steel base with warm water and a mild household cleaner, then dry it. Rinse and dry the plastic parts the same way.</p>
<h3>What colour does it ship in?</h3>
<p>Light Gray.</p>
<h3>Do you ship to the United States?</h3>
<p>Yes. Shipping to the US is free on this product. Processing time is 1&ndash;3 business days, and estimated delivery after dispatch is 5&ndash;10 business days.</p>
<h3>What is your return policy?</h3>
<p>30 days. Email <a href="mailto:${NEW_EMAIL}">${NEW_EMAIL}</a> with your order number and we will send return instructions. See our <a href="/pages/returns">Returns &amp; Refunds</a> page for the full policy.</p>
<h3>Can you confirm the exact measurements?</h3>
<p>We are confirming the final assembled measurements with our manufacturer before publishing them. If you need them before you order, email <a href="mailto:${NEW_EMAIL}">${NEW_EMAIL}</a> and we will send the confirmed figures.</p>
<h3>How do I reach a human?</h3>
<p>Email <a href="mailto:${NEW_EMAIL}">${NEW_EMAIL}</a>. Ailurova is operated by Skidzo, a Netherlands-based ecommerce business.</p>
`.trim();

      const pageUpdate = async (id: string, body: string, label: string) => {
        const r = await gql<any>(`mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id, page:$page){ page{ id handle } userErrors{field message} } }`, { id, page: { body } });
        mutations.push({ op: `pageUpdate(${label})`, userErrors: r.pageUpdate.userErrors });
      };
      if (about) await pageUpdate(about.id, ABOUT_BODY, "about");
      if (faq) await pageUpdate(faq.id, FAQ_BODY, "faq");

      // 4) Any remaining legacy email inside public page bodies (scoped replace only)
      for (const pg of pages) {
        if ((pg.body ?? "").includes(OLD_EMAIL)) {
          (rollback.pages as any)[pg.handle] = { id: pg.id, body: pg.body };
          await pageUpdate(pg.id, (pg.body as string).split(OLD_EMAIL).join(NEW_EMAIL), `email:${pg.handle}`);
        }
      }

      return new Response(JSON.stringify({ ok: true, mode, mutations, rollback, snapshotBefore: snapshot }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: `mode ${mode} not implemented in this build` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
