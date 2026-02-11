import { useEffect } from 'react';

const SITEMAP_BASE_URL = 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/sitemap-xml';

// Map of frontend paths to sitemap types
const SITEMAP_TYPE_MAP: Record<string, string> = {
  '/sitemap.xml': 'index',
  '/sitemap-static.xml': 'static',
  '/sitemap-products.xml': 'products',
  '/sitemap-categories.xml': 'categories',
  '/sitemap-bestsellers.xml': 'bestsellers',
  '/sitemap-collections.xml': 'collections',
  '/sitemap-blog.xml': 'blog',
  '/sitemap-guides.xml': 'guides',
};

/**
 * Sitemap component that immediately redirects to the edge function.
 * This ensures crawlers receive proper XML content without JavaScript rendering.
 * The redirect happens instantly to avoid any SPA cloaking concerns.
 */
const Sitemap = () => {
  useEffect(() => {
    // Get the current path to determine which sitemap to fetch
    const path = window.location.pathname;
    const type = SITEMAP_TYPE_MAP[path] || 'index';
    
    // Immediately redirect to the edge function URL
    // This ensures crawlers get XML directly without waiting for React
    window.location.replace(`${SITEMAP_BASE_URL}?type=${type}`);
  }, []);

  // Show nothing while redirecting - this prevents any content flash
  return null;
};

export default Sitemap;
