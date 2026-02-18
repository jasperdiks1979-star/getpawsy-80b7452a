/**
 * Ranking Zone Classification System
 * 
 * Classifies indexed pages into action zones based on average position:
 * - GREEN (1-10): CTR optimization only, no backlink push
 * - YELLOW (20-60): Build backlinks, improve internal linking, expand content
 * - RED (70+): Merge or rewrite, do NOT push backlinks
 * - NEUTRAL (11-19): Monitoring zone, light optimization
 */

export type RankingZone = 'green' | 'yellow' | 'red' | 'neutral';

export interface ZoneClassification {
  slug: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  zone: RankingZone;
  actions: string[];
}

export interface ZoneBreakdown {
  green: ZoneClassification[];
  yellow: ZoneClassification[];
  red: ZoneClassification[];
  neutral: ZoneClassification[];
  summary: {
    greenCount: number;
    yellowCount: number;
    redCount: number;
    neutralCount: number;
    greenImpressions: number;
    yellowImpressions: number;
    redImpressions: number;
    neutralImpressions: number;
  };
  priorityYellow: ZoneClassification[]; // Top 10 Yellow pages by impressions
}

function getZone(position: number): RankingZone {
  if (position >= 1 && position <= 10) return 'green';
  if (position >= 11 && position <= 19) return 'neutral';
  if (position >= 20 && position <= 60) return 'yellow';
  return 'red';
}

function getZoneActions(zone: RankingZone, ctr: number): string[] {
  switch (zone) {
    case 'green':
      return ctr < 3
        ? ['Optimize title for higher CTR', 'Add FAQ schema', 'Test meta description variants']
        : ['Maintain current position', 'Monitor for ranking decay'];
    case 'neutral':
      return [
        'Push to Top 10 with 1-2 internal links',
        'Add supporting content in cluster',
        'Optimize title with power modifiers',
      ];
    case 'yellow':
      return [
        'Build 2-3 quality backlinks',
        'Improve internal linking (add 3+ contextual links)',
        'Expand content by 20%',
        'Add comparison table or FAQ section',
      ];
    case 'red':
      return [
        'Consider merging with stronger page',
        'Or complete rewrite with new angle',
        'Do NOT push backlinks yet',
        'Evaluate if keyword intent matches content',
      ];
  }
}

export function classifyRankingZones(
  pages: Array<{ slug: string; position: number; impressions: number; clicks: number; ctr: number }>
): ZoneBreakdown {
  const classified: ZoneClassification[] = pages.map(p => {
    const zone = getZone(p.position);
    return {
      slug: p.slug,
      position: p.position,
      impressions: p.impressions,
      clicks: p.clicks,
      ctr: p.ctr,
      zone,
      actions: getZoneActions(zone, p.ctr),
    };
  });

  const green = classified.filter(c => c.zone === 'green').sort((a, b) => a.position - b.position);
  const yellow = classified.filter(c => c.zone === 'yellow').sort((a, b) => b.impressions - a.impressions);
  const red = classified.filter(c => c.zone === 'red').sort((a, b) => b.impressions - a.impressions);
  const neutral = classified.filter(c => c.zone === 'neutral').sort((a, b) => a.position - b.position);

  return {
    green, yellow, red, neutral,
    summary: {
      greenCount: green.length,
      yellowCount: yellow.length,
      redCount: red.length,
      neutralCount: neutral.length,
      greenImpressions: green.reduce((s, c) => s + c.impressions, 0),
      yellowImpressions: yellow.reduce((s, c) => s + c.impressions, 0),
      redImpressions: red.reduce((s, c) => s + c.impressions, 0),
      neutralImpressions: neutral.reduce((s, c) => s + c.impressions, 0),
    },
    priorityYellow: yellow.slice(0, 10),
  };
}
