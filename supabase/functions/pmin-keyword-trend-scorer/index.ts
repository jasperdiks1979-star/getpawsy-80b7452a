// PMIN Keyword Trend Scorer — Wave X1
// Pure compute. Aggregates pmin_discovered_pins → pmin_keyword_trends (weekly).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STOPWORDS = new Set([
  "the","a","an","and","or","of","for","to","in","on","with","this","that","is","are","be","best","top","you","your","my","i","it","at","by","from","as","new","how","why","what"
]);

function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function weekStart(d: Date): string {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // Monday-start
  const ws = new Date(d);
  ws.setUTCDate(d.getUTCDate() - diff);
  return ws.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { dry_run } = await req.json().catch(() => ({})) as { dry_run?: boolean };

  // Last 14 days
  const since = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data: pins } = await admin
    .from("pmin_discovered_pins")
    .select("title_sample,description_sample,category_key,discovered_at")
    .gte("discovered_at", since)
    .limit(5000);

  // bucket: keyword|category|weekStart -> { volume, lastWeekVolume }
  const thisWeek = weekStart(new Date());
  const prevWeek = weekStart(new Date(Date.now() - 7 * 86400 * 1000));
  const agg = new Map<string, { keyword: string; category: string | null; week: string; vol: number }>();

  for (const p of pins ?? []) {
    const ws = weekStart(new Date(p.discovered_at as string));
    const text = `${p.title_sample ?? ""} ${p.description_sample ?? ""}`;
    const toks = tokens(text);
    const cat = (p.category_key as string | null) ?? null;
    for (const t of new Set(toks)) {
      const key = `${t}|${cat ?? ""}|${ws}`;
      const row = agg.get(key) ?? { keyword: t, category: cat, week: ws, vol: 0 };
      row.vol++;
      agg.set(key, row);
    }
  }

  // velocity = thisWeek - prevWeek (per keyword|cat)
  const volByKey = new Map<string, number>();
  for (const r of agg.values()) volByKey.set(`${r.keyword}|${r.category ?? ""}|${r.week}`, r.vol);

  let upserted = 0;
  const rows: Array<Record<string, unknown>> = [];
  for (const r of agg.values()) {
    if (r.week !== thisWeek) continue;
    const prev = volByKey.get(`${r.keyword}|${r.category ?? ""}|${prevWeek}`) ?? 0;
    const velocity = r.vol - prev;
    const opportunity = Math.round((r.vol * 0.6 + Math.max(0, velocity) * 1.4) * 10) / 10;
    rows.push({
      keyword: r.keyword,
      category_key: r.category,
      week_start: r.week,
      volume_proxy: r.vol,
      velocity,
      opportunity_score: opportunity,
      sample_count: r.vol,
      updated_at: new Date().toISOString(),
    });
  }

  if (!dry_run && rows.length) {
    const { error } = await admin.from("pmin_keyword_trends").upsert(rows, {
      onConflict: "keyword,category_key,week_start",
    });
    if (!error) upserted = rows.length;
  }

  return new Response(JSON.stringify({ ok: true, scanned: pins?.length ?? 0, upserted, dry_run: !!dry_run }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});