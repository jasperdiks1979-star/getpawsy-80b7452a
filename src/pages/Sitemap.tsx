import { useEffect, useState } from 'react';

const SITEMAP_BASE_URL = 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/generate-sitemap';

// Map of frontend paths to sitemap types
const SITEMAP_TYPE_MAP: Record<string, string> = {
  '/sitemap.xml': 'index',
  '/sitemap-static.xml': 'static',
  '/sitemap-products.xml': 'products',
  '/sitemap-categories.xml': 'categories',
  '/sitemap-bestsellers.xml': 'bestsellers',
  '/sitemap-blog.xml': 'blog',
};

const Sitemap = () => {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSitemap = async () => {
      try {
        // Get the current path to determine which sitemap to fetch
        const path = window.location.pathname;
        const type = SITEMAP_TYPE_MAP[path] || 'index';
        
        const response = await fetch(`${SITEMAP_BASE_URL}?type=${type}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch sitemap: ${response.status}`);
        }
        
        const xml = await response.text();
        setContent(xml);
      } catch (err) {
        console.error('Sitemap fetch error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    fetchSitemap();
  }, []);

  if (error) {
    return <div>Error loading sitemap: {error}</div>;
  }

  if (!content) {
    return null;
  }

  // Render XML content directly
  return (
    <pre style={{ margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
      {content}
    </pre>
  );
};

export default Sitemap;
