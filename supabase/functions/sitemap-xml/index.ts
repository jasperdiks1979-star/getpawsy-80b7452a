// Sitemap generator — all URLs use https://getpawsy.pet only
// No external domains, no image tags, no plain text
// Fallback to lovable.app only if deployed there, but prefer custom domain

const BASE_URL = typeof Deno.env.get("SITE_URL") === "string"
  ? Deno.env.get("SITE_URL")!
  : "https://getpawsy.pet";

const HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
};

async function dbQuery(table: string, params: string): Promise<unknown[]> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`DB error ${table}: ${res.status}`);
    return [];
  }
  return await res.json();
}

function xmlWrap(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${inner}\n</urlset>`;
}

function urlTag(
  loc: string,
  lastmod: string,
  changefreq: string,
  priority: string,
): string {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

function sitemapIndex(today: string): string {
  const subs = [
    "static",
    "products",
    "categories",
    "bestsellers",
    "collections",
    "blog",
    "guides",
  ];
  const entries = subs
    .map(
      (s) =>
        `  <sitemap>\n    <loc>${BASE_URL}/sitemap-${s}.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`;
}

function staticSitemap(today: string): string {
  const y = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  // Only include money pages and essential indexable pages
  // Excluded: /about, /contact, /faq, /shipping, /returns, /privacy, /terms (low-value for crawl budget)
  const pages: [string, string, string, string][] = [
    ["/", today, "daily", "1.0"],
    ["/products", today, "daily", "0.95"],
    ["/bestsellers", today, "daily", "0.90"],
    ["/cat-trees-condos", today, "daily", "0.90"],
    ["/blog", today, "daily", "0.80"],
    ["/guides", today, "daily", "0.85"],
  ];
  return xmlWrap(
    pages
      .map(([p, lm, cf, pr]) => urlTag(`${BASE_URL}${p}`, lm, cf, pr))
      .join("\n"),
  );
}

async function productsSitemap(today: string): Promise<string> {
  const rows = (await dbQuery(
    "products",
    "select=id,slug,updated_at&is_active=eq.true&is_duplicate=eq.false&order=updated_at.desc",
  )) as Array<{ id: string; slug: string | null; updated_at: string }>;

  const urls = rows.map((p, i) => {
    const lm = p.updated_at?.split("T")[0] || today;
    const path = p.slug || p.id;
    const pri = i < 100 ? "0.95" : i < 500 ? "0.85" : "0.75";
    return urlTag(`${BASE_URL}/product/${path}`, lm, "daily", pri);
  });

  console.log(`Products sitemap: ${rows.length} URLs`);
  return xmlWrap(urls.join("\n"));
}

async function categoriesSitemap(today: string): Promise<string> {
  // Use clean category slug URLs instead of parameter-based URLs
  // Only include categories that have a clean URL mapping
  const CLEAN_CATEGORY_SLUGS: Record<string, string> = {
    'cat-trees-and-condos': 'cat-trees-condos',
    'dog-beds': 'dog-beds',
    'cat-litter-boxes': 'cat-litter-boxes',
    'dog-toys': 'dog-toys',
    'cat-toys': 'cat-toys',
    'dog-collars-leashes': 'dog-collars-leashes',
    'dog-carriers': 'dog-carriers',
    'cat-carriers': 'cat-carriers',
    'dog-grooming': 'dog-grooming',
    'guinea-pig-cages': 'guinea-pig-cages',
  };

  const cats = (await dbQuery("categories", "select=slug,name")) as Array<{
    slug: string;
    name: string;
  }>;
  const toSlug = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/&/g, "and")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const c of cats) {
    const sl = c.slug || toSlug(c.name);
    if (seen.has(sl)) continue;
    seen.add(sl);
    // Only include categories with clean URL mappings — skip parameter-based URLs
    const cleanSlug = CLEAN_CATEGORY_SLUGS[sl];
    if (cleanSlug) {
      urls.push(
        urlTag(`${BASE_URL}/${cleanSlug}`, today, "weekly", "0.85"),
      );
    }
  }
  console.log(`Categories sitemap: ${urls.length} clean URLs (${seen.size} total categories)`);
  return xmlWrap(urls.join("\n"));
}

async function bestsellersSitemap(today: string): Promise<string> {
  const rows = (await dbQuery(
    "bestsellers",
    "select=slug,updated_at&is_active=eq.true",
  )) as Array<{
    slug: string;
    updated_at: string;
  }>;
  const urls = rows.map((b) =>
    urlTag(
      `${BASE_URL}/bestseller/${b.slug}`,
      b.updated_at?.split("T")[0] || today,
      "weekly",
      "0.9",
    ),
  );
  console.log(`Bestsellers sitemap: ${rows.length} URLs`);
  return xmlWrap(urls.join("\n"));
}

async function collectionsSitemap(today: string): Promise<string> {
  const rows = (await dbQuery(
    "seo_collections",
    "select=slug,updated_at&is_active=eq.true",
  )) as Array<{
    slug: string;
    updated_at: string;
  }>;
  const urls = rows.map((c) =>
    urlTag(
      `${BASE_URL}/collections/${c.slug}`,
      c.updated_at?.split("T")[0] || today,
      "weekly",
      "0.85",
    ),
  );
  console.log(`Collections sitemap: ${rows.length} URLs`);
  return xmlWrap(urls.join("\n"));
}

async function blogSitemap(today: string): Promise<string> {
  const rows = (await dbQuery(
    "blog_posts",
    "select=slug,published_at&is_published=eq.true&order=published_at.desc",
  )) as Array<{ slug: string; published_at: string }>;
  const urls = rows.map((p) =>
    urlTag(
      `${BASE_URL}/blog/${p.slug}`,
      p.published_at?.split("T")[0] || today,
      "monthly",
      "0.6",
    ),
  );
  console.log(`Blog sitemap: ${rows.length} URLs`);
  return xmlWrap(urls.join("\n"));
}

const FALLBACK_GUIDES = [
  { slug: "best-cat-litter-box-2026", updatedAt: "2026-02-12", priority: "0.95" },
  { slug: "how-many-litter-boxes-per-cat", updatedAt: "2026-02-12", priority: "0.8" },
  { slug: "best-cat-litter-box-furniture-enclosures-2026", updatedAt: "2026-02-12", priority: "0.85" },
  { slug: "best-litter-boxes-multi-cat", updatedAt: "2026-02-12", priority: "0.8" },
  { slug: "best-extra-large-litter-boxes", updatedAt: "2026-02-12", priority: "0.8" },
  { slug: "best-cat-trees-small-apartments", updatedAt: "2026-02-12", priority: "0.8" },
  { slug: "best-litter-box-small-apartments", updatedAt: "2026-02-12", priority: "0.8" },
  { slug: "best-litter-box-odor-bathroom", updatedAt: "2026-02-12", priority: "0.8" },
  { slug: "best-low-tracking-litter-box", updatedAt: "2026-02-12", priority: "0.8" },
  { slug: "best-litter-box-kittens", updatedAt: "2026-02-12", priority: "0.8" },
  { slug: "best-litter-box-senior-cats", updatedAt: "2026-02-12", priority: "0.8" },
  { slug: "best-litter-box-under-100", updatedAt: "2026-02-12", priority: "0.75" },
  { slug: "best-litter-box-studio-apartment", updatedAt: "2026-02-12", priority: "0.75" },
  { slug: "best-high-sided-litter-box", updatedAt: "2026-02-12", priority: "0.8" },
  { slug: "how-to-choose-guinea-pig-cage", updatedAt: "2026-02-12", priority: "0.7" },
  { slug: "guinea-pig-cage-vs-playpen", updatedAt: "2026-02-12", priority: "0.7" },
  { slug: "cat-condo-vs-cat-tower", updatedAt: "2026-02-12", priority: "0.7" },
  { slug: "choosing-safe-cat-tree-indoor", updatedAt: "2026-02-12", priority: "0.7" },
  { slug: "outdoor-dog-games-enrichment", updatedAt: "2026-02-12", priority: "0.7" },
];

async function getGuides(): Promise<typeof FALLBACK_GUIDES> {
  try {
    const r = await fetch(`${BASE_URL}/data/guides/index.json`);
    if (r.ok) {
      const list = (await r.json()) as Array<{
        slug: string;
        updatedAt?: string;
      }>;
      return list.map((g) => ({
        slug: g.slug,
        updatedAt: g.updatedAt || new Date().toISOString().split("T")[0],
        priority: g.slug.startsWith("best-") ? "0.8" : "0.7",
      }));
    }
  } catch {
    /* use fallback */
  }
  return FALLBACK_GUIDES;
}

async function guidesSitemap(today: string): Promise<string> {
  const guides = await getGuides();
  const urls = [
    urlTag(`${BASE_URL}/guides`, today, "weekly", "0.8"),
    ...guides.map((g) =>
      urlTag(
        `${BASE_URL}/guides/${g.slug}`,
        g.updatedAt || today,
        "monthly",
        g.priority,
      ),
    ),
  ];
  console.log(`Guides sitemap: ${guides.length} URLs`);
  return xmlWrap(urls.join("\n"));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: HEADERS });

  try {
    const type = new URL(req.url).searchParams.get("type") || "index";
    const today = new Date().toISOString().split("T")[0];
    let xml: string;

    switch (type) {
      case "index":
        xml = sitemapIndex(today);
        break;
      case "static":
        xml = staticSitemap(today);
        break;
      case "products":
        xml = await productsSitemap(today);
        break;
      case "categories":
        xml = await categoriesSitemap(today);
        break;
      case "bestsellers":
        xml = await bestsellersSitemap(today);
        break;
      case "collections":
        xml = await collectionsSitemap(today);
        break;
      case "blog":
        xml = await blogSitemap(today);
        break;
      case "guides":
        xml = await guidesSitemap(today);
        break;
      default:
        xml = sitemapIndex(today);
    }

    return new Response(xml, { headers: HEADERS, status: 200 });
  } catch (e) {
    console.error("Sitemap error:", e);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>`,
      { headers: HEADERS, status: 200 },
    );
  }
});
