/**
 * Programmatic Comparison Page Generator
 * 
 * Generates "Best {productType} for {useCase}" SEO pages by combining
 * the use-case database with the existing AI guide generator.
 */

import { generateGuide, type GuideGenerationResult, type BatchGenerationResult } from '@/lib/ai-guide-generator';
import { SCALING_GUIDES } from '@/lib/guide-scaling-150';
import useCases from '@/data/programmaticUseCases.json';

// ============= TYPES =============

export interface ComparisonPageInput {
  productType: string;
  useCase: string;
}

export interface ComparisonPageConfig {
  slug: string;
  keyword: string;
  cluster: string;
  productType: string;
  useCase: string;
}

// ============= CLUSTER MAPPING =============

const PRODUCT_TYPE_TO_CLUSTER: Record<string, string> = {
  'cat-toys': 'cat-toys',
  'cat-litter': 'cat-litter',
  'cat-trees': 'cat-trees',
  'cat-scratching-posts': 'cat-trees',
  'dog-training-toys': 'dog-training',
  'dog-car-seats': 'dog-travel',
  'dog-grooming-tools': 'dog-grooming',
  'dog-travel': 'dog-travel',
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  'cat-toys': 'cat toys',
  'cat-litter': 'cat litter',
  'cat-trees': 'cat trees',
  'cat-scratching-posts': 'cat scratching posts',
  'dog-training-toys': 'dog training toys',
  'dog-car-seats': 'dog car seats',
  'dog-grooming-tools': 'dog grooming tools',
  'dog-travel': 'dog travel gear',
};

// ============= SLUG & KEYWORD GENERATION =============

function buildSlug(productType: string, useCase: string): string {
  const pt = productType.replace(/[^a-z0-9-]/g, '');
  const uc = useCase.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
  return `best-${pt}-for-${uc}`;
}

function buildKeyword(productType: string, useCase: string): string {
  const label = PRODUCT_TYPE_LABELS[productType] || productType.replace(/-/g, ' ');
  return `best ${label} for ${useCase}`;
}

// ============= SINGLE PAGE GENERATION =============

export async function generateComparisonPage(input: ComparisonPageInput): Promise<GuideGenerationResult> {
  const cluster = PRODUCT_TYPE_TO_CLUSTER[input.productType] || 'cat-toys';
  const keyword = buildKeyword(input.productType, input.useCase);

  return generateGuide({ keyword, cluster });
}

// ============= ALL COMBINATIONS =============

export function getAllComparisonPages(): ComparisonPageConfig[] {
  const pages: ComparisonPageConfig[] = [];
  const allUseCases = useCases as Record<string, string[]>;

  for (const [productType, cases] of Object.entries(allUseCases)) {
    const cluster = PRODUCT_TYPE_TO_CLUSTER[productType] || 'cat-toys';
    for (const useCase of cases) {
      const slug = buildSlug(productType, useCase);
      pages.push({
        slug,
        keyword: buildKeyword(productType, useCase),
        cluster,
        productType,
        useCase,
      });
    }
  }

  return pages;
}

// ============= MISSING PAGES =============

export function getMissingComparisonPages(): ComparisonPageConfig[] {
  const all = getAllComparisonPages();
  return all.filter(p => !SCALING_GUIDES.some(g => g.slug === p.slug));
}

// ============= BATCH GENERATION =============

export async function generateMissingComparisonPages(productType?: string): Promise<BatchGenerationResult> {
  let missing = getMissingComparisonPages();
  if (productType) {
    missing = missing.filter(p => p.productType === productType);
  }

  const result: BatchGenerationResult = {
    guidesCreated: 0,
    internalLinksAdded: 0,
    productsConnected: 0,
    seoMetaGenerated: 0,
    errors: [],
    results: [],
  };

  for (const page of missing) {
    const genResult = await generateComparisonPage({
      productType: page.productType,
      useCase: page.useCase,
    });

    result.results.push(genResult);

    if (genResult.success && genResult.stats) {
      result.guidesCreated++;
      result.internalLinksAdded += genResult.stats.internalLinksAdded;
      result.productsConnected += genResult.stats.productsConnected;
      if (genResult.stats.seoMetaGenerated) result.seoMetaGenerated++;
    } else if (genResult.error) {
      result.errors.push(`${page.keyword}: ${genResult.error}`);
    }

    // Rate limit protection
    await new Promise(r => setTimeout(r, 2000));
  }

  return result;
}

// ============= STATS =============

export function getComparisonStats() {
  const all = getAllComparisonPages();
  const missing = getMissingComparisonPages();
  const byType: Record<string, { total: number; missing: number }> = {};

  for (const page of all) {
    if (!byType[page.productType]) byType[page.productType] = { total: 0, missing: 0 };
    byType[page.productType].total++;
  }
  for (const page of missing) {
    if (byType[page.productType]) byType[page.productType].missing++;
  }

  return {
    totalPages: all.length,
    missingPages: missing.length,
    existingPages: all.length - missing.length,
    byType,
  };
}
