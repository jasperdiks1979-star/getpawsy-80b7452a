// Phase 8c: cluster keyword snapshots from the last 14d into trend clusters
// per source. Uses a simple co-occurrence + token-prefix grouping (no external NLP).
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Snap = { payload: { source?: string; keyword?: string; score?: number } };

function key(tokens: string[]): string {
  return tokens.slice(0, 2).join(" ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SB_URL, SB_SVC);

  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data: snaps } = await sb
    .from("market_signal_snapshots")
    .select("payload, captured_at")
    .gte("captured_at", since)
    .limit(20000);

  // bucket by (source, cluster_key)
  const buckets = new Map<
    string,
    { source: string; key: string; keywords: Set<string>; score: number; n: number; recent: number }
  >();
  const nowMs = Date.now();

  for (const s of (snaps ?? []) as any[]) {
    const p = (s as Snap).payload || {};
    const src = p.source;
    const kw = (p.keyword ?? "").trim();
    if (!src || !kw) continue;
    const toks = kw.split(/\s+/);
    const ck = key(toks);
    const id = `${src}::${ck}`;
    const b = buckets.get(id) ?? {
      source: src,
      key: ck,
      keywords: new Set<string>(),
      score: 0,
      n: 0,
      recent: 0,
    };
    b.keywords.add(kw);
    b.score += Number(p.score) || 1;
    b.n += 1;
    const age = (nowMs - new Date((s as any).captured_at).getTime()) / 86400_000;
    if (age <= 3) b.recent += Number(p.score) || 1;
    buckets.set(id, b);
  }

  const upserts = [...buckets.values()]
    .filter((b) => b.n >= 2)
    .map((b) => {
      const velocity = b.score > 0 ? b.recent / b.score : 0;
      const status =
        velocity > 0.6 ? "rising" :
        velocity > 0.3 ? "emerging" :
        velocity > 0.15 ? "peaked" : "declining";
      return {
        cluster_key: b.key,
        source: b.source,
        label: b.key,
        keywords: [...b.keywords].slice(0, 12),
        signal_score: Math.round(b.score * 100) / 100,
        velocity: Math.round(velocity * 100) / 100,
        sample_size: b.n,
        examples: [...b.keywords].slice(0, 6).map((k) => ({ kw: k })),
        last_seen_at: new Date().toISOString(),
        status,
      };
    });

  if (upserts.length) {
    const { error } = await sb
      .from("market_trend_clusters")
      .upsert(upserts, { onConflict: "cluster_key,source" });
    if (error) console.error("upsert err", error);
  }

  await sb.from("market_signal_logs").insert({
    source_id: null,
    status: "ok",
    message: `cluster-trends: ${upserts.length} clusters from ${snaps?.length ?? 0} snapshots`,
  });

  return new Response(
    JSON.stringify({ ok: true, traceId: crypto.randomUUID(), clusters: upserts.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});