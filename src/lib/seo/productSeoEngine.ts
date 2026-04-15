/**
 * Product SEO Optimization Engine
 * 
 * Client-side orchestration for AI-powered product SEO optimization.
 * Calls the product-seo-optimize edge function and processes results.
 */

import { supabase } from '@/integrations/supabase/client';
import { getGuidesForProduct } from '@/lib/seo/internalLinkAuthorityEngine';

// ============= TYPES =============

export interface ProductSeoInput {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  features?: string[];
}

export interface ProductSeoResult {
  seoTitle: string;
  metaDescription: string;
  extendedContent: {
    whyPetsNeed: string;
    keyBenefits: string;
    howToChoose: string;
    featuresExplained: string;
  };
  faq: { question: string; answer: string }[];
  keywords: string[];
  internalLinks: {
    guides: { slug: string; anchor: string }[];
    collection: { slug: string; anchor: string };
    relatedProducts: string[];
  };
}

export interface OptimizationResult {
  productId: string;
  productName: string;
  success: boolean;
  data?: ProductSeoResult;
  error?: string;
}

export interface BatchResult {
  productsOptimized: number;
  seoTitlesGenerated: number;
  metaDescriptionsGenerated: number;
  faqSectionsCreated: number;
  internalLinksAdded: number;
  structuredDataReady: number;
  errors: string[];
  results: OptimizationResult[];
}

// ============= SINGLE PRODUCT OPTIMIZATION =============

export async function optimizeProductSEO(product: ProductSeoInput): Promise<OptimizationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('product-seo-optimize', {
      body: {
        productName: product.name,
        category: product.category,
        description: product.description,
        features: product.features,
        slug: product.slug,
      },
    });

    if (error) throw new Error(error.message || 'Edge function error');
    if (!data?.ok) throw new Error(data?.error || 'Unknown error from AI');

    const seoData = data.data as ProductSeoResult;

    // Enrich internal links with local engine data
    const localGuides = getGuidesForProduct(product.name, product.category);
    if (localGuides.length > 0 && seoData.internalLinks) {
      // Merge AI suggestions with local engine suggestions (deduplicate)
      const existingSlugs = new Set(seoData.internalLinks.guides.map(g => g.slug));
      for (const g of localGuides) {
        if (!existingSlugs.has(g.slug)) {
          seoData.internalLinks.guides.push({ slug: g.slug, anchor: g.title });
        }
      }
      seoData.internalLinks.guides = seoData.internalLinks.guides.slice(0, 3);
    }

    return {
      productId: product.id,
      productName: product.name,
      success: true,
      data: seoData,
    };
  } catch (err) {
    return {
      productId: product.id,
      productName: product.name,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ============= BATCH OPTIMIZATION =============

export async function optimizeProductsBatch(
  products: ProductSeoInput[],
  onProgress?: (completed: number, total: number) => void,
): Promise<BatchResult> {
  const result: BatchResult = {
    productsOptimized: 0,
    seoTitlesGenerated: 0,
    metaDescriptionsGenerated: 0,
    faqSectionsCreated: 0,
    internalLinksAdded: 0,
    structuredDataReady: 0,
    errors: [],
    results: [],
  };

  for (let i = 0; i < products.length; i++) {
    const optResult = await optimizeProductSEO(products[i]);
    result.results.push(optResult);

    if (optResult.success && optResult.data) {
      result.productsOptimized++;
      if (optResult.data.seoTitle) result.seoTitlesGenerated++;
      if (optResult.data.metaDescription) result.metaDescriptionsGenerated++;
      if (optResult.data.faq?.length > 0) result.faqSectionsCreated++;
      result.internalLinksAdded += (optResult.data.internalLinks?.guides?.length || 0) + 1;
      result.structuredDataReady++;
    } else if (optResult.error) {
      result.errors.push(`${optResult.productName}: ${optResult.error}`);
    }

    onProgress?.(i + 1, products.length);

    // Rate limit protection — 2s between requests
    if (i < products.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return result;
}

// ============= FETCH PRODUCTS FOR OPTIMIZATION =============

export async function fetchProductsForOptimization(limit = 20): Promise<ProductSeoInput[]> {
  const { data, error } = await supabase
    .from('products_public')
    .select('id, name, slug, category, description')
    .eq('is_active', true)
    .not('slug', 'is', null)
    .gt('price', 0)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map(p => ({
    id: p.id,
    name: p.name || '',
    slug: p.slug || '',
    category: p.category,
    description: p.description,
  }));
}

// Schema generation is centralised in src/components/seo/ProductSchema.tsx
// Do NOT add duplicate schema generators here.
