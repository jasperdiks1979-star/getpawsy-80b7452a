// Lightweight technical SEO audit — fetches HTML and inspects head/schema/canonical/etc.
// Never overrides existing SEO scanners; feeds into the GEIP canonical layer.
import { corsHeaders, jsonResponse, serviceClient, startRun, finishRun } from "../_shared/geip-common.ts";

const AUDIT_URLS = [
  "https://getpawsy.pet/",
  "https://getpawsy.pet/products",
  "https://getpawsy.pet/collections",
  "https://getpawsy.pet/guides",
  "https://getpawsy.pet/blog",
  "https://getpawsy.pet/robots.txt",
];

function match(re: RegExp, html: string): string | null {
  const m = html.match(re); return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  const runId = await startRun(sb, "technical_seo");

  let urls = AUDIT_URLS;
  try { const b = await req.json(); if (Array.isArray(b?.urls)) urls = b.urls.slice(0, 50); } catch {}

  let rows = 0;
  for (const url of urls) {
    try {
      const r = await fetch(url, { redirect: "follow" });
      const html = await r.text();
      const title = match(/<title[^>]*>([^<]*)<\/title>/i, html);
      const desc = match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i, html);
      const canonical = match(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i, html);
      const hasOg = /<meta\s+property=["']og:/i.test(html);
      const hasTw = /<meta\s+name=["']twitter:/i.test(html);
      const hasHreflang = /<link\s+rel=["']alternate["'][^>]+hreflang=/i.test(html);
      const isNoindex = /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html);
      const schemas = Array.from(html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)).map((m) => m[1]);
      const linkCount = (html.match(/<a\s+[^>]*href=["']\/[^"']*["']/gi) ?? []).length;
      await sb.from("geip_technical_seo").insert({
        url,
        has_title: !!title, title_len: title?.length ?? 0,
        has_description: !!desc, description_len: desc?.length ?? 0,
        has_canonical: !!canonical, canonical_target: canonical,
        has_og: hasOg, has_twitter: hasTw, has_hreflang: hasHreflang,
        schema_types: Array.from(new Set(schemas)),
        status_code: r.status,
        is_noindex: isNoindex,
        is_disallowed: false,
        internal_links: linkCount,
        broken_links: 0,
      });
      // Also emit AI-search signals row (schema presence).
      await sb.from("geip_ai_search_signals").insert({
        url,
        has_faq: schemas.includes("FAQPage"),
        has_howto: schemas.includes("HowTo"),
        has_product: schemas.includes("Product"),
        has_review: schemas.includes("Review") || schemas.includes("AggregateRating"),
        has_breadcrumb: schemas.includes("BreadcrumbList"),
        has_article: schemas.includes("Article") || schemas.includes("BlogPosting"),
        entity_coverage_score: Math.min(100, schemas.length * 15),
        ai_overview_ready: schemas.includes("FAQPage") || schemas.includes("HowTo"),
      });
      rows += 1;
    } catch (_e) { /* skip */ }
  }

  await finishRun(sb, runId, { status: rows ? "ok" : "error", rows_ingested: rows });
  return jsonResponse({ ok: true, rows });
});