import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { getRobotsContent, productRobotsDirective } from '@/lib/seo-robots-policy';

/** PDP eligibility owns these tags, including static Vite fallback tags. */
export function ProductRobotsPolicy({ product }: { product: { seo_noindex?: boolean; seo_tier?: string | null } }) {
  const content = getRobotsContent(productRobotsDirective(product));
  useEffect(() => {
    document.querySelectorAll('meta[name="robots"]:not([data-rh]), meta[name="googlebot"]:not([data-rh])')
      .forEach(meta => meta.remove());
  }, [content]);
  return <Helmet><meta name="robots" content={content} /><meta name="googlebot" content={content} /></Helmet>;
}