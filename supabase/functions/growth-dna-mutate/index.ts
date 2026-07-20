import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// Phase 7c — Creative DNA mutation
// Picks top-performing active genes per type and asks Lovable AI to produce
// merchant-safe variants. Inserts as status='testing' with parent lineage.

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MODEL = "google/gemini-3-flash-preview";

const BANNED = /(vet[- ]approved|eco[- ]friendly|cheap|guaranteed|cure|miracle|best price|#1 in|clinically proven)/i;

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(v: string): string | null {
  const t = v.trim().replace(/^["“”']+|["“”']+$/g, "");
  if (t.length < 4 || t.length > 140) return null;
  if (BANNED.test(t)) return null;
  return t;
}

const PROMPTS: Record<string, string> = {
  hook: "Generate 4 short, US-native, conversion-focused video hooks (max 60 chars each) inspired by the parent below. Avoid the parent's exact wording. No emoji. No claims of being 'the best'. Return JSON array of strings.",
  angle: "Generate 4 short product positioning angles (max 80 chars) inspired by the parent. Each must focus on a different benefit (time saved, smell, calm, beauty, social proof). Return JSON array of strings.",
  backdrop: "Generate 4 short backdrop scene descriptions (max 90 chars) for product photography inspired by the parent. Modern US homes, natural light. Return JSON array of strings.",
};

async function mutate(geneType: string, parentValue: string): Promise<string[]> {
  if (!LOVABLE_API_KEY) return [];
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "You are a US-market direct-response copy mutation engine. Output ONLY a JSON array of strings, no prose." },
        { role: "user", content: `${PROMPTS[geneType]}\n\nPARENT: "${parentValue}"` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) return [];
  const j = await r.json();
  const txt = j?.choices?.[0]?.message?.content ?? "[]";
  try {
    const parsed = JSON.parse(txt);
    const arr = Array.isArray(parsed) ? parsed : (parsed.variants ?? parsed.items ?? parsed.values ?? []);
    return (arr as unknown[]).map(String);
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const inserted: any[] = [];
    for (const geneType of ["hook", "angle", "backdrop"] as const) {
      const { data: parents } = await sb
        .from("growth_creative_dna")
        .select("id, gene_value, generation, ewma_reward")
        .eq("gene_type", geneType)
        .eq("status", "active")
        .order("ewma_reward", { ascending: false })
        .limit(3);
      if (!parents?.length) continue;

      for (const parent of parents) {
        const variants = await mutate(geneType, (parent as any).gene_value);
        const rows = variants
          .map((v) => clean(v))
          .filter((v): v is string => !!v)
          .slice(0, 4)
          .map((v) => ({
            gene_type: geneType,
            gene_value: v,
            parent_id: (parent as any).id,
            generation: ((parent as any).generation ?? 0) + 1,
            status: "testing",
            meta: { parent_value: (parent as any).gene_value, model: MODEL },
          }));
        if (!rows.length) continue;
        const { data: ins } = await sb
          .from("growth_creative_dna")
          .upsert(rows, { onConflict: "gene_type,gene_value", ignoreDuplicates: true })
          .select("id, gene_type, gene_value");
        if (ins) inserted.push(...ins);
      }
    }

    await sb.from("growth_events").insert({
      event_type: "dna_mutate",
      payload: { trace_id: traceId, inserted: inserted.length } as any,
    });

    return json({ ok: true, traceId, inserted: inserted.length, samples: inserted.slice(0, 6) });
  } catch (e) {
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});