/**
 * GetPawsy — 90-Day US Growth Roadmap
 * 
 * Structured 3-phase roadmap for US-focused organic + merchant growth.
 * All metrics filtered to US Google organic + Shopping traffic only.
 */

export interface RoadmapTask {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium';
  status: 'pending' | 'in-progress' | 'done';
  revenueImpact: string;
}

export interface RoadmapPhase {
  phase: number;
  name: string;
  days: string;
  goal: string;
  tasks: RoadmapTask[];
  estimatedRevenueImpact: string;
  priorityScore: number;
}

export function generateRoadmap(): RoadmapPhase[] {
  return [
    {
      phase: 1,
      name: 'Foundation & Authority Consolidation',
      days: '1–30',
      goal: 'Stabilize CWV, consolidate internal link authority, and begin feed title testing.',
      estimatedRevenueImpact: '+5–8%',
      priorityScore: 95,
      tasks: [
        { id: 'p1-1', title: 'CWV Stabilization', description: 'Achieve LCP < 2.0s on all cornerstone pages. Verify via CrUX + PageSpeed.', priority: 'critical', status: 'in-progress', revenueImpact: '+2–3%' },
        { id: 'p1-2', title: 'Internal Link Expansion', description: 'Add 5–8 contextual links from blog/guides to /bestsellers and top collections.', priority: 'critical', status: 'pending', revenueImpact: '+1–2%' },
        { id: 'p1-3', title: 'Feed Title A/B Test', description: 'Test 3 title variants on top 20 revenue products in Merchant Center.', priority: 'high', status: 'pending', revenueImpact: '+1–2%' },
        { id: 'p1-4', title: 'Top 10 Product Page CRO', description: 'Add social proof, urgency cues, and sticky mobile CTA to top 10 revenue pages.', priority: 'high', status: 'pending', revenueImpact: '+1–2%' },
        { id: 'p1-5', title: 'FAQ Schema Expansion', description: 'Add 8+ FAQ entries with JSON-LD to all cornerstone pages for PAA capture.', priority: 'medium', status: 'done', revenueImpact: '+0.5–1%' },
        { id: 'p1-6', title: 'Bestseller Authority Upgrade', description: 'Expand /bestsellers to 2000+ words with comparison table, trust section, 12 FAQs.', priority: 'critical', status: 'done', revenueImpact: '+1–2%' },
      ],
    },
    {
      phase: 2,
      name: 'Content Expansion & Retargeting',
      days: '30–60',
      goal: 'Launch 3 new cornerstone pages, scale email capture, and activate retargeting.',
      estimatedRevenueImpact: '+8–15%',
      priorityScore: 85,
      tasks: [
        { id: 'p2-1', title: '3 New Cornerstone Pages', description: 'Create authority pages for Dog Beds 2026, Cat Litter 2026, and Dog Enrichment.', priority: 'critical', status: 'pending', revenueImpact: '+3–5%' },
        { id: 'p2-2', title: 'Comparison Content Cluster', description: 'Publish 5 "Product A vs B" comparison guides targeting high-intent keywords.', priority: 'high', status: 'pending', revenueImpact: '+2–3%' },
        { id: 'p2-3', title: 'Retargeting Optimization', description: 'Refine US-only viewed-not-purchased audience. Exclude NL + test traffic.', priority: 'high', status: 'pending', revenueImpact: '+1–2%' },
        { id: 'p2-4', title: 'Email Capture Scaling', description: 'Deploy exit-intent popup (US only) with category-based segmentation.', priority: 'medium', status: 'pending', revenueImpact: '+1–2%' },
        { id: 'p2-5', title: 'Structured Data Expansion', description: 'Add HowTo, Product, and Review schema to all guide and product pages.', priority: 'medium', status: 'pending', revenueImpact: '+1–2%' },
      ],
    },
    {
      phase: 3,
      name: 'Authority Layering & Revenue Compounding',
      days: '60–90',
      goal: 'Compound gains through authority building, external links, and CRO optimization.',
      estimatedRevenueImpact: '+12–20%',
      priorityScore: 75,
      tasks: [
        { id: 'p3-1', title: 'Authority Layering', description: 'Build 15+ support articles per money cluster to strengthen topical authority.', priority: 'high', status: 'pending', revenueImpact: '+3–5%' },
        { id: 'p3-2', title: 'External Link Acquisition', description: 'Outreach to 10 pet blogs for guest posts and resource page links.', priority: 'high', status: 'pending', revenueImpact: '+2–4%' },
        { id: 'p3-3', title: 'Conversion Rate Compounding', description: 'Implement "Frequently Bought Together" and cross-sell blocks on top 20 products.', priority: 'high', status: 'pending', revenueImpact: '+2–3%' },
        { id: 'p3-4', title: 'Category Dominance Mapping', description: 'Achieve Top 10 positions for all 4 money cluster primary keywords.', priority: 'critical', status: 'pending', revenueImpact: '+3–5%' },
        { id: 'p3-5', title: 'Revenue Per Visitor Optimization', description: 'Add 3-product comparison tables on high-AOV pages. Test bundle pricing.', priority: 'medium', status: 'pending', revenueImpact: '+2–3%' },
      ],
    },
  ];
}
