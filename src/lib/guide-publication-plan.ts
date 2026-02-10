/**
 * BATCH 1 — 25 Guide Publication Plan
 * 
 * Module A: Publication order with priorities
 * Module B: Internal anchor matrix per guide
 */

export interface GuideAnchorLink {
  targetSlug: string;
  anchorText: string;
  anchorType: 'exact' | 'partial' | 'branded';
  contextPlacement: string; // Where in the article this link appears
}

export interface GuidePlanEntry {
  id: number;
  slug: string;
  title: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: 'commercial' | 'informational';
  priority: number;
  week: 1 | 2 | 3 | 4;
  cluster: 'cat-litter' | 'cat-furniture';
  role: 'cornerstone' | 'info-hub' | 'high-aov' | 'supporting';
  minFaqs: number;
  minProductLinks: number;
  hasComparisonTable: boolean;
  outgoingLinks: GuideAnchorLink[];
  categorySlug: string;
  categoryLabel: string;
}

// ============= FULL 25-GUIDE PLAN =============

export const GUIDE_PUBLICATION_PLAN: GuidePlanEntry[] = [
  // ==================== WEEK 1 ====================
  {
    id: 1, slug: 'best-cat-litter-box-2026', week: 1, priority: 96,
    title: 'Best Cat Litter Box (2026)',
    primaryKeyword: 'best cat litter box',
    secondaryKeywords: ['cat litter box reviews', 'top rated litter box', 'litter box buying guide'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'cornerstone',
    minFaqs: 8, minProductLinks: 12, hasComparisonTable: true,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'how-many-litter-boxes-per-cat', anchorText: 'how many litter boxes you actually need', anchorType: 'partial', contextPlacement: 'Introduction section' },
      { targetSlug: 'best-cat-litter-box-furniture-enclosures-2026', anchorText: 'litter box furniture and enclosures', anchorType: 'partial', contextPlacement: 'Furniture section' },
      { targetSlug: 'best-self-cleaning-litter-boxes', anchorText: 'self-cleaning litter boxes', anchorType: 'exact', contextPlacement: 'Automatic section' },
      { targetSlug: 'best-extra-large-litter-boxes', anchorText: 'extra large options for big cats', anchorType: 'partial', contextPlacement: 'Size section' },
      { targetSlug: 'best-litter-box-maine-coons', anchorText: 'best picks for Maine Coons', anchorType: 'partial', contextPlacement: 'Breed section' },
      { targetSlug: 'stainless-steel-vs-plastic-litter-box', anchorText: 'stainless steel vs plastic comparison', anchorType: 'partial', contextPlacement: 'Materials section' },
    ],
  },
  {
    id: 2, slug: 'how-many-litter-boxes-per-cat', week: 1, priority: 93,
    title: 'How Many Litter Boxes Do You Need? The Complete Rule',
    primaryKeyword: 'how many litter boxes per cat',
    secondaryKeywords: ['multi cat litter rule', 'litter box placement guide', 'one per cat rule'],
    searchIntent: 'informational', cluster: 'cat-litter', role: 'info-hub',
    minFaqs: 6, minProductLinks: 8, hasComparisonTable: false,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-litter-boxes-multi-cat', anchorText: 'best litter boxes for multi-cat homes', anchorType: 'exact', contextPlacement: 'Multi-cat section' },
      { targetSlug: 'best-extra-large-litter-boxes', anchorText: 'extra large litter boxes', anchorType: 'exact', contextPlacement: 'Size recommendations' },
      { targetSlug: 'best-litter-box-maine-coons', anchorText: 'litter boxes sized for Maine Coons', anchorType: 'partial', contextPlacement: 'Breed section' },
      { targetSlug: 'best-odor-control-litter-boxes', anchorText: 'litter boxes with better odor control', anchorType: 'partial', contextPlacement: 'Odor tips section' },
    ],
  },
  {
    id: 3, slug: 'best-cat-litter-box-furniture-enclosures-2026', week: 1, priority: 92,
    title: 'Best Cat Litter Box Furniture & Enclosures (2026)',
    primaryKeyword: 'cat litter box furniture',
    secondaryKeywords: ['litter box enclosure', 'covered litter box', 'litter box end table'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'high-aov',
    minFaqs: 6, minProductLinks: 10, hasComparisonTable: true,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-cat-litter-box-2026', anchorText: 'best cat litter boxes overall', anchorType: 'partial', contextPlacement: 'Introduction' },
      { targetSlug: 'best-enclosed-litter-boxes-small-spaces', anchorText: 'enclosed boxes for small apartments', anchorType: 'partial', contextPlacement: 'Small space section' },
      { targetSlug: 'best-litter-box-drawers-easy-cleaning', anchorText: 'litter boxes with pull-out drawers', anchorType: 'partial', contextPlacement: 'Drawer section' },
    ],
  },
  {
    id: 4, slug: 'best-litter-boxes-multi-cat', week: 1, priority: 91,
    title: 'Best Litter Boxes for Multi-Cat Homes',
    primaryKeyword: 'litter box for multiple cats',
    secondaryKeywords: ['two cat litter box', 'multi cat household litter'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 6, minProductLinks: 8, hasComparisonTable: true,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-cat-litter-box-2026', anchorText: 'our top litter box picks', anchorType: 'partial', contextPlacement: 'Introduction' },
      { targetSlug: 'how-many-litter-boxes-per-cat', anchorText: 'the one-per-cat-plus-one rule', anchorType: 'partial', contextPlacement: 'Rule explanation' },
      { targetSlug: 'best-extra-large-litter-boxes', anchorText: 'extra large litter boxes', anchorType: 'exact', contextPlacement: 'Size section' },
    ],
  },
  {
    id: 5, slug: 'best-extra-large-litter-boxes', week: 1, priority: 90,
    title: 'Best Extra Large Litter Boxes for Big Cats',
    primaryKeyword: 'extra large litter box',
    secondaryKeywords: ['jumbo litter box', 'oversized cat box'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: true,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-cat-litter-box-2026', anchorText: 'best cat litter boxes', anchorType: 'exact', contextPlacement: 'Introduction' },
      { targetSlug: 'best-litter-box-maine-coons', anchorText: 'our dedicated Maine Coon litter box guide', anchorType: 'partial', contextPlacement: 'Breed section' },
      { targetSlug: 'how-many-litter-boxes-per-cat', anchorText: 'how many boxes your cats need', anchorType: 'partial', contextPlacement: 'Multi-cat note' },
    ],
  },
  {
    id: 6, slug: 'best-cat-trees-small-apartments', week: 1, priority: 95,
    title: 'Best Cat Trees for Small Apartments',
    primaryKeyword: 'cat tree for small apartment',
    secondaryKeywords: ['compact cat tree', 'apartment cat tower', 'space saving cat tree'],
    searchIntent: 'commercial', cluster: 'cat-furniture', role: 'cornerstone',
    minFaqs: 6, minProductLinks: 10, hasComparisonTable: true,
    categorySlug: 'cat-trees-and-condos', categoryLabel: 'Cat Trees',
    outgoingLinks: [
      { targetSlug: 'best-cat-condos-indoor', anchorText: 'best cat condos for indoor cats', anchorType: 'exact', contextPlacement: 'Alternative section' },
      { targetSlug: 'cat-tree-size-guide', anchorText: 'how to choose the right cat tree size', anchorType: 'partial', contextPlacement: 'Size section' },
      { targetSlug: 'best-tall-cat-trees', anchorText: 'tall cat trees that save floor space', anchorType: 'partial', contextPlacement: 'Vertical space section' },
    ],
  },

  // ==================== WEEK 2 ====================
  {
    id: 7, slug: 'best-litter-box-maine-coons', week: 2, priority: 89,
    title: 'Best Cat Litter Box for Maine Coons',
    primaryKeyword: 'litter box for maine coon',
    secondaryKeywords: ['big cat litter box', 'maine coon litter needs'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: true,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-extra-large-litter-boxes', anchorText: 'extra large litter boxes', anchorType: 'exact', contextPlacement: 'Size section' },
      { targetSlug: 'best-cat-litter-box-2026', anchorText: 'best cat litter boxes of 2026', anchorType: 'partial', contextPlacement: 'Introduction' },
      { targetSlug: 'best-cat-trees-maine-coons', anchorText: 'cat trees built for Maine Coons', anchorType: 'partial', contextPlacement: 'Cross-cluster CTA' },
    ],
  },
  {
    id: 8, slug: 'best-self-cleaning-litter-boxes', week: 2, priority: 88,
    title: 'Best Self-Cleaning Litter Boxes for Busy Cat Owners',
    primaryKeyword: 'automatic cat litter box',
    secondaryKeywords: ['self cleaning litter box', 'auto scoop litter box'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'high-aov',
    minFaqs: 6, minProductLinks: 8, hasComparisonTable: true,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-cat-litter-box-2026', anchorText: 'top-rated litter boxes', anchorType: 'partial', contextPlacement: 'Introduction' },
      { targetSlug: 'best-odor-control-litter-boxes', anchorText: 'litter boxes for odor control', anchorType: 'partial', contextPlacement: 'Odor section' },
      { targetSlug: 'best-cat-litter-box-furniture-enclosures-2026', anchorText: 'furniture enclosures to hide your litter box', anchorType: 'partial', contextPlacement: 'Aesthetics section' },
    ],
  },
  {
    id: 9, slug: 'best-odor-control-litter-boxes', week: 2, priority: 86,
    title: 'Best Odor Control Litter Boxes for Apartments',
    primaryKeyword: 'odor control litter box',
    secondaryKeywords: ['apartment litter box', 'no smell cat box'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: false,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'how-many-litter-boxes-per-cat', anchorText: 'proper litter box placement', anchorType: 'partial', contextPlacement: 'Placement tips' },
      { targetSlug: 'best-enclosed-litter-boxes-small-spaces', anchorText: 'enclosed litter boxes for small spaces', anchorType: 'partial', contextPlacement: 'Small apartment section' },
      { targetSlug: 'best-cat-litter-box-2026', anchorText: 'best litter boxes overall', anchorType: 'partial', contextPlacement: 'Introduction' },
    ],
  },
  {
    id: 10, slug: 'best-cat-condos-indoor', week: 2, priority: 93,
    title: 'Best Cat Condos for Indoor Cats',
    primaryKeyword: 'cat condo',
    secondaryKeywords: ['indoor cat condo', 'cat condo with hiding spots'],
    searchIntent: 'commercial', cluster: 'cat-furniture', role: 'high-aov',
    minFaqs: 6, minProductLinks: 10, hasComparisonTable: true,
    categorySlug: 'cat-trees-and-condos', categoryLabel: 'Cat Trees',
    outgoingLinks: [
      { targetSlug: 'best-cat-trees-small-apartments', anchorText: 'cat trees for small apartments', anchorType: 'exact', contextPlacement: 'Apartment section' },
      { targetSlug: 'cat-tree-vs-cat-condo', anchorText: 'how cat trees and condos compare', anchorType: 'partial', contextPlacement: 'Comparison section' },
      { targetSlug: 'best-cat-towers-large-cats', anchorText: 'towers for large cats', anchorType: 'partial', contextPlacement: 'Size section' },
    ],
  },
  {
    id: 11, slug: 'best-cat-towers-large-cats', week: 2, priority: 90,
    title: 'Best Cat Towers for Large Cats',
    primaryKeyword: 'cat tower for large cats',
    secondaryKeywords: ['heavy duty cat tree', 'sturdy cat tower', 'xl cat tower'],
    searchIntent: 'commercial', cluster: 'cat-furniture', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: true,
    categorySlug: 'cat-trees-and-condos', categoryLabel: 'Cat Trees',
    outgoingLinks: [
      { targetSlug: 'best-cat-trees-maine-coons', anchorText: 'cat trees for Maine Coons', anchorType: 'exact', contextPlacement: 'Breed section' },
      { targetSlug: 'best-tall-cat-trees', anchorText: 'tall cat trees for climbers', anchorType: 'partial', contextPlacement: 'Height section' },
      { targetSlug: 'best-cat-condos-indoor', anchorText: 'cat condos with extra space', anchorType: 'partial', contextPlacement: 'Alternative section' },
    ],
  },
  {
    id: 12, slug: 'best-cat-trees-scratching-posts', week: 2, priority: 88,
    title: 'Best Cat Trees with Scratching Posts Built In',
    primaryKeyword: 'cat tree with scratching post',
    secondaryKeywords: ['scratching combo tree', 'sisal cat tree'],
    searchIntent: 'commercial', cluster: 'cat-furniture', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: false,
    categorySlug: 'cat-trees-and-condos', categoryLabel: 'Cat Trees',
    outgoingLinks: [
      { targetSlug: 'best-cat-scratching-posts', anchorText: 'standalone scratching posts', anchorType: 'partial', contextPlacement: 'Standalone section' },
      { targetSlug: 'best-cat-trees-small-apartments', anchorText: 'compact cat trees for apartments', anchorType: 'partial', contextPlacement: 'Space section' },
      { targetSlug: 'best-cat-condos-indoor', anchorText: 'cat condos with built-in scratchers', anchorType: 'partial', contextPlacement: 'Condo comparison' },
    ],
  },
  {
    id: 13, slug: 'cat-tree-size-guide', week: 2, priority: 87,
    title: 'How to Choose the Right Cat Tree Size',
    primaryKeyword: 'cat tree size guide',
    secondaryKeywords: ['what size cat tree', 'cat tree height guide'],
    searchIntent: 'informational', cluster: 'cat-furniture', role: 'info-hub',
    minFaqs: 6, minProductLinks: 8, hasComparisonTable: false,
    categorySlug: 'cat-trees-and-condos', categoryLabel: 'Cat Trees',
    outgoingLinks: [
      { targetSlug: 'best-cat-trees-small-apartments', anchorText: 'cat trees for small apartments', anchorType: 'exact', contextPlacement: 'Small size section' },
      { targetSlug: 'best-cat-towers-large-cats', anchorText: 'towers designed for large cats', anchorType: 'partial', contextPlacement: 'Large cat section' },
      { targetSlug: 'best-tall-cat-trees', anchorText: 'tall cat trees for vertical space', anchorType: 'partial', contextPlacement: 'Tall section' },
      { targetSlug: 'best-cat-trees-maine-coons', anchorText: 'cat trees for Maine Coons', anchorType: 'exact', contextPlacement: 'Breed-specific section' },
    ],
  },

  // ==================== WEEK 3 ====================
  {
    id: 14, slug: 'stainless-steel-vs-plastic-litter-box', week: 3, priority: 85,
    title: 'Stainless Steel vs Plastic Litter Boxes: Which Is Better?',
    primaryKeyword: 'stainless steel litter box',
    secondaryKeywords: ['metal vs plastic cat box', 'durable litter box'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: true,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-extra-large-litter-boxes', anchorText: 'extra large litter boxes', anchorType: 'exact', contextPlacement: 'Size section' },
      { targetSlug: 'best-cat-litter-box-2026', anchorText: 'best litter boxes of 2026', anchorType: 'partial', contextPlacement: 'Introduction' },
      { targetSlug: 'best-self-cleaning-litter-boxes', anchorText: 'automatic litter box options', anchorType: 'partial', contextPlacement: 'Tech section' },
    ],
  },
  {
    id: 15, slug: 'best-litter-boxes-senior-cats', week: 3, priority: 84,
    title: 'Best Litter Boxes for Senior Cats with Low Entry',
    primaryKeyword: 'low entry litter box',
    secondaryKeywords: ['senior cat litter box', 'easy access cat box'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: false,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-litter-box-maine-coons', anchorText: 'litter boxes for Maine Coons', anchorType: 'exact', contextPlacement: 'Large breed note' },
      { targetSlug: 'how-many-litter-boxes-per-cat', anchorText: 'litter box placement tips', anchorType: 'partial', contextPlacement: 'Accessibility section' },
      { targetSlug: 'best-extra-large-litter-boxes', anchorText: 'spacious extra large boxes', anchorType: 'partial', contextPlacement: 'Size section' },
    ],
  },
  {
    id: 16, slug: 'top-entry-vs-front-entry-litter-box', week: 3, priority: 83,
    title: 'Top Entry vs Front Entry Litter Box: Pros and Cons',
    primaryKeyword: 'top entry litter box',
    secondaryKeywords: ['front entry litter box', 'litter box entry types'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 6, hasComparisonTable: true,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-cat-litter-box-furniture-enclosures-2026', anchorText: 'litter box furniture options', anchorType: 'partial', contextPlacement: 'Furniture section' },
      { targetSlug: 'best-litter-boxes-multi-cat', anchorText: 'multi-cat litter solutions', anchorType: 'partial', contextPlacement: 'Multi-cat note' },
      { targetSlug: 'best-cat-litter-box-2026', anchorText: 'best overall litter boxes', anchorType: 'partial', contextPlacement: 'Introduction' },
    ],
  },
  {
    id: 17, slug: 'best-tall-cat-trees', week: 3, priority: 85,
    title: 'Best Tall Cat Trees for Climbing Cats',
    primaryKeyword: 'tall cat tree',
    secondaryKeywords: ['floor to ceiling cat tree', 'climbing tower'],
    searchIntent: 'commercial', cluster: 'cat-furniture', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: false,
    categorySlug: 'cat-trees-and-condos', categoryLabel: 'Cat Trees',
    outgoingLinks: [
      { targetSlug: 'best-cat-trees-small-apartments', anchorText: 'apartment-friendly cat trees', anchorType: 'partial', contextPlacement: 'Small space section' },
      { targetSlug: 'best-cat-towers-large-cats', anchorText: 'sturdy towers for large cats', anchorType: 'partial', contextPlacement: 'Weight section' },
      { targetSlug: 'best-cat-trees-scratching-posts', anchorText: 'trees with built-in scratching posts', anchorType: 'partial', contextPlacement: 'Features section' },
    ],
  },
  {
    id: 18, slug: 'best-cat-scratching-posts', week: 3, priority: 84,
    title: 'Best Cat Scratching Posts That Actually Last',
    primaryKeyword: 'best cat scratching post',
    secondaryKeywords: ['durable scratching post', 'sisal vs cardboard'],
    searchIntent: 'commercial', cluster: 'cat-furniture', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: false,
    categorySlug: 'cat-trees-and-condos', categoryLabel: 'Cat Trees',
    outgoingLinks: [
      { targetSlug: 'best-cat-trees-scratching-posts', anchorText: 'cat trees with scratching posts', anchorType: 'exact', contextPlacement: 'Combo section' },
      { targetSlug: 'best-cat-condos-indoor', anchorText: 'cat condos for indoor cats', anchorType: 'partial', contextPlacement: 'All-in-one section' },
      { targetSlug: 'best-cat-trees-small-apartments', anchorText: 'compact cat trees', anchorType: 'partial', contextPlacement: 'Apartment section' },
    ],
  },
  {
    id: 19, slug: 'cat-tree-vs-cat-condo', week: 3, priority: 83,
    title: "Cat Tree vs Cat Condo: What's the Difference?",
    primaryKeyword: 'cat tree vs cat condo',
    secondaryKeywords: ['difference tree condo', 'which is better for cats'],
    searchIntent: 'informational', cluster: 'cat-furniture', role: 'supporting',
    minFaqs: 6, minProductLinks: 6, hasComparisonTable: true,
    categorySlug: 'cat-trees-and-condos', categoryLabel: 'Cat Trees',
    outgoingLinks: [
      { targetSlug: 'best-cat-condos-indoor', anchorText: 'best cat condos', anchorType: 'exact', contextPlacement: 'Condo section' },
      { targetSlug: 'best-cat-trees-small-apartments', anchorText: 'best cat trees for apartments', anchorType: 'partial', contextPlacement: 'Tree section' },
      { targetSlug: 'cat-tree-size-guide', anchorText: 'cat tree sizing guide', anchorType: 'partial', contextPlacement: 'How to choose section' },
    ],
  },

  // ==================== WEEK 4 ====================
  {
    id: 20, slug: 'how-to-stop-litter-tracking', week: 4, priority: 82,
    title: 'How to Stop Litter Tracking in Your Home',
    primaryKeyword: 'cat litter tracking solutions',
    secondaryKeywords: ['litter mat', 'reduce litter mess', 'anti tracking mat'],
    searchIntent: 'informational', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 6, hasComparisonTable: false,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-cat-litter-box-furniture-enclosures-2026', anchorText: 'litter box furniture that contains mess', anchorType: 'partial', contextPlacement: 'Furniture solution section' },
      { targetSlug: 'top-entry-vs-front-entry-litter-box', anchorText: 'top entry litter boxes for less tracking', anchorType: 'partial', contextPlacement: 'Entry type section' },
      { targetSlug: 'best-odor-control-litter-boxes', anchorText: 'odor control litter boxes', anchorType: 'exact', contextPlacement: 'Odor section' },
    ],
  },
  {
    id: 21, slug: 'hooded-vs-open-litter-box', week: 4, priority: 78,
    title: 'Hooded vs Open Litter Box: What Cats Actually Prefer',
    primaryKeyword: 'hooded litter box vs open',
    secondaryKeywords: ['covered vs uncovered litter box', 'cat litter box preference'],
    searchIntent: 'informational', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 6, hasComparisonTable: true,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'top-entry-vs-front-entry-litter-box', anchorText: 'top entry vs front entry options', anchorType: 'partial', contextPlacement: 'Entry comparison section' },
      { targetSlug: 'best-odor-control-litter-boxes', anchorText: 'litter boxes with odor control', anchorType: 'partial', contextPlacement: 'Odor section' },
      { targetSlug: 'best-litter-boxes-senior-cats', anchorText: 'low-entry boxes for senior cats', anchorType: 'partial', contextPlacement: 'Accessibility section' },
    ],
  },
  {
    id: 22, slug: 'best-enclosed-litter-boxes-small-spaces', week: 4, priority: 75,
    title: 'Best Enclosed Litter Boxes for Small Spaces',
    primaryKeyword: 'enclosed litter box small space',
    secondaryKeywords: ['compact litter box', 'small apartment cat box'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: false,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-cat-litter-box-furniture-enclosures-2026', anchorText: 'litter box furniture and enclosures', anchorType: 'exact', contextPlacement: 'Furniture section' },
      { targetSlug: 'best-odor-control-litter-boxes', anchorText: 'odor control for apartments', anchorType: 'partial', contextPlacement: 'Apartment section' },
      { targetSlug: 'best-cat-litter-box-2026', anchorText: 'best litter boxes', anchorType: 'exact', contextPlacement: 'Introduction' },
    ],
  },
  {
    id: 23, slug: 'best-litter-box-drawers-easy-cleaning', week: 4, priority: 72,
    title: 'Best Litter Box with Drawers for Easy Cleaning',
    primaryKeyword: 'litter box drawer design',
    secondaryKeywords: ['pull out litter box', 'easy clean cat box'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 6, hasComparisonTable: false,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'best-cat-litter-box-furniture-enclosures-2026', anchorText: 'litter box furniture', anchorType: 'exact', contextPlacement: 'Furniture section' },
      { targetSlug: 'stainless-steel-vs-plastic-litter-box', anchorText: 'stainless steel litter boxes', anchorType: 'exact', contextPlacement: 'Material section' },
      { targetSlug: 'best-cat-litter-box-2026', anchorText: 'our top litter box recommendations', anchorType: 'partial', contextPlacement: 'Introduction' },
    ],
  },
  {
    id: 24, slug: 'dome-litter-box-vs-rectangular', week: 4, priority: 70,
    title: 'Dome Litter Box vs Rectangular: Which Shape Is Best?',
    primaryKeyword: 'dome litter box',
    secondaryKeywords: ['round cat box', 'litter box shape comparison'],
    searchIntent: 'commercial', cluster: 'cat-litter', role: 'supporting',
    minFaqs: 5, minProductLinks: 6, hasComparisonTable: true,
    categorySlug: 'cat-litter-boxes', categoryLabel: 'Cat Litter Boxes',
    outgoingLinks: [
      { targetSlug: 'hooded-vs-open-litter-box', anchorText: 'hooded vs open litter boxes', anchorType: 'exact', contextPlacement: 'Coverage section' },
      { targetSlug: 'top-entry-vs-front-entry-litter-box', anchorText: 'entry type comparison', anchorType: 'partial', contextPlacement: 'Entry section' },
      { targetSlug: 'best-enclosed-litter-boxes-small-spaces', anchorText: 'enclosed boxes for small spaces', anchorType: 'partial', contextPlacement: 'Space section' },
    ],
  },
  {
    id: 25, slug: 'best-cat-trees-maine-coons', week: 4, priority: 82,
    title: 'Best Cat Trees for Maine Coons',
    primaryKeyword: 'cat tree for maine coon',
    secondaryKeywords: ['xxl cat tree', 'large breed cat tree', 'heavy cat tree'],
    searchIntent: 'commercial', cluster: 'cat-furniture', role: 'supporting',
    minFaqs: 5, minProductLinks: 8, hasComparisonTable: true,
    categorySlug: 'cat-trees-and-condos', categoryLabel: 'Cat Trees',
    outgoingLinks: [
      { targetSlug: 'best-litter-box-maine-coons', anchorText: 'litter boxes for Maine Coons', anchorType: 'exact', contextPlacement: 'Cross-cluster CTA' },
      { targetSlug: 'best-cat-towers-large-cats', anchorText: 'heavy-duty cat towers', anchorType: 'partial', contextPlacement: 'Sturdy section' },
      { targetSlug: 'best-tall-cat-trees', anchorText: 'tall cat trees', anchorType: 'exact', contextPlacement: 'Height section' },
    ],
  },
];

// ============= HELPER FUNCTIONS =============

export function getGuidesByWeek(week: 1 | 2 | 3 | 4): GuidePlanEntry[] {
  return GUIDE_PUBLICATION_PLAN.filter(g => g.week === week).sort((a, b) => b.priority - a.priority);
}

export function getGuidesByCluster(cluster: 'cat-litter' | 'cat-furniture'): GuidePlanEntry[] {
  return GUIDE_PUBLICATION_PLAN.filter(g => g.cluster === cluster).sort((a, b) => b.priority - a.priority);
}

export function getCornerstoneGuides(): GuidePlanEntry[] {
  return GUIDE_PUBLICATION_PLAN.filter(g => g.role === 'cornerstone');
}

export function getInfoHubs(): GuidePlanEntry[] {
  return GUIDE_PUBLICATION_PLAN.filter(g => g.role === 'info-hub');
}

export function getIncomingLinksCount(slug: string): number {
  return GUIDE_PUBLICATION_PLAN.reduce((count, guide) => {
    return count + guide.outgoingLinks.filter(l => l.targetSlug === slug).length;
  }, 0);
}
