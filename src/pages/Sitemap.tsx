import { useEffect } from 'react';

const SITEMAP_URL = 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/generate-sitemap?type=index';

const Sitemap = () => {
  useEffect(() => {
    window.location.replace(SITEMAP_URL);
  }, []);

  return null;
};

export default Sitemap;
