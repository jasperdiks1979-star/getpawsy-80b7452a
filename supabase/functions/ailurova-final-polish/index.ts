// AILUROVA — FINAL POLISH & QA PASS
//
// Strictly scoped. Allowed mutations:
//   1. shop policy body (privacy policy legacy-brand address)
//   2. product descriptionHtml  -> American English spelling only
//   3. page body (FAQ)          -> American English spelling only
//   4. live theme layout/theme.liquid -> add missing head metadata (description/OG)
//      and demote the duplicate homepage logo <h1>
// FORBIDDEN: prices, inventory, checkout, markets, merchant center, ads, branding,
// redesign, media, menus, publications.
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const BASE = "https://ailurova.com";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function gql<T>(q: string, v: Record<string, unknown> = {}) {
  const r = await shopifyAdminFetch<T>(q, v);
  if (r.errors) throw new Error(JSON.stringify(r.errors));
  return r.data as T;
}

/* ------------------------- American English normalizer ------------------------- */

const SPELLING: Array<[RegExp, string]> = [
  [/\bmoulded\b/g, "molded"],
  [/\bMoulded\b/g, "Molded"],
  [/\btravelling\b/g, "traveling"],
  [/\bTravelling\b/g, "Traveling"],
  [/\bcolour\b/g, "color"],
  [/\bColour\b/g, "Color"],
  [/\bcolours\b/g, "colors"],
  [/\bfavourite\b/g, "favorite"],
  [/\bodour\b/g, "odor"],
  [/\bcentre\b/g, "center"],
  [/\bwhilst\b/g, "while"],
  [/\bbehaviour\b/g, "behavior"],
  [/\borganise\b/g, "organize"],
  [/\brealise\b/g, "realize"],
  [/\bapologise\b/g, "apologize"],
];

function americanize(html: string) {
  let out = html;
  const applied: string[] = [];
  for (const [re, rep] of SPELLING) {
    if (re.test(out)) {
      applied.push(`${re.source} -> ${rep}`);
      out = out.replace(re, rep);
    }
    re.lastIndex = 0;
  }
  return { out, applied };
}

// Broken internal links found in the live crawl.
const LINK_FIXES: Array<[RegExp, string, string]> = [
  [/href="\/pages\/returns"/g, 'href="/policies/refund-policy"', "/pages/returns (404) -> /policies/refund-policy"],
  [/href="https:\/\/(www\.)?ailurova\.com\/pages\/returns"/g, 'href="/policies/refund-policy"', "absolute /pages/returns (404) -> /policies/refund-policy"],
];

function fixLinks(html: string) {
  let out = html;
  const applied: string[] = [];
  for (const [re, rep, label] of LINK_FIXES) {
    if (re.test(out)) { applied.push(label); out = out.replace(re, rep); }
    re.lastIndex = 0;
  }
  return { out, applied };
}

/* ------------------------------- theme helpers -------------------------------- */

async function getLiveTheme() {
  const d = await gql<any>(`{
    themes(first: 20) { nodes { id name role updatedAt } }
  }`);
  return d.themes.nodes.find((t: any) => t.role === "MAIN");
}

async function readThemeFiles(themeId: string, filenames: string[]) {
  const d = await gql<any>(
    `query($id:ID!,$f:[String!]){
      theme(id:$id){
        id name role
        files(filenames:$f, first:20){
          nodes{ filename body { ... on OnlineStoreThemeFileBodyText { content } } }
        }
      }
    }`,
    { id: themeId, f: filenames },
  );
  const out: Record<string, string> = {};
  for (const n of d.theme?.files?.nodes ?? []) {
    out[n.filename] = n.body?.content ?? "";
  }
  return out;
}

async function writeThemeFiles(themeId: string, files: Record<string, string>) {
  const d = await gql<any>(
    `mutation($id:ID!,$files:[OnlineStoreThemeFilesUpsertFileInput!]!){
      themeFilesUpsert(themeId:$id, files:$files){
        upsertedThemeFiles { filename }
        userErrors { filename code message }
      }
    }`,
    {
      id: themeId,
      files: Object.entries(files).map(([filename, content]) => ({
        filename,
        body: { type: "TEXT", value: content },
      })),
    },
  );
  return d.themeFilesUpsert;
}

/* ---------------------------------- patches ----------------------------------- */

const META_MARKER = "{%- comment -%} ailurova-final-polish:head-meta {%- endcomment -%}";

const META_BLOCK = `${META_MARKER}
{%- liquid
  assign gp_desc = ''
  if template contains 'product' and product
    assign gp_desc = product.description | strip_html | truncate: 155
  elsif template contains 'page' and page
    assign gp_desc = page.content | strip_html | truncate: 155
  elsif template contains 'index'
    assign gp_desc = 'Ailurova XL enclosed cat litter box with a stainless steel base tray, flip-top lid and removable litter-filter step. Free US shipping and 30-day returns.'
  endif
  if gp_desc == blank
    assign gp_desc = 'Ailurova makes one thing properly: an XL enclosed cat litter box with a stainless steel base tray. Free US shipping and 30-day returns.'
  endif
  assign gp_title = page_title | default: shop.name
-%}
<meta name="description" content="{{ gp_desc | escape }}">
<meta property="og:site_name" content="{{ shop.name | escape }}">
<meta property="og:type" content="{% if template contains 'product' %}product{% else %}website{% endif %}">
<meta property="og:title" content="{{ gp_title | escape }}">
<meta property="og:description" content="{{ gp_desc | escape }}">
<meta property="og:url" content="{{ canonical_url }}">
<meta name="twitter:title" content="{{ gp_title | escape }}">
<meta name="twitter:description" content="{{ gp_desc | escape }}">
`;

function patchThemeLiquid(src: string) {
  const notes: string[] = [];
  let out = src;

  if (out.includes("ailurova-final-polish:head-meta")) {
    notes.push("head-meta block already present (idempotent skip)");
  } else if (out.includes("</head>")) {
    out = out.replace("</head>", `${META_BLOCK}</head>`);
    notes.push("inserted head-meta block before </head>");
  } else {
    notes.push("SKIPPED head-meta: no </head> found");
  }

  // Duplicate H1: the theme prints a visually-hidden shop-name <h1> on top of the
  // real content <h1>. Demote it to a <p> so every page has exactly one H1.
  const dupBefore = out;
  out = out.replace(
    /<h1(\s+class="visually-hidden"[^>]*)>([\s\S]*?)<\/h1>/gi,
    '<p$1>$2</p>',
  );
  if (out !== dupBefore) notes.push("demoted visually-hidden shop-name <h1> to <p>");
  return { out, notes };
}

// Demote a logo wrapped in <h1> so pages keep exactly one content <h1>.
function patchHeaderH1(src: string) {
  const notes: string[] = [];
  let out = src;
  const before = out;
  // Horizon-style: {%- if request.page_type == 'index' -%}<h1 ...>{%- else -%}<div ...>
  out = out.replace(/<h1(\s[^>]*class="[^"]*(?:logo|header__heading)[^"]*"[^>]*)>/gi, "<span$1>");
  if (out !== before) {
    // close the matching </h1> only when we actually opened a span
    out = out.replace(/<\/h1>/gi, "</span>");
    notes.push("demoted logo <h1> to <span>");
  } else {
    notes.push("no logo <h1> found in this file");
  }
  return { out, notes };
}

/* ----------------------------------- handler ---------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const mode: string = body.mode ?? "audit";
  const apply = mode === "apply";

  const report: any = {
    mode,
    ledger: { policy_writes: 0, product_writes: 0, page_writes: 0, theme_files_written: 0 },
    steps: {},
    snapshots: {},
  };

  try {
    /* ---- shop policies (requires read/write_legal_policies scope) ---- */
    let privacy: { id: string; type: string; body: string } | undefined;
    try {
      const shop = await gql<any>(`{ shop { name shopPolicies { id type body } } }`);
      const policies = shop.shop.shopPolicies as Array<{ id: string; type: string; body: string }>;
      privacy = policies.find((p) => p.type === "PRIVACY_POLICY");
      report.steps.policies = policies.map((p) => ({
        type: p.type,
        len: p.body?.length ?? 0,
        has_getpawsy: /getpawsy/i.test(p.body ?? ""),
      }));
    } catch (e) {
      report.steps.policies = { skipped: true, reason: String(e).slice(0, 200) };
    }
    if (privacy) {
      report.snapshots.privacy_policy_before = privacy.body;
      let nb = privacy.body
        .replace(/GetPawsy,\s*De Haasstraat 11,\s*7312 VG Apeldoorn,\s*Netherlands/gi,
          "Skidzo (trading as Ailurova), Apeldoorn, Netherlands")
        .replace(/\bGetPawsy\b/g, "Ailurova")
        .replace(/please call\s{2,}or email us/gi, "please email us");
      const am = americanize(nb);
      nb = am.out;
      report.steps.privacy_changed = nb !== privacy.body;
      report.steps.privacy_spelling = am.applied;
      if (apply && nb !== privacy.body) {
        const r = await gql<any>(
          `mutation($input:ShopPolicyInput!){ shopPolicyUpdate(shopPolicy:$input){ shopPolicy{ id type } userErrors{ field message } } }`,
          { input: { id: privacy.id, body: nb } },
        );
        report.steps.privacy_result = r.shopPolicyUpdate;
        if (!r.shopPolicyUpdate.userErrors?.length) report.ledger.policy_writes++;
      }
    }

    /* ---- product description ---- */
    const prod = await gql<any>(
      `query($id:ID!){ product(id:$id){ id title descriptionHtml seo{title description} } }`,
      { id: PRODUCT_GID },
    );
    const p = prod.product;
    report.snapshots.product_description_before = p.descriptionHtml;
    report.steps.product_seo_before = p.seo;
    const pAm = americanize(p.descriptionHtml ?? "");
    const pLf = fixLinks(pAm.out);
    report.steps.product_spelling = pAm.applied;
    report.steps.product_link_fixes = pLf.applied;
    const productChanged = (pAm.out !== (p.descriptionHtml ?? "")) || pLf.applied.length > 0;
    const needSeoDesc = !p.seo?.description;
    const seoDescription =
      "XL enclosed cat litter box with a stainless steel base tray, flip-top lid and a removable litter-filter step. Free US shipping, 30-day returns.";
    if (apply && (productChanged || needSeoDesc)) {
      const input: any = { id: PRODUCT_GID };
      if (productChanged) input.descriptionHtml = pLf.out;
      if (needSeoDesc) input.seo = { title: p.seo?.title || undefined, description: seoDescription };
      const r = await gql<any>(
        `mutation($input:ProductInput!){ productUpdate(input:$input){ product{ id } userErrors{ field message } } }`,
        { input },
      );
      report.steps.product_result = r.productUpdate;
      if (!r.productUpdate.userErrors?.length) report.ledger.product_writes++;
    }

    /* ---- pages ---- */
    const pages = await gql<any>(`{
      pages(first: 30){ nodes{ id handle title body } }
    }`);
    report.steps.pages = [];
    for (const pg of pages.pages.nodes) {
      const am = americanize(pg.body ?? "");
      const lf = fixLinks(am.out);
      const hasGp = /getpawsy/i.test(pg.body ?? "");
      const entry: any = { handle: pg.handle, spelling: am.applied, link_fixes: lf.applied, has_getpawsy: hasGp };
      let nb = lf.out;
      if (hasGp) nb = nb.replace(/\bGetPawsy\b/g, "Ailurova");
      if (nb !== (pg.body ?? "")) {
        report.snapshots[`page_${pg.handle}_before`] = pg.body;
        if (apply) {
          const r = await gql<any>(
            `mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id, page:$page){ page{ id handle } userErrors{ field message } } }`,
            { id: pg.id, page: { body: nb } },
          );
          entry.result = r.pageUpdate;
          if (!r.pageUpdate.userErrors?.length) report.ledger.page_writes++;
        }
        entry.changed = true;
      }
      report.steps.pages.push(entry);
    }

    /* ---- theme head metadata + logo h1 ---- */
    const live = await getLiveTheme();
    report.steps.live_theme = live ? { id: live.id, name: live.name, role: live.role } : null;
    if (live) {
      const wanted = [
        "layout/theme.liquid",
        "snippets/header.liquid",
        "snippets/logo.liquid",
        "sections/header.liquid",
        "blocks/logo.liquid",
      ];
      const files = await readThemeFiles(live.id, wanted);
      report.steps.theme_files_found = Object.keys(files);

      const toWrite: Record<string, string> = {};

      const layout = files["layout/theme.liquid"];
      if (layout) {
        report.snapshots["layout/theme.liquid_before"] = layout;
        report.steps.layout_has_description = /name=["']description["']/.test(layout);
        const r = patchThemeLiquid(layout);
        report.steps.layout_notes = r.notes;
        if (r.out !== layout) toWrite["layout/theme.liquid"] = r.out;
      }

      for (const f of ["snippets/logo.liquid", "blocks/logo.liquid", "snippets/header.liquid", "sections/header.liquid"]) {
        const src = files[f];
        if (!src) continue;
        const r = patchHeaderH1(src);
        report.steps[`h1_${f}`] = r.notes;
        if (r.out !== src) {
          report.snapshots[`${f}_before`] = src;
          toWrite[f] = r.out;
        }
      }

      report.steps.theme_files_to_write = Object.keys(toWrite);
      if (apply && Object.keys(toWrite).length) {
        const res = await writeThemeFiles(live.id, toWrite);
        report.steps.theme_write_result = res;
        report.ledger.theme_files_written = res?.upsertedThemeFiles?.length ?? 0;
      }
    }

    /* ---- verification crawl ---- */
    if (body.verify !== false) {
      const paths = [
        "/", "/products/ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats",
        "/pages/about", "/pages/faq", "/pages/contact",
        "/policies/privacy-policy", "/policies/refund-policy",
        "/policies/shipping-policy", "/policies/terms-of-service", "/cart",
      ];
      const verify: any[] = [];
      for (const path of paths) {
        try {
          const res = await fetch(`${BASE}${path}`, {
            headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36", "Cache-Control": "no-cache" },
          });
          const html = await res.text();
          verify.push({
            path,
            status: res.status,
            getpawsy: /getpawsy/i.test(html),
            british: /\b(moulded|travelling|colour)\b/i.test(html),
            meta_description: /name="description"/.test(html),
            og_title: /property="og:title"/.test(html),
            h1_count: (html.match(/<h1[\s>]/gi) || []).length,
          });
        } catch (e) {
          verify.push({ path, error: String(e) });
        }
      }
      report.verification = verify;
    }

    report.verdict = apply ? "POLISH_APPLIED" : "AUDIT_ONLY";
    return json(report);
  } catch (e) {
    report.verdict = "ERROR";
    report.error = String(e);
    return json(report, 500);
  }
});