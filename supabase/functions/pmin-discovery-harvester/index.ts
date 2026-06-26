// PMIN Discovery Harvester — Wave X1
// Fetches public Pinterest signals via Firecrawl search. Metadata only, capped.
// No raw HTML, images, or video stored. Title/description samples ≤200 chars.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

function clip(s: string | undefined | null, n = 200): string | null {
  if (!s) return null;
  const t = String(s).trim();
  return t.length > n ? t.slice(0, n) : t;
}

async function sha1(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type FirecrawlSearchResult = { url?: string; title?: string; description?: string };

async function firecrawlSearch(query: string, limit = 20): Promise<FirecrawlSearchResult[]> {
  if (!FIRECRAWL_API_KEY) return [];
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit, lang: "en", country: "us" }),
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null) as { data?: { web?: FirecrawlSearchResult[] } | FirecrawlSearchResult[] } | null;
  const arr = Array.isArray(data?.data) ? data!.data as FirecrawlSearchResult[]
            : (data?.data && "web" in (data.data as object)) ? (data!.data as { web?: FirecrawlSearchResult[] }).web ?? []
            : [];
  return arr;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { run_id, dry_run } = await req.json().catch(() => ({})) as { run_id?: string; dry_run?: boolean };

  const { data: settings } = await admin.from("pmin_settings").select("*").limit(1).maybeSingle();
  if (settings?.kill_switch) {
    return new Response(JSON.stringify({ ok: false, reason: "kill_switch_on" }), { headers: corsHeaders });
  }

  const maxQueries = settings?.max_queries_per_run ?? 25;
  const maxCands = settings?.max_candidates_per_query ?? 20;
  const maxInserts = settings?.max_inserts_per_run ?? 500;

  const { data: sources } = await admin
    .from("pmin_sources").select("*").eq("enabled", true).limit(maxQueries);

  let scanned = 0, inserted = 0, skipped = 0;
  for (const src of sources ?? []) {
    const cfg = (src.config ?? {}) as Record<string, unknown>;
    const seed = (cfg.seed as string) || (cfg.category as string) || src.source_key;
    const query = `site:pinterest.com ${seed}`;
    const results = await firecrawlSearch(query, maxCands);
    scanned += results.length;

    for (const r of results) {
      if (inserted >= maxInserts) break;
      if (!r.url) continue;
      const title_sample = clip(r.title, 200);
      const description_sample = clip(r.description, 200);
      const title_hash = await sha1((title_sample ?? "") + "|" + (r.url ?? ""));
      if (dry_run) { skipped++; continue; }

      const { error } = await admin.from("pmin_discovered_pins").insert({
        source_url: r.url,
        title_hash,
        title_sample,
        description_sample,
        category_key: (cfg.category as string) ?? (cfg.seed as string) ?? null,
        niche_key: (cfg.seed as string) ?? null,
        region: "US",
        raw_meta: { source_key: src.source_key },
      });
      if (error) {
        if (!String(error.message).includes("duplicate")) skipped++;
      } else {
        inserted++;
      }
    }

    await admin.from("pmin_sources").update({
      last_run_at: new Date().toISOString(),
      last_status: "ok",
    }).eq("id", src.id);
  }

  return new Response(JSON.stringify({ ok: true, run_id, scanned, inserted, skipped, dry_run: !!dry_run }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});