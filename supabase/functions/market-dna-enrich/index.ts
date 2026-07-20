// Phase 8c: take top rising trend clusters and seed Creative DNA genes
// (hook / angle) for the autonomous mutator. Drafts only — testing status.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const BANNED = /(guaranteed|miracle|cure|vet[- ]?approved|eco[- ]?friendly)/i;

async function genFor(label: string, kws: string[]): Promise<{ hooks: string[]; angles: string[] }> {
  if (!LOVABLE_API_KEY) return { hooks: [], angles: [] };
  const prompt = `You are a US pet-brand copy strategist for GetPawsy. Cluster: "${label}".
Related keywords: ${kws.join(", ")}.
Return strict JSON: {"hooks":[3 short hook lines, ≤9 words, no banned terms],"angles":[3 short angle phrases, ≤6 words]}.
Banned: guaranteed, miracle, cure, vet-approved, eco-friendly, dropship.`;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(txt);
    return {
      hooks: (parsed.hooks ?? []).filter((s: string) => typeof s === "string" && !BANNED.test(s)),
      angles: (parsed.angles ?? []).filter((s: string) => typeof s === "string" && !BANNED.test(s)),
    };
  } catch (e) {
    console.error("gen fail", e);
    return { hooks: [], angles: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SB_URL, SB_SVC);

  const { data: clusters } = await sb
    .from("market_trend_clusters")
    .select("id, label, keywords, signal_score, velocity, status")
    .in("status", ["rising", "emerging"])
    .order("signal_score", { ascending: false })
    .limit(5);

  let inserted = 0;
  for (const c of clusters ?? []) {
    const { hooks, angles } = await genFor((c as any).label, (c as any).keywords ?? []);
    for (const [type, values] of [["hook", hooks], ["angle", angles]] as const) {
      for (const v of values) {
        const { data: gene, error } = await sb
          .from("growth_creative_dna")
          .upsert(
            { gene_type: type, gene_value: v, status: "testing", meta: { from_cluster: (c as any).id } },
            { onConflict: "gene_type,gene_value", ignoreDuplicates: false }
          )
          .select("id")
          .maybeSingle();
        if (error || !gene) continue;
        await sb.from("market_dna_promotions").insert({
          cluster_id: (c as any).id,
          gene_id: (gene as any).id,
          reason: `seeded_from_${(c as any).status}_cluster`,
        });
        inserted++;
      }
    }
  }

  await sb.from("market_signal_logs").insert({
    source_id: null,
    status: "ok",
    message: `dna-enrich: ${inserted} genes from ${clusters?.length ?? 0} clusters`,
  });

  return new Response(
    JSON.stringify({ ok: true, traceId: crypto.randomUUID(), inserted, clusters: clusters?.length ?? 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});