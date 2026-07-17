/**
 * Deterministic replacement_round_robin_45 selector.
 *
 * Pure module: takes a snapshot of candidate rows + configuration and returns
 * an ordered selected list plus rejection reasons. Performs NO IO, NO provider
 * calls, NO Pinterest calls, NO queue writes, NO image generation.
 *
 * Species buckets:
 *   - cat  (target 18)
 *   - dog  (target 18)
 *   - other (target 9)   ← includes explicit multi-pet ("both") and non-cat/dog pets
 *
 * Dispatch: cat → dog → other → repeat.
 * Redistribution: when a bucket is exhausted, its remaining slots are split
 *   between surviving buckets while preserving in-bucket ranking.
 *
 * See spec in the initiating chat message for detailed eligibility rules.
 */

export type SelectorSpecies = 'cat' | 'dog' | 'other';

export type CacheStatus =
  | 'CACHE_TIER_A'
  | 'CACHE_TIER_B'
  | 'CACHE_REJECTED'
  | 'UNSCORED_ELIGIBLE'
  | 'PREFILTER_REJECTED'
  | 'MISSING_SOURCE'
  | 'DUPLICATE_SOURCE'
  | 'SPECIES_UNRESOLVED';

export interface CandidateInput {
  product_id: string;
  name: string;
  slug: string | null;
  category: string | null;
  primary_species: string | null; // raw DB value: cat|dog|both|unknown|...
  is_active: boolean;
  is_duplicate: boolean;
  canonical_product_id: string | null;
  pinterest_eligible: boolean;
  pinterest_disabled: boolean;
  is_us_warehouse: boolean;
  us_stock: number | null;
  stock: number | null;
  price_usd: number | null;
  hero_url: string | null;
  hero_hash: string | null;
  hero_min_dimension: number | null;
  known_watermark: boolean;
  known_supplier_text: boolean;
  known_collage: boolean;
  policy_unsafe: boolean;
  // Cache signals for calibrated V2
  cache_tier_a: boolean;
  cache_tier_b: boolean;
  cache_rejected_hash_match: boolean; // permanent unchanged-hash reject
  // Ops signals
  in_active_scoring_run: boolean;
  in_active_queue: boolean;
  recently_published: boolean;
  // Ranking hints (zero-cost)
  title_clarity_score: number; // 0..1
}

export interface SelectorConfig {
  targetCat: number;
  targetDog: number;
  targetOther: number;
  totalMax: number;
  minSourceDimension: number;
  firstTwelveMinCat: number;
  firstTwelveMinDog: number;
  firstTwelveMinOther: number;
}

export const DEFAULT_SELECTOR_CONFIG: SelectorConfig = {
  targetCat: 18,
  targetDog: 18,
  targetOther: 9,
  totalMax: 45,
  minSourceDimension: 1000,
  firstTwelveMinCat: 4,
  firstTwelveMinDog: 4,
  firstTwelveMinOther: 2,
};

export interface RejectedCandidate {
  product_id: string;
  reason: string;
  detail?: string;
}

export interface SelectedCandidate {
  ordinal: number;
  product_id: string;
  name: string;
  slug: string;
  species: SelectorSpecies;
  category: string | null;
  stock: number;
  pdp_url: string;
  source_image_url: string | null;
  source_image_hash: string | null;
  cache_status: CacheStatus;
  selector_score: number;
  selector_components: Record<string, number>;
  selection_reason: string;
}

export interface SelectorResult {
  selected: SelectedCandidate[];
  rejected: RejectedCandidate[];
  bucketPools: { cat: string[]; dog: string[]; other: string[] };
  counts: {
    inspected: number;
    commerce_eligible: number;
    cat_eligible: number;
    dog_eligible: number;
    other_eligible: number;
    species_unresolved: number;
    policy_excluded: number;
    duplicate_excluded: number;
    source_missing: number;
    permanent_hash_rejects: number;
    cache_tier_a: number;
    cache_tier_b: number;
    unscored_eligible: number;
  };
  firstTwelveDistribution: { cat: number; dog: number; other: number };
  redistributedSlots: number;
  unfilledSlots: number;
}

const PDP_BASE = 'https://getpawsy.pet/products/';

function classifyBucket(row: CandidateInput): { bucket: SelectorSpecies | null; reason: string } {
  const raw = (row.primary_species ?? '').toLowerCase().trim();
  if (raw === 'cat') return { bucket: 'cat', reason: 'primary_species=cat' };
  if (raw === 'dog') return { bucket: 'dog', reason: 'primary_species=dog' };
  if (raw === 'both' || raw === 'multi' || raw === 'multi-pet') {
    return { bucket: 'other', reason: 'multi_pet_product' };
  }
  if (['rabbit', 'hamster', 'bird', 'small_animal', 'ferret', 'guinea_pig'].includes(raw)) {
    return { bucket: 'other', reason: `other_species:${raw}` };
  }
  return { bucket: null, reason: 'SPECIES_UNRESOLVED' };
}

function effectiveStock(row: CandidateInput): number {
  if (row.us_stock !== null && row.us_stock !== undefined) return row.us_stock;
  return row.stock ?? 0;
}

function commerceReject(row: CandidateInput): string | null {
  if (!row.is_active) return 'inactive';
  if (row.pinterest_disabled) return 'pinterest_disabled';
  if (!row.pinterest_eligible) return 'pinterest_ineligible';
  if (row.is_duplicate) return 'duplicate_of_canonical';
  if (!row.slug) return 'missing_slug';
  if (!row.price_usd || row.price_usd <= 0) return 'invalid_price';
  if (effectiveStock(row) <= 0) return 'out_of_stock';
  if (!row.is_us_warehouse) return 'not_us_eligible';
  if (row.policy_unsafe) return 'policy_unsafe';
  if (row.in_active_scoring_run) return 'in_active_scoring_run';
  if (row.in_active_queue) return 'already_queued';
  if (row.recently_published) return 'recently_published_cooldown';
  return null;
}

function sourceReject(row: CandidateInput, cfg: SelectorConfig): string | null {
  if (!row.hero_url) return 'MISSING_SOURCE';
  if (row.known_watermark) return 'PREFILTER_REJECTED:watermark';
  if (row.known_supplier_text) return 'PREFILTER_REJECTED:supplier_text';
  if (row.known_collage) return 'PREFILTER_REJECTED:collage';
  if (row.hero_min_dimension !== null && row.hero_min_dimension < cfg.minSourceDimension) {
    return 'PREFILTER_REJECTED:min_dimension';
  }
  if (row.cache_rejected_hash_match) return 'PERMANENT_HASH_REJECT';
  return null;
}

function cacheStatusOf(row: CandidateInput): CacheStatus {
  if (row.cache_tier_a) return 'CACHE_TIER_A';
  if (row.cache_tier_b) return 'CACHE_TIER_B';
  return 'UNSCORED_ELIGIBLE';
}

function scoreCandidate(row: CandidateInput): { total: number; components: Record<string, number> } {
  const components: Record<string, number> = {};
  // Cache tier weight dominates (deterministic preference for cache hits)
  components.cache_tier = row.cache_tier_a ? 100 : row.cache_tier_b ? 60 : 30;
  components.source_dim = row.hero_min_dimension
    ? Math.min(20, Math.max(0, (row.hero_min_dimension - 800) / 100))
    : 0;
  components.stock = Math.min(10, Math.log2((effectiveStock(row) || 1) + 1));
  components.title_clarity = (row.title_clarity_score ?? 0) * 10;
  components.safety_clean =
    !row.known_watermark && !row.known_supplier_text && !row.known_collage ? 5 : 0;
  const total = Object.values(components).reduce((a, b) => a + b, 0);
  return { total: Number(total.toFixed(4)), components };
}

function dedupeCandidates(
  rows: CandidateInput[],
  rejected: RejectedCandidate[],
): CandidateInput[] {
  // 1) canonical dedup: drop rows that are duplicates of another canonical id
  const byCanonical = new Map<string, CandidateInput[]>();
  const byHash = new Map<string, CandidateInput[]>();
  const bySlug = new Map<string, CandidateInput[]>();
  const seenIds = new Set<string>();
  const out: CandidateInput[] = [];

  for (const r of rows) {
    if (seenIds.has(r.product_id)) continue;
    seenIds.add(r.product_id);
    out.push(r);
  }

  const preferBetter = (a: CandidateInput, b: CandidateInput): CandidateInput => {
    // active > US warehouse > cache tier > stock > deterministic id tiebreak
    const aActive = a.is_active ? 1 : 0;
    const bActive = b.is_active ? 1 : 0;
    if (aActive !== bActive) return aActive > bActive ? a : b;
    const aUs = a.is_us_warehouse ? 1 : 0;
    const bUs = b.is_us_warehouse ? 1 : 0;
    if (aUs !== bUs) return aUs > bUs ? a : b;
    const aCache = a.cache_tier_a ? 2 : a.cache_tier_b ? 1 : 0;
    const bCache = b.cache_tier_a ? 2 : b.cache_tier_b ? 1 : 0;
    if (aCache !== bCache) return aCache > bCache ? a : b;
    const aStock = effectiveStock(a);
    const bStock = effectiveStock(b);
    if (aStock !== bStock) return aStock > bStock ? a : b;
    return a.product_id < b.product_id ? a : b;
  };

  const keptById = new Map<string, CandidateInput>();
  for (const r of out) {
    const canonicalKey = r.canonical_product_id ?? r.product_id;
    const bucket = byCanonical.get(canonicalKey) ?? [];
    bucket.push(r);
    byCanonical.set(canonicalKey, bucket);
  }
  for (const [key, bucket] of byCanonical) {
    if (bucket.length === 1) {
      keptById.set(bucket[0].product_id, bucket[0]);
      continue;
    }
    const winner = bucket.reduce(preferBetter);
    for (const b of bucket) {
      if (b.product_id !== winner.product_id) {
        rejected.push({
          product_id: b.product_id,
          reason: 'duplicate_canonical',
          detail: `superseded_by=${winner.product_id}`,
        });
      }
    }
    keptById.set(winner.product_id, winner);
  }

  // 2) slug dedup
  for (const r of keptById.values()) {
    if (!r.slug) continue;
    const list = bySlug.get(r.slug) ?? [];
    list.push(r);
    bySlug.set(r.slug, list);
  }
  for (const [slug, list] of bySlug) {
    if (list.length <= 1) continue;
    const winner = list.reduce(preferBetter);
    for (const b of list) {
      if (b.product_id !== winner.product_id) {
        keptById.delete(b.product_id);
        rejected.push({
          product_id: b.product_id,
          reason: 'duplicate_slug',
          detail: `slug=${slug} superseded_by=${winner.product_id}`,
        });
      }
    }
  }

  // 3) source hash dedup
  for (const r of keptById.values()) {
    if (!r.hero_hash) continue;
    const list = byHash.get(r.hero_hash) ?? [];
    list.push(r);
    byHash.set(r.hero_hash, list);
  }
  for (const [hash, list] of byHash) {
    if (list.length <= 1) continue;
    const winner = list.reduce(preferBetter);
    for (const b of list) {
      if (b.product_id !== winner.product_id) {
        keptById.delete(b.product_id);
        rejected.push({
          product_id: b.product_id,
          reason: 'duplicate_source_hash',
          detail: `hash=${hash.slice(0, 12)} superseded_by=${winner.product_id}`,
        });
      }
    }
  }

  return Array.from(keptById.values());
}

export function selectReplacementRoundRobin45(
  rows: CandidateInput[],
  overrides: Partial<SelectorConfig> = {},
): SelectorResult {
  const cfg = { ...DEFAULT_SELECTOR_CONFIG, ...overrides };
  const rejected: RejectedCandidate[] = [];
  const counts = {
    inspected: rows.length,
    commerce_eligible: 0,
    cat_eligible: 0,
    dog_eligible: 0,
    other_eligible: 0,
    species_unresolved: 0,
    policy_excluded: 0,
    duplicate_excluded: 0,
    source_missing: 0,
    permanent_hash_rejects: 0,
    cache_tier_a: 0,
    cache_tier_b: 0,
    unscored_eligible: 0,
  };

  // Stage 1: commerce eligibility
  const commerceOk: CandidateInput[] = [];
  for (const r of rows) {
    const rej = commerceReject(r);
    if (rej) {
      if (rej === 'policy_unsafe') counts.policy_excluded++;
      rejected.push({ product_id: r.product_id, reason: rej });
      continue;
    }
    commerceOk.push(r);
    counts.commerce_eligible++;
  }

  // Stage 2: source precheck
  const sourceOk: CandidateInput[] = [];
  for (const r of commerceOk) {
    const rej = sourceReject(r, cfg);
    if (rej) {
      if (rej === 'MISSING_SOURCE') counts.source_missing++;
      if (rej === 'PERMANENT_HASH_REJECT') counts.permanent_hash_rejects++;
      rejected.push({ product_id: r.product_id, reason: rej });
      continue;
    }
    sourceOk.push(r);
  }

  // Stage 3: dedupe
  const dedupedBefore = sourceOk.length;
  const deduped = dedupeCandidates(sourceOk, rejected);
  counts.duplicate_excluded += dedupedBefore - deduped.length;

  // Stage 4: species classification into buckets
  type Ranked = { row: CandidateInput; score: number; components: Record<string, number>; bucket: SelectorSpecies };
  const buckets: Record<SelectorSpecies, Ranked[]> = { cat: [], dog: [], other: [] };
  for (const r of deduped) {
    const cls = classifyBucket(r);
    if (!cls.bucket) {
      counts.species_unresolved++;
      rejected.push({ product_id: r.product_id, reason: 'SPECIES_UNRESOLVED' });
      continue;
    }
    const s = scoreCandidate(r);
    buckets[cls.bucket].push({ row: r, score: s.total, components: s.components, bucket: cls.bucket });
  }

  // Rank each bucket (higher score first; deterministic id tiebreak)
  for (const key of ['cat', 'dog', 'other'] as SelectorSpecies[]) {
    buckets[key].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.row.product_id.localeCompare(b.row.product_id);
    });
  }
  counts.cat_eligible = buckets.cat.length;
  counts.dog_eligible = buckets.dog.length;
  counts.other_eligible = buckets.other.length;
  for (const r of deduped) {
    if (r.cache_tier_a) counts.cache_tier_a++;
    else if (r.cache_tier_b) counts.cache_tier_b++;
    else counts.unscored_eligible++;
  }

  // Stage 5: round-robin dispatch cat→dog→other with per-bucket caps
  const caps: Record<SelectorSpecies, number> = {
    cat: cfg.targetCat,
    dog: cfg.targetDog,
    other: cfg.targetOther,
  };
  const order: SelectorSpecies[] = ['cat', 'dog', 'other'];
  const cursor: Record<SelectorSpecies, number> = { cat: 0, dog: 0, other: 0 };
  const taken: Record<SelectorSpecies, number> = { cat: 0, dog: 0, other: 0 };
  const selectedRanked: Ranked[] = [];
  let redistributedSlots = 0;

  while (selectedRanked.length < cfg.totalMax) {
    let progressed = false;
    for (const bucket of order) {
      if (selectedRanked.length >= cfg.totalMax) break;
      if (taken[bucket] >= caps[bucket]) continue;
      if (cursor[bucket] >= buckets[bucket].length) continue;
      selectedRanked.push(buckets[bucket][cursor[bucket]++]);
      taken[bucket]++;
      progressed = true;
    }
    if (!progressed) break;
  }

  // Redistribution pass: if total < totalMax and some bucket still has supply
  if (selectedRanked.length < cfg.totalMax) {
    const survivors = order.filter((b) => cursor[b] < buckets[b].length);
    if (survivors.length > 0) {
      while (selectedRanked.length < cfg.totalMax) {
        let progressed = false;
        for (const b of survivors) {
          if (cursor[b] >= buckets[b].length) continue;
          if (selectedRanked.length >= cfg.totalMax) break;
          selectedRanked.push(buckets[b][cursor[b]++]);
          taken[b]++;
          redistributedSlots++;
          progressed = true;
        }
        if (!progressed) break;
      }
    }
  }

  // Build final SelectedCandidate list with ordinals starting at 1
  const selected: SelectedCandidate[] = selectedRanked.map((r, i) => ({
    ordinal: i + 1,
    product_id: r.row.product_id,
    name: r.row.name,
    slug: r.row.slug ?? '',
    species: r.bucket,
    category: r.row.category,
    stock: effectiveStock(r.row),
    pdp_url: PDP_BASE + (r.row.slug ?? ''),
    source_image_url: r.row.hero_url,
    source_image_hash: r.row.hero_hash,
    cache_status: cacheStatusOf(r.row),
    selector_score: r.score,
    selector_components: r.components,
    selection_reason: `bucket=${r.bucket};cache=${cacheStatusOf(r.row)}`,
  }));

  const first12 = selected.slice(0, 12);
  const firstTwelveDistribution = {
    cat: first12.filter((s) => s.species === 'cat').length,
    dog: first12.filter((s) => s.species === 'dog').length,
    other: first12.filter((s) => s.species === 'other').length,
  };

  const bucketPools = {
    cat: buckets.cat.map((r) => r.row.product_id),
    dog: buckets.dog.map((r) => r.row.product_id),
    other: buckets.other.map((r) => r.row.product_id),
  };

  return {
    selected,
    rejected,
    bucketPools,
    counts,
    firstTwelveDistribution,
    redistributedSlots,
    unfilledSlots: cfg.totalMax - selected.length,
  };
}
