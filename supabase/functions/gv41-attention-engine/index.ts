// Genesis V4.1 — Human Attention Engine snapshot.
// Thin orchestration: reads real PPE candidate scores + world catalog + GCD genome.
// No new tables. No fabricated stats.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const [genome, worlds, recent, gcd] = await Promise.all([
      sb.from("gv41_attention_genome_v").select("*"),
      sb.from("pcie_v2_scene_generators").select("id,slug,name,enabled"),
      sb.from("ppe_candidate_scores")
        .select("niche,composite,created_at")
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(40),
      sb.from("gcd_genes").select("gene_type,gene_value,weight,wins,losses").order("weight", { ascending: false }).limit(50),
    ]);

    const rows = genome.data ?? [];
    const pick = (dim: string, key: "attention" | "save_p" | "click_p" | "purchase_p" | "scroll_stop") =>
      rows.filter((r: any) => r.dim === dim && r.n >= 3)
        .sort((a: any, b: any) => Number(b[key] ?? 0) - Number(a[key] ?? 0))
        .slice(0, 10);

    // Consecutive-world risk
    const seq = (recent.data ?? []).map((r: any) => r.niche).filter(Boolean);
    let maxRun = 0, cur = 0, prev: string | null = null;
    for (const w of seq) {
      if (w === prev) cur++; else cur = 1;
      if (cur > maxRun) maxRun = cur;
      prev = w;
    }
    const usedWorlds = new Set(seq);
    const totalWorlds = (worlds.data ?? []).length;

    const composites = (recent.data ?? []).map((r: any) => Number(r.composite ?? 0)).filter(Boolean);
    const has = composites.length
      ? Math.round(composites.reduce((a: number, b: number) => a + b, 0) / composites.length)
      : null;

    return json(200, {
      ok: true,
      generated_at: new Date().toISOString(),
      human_attention_score: has,
      sample_24h: composites.length,
      world_diversity: { total: totalWorlds, used_24h: usedWorlds.size, max_consecutive_run: maxRun },
      top_emotions: pick("emotion", "attention"),
      top_worlds: pick("world", "attention"),
      top_stories: pick("story", "attention"),
      top_scroll_stop: pick("emotion", "scroll_stop"),
      top_save: pick("emotion", "save_p"),
      top_click: pick("emotion", "click_p"),
      top_purchase: pick("emotion", "purchase_p"),
      winner_genes: (gcd.data ?? []).slice(0, 12),
    });
  } catch (e) {
    return json(500, { ok: false, error: String((e as Error).message ?? e) });
  }
});