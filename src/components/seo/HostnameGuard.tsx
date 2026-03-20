/**
 * HostnameGuard — React component that enforces noindex on lovable.app
 * and always emits the correct canonical link.
 *
 * Uses react-helmet-async to UPDATE the canonical <link> that was already
 * injected by the inline script in index.html. Helmet uses "last-wins"
 * deduplication on rel="canonical", so this replaces rather than duplicates.
 *
 * Hostname redirects (www → apex) are handled by Cloudflare 301 rules.
 */

import { Helmet } from "react-helmet-async";
import { isLovableAppHost } from "@/lib/hostname-guard";
import { useLocation } from "react-router-dom";
import { buildCanonicalUrl } from "@/lib/seo-canonical";

export function HostnameGuard() {
  const location = useLocation();
  const canonicalUrl = buildCanonicalUrl(location.pathname);

  // On lovable.app: block indexing + set canonical to apex
  if (isLovableAppHost()) {
    return (
      <Helmet>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="googlebot" content="noindex, nofollow" />
        <link rel="canonical" href={canonicalUrl} />
      </Helmet>
    );
  }

  // On apex/www: just ensure canonical points to apex domain
  return (
    <Helmet>
      <link rel="canonical" href={canonicalUrl} />
    </Helmet>
  );
}
