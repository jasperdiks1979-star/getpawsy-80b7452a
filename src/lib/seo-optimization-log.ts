/**
 * SEO Optimization Log
 * 
 * This file documents all data-driven SEO optimizations performed on the site.
 * Use this as a reference for monthly SEO reviews and to track what has been changed.
 */

// ============================================
// OPTIMIZATION #1: FEBRUARY 2026
// ============================================

export const OPTIMIZATION_LOG = [
  {
    date: '2026-02-01',
    niche: 'Indoor Cat Enrichment',
    targetPage: '/collections/indoor-cat-enrichment',
    
    // GSC Data Analysis
    gscAnalysis: {
      topKeywords: [
        { keyword: 'cat trees condos', position: 56.6, impressions: 20 },
        { keyword: 'cat condos', position: 74.1, impressions: 32 },
        { keyword: 'cat condo', position: 88.4, impressions: 16 },
        { keyword: 'cat tower', position: 90.9, impressions: 13 },
        { keyword: 'cat tree house', position: 96.9, impressions: 9 },
        { keyword: 'kitten tree', position: 70.8, impressions: 14 },
      ],
      summary: 'Cat furniture keywords showed strongest traction with 100+ combined impressions. Position 56-74 range indicates early page 2/3 rankings with momentum potential.',
    },
    
    // Niche Selection Rationale
    nicheRationale: [
      'Strongest GSC signals among all tracked niches',
      'Multiple related keywords showing impressions (compound potential)',
      'High buyer intent - product-focused searches',
      'High AOV category ($40-150 per item)',
      'Existing content infrastructure (blog + collection)',
    ],
    
    // Optimizations Performed
    optimizations: {
      collectionPage: {
        oldTitle: 'Indoor Cat Enrichment for Everyday Use | GetPawsy',
        newTitle: 'Cat Enrichment Toys for Indoor Cats | Cat Trees & Condos',
        oldDescription: 'Discover practical indoor cat enrichment toys designed for comfort and daily life.',
        newDescription: 'Shop cat enrichment toys, cat trees, and condos that indoor cats love. Mental stimulation & exercise. Fast US shipping, easy returns. GetPawsy.',
        introChanges: 'Added primary keywords in first 50 words: cat enrichment toys, cat trees, condos, puzzle feeders, indoor cats',
        faqExpanded: true,
        faqCount: 5,
        keywordsAdded: ['cat condo', 'cat tower', 'cat trees condos', 'cat tree house', 'kitten toys'],
      },
      blogArticle: {
        oldTitle: 'Indoor Cat Enrichment: How to Keep Your Cat Happy Indoors',
        newTitle: 'Indoor Cat Enrichment: Best Toys & Activities to Keep Cats Happy',
        metaImproved: true,
        internalLinksAdded: ['Collection link in content'],
      },
    },
    
    // Expected Outcomes
    expectedOutcomes: [
      'Position improvement from 56+ to sub-30 within 30 days',
      'CTR improvement from meta title/description optimization',
      'Increased impressions as page gains authority',
      'Supporting blog article to reinforce collection authority',
    ],
    
    // Next Steps
    nextSteps: [
      'Monitor GSC positions weekly for target keywords',
      'Add 2-3 internal links from other blog articles to collection',
      'Consider new blog article specifically about cat trees/condos',
      'Track CTR changes after re-indexing',
    ],
  },
];

// ============================================
// SEO NICHE PRIORITY ORDER
// ============================================

export const SEO_NICHE_PRIORITIES = {
  primary: {
    niche: 'Indoor Cat Enrichment',
    targetKeywords: [
      'cat enrichment toys',
      'cat trees condos', 
      'indoor cat toys',
      'cat condo',
      'cat tower',
    ],
    collectionUrl: '/collections/indoor-cat-enrichment',
    blogUrl: '/blog/indoor-cat-enrichment-how-to-keep-your-cat-happy-indoors',
    status: 'Active Optimization',
  },
  secondary: [
    {
      niche: 'Dog Travel & Car Safety',
      status: 'Monitoring - weak initial signals',
      collectionUrl: '/collections/dog-travel-accessories',
    },
    {
      niche: 'No-Spill Dog Feeding',
      status: 'Monitoring - building impressions',
      collectionUrl: '/collections/no-spill-dog-feeding',
    },
  ],
};

// ============================================
// MONTHLY OPTIMIZATION CHECKLIST
// ============================================

export const MONTHLY_SEO_CHECKLIST = `
📊 MONTHLY SEO OPTIMIZATION ROUTINE

WEEK 1: DATA COLLECTION
□ Export last 28 days from Google Search Console
□ Identify keywords ranking positions 11-30 (near page 1)
□ Identify keywords with high impressions but low CTR
□ Note new keywords that weren't tracked before

WEEK 2: ANALYSIS & SELECTION
□ Select top 5 pages for optimization
□ Prioritize by: position momentum + buyer intent + commercial value
□ Generate specific recommendations per page

WEEK 3: IMPLEMENTATION
□ Optimize meta titles (primary keyword front-loaded)
□ Rewrite meta descriptions for CTR
□ Improve first 150 words of content
□ Add/improve FAQ sections
□ Strengthen internal linking

WEEK 4: DOCUMENTATION
□ Log all changes in seo-optimization-log.ts
□ Request re-indexing in Search Console
□ Set reminder to review results in 30 days
□ Note learnings for next month

RULES:
• Only publish new content after previous is indexed
• Focus on one niche at a time
• Avoid mass publishing
• Document every optimization
`;

// ============================================
// KEYWORD TRACKING TARGETS
// ============================================

export const KEYWORD_TARGETS_2026 = {
  indoor_cat_enrichment: {
    targetPosition: 10, // Top 10 goal
    keywords: [
      'cat enrichment toys',
      'indoor cat toys',
      'cat trees condos',
      'boredom toys for cats',
      'cat condo',
      'cat tower',
    ],
    trackingStarted: '2026-02-01',
  },
  dog_travel: {
    targetPosition: 20, // Page 2 goal initially
    keywords: [
      'dog car safety',
      'dog travel accessories',
      'dog car seat cover',
    ],
    trackingStarted: '2026-02-01',
  },
  dog_feeding: {
    targetPosition: 20,
    keywords: [
      'no spill dog bowl',
      'mess free dog feeder',
      'slow feeder bowl',
    ],
    trackingStarted: '2026-02-01',
  },
};
