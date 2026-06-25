import { admin, cors, jsonResp, sha1, loadRules } from "../_shared/creative-helpers.ts";

interface Candidate {
  product_id: string;
  category_slug: string;
  creative_type: string;
  hook: string;
  headline?: string;
  cta?: string;
  board_candidate?: string;
  image_url?: string;
}

export async function checkCandidate(sb: ReturnType<typeof admin>, c: Candidate, rules: Awaited<ReturnType<typeof loadRules>>) {
  const reasons: string[] = [];
  const text = `${c.hook ?? ""} ${c.headline ?? ""}`.toLowerCase();
  for (const phrase of rules.banned_phrases ?? []) {
    if (text.includes(String(phrase).toLowerCase())) reasons.push(`banned_phrase:${phrase}`);
  }
  const hookHash = await sha1(c.hook ?? "");

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const today = new Date(Date.now() - 86400_000).toISOString();

  // hook repeat
  const { count: hookCount } = await sb
    .from("creative_assets")
    .select("id", { count: "exact", head: true })
    .eq("hook_hash", hookHash)
    .gte("created_at", since);
  if ((hookCount ?? 0) >= rules.max_hook_repeat_30d) reasons.push("hook_repeated");

  // product cap 30d
  const { count: prodCount } = await sb
    .from("creative_assets")
    .select("id", { count: "exact", head: true })
    .eq("product_id", c.product_id)
    .gte("created_at", since);
  if ((prodCount ?? 0) >= rules.max_per_product_30d) reasons.push("product_overfilled");

  // product per day
  const { count: dayCount } = await sb
    .from("creative_assets")
    .select("id", { count: "exact", head: true })
    .eq("product_id", c.product_id)
    .gte("created_at", today);
  if ((dayCount ?? 0) >= rules.max_per_product_per_day) reasons.push("product_daily_cap");

  // category cap
  const { count: catCount } = await sb
    .from("creative_assets")
    .select("id", { count: "exact", head: true })
    .eq("category_slug", c.category_slug)
    .gte("created_at", since);
  if ((catCount ?? 0) >= rules.max_per_category_30d) reasons.push("category_overfilled");

  return { ok: reasons.length === 0, reasons, hookHash };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = admin();
    const body = await req.json().catch(() => ({}));
    const cands: Candidate[] = body.candidates ?? [];
    const rules = await loadRules(sb);
    const out = [];
    for (const c of cands) out.push({ candidate: c, ...(await checkCandidate(sb, c, rules)) });
    return jsonResp({ ok: true, results: out });
  } catch (e) {
    return jsonResp({ ok: false, error: String(e) }, 500);
  }
});