/**
 * HostnameGuard — React component that enforces noindex on lovable.app
 * and keeps the static canonical tag in sync.
 *
 * Updates the single #gp-canonical link in index.html (no Helmet canonical
 * injection — avoids duplicate canonical tags).
 *
 * Hostname redirects (www → apex) are handled by Cloudflare 301 rules.
 */

import { Helmet } from "react-helmet-async";
import { isLovableAppHost } from "@/lib/hostname-guard";
import { useLocation } from "react-router-dom";
import { useCanonical } from "@/components/seo/CanonicalTag";

export function HostnameGuard() {
  const location = useLocation();
  // Updates the static #gp-canonical tag — single source of truth
  useCanonical(location.pathname);

  // On lovable.app: block indexing
  if (isLovableAppHost()) {
    return (
      <Helmet>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="googlebot" content="noindex, nofollow" />
      </Helmet>
    );
  }

  // On apex/www: canonical handled by useCanonical above, nothing else needed
  return null;
}
