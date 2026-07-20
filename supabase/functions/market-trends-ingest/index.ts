// Phase 8c: aggregate Pinterest / TikTok / Google Trends keyword signals
// into raw rows for clustering. External APIs are optional — when keys are
// missing we fall back to internal signals already in the project.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Row = { source: string; keyword: string; score: number; meta?: Record<string, unknown> };

function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}
const STOP = new Set([
  "the","and","for","with","you","your","our","this","that","from","are","was",
  "but","not","get","all","new","best","top","how","why","what","pet","pets",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SB_URL, SB_SVC);
  const out: Row[] = [];

  // --- Internal: outbound clicks + pin titles as proxy demand signal ---
  try {
    const { data: pins } = await sb
      .from("pinterest_pin_queue")
      .select("title, meta, created_at")
      .gte("created_at", new Date(Date.now() - 14 * 86400_000).toISOString())
      .limit(500);
    for (const p of pins ?? []) {
      for (const t of tokenize((p as any).title ?? "")) {
        out.push({ source: "pinterest", keyword: t, score: 1 });
      }
    }
  } catch (_) { /* table optional */ }

  try {
    const { data: tt } = await sb
      .from("tiktok_video_jobs")
      .select("hook, caption, created_at")
      .gte("created_at", new Date(Date.now() - 14 * 86400_000).toISOString())
      .limit(500);
    for (const v of tt ?? []) {
      const text = `${(v as any).hook ?? ""} ${(v as any).caption ?? ""}`;
      for (const t of tokenize(text)) out.push({ source: "tiktok", keyword: t, score: 1 });
    }
  } catch (_) { /* table optional */ }

  // --- Google Trends: optional via SerpAPI / proxy if SERPAPI_KEY set ---
  const serp = Deno.env.get("SERPAPI_KEY");
  if (serp) {
    const seeds = ["cat tree", "litter box", "dog bed", "interactive cat toy", "pet camera"];
    for (const q of seeds) {
      try {
        const r = await fetch(
          `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(q)}&geo=US&api_key=${serp}`
        );
        const j = await r.json();
        const series = j?.interest_over_time?.timeline_data ?? [];
        const latest = series.at(-1)?.values?.[0]?.extracted_value ?? 0;
        out.push({ source: "google_trends", keyword: q, score: Number(latest) || 0, meta: { series_len: series.length } });
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) { console.error("trends fail", q, e); }
    }
  }

  // Aggregate to (source, keyword)
  const agg = new Map<string, Row>();
  for (const r of out) {
    const k = `${r.source}::${r.keyword}`;
    const prev = agg.get(k);
    if (prev) prev.score += r.score;
    else agg.set(k, { ...r });
  }
  const rows = [...agg.values()];

  // Persist as snapshots
  if (rows.length) {
    await sb.from("market_signal_snapshots").insert(
      rows.slice(0, 2000).map((r) => ({
        source_id: null,
        payload: { source: r.source, keyword: r.keyword, score: r.score, meta: r.meta ?? {} },
      }))
    );
  }

  await sb.from("market_signal_logs").insert({
    source_id: null,
    status: "ok",
    message: `trends-ingest: ${rows.length} keyword rows`,
  });

  return new Response(
    JSON.stringify({ ok: true, traceId: crypto.randomUUID(), count: rows.length, hasGoogleTrends: !!serp }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});