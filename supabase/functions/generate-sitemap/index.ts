const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=300, s-maxage=3600",
};

const BASE_URL = "https://getpawsy.pet";
const SITEMAP_FN_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/generate-sitemap";

interface GuideEntry { slug: string; updatedAt: string; priority: string }

const FALLBACK_GUIDES: GuideEntry[] = [
  { slug: "best-cat-litter-box-2026", updatedAt: "2026-02-10", priority: "0.9" },
  { slug: "how-many-litter-boxes-per-cat", updatedAt: "2026-02-10", priority: "0.8" },
  { slug: "best-cat-litter-box-furniture-enclosures-2026", updatedAt: "2026-02-11", priority: "0.8" },
  { slug: "best-litter-boxes-multi-cat", updatedAt: "2026-02-12", priority: "0.75" },
  { slug: "best-extra-large-litter-boxes", updatedAt: "2026-02-13", priority: "0.75" },
  { slug: "best-cat-trees-small-apartments", updatedAt: "2026-02-14", priority: "0.75" },
  { slug: "how-to-choose-guinea-pig-cage", updatedAt: "2026-02-10", priority: "0.7" },
  { slug: "guinea-pig-cage-vs-playpen", updatedAt: "2026-02-10", priority: "0.7" },
  { slug: "cat-condo-vs-cat-tower", updatedAt: "2026-02-10", priority: "0.7" },
  { slug: "choosing-safe-cat-tree-indoor", updatedAt: "2026-02-10", priority: "0.7" },
  { slug: "outdoor-dog-games-enrichment", updatedAt: "2026-02-10", priority: "0.7" },
];

let _guides: GuideEntry[] | null = null;
async function getGuides(): Promise<GuideEntry[]> {
  if (_guides) return _guides;
  try {
    const r = await fetch("https://getpawsy.pet/data/guides/index.json");
    if (r.ok) {
      const list = await r.json();
      _guides = (list as Array<{ slug: string; updatedAt?: string }>).map(g => ({
        slug: g.slug,
        updatedAt: g.updatedAt || new Date().toISOString().split("T")[0],
        priority: g.slug.startsWith("best-cat-litter-box-2026") ? "0.9" : g.slug.startsWith("best-") ? "0.8" : "0.7",
      }));
      return _guides;
    }
  } catch { /* fallback */ }
  _guides = FALLBACK_GUIDES;
  return _guides;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Use Supabase REST API directly instead of JS client (avoids esm.sh boot crash)
async function sbQuery(table: string, params: string): Promise<unknown[]> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${url}/rest/v1/${table}?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) { console.error(`[sitemap] REST error ${table}:`, r.status); return []; }
  return await r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const type = new URL(req.url).searchParams.get("type") || "index";
    const today = new Date().toISOString().split("T")[0];
    let xml: string;

    switch (type) {
      case "index": xml = sitemapIndex(today); break;
      case "guides": xml = await guidesSitemap(today); break;
      case "static": xml = staticSitemap(today); break;
      case "products": xml = await productsSitemap(today); break;
      case "categories": xml = await categoriesSitemap(today); break;
      case "bestsellers": xml = await bestsellersSitemap(today); break;
      case "collections": xml = await collectionsSitemap(today); break;
      case "blog": xml = await blogSitemap(today); break;
      default: xml = sitemapIndex(today);
    }
    return new Response(xml, { headers: corsHeaders, status: 200 });
  } catch (e) {
    console.error("[sitemap] error:", e);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>`, { headers: corsHeaders, status: 200 });
  }
});

function sitemapIndex(today: string): string {
  const types = ["static", "products", "categories", "bestsellers", "collections", "blog", "guides"];
  const entries = types.map(t => `  <sitemap>\n    <loc>${SITEMAP_FN_URL}?type=${t}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`;
}

async function guidesSitemap(today: string): Promise<string> {
  const guides = await getGuides();
  let urls = `  <url>\n    <loc>${BASE_URL}/guides</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
  for (const g of guides) {
    urls += `\n  <url>\n    <loc>${BASE_URL}/guides/${g.slug}</loc>\n    <lastmod>${g.updatedAt || today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${g.priority}</priority>\n  </url>`;
  }
  console.log(`GUIDES SITEMAP SERVED: ${guides.length} URLs`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

function staticSitemap(today: string): string {
  const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const pages: [string, string, string, string][] = [
    ["/", today, "daily", "1.0"], ["/products", today, "daily", "0.95"], ["/bestsellers", today, "daily", "0.95"],
    ["/blog", today, "daily", "0.85"], ["/about", y, "weekly", "0.7"], ["/contact", y, "weekly", "0.7"],
    ["/faq", y, "weekly", "0.65"], ["/shipping", y, "weekly", "0.5"], ["/returns", y, "monthly", "0.4"],
    ["/privacy", y, "yearly", "0.3"], ["/terms", y, "yearly", "0.3"],
  ];
  const urls = pages.map(([p, lm, cf, pr]) => `  <url>\n    <loc>${BASE_URL}${p}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>${cf}</changefreq>\n    <priority>${pr}</priority>\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

async function productsSitemap(today: string): Promise<string> {
  const products = await sbQuery("products", "select=id,name,slug,updated_at,category,image_url&is_active=eq.true&is_duplicate=eq.false&order=updated_at.desc") as Array<{id:string;name:string;slug:string|null;updated_at:string;image_url:string|null}>;
  const now = Date.now();
  let urls = "";
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const lm = p.updated_at?.split("T")[0] || today;
    const path = p.slug || p.id;
    const days = Math.floor((now - new Date(p.updated_at || today).getTime()) / 86400000);
    const pri = Math.min(0.95, (i < 100 ? 0.9 : i < 500 ? 0.8 : 0.7) + (days <= 1 ? 0.05 : days <= 7 ? 0.02 : 0)).toFixed(2);
    urls += `\n  <url>\n    <loc>${BASE_URL}/product/${path}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>${days <= 7 ? "daily" : "weekly"}</changefreq>\n    <priority>${pri}</priority>${p.image_url ? `\n    <image:image>\n      <image:loc>${esc(p.image_url)}</image:loc>\n      <image:title>${esc(p.name || "")}</image:title>\n    </image:image>` : ""}\n  </url>`;
  }
  console.log(`[sitemap] Products: ${products.length}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}\n</urlset>`;
}

async function categoriesSitemap(today: string): Promise<string> {
  const cats = await sbQuery("categories", "select=slug,name,created_at") as Array<{slug:string;name:string}>;
  const prods = await sbQuery("products", "select=category&is_active=eq.true&is_duplicate=eq.false") as Array<{category:string|null}>;
  const toSlug = (s: string) => s.toLowerCase().trim().replace(/&/g, "and").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  const seen = new Set<string>();
  let urls = "";
  for (const c of cats) { const sl = c.slug || toSlug(c.name); if (seen.has(sl)) continue; seen.add(sl); urls += `\n  <url>\n    <loc>${BASE_URL}/products?category=${sl}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`; }
  for (const p of prods) { if (!p.category) continue; const sl = toSlug(p.category); if (seen.has(sl)) continue; seen.add(sl); urls += `\n  <url>\n    <loc>${BASE_URL}/products?category=${sl}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`; }
  console.log(`[sitemap] Categories: ${seen.size}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}\n</urlset>`;
}

async function bestsellersSitemap(today: string): Promise<string> {
  const data = await sbQuery("bestsellers", "select=slug,updated_at&is_active=eq.true") as Array<{slug:string;updated_at:string}>;
  let urls = "";
  for (const b of data) { urls += `\n  <url>\n    <loc>${BASE_URL}/bestseller/${b.slug}</loc>\n    <lastmod>${b.updated_at?.split("T")[0] || today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`; }
  console.log(`[sitemap] Bestsellers: ${data.length}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}\n</urlset>`;
}

async function collectionsSitemap(today: string): Promise<string> {
  const data = await sbQuery("seo_collections", "select=slug,name,updated_at&is_active=eq.true") as Array<{slug:string;updated_at:string}>;
  let urls = "";
  for (const c of data) { urls += `\n  <url>\n    <loc>${BASE_URL}/collections/${c.slug}</loc>\n    <lastmod>${c.updated_at?.split("T")[0] || today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.85</priority>\n  </url>`; }
  console.log(`[sitemap] Collections: ${data.length}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}\n</urlset>`;
}

async function blogSitemap(today: string): Promise<string> {
  const data = await sbQuery("blog_posts", "select=slug,title,published_at,featured_image&is_published=eq.true&order=published_at.desc") as Array<{slug:string;title:string;published_at:string;featured_image:string|null}>;
  let urls = "";
  for (const p of data) { const lm = p.published_at?.split("T")[0] || today; urls += `\n  <url>\n    <loc>${BASE_URL}/blog/${p.slug}</loc>\n    <lastmod>${lm}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>${p.featured_image ? `\n    <image:image>\n      <image:loc>${esc(p.featured_image)}</image:loc>\n      <image:title>${esc(p.title || "")}</image:title>\n    </image:image>` : ""}\n  </url>`; }
  console.log(`[sitemap] Blog: ${data.length}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}\n</urlset>`;
}
