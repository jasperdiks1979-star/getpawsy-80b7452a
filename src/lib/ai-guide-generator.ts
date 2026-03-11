/**
 * AI Guide Generator — calls the generate-gap-guide edge function
 * to produce SEO-optimized pet care guides from keyword topics.
 */

import { supabase } from '@/integrations/supabase/client';
import { SCALING_GUIDES } from './guide-scaling-150';
import type { GuideData } from '@/types/guide';
import seoKeywordsLegacy from '@/data/seo-guide-keywords.json';
import seoKeywordsDatabase from '@/data/seoGuideKeywordDatabase.json';

// Merge both keyword sources, deduplicating
function mergeKeywords(): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const source of [seoKeywordsLegacy, seoKeywordsDatabase] as Record<string, string[]>[]) {
    for (const [cluster, keywords] of Object.entries(source)) {
      if (!merged[cluster]) merged[cluster] = [];
      for (const kw of keywords) {
        if (!merged[cluster].includes(kw)) merged[cluster].push(kw);
      }
    }
  }
  return merged;
}

const seoKeywords = mergeKeywords();

// ============= TYPES =============

export interface GuideGenerationInput {
  keyword: string;
  cluster: string;
}

export interface GuideGenerationResult {
  success: boolean;
  guide?: GuideData;
  error?: string;
  stats?: {
    internalLinksAdded: number;
    productsConnected: number;
    seoMetaGenerated: boolean;
  };
}

export interface BatchGenerationResult {
  guidesCreated: number;
  internalLinksAdded: number;
  productsConnected: number;
  seoMetaGenerated: number;
  errors: string[];
  results: GuideGenerationResult[];
}

// ============= SLUG GENERATION =============

function keywordToSlug(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// ============= H2 & FAQ TEMPLATES =============

const CLUSTER_H2S: Record<string, string[]> = {
  'cat-toys': [
    'Why Cat Enrichment Matters More Than You Think',
    'Types of Cat Toys and When to Use Each',
    'Best Products for This Use Case',
    'What to Look for When Buying',
    'Common Mistakes Cat Owners Make',
  ],
  'cat-litter': [
    'Why Choosing the Right Litter Setup Matters',
    'Types of Litter and Litter Boxes Compared',
    'Best Products for Your Situation',
    'Buying Guide: What to Consider',
    'Mistakes That Lead to Litter Box Problems',
  ],
  'cat-trees': [
    'Why Your Cat Needs Vertical Space',
    'Types of Cat Trees and Furniture',
    'Best Products for Different Cat Sizes',
    'Key Features to Look For',
    'Common Buying Mistakes to Avoid',
  ],
  'dog-training': [
    'Why the Right Training Tools Make a Difference',
    'Types of Training Equipment Compared',
    'Best Products for Training Success',
    'What to Look for When Choosing Training Gear',
    'Training Mistakes That Set You Back',
  ],
  'dog-travel': [
    'Why Safe Dog Travel Gear Is Non-Negotiable',
    'Types of Dog Travel Products',
    'Best Products for Safe Car Travel',
    'What to Check Before Buying',
    'Travel Mistakes That Put Your Dog at Risk',
  ],
  'dog-grooming': [
    'Why Regular Grooming Matters for Your Dog',
    'Types of Grooming Tools Explained',
    'Best Grooming Products for Home Use',
    'What to Look for in Grooming Equipment',
    'Grooming Mistakes That Cause Problems',
  ],
};

const CLUSTER_FAQS: Record<string, string[]> = {
  'cat-toys': [
    'How often should I rotate my cat\'s toys?',
    'Are automatic cat toys safe to leave unattended?',
    'What toys work best for indoor cats?',
    'How do I know if my cat is bored?',
  ],
  'cat-litter': [
    'How often should I change cat litter?',
    'Is clumping or non-clumping litter better?',
    'How many litter boxes do I need?',
    'What\'s the best litter for odor control?',
  ],
  'cat-trees': [
    'How tall should a cat tree be?',
    'Can large cats use standard cat trees?',
    'Where should I place a cat tree?',
    'How do I get my cat to use a cat tree?',
  ],
  'dog-training': [
    'What age should I start training my dog?',
    'Are puzzle toys good for dog training?',
    'How long should training sessions last?',
    'What\'s the best training method for puppies?',
  ],
  'dog-travel': [
    'Are dog car seats crash tested?',
    'Can I use a regular harness as a dog seat belt?',
    'What size car seat does my dog need?',
    'How do I help my dog with car anxiety?',
  ],
  'dog-grooming': [
    'How often should I groom my dog?',
    'Can I use human shampoo on my dog?',
    'What brush is best for my dog\'s coat type?',
    'How do I trim my dog\'s nails safely?',
  ],
};

// ============= INTERNAL LINK TARGETS =============

function getInternalLinkTargets(cluster: string, currentSlug: string): string[] {
  const clusterGuides = SCALING_GUIDES.filter(
    g => g.cluster === cluster && g.slug !== currentSlug
  );
  // Prioritize cornerstones and hubs
  const sorted = [
    ...clusterGuides.filter(g => g.role === 'cornerstone'),
    ...clusterGuides.filter(g => g.role === 'hub'),
    ...clusterGuides.filter(g => g.role === 'subguide'),
  ];
  return sorted.slice(0, 6).map(g => g.slug);
}

// ============= GUIDE EXISTENCE CHECK =============

function guideExistsInScaling(slug: string): boolean {
  return SCALING_GUIDES.some(g => g.slug === slug);
}

// ============= SINGLE GUIDE GENERATION =============

export async function generateGuide(input: GuideGenerationInput): Promise<GuideGenerationResult> {
  const slug = keywordToSlug(input.keyword);
  const h1 = `Best ${input.keyword.replace(/^best\s+/i, '')} — Complete Guide for Pet Parents (2026)`;
  const h2s = CLUSTER_H2S[input.cluster] || CLUSTER_H2S['cat-toys'];
  const faqs = CLUSTER_FAQS[input.cluster] || CLUSTER_FAQS['cat-toys'];
  const internalLinkTargets = getInternalLinkTargets(input.cluster, slug);

  try {
    const { data, error } = await supabase.functions.invoke('generate-gap-guide', {
      body: {
        query: input.keyword,
        slug,
        h1,
        h2s,
        faqs,
        internalLinkTargets,
        cluster: input.cluster,
      },
    });

    if (error) {
      return { success: false, error: error.message || 'Edge function error' };
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    const guide = data?.guide as GuideData;
    if (!guide) {
      return { success: false, error: 'No guide data returned' };
    }

    // Count internal links in generated content
    const contentStr = JSON.stringify(guide.sections || []);
    const linkMatches = contentStr.match(/\/guides\//g) || [];
    const productLinkMatches = contentStr.match(/\/products/g) || [];

    return {
      success: true,
      guide,
      stats: {
        internalLinksAdded: linkMatches.length + (guide.faq?.length || 0),
        productsConnected: (guide.comparisonProducts?.length || 0) + productLinkMatches.length,
        seoMetaGenerated: !!(guide.title && guide.excerpt),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ============= BATCH GENERATION =============

export async function generateMissingGuides(cluster?: string): Promise<BatchGenerationResult> {
  const keywords = cluster
    ? { [cluster]: (seoKeywords as Record<string, string[]>)[cluster] || [] }
    : (seoKeywords as Record<string, string[]>);

  const result: BatchGenerationResult = {
    guidesCreated: 0,
    internalLinksAdded: 0,
    productsConnected: 0,
    seoMetaGenerated: 0,
    errors: [],
    results: [],
  };

  for (const [clusterKey, keywordList] of Object.entries(keywords)) {
    for (const keyword of keywordList) {
      const slug = keywordToSlug(keyword);

      // Skip if guide already exists
      if (guideExistsInScaling(slug)) {
        continue;
      }

      const genResult = await generateGuide({ keyword, cluster: clusterKey });
      result.results.push(genResult);

      if (genResult.success && genResult.stats) {
        result.guidesCreated++;
        result.internalLinksAdded += genResult.stats.internalLinksAdded;
        result.productsConnected += genResult.stats.productsConnected;
        if (genResult.stats.seoMetaGenerated) result.seoMetaGenerated++;
      } else if (genResult.error) {
        result.errors.push(`${keyword}: ${genResult.error}`);
      }

      // Small delay between generations to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return result;
}

// ============= KEYWORD DISCOVERY =============

export function getAllKeywords(): Record<string, string[]> {
  return seoKeywords as Record<string, string[]>;
}

export function getMissingKeywords(): Record<string, string[]> {
  const all = seoKeywords as Record<string, string[]>;
  const missing: Record<string, string[]> = {};

  for (const [cluster, keywords] of Object.entries(all)) {
    const missingKws = keywords.filter(kw => !guideExistsInScaling(keywordToSlug(kw)));
    if (missingKws.length > 0) {
      missing[cluster] = missingKws;
    }
  }

  return missing;
}
