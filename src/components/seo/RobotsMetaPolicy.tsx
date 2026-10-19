/**
 * RobotsMetaPolicy — Centralized safety-net for robots meta tags.
 *
 * Mounted once in App.tsx, this component reads the current route and
 * ensures every page has a correct robots meta tag. Individual page
 * Helmet tags can still override (React Helmet uses last-wins).
 *
 * This prevents regressions where a new page template forgets to set
 * robots and accidentally inherits noindex from a shared component.
 */

import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { getRobotsDirective, getRobotsContent } from '@/lib/seo-robots-policy';

export function RobotsMetaPolicy() {
  const location = useLocation();

  // PDP owns eligibility once its product is loaded. A route-only "index"
  // must not overwrite tier C/noindex HTML during hydration or refetch.
  if (/^\/products\/[^/]+\/?$/.test(location.pathname)) return null;

  const directive = getRobotsDirective(location.pathname, location.search);
  const content = getRobotsContent(directive);

  return (
    <Helmet>
      <meta name="robots" content={content} />
      <meta name="googlebot" content={content} />
    </Helmet>
  );
}
