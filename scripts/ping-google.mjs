/**
 * ping-google.mjs — Notify Google of updated sitemap after successful build.
 * Fails softly: logs warning but never blocks deployment.
 */

const SITEMAP_URL = "https://getpawsy.pet/sitemap.xml";
const PING_URL = `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;

async function main() {
  // Only ping in production-like environments
  const env = process.env.NODE_ENV || "";
  if (env === "development" || env === "test") {
    console.log("[google-ping] Skipped — non-production environment.");
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(PING_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      console.log(`[google-ping] ✅ Google ping successful (HTTP ${res.status})`);
    } else {
      console.warn(`[google-ping] ⚠️ Google ping returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[google-ping] ⚠️ Google ping failed (non-blocking): ${err.message}`);
  }
}

main();
