import { Navigate, useLocation } from 'react-router-dom';
import { resolveToCanonical } from '@/lib/canonical-category-registry';

/**
 * Resolve a legacy collection path through the canonical category registry
 * (single source of truth) and redirect there, preserving query and hash.
 * `slug` is tried first (the alias itself), then `fallback`; anything that
 * does not resolve lands on /collections/all.
 */
export function resolveCollectionRedirect(slug: string, fallback?: string): string {
  const target = resolveToCanonical(slug) ?? (fallback ? resolveToCanonical(fallback) : null) ?? 'all';
  return `/collections/${target}`;
}

const CollectionAliasRedirect = ({ slug, fallback }: { slug: string; fallback?: string }) => {
  const { search, hash } = useLocation();
  return <Navigate to={`${resolveCollectionRedirect(slug, fallback)}${search}${hash}`} replace />;
};

export default CollectionAliasRedirect;
