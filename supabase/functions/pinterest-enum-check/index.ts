// TEMPORARY read-only validation: enumerate the live owned-pin universe
// exactly like pinterest-analytics-sync does and report coverage of the
// fixed 8-pin cohort. No writes, no Pinterest mutations.
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COHORT = [
  "1117103882604860704", "1117103882604860708", "1117103882604860710", "1117103882604860711",
  "1117103882604860713", "1117103882604860714", "1117103882604860715", "1117103882604860718",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await sb.from("pinterest_connection").select("access_token").limit(1).maybeSingle();
  const token = (data as { access_token?: string } | null)?.access_token;
  if (!token) return new Response(JSON.stringify({ ok: false, message: "no token" }), { headers: corsHeaders });

  const ids: string[] = [];
  let bookmark: string | null = null;
  let pages = 0;
  let err: string | null = null;
  do {
    const u = new URL("https://api.pinterest.com/v5/pins");
    u.searchParams.set("page_size", "100");
    if (bookmark) u.searchParams.set("bookmark", bookmark);
    const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { err = `pins_list_${r.status}`; break; }
    const j = await r.json() as { items?: Array<{ id?: string; created_at?: string }>; bookmark?: string | null };
    for (const it of j.items ?? []) if (it?.id) ids.push(String(it.id));
    pages++;
    bookmark = j.bookmark ?? null;
  } while (bookmark && pages < 60);

  const unique = new Set(ids);
  const found = COHORT.filter((c) => unique.has(c));

  // Also fetch created_at for each cohort pin (T0) — read-only.
  const t0: Record<string, string | null> = {};
  for (const id of COHORT) {
    try {
      const r = await fetch(`https://api.pinterest.com/v5/pins/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json() as { created_at?: string };
      t0[id] = r.ok ? (j.created_at ?? null) : null;
    } catch { t0[id] = null; }
  }

  return new Response(JSON.stringify({
    ok: true,
    enumerated: ids.length,
    unique: unique.size,
    duplicates: ids.length - unique.size,
    pages,
    err,
    cohort_found: `${found.length}/8`,
    missing: COHORT.filter((c) => !unique.has(c)),
    t0,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
