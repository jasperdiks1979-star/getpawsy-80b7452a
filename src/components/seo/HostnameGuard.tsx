/**
 * HostnameGuard — React component that enforces noindex on lovable.app
 * and always emits the correct canonical link.
 *
 * Hostname redirects (www → apex) are handled by Cloudflare 301 rules.
 * This component does NOT redirect — it only sets meta tags.
 */

import { Helmet } from "react-helmet-async";
import { SITE_URL } from "@/lib/constants";
import { isLovableAppHost } from "@/lib/hostname-guard";
import { useLocation } from "react-router-dom";

export function HostnameGuard() {
  const location = useLocation();

  const cleanPath = location.pathname.replace(/\/+$/, "") || "";
  const canonicalUrl = `${SITE_URL}${cleanPath}`;

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
