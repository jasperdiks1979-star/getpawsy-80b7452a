#!/usr/bin/env node
/**
 * Post-deploy smoke check: verifies live sitemap XML endpoints
 * return valid XML (not HTML from SPA fallback).
 *
 * Usage:  node scripts/smoke-check-live-sitemaps.mjs
 * Exit 0 = all pass, Exit 1 = any fail.
 */

const BASE = "https://getpawsy.pet";

const CHECKS = [
  {
    url: `${BASE}/sitemap.xml`,
    mustContain: "<sitemapindex",
    label: "Sitemap Index",
  },
  {
    url: `${BASE}/sitemap-products-1.xml`,
    mustContain: "<urlset",
    label: "Product Sitemap 1",
  },
  {
    url: `${BASE}/sitemap-static.xml`,
    mustContain: "<urlset",
    label: "Static Sitemap",
  },
  {
    url: `${BASE}/robots.txt`,
    mustContain: "Sitemap:",
    label: "robots.txt",
  },
];

async function check({ url, mustContain, label }) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GetPawsy-SmokeCheck/1.0" },
      redirect: "follow",
    });

    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();

    const errors = [];

    if (res.status !== 200) {
      errors.push(`HTTP ${res.status} (expected 200)`);
    }

    if (!body.includes(mustContain)) {
      errors.push(`Missing "${mustContain}" — likely SPA fallback or empty file`);
    }

    // Detect SPA fallback: if we get HTML instead of XML
    if (
      url.endsWith(".xml") &&
      (body.includes("<!DOCTYPE html") || body.includes("<div id=\"root\""))
    ) {
      errors.push("Response is HTML (SPA fallback), not XML");
    }

    // Check content-type for XML files
    if (url.endsWith(".xml") && !contentType.includes("xml")) {
      errors.push(`Content-Type is "${contentType}" (expected text/xml)`);
    }

    if (errors.length === 0) {
      console.log(`  ✅ PASS  ${label}`);
      console.log(`          ${url}`);
      return true;
    } else {
      console.log(`  ❌ FAIL  ${label}`);
      console.log(`          ${url}`);
      for (const e of errors) console.log(`          → ${e}`);
      return false;
    }
  } catch (err) {
    console.log(`  ❌ FAIL  ${label}`);
    console.log(`          ${url}`);
    console.log(`          → Network error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  Live Sitemap Smoke Check");
  console.log("══════════════════════════════════════════\n");

  const results = await Promise.all(CHECKS.map(check));
  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;

  console.log(`\n  Results: ${passed}/${results.length} passed`);

  if (failed > 0) {
    console.log("  Status: ❌ FAILURES DETECTED\n");
    console.log("══════════════════════════════════════════\n");
    process.exit(1);
  }

  console.log("  Status: ✅ ALL CLEAR\n");
  console.log("══════════════════════════════════════════\n");
}

main();
