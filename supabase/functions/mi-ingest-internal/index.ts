import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Bucket = { term: string; trend_type: string; category: string | null; signal: number };

function isUS(country: string | null): boolean {
  if (!country) return false;
  const c = country.toLowerCase();
  return c === "us" || c === "united states";
}

function normalize(term: string): string {
  return (term || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 1) Pull internal US visitor activity (product views + orders)
    const { data: rows, error: vErr } = await sb
      .from("visitor_activity")
      .select("country, is_internal, product_name, page_path, utm_source, order_value, activity_type")
      .gte("created_at", since)
      .limit(20000);
    if (vErr) throw vErr;

    const buckets = new Map<string, Bucket>();
    let included = 0, excludedNonUs = 0, excludedInternal = 0;

    for (const r of rows ?? []) {
      if (r.is_internal) { excludedInternal++; continue; }
      if (!isUS(r.country)) { excludedNonUs++; continue; }
      included++;

      // Product view signals
      if (r.product_name) {
        const term = normalize(r.product_name);
        if (term) {
          const key = `rising_product::${term}`;
          const b = buckets.get(key) ?? { term, trend_type: "rising_product", category: null, signal: 0 };
          // Orders weigh much more than views
          b.signal += r.activity_type === "purchase" ? 10 : 1;
          buckets.set(key, b);
        }
      }

      // Pinterest/TikTok source signals
      const src = (r.utm_source || "").toLowerCase();
      if (src === "pinterest" || src === "tiktok") {
        const term = `${src} traffic`;
        const key = `engagement_format::${term}`;
        const b = buckets.get(key) ?? { term, trend_type: "engagement_format", category: src, signal: 0 };
        b.signal += 1;
        buckets.set(key, b);
      }
    }

    // 2) Insert raw signals (one per bucket per run, captured_at = now)
    const signals = Array.from(buckets.values()).map(b => ({
      source: "internal_visitor_activity",
      market: "US",
      value: b.signal,
      meta: { term: b.term, trend_type: b.trend_type, category: b.category, window: "30d" },
    }));
    if (signals.length) {
      const { error: sErr } = await sb.from("mi_trend_signals").insert(signals as never);
      if (sErr) throw sErr;
    }

    // 3) Roll up into mi_trends — upsert by (term, trend_type, market)
    let upserted = 0;
    for (const b of buckets.values()) {
      // Check existing
      const { data: existing } = await sb
        .from("mi_trends")
        .select("id, score")
        .eq("market", "US")
        .eq("term", b.term)
        .eq("trend_type", b.trend_type)
        .maybeSingle();

      const newScore = Math.min(100, b.signal); // simple cap, tune later
      if (existing) {
        const prev = Number(existing.score) || 0;
        const momentum = newScore - prev;
        await sb.from("mi_trends").update({
          score: newScore,
          momentum,
          last_seen: new Date().toISOString(),
          source: "internal_visitor_activity",
          category: b.category,
        }).eq("id", existing.id);
      } else {
        await sb.from("mi_trends").insert([{
          term: b.term,
          trend_type: b.trend_type,
          market: "US",
          source: "internal_visitor_activity",
          score: newScore,
          momentum: newScore,
          category: b.category,
        }] as never);
      }
      upserted++;
    }

    return new Response(JSON.stringify({
      ok: true, traceId,
      stats: {
        sessions_scanned: rows?.length ?? 0,
        us_included: included,
        non_us_excluded: excludedNonUs,
        internal_excluded: excludedInternal,
        unique_terms: buckets.size,
        signals_inserted: signals.length,
        trends_upserted: upserted,
      },
      message: `Ingested ${signals.length} signals, upserted ${upserted} US trends`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, traceId, message: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});