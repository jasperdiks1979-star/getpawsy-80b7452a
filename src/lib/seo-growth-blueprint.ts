/**
 * 90-Day SEO Growth Blueprint
 * 
 * Phased execution plan for maximizing organic traffic,
 * authority flow, and conversion-driven SEO.
 */

export interface BlueprintTask {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium';
  status: 'pending' | 'in-progress' | 'done';
  category: 'internal-linking' | 'content' | 'schema' | 'cwv' | 'conversion' | 'expansion';
}

export interface BlueprintPhase {
  phase: number;
  name: string;
  days: string;
  objective: string;
  tasks: BlueprintTask[];
}

export const SEO_GROWTH_BLUEPRINT: BlueprintPhase[] = [
  {
    phase: 1,
    name: 'Foundation & Authority Architecture',
    days: '1–30',
    objective: 'Fix internal linking, build pillar pages, add schema everywhere, optimize top products.',
    tasks: [
      {
        id: 'p1-01',
        title: 'Map 75 collections → 12 pillar clusters',
        description: 'Assign every SEO collection to one of 12 topical pillars. Eliminate orphan collections.',
        priority: 'critical',
        status: 'done',
        category: 'internal-linking',
      },
      {
        id: 'p1-02',
        title: 'Build 5 pillar pages (Dog Beds, Cat Condos, Dog Toys, Cat Litter, Cat Enrichment)',
        description: '1500–2500 word authority pages with subsections, product highlights, FAQ schema, and internal links to all child collections.',
        priority: 'critical',
        status: 'pending',
        category: 'content',
      },
      {
        id: 'p1-03',
        title: 'Add breadcrumb → pillar links on all child collections',
        description: 'Every sub-collection breadcrumb must link Home > Pillar > Sub-collection.',
        priority: 'critical',
        status: 'pending',
        category: 'internal-linking',
      },
      {
        id: 'p1-04',
        title: 'Optimize top 50 product pages',
        description: 'Add "From Our Guides" block, "Explore this Category" link, and ensure breadcrumb + Product schema.',
        priority: 'high',
        status: 'pending',
        category: 'schema',
      },
      {
        id: 'p1-05',
        title: 'Add 300–500 word SEO intro on all 75 collections',
        description: 'Unique content with pillar backlink, 2 related collection links, 3 blog links.',
        priority: 'high',
        status: 'pending',
        category: 'content',
      },
      {
        id: 'p1-06',
        title: 'Ensure Product + Breadcrumb + FAQ schema on all page types',
        description: 'Validate JSON-LD across products, collections, blogs, and pillar pages.',
        priority: 'high',
        status: 'done',
        category: 'schema',
      },
      {
        id: 'p1-07',
        title: 'Homepage: link to all 12 pillar pages',
        description: 'Structured "Shop by Category" grid linking to pillar /collections/ URLs.',
        priority: 'high',
        status: 'pending',
        category: 'internal-linking',
      },
    ],
  },
  {
    phase: 2,
    name: 'Content Velocity & Interlinking',
    days: '31–60',
    objective: 'Publish optimized content, aggressive interlinking, product comparisons, CWV optimization.',
    tasks: [
      {
        id: 'p2-01',
        title: 'Publish 2 optimized blog posts per week (8 total)',
        description: 'Each post links to primary collection, 2 products, and back to pillar page.',
        priority: 'critical',
        status: 'pending',
        category: 'content',
      },
      {
        id: 'p2-02',
        title: 'Create 10 product comparison articles',
        description: 'High-conversion comparison content targeting commercial intent keywords.',
        priority: 'high',
        status: 'pending',
        category: 'content',
      },
      {
        id: 'p2-03',
        title: 'Interlink blog → money collections aggressively',
        description: 'Every blog post must have 3+ links to revenue-generating collection pages.',
        priority: 'critical',
        status: 'pending',
        category: 'internal-linking',
      },
      {
        id: 'p2-04',
        title: 'Optimize CWV for product page templates',
        description: 'Target LCP < 2.5s, CLS < 0.1, INP < 200ms across all product pages.',
        priority: 'high',
        status: 'pending',
        category: 'cwv',
      },
      {
        id: 'p2-05',
        title: 'Add "Related Guides" blocks on product + collection pages',
        description: 'Auto-generated contextual guide recommendations based on pillar mapping.',
        priority: 'high',
        status: 'done',
        category: 'internal-linking',
      },
    ],
  },
  {
    phase: 3,
    name: 'Scale & Dominate',
    days: '61–90',
    objective: 'Long-tail expansion, PAA targeting, link automation, conversion optimization.',
    tasks: [
      {
        id: 'p3-01',
        title: 'Build long-tail cluster expansion (20 new sub-collections)',
        description: 'Target underserved long-tail keywords within existing pillars.',
        priority: 'high',
        status: 'pending',
        category: 'expansion',
      },
      {
        id: 'p3-02',
        title: 'FAQ expansion targeting People Also Ask',
        description: 'Add 5+ FAQ items per collection page targeting real PAA queries.',
        priority: 'high',
        status: 'pending',
        category: 'content',
      },
      {
        id: 'p3-03',
        title: 'Internal link automation engine',
        description: 'Auto-inject contextual links from blog content to products and collections.',
        priority: 'critical',
        status: 'done',
        category: 'internal-linking',
      },
      {
        id: 'p3-04',
        title: 'Add conversion blocks on high-traffic pages',
        description: 'Sticky product CTA, inline product cards, and bottom conversion sections.',
        priority: 'high',
        status: 'pending',
        category: 'conversion',
      },
      {
        id: 'p3-05',
        title: 'Orphan page elimination audit',
        description: 'Verify all pages are linked from 2+ internal sources, max click depth 3.',
        priority: 'high',
        status: 'done',
        category: 'internal-linking',
      },
    ],
  },
];

// ============= HELPERS =============

export function getPhaseProgress(phase: number): { total: number; done: number; pct: number } {
  const p = SEO_GROWTH_BLUEPRINT.find(bp => bp.phase === phase);
  if (!p) return { total: 0, done: 0, pct: 0 };
  const total = p.tasks.length;
  const done = p.tasks.filter(t => t.status === 'done').length;
  return { total, done, pct: Math.round((done / total) * 100) };
}

export function getOverallProgress(): { total: number; done: number; pct: number } {
  const total = SEO_GROWTH_BLUEPRINT.reduce((sum, p) => sum + p.tasks.length, 0);
  const done = SEO_GROWTH_BLUEPRINT.reduce((sum, p) => sum + p.tasks.filter(t => t.status === 'done').length, 0);
  return { total, done, pct: Math.round((done / total) * 100) };
}

export function getCriticalPendingTasks(): BlueprintTask[] {
  return SEO_GROWTH_BLUEPRINT
    .flatMap(p => p.tasks)
    .filter(t => t.priority === 'critical' && t.status === 'pending');
}
