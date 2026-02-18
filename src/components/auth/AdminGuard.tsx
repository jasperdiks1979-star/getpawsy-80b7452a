import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * Route guard for /admin/* pages.
 * - Not logged in → redirect to /auth with ?next= param
 * - Logged in but not admin → show Access Denied
 * - Admin → render children
 */
export const AdminGuard = ({ children }: AdminGuardProps) => {
  const { user, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
        <p className="text-muted-foreground max-w-md">
          You don't have admin access. If you believe this is an error, try logging out and back in,
          or contact the site owner.
        </p>
        <p className="text-xs text-muted-foreground font-mono">
          Logged in as: {user.email}
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
