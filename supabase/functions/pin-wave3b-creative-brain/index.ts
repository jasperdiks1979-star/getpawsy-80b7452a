// Wave 3B — Pinterest Creative Brain.
// For every eligible product (potential_score >= 70):
//   • Seeds 50+ curated hooks into pin_hook_library_v2 (idempotent, global).
//   • Generates 20 unique, banned-phrase-free headline variants via Lovable AI
//     and persists them into pin_headline_bank.
// Scene Style Families v2 (15) are seeded by the Wave 3A+ migration; this
// function leaves them untouched. Descriptions are deferred to Wave 3C/D.
//
// POST { action: "run", limit?: number, productId?: string, dryRun?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { aiCreditPreflight } from "../_shared/ai-credit-preflight.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

const BANNED_PHRASES = [
  "vet-approved", "vet approved", "eco-friendly", "eco friendly",
  "stop scooping", "game-changer", "game changer", "must-have", "must have",
  "you won't believe", "you wont believe", "shocking", "secret hack",
  "doctors hate", "amazing", "best ever",
  // duplicate-slop stems flagged by hero reject analysis (2026-07-02)
  "cleaner litter, less work", "tired of scooping", "tired of litter scooping",
  "tired of litter box chores", "tired of daily scooping",
  "cat parents love this", "cat owners love this", "cat owners love it",
  "what if you never scooped", "reclaim your time",
];

const HOOKS_V2: Array<{ bucket: string; hook_text: string; species_scope: string[]; category_scope: string[] }> = [
  // Comfort / Sleep
  { bucket: "comfort", hook_text: "Built for the cat who claims every soft surface.", species_scope: ["cat"], category_scope: [] },
  { bucket: "comfort", hook_text: "Designed for dogs who melt into their bed by 9pm.", species_scope: ["dog"], category_scope: [] },
  { bucket: "comfort", hook_text: "The kind of nap setup pets actually choose.", species_scope: [], category_scope: [] },
  { bucket: "comfort", hook_text: "A quieter corner for an over-stimulated pup.", species_scope: ["dog"], category_scope: [] },
  // Problem-solver
  { bucket: "problem_solver", hook_text: "For homes where the litter situation needs a rethink.", species_scope: ["cat"], category_scope: ["litter"] },
  { bucket: "problem_solver", hook_text: "When the old crate stopped feeling like a refuge.", species_scope: ["dog"], category_scope: [] },
  { bucket: "problem_solver", hook_text: "Because shedding season shouldn't take over the couch.", species_scope: [], category_scope: [] },
  { bucket: "problem_solver", hook_text: "Made for cats that ignored every other scratcher.", species_scope: ["cat"], category_scope: ["scratcher"] },
  // Lifestyle
  { bucket: "lifestyle", hook_text: "Apartment-friendly. Cat-approved.", species_scope: ["cat"], category_scope: [] },
  { bucket: "lifestyle", hook_text: "Small-space living, big-dog energy.", species_scope: ["dog"], category_scope: [] },
  { bucket: "lifestyle", hook_text: "For pet owners who care what the living room looks like.", species_scope: [], category_scope: [] },
  { bucket: "lifestyle", hook_text: "Modern homes deserve modern pet gear.", species_scope: [], category_scope: [] },
  // Outcome
  { bucket: "outcome", hook_text: "More play. Less mess. Same energetic kitten.", species_scope: ["cat"], category_scope: ["toy"] },
  { bucket: "outcome", hook_text: "Calmer walks start with the right harness.", species_scope: ["dog"], category_scope: ["harness"] },
  { bucket: "outcome", hook_text: "A cleaner bowl area in five minutes flat.", species_scope: [], category_scope: ["feeder"] },
  { bucket: "outcome", hook_text: "Sleep through the night while the fountain runs.", species_scope: [], category_scope: ["fountain"] },
  // Curiosity
  { bucket: "curiosity", hook_text: "Why this design works for shy cats.", species_scope: ["cat"], category_scope: [] },
  { bucket: "curiosity", hook_text: "The detail most chew toys leave out.", species_scope: ["dog"], category_scope: ["toy"] },
  { bucket: "curiosity", hook_text: "What changed once we switched feeders.", species_scope: [], category_scope: ["feeder"] },
  { bucket: "curiosity", hook_text: "How the right tree calms a window-stalker.", species_scope: ["cat"], category_scope: ["cat tree"] },
  // Trust / Quality
  { bucket: "trust", hook_text: "US warehouse. Fast ship. Pet-tested.", species_scope: [], category_scope: [] },
  { bucket: "trust", hook_text: "Materials we'd put in our own home.", species_scope: [], category_scope: [] },
  { bucket: "trust", hook_text: "Built sturdy. Built quiet.", species_scope: [], category_scope: [] },
  { bucket: "trust", hook_text: "Designed for daily use, not a single photo.", species_scope: [], category_scope: [] },
  // Seasonal
  { bucket: "seasonal", hook_text: "Cozy season has a new MVP.", species_scope: [], category_scope: ["bed"] },
  { bucket: "seasonal", hook_text: "Summer walks call for cooler gear.", species_scope: ["dog"], category_scope: [] },
  { bucket: "seasonal", hook_text: "Holiday-ready setups for indoor cats.", species_scope: ["cat"], category_scope: [] },
  // Bonding
  { bucket: "bonding", hook_text: "A little ritual you'll both look forward to.", species_scope: [], category_scope: [] },
  { bucket: "bonding", hook_text: "Quiet evenings get a soft soundtrack.", species_scope: [], category_scope: ["fountain"] },
  { bucket: "bonding", hook_text: "Training that feels less like work.", species_scope: ["dog"], category_scope: ["training"] },
  // Aesthetic
  { bucket: "aesthetic", hook_text: "A pet bed that doesn't fight the room.", species_scope: [], category_scope: ["bed"] },
  { bucket: "aesthetic", hook_text: "Tower, scratcher, sculpture. All three.", species_scope: ["cat"], category_scope: ["cat tree"] },
  { bucket: "aesthetic", hook_text: "Neutral tones. Sturdy build. Easy yes.", species_scope: [], category_scope: [] },
  // Routine
  { bucket: "routine", hook_text: "Mornings got 10 minutes shorter.", species_scope: [], category_scope: ["feeder"] },
  { bucket: "routine", hook_text: "Evenings got softer.", species_scope: [], category_scope: ["bed"] },
  { bucket: "routine", hook_text: "One small swap, fewer messes.", species_scope: [], category_scope: [] },
  // Identity
  { bucket: "identity", hook_text: "For owners who notice the small details.", species_scope: [], category_scope: [] },
  { bucket: "identity", hook_text: "The kind of gear careful pet parents pick.", species_scope: [], category_scope: [] },
  { bucket: "identity", hook_text: "Made for pets you genuinely fuss over.", species_scope: [], category_scope: [] },
  // Newcomer
  { bucket: "newcomer", hook_text: "First-time owner? Start here.", species_scope: [], category_scope: [] },
  { bucket: "newcomer", hook_text: "Bringing a kitten home this month?", species_scope: ["cat"], category_scope: [] },
  { bucket: "newcomer", hook_text: "Puppy-proof setup, week one.", species_scope: ["dog"], category_scope: [] },
  // Multi-pet
  { bucket: "multi_pet", hook_text: "Designed for households with more than one.", species_scope: [], category_scope: [] },
  { bucket: "multi_pet", hook_text: "Plays fair with bigger cats.", species_scope: ["cat"], category_scope: [] },
  { bucket: "multi_pet", hook_text: "Holds up to two enthusiastic dogs.", species_scope: ["dog"], category_scope: [] },
  // Travel
  { bucket: "travel", hook_text: "For road-trip dogs and the people who love them.", species_scope: ["dog"], category_scope: [] },
  { bucket: "travel", hook_text: "Folds flat. Travels well.", species_scope: [], category_scope: [] },
  // Safety
  { bucket: "safety", hook_text: "Quiet enough. Sturdy enough. Safe enough.", species_scope: [], category_scope: [] },
  { bucket: "safety", hook_text: "Built so the curious one stays out of trouble.", species_scope: [], category_scope: [] },
  // Save-worthy
  { bucket: "saveworthy", hook_text: "Pin this before you forget the size.", species_scope: [], category_scope: [] },
  { bucket: "saveworthy", hook_text: "Save the setup. Steal the idea.", species_scope: [], category_scope: [] },
];

function hashHeadline(text: string): string {
  // Tiny stable hash — sufficient for unique constraint scoping per product.
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}`;
}

function findBanned(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}

async function seedHooksV2() {
  // Upsert by unique hook_text — idempotent.
  for (let i = 0; i < HOOKS_V2.length; i += 25) {
    const batch = HOOKS_V2.slice(i, i + 25).map((h) => ({
      bucket: h.bucket,
      hook_text: h.hook_text,
      species_scope: h.species_scope,
      category_scope: h.category_scope,
      weight: 1.0,
    }));
    await supa.from("pin_hook_library_v2").upsert(batch, { onConflict: "hook_text" });
  }
  const { count } = await supa.from("pin_hook_library_v2").select("*", { count: "exact", head: true });
  return count ?? 0;
}

async function generateHeadlinesFor(product: any, intel: any): Promise<string[]> {
  const sys = `You write premium US-native Pinterest headlines for pet products.
Rules:
- 6 to 10 words.
- Concrete, specific, no fluff. No banned phrases: ${BANNED_PHRASES.join(", ")}.
- Vary angles: outcome, lifestyle, problem-solve, curiosity, identity, aesthetic, routine, trust.
- No emojis. No ALL CAPS. No exclamation marks. No "Stop ...".
- Mention the pet type only when natural.
Return ONLY a JSON array of exactly 20 unique strings.`;

  const user = `Product: ${product.name}
Category: ${product.category ?? "pet"}
Species: ${intel?.species ?? "cat or dog"}
Emotional trigger: ${intel?.emotional_trigger ?? "comfort"}
Lifestyle: ${intel?.lifestyle_context ?? "modern US home"}
Key benefits: ${(intel?.usp_hierarchy ?? []).slice(0, 4).map((u: any) => typeof u === "string" ? u : u?.title ?? "").join("; ")}
Generate 20 Pinterest headlines.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = await res.json();
  const raw = j?.choices?.[0]?.message?.content ?? "[]";
  // Be resilient to either {headlines:[...]} or [...] returns.
  let parsed: any = [];
  try { parsed = JSON.parse(raw); } catch { /* keep [] */ }
  if (parsed && !Array.isArray(parsed)) {
    parsed = parsed.headlines ?? parsed.items ?? parsed.results ?? [];
  }
  const out = (Array.isArray(parsed) ? parsed : [])
    .map((s: any) => String(s ?? "").trim())
    .filter((s: string) => s.length >= 6 && s.length <= 110);
  return Array.from(new Set(out)).slice(0, 20);
}

async function runHeadlinesForProduct(productId: string, productMap: Map<string, any>, intelMap: Map<string, any>) {
  const product = productMap.get(productId);
  const intel = intelMap.get(productId);
  if (!product) return { productId, ok: false, message: "product not found" };
  let headlines: string[];
  try {
    headlines = await generateHeadlinesFor(product, intel);
  } catch (e) {
    return { productId, ok: false, message: (e as Error).message };
  }
  if (headlines.length === 0) {
    return { productId, ok: false, message: "no_headlines_returned" };
  }
  const rows = headlines.map((h) => {
    const banned = findBanned(h);
    return {
      product_id: productId,
      headline: h,
      headline_hash: hashHeadline(h),
      bucket: null,
      banned_phrases_found: banned,
      weight: banned.length ? 0 : 1.0,
    };
  });
  const { error } = await supa
    .from("pin_headline_bank")
    .upsert(rows, { onConflict: "product_id,headline_hash" });
  if (error) return { productId, ok: false, message: error.message };
  return {
    productId,
    ok: true,
    inserted: rows.length,
    clean: rows.filter((r) => r.banned_phrases_found.length === 0).length,
  };
}

async function run(opts: { limit?: number; productId?: string; dryRun?: boolean }) {
  const startedAt = new Date().toISOString();
  const { data: runRow } = await supa
    .from("pin_wave3_runs")
    .insert({ wave: "wave3b", status: "running", started_at: startedAt, totals: { opts } })
    .select()
    .maybeSingle();
  const runId = runRow?.id ?? null;

  const hooksSeeded = await seedHooksV2();

  // Eligible products (potential ≥70).
  const { data: intelAll } = await supa
    .from("pin_product_intelligence")
    .select("product_id, product_slug, species, category, emotional_trigger, lifestyle_context, usp_hierarchy, potential_score")
    .gte("potential_score", 70);
  let intelRows = (intelAll ?? []) as any[];
  if (opts.productId) intelRows = intelRows.filter((r) => r.product_id === opts.productId);

  // Skip products that already have a healthy headline bank — keeps batched runs idempotent.
  if (!opts.productId) {
    const { data: existing } = await supa
      .from("pin_headline_bank")
      .select("product_id")
      .in("product_id", intelRows.map((r) => r.product_id));
    const counts = new Map<string, number>();
    for (const r of (existing ?? []) as Array<{ product_id: string }>) {
      counts.set(r.product_id, (counts.get(r.product_id) ?? 0) + 1);
    }
    intelRows = intelRows.filter((r) => (counts.get(r.product_id) ?? 0) < 15);
  }

  if (typeof opts.limit === "number") intelRows = intelRows.slice(0, opts.limit);

  const intelMap = new Map(intelRows.map((r) => [r.product_id, r]));
  const ids = intelRows.map((r) => r.product_id);
  const { data: prodsAll } = await supa
    .from("products")
    .select("id, name, slug, category")
    .in("id", ids);
  const productMap = new Map((prodsAll ?? []).map((p: any) => [p.id, p]));

  if (opts.dryRun) {
    return {
      runId,
      hooks_v2_total: hooksSeeded,
      eligible_products: intelRows.length,
      would_generate_headlines_for: ids.length,
    };
  }

  // Adaptive concurrency: 4 in flight to respect Gemini rate-limit.
  const CONCURRENCY = 4;
  let i = 0;
  let succeeded = 0;
  let failed = 0;
  let totalHeadlines = 0;
  let cleanHeadlines = 0;
  const failures: any[] = [];

  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const r = await runHeadlinesForProduct(ids[idx], productMap, intelMap);
      if (r.ok) {
        succeeded++;
        totalHeadlines += r.inserted ?? 0;
        cleanHeadlines += r.clean ?? 0;
      } else {
        failed++;
        if (failures.length < 25) failures.push(r);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const result = {
    runId,
    hooks_v2_total: hooksSeeded,
    eligible_products: intelRows.length,
    products_processed: succeeded + failed,
    succeeded,
    failed,
    total_headlines_inserted: totalHeadlines,
    clean_headlines: cleanHeadlines,
    failures_sample: failures.slice(0, 10),
  };

  if (runId) {
    await supa.from("pin_wave3_runs")
      .update({
        status: failed > 0 && succeeded === 0 ? "failed" : "completed",
        completed_at: new Date().toISOString(),
        totals: result,
      })
      .eq("id", runId);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dryRun;
    if (!dryRun) {
      const pre = await aiCreditPreflight(supa, "pin-wave3b-creative-brain");
      if (!pre.ok) {
        try {
          await supa.from("pin_wave3_runs").insert({
            status: "skipped",
            completed_at: new Date().toISOString(),
            totals: { skipped: true, skip_reason: pre.reason, state: pre.state, detail: pre.detail ?? null },
          });
        } catch (_) { /* table may not allow free insert; non-fatal */ }
        return new Response(JSON.stringify({
          ok: false,
          skipped: true,
          skip_reason: pre.reason,
          credit_state: pre.state,
          detail: pre.detail ?? null,
          message: "Preflight stopped run: insufficient AI credits or paused lane.",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    const result = await run({
      limit: typeof body.limit === "number" ? body.limit : undefined,
      productId: body.productId ? String(body.productId) : undefined,
      dryRun,
    });
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});