import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { requireAdmin } from '@/lib/auth/admin';
import { Loader2, ShieldAlert, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet-async';

interface Props {
  children: ReactNode;
}

/**
 * Route guard for /admin/* pages.
 * Logs all guard denials to console.error for diagnostics.
 */
export function AdminRouteGuard({ children }: Props) {
  const { user, isLoading, isAdmin, isAdminResolved, isSessionResolved, adminStatus, retryAdminCheck } = useAuth();
  const location = useLocation();

  // Backend never answered the role question — never treat that as a denial.
  if (user && adminStatus === 'unknown') {
    return (
      <>
        <Helmet>
          <meta name="robots" content="noindex,nofollow" />
        </Helmet>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
          <CloudOff className="h-14 w-14 text-muted-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Reconnecting…</h1>
          <p className="text-muted-foreground max-w-md">
            We couldn&apos;t reach the server to confirm your access. This is
            temporary — your sign-in is still active.
          </p>
          <Button onClick={() => { void retryAdminCheck(); }}>Retry</Button>
        </div>
      </>
    );
  }

  // Wait for both the session AND the server-side role check.
  // Denying while either is still in flight locks out real admins.
  if (isLoading || !isSessionResolved || (user && !isAdminResolved)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const check = requireAdmin(
    user ? { email: user.email, role: isAdmin ? 'admin' : undefined } : null
  );

  if (check.ok) {
    return (
      <>
        <Helmet>
          <meta name="robots" content="noindex,nofollow" />
        </Helmet>
        {children}
      </>
    );
  }

  // Denied — log details
  const reason = 'reason' in check ? check.reason : 'UNKNOWN';
  console.error('[AdminRouteGuard] DENIED', {
    path: location.pathname,
    email: user?.email ?? null,
    isAdmin,
    reason,
  });

  if (reason === 'NOT_LOGGED_IN') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  // NOT_ADMIN
  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground max-w-md">
          You don&apos;t have admin access. If you believe this is an error,
          try logging out and back in, or contact the site owner.
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          Logged in as: {user?.email}
        </p>
      </div>
    </>
  );
}
