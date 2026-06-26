import { corsHeaders, svc, requireAdmin, ok, err } from "../_shared/ee-p2-common.ts";

// Heuristic 13-axis emotion scoring of creative copy. Observation-only.
const LEX: Record<string, RegExp[]> = {
  curiosity: [/why|secret|hidden|truth|reveal|discover|wonder/i],
  urgency: [/now|today|hurry|limited|last|don'?t miss|ending|soon/i],
  excitement: [/amazing|incredible|wow|awesome|love|finally|game[- ]?changer/i],
  trust: [/proven|tested|guaranteed|reviewed|trusted|vet|expert/i],
  cuteness: [/cute|adorable|tiny|sweet|fluffy|cuddly|purr|wag/i],
  fomo: [/only|exclusive|while supplies|selling out|popular|trending/i],
  luxury: [/premium|luxury|elegant|handcrafted|designer|elite/i],
  humor: [/lol|funny|hilarious|silly|laugh|😂|haha/i],
  problem_solving: [/stop|fix|solve|prevent|end the|no more|tired of/i],
  transformation: [/transform|change|new|upgrade|level up|makeover/i],
  before_after: [/before|after|results|days?|weeks?|months? later/i],
  lifestyle: [/home|life|family|daily|everyday|routine|cozy/i],
  surprise: [/shocking|unexpected|surprised|never thought|you won'?t believe/i],
};

function scoreText(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, regs] of Object.entries(LEX)) {
    let hits = 0;
    for (const re of regs) if (re.test(text)) hits++;
    out[k] = Math.min(1, hits / Math.max(1, regs.length));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;
  const sb = svc();
  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(2000, Number(body.limit ?? 500));
    const { data: creatives } = await sb
      .from("pcie2_creatives")
      .select("id, headline, hook, cta, description")
      .order("created_at", { ascending: false })
      .limit(limit);
    const rows: any[] = [];
    for (const c of creatives ?? []) {
      const text = [c.headline, c.hook, c.cta, c.description].filter(Boolean).join(" \n ");
      if (!text) continue;
      const s = scoreText(text);
      const dominant = Object.entries(s).sort((a, b) => b[1] - a[1])[0]?.[0];
      rows.push({
        creative_id: String(c.id),
        source_table: "pcie2_creatives",
        ...s,
        dominant_emotion: dominant,
        emotion_vector: s,
        model_version: "lex-v1",
      });
    }
    if (rows.length) {
      for (let i = 0; i < rows.length; i += 500) await sb.from("ee_p2_emotion_scores").insert(rows.slice(i, i + 500));
    }
    return ok({ scored: rows.length });
  } catch (e) {
    return err(String(e));
  }
});