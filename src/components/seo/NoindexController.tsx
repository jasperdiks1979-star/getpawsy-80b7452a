/**
 * SEO Noindex Controller — React component for dynamic noindex signals.
 * 
 * Handles:
 * - Empty collection/filter states (0 products → noindex)
 * - Pagination (page 2+ → noindex, follow)
 * - Any path in NOINDEX_PATHS
 */

import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { shouldNoindex } from '@/lib/seo-canonical';

interface NoindexControllerProps {
  /** True when the current page shows 0 results (empty collection or filter) */
  isEmpty?: boolean;
  /** Current pagination page number (1-indexed). Page 2+ gets noindex. */
  page?: number;
}

export function NoindexController({ isEmpty = false, page = 1 }: NoindexControllerProps) {
  const location = useLocation();
  
  // Check NOINDEX_PATHS list
  const pathNoindex = shouldNoindex(location.pathname + location.search);
  
  // Empty states = noindex, follow (Google sees it but follows links)
  const emptyNoindex = isEmpty;
  
  // Pagination: page 2+ = noindex, follow
  const paginationNoindex = page >= 2;
  
  const shouldApplyNoindex = pathNoindex || emptyNoindex || paginationNoindex;
  
  if (!shouldApplyNoindex) return null;
  
  // Empty states and pagination get "noindex, follow" to preserve link equity
  // Path-based noindex gets "noindex, nofollow"
  const content = pathNoindex 
    ? 'noindex, nofollow' 
    : 'noindex, follow';
  
  return (
    <Helmet>
      <meta name="robots" content={content} />
      <meta name="googlebot" content={content} />
    </Helmet>
  );
}
