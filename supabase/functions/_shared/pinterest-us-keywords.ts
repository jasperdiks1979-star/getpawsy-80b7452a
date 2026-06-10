// US-focused long-tail + state-specific keyword library for Pinterest growth.
//
// Used by `pinterest-growth-engine` to:
//   1. Pass US-focused keyword hints to `pinterest-creative-director` per run.
//   2. Bias board / product approval toward US-converting content.
//   3. Inject `meta.us_keywords` + `meta.us_state_focus` on approved drafts so the
//      publisher can attach them to the Pinterest API call (note / hashtags).
//
// Goal: push US share of Pinterest-attributed traffic toward 80%+.

export const US_TITLE_SUFFIXES = [
  "USA",
  "US Pet Parents",
  "American Homes",
  "for US Dog Moms",
  "for US Cat Moms",
] as const;

// Short, ≤2-word state tags safe for ≤5-word pin titles.
export const US_STATES_TOP = [
  "Texas", "California", "Florida", "New York", "Georgia",
  "Arizona", "Ohio", "Colorado", "Washington", "Illinois",
  "Pennsylvania", "North Carolina", "Virginia", "Tennessee", "Massachusetts",
] as const;

// Long-tail US-intent keywords per niche (used as hints / meta tags, never as titles).
export const US_LONGTAIL_BY_NICHE: Record<string, readonly string[]> = {
  cat_litter: [
    "best self cleaning litter box usa",
    "automatic cat litter box ships from usa",
    "smart litter box for small apartments us",
  ],
  cat_tree: [
    "modern cat tree usa",
    "cat tower for small spaces us apartments",
    "indoor cat tree ships free us",
  ],
  cat_fountain: [
    "cat water fountain usa",
    "quiet cat fountain for us homes",
  ],
  dog_bed: [
    "orthopedic dog bed usa",
    "calming dog bed for american homes",
    "washable dog bed ships from us",
  ],
  dog_car: [
    "dog car seat cover usa",
    "back seat dog hammock for suvs us",
    "dog travel gear for road trips usa",
  ],
  dog_harness: [
    "no pull dog harness usa",
    "reflective dog harness for us walkers",
  ],
  calming_bed: [
    "calming dog bed for anxiety usa",
    "donut dog bed ships free us",
  ],
  interactive_toy: [
    "interactive cat toy usa",
    "enrichment toy for indoor cats us",
  ],
  grooming: [
    "pet grooming kit usa",
    "dog deshedding tool ships from us",
  ],
  feeder: [
    "automatic pet feeder usa",
    "slow feeder bowl ships free us",
  ],
  generic_pet: [
    "pet essentials usa",
    "trusted pet gear ships from us",
  ],
};

export function detectNicheLite(p: { name?: string | null; slug?: string | null; category?: string | null }): string {
  const blob = `${p.name ?? ""} ${p.slug ?? ""} ${p.category ?? ""}`.toLowerCase();
  if (/litter/.test(blob)) return "cat_litter";
  if (/cat.?tree|cat.?tower|cat.?condo/.test(blob)) return "cat_tree";
  if (/fountain|water dispenser/.test(blob)) return "cat_fountain";
  if (/(car|seat|hammock|travel)/.test(blob) && /dog/.test(blob)) return "dog_car";
  if (/harness/.test(blob)) return "dog_harness";
  if (/calming|anxiety|donut/.test(blob)) return "calming_bed";
  if (/dog.?bed|orthopedic/.test(blob)) return "dog_bed";
  if (/feeder|bowl/.test(blob)) return "feeder";
  if (/groom|brush|deshed/.test(blob)) return "grooming";
  if (/toy|puzzle|enrichment/.test(blob)) return "interactive_toy";
  return "generic_pet";
}

export function pickUsKeywords(p: { name?: string | null; slug?: string | null; category?: string | null }, n = 3): string[] {
  const niche = detectNicheLite(p);
  const pool = US_LONGTAIL_BY_NICHE[niche] ?? US_LONGTAIL_BY_NICHE.generic_pet;
  return pool.slice(0, n).map(String);
}

// Deterministic state pick — rotates across slug so different drafts of the
// same product target different US states without persisting state.
export function pickUsState(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % US_STATES_TOP.length;
  return US_STATES_TOP[idx];
}

// Target US share — boards below FLOOR are demoted, runs aim for TARGET.
export const US_SHARE_TARGET = 0.8;
export const US_SHARE_FLOOR = 0.3;
