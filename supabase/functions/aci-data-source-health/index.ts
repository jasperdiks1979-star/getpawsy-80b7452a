import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Map each registered source to a SQL probe that proves it has fresh data.
const probes: Record<string, { table: string; column: string }> = {
  pinterest_pins: { table: "pinterest_pins", column: "created_at" },
  pinterest_analytics: { table: "pinterest_analytics_daily", column: "captured_at" },
  pinterest_ads: { table: "pe_ads_campaigns", column: "updated_at" },
  ga4: { table: "ga4_daily_snapshots", column: "snapshot_date" },
  gsc: { table: "gsc_keywords", column: "captured_at" },
  gmc: { table: "merchant_sync_logs", column: "created_at" },
  cj: { table: "cj_sync_runs", column: "created_at" },
  orders: { table: "orders", column: "created_at" },
  inventory: { table: "product_global_inventory", column: "updated_at" },
  products: { table: "products", column: "updated_at" },
  product_media: { table: "product_media", column: "created_at" },
  cpe: { table: "cpe_pipeline_runs", column: "created_at" },
  seo_engine: { table: "seo_engine_runs", column: "created_at" },
  blog_engine: { table: "blog_posts", column: "created_at" },
  prie: { table: "prie_brain_snapshots", column: "captured_at" },
  pga: { table: "pga_executive_snapshots", column: "captured_at" },
  pec: { table: "pe_health_snapshots", column: "captured_at" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const results: Array<{ source: string; ok: boolean; last_seen?: string; error?: string }> = [];

  for (const [source, p] of Object.entries(probes)) {
    try {
      const { data, error } = await sb
        .from(p.table)
        .select(p.column)
        .order(p.column, { ascending: false })
        .limit(1);
      if (error) throw error;
      const last = (data?.[0] as Record<string, string> | undefined)?.[p.column];
      const ageMs = last ? Date.now() - new Date(last).getTime() : Infinity;
      const health = !last
        ? "no_data"
        : ageMs < 6 * 3600_000
        ? "healthy"
        : ageMs < 24 * 3600_000
        ? "stale"
        : "very_stale";
      await sb
        .from("aci_data_sources")
        .update({ health, last_sync_at: last ?? null, last_error: null, updated_at: new Date().toISOString() })
        .eq("source_key", source);
      results.push({ source, ok: true, last_seen: last ?? undefined });
    } catch (e) {
      const msg = (e as Error).message;
      await sb.from("aci_data_sources").update({ health: "error", last_error: msg, updated_at: new Date().toISOString() }).eq("source_key", source);
      results.push({ source, ok: false, error: msg });
    }
  }

  return new Response(JSON.stringify({ ok: true, checked: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});