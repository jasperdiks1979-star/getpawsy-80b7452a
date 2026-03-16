#!/usr/bin/env node

/**
 * GetPawsy — Post-Deploy Indexing Accelerator
 * 
 * Uses IndexNow API (Bing, Yandex) for instant notification.
 * Google/Bing sitemap ping endpoints are DEPRECATED (return 404/410) — NOT used.
 * Google discovers sitemap changes via Search Console + robots.txt Sitemap directive.
 */

const SITE = "https://getpawsy.pet";
const INDEXNOW_KEY = "e8f4a2b1c9d7e6f5a3b2c1d0e9f8a7b6";

const INDEXNOW_ENDPOINTS = [
  { name: "IndexNow API", url: "https://api.indexnow.org/indexnow" },
  { name: "Bing IndexNow", url: "https://www.bing.com/indexnow" },
];

// High-priority pages to notify on every deploy
const PRIORITY_URLS = [
  `${SITE}/`,
  `${SITE}/products`,
  `${SITE}/shop`,
  `${SITE}/guides`,
  `${SITE}/blog`,
  `${SITE}/bestsellers`,
  `${SITE}/trending-pet-products`,
  `${SITE}/recent-products`,
  `${SITE}/site-map`,
];

async function pingIndexNow() {
  console.log(`\n🔔 Notifying search engines via IndexNow...\n`);
  console.log(`   Sitemap: ${SITE}/sitemap.xml`);
  console.log(`   URLs to notify: ${PRIORITY_URLS.length}\n`);
  
  let allOk = true;

  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: "getpawsy.pet",
          key: INDEXNOW_KEY,
          keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
          urlList: PRIORITY_URLS,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const ok = res.status >= 200 && res.status < 300;
      console.log(`  ${ok ? "✔" : "✘"} ${endpoint.name}: HTTP ${res.status}`);
      if (!ok) allOk = false;
    } catch (err) {
      console.error(`  ✘ ${endpoint.name}: ${err.message}`);
      allOk = false;
    }
  }

  // Verify sitemap is accessible
  try {
    const sitemapRes = await fetch(`${SITE}/sitemap.xml`, {
      method: "HEAD",
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`\n  ${sitemapRes.ok ? "✔" : "✘"} Sitemap accessible: HTTP ${sitemapRes.status}`);
    console.log(`    Content-Type: ${sitemapRes.headers.get("content-type") || "unknown"}`);
  } catch (err) {
    console.error(`  ✘ Sitemap check failed: ${err.message}`);
    allOk = false;
  }

  console.log(allOk ? "\n✅ Post-deploy indexing notification complete\n" : "\n⚠️  Some notifications failed (non-blocking)\n");
  
  // Don't fail the deploy on notification errors
  process.exit(0);
}

pingIndexNow();
