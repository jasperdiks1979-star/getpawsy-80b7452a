// pinterest-warmup-orchestrator
// Selects top 50 products from 5 priority categories and populates
// pinterest_pin_queue with DRAFT rows on a 30-day warm-up schedule.
// Uses existing product imagery — no AI rendering, no auto-publish.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const CATEGORIES = [
  "Dog Toys",
  "Cat Trees & Condos",
  "Cat Litter Boxes",
  "Dog Beds",
  "Dog Collars & Leashes",
] as const;

// 50 picks split proportionally to inventory pool.
const CATEGORY_QUOTA: Record<string, number> = {
  "Dog Toys": 15,
  "Cat Trees & Condos": 12,
  "Cat Litter Boxes": 9,
  "Dog Beds": 8,
  "Dog Collars & Leashes": 6,
};

// Board routing (verified non-sandbox boards from pinterest_boards).
const FALLBACK_BOARD_ID = "1117103951261604186"; // GetPawsy Products (production_verified)
const CATEGORY_BOARD: Record<string, string> = {
  "Dog Toys": "1117103951261596364",            // Smart Pet Gadgets
  "Cat Trees & Condos": "1117103951261557912", // Cat Furniture
  "Cat Litter Boxes": "1117103951261590978",   // Cat Care Essentials (verified)
  "Dog Beds": "1117103951261644879",           // Luxury Pet Beds
  "Dog Collars & Leashes": "1117103951261644756", // Dog Walking Essentials
};

// Headline / hook libraries — US-focused, merchant-safe.
const HOOKS: Record<string, string[]> = {
  "Dog Toys": [
    "The toy our pack can't stop chasing",
    "Bored dog? Try this instead",
    "5 minutes of play, hours of calm",
  ],
  "Cat Trees & Condos": [
    "Where indoor cats actually relax",
    "The condo that fits any apartment",
    "Climbing, scratching, napping — sorted",
  ],
  "Cat Litter Boxes": [
    "Goodbye, smelly corner",
    "A litter setup guests won't notice",
    "The cleanup our cats agree on",
  ],
  "Dog Beds": [
    "Where senior joints finally rest",
    "The bed our dog picks every night",
    "Calmer evenings start here",
  ],
  "Dog Collars & Leashes": [
    "Walks worth looking forward to",
    "No more tangled, frayed leashes",
    "The everyday set US dog parents trust",
  ],
};

const CTA_OVERLAYS = ["Shop now", "See it in action", "Bring it home", "Get yours", "Discover more"];

// 30-day warm-up cadence: pins per day per week.
const WARMUP_DAILY = [4, 4, 4, 4, 4, 4, 4, 8, 8, 8, 8, 8, 8, 8, 12, 12, 12, 12, 12, 12, 12, 20, 20, 20, 20, 20, 20, 20, 20, 20];
const US_PRIME_HOURS_ET = [9, 12, 15, 18, 20, 21]; // varied US ET windows

function pickBoard(category: string): string {
  return CATEGORY_BOARD[category] || FALLBACK_BOARD_ID;
}

function detectHook(category: string, idx: number): string {
  const list = HOOKS[category] || ["Made for pet parents"];
  return list[idx % list.length];
}

function buildDescription(name: string, category: string, hook: string): string {
  return [
    hook + ".",
    `${name} — fast US shipping, in stock now.`,
    "Tap the pin to see details and reviews.",
    `#${category.replace(/[^a-z]+/gi, "")} #PetParents #PetCare #USA`,
  ].join(" ");
}

function predictedCtr(product: any, hookIndex: number): number {
  // Lightweight prediction: shipping_score + stock depth + hook freshness.
  const ship = Number(product.shipping_score || 0);
  const stockBoost = Math.min(20, Math.log10((product.stock || 1) + 1) * 10);
  const hookBoost = [12, 8, 6, 4, 2][hookIndex] ?? 0;
  // Range 0-100, mapped to a CTR-style 0-5% prediction.
  const raw = ship * 0.6 + stockBoost + hookBoost;
  return Math.max(0.8, Math.min(5, +(raw / 25).toFixed(2)));
}

function isoSchedule(dayOffset: number, slot: number, perDay: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  // Spread `slot` over US_PRIME_HOURS_ET. ET ≈ UTC-5.
  const hourET = US_PRIME_HOURS_ET[slot % US_PRIME_HOURS_ET.length];
  const minute = Math.floor((slot / perDay) * 55);
  d.setUTCHours(hourET + 5, minute, 0, 0);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const dryRun: boolean = body?.dryRun === true;

  // 1. Pull top products per category.
  const selected: any[] = [];
  const byCategory: Record<string, any[]> = {};
  for (const cat of CATEGORIES) {
    const quota = CATEGORY_QUOTA[cat];
    const { data, error } = await supabase
      .from("products")
      .select("id, slug, name, category, image_url, shipping_score, stock")
      .eq("is_active", true)
      .eq("is_us_warehouse", true)
      .eq("is_fast_shipping", true)
      .gt("stock", 0)
      .eq("category", cat)
      .not("image_url", "is", null)
      .order("shipping_score", { ascending: false, nullsFirst: false })
      .order("stock", { ascending: false })
      .limit(quota);
    if (error) {
      return new Response(JSON.stringify({ ok: false, message: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    byCategory[cat] = data || [];
    selected.push(...(data || []));
  }

  // 2. Build 5 drafts per product = 3 static + 2 idea pin variants.
  type Draft = Record<string, any>;
  const drafts: Draft[] = [];
  for (const p of selected) {
    for (let i = 0; i < 5; i++) {
      const variantKind = i < 3 ? "static" : "idea";
      const hook = detectHook(p.category, i);
      const cta = CTA_OVERLAYS[i % CTA_OVERLAYS.length];
      const title = `${hook} | ${p.name}`.slice(0, 100);
      const description = buildDescription(p.name, p.category, hook).slice(0, 480);
      drafts.push({
        product_id: p.id,
        product_slug: p.slug,
        product_name: p.name,
        category_key: p.category,
        pin_variant: `warmup_${variantKind}_${i + 1}`,
        pin_title: title,
        pin_description: description,
        pin_image_url: p.image_url,
        destination_link: `https://getpawsy.pet/products/${p.slug}?utm_source=pinterest&utm_medium=pin&utm_campaign=warmup30&utm_content=${variantKind}_${i + 1}`,
        board_id: pickBoard(p.category),
        board_name: p.category,
        hashtags: [p.category.replace(/[^a-z]+/gi, ""), "PetParents", "USA", "PetCare"],
        priority: "high",
        status: "draft",
        // content_type CHECK only allows guide|comparison|lifestyle|product.
        // We tag idea-pin variants as "lifestyle" and keep variant_kind in meta.
        content_type: variantKind === "idea" ? "lifestyle" : "product",
        hook_group: hook,
        overlay_text: cta,
        us_audience_score: 0.85,
        meta: {
          source: "warmup_orchestrator",
          warmup_day_pool: true,
          hook_index: i,
          predicted_ctr_pct: predictedCtr(p, i),
          variant_kind: variantKind,
        },
        idempotency_key: `warmup30:${p.slug}:${variantKind}:${i + 1}`,
      });
    }
  }

  // 3. Schedule drafts across the 30-day warm-up.
  let cursor = 0;
  for (let day = 0; day < WARMUP_DAILY.length && cursor < drafts.length; day++) {
    const perDay = WARMUP_DAILY[day];
    for (let slot = 0; slot < perDay && cursor < drafts.length; slot++) {
      drafts[cursor].scheduled_at = isoSchedule(day + 1, slot, perDay);
      drafts[cursor].meta = { ...drafts[cursor].meta, warmup_day: day + 1, warmup_slot: slot + 1 };
      cursor++;
    }
  }

  const report = {
    selected_products: selected.length,
    by_category: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, v.length])),
    drafts_built: drafts.length,
    scheduled: cursor,
    unscheduled: drafts.length - cursor,
    top_predicted: [...drafts]
      .sort((a, b) => (b.meta.predicted_ctr_pct || 0) - (a.meta.predicted_ctr_pct || 0))
      .slice(0, 10)
      .map((d) => ({
        slug: d.product_slug,
        name: d.product_name,
        category: d.category_key,
        hook: d.hook_group,
        predicted_ctr_pct: d.meta.predicted_ctr_pct,
      })),
  };

  if (dryRun) {
    return new Response(JSON.stringify({ ok: true, dryRun: true, report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4. Insert in batches with upsert on idempotency_key.
  let inserted = 0;
  const BATCH = 50;
  for (let i = 0; i < drafts.length; i += BATCH) {
    const chunk = drafts.slice(i, i + BATCH);
    const { error, count } = await supabase
      .from("pinterest_pin_queue")
      .upsert(chunk, { onConflict: "idempotency_key", count: "exact" });
    if (error) {
      return new Response(JSON.stringify({ ok: false, message: error.message, inserted, at: i }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    inserted += count || chunk.length;
  }

  return new Response(JSON.stringify({ ok: true, inserted, report }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});