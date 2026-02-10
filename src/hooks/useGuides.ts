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
      const res = await fetch(`/data/guides/${slug}.json`);
      if (!res.ok) throw new Error('Guide not found');
      return res.json();
    },
    enabled: !!slug,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
