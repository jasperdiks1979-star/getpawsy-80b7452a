import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOP_N = 5;
const VARIANTS_PER_WINNER = 4;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dryRun: boolean = !!body?.dry_run;

    // Pick top winning drafts
    const { data: winners } = await supabase
      .from("mi_remix_drafts")
      .select("id, recipe_id, product_id, generated_copy, generated_brief, performance_score")
      .gt("performance_score", 0)
      .order("performance_score", { ascending: false })
      .limit(TOP_N);

    const winnerList = winners ?? [];
    const generated: any[] = [];
    const errors: string[] = [];

    for (const w of winnerList) {
      let variants: { copy: string; brief: string }[] = [];

      if (lovableKey && w.generated_copy) {
        try {
          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${lovableKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: "You generate compliant Pinterest pin copy variants for US pet owners. NO 'vet-approved', 'eco-friendly', medical claims, or fake reviews. Output JSON only." },
                { role: "user", content: `Generate ${VARIANTS_PER_WINNER} fresh variants of this winning pin. Keep the hook angle, vary the wording, hook style, and CTA. Return JSON: {"variants":[{"copy":"...","brief":"..."}]}\n\nORIGINAL COPY:\n${w.generated_copy}\n\nORIGINAL BRIEF:\n${w.generated_brief ?? ""}` },
              ],
              response_format: { type: "json_object" },
            }),
          });
          const j = await r.json();
          const content = j?.choices?.[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(content);
          variants = (parsed?.variants ?? []).slice(0, VARIANTS_PER_WINNER);
        } catch (e) {
          errors.push(`AI failed for ${w.id}: ${(e as Error).message}`);
        }
      }

      if (!variants.length) {
        // Fallback: simple suffix variants so the loop still scales
        variants = Array.from({ length: VARIANTS_PER_WINNER }, (_, i) => ({
          copy: `${w.generated_copy ?? ""}\n\n— Variant ${i + 1}`,
          brief: w.generated_brief ?? "",
        }));
      }

      if (!dryRun) {
        const rows = variants.map((v) => ({
          recipe_id: w.recipe_id,
          product_id: w.product_id,
          generated_copy: v.copy,
          generated_brief: v.brief,
          status: "draft",
          compliance_flags: [],
        }));
        const { error } = await supabase.from("mi_remix_drafts").insert(rows);
        if (error) errors.push(error.message);
      }
      generated.push({ winner_id: w.id, variants_count: variants.length });
    }

    return new Response(JSON.stringify({
      ok: true, dry_run: dryRun, winners: winnerList.length, total_variants: generated.reduce((a, b) => a + b.variants_count, 0), generated, errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
