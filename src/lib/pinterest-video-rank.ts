// Pinterest video draft ranking — picks the best candidates to publish first.
// Higher score = better. Used to pre-select the top 3 publishable drafts.

export type RankAsset = {
  id: string;
  filename: string;
  hook_type: string;
  aspect_ratio: string | null;
  publish_count: number;
};

export type RankDraft = {
  id: string;
  asset_id: string;
  status: string;
  title: string;
  description: string;
  cta_text: string | null;
};

const HOOK_WEIGHT: Record<string, number> = {
  pain: 30,
  smell: 28,
  time: 25,
  transformation: 22,
  social_proof: 20,
  curiosity: 18,
  direct: 12,
  unknown: 5,
};

// Drafts in these statuses are NOT eligible for auto-select.
const NON_PUBLISHABLE = new Set(["published", "publishing", "failed"]);

function isVertical(aspect: string | null, filename: string): boolean {
  if (aspect) {
    const m = aspect.match(/^(\d+(?:\.\d+)?)[:x](\d+(?:\.\d+)?)$/i);
    if (m) {
      const w = parseFloat(m[1]); const h = parseFloat(m[2]);
      if (w > 0 && h > 0) return h / w >= 1.2; // 4:5, 9:16, etc.
    }
    if (/^(9:16|3:4|4:5)$/i.test(aspect)) return true;
  }
  // Heuristic from filename when aspect_ratio is unknown.
  return /(vertical|portrait|9x16|9-16|tiktok|reel|story)/i.test(filename);
}

function relevanceScore(filename: string, draft: RankDraft): number {
  const hay = `${filename} ${draft.title} ${draft.description}`.toLowerCase();
  let s = 0;
  if (/litter\s*box|self.?clean|automatic.*litter/.test(hay)) s += 20;
  if (/smell|odor|odour/.test(hay)) s += 8;
  if (/scoop|cleaning|hygien/.test(hay)) s += 6;
  if (/getpawsy-litterbox/i.test(filename)) s += 10;
  return s;
}

function ctaScore(draft: RankDraft): number {
  const cta = (draft.cta_text || "").trim();
  if (!cta) return 0;
  if (cta.length >= 6 && cta.length <= 40) return 8;
  return 3;
}

export type ScoredDraft = {
  draft: RankDraft;
  asset: RankAsset;
  score: number;
  breakdown: { vertical: number; hook: number; relevance: number; novelty: number; cta: number };
};

export function scoreDrafts(drafts: RankDraft[], assets: RankAsset[]): ScoredDraft[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const out: ScoredDraft[] = [];
  for (const d of drafts) {
    if (NON_PUBLISHABLE.has(d.status)) continue;
    const asset = byId.get(d.asset_id);
    if (!asset) continue;
    const vertical = isVertical(asset.aspect_ratio, asset.filename) ? 40 : 0;
    const hook = HOOK_WEIGHT[asset.hook_type] ?? HOOK_WEIGHT.unknown;
    const relevance = relevanceScore(asset.filename, d);
    const novelty = asset.publish_count === 0 ? 10 : Math.max(0, 6 - asset.publish_count);
    const cta = ctaScore(d);
    const score = vertical + hook + relevance + novelty + cta;
    out.push({ draft: d, asset, score, breakdown: { vertical, hook, relevance, novelty, cta } });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function pickTopN(drafts: RankDraft[], assets: RankAsset[], n = 3): string[] {
  return scoreDrafts(drafts, assets).slice(0, n).map((s) => s.draft.id);
}