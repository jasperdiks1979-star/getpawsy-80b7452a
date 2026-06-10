import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DiversityGuard, normaliseCategoryKey, scoreVariety } from "../_shared/pinterest-diversity-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BANNED_PHRASES = [
  "stop scooping every day",
  "stop scooping so much",
  "see the setup",
  "shop the upgrade",
  "this changed everything for cat owners",
  "this changed everything for pet owners",
];

// Generic CTA verbs/openers that read like ad-template filler instead of
// product-specific benefit copy. Matched at the START of the line (case-insensitive)
// so "Find your calm" is rejected but "Calm rides, every time" is fine.
const GENERIC_CTA_PATTERNS: RegExp[] = [
  /^\s*see the\b/i,
  /^\s*shop the\b/i,
  /^\s*shop\b/i,
  /^\s*compare\b/i,
  /^\s*take the\b/i,
  /^\s*claim the\b/i,
  /^\s*claim\b/i,
  /^\s*reserve\b/i,
  /^\s*find\b/i,
  /^\s*build\b/i,
  /^\s*tour\b/i,
  /^\s*pick\b/i,
  /^\s*get the\b/i,
  /^\s*grab\b/i,
  /^\s*explore\b/i,
  /^\s*discover\b/i,
];

function containsGenericCta(text: string): string | null {
  const lines = String(text || "").split(/[•\n\r]+/);
  for (const line of lines) {
    for (const re of GENERIC_CTA_PATTERNS) {
      if (re.test(line)) return line.trim().slice(0, 80);
    }
  }
  return null;
}

const POOL_CATEGORIES = ["cat_trees", "carriers", "dog_beds", "litter", "toys", "cat_essentials"] as const;
type PoolCategory = typeof POOL_CATEGORIES[number];
type Species = "cat" | "dog" | "any";

function speciesFromProduct(trueCategory: string | null | undefined, slug: string): Species {
  const c = (trueCategory || "").toLowerCase();
  const s = (slug || "").toLowerCase();
  if (/cat|kitten|litter/.test(c)) return "cat";
  if (/dog|puppy/.test(c)) return "dog";
  if (/\bcat\b|kitten|litter|sisal|scratch/.test(s)) return "cat";
  if (/\bdog\b|puppy|canine/.test(s)) return "dog";
  return "any";
}

// Reject copy text that names the WRONG species for the destination product.
function speciesConflict(text: string, species: Species): boolean {
  if (species === "any") return false;
  const t = (text || "").toLowerCase();
  if (species === "cat" && /\b(dog|dogs|puppy|puppies|canine)\b/.test(t)) return true;
  if (species === "dog" && /\b(cat|cats|kitten|kittens|feline)\b/.test(t)) return true;
  return false;
}

// Map a product's REAL (Shopify-style) category name to a creative-pool bucket.
// This is destination-product driven — it ignores any audit category_key.
function poolFromTrueCategory(trueCategory: string | null | undefined, slug: string): PoolCategory {
  const c = (trueCategory || "").toLowerCase();
  const s = (slug || "").toLowerCase();

  if (/litter/.test(c)) return "litter";
  if (/(cat tree|condo|cat furniture|scratch)/.test(c)) return "cat_trees";
  if (/dog bed|orthopedic/.test(c)) return "dog_beds";
  if (/carrier|travel|car seat|stroller/.test(c)) return "carriers";
  if (/toy/.test(c)) {
    // toys can be cat or dog — let slug decide
    if (/cat|kitten/.test(s)) return "toys";
    if (/dog|puppy/.test(s)) return "toys";
    return "toys";
  }
  if (/bowl|fountain|feeder/.test(c)) return "cat_essentials";
  if (/cat/.test(c)) return "cat_essentials";
  // No cat/dog match — fall back to slug heuristics
  if (/litter|scoop/.test(s)) return "litter";
  if (/carrier|stroller|car[-_]?seat/.test(s)) return "carriers";
  if (/dog.*bed|orthopedic/.test(s)) return "dog_beds";
  if (/tree|tower|condo|perch|scratch|climb/.test(s)) return "cat_trees";
  if (/toy|wand|ball|teaser|tunnel|chew/.test(s)) return "toys";
  if (/dog|puppy/.test(s)) return "dog_beds"; // safer than cat_*
  return "cat_essentials";
}

function extractSlugFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/(?:products|lp)\/([^\/?#]+)/);
    return m ? m[1] : null;
  } catch {
    const m = String(url).match(/\/(?:products|lp)\/([^\/?#]+)/);
    return m ? m[1] : null;
  }
}

function containsBanned(text: string): string | null {
  const t = (text || "").toLowerCase();
  for (const p of BANNED_PHRASES) if (t.includes(p)) return p;
  return null;
}

function pickFresh(
  guard: DiversityGuard,
  category: PoolCategory,
  type: "headline" | "cta" | "hook" | "angle" | "benefit",
  species: Species,
): string | null {
  // Try up to 12 times to land a species-appropriate, non-banned pick.
  for (let i = 0; i < 12; i++) {
    const v = guard.pickFromPool(category, type);
    if (!v) return null;
    if (type === "headline" || type === "cta" || type === "hook") {
      if (containsBanned(v)) continue;
      if (containsGenericCta(v)) continue;
    }
    if (speciesConflict(v, species)) continue;
    return v;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const previewLimit = Math.max(1, Math.min(100, Number(url.searchParams.get("preview") || "25")));

  const guard = new DiversityGuard();
  await guard.load(supabase);

  // 1. Load all done queue rows + their drafts.
  const { data: queue, error: qErr } = await supabase
    .from("pinterest_live_pin_repair_queue")
    .select("id, pin_queue_id, pinterest_pin_id, product_slug, category_key, board_name, destination_link, overlay_text, pin_title, hook_group, severity, violation_types, details, status")
    .eq("status", "done")
    .order("severity", { ascending: false })
    .order("created_at", { ascending: true });

  if (qErr) {
    return new Response(JSON.stringify({ ok: false, error: qErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Resolve destination products (the ground truth).
  const destSlugs = new Set<string>();
  for (const r of queue ?? []) {
    const s = extractSlugFromUrl(r.destination_link) || r.product_slug;
    if (s) destSlugs.add(s);
  }
  const { data: products } = await supabase
    .from("products")
    .select("id, slug, name, category")
    .in("slug", [...destSlugs]);
  const productBySlug = new Map<string, any>();
  for (const p of products ?? []) productBySlug.set(p.slug, p);

  // 3. Pull replacement drafts in one batch.
  const draftIds = (queue ?? [])
    .map((r: any) => r.details?.replacement_draft_id)
    .filter(Boolean);
  const { data: drafts } = await supabase
    .from("pinterest_pin_queue")
    .select("id, product_id, product_slug, destination_link, category_key, pin_title, overlay_text, status, board_id, board_name")
    .in("id", draftIds.length ? draftIds : ["00000000-0000-0000-0000-000000000000"]);
  const draftById = new Map<string, any>();
  for (const d of drafts ?? []) draftById.set(d.id, d);

  // 4. Resolve boards.
  const boards = [...new Set((queue ?? []).map((r) => r.board_name).filter(Boolean))];
  const { data: boardRows } = await supabase
    .from("pinterest_boards")
    .select("id, name")
    .in("name", boards.length ? boards : ["__none__"]);
  const boardIdByName = new Map<string, string>();
  for (const b of boardRows ?? []) if (b.name && b.id) boardIdByName.set(b.name, b.id);

  let audited = 0;
  let rejected = 0;
  let regenerated = 0;
  let skippedNoProduct = 0;
  let skippedPoolExhausted = 0;

  const mismatches: any[] = [];

  for (const row of queue ?? []) {
    audited++;
    const destSlug = extractSlugFromUrl(row.destination_link) || row.product_slug;
    const destProduct = destSlug ? productBySlug.get(destSlug) : null;
    if (!destProduct) { skippedNoProduct++; continue; }

    const correctCategory = poolFromTrueCategory(destProduct.category, destProduct.slug);
    const storedCategory = (row.details as any)?.replacement_category as string | undefined;
    const species = speciesFromProduct(destProduct.category, destProduct.slug);

    const draftId = (row.details as any)?.replacement_draft_id;
    const draft = draftId ? draftById.get(draftId) : null;

    const draftText = `${draft?.pin_title || ""} ${draft?.overlay_text || ""}`;
    const draftSpeciesBad = draft ? speciesConflict(draftText, species) : false;
    const draftGenericBad = draft ? containsGenericCta(draftText) : null;
    const draftBannedBad = draft ? containsBanned(draftText) : null;
    const categoryBad = !storedCategory || normaliseCategoryKey(storedCategory) !== correctCategory;

    // If category, species, generic-CTA and banned-phrase checks all pass, leave it.
    if (!categoryBad && !draftSpeciesBad && !draftGenericBad && !draftBannedBad) continue;

    mismatches.push({
      queue_id: row.id,
      pinterest_pin_id: row.pinterest_pin_id,
      destination_slug: destSlug,
      destination_true_category: destProduct.category,
      destination_species: species,
      stored_replacement_category: storedCategory ?? null,
      correct_pool_category: correctCategory,
      reason: categoryBad
        ? "category_mismatch"
        : draftSpeciesBad
        ? "species_mismatch"
        : draftGenericBad
        ? `generic_cta:${draftGenericBad}`
        : `banned_phrase:${draftBannedBad}`,
      old_headline: draft?.pin_title ?? null,
      old_overlay: draft?.overlay_text ?? null,
      old_draft_id: draftId ?? null,
    });

    if (dryRun) continue;

    // Reject the old draft.
    if (draft && draft.status === "draft") {
      await supabase
        .from("pinterest_pin_queue")
        .update({
          status: "rejected",
          rejection_reason: categoryBad
            ? `destination_url_category_mismatch: dest=${destProduct.category} (${correctCategory}) vs stored=${storedCategory}`
            : draftSpeciesBad
            ? `species_mismatch: dest_species=${species} vs draft="${draftText.trim().slice(0, 120)}"`
            : draftGenericBad
            ? `generic_cta_phrase: "${draftGenericBad}"`
            : `banned_phrase: "${draftBannedBad}"`,
        })
        .eq("id", draftId);
    }
    rejected++;

    // Regenerate using the CORRECT category, with destination-product as ground truth.
    const headline = pickFresh(guard, correctCategory, "headline", species);
    const cta = pickFresh(guard, correctCategory, "cta", species);
    const hook = pickFresh(guard, correctCategory, "hook", species);
    const angle = pickFresh(guard, correctCategory, "angle", species);
    const benefit = pickFresh(guard, correctCategory, "benefit", species);

    if (!headline || !cta) { skippedPoolExhausted++; continue; }
    const combined = `${headline} ${cta} ${hook || ""} ${angle || ""} ${benefit || ""}`;
    if (containsBanned(combined)) { skippedPoolExhausted++; continue; }
    if (containsGenericCta(`${headline} • ${cta}`)) { skippedPoolExhausted++; continue; }
    if (speciesConflict(combined, species)) { skippedPoolExhausted++; continue; }

    const candidate = { headline, cta, hook, angle, benefit };
    const evalRes = guard.evaluate(candidate, correctCategory);
    if (!evalRes.ok) { skippedPoolExhausted++; continue; }
    const final = evalRes.final;
    const variety = scoreVariety(guard, final);
    if (variety.total < 75) { skippedPoolExhausted++; continue; }

    const overlay = `${final.headline} • ${final.cta}`;
    const pinTitle = final.headline.slice(0, 100);
    const pinDescription = [final.headline, final.hook || final.angle || "", final.benefit || ""]
      .filter(Boolean).join(" — ").slice(0, 480);

    const insertRow = {
      product_id: destProduct.id,
      product_slug: destProduct.slug,
      product_name: destProduct.name,
      pin_variant: "live_repair_replacement_v2",
      pin_title: pinTitle,
      pin_description: pinDescription,
      destination_link: row.destination_link,
      board_name: row.board_name || "Smart Pet Gadgets",
      board_id: boardIdByName.get(row.board_name || "") || null,
      priority: "high",
      status: "draft",
      hook_group: final.hook || null,
      category_key: correctCategory,
      overlay_text: overlay,
      content_type: "product",
      qa_reasons: [],
      replacement_for_pin_id: row.pin_queue_id || null,
      repair_strategy: "live_pin_category_repair_v2",
      meta: {
        live_repair: true,
        repair_queue_id: row.id,
        original_pinterest_pin_id: row.pinterest_pin_id,
        original_pin_title: row.pin_title,
        original_violations: row.violation_types,
        severity: row.severity,
        variety_score: variety.total,
        category: correctCategory,
        revalidated: true,
        destination_species: species,
        previous_replacement_category: storedCategory,
        creative: { headline: final.headline, cta: final.cta, hook: final.hook, angle: final.angle, benefit: final.benefit },
      },
    };

    const { data: ins, error: insErr } = await supabase
      .from("pinterest_pin_queue")
      .insert(insertRow)
      .select("id")
      .single();
    if (insErr) continue;

    await supabase
      .from("pinterest_live_pin_repair_queue")
      .update({
        details: {
          ...((row as any).details || {}),
          replacement_draft_id: ins!.id,
          replacement_category: correctCategory,
          replacement_variety_score: variety.total,
          revalidated_at: new Date().toISOString(),
          previous_replacement_draft_id: draftId ?? null,
          previous_replacement_category: storedCategory ?? null,
          destination_true_category: destProduct.category,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    guard.register(final, correctCategory);
    regenerated++;
  }

  // 5. Build preview of first N corrected/validated drafts.
  const { data: previewRows } = await supabase
    .from("pinterest_live_pin_repair_queue")
    .select("id, pinterest_pin_id, destination_link, severity, details, pin_title, overlay_text")
    .eq("status", "done")
    .order("severity", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(previewLimit);

  const previewDraftIds = (previewRows ?? [])
    .map((r: any) => r.details?.replacement_draft_id)
    .filter(Boolean);
  const { data: previewDrafts } = await supabase
    .from("pinterest_pin_queue")
    .select("id, product_slug, category_key, pin_title, overlay_text, destination_link, status")
    .in("id", previewDraftIds.length ? previewDraftIds : ["00000000-0000-0000-0000-000000000000"]);
  const pdMap = new Map<string, any>();
  for (const d of previewDrafts ?? []) pdMap.set(d.id, d);

  const preview = (previewRows ?? []).map((r: any) => {
    const d = pdMap.get(r.details?.replacement_draft_id);
    const destSlug = extractSlugFromUrl(r.destination_link);
    const destProduct = destSlug ? productBySlug.get(destSlug) : null;
    const species = destProduct ? speciesFromProduct(destProduct.category, destProduct.slug) : "any";
    const correctPool = destProduct ? poolFromTrueCategory(destProduct.category, destProduct.slug) : null;
    const newText = `${d?.pin_title || ""} ${d?.overlay_text || ""}`;
    const flags = {
      category_mismatch: !!(correctPool && d?.category_key && normaliseCategoryKey(d.category_key) !== correctPool),
      species_mismatch: speciesConflict(newText, species),
      banned_phrase: containsBanned(newText),
      generic_cta: containsGenericCta(newText),
    };
    return {
      old_pin_id: r.pinterest_pin_id,
      destination_link: r.destination_link,
      destination_true_category: r.details?.destination_true_category ?? null,
      replacement_category: r.details?.replacement_category ?? null,
      old_headline: r.pin_title,
      old_overlay: r.overlay_text,
      new_headline: d?.pin_title ?? null,
      new_overlay: d?.overlay_text ?? null,
      draft_status: d?.status ?? "missing",
      verification: flags,
    };
  });

  const verification = {
    rows: preview.length,
    category_mismatches: preview.filter((p: any) => p.verification.category_mismatch).length,
    species_mismatches: preview.filter((p: any) => p.verification.species_mismatch).length,
    banned_phrases: preview.filter((p: any) => p.verification.banned_phrase).length,
    generic_cta_phrases: preview.filter((p: any) => p.verification.generic_cta).length,
  };

  return new Response(JSON.stringify({
    ok: true,
    audited,
    mismatched: mismatches.length,
    rejected,
    regenerated,
    skippedNoProduct,
    skippedPoolExhausted,
    dryRun,
    mismatches: mismatches.slice(0, 50),
    preview,
    verification,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});