/**
 * Backlink Domination Prep Module
 * 
 * Generates outreach-ready assets, anchor text variations,
 * and priority scores for link building campaigns.
 */

export interface LinkableAsset {
  slug: string;
  title: string;
  impressions: number;
  position: number;
  clicks: number;
  priorityScore: number;
  outreachSummary: string;
  anchorVariations: string[];
  assetType: 'guide' | 'collection' | 'data-study' | 'comparison';
}

export interface BacklinkDominationResult {
  assets: LinkableAsset[];
  csvData: string;
  totalAssets: number;
  avgPriorityScore: number;
}

function humanize(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}

function calcPriorityScore(p: { position: number; impressions: number; clicks: number }): number {
  // Higher impressions + lower position = higher priority
  const positionBonus = Math.max(0, 60 - p.position) * 2;
  const impressionBonus = Math.min(p.impressions * 0.5, 100);
  const clickPotential = p.clicks === 0 ? 20 : 0; // Zero clicks = untapped potential
  return Math.round(positionBonus + impressionBonus + clickPotential);
}

function generateAnchorVariations(slug: string): string[] {
  const kw = humanize(slug).toLowerCase();
  const words = kw.split(' ');
  const variations = [
    kw, // exact
    `best ${kw}`, // partial
    `${kw} guide`, // partial
    `learn about ${kw}`, // generic
    'read more here', // generic
    'this helpful resource', // branded
    `GetPawsy's ${words.slice(0, 3).join(' ')} guide`, // branded
  ];
  return [...new Set(variations)].slice(0, 6);
}

function generateOutreachSummary(slug: string, impressions: number, position: number): string {
  const kw = humanize(slug);
  if (position <= 15) {
    return `"${kw}" ranks position ${position} with ${impressions} monthly impressions. A single quality backlink could push this into Top 5, unlocking significant organic traffic. This comprehensive guide covers expert recommendations, comparison data, and actionable tips for pet owners.`;
  }
  return `"${kw}" is gaining traction at position ${position} with ${impressions} impressions. Building 2-3 contextual backlinks from relevant pet/lifestyle sites would accelerate ranking velocity. The content includes original research, expert quotes, and practical advice.`;
}

export function prepareBacklinkAssets(
  pages: Array<{ slug: string; impressions: number; clicks: number; position: number; title?: string }>
): BacklinkDominationResult {
  const sorted = [...pages]
    .filter(p => p.impressions > 5 && p.position <= 60)
    .map(p => ({
      ...p,
      priorityScore: calcPriorityScore(p),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 50);

  const assets: LinkableAsset[] = sorted.map(p => {
    const slug = p.slug;
    let assetType: LinkableAsset['assetType'] = 'guide';
    if (slug.startsWith('best-') || slug.includes('comparison')) assetType = 'comparison';
    if (slug.includes('collection') || slug.startsWith('c/')) assetType = 'collection';

    return {
      slug,
      title: p.title || humanize(slug),
      impressions: p.impressions,
      position: p.position,
      clicks: p.clicks,
      priorityScore: p.priorityScore,
      outreachSummary: generateOutreachSummary(slug, p.impressions, p.position),
      anchorVariations: generateAnchorVariations(slug),
      assetType,
    };
  });

  // Generate CSV
  const csvLines = [
    'Slug,Title,Position,Impressions,Clicks,Priority Score,Asset Type,Anchor 1,Anchor 2,Anchor 3',
    ...assets.map(a =>
      `${a.slug},"${a.title}",${a.position},${a.impressions},${a.clicks},${a.priorityScore},${a.assetType},"${a.anchorVariations[0] || ''}","${a.anchorVariations[1] || ''}","${a.anchorVariations[2] || ''}"`
    ),
  ];

  return {
    assets,
    csvData: csvLines.join('\n'),
    totalAssets: assets.length,
    avgPriorityScore: assets.length > 0
      ? Math.round(assets.reduce((s, a) => s + a.priorityScore, 0) / assets.length)
      : 0,
  };
}
