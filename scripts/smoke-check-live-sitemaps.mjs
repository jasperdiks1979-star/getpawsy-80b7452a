#!/usr/bin/env node
/**
 * Post-deploy smoke check: verifies live sitemap XML endpoints
 * return valid XML (not HTML from SPA fallback, not plaintext).
 *
 * Usage:  node scripts/smoke-check-live-sitemaps.mjs
 * Exit 0 = all pass, Exit 1 = any fail.
 */

const CANONICAL = process.env.CANONICAL_HOST || "https://getpawsy.pet";

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "GetPawsy-SmokeCheck/1.0" },
    redirect: "follow",
  });
  const text = await res.text();
  return { status: res.status, ct: res.headers.get("content-type") || "", text };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  Live Sitemap Smoke Check");
  console.log("══════════════════════════════════════════\n");

  const a = await fetchText(`${CANONICAL}/sitemap.xml`);
  assert(a.status === 200, `sitemap.xml status ${a.status}`);
  assert(a.text.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`), "sitemap.xml missing XML header");
  assert(a.text.includes("<sitemapindex"), "sitemap.xml missing <sitemapindex>");
  assert(a.text.includes("<sitemap>"), "sitemap.xml has 0 <sitemap> entries");
  assert(!a.text.toLowerCase().includes("<!doctype html") && !a.text.toLowerCase().includes("<html"), "sitemap.xml HTML/SPA fallback detected");
  // Plaintext detection: must have XML tags if it has URLs
  assert(!a.text.includes("http") || a.text.includes("<sitemap>"), "sitemap.xml plaintext detected (URLs without XML tags)");
  console.log("  ✅ PASS  sitemap.xml");
  console.log(`          content-type: ${a.ct}`);

  const b = await fetchText(`${CANONICAL}/sitemap-products-1.xml`);
  assert(b.status === 200, `sitemap-products-1.xml status ${b.status}`);
  assert(b.text.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`), "products-1 missing XML header");
  assert(b.text.includes("<urlset"), "products-1 missing <urlset>");
  assert(b.text.includes("<url>"), "products-1 has 0 <url> entries");
  assert(!b.text.toLowerCase().includes("<!doctype html") && !b.text.toLowerCase().includes("<html"), "products-1 HTML/SPA fallback detected");
  assert(!b.text.includes("http") || b.text.includes("<url>"), "products-1 plaintext detected (URLs without XML tags)");
  console.log("  ✅ PASS  sitemap-products-1.xml");
  console.log(`          content-type: ${b.ct}`);

  const c = await fetchText(`${CANONICAL}/robots.txt`);
  assert(c.status === 200, `robots.txt status ${c.status}`);
  assert(c.text.includes("Sitemap:"), "robots.txt missing Sitemap: directive");
  console.log("  ✅ PASS  robots.txt");

  console.log("\n  ✅ LIVE sitemap smoke check ALL CLEAR\n");
  console.log("══════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error(`\n  ❌ LIVE sitemap smoke check FAILED: ${e.message}\n`);
  process.exit(1);
});
