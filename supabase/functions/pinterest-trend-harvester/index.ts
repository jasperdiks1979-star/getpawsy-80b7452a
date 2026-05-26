import "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// US seasonal calendar keyed to month
const SEASONAL: Record<number, Array<{ keyword: string; category_key: string; strength: number }>> = {
  1: [ { keyword: "new year pet routine", category_key: "pet_tech", strength: 0.7 } ],
  2: [ { keyword: "valentine pet gifts", category_key: "toys", strength: 0.6 } ],
  3: [ { keyword: "spring shedding", category_key: "dog_bed", strength: 0.7 } ],
  4: [ { keyword: "easter pet safety", category_key: "pet_tech", strength: 0.5 } ],
  5: [ { keyword: "mothers day cat gifts", category_key: "catio", strength: 0.6 } ],
  6: [ { keyword: "summer cooling mat", category_key: "dog_bed", strength: 0.9 }, { keyword: "outdoor catio", category_key: "catio", strength: 0.9 } ],
  7: [ { keyword: "fourth of july dog anxiety", category_key: "dog_bed", strength: 0.8 } ],
  8: [ { keyword: "back to school pet", category_key: "pet_tech", strength: 0.6 } ],
  9: [ { keyword: "fall pet decor", category_key: "toys", strength: 0.5 } ],
  10: [ { keyword: "halloween cat costume", category_key: "toys", strength: 0.8 } ],
  11: [ { keyword: "black friday pet deals", category_key: "pet_tech", strength: 1.0 }, { keyword: "self cleaning litter box", category_key: "cat_litter", strength: 1.0 } ],
  12: [ { keyword: "christmas pet gift guide", category_key: "toys", strength: 1.0 }, { keyword: "cozy dog bed", category_key: "dog_bed", strength: 0.9 } ],
};

const EVERGREEN = [
  { keyword: "self cleaning litter box", category_key: "cat_litter", strength: 0.95 },
  { keyword: "orthopedic dog bed", category_key: "dog_bed", strength: 0.9 },
  { keyword: "modern catio ideas", category_key: "catio", strength: 0.85 },
  { keyword: "smart pet feeder", category_key: "pet_tech", strength: 0.8 },
  { keyword: "interactive cat toy", category_key: "toys", strength: 0.75 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const validTo = new Date(Date.now() + 30 * 86400000).toISOString();
    const rows = [
      ...(SEASONAL[month] ?? []).map(s => ({ ...s, source: "seasonal", valid_from: now.toISOString(), valid_to: validTo })),
      ...EVERGREEN.map(s => ({ ...s, source: "evergreen", valid_from: now.toISOString(), valid_to: validTo })),
    ];
    if (rows.length) await sb.from("pinterest_trend_signals").insert(rows);
    return new Response(JSON.stringify({ ok: true, traceId, inserted: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});