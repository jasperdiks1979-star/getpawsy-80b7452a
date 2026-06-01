// Deterministic rewriter that regenerates overlay copy using ONLY the
// detected product category. Triggered when QA flags category_match /
// category_mismatch / product_mismatch / copy_product_conflict.
//
// Rules:
//  - Re-read product name + category + tags.
//  - Strip category-specific nouns (toy, ball, scratcher, tree, bed,
//    litter box) unless they actually appear in the product haystack.
//  - Regenerate pin_title, hook_text, cta_text and scene captions from
//    the TONES preset for the detected product category.
//  - Never invents product features. Never references other categories.

import {
  detectCategory,
  shortProductNoun,
  scrubBanned,
  type Category,
  type ProductContext,
} from "./pinterest-video-meta.ts";

// Words that imply a specific product category. Each maps to the
// category it belongs to so we know when to whitelist it.
const FORBIDDEN_CATEGORY_WORDS: Array<{ word: string; re: RegExp; category: Category }> = [
  { word: "litter box", re: /\blitter\s*box(es)?\b/gi, category: "cat_litter" },
  { word: "scratcher",  re: /\bscratch(er|ing\s*post)s?\b/gi, category: "cat_tree" },
  { word: "cat tree",   re: /\bcat\s*(tree|tower|condo)s?\b/gi, category: "cat_tree" },
  { word: "bed",        re: /\bbed(s|ding)?\b/gi, category: "dog_bed" },
  { word: "ball",       re: /\bball(s)?\b/gi, category: "toy" },
  { word: "toy",        re: /\btoy(s)?\b/gi, category: "toy" },
];

// Per-category fallback templates. Mirror of TONES but kept local so the
// rewriter is self-contained and import-cycle-safe.
const TEMPLATES: Record<Category, {
  pin_title: string[];
  hook: string[];
  cta: string[];
  caption: string[];
  noun: string;
}> = {
  cat_litter: {
    pin_title: ["{product} for a Cleaner, Calmer Home", "Hands-Free {product} for Busy Cat Owners"],
    hook: ["Less daily scooping.", "A calmer cat routine."],
    cta: ["Shop on GetPawsy", "See how it works"],
    caption: ["Runs daily cycles", "App-controlled", "Less scooping", "Fresher home", "Built for indoor cats", "See it in action"],
    noun: "self-cleaning litter box",
  },
  catio: {
    pin_title: ["{product} for Safe Outdoor Time", "Outdoor Enrichment for Indoor Cats"],
    hook: ["Safe outdoor time.", "Real enrichment, no risk."],
    cta: ["Shop on GetPawsy", "See the build"],
    caption: ["Secure outdoor space", "Multi-level perches", "Weather-ready", "Safe enrichment", "Indoor-cat friendly", "Built to last"],
    noun: "outdoor catio",
  },
  cat_tree: {
    pin_title: ["{product} Built for Active Indoor Cats", "A {product} That Fits Your Home"],
    hook: ["Vertical space, finally.", "Climb. Scratch. Lounge."],
    cta: ["Shop on GetPawsy", "View details"],
    caption: ["Sturdy base", "Soft platforms", "Natural surfaces", "Multi-cat friendly", "Modern shape", "Built daily"],
    noun: "cat tree",
  },
  cat_other: {
    pin_title: ["{product} for Everyday Cat Care", "Thoughtful {product} for Indoor Cats"],
    hook: ["Everyday cat care.", "A calmer cat routine."],
    cta: ["Shop on GetPawsy", "View details"],
    caption: ["Built for indoor cats", "Everyday use", "Easy upkeep", "Calmer routine", "Modern cat home", "See details"],
    noun: "cat essential",
  },
  dog_bed: {
    pin_title: ["{product} for Calmer, Deeper Sleep", "Supportive {product} for Aging Joints"],
    hook: ["Deeper, calmer sleep.", "Real joint support."],
    cta: ["Shop on GetPawsy", "View details"],
    caption: ["Joint support", "Plush surface", "Bolstered edges", "Senior friendly", "Easy clean cover", "Built for rest"],
    noun: "orthopedic dog bed",
  },
  dog_travel: {
    pin_title: ["{product} for Stress-Free Trips", "Travel-Ready {product} for Your Dog"],
    hook: ["Stress-free trips.", "Ready for the road."],
    cta: ["Shop on GetPawsy", "View details"],
    caption: ["Travel-ready", "Mesh ventilation", "Secure design", "Easy to carry", "Built for real use", "Folds flat"],
    noun: "pet carrier",
  },
  dog_other: {
    pin_title: ["{product} for Everyday Dog Care", "Practical {product} for Real Dogs"],
    hook: ["Everyday dog care.", "A simpler routine."],
    cta: ["Shop on GetPawsy", "View details"],
    caption: ["Everyday use", "Easy upkeep", "Built for real dogs", "Modern dog home", "Reliable", "See details"],
    noun: "dog essential",
  },
  pet_tech: {
    pin_title: ["Smart {product} for Modern Pet Homes", "{product} You Can Control From Your Phone"],
    hook: ["Daily care, automated.", "Quietly works in the background."],
    cta: ["Shop on GetPawsy", "See how it works"],
    caption: ["App control", "Smart sensors", "Automatic cycles", "Less manual work", "Modern pet home", "See it work"],
    noun: "smart pet device",
  },
  toy: {
    pin_title: ["{product} for Playful, Engaged Pets", "Interactive {product} for Daily Play"],
    hook: ["Daily enrichment.", "Real play, real energy."],
    cta: ["Shop on GetPawsy", "View details"],
    caption: ["Daily enrichment", "Mental stimulation", "Durable build", "Easy to clean", "Real play sessions", "Built for energy"],
    noun: "pet enrichment",
  },
  generic: {
    pin_title: ["{product} for Everyday Pet Homes", "Thoughtful {product} for Real Pet Owners"],
    hook: ["Built for real pet homes.", "A calmer daily routine."],
    cta: ["Shop on GetPawsy", "View details"],
    caption: ["Everyday use", "Built with care", "Easy upkeep", "Modern pet home", "Reliable", "See details"],
    noun: "pet essential",
  },
};

function productHaystack(p: ProductContext): string {
  return [p.slug, p.name, p.category, ...(p.tags || [])]
    .filter(Boolean).join(" ").toLowerCase();
}

// Strip forbidden category words from text UNLESS the word appears in
// the actual product title / category / tags (whitelist).
function scrubForbiddenWords(text: string, haystack: string, productCategory: Category): string {
  if (!text) return text;
  let out = text;
  for (const f of FORBIDDEN_CATEGORY_WORDS) {
    if (f.category === productCategory) continue; // word is on-category
    if (haystack.includes(f.word.toLowerCase())) continue; // explicitly allowed by product
    // Also allow if a substring of the word appears (e.g. "scratching" -> "scratch")
    if (f.word === "scratcher" && /\bscratch/.test(haystack)) continue;
    if (f.word === "cat tree" && /\btree\b/.test(haystack)) continue;
    out = out.replace(f.re, "").replace(/\s{2,}/g, " ").trim();
  }
  return out;
}

export interface CategoryRewriteResult {
  changed: boolean;
  product_category: Category;
  pin_title?: string;
  hook_text?: string;
  cta_text?: string;
  scene_plan?: Array<Record<string, unknown>> | null;
  mutations: Array<{ field: string; before: string; after: string; reason: string }>;
}

export function rewriteForCategorySafety(opts: {
  product: ProductContext;
  pin_title?: string | null;
  hook_text?: string | null;
  cta_text?: string | null;
  scene_plan?: Array<Record<string, unknown>> | null;
}): CategoryRewriteResult {
  const category = detectCategory({
    slug: opts.product.slug ?? undefined,
    name: opts.product.name ?? undefined,
    category: opts.product.category ?? undefined,
    tags: opts.product.tags ?? undefined,
  });
  const tpl = TEMPLATES[category];
  const haystack = productHaystack(opts.product);
  const noun = shortProductNoun(opts.product.name, tpl.noun);
  const mutations: CategoryRewriteResult["mutations"] = [];

  const pick = <T>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];
  const seedBase = haystack.length + (opts.product.slug?.length || 0);

  const newPinTitleRaw = pick(tpl.pin_title, seedBase).replaceAll("{product}", noun);
  const newPinTitle = scrubBanned(scrubForbiddenWords(newPinTitleRaw, haystack, category)).slice(0, 60);

  const newHookRaw = pick(tpl.hook, seedBase + 7);
  const newHook = scrubBanned(scrubForbiddenWords(newHookRaw, haystack, category)).slice(0, 60);

  const newCtaRaw = pick(tpl.cta, seedBase + 13);
  const newCta = scrubBanned(scrubForbiddenWords(newCtaRaw, haystack, category)).slice(0, 24);

  const result: CategoryRewriteResult = {
    changed: false,
    product_category: category,
    mutations,
  };

  const before = {
    pin_title: String(opts.pin_title ?? "").trim(),
    hook_text: String(opts.hook_text ?? "").trim(),
    cta_text: String(opts.cta_text ?? "").trim(),
  };

  if (before.pin_title !== newPinTitle) {
    result.pin_title = newPinTitle;
    mutations.push({ field: "pin_title", before: before.pin_title, after: newPinTitle, reason: `regenerated for category=${category}` });
  }
  if (before.hook_text !== newHook) {
    result.hook_text = newHook;
    mutations.push({ field: "hook_text", before: before.hook_text, after: newHook, reason: `regenerated for category=${category}` });
  }
  if (before.cta_text !== newCta) {
    result.cta_text = newCta;
    mutations.push({ field: "cta_text", before: before.cta_text, after: newCta, reason: `regenerated for category=${category}` });
  }

  // Scene captions — replace each with a category-safe pool entry,
  // preserving structural fields (motion, crop, y_pct, durationFrames, etc).
  if (Array.isArray(opts.scene_plan) && opts.scene_plan.length > 0) {
    const newPlan = opts.scene_plan.map((s, i) => {
      const beforeCap = String((s as any)?.caption ?? "").trim();
      const candidate = tpl.caption[i % tpl.caption.length];
      const cleaned = scrubBanned(scrubForbiddenWords(candidate, haystack, category)).slice(0, 60);
      if (beforeCap && cleaned !== beforeCap) {
        mutations.push({ field: `scene[${i}].caption`, before: beforeCap, after: cleaned, reason: `regenerated for category=${category}` });
      }
      return { ...(s as Record<string, unknown>), caption: cleaned };
    });
    result.scene_plan = newPlan;
  }

  result.changed = mutations.length > 0;
  return result;
}