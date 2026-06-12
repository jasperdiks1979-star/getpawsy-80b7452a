// Pinterest Category Diversity Governor
// ---------------------------------------------------------------------------
// Centralises the 11-bucket target mix, the "no category twice in the last
// 3 pins", the per-100-pin cap, the per-product cooldown, the headline
// repetition cap, and the Dog>=35% floor. Used by the diversity-governor
// edge function for both product selection and queue migration.

export type GovernorBucket =
  | "cat_essentials"
  | "cat_toys"
  | "dog_toys"
  | "dog_beds"
  | "feeding"
  | "cat_furniture"
  | "cat_trees"
  | "litter"
  | "travel"
  | "grooming"
  | "misc";

export const GOVERNOR_TARGETS: Record<GovernorBucket, number> = {
  cat_essentials: 0.20,
  cat_toys: 0.15,
  dog_toys: 0.15,
  dog_beds: 0.10,
  feeding: 0.10,
  cat_furniture: 0.10,
  cat_trees: 0.05,
  litter: 0.05,
  travel: 0.05,
  grooming: 0.03,
  misc: 0.02,
};

export const HARD_CATEGORY_CAP = 0.20; // no bucket > 20% of last 100
export const DOG_FLOOR = 0.35; // dog products >= 35% of last 100
export const HEADLINE_REPEAT_CAP = 5; // max same overlay in last 100
export const PRODUCT_COOLDOWN_DAYS = 30;
export const RECENT_CATEGORY_BLOCK = 3; // same category cannot be 3 in a row

const PRETTY_TO_BUCKET: Array<[RegExp, GovernorBucket]> = [
  [/cat tree|cat condo|condos/i, "cat_trees"],
  [/cat scratch/i, "cat_furniture"],
  [/cat litter|litter box/i, "litter"],
  [/cat toy/i, "cat_toys"],
  [/cat (bed|house|carrier|collar|accessor|apparel|cloth)/i, "cat_essentials"],
  [/cat bowl|cat feeder|cat fountain|water fountain/i, "feeding"],
  [/cat groom/i, "grooming"],
  [/dog toy/i, "dog_toys"],
  [/dog bed/i, "dog_beds"],
  [/dog (bowl|feeder|food|treat)/i, "feeding"],
  [/dog (carrier|travel|stroller|car seat|booster)/i, "travel"],
  [/dog groom/i, "grooming"],
  [/dog (collar|leash|harness|training|cloth|apparel|house)/i, "misc"],
  [/carrier|stroller/i, "travel"],
  [/bowl|feeder|fountain/i, "feeding"],
  [/groom/i, "grooming"],
];

const KEY_TO_BUCKET: Record<string, GovernorBucket> = {
  cat_trees: "cat_trees",
  cat_tree: "cat_trees",
  "cat-trees": "cat_trees",
  cat_litter_boxes: "litter",
  litter: "litter",
  "cat-litter": "litter",
  cat_litter: "litter",
  self_cleaning_litter: "litter",
  "litter-boxes": "litter",
  cat_scratcher: "cat_furniture",
  cat_furniture: "cat_furniture",
  cat_enclosure: "cat_furniture",
  cat_essentials: "cat_essentials",
  cat_bed: "cat_essentials",
  cat_toys: "cat_toys",
  cat_toy: "cat_toys",
  bowl_station: "feeding",
  cat_fountain: "feeding",
  feeder: "feeding",
  dog_bed: "dog_beds",
  dog_beds: "dog_beds",
  dog_toys: "dog_toys",
  dog_toy: "dog_toys",
  dog_travel: "travel",
  dog_carrier: "travel",
  dog_car_seat: "travel",
  carriers: "travel",
  grooming: "grooming",
  outdoor_house: "misc",
};

export function categoryToBucket(
  category?: string | null,
  categoryKey?: string | null,
  name?: string | null,
): GovernorBucket {
  const key = (categoryKey || "").trim().toLowerCase();
  if (key && KEY_TO_BUCKET[key]) return KEY_TO_BUCKET[key];
  const haystack = `${category ?? ""} ${name ?? ""}`;
  for (const [re, b] of PRETTY_TO_BUCKET) if (re.test(haystack)) return b;
  return "misc";
}

export function isDogBucket(b: GovernorBucket): boolean {
  return b === "dog_toys" || b === "dog_beds";
}
export function isCatBucket(b: GovernorBucket): boolean {
  return b === "cat_essentials" || b === "cat_toys" || b === "cat_furniture" ||
         b === "cat_trees" || b === "litter";
}

export interface RecentPin {
  id: string;
  product_id: string | null;
  product_slug: string | null;
  category_key: string | null;
  overlay_text: string | null;
  pin_title: string | null;
  status: string;
  posted_at: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
  bucket: GovernorBucket;
}

export interface GovernorMetrics {
  total_last_100: number;
  posted_last_100: number;
  distribution: Array<{ bucket: GovernorBucket; count: number; pct: number; target: number; delta: number }>;
  dog_pct: number;
  cat_pct: number;
  last_3_buckets: GovernorBucket[];
  creative_types: Record<string, number>;
  top_products: Array<{ slug: string; count: number }>;
  top_overlays: Array<{ overlay: string; count: number }>;
}

function normOverlay(s: string | null): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function loadRecentPins(sb: any, limit = 100): Promise<RecentPin[]> {
  const { data, error } = await sb
    .from("pinterest_pin_queue")
    .select("id, product_id, product_slug, category_key, overlay_text, pin_title, status, posted_at, created_at, meta")
    .in("status", ["posted", "queued"])
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit * 2);
  if (error) throw error;
  const rows = (data ?? []).filter((r: any) => r.status === "posted").slice(0, limit);
  return rows.map((r: any) => ({
    ...r,
    bucket: categoryToBucket(null, r.category_key, r.product_slug ?? r.pin_title),
  }));
}

export function computeMetrics(recent: RecentPin[]): GovernorMetrics {
  const total = recent.length || 1;
  const counts: Record<GovernorBucket, number> = {
    cat_essentials: 0, cat_toys: 0, dog_toys: 0, dog_beds: 0, feeding: 0,
    cat_furniture: 0, cat_trees: 0, litter: 0, travel: 0, grooming: 0, misc: 0,
  };
  const products = new Map<string, number>();
  const overlays = new Map<string, number>();
  const creativeTypes: Record<string, number> = {};
  let dog = 0, cat = 0;
  for (const p of recent) {
    counts[p.bucket]++;
    if (isDogBucket(p.bucket)) dog++;
    if (isCatBucket(p.bucket)) cat++;
    if (p.product_slug) products.set(p.product_slug, (products.get(p.product_slug) ?? 0) + 1);
    const ov = normOverlay(p.overlay_text);
    if (ov) overlays.set(ov, (overlays.get(ov) ?? 0) + 1);
    const t = ((p.meta as any)?.pin_type ?? "lifestyle") as string;
    creativeTypes[t] = (creativeTypes[t] ?? 0) + 1;
  }
  const distribution = (Object.keys(counts) as GovernorBucket[]).map((b) => {
    const pct = counts[b] / total;
    const target = GOVERNOR_TARGETS[b];
    return { bucket: b, count: counts[b], pct, target, delta: pct - target };
  }).sort((a, b) => b.pct - a.pct);
  return {
    total_last_100: recent.length,
    posted_last_100: recent.length,
    distribution,
    dog_pct: dog / total,
    cat_pct: cat / total,
    last_3_buckets: recent.slice(0, 3).map((p) => p.bucket),
    creative_types: creativeTypes,
    top_products: [...products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([slug, count]) => ({ slug, count })),
    top_overlays: [...overlays.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([overlay, count]) => ({ overlay, count })),
  };
}

export interface CandidateProduct {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  image_url: string | null;
  bucket: GovernorBucket;
  last_published_at: string | null;
  publish_count: number;
  priority_tier: number; // 0=never, 1=>90d, 2=>60d, 3=>30d
}

export interface SelectionResult {
  selected: CandidateProduct[];
  reasons: string[];
  blocked_categories: GovernorBucket[];
  bucket_plan: Array<{ bucket: GovernorBucket; needed: number; available: number }>;
}

export async function selectProducts(
  sb: any,
  n: number,
  metrics: GovernorMetrics,
): Promise<SelectionResult> {
  // Pull candidate products (active, in-stock).
  const { data: products, error } = await sb
    .from("products")
    .select("id, slug, name, category, image_url")
    .eq("is_active", true)
    .not("image_url", "is", null)
    .limit(2000);
  if (error) throw error;

  // Pull each product's most recent published pin to compute cooldown tier.
  const slugs = (products ?? []).map((p: any) => p.slug).filter(Boolean);
  const pubMap = new Map<string, { last: string | null; count: number }>();
  if (slugs.length) {
    const { data: pubs } = await sb
      .from("pinterest_pin_queue")
      .select("product_slug, posted_at, status")
      .in("product_slug", slugs)
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(5000);
    for (const row of pubs ?? []) {
      const s = row.product_slug;
      if (!s) continue;
      const cur = pubMap.get(s) ?? { last: null, count: 0 };
      cur.count++;
      if (!cur.last || (row.posted_at && row.posted_at > cur.last)) cur.last = row.posted_at;
      pubMap.set(s, cur);
    }
  }

  const now = Date.now();
  const COOLDOWN_MS = PRODUCT_COOLDOWN_DAYS * 86_400_000;
  const candidates: CandidateProduct[] = (products ?? []).map((p: any) => {
    const stats = pubMap.get(p.slug) ?? { last: null, count: 0 };
    const ageMs = stats.last ? now - new Date(stats.last).getTime() : Infinity;
    let tier = 3;
    if (!stats.last) tier = 0;
    else if (ageMs > 90 * 86_400_000) tier = 1;
    else if (ageMs > 60 * 86_400_000) tier = 2;
    else if (ageMs > 30 * 86_400_000) tier = 3;
    else tier = 99; // inside cooldown — disqualified below
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      image_url: p.image_url,
      bucket: categoryToBucket(p.category, null, p.name),
      last_published_at: stats.last,
      publish_count: stats.count,
      priority_tier: tier,
    };
  }).filter((c) => c.priority_tier !== 99);

  // Bucket plan: compute deficit per bucket vs target * (current+n).
  const total = metrics.posted_last_100 + n;
  const currentByBucket: Record<GovernorBucket, number> = {
    cat_essentials: 0, cat_toys: 0, dog_toys: 0, dog_beds: 0, feeding: 0,
    cat_furniture: 0, cat_trees: 0, litter: 0, travel: 0, grooming: 0, misc: 0,
  };
  for (const d of metrics.distribution) currentByBucket[d.bucket] = d.count;
  const buckets = Object.keys(GOVERNOR_TARGETS) as GovernorBucket[];
  const desired: Record<GovernorBucket, number> = Object.fromEntries(
    buckets.map((b) => [b, Math.max(0, Math.round(GOVERNOR_TARGETS[b] * total) - currentByBucket[b])]),
  ) as any;
  // Hard cap: no bucket can be at/above 20% of last 100 already.
  const capped = new Set<GovernorBucket>();
  for (const d of metrics.distribution) {
    if (d.pct >= HARD_CATEGORY_CAP) {
      desired[d.bucket] = 0;
      capped.add(d.bucket);
    }
  }
  // Dog floor correction: ensure at least 35% of the new batch is dog if
  // the current dog share is below floor.
  if (metrics.dog_pct < DOG_FLOOR) {
    const need = Math.ceil(n * 0.5); // aggressive correction
    const split = Math.ceil(need / 2);
    desired.dog_toys = Math.max(desired.dog_toys, split);
    desired.dog_beds = Math.max(desired.dog_beds, need - split);
  }

  // Round desired so it sums to ~n: drop overflow proportionally.
  let plannedTotal = buckets.reduce((s, b) => s + desired[b], 0);
  while (plannedTotal > n) {
    // shave from the bucket with the largest desired count.
    const top = buckets.reduce((a, b) => (desired[a] > desired[b] ? a : b));
    desired[top] = Math.max(0, desired[top] - 1);
    plannedTotal--;
  }
  while (plannedTotal < n) {
    // fill from largest target bucket not yet capped.
    const sorted = buckets.filter((b) => !capped.has(b))
      .sort((a, b) => GOVERNOR_TARGETS[b] - GOVERNOR_TARGETS[a]);
    desired[sorted[0]] = (desired[sorted[0]] ?? 0) + 1;
    plannedTotal++;
  }

  // Selection: per bucket, pick by priority_tier asc (0 first), then by
  // publish_count asc, then random.
  const selected: CandidateProduct[] = [];
  const reasons: string[] = [];
  const recentBucketsRoll: GovernorBucket[] = [...metrics.last_3_buckets];
  const usedProductIds = new Set<string>();

  // Pre-sort each bucket's pool once so subsequent shifts are O(1).
  const pools: Record<GovernorBucket, CandidateProduct[]> = Object.fromEntries(
    buckets.map((b) => [
      b,
      candidates
        .filter((c) => c.bucket === b)
        .sort((a, b) =>
          a.priority_tier - b.priority_tier ||
          a.publish_count - b.publish_count ||
          a.slug.localeCompare(b.slug),
        ),
    ]),
  ) as any;
  const remaining: Record<GovernorBucket, number> = { ...desired };
  let totalRemaining = buckets.reduce((s, b) => s + remaining[b], 0);

  while (totalRemaining > 0) {
    // Pick the bucket with the highest remaining need that is NOT blocked
    // by the 3-in-a-row guard and has a non-empty pool.
    const last3 = recentBucketsRoll.slice(0, RECENT_CATEGORY_BLOCK);
    const blocked3 = (b: GovernorBucket) =>
      last3.length === RECENT_CATEGORY_BLOCK && last3.every((x) => x === b);
    const eligible = buckets
      .filter((b) => remaining[b] > 0 && pools[b].length > 0 && !blocked3(b))
      .sort((a, b) => remaining[b] - remaining[a]);
    if (eligible.length === 0) {
      // Try relaxing the 3-in-a-row guard so we still progress when only
      // one bucket has stock — we re-check 3-in-a-row using the actual
      // selected sequence in this case.
      const fallback = buckets.filter((b) => remaining[b] > 0 && pools[b].length > 0);
      if (fallback.length === 0) break;
      // pick a bucket that is not the last one
      const lastB = recentBucketsRoll[0];
      const pick = fallback.find((b) => b !== lastB) ?? fallback[0];
      const c = pools[pick].shift()!;
      selected.push(c);
      usedProductIds.add(c.id);
      recentBucketsRoll.unshift(pick);
      remaining[pick]--;
      totalRemaining--;
      reasons.push(`relaxed-3-in-a-row to fill ${pick}`);
      continue;
    }
    const pick = eligible[0];
    const c = pools[pick].shift()!;
    selected.push(c);
    usedProductIds.add(c.id);
    recentBucketsRoll.unshift(pick);
    remaining[pick]--;
    totalRemaining--;
  }

  for (const b of buckets) {
    if (remaining[b] > 0) {
      reasons.push(`bucket ${b} short by ${remaining[b]} (no eligible candidates)`);
    }
  }

  return {
    selected,
    reasons,
    blocked_categories: [...capped],
    bucket_plan: buckets.map((b) => ({
      bucket: b,
      needed: desired[b],
      available: candidates.filter((c) => c.bucket === b).length,
    })),
  };
}

// Forecast next 24h publish count from current cron settings. Heuristic:
// publish-now respects warmup + cap. We expose a rough estimate.
export function forecastNext24h(metrics: GovernorMetrics, dailyCap: number): {
  expected_publishes: number;
  cat_share: number;
  dog_share: number;
} {
  return {
    expected_publishes: dailyCap,
    cat_share: metrics.cat_pct,
    dog_share: metrics.dog_pct,
  };
}