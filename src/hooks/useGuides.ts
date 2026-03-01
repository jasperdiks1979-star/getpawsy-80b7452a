import { useQuery } from '@tanstack/react-query';
import type { GuideMeta, GuideData } from '@/types/guide';

export function useGuidesList() {
  return useQuery<GuideMeta[]>({
    queryKey: ['guides', 'index'],
    queryFn: async () => {
      const res = await fetch('/data/guides/index.json');
      if (!res.ok) throw new Error('Failed to load guides index');
      return res.json();
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useGuide(slug: string | undefined) {
  return useQuery<GuideData>({
    queryKey: ['guides', slug],
    queryFn: async () => {
      try {
        const res = await fetch(`/data/guides/${slug}.json`);
        if (!res.ok) throw new Error('Guide not found');
        const data = await res.json();
        if (!data || !data.slug) throw new Error('Invalid guide data');
        return data;
      } catch (err) {
        // Re-throw as a clean error so react-query treats it as an error state
        // rather than an unhandled promise rejection
        throw err instanceof Error ? err : new Error('Failed to load guide');
      }
    },
    enabled: !!slug,
    retry: false, // Don't retry 404s
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
