// Canonical Health Check — for every recent Pinterest video queue row,
// fetch the destination URL with a real-browser UA AND a Pinterestbot UA,
// parse the canonical link from the raw HTML response, and report whether
// each product page emits the correct per-route canonical or collapses to
// the homepage canonical bucket. Powers the Canonical Health admin dashboard.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://getpawsy.pet";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PINTEREST_UA = "Pinterest/0.2 (+https://www.pinterest.com/bot.html)";

function parseCanonical(html: string): string | null {
  const m = html.match(/<link[^>]+rel=["']?canonical["']?[^>]*>/i);
  if (!m) return null;
  const h = m[0].match(/href=["']([^"']*)["']/i);
  return h ? (h[1] || null) : null;
}

async function fetchCanonical(url: string, ua: string): Promise<{ status: number; canonical: string | null }> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html" }, redirect: "follow" });
    const text = await r.text();
    return { status: r.status, canonical: parseCanonical(text) };
  } catch (e) {
    console.warn("[canonical-health] fetch failed", url, ua, e);
    return { status: 0, canonical: null };
  }
}

function isHomepageCanonical(c: string | null): boolean {
  if (!c) return false;
  try {
    const u = new URL(c, SITE_URL);
    const p = u.pathname.replace(/\/+$/, "");
    return p === "" || p === "/";
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));

    const { data: rows, error } = await sb
      .from("pinterest_video_queue")
      .select("id, destination_url, product_slug, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const checks = await Promise.all((rows ?? []).map(async (row: any) => {
      const dest = row.destination_url || (row.product_slug ? `${SITE_URL}/products/${row.product_slug}` : null);
      if (!dest) {
        return { queue_id: row.id, product_slug: row.product_slug, product_url: null, browser_canonical: null, pinterestbot_canonical: null, status: "ERROR", reason: "no destination url" };
      }
      const cleanDest = dest.split("?")[0].split("#")[0];
      const [browser, pin] = await Promise.all([
        fetchCanonical(cleanDest, BROWSER_UA),
        fetchCanonical(cleanDest, PINTEREST_UA),
      ]);
      const pinHomepage = isHomepageCanonical(pin.canonical);
      const status = pinHomepage ? "ERROR" : (pin.canonical || browser.canonical ? "OK" : "WARN");
      return {
        queue_id: row.id,
        queue_status: row.status,
        product_slug: row.product_slug,
        product_url: cleanDest,
        browser_status: browser.status,
        browser_canonical: browser.canonical,
        pinterestbot_status: pin.status,
        pinterestbot_canonical: pin.canonical,
        status,
        reason: pinHomepage ? "pinterestbot canonical resolves to homepage" : null,
      };
    }));

    const summary = {
      total: checks.length,
      ok: checks.filter((c) => c.status === "OK").length,
      warn: checks.filter((c) => c.status === "WARN").length,
      error: checks.filter((c) => c.status === "ERROR").length,
    };
    return new Response(JSON.stringify({ ok: true, summary, checks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});