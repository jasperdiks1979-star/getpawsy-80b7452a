/**
 * Monthly Top-5 SEO Optimization Routine
 * 
 * A structured monthly process to identify and optimize the TOP 5 SEO pages
 * based on Search Console and Analytics data.
 * 
 * Run this routine at the beginning of each month to maximize organic growth.
 */

// ============================================
// SELECTION CRITERIA
// ============================================

export interface PageCandidate {
  url: string;
  pageType: 'blog' | 'collection' | 'product';
  position: number;           // Average position in SERPs
  impressions: number;        // Total impressions
  clicks: number;             // Total clicks
  ctr: number;                // Click-through rate (%)
  sessions: number;           // Organic sessions
  conversions: number;        // Organic conversions
  revenue: number;            // Organic revenue
}

export const SELECTION_CRITERIA = {
  // Priority 1: Pages ranking positions 5-20 (close to page 1)
  positionRange: {
    min: 5,
    max: 20,
    description: 'Pages ranking near page 1 that can be pushed higher',
  },
  
  // Priority 2: High impressions, low CTR
  lowCTR: {
    minImpressions: 200,
    maxCTR: 3,
    description: 'Pages appearing in search but not getting clicked',
  },
  
  // Priority 3: Traffic with low conversions
  lowConversion: {
    minSessions: 50,
    maxConversionRate: 1, // Less than 1%
    description: 'Pages getting traffic but not converting',
  },
};

// ============================================
// OPTIMIZATION ACTIONS
// ============================================

export interface OptimizationAction {
  type: 'headline' | 'meta' | 'internal-links' | 'intro' | 'faq' | 'cta';
  priority: 1 | 2 | 3;
  description: string;
  howTo: string;
  estimatedImpact: 'high' | 'medium' | 'low';
}

export const OPTIMIZATION_ACTIONS: Record<string, OptimizationAction> = {
  improveHeadline: {
    type: 'headline',
    priority: 1,
    description: 'Improve headline clarity and keyword placement',
    howTo: `
      1. Move primary keyword to the front of the H1
      2. Make the benefit clear in the first 6 words
      3. Keep under 60 characters for SERP display
      4. Match user search intent (informational vs transactional)
    `,
    estimatedImpact: 'high',
  },
  
  rewriteMeta: {
    type: 'meta',
    priority: 1,
    description: 'Rewrite meta title and description for higher CTR',
    howTo: `
      META TITLE (max 60 chars):
      - Include primary keyword at the front
      - Add a clear benefit or differentiator
      - Include brand name at the end
      
      META DESCRIPTION (max 155 chars):
      - Start with an action verb or question
      - Include the primary keyword naturally
      - Mention trust signals (shipping, easy returns)
      - End with a soft call-to-action
    `,
    estimatedImpact: 'high',
  },
  
  addInternalLinks: {
    type: 'internal-links',
    priority: 1,
    description: 'Add internal links from high-authority pages',
    howTo: `
      1. Find your top 5 highest-traffic pages
      2. Add contextual links from those pages to the target page
      3. Use descriptive anchor text (not "click here")
      4. Link from relevant blog posts to collections
      5. Link from collections to product pages
      6. Aim for 3-5 new internal links per target page
    `,
    estimatedImpact: 'high',
  },
  
  improveIntro: {
    type: 'intro',
    priority: 2,
    description: 'Improve first 150 words for clarity and intent',
    howTo: `
      1. Answer the user's question in the first paragraph
      2. Include the primary keyword in the first 50 words
      3. Set clear expectations for what the page covers
      4. Use short, scannable sentences
      5. Avoid fluff and filler content
    `,
    estimatedImpact: 'medium',
  },
  
  addFAQ: {
    type: 'faq',
    priority: 2,
    description: 'Add or improve FAQ section for featured snippets',
    howTo: `
      1. Research "People Also Ask" questions for your keyword
      2. Add 3-5 relevant questions
      3. Keep answers concise (40-60 words)
      4. Use FAQ schema markup (JSON-LD)
      5. Answer the question directly in the first sentence
    `,
    estimatedImpact: 'medium',
  },
  
  improveCTA: {
    type: 'cta',
    priority: 3,
    description: 'Improve internal CTAs to drive conversions',
    howTo: `
      1. Add contextual CTAs after valuable content sections
      2. Link to relevant product pages or collections
      3. Use action-oriented button text
      4. Make CTAs visually distinct but not aggressive
      5. Add subtle trust signals near CTAs
    `,
    estimatedImpact: 'medium',
  },
};

// ============================================
// ROUTINE FUNCTIONS
// ============================================

/**
 * Select the top 5 pages for optimization based on criteria
 */
export function selectTop5Pages(candidates: PageCandidate[]): PageCandidate[] {
  const scored = candidates.map(page => {
    let score = 0;
    
    // Position score (pages 5-10 score highest)
    if (page.position >= 5 && page.position <= 10) {
      score += 100;
    } else if (page.position >= 11 && page.position <= 20) {
      score += 80;
    } else if (page.position >= 21 && page.position <= 30) {
      score += 40;
    }
    
    // Low CTR score (high impressions + low CTR = opportunity)
    if (page.impressions >= 200 && page.ctr < 3) {
      score += 60;
    }
    
    // Impression volume bonus
    score += Math.min(page.impressions / 100, 30);
    
    // Low conversion penalty (traffic but no conversions = needs work)
    if (page.sessions >= 50 && page.conversions === 0) {
      score += 40;
    }
    
    return { ...page, score };
  });
  
  // Sort by score descending and return top 5
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/**
 * Generate optimization recommendations for a page
 */
export function generateRecommendations(page: PageCandidate): OptimizationAction[] {
  const recommendations: OptimizationAction[] = [];
  
  // Position-based recommendations
  if (page.position >= 5 && page.position <= 10) {
    recommendations.push(OPTIMIZATION_ACTIONS.rewriteMeta);
    recommendations.push(OPTIMIZATION_ACTIONS.improveHeadline);
  }
  
  if (page.position >= 11 && page.position <= 30) {
    recommendations.push(OPTIMIZATION_ACTIONS.addInternalLinks);
  }
  
  // CTR-based recommendations
  if (page.impressions >= 200 && page.ctr < 3) {
    if (!recommendations.find(r => r.type === 'meta')) {
      recommendations.push(OPTIMIZATION_ACTIONS.rewriteMeta);
    }
  }
  
  // Conversion-based recommendations
  const conversionRate = page.sessions > 0 ? (page.conversions / page.sessions) * 100 : 0;
  if (page.sessions >= 50 && conversionRate < 1) {
    recommendations.push(OPTIMIZATION_ACTIONS.improveCTA);
    recommendations.push(OPTIMIZATION_ACTIONS.addInternalLinks);
  }
  
  // Content quality recommendations (always helpful)
  if (page.pageType === 'blog') {
    recommendations.push(OPTIMIZATION_ACTIONS.improveIntro);
    recommendations.push(OPTIMIZATION_ACTIONS.addFAQ);
  }
  
  // Deduplicate and sort by priority
  const unique = recommendations.filter((rec, index, self) =>
    index === self.findIndex(r => r.type === rec.type)
  );
  
  return unique.sort((a, b) => a.priority - b.priority);
}

// ============================================
// MONTHLY ROUTINE CHECKLIST
// ============================================

export const MONTHLY_ROUTINE_CHECKLIST = `
╔════════════════════════════════════════════════════════════════════╗
║            MONTHLY SEO OPTIMIZATION ROUTINE                        ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  WEEK 1: DATA COLLECTION                                           ║
║  ─────────────────────────                                         ║
║  □ Export last 28 days from Google Search Console                  ║
║  □ Export organic traffic report from GA4                          ║
║  □ Note top 10 pages by impressions                                ║
║  □ Note pages with position 5-20                                   ║
║  □ Identify pages with CTR below 3%                                ║
║                                                                    ║
║  WEEK 2: SELECTION & ANALYSIS                                      ║
║  ─────────────────────────────                                     ║
║  □ Run selectTop5Pages() with collected data                       ║
║  □ Generate recommendations for each page                          ║
║  □ Prioritize by estimated impact                                  ║
║  □ Create action items with deadlines                              ║
║                                                                    ║
║  WEEK 3: IMPLEMENTATION                                            ║
║  ─────────────────────────                                         ║
║  □ Optimize meta titles and descriptions                           ║
║  □ Improve headlines and intros                                    ║
║  □ Add internal links from high-authority pages                    ║
║  □ Update or add FAQ sections                                      ║
║  □ Improve CTAs and conversion paths                               ║
║                                                                    ║
║  WEEK 4: DOCUMENTATION                                             ║
║  ─────────────────────────                                         ║
║  □ Document all changes made                                       ║
║  □ Request re-indexing in Search Console                           ║
║  □ Set reminder to check results in 30 days                        ║
║  □ Note learnings for next month                                   ║
║                                                                    ║
╠════════════════════════════════════════════════════════════════════╣
║  RULES:                                                            ║
║  • Only publish new content after previous is indexed              ║
║  • Focus on one niche at a time                                    ║
║  • Avoid mass publishing (quality over quantity)                   ║
║  • Document every change for future reference                      ║
╚════════════════════════════════════════════════════════════════════╝
`;

// ============================================
// EXPORT HELPERS
// ============================================

export function printMonthlyChecklist(): void {
  console.log(MONTHLY_ROUTINE_CHECKLIST);
}

export function generateMonthlyReport(
  pages: PageCandidate[],
  monthYear: string
): string {
  const top5 = selectTop5Pages(pages);
  
  let report = `
# Monthly SEO Optimization Report
## ${monthYear}

### Top 5 Pages Selected for Optimization

`;
  
  top5.forEach((page, index) => {
    const recommendations = generateRecommendations(page);
    
    report += `
#### ${index + 1}. ${page.url}

| Metric | Value |
|--------|-------|
| Position | ${page.position.toFixed(1)} |
| Impressions | ${page.impressions} |
| Clicks | ${page.clicks} |
| CTR | ${page.ctr.toFixed(2)}% |
| Sessions | ${page.sessions} |
| Conversions | ${page.conversions} |

**Recommended Actions:**
${recommendations.map(r => `- [${r.priority}] ${r.description}`).join('\n')}

---
`;
  });
  
  return report;
}
