/**
 * HostnameGuard — React component that enforces noindex on non-canonical hosts.
 * 
 * Renders noindex meta + canonical override when on lovable.app.
 * The actual redirect happens at boot (main.tsx), but this component
 * ensures React Helmet also reflects the correct state if the page
 * somehow renders before redirect fires.
 */

import { Helmet } from 'react-helmet-async';
import { SITE_URL } from '@/lib/constants';
import { isLovableAppHost } from '@/lib/hostname-guard';
import { useLocation } from 'react-router-dom';

export function HostnameGuard() {
  const location = useLocation();

  if (!isLovableAppHost()) return null;

  const cleanPath = location.pathname.replace(/\/+$/, '') || '';
  const canonicalUrl = `${SITE_URL}${cleanPath}`;

  return (
    <Helmet>
      <meta name="robots" content="noindex, nofollow, noarchive" />
      <meta name="googlebot" content="noindex, nofollow" />
      <link rel="canonical" href={canonicalUrl} />
    </Helmet>
  );
}
