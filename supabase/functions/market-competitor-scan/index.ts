import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * market-competitor-scan
 * Scrapes US-pet competitor listing pages via Firecrawl and upserts rows into
 * market_competitor_insights. If FIRECRAWL_API_KEY is missing the function
 * reports needs_firecrawl=true so the admin UI can prompt the user to connect.
 */

const TARGETS: Array<{ competitor: string; url: string }> = [
  { competitor: "amazon_us",    url: "https://www.amazon.com/Best-Sellers-Pet-Supplies/zgbs/pet-supplies" },
  { competitor: "chewy",        url: "https://www.chewy.com/b/cat-318" },
  { competitor: "petco",        url: "https://www.petco.com/shop/en/petcostore/category/cat" },
  { competitor: "petsmart",     url: "https://www.petsmart.com/cat/" },
  { competitor: "walmart_pets", url: "https://www.walmart.com/cp/pets/5440" },
];

type ExtractedProduct = {
  title: string;
  handle: string;
  price?: number;
  rating?: number;
  review_count?: number;
  image_url?: string;
};

function extractProducts(markdown: string, competitor: string): ExtractedProduct[] {
  const out: ExtractedProduct[] = [];
  // Pull markdown links + nearby price/rating tokens
  const linkRe = /\[([^\]]{8,140})\]\((https?:\/\/[^)]+)\)/g;
  const priceRe = /\$\s?(\d{1,4}(?:\.\d{2})?)/;
  const ratingRe = /([0-5](?:\.\d)?)\s*(?:out of 5|stars?|\u2605)/i;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(markdown)) !== null && out.length < 30) {
    const title = m[1].trim().replace(/\s+/g, " ");
    const url = m[2];
    // Restrict to product-looking URLs on the right domain
    if (!url.includes(competitor.split("_")[0])) continue;
    if (!/\/(dp|product|p|gp)\//i.test(url) && !url.includes("/products/")) continue;
    const handle = url.split("?")[0].split("/").slice(-2).join("/");
    if (seen.has(handle)) continue;
    seen.add(handle);
    const window = markdown.slice(m.index, Math.min(markdown.length, m.index + 400));
    const pm = window.match(priceRe);
    const rm = window.match(ratingRe);
    out.push({
      title,
      handle,
      price: pm ? Number(pm[1]) : undefined,
      rating: rm ? Number(rm[1]) : undefined,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  const FIRECRAWL = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL) {
    return new Response(
      JSON.stringify({
        ok: false, traceId, needs_firecrawl: true,
        message: "Connect Firecrawl to enable competitor scraping (Amazon/Chewy/Petco).",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let total = 0;
    const perCompetitor: Record<string, number> = {};
    const failures: Array<{ competitor: string; error: string }> = [];

    for (const t of TARGETS) {
      try {
        const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            url: t.url,
            formats: ["markdown"],
            onlyMainContent: true,
            location: { country: "US", languages: ["en"] },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(`firecrawl ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
        const markdown: string = json.markdown ?? json.data?.markdown ?? "";
        const products = extractProducts(markdown, t.competitor);
        if (products.length === 0) continue;

        const rows = products.map((p) => ({
          competitor: t.competitor,
          product_handle: p.handle,
          title: p.title,
          price: p.price ?? null,
          rating: p.rating ?? null,
          review_count: p.review_count ?? null,
          image_url: p.image_url ?? null,
          insights: { source_url: t.url, scraped_at: new Date().toISOString() },
          captured_at: new Date().toISOString(),
        }));
        const { error } = await sb.from("market_competitor_insights")
          .upsert(rows, { onConflict: "competitor,product_handle" });
        if (error) throw error;
        perCompetitor[t.competitor] = rows.length;
        total += rows.length;
      } catch (e) {
        failures.push({ competitor: t.competitor, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await sb.from("market_signal_logs").insert({
      trace_id: traceId,
      level: failures.length ? "warn" : "info",
      message: `Competitor scan: ${total} rows across ${Object.keys(perCompetitor).length} competitors`,
      payload: { perCompetitor, failures },
    });

    return new Response(
      JSON.stringify({ ok: true, traceId, total, perCompetitor, failures, message: `Scanned ${total} competitor products` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: e instanceof Error ? e.message : String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});