import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GuideMeta, GuideData } from '@/types/guide';

export function useGuidesList() {
  return useQuery<GuideMeta[]>({
    queryKey: ['guides', 'index'],
    queryFn: async () => {
      // Fetch from both static files and database, merge results
      const [staticRes, dbRes] = await Promise.allSettled([
        fetch('/data/guides/index.json').then(r => r.ok ? r.json() : []),
        supabase
          .from('published_guides')
          .select('slug,title,excerpt,category,keywords,published_at,featured_image,reading_time,related_categories')
          .eq('is_published', true)
          .order('published_at', { ascending: false })
          .then(({ data }) => (data || []).map((g: any) => ({
            slug: g.slug,
            title: g.title,
            excerpt: g.excerpt,
            category: g.category,
            keywords: g.keywords || [],
            publishedAt: g.published_at,
            updatedAt: g.published_at,
            featuredImage: g.featured_image,
            readingTime: g.reading_time,
            relatedCategories: g.related_categories || [],
          }))),
      ]);

      const staticGuides: GuideMeta[] = staticRes.status === 'fulfilled' ? staticRes.value : [];
      const dbGuides: GuideMeta[] = dbRes.status === 'fulfilled' ? dbRes.value : [];

      // Merge, DB guides take precedence for duplicate slugs
      const slugMap = new Map<string, GuideMeta>();
      for (const g of staticGuides) slugMap.set(g.slug, g);
      for (const g of dbGuides) slugMap.set(g.slug, g);

      return Array.from(slugMap.values());
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useGuide(slug: string | undefined) {
  return useQuery<GuideData>({
    queryKey: ['guides', slug],
    queryFn: async () => {
      // Try static file first, then database
      try {
        const res = await fetch(`/data/guides/${slug}.json`);
        if (res.ok) {
          const data = await res.json();
          if (data?.slug) return data;
        }
      } catch { /* fallthrough to DB */ }

      // Fetch from database
      const { data, error } = await supabase
        .from('published_guides')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (error || !data) throw new Error('Guide not found');

      // Transform DB record to GuideData format
      const guideData = data.guide_data as any;
      return {
        slug: data.slug,
        title: guideData?.title || data.title,
        excerpt: guideData?.excerpt || data.excerpt,
        category: data.category,
        keywords: data.keywords || [],
        publishedAt: data.published_at,
        updatedAt: data.updated_at,
        featuredImage: data.featured_image,
        readingTime: data.reading_time,
        relatedCategories: data.related_categories || [],
        sections: guideData?.sections || [],
        faq: guideData?.faq || [],
        buyingCriteria: guideData?.buyingCriteria,
        prosAndCons: guideData?.prosAndCons,
        commonMistakes: guideData?.commonMistakes,
        quickAnswer: guideData?.quickAnswer,
        whoThisIsFor: guideData?.whoThisIsFor,
        comparisonProducts: guideData?.comparisonProducts,
        seoTitle: guideData?.seoTitle,
        seoDescription: guideData?.seoDescription,
      } as GuideData;
    },
    enabled: !!slug,
    retry: false,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
