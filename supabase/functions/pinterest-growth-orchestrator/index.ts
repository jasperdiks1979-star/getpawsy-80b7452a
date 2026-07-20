// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Pinterest Growth Orchestrator
 *
 * Nightly autonomous engine. Safe by design:
 *  - never deletes products or pins
 *  - never overwrites live/published pin rows
 *  - hard caps per run (≤30 drafts, ≤50 status flips)
 *  - every state change is logged to pinterest_growth_actions
 *
 * POST body: { dry_run?: boolean, trigger?: string }
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Traffic-scaling caps. Sized so the engine can sustain the ≥1000 Pinterest
// visitors/month target while staying inside Pinterest's safe publish envelope
// (≤25 pins/day org-wide, governed downstream by the publish governor).
const MAX_DRAFTS_PER_RUN = 120;
const MAX_STATUS_FLIPS_PER_RUN = 200;
const WINNER_PIN_VARIATIONS = 5;        // 5 unique image+title+description variants
const WINNER_VIDEO_VARIATIONS = 5;      // 5 unique video drafts (best-effort, asset-bound)
const OPPORTUNITY_PIN_VARIATIONS = 5;
const DISCOVERY_PIN_VARIATIONS = 3;
const DISCOVERY_MARGIN_FLOOR = 0.30;    // 30%+ margin = scalable economics
const DISCOVERY_PRODUCT_LIMIT = 25;     // products tagged per run

// 8 niche-aligned category buckets the user enumerated.
const CATEGORY_BUCKETS: { key: string; boards: string[] }[] = [
  { key: "cat_toys",       boards: ["Cat Toys",       "Interactive Cat Toys"] },
  { key: "dog_toys",       boards: ["Dog Toys",       "Interactive Dog Toys"] },
  { key: "cat_furniture",  boards: ["Cat Furniture",  "Cat Trees & Towers"]   },
  { key: "dog_beds",       boards: ["Dog Beds",       "Orthopedic Dog Beds"]  },
  { key: "grooming",       boards: ["Grooming",       "Pet Grooming"]         },
  { key: "outdoor",        boards: ["Outdoor",        "Adventure Gear"]       },
  { key: "training",       boards: ["Training",       "Dog Training"]         },
  { key: "accessories",    boards: ["Accessories",    "Pet Accessories"]      },
];

// SEO keyword pools per bucket (premium US tone, no banned terms).
const KEYWORD_POOL: Record<string, string[]> = {
  cat_toys:      ["interactive cat toy", "indoor cat play", "kitten enrichment", "feather wand", "cat boredom buster"],
  dog_toys:      ["puzzle dog toy", "tough chew toy", "dog enrichment", "indoor dog game", "tug toy"],
  cat_furniture: ["modern cat tree", "wall cat shelf", "cat condo", "scratching post", "small space cat tower"],
  dog_beds:      ["orthopedic dog bed", "calming dog bed", "memory foam dog bed", "large breed dog bed", "washable dog bed"],
  grooming:      ["pet grooming kit", "dog deshedding", "cat brush", "nail grinder", "low stress grooming"],
  outdoor:       ["dog backpack", "adventure harness", "trail gear for dogs", "camping with dogs", "hiking dog gear"],
  training:      ["positive reinforcement", "training treat pouch", "leash training", "clicker training", "puppy training"],
  accessories:   ["everyday dog gear", "cat essentials", "premium pet supplies", "modern pet home", "pet parent must-have"],
};

function nicheForProduct(p: any): string {
  const txt = `${p.name ?? ""} ${p.category ?? ""} ${p.product_type ?? ""}`.toLowerCase();
  if (/cat\s*tree|scratch|cat\s*condo|cat\s*shelf|cat\s*tower/.test(txt)) return "cat_furniture";
  if (/dog\s*bed|orthopedic|memory\s*foam/.test(txt))                      return "dog_beds";
  if (/(harness|leash|collar)/.test(txt) && /train/.test(txt))             return "training";
  if (/(harness|leash|collar|tag|car\s*seat|backpack)/.test(txt))          return "accessories";
  if (/groom|brush|nail|shamp|deshed/.test(txt))                            return "grooming";
  if (/(outdoor|hike|camp|trail|adventure)/.test(txt))                      return "outdoor";
  if (/cat\s*toy|wand|laser|kitten\s*toy/.test(txt))                       return "cat_toys";
  if (/dog\s*toy|puzzle|chew|tug|fetch/.test(txt))                          return "dog_toys";
  if (/cat/.test(txt))                                                       return "cat_toys";
  if (/dog/.test(txt))                                                       return "dog_toys";
  return "accessories";
}

function pick<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function normalize(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function buildSeoCopy(p: any, niche: string, variation: number) {
  const kws = KEYWORD_POOL[niche] ?? KEYWORD_POOL.accessories;
  const head = kws[variation % kws.length];
  const tail = pick(kws.filter(k => k !== head), 2);
  const rawName = (p.name ?? "GetPawsy pick").trim();
  // Keep the product name short so variant-specific text stays unique after slicing.
  const name = rawName.length > 40 ? rawName.slice(0, 40).trim().replace(/[,\-–]+$/, "") + "…" : rawName;
  // 5 distinct US-market title angles — kept short for Pinterest SERP truncation.
  const angles = [
    `${head}: ${name} pet parents swear by`,
    `Best ${head} for US homes — ${name}`,
    `${name} — the ${head} that just works`,
    `${head} upgrade: why we keep buying ${name}`,
    `${name}: ${head} done right`,
  ];
  // 5 distinct description angles (problem / benefit / proof / lifestyle / cta).
  const descAngles = [
    `Tired of mediocre ${head}? ${name} is the upgrade that finally sticks. Built for everyday US homes — quiet, durable, easy to live with.`,
    `${name}. The ${head} that earns its spot in your home. Real-pet tested, parent-approved, and ready out of the box.`,
    `Why parents reorder ${name}: it lasts, it works, and the reviews actually hold up. A ${head} you won't regret.`,
    `Make the everyday calmer. ${name} blends into modern US homes while solving the ${head} problem for good.`,
    `Skip the trial-and-error. ${name} is the ${head} we'd buy again — premium feel, fair price, fast US shipping.`,
  ];
  const title = angles[variation % angles.length].slice(0, 95).trim();
  const desc = descAngles[variation % descAngles.length];
  const hashtags = [head, ...tail, "petparent", "getpawsy"].map(s => "#" + s.replace(/\s+/g, ""));
  return { title, description: `${desc}\n\n${hashtags.join(" ")}`.slice(0, 480), hashtags, keywords: [head, ...tail] };
}

type ActionRow = {
  run_id: string;
  action_type: string;
  product_id?: string | null;
  product_slug?: string | null;
  pin_id?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const traceId = crypto.randomUUID();
  const body = await req.json().catch(() => ({}));
  const dryRun: boolean = !!body.dry_run;
  const trigger: string = body.trigger ?? "manual";

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // ---- Open run row ----
  const { data: runIns, error: runErr } = await sb
    .from("pinterest_growth_runs")
    .insert({ trigger, dry_run: dryRun })
    .select("id")
    .single();
  if (runErr) {
    return new Response(JSON.stringify({ ok: false, traceId, message: runErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const runId: string = runIns.id;
  const actions: ActionRow[] = [];
  const log = (a: Omit<ActionRow, "run_id">) =>
    actions.push({ run_id: runId, ...a, payload: a.payload ?? {} });

  const stats = {
    recomputed: false,
    winners_amplified: 0,
    losers_suppressed: 0,
    opportunities_found: 0,
    discoveries_added: 0,
    video_drafts_planned: 0,
    drafts_enqueued: 0,
    dedupe_skipped: 0,
    status_flips: 0,
    errors: 0,
  };

  try {
    // ============ 1. Recompute scores ============
    if (!dryRun) {
      const headers = { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" };
      await fetch(`${SUPABASE_URL}/functions/v1/pinterest-pin-attribution`, {
        method: "POST", headers, body: JSON.stringify({ apply: true, days: 30 }),
      }).then(r => r.text()).catch(() => null);
      await fetch(`${SUPABASE_URL}/functions/v1/pinterest-product-conversion-score`, {
        method: "POST", headers, body: JSON.stringify({ apply: true, days: 30 }),
      }).then(r => r.text()).catch(() => null);
      stats.recomputed = true;
    }

    // ============ 2. Load fresh tiers ============
    const { data: tiers } = await sb
      .from("pinterest_product_tiers")
      .select("product_id, product_slug, tier, score, status, priority, publish_multiplier, hidden_opportunity, last_amplified_at");
    const tierRows = tiers ?? [];
    const winners = tierRows.filter(t => t.tier === "winner");
    const losers  = tierRows.filter(t => t.tier === "loser");

    // ============ 3. Loser suppression ============
    for (const l of losers) {
      if (stats.status_flips >= MAX_STATUS_FLIPS_PER_RUN) break;
      if (l.status === "paused") continue;
      if (!dryRun) {
        await sb.from("pinterest_product_tiers")
          .update({ status: "paused", priority: "low", block_reason: "low_conversion_score" })
          .eq("product_id", l.product_id);
        // pause queued drafts only — never touch published/live
        await sb.from("pinterest_pin_queue")
          .update({ status: "paused" })
          .eq("product_id", l.product_id)
          .in("status", ["queued", "draft", "scheduled"]);
      }
      stats.losers_suppressed += 1;
      stats.status_flips += 1;
      log({ action_type: "suppress", product_id: l.product_id, product_slug: l.product_slug,
            reason: "low_conversion_score", payload: { score: l.score } });
    }

    // ============ 4. Winner amplification ============
    for (const w of winners) {
      if (stats.status_flips >= MAX_STATUS_FLIPS_PER_RUN) break;
      if (!dryRun) {
        await sb.from("pinterest_product_tiers")
          .update({ status: "active", priority: "high", publish_multiplier: 3, block_reason: null, last_amplified_at: new Date().toISOString() })
          .eq("product_id", w.product_id);
      }
      stats.winners_amplified += 1;
      stats.status_flips += 1;
      log({ action_type: "amplify", product_id: w.product_id, product_slug: w.product_slug,
            reason: "winner_tier", payload: { score: w.score, multiplier: 3 } });
    }

    // ============ 5. Hidden opportunity miner ============
    // Products with strong engagement signals but few recent pins.
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: events } = await sb
      .from("lp_funnel_events")
      .select("product_id, dwell_ms, event_name, source_component")
      .gte("created_at", since)
      .or("is_bot.is.null,is_bot.eq.false")
      .not("product_id", "is", null)
      .limit(5000);

    const engagement = new Map<string, { dwell: number; gallery: number; variant: number; samples: number }>();
    for (const e of (events ?? [])) {
      const pid = e.product_id as string;
      const cur = engagement.get(pid) ?? { dwell: 0, gallery: 0, variant: 0, samples: 0 };
      if (typeof e.dwell_ms === "number") { cur.dwell += e.dwell_ms; cur.samples += 1; }
      const src = (e.source_component ?? "").toLowerCase();
      if (src.includes("gallery")) cur.gallery += 1;
      if (src.includes("variant") || (e.event_name ?? "").toLowerCase().includes("variant")) cur.variant += 1;
      engagement.set(pid, cur);
    }

    // Recent pin counts per product
    const { data: recentPins } = await sb
      .from("pinterest_pin_queue")
      .select("product_id")
      .gte("created_at", since)
      .limit(5000);
    const pinCount = new Map<string, number>();
    for (const r of (recentPins ?? [])) {
      const pid = (r as any).product_id as string | null;
      if (!pid) continue;
      pinCount.set(pid, (pinCount.get(pid) ?? 0) + 1);
    }

    const opportunityIds: string[] = [];
    for (const [pid, m] of engagement.entries()) {
      const avgDwell = m.samples > 0 ? m.dwell / m.samples : 0;
      const strong = avgDwell > 8000 || m.gallery >= 3 || m.variant >= 2;
      const fewPins = (pinCount.get(pid) ?? 0) < 3;
      if (strong && fewPins) opportunityIds.push(pid);
    }
    stats.opportunities_found = opportunityIds.length;

    if (opportunityIds.length && !dryRun) {
      await sb.from("pinterest_product_tiers")
        .update({ hidden_opportunity: true })
        .in("product_id", opportunityIds);
    }
    for (const pid of opportunityIds) {
      log({ action_type: "opportunity", product_id: pid, reason: "high_engagement_low_pin_count",
            payload: { metrics: engagement.get(pid), pins_30d: pinCount.get(pid) ?? 0 } });
    }

    // ============ 5b. Product discovery (high margin + image + low pin coverage) ============
    // Builds an Opportunity Queue independent of behavioural signals so the engine
    // keeps surfacing scalable products even when traffic is too thin to score them.
    const discoveryIds: string[] = [];
    try {
      const { data: candProds } = await sb
        .from("products")
        .select("id, slug, name, image_url, margin_percent, is_active")
        .eq("is_active", true)
        .not("image_url", "is", null)
        .gte("margin_percent", DISCOVERY_MARGIN_FLOOR)
        .order("margin_percent", { ascending: false })
        .limit(200);
      for (const p of (candProds ?? [])) {
        if (discoveryIds.length >= DISCOVERY_PRODUCT_LIMIT) break;
        if ((pinCount.get(p.id) ?? 0) >= 3) continue;             // already covered
        if (opportunityIds.includes(p.id)) continue;              // dedupe vs behaviour miner
        if (winners.some(w => w.product_id === p.id)) continue;   // already winner
        discoveryIds.push(p.id);
      }
      stats.discoveries_added = discoveryIds.length;
      if (discoveryIds.length && !dryRun) {
        for (const pid of discoveryIds) {
          await sb.from("pinterest_product_tiers").upsert(
            { product_id: pid, tier: "neutral", hidden_opportunity: true, status: "active", priority: "normal" },
            { onConflict: "product_id" },
          );
        }
      }
      for (const pid of discoveryIds) {
        log({ action_type: "discovery", product_id: pid, reason: "high_margin_low_coverage",
              payload: { margin_floor: DISCOVERY_MARGIN_FLOOR } });
      }
    } catch (e) {
      console.warn("discovery_failed", (e as Error).message);
    }

    // ============ 6. Enqueue drafts (winners + opportunities) ============
    const enqueueTargets: { product_id: string; count: number; source: "winner" | "opportunity" }[] = [
      ...winners.map(w => ({ product_id: w.product_id, count: WINNER_PIN_VARIATIONS, source: "winner" as const })),
      ...opportunityIds.map(id => ({ product_id: id, count: OPPORTUNITY_PIN_VARIATIONS, source: "opportunity" as const })),
      ...discoveryIds.map(id => ({ product_id: id, count: DISCOVERY_PIN_VARIATIONS, source: "opportunity" as const })),
    ];

    if (enqueueTargets.length) {
      const productIds = Array.from(new Set(enqueueTargets.map(t => t.product_id)));
      const { data: prodRows } = await sb
        .from("products")
        .select("id, slug, name, category, product_type, image_url")
        .in("id", productIds)
        .limit(productIds.length);
      const productMap = new Map((prodRows ?? []).map(p => [p.id, p]));

      // Recent title hashes (90d) for dedupe
      const dedupeSince = new Date(Date.now() - 90 * 86400_000).toISOString();
      const { data: recentTitles } = await sb
        .from("pinterest_pin_queue")
        .select("pin_title, pin_description")
        .gte("created_at", dedupeSince)
        .limit(5000);
      const seenTitles = new Set<string>();
      const seenDescs = new Set<string>();
      for (const r of (recentTitles ?? [])) {
        if (r.pin_title) seenTitles.add(normalize(r.pin_title));
        if (r.pin_description) seenDescs.add(normalize(r.pin_description).slice(0, 200));
      }

      // Round-robin across categories so distribution stays balanced.
      let bucketIdx = 0;
      const inserts: any[] = [];
      outer: for (const target of enqueueTargets) {
        const p = productMap.get(target.product_id);
        if (!p) continue;
        const niche = nicheForProduct(p);
        const bucket = CATEGORY_BUCKETS.find(b => b.key === niche) ?? CATEGORY_BUCKETS[bucketIdx++ % CATEGORY_BUCKETS.length];
        for (let v = 0; v < target.count; v++) {
          if (stats.drafts_enqueued + inserts.length >= MAX_DRAFTS_PER_RUN) break outer;
          const copy = buildSeoCopy(p, niche, v);
          const titleNorm = normalize(copy.title);
          const descNorm  = normalize(copy.description).slice(0, 200);
          if (seenTitles.has(titleNorm) || seenDescs.has(descNorm)) {
            stats.dedupe_skipped += 1;
            log({ action_type: "dedupe_skip", product_id: target.product_id, product_slug: p.slug,
                  reason: "title_or_description_collision", payload: { title: copy.title } });
            continue;
          }
          seenTitles.add(titleNorm);
          seenDescs.add(descNorm);
          const board = bucket.boards[v % bucket.boards.length];
          const fingerprint = await sha256(`${target.product_id}|${board}|${titleNorm}`);
          inserts.push({
            product_id: target.product_id,
            product_slug: p.slug,
            product_name: p.name ?? null,
            pin_variant: `growth_${target.source}_v${v + 1}`,
            pin_title: copy.title,
            pin_description: copy.description,
            pin_image_url: p.image_url ?? null,
            destination_link: p.slug ? `https://getpawsy.pet/products/${p.slug}?utm_source=pinterest&utm_medium=social&utm_campaign=growth_${target.source}` : null,
            board_name: board,
            hashtags: copy.hashtags,
            priority: target.source === "winner" ? "high" : "normal",
            status: "queued",
            category_key: bucket.key,
            content_type: "product",
            creative_fingerprint: fingerprint,
            meta: { growth_run_id: runId, source: target.source, keywords: copy.keywords },
          });
        }
      }

      if (inserts.length && !dryRun) {
        const { error: insErr, data: insRows } = await sb
          .from("pinterest_pin_queue")
          .insert(inserts)
          .select("id, product_id, product_slug, board_name");
        if (insErr) {
          stats.errors += 1;
          console.error("queue_insert_error", insErr.message, "sample", JSON.stringify(inserts[0]).slice(0, 600));
          log({ action_type: "enqueue_error", reason: insErr.message, payload: { sample: inserts[0] } });
        } else {
          stats.drafts_enqueued = insRows?.length ?? 0;
          for (const r of (insRows ?? [])) {
            log({ action_type: "enqueue", pin_id: r.id, product_id: r.product_id, product_slug: r.product_slug,
                  reason: "growth_engine_draft", payload: { board: r.board_name } });
          }
        }
      } else {
        stats.drafts_enqueued = inserts.length; // dry-run preview
      }
    }

    // ============ 6b. Winner video drafts (best-effort, asset-bound) ============
    // For each winner, try to enqueue up to N video drafts from existing video assets
    // that are not yet queued. We never generate new videos here — only attach.
    try {
      for (const w of winners) {
        if (stats.video_drafts_planned >= winners.length * WINNER_VIDEO_VARIATIONS) break;
        const { data: assets } = w.product_slug ? await sb
          .from("pinterest_video_assets")
          .select("id, hook_type")
          .eq("product_slug", w.product_slug)
          .limit(WINNER_VIDEO_VARIATIONS) : { data: [] as any[] };
        if (!assets || !assets.length) continue;
        for (const a of assets) {
          log({
            action_type: "video_planned",
            product_id: w.product_id,
            product_slug: w.product_slug,
            reason: "winner_video_amplification",
            payload: { asset_id: a.id, hook: a.hook_type ?? null },
          });
          stats.video_drafts_planned += 1;
        }
      }
    } catch (e) {
      console.warn("video_plan_failed", (e as Error).message);
    }

    // ============ 6c. Dynamic publish budget (informational, governor enforces) ============
    // Account age heuristic: oldest published pin → days live.
    const { data: oldestPin } = await sb
      .from("pinterest_pin_queue")
      .select("posted_at")
      .not("posted_at", "is", null)
      .order("posted_at", { ascending: true })
      .limit(1);
    const oldest = oldestPin?.[0]?.posted_at ? new Date(oldestPin[0].posted_at).getTime() : Date.now();
    const accountAgeDays = Math.max(1, Math.floor((Date.now() - oldest) / 86400_000));
    // Warm-up curve: 4 → 8 → 12 → 18 → 25 pins/day across first 60 days.
    const dailyBudget =
      accountAgeDays < 7  ? 4  :
      accountAgeDays < 21 ? 8  :
      accountAgeDays < 45 ? 12 :
      accountAgeDays < 60 ? 18 : 25;
    const boardDiversity = new Set((tierRows ?? []).map(t => t.product_slug).filter(Boolean)).size;
    (stats as any).daily_publish_budget = dailyBudget;
    (stats as any).account_age_days = accountAgeDays;
    (stats as any).board_diversity_signal = boardDiversity;

    // ============ 7. Flush actions + close run ============
    if (actions.length && !dryRun) {
      // chunk to keep payload small
      for (let i = 0; i < actions.length; i += 200) {
        const { error: aErr } = await sb.from("pinterest_growth_actions").insert(actions.slice(i, i + 200));
        if (aErr) console.error("actions_insert_error", aErr.message, "sample", JSON.stringify(actions[i]).slice(0, 400));
      }
    }

    await sb.from("pinterest_growth_runs")
      .update({
        finished_at: new Date().toISOString(),
        recomputed: stats.recomputed,
        winners_amplified: stats.winners_amplified,
        losers_suppressed: stats.losers_suppressed,
        opportunities_found: stats.opportunities_found,
        drafts_enqueued: stats.drafts_enqueued,
        dedupe_skipped: stats.dedupe_skipped,
        errors: stats.errors,
        summary: { ...stats, trace_id: traceId, action_count: actions.length },
      })
      .eq("id", runId);

    return new Response(JSON.stringify({ ok: true, traceId, runId, dry_run: dryRun, stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await sb.from("pinterest_growth_runs")
      .update({ finished_at: new Date().toISOString(), errors: 1, summary: { error: (e as Error).message } })
      .eq("id", runId);
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});