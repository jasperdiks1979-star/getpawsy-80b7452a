import { lazy, Suspense, type ReactNode } from "react";

// Lazily pulls in the centralized AdminRouteGuard so admin-only pages stay out
// of the storefront bundle while still being gated by the single shared guard.
const LazyAdminRouteGuard = lazy(() =>
  import("./AdminRouteGuard").then((m) => ({ default: m.AdminRouteGuard })),
);

/**
 * Wrapper for legacy/direct internal routes that were declared outside the
 * nested /admin shell. Authorization is delegated entirely to AdminRouteGuard
 * (server-verified role), never to client-side email checks.
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
      <LazyAdminRouteGuard>{children}</LazyAdminRouteGuard>
    </Suspense>
  );
}

export default AdminOnly;
