/**
 * LegacyClusterRedirect
 *
 * Handles 301-equivalent redirects from old cluster URLs to new namespaced URLs.
 * Used for paths like:
 *   /orthopedic-dog-beds → /dog/orthopedic-dog-beds
 *   /collections/orthopedic-dog-beds → /dog/orthopedic-dog-beds
 */
import { Navigate, useLocation } from 'react-router-dom';
import { getLegacyRedirect } from '@/lib/seo-route-config';

export default function LegacyClusterRedirect() {
  const { pathname } = useLocation();
  const target = getLegacyRedirect(pathname);

  if (target) {
    return <Navigate to={target} replace />;
  }

  // Should never happen if routes are set up correctly, but safe fallback
  return <Navigate to="/404" replace />;
}
