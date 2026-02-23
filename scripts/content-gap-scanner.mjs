/**
 * content-gap-scanner.mjs
 * Identifies missing semantic coverage vs competitors using GSC + internal data.
 * No scraping — uses internal data only. Output only.
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_DIR = path.join(process.cwd(), "reports");

const SUPABASE_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }

async function fetchFromSupabase(table, params) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function countWords(text) {
  if (!text) return 0;
  return text.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
}

function hasFaqSection(content) {
  if (!content) return false;
  const lower = content.toLowerCase();
  return lower.includes("faq") || lower.includes("frequently asked") || lower.includes("common questions");
}

function hasComparisonTable(content) {
  if (!content) return false;
  const lower = content.toLowerCase();
  return lower.includes("<table") || lower.includes("comparison") || lower.includes("vs ");
}

function hasSchema(content) {
  if (!content) return false;
  return content.includes("application/ld+json") || content.includes("itemtype");
}

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const gsc = readJson(path.join(DATA_DIR, "gsc-metrics.json"));
  if (!gsc || !Array.isArray(gsc.rows)) {
    console.warn("[content-gap] No GSC data. Skipping.");
    return;
  }

  // Get top revenue URLs (sorted by clicks * impressions as proxy)
  const sorted = [...gsc.rows]
    .map((r) => ({ ...r, score: (r.clicks || 0) * Math.log1p(r.impressions || 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  // Fetch blog posts + collection descriptions for content analysis
  const blogPosts = await fetchFromSupabase("blog_posts", "select=slug,content,title&is_published=eq.true&limit=500");
  const collections = await fetchFromSupabase("seo_collections", "select=slug,long_description,seo_title,faq&is_active=eq.true&limit=500");

  const blogBySlug = {};
  if (blogPosts) for (const b of blogPosts) blogBySlug[`/blog/${b.slug}`] = b;
  const collBySlug = {};
  if (collections) for (const c of collections) collBySlug[`/collections/${c.slug}`] = c;

  // Existing competitor gap data from DB
  const competitorGaps = await fetchFromSupabase("competitor_gaps", "select=keyword,our_position,competitor_position,content_gap_score,schema_gap&order=content_gap_score.desc&limit=100");
  const competitorContent = await fetchFromSupabase("competitor_content_intelligence", "select=keyword,semantic_gap_score,snippet_format_presence,content_depth_delta,actionable_improvements&order=semantic_gap_score.desc&limit=100");

  const gaps = [];
  let criticalGaps = 0;
  let recommendedExpansions = 0;

  for (const row of sorted) {
    let urlPath;
    try { urlPath = new URL(row.page).pathname; } catch { continue; }

    // Find matching content
    const blog = blogBySlug[urlPath];
    const coll = collBySlug[urlPath];
    const content = blog?.content || coll?.long_description || "";
    const wordCount = countWords(content);
    const hasFaq = hasFaqSection(content) || (coll?.faq && Object.keys(coll.faq).length > 0);
    const hasComparison = hasComparisonTable(content);
    const hasSchemaMarkup = hasSchema(content);

    // Identify gaps
    const missingElements = [];
    if (wordCount < 300 && (blog || coll)) { missingElements.push("Low word count (< 300 words)"); criticalGaps++; }
    if (wordCount < 800 && urlPath.startsWith("/blog/")) { missingElements.push("Blog under 800 words"); }
    if (!hasFaq) { missingElements.push("Missing FAQ section"); recommendedExpansions++; }
    if (!hasComparison && row.impressions > 200) { missingElements.push("Missing comparison content"); recommendedExpansions++; }
    if (!hasSchemaMarkup) { missingElements.push("No structured data / schema"); }

    // Cross-reference with competitor gap DB data
    const matchingGap = (competitorGaps || []).find((g) => urlPath.includes(g.keyword?.replace(/\s+/g, "-")));
    if (matchingGap && matchingGap.content_gap_score > 50) {
      missingElements.push(`Competitor content gap score: ${matchingGap.content_gap_score}`);
      criticalGaps++;
    }

    const matchingContent = (competitorContent || []).find((c) => urlPath.includes(c.keyword?.replace(/\s+/g, "-")));
    if (matchingContent) {
      if (matchingContent.semantic_gap_score > 40) missingElements.push(`Semantic gap: ${matchingContent.semantic_gap_score}`);
      if (matchingContent.content_depth_delta > 500) missingElements.push(`Content depth deficit: ${matchingContent.content_depth_delta} words`);
    }

    if (missingElements.length > 0) {
      gaps.push({
        url: urlPath,
        position: Math.round((row.position || 0) * 10) / 10,
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        word_count: wordCount,
        has_faq: hasFaq,
        has_comparison: hasComparison,
        has_schema: hasSchemaMarkup,
        missing_elements: missingElements,
        priority: missingElements.length >= 3 ? "critical" : missingElements.length >= 2 ? "high" : "medium",
      });
    }
  }

  gaps.sort((a, b) => b.missing_elements.length - a.missing_elements.length);

  const report = {
    generated_at: new Date().toISOString(),
    pages_analyzed: sorted.length,
    critical_gaps: criticalGaps,
    recommended_expansions: recommendedExpansions,
    gaps,
  };

  fs.writeFileSync(path.join(REPORTS_DIR, "content-gaps.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n══════════════════════════════════════════");
  console.log("  Content Gap Report");
  console.log("══════════════════════════════════════════");
  console.log(`  Pages analyzed:          ${sorted.length}`);
  console.log(`  Critical gaps found:     ${criticalGaps}`);
  console.log(`  Recommended expansions:  ${recommendedExpansions}`);
  console.log("══════════════════════════════════════════\n");
}

main().catch((err) => {
  console.warn(`[content-gap] Failed (non-blocking): ${err.message}`);
});
