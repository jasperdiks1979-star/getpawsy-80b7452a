import { admin, cors, jsonResp, fetchEligibleProducts, loadBudget, loadRules, HOOK_TEMPLATES, buildUtm, checkCandidate } from "../_shared/creative-helpers.ts";

function pretty(slug: string | null) {
  if (!slug) return "pets";
  return slug.replace(/-/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = admin();
    const body = await req.json().catch(() => ({}));
    const mode: "no_ai" | "ai_static" = body.mode === "ai_static" ? "ai_static" : "no_ai";
    const dryRun: boolean = body.dry_run !== false;
    const limit: number = Math.min(Number(body.limit ?? 20), 50);

    const budget = await loadBudget(sb);
    if (budget.hard_pause) return jsonResp({ ok: false, error: "hard_pause_enabled" }, 423);
    const cap = Math.min(limit, budget.max_per_run);

    // start run
    const { data: runRow, error: runErr } = await sb.from("creative_generation_runs").insert({
      mode, dry_run: dryRun, requested: cap, status: "running", budget_cap_usd: budget.max_usd_per_run,
      trigger: body.trigger ?? "manual",
    }).select().single();
    if (runErr) throw runErr;
    const runId = runRow.id as string;

    const products = await fetchEligibleProducts(sb, 600);
    const rules = await loadRules(sb);

    // diversify: shuffle products by category round-robin
    const byCat = new Map<string, typeof products>();
    for (const p of products) {
      const arr = byCat.get(p.category_slug!) ?? [];
      arr.push(p);
      byCat.set(p.category_slug!, arr);
    }
    const catKeys = [...byCat.keys()].sort(() => Math.random() - 0.5);
    const picks: typeof products = [];
    const perProductInBatch = new Map<string, number>();
    const perCategoryInBatch = new Map<string, number>();
    let i = 0;
    while (picks.length < cap * 2 && catKeys.length > 0) {
      const cat = catKeys[i % catKeys.length];
      const pool = byCat.get(cat)!;
      const p = pool.shift();
      if (!p) { catKeys.splice(i % catKeys.length, 1); continue; }
      if ((perCategoryInBatch.get(cat) ?? 0) >= 3) { i++; continue; }
      if ((perProductInBatch.get(p.id) ?? 0) >= 2) { i++; continue; }
      picks.push(p);
      perProductInBatch.set(p.id, (perProductInBatch.get(p.id) ?? 0) + 1);
      perCategoryInBatch.set(cat, (perCategoryInBatch.get(cat) ?? 0) + 1);
      i++;
      if (picks.length >= cap * 2) break;
    }

    const inserts: any[] = [];
    const skipped: any[] = [];
    const usedHooks = new Set<string>();
    const templates = HOOK_TEMPLATES[0].templates;
    const ctas = HOOK_TEMPLATES[0].ctas;

    for (const p of picks) {
      if (inserts.length >= cap) break;
      // pick a template that hasn't been used in this batch
      const candidateTemplates = templates.filter((t) => !usedHooks.has(t));
      const tmpl = candidateTemplates[Math.floor(Math.random() * candidateTemplates.length)] ?? templates[0];
      usedHooks.add(tmpl);
      const catPretty = pretty(p.category_slug);
      const hook = tmpl.replace("{category}", catPretty);
      const cta = ctas[Math.floor(Math.random() * ctas.length)];
      const candidate = {
        product_id: p.id,
        category_slug: p.category_slug!,
        creative_type: "pinterest_static",
        hook,
        headline: p.title,
        cta,
        image_url: p.hero_image!,
      };
      const guard = await checkCandidate(sb, candidate, rules as any);
      if (!guard.ok) { skipped.push({ product: p.id, reasons: guard.reasons }); continue; }

      const id = crypto.randomUUID();
      inserts.push({
        id, run_id: runId, product_id: p.id, product_title: p.title,
        category_slug: p.category_slug, board_candidate: p.category_slug,
        creative_type: "pinterest_static",
        hook, headline: p.title, subheadline: null, cta,
        overlay_text: hook.slice(0, 32),
        image_url: p.hero_image, pdp_url: `https://getpawsy.pet/products/${p.slug}`,
        utm_url: buildUtm(p.slug!, id),
        generation_model: mode === "ai_static" ? "google/gemini-3.1-flash-image" : "no_ai_template",
        ai_cost_credits: 0, ai_cost_usd: 0,
        status: "draft",
        hook_hash: guard.hookHash,
        quality_score: 70, uniqueness_score: 80, diversity_score: 85, compliance_score: 95, priority_score: 70,
        meta: { source: mode, batch_id: runId },
      });
    }

    let inserted = 0;
    if (!dryRun && inserts.length) {
      const { error } = await sb.from("creative_assets").insert(inserts);
      if (error) throw error;
      inserted = inserts.length;
    }

    await sb.from("creative_generation_runs").update({
      status: "done",
      generated: inserted,
      skipped: skipped.length,
      blocked_duplicates: skipped.filter((s) => s.reasons.includes("hook_repeated") || s.reasons.includes("product_daily_cap")).length,
      actual_usd: 0, actual_credits: 0,
      finished_at: new Date().toISOString(),
      notes: { skipped_sample: skipped.slice(0, 10), drafted_sample: inserts.slice(0, 5).map((i) => ({ p: i.product_id, h: i.hook })) },
    }).eq("id", runId);

    return jsonResp({ ok: true, run_id: runId, dry_run: dryRun, planned: inserts.length, inserted, skipped: skipped.length });
  } catch (e) {
    return jsonResp({ ok: false, error: String(e) }, 500);
  }
});