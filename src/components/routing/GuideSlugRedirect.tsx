import { useParams, Navigate } from 'react-router-dom';
import guidesIndex from '../../../public/data/guides/index.json';
import { lazy } from 'react';

const NotFound = lazy(() => import('@/pages/NotFound'));

/**
 * Redirects root-level guide slugs to /guides/{slug}.
 * E.g. /best-cat-litter-box-2026 → /guides/best-cat-litter-box-2026
 * Non-guide slugs render NotFound (404).
 */

const GUIDE_SLUGS = new Set(
  (guidesIndex as Array<{ slug: string }>).map((g) => g.slug)
);

export function isGuideSlug(slug: string): boolean {
  return GUIDE_SLUGS.has(slug);
}

const GuideSlugRedirect = () => {
  const { slug } = useParams<{ slug: string }>();

  
  if (slug && GUIDE_SLUGS.has(slug)) {
    return <Navigate to={`/guides/${slug}`} replace />;
  }
  
  // Not a guide slug — show 404
  return <NotFound />;
};

export default GuideSlugRedirect;
