#!/usr/bin/env node

/**
 * GetPawsy — Sitemap Ping Script
 * Pings Google and Bing after deploy to accelerate indexing.
 */

const sitemap = "https://getpawsy.pet/sitemap.xml";

const engines = [
  { name: "Google", url: `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemap)}` },
  { name: "Bing",   url: `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemap)}` },
];

async function pingSearchEngines() {
  console.log(`\n🔔 Pinging search engines with: ${sitemap}\n`);
  let allOk = true;

  for (const engine of engines) {
    try {
      const res = await fetch(engine.url, { signal: AbortSignal.timeout(10_000) });
      const ok = res.status >= 200 && res.status < 400;
      console.log(`  ${ok ? "✔" : "✘"} ${engine.name}: HTTP ${res.status}`);
      if (!ok) allOk = false;
    } catch (err) {
      console.error(`  ✘ ${engine.name}: ${err.message}`);
      allOk = false;
    }
  }

  console.log(allOk ? "\n✅ All pings succeeded\n" : "\n⚠️  Some pings failed\n");
  process.exit(allOk ? 0 : 1);
}

pingSearchEngines();
