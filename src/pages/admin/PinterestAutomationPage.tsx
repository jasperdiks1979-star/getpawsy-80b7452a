import { Component, type ReactNode } from "react";
import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isAdminEmail } from "@/lib/auth/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryState { hasError: boolean; errorMessage: string }

class PinterestPageErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, errorMessage: "" };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message || "Unknown error" };
  }
  componentDidCatch(error: Error) { console.error("[PinterestAutomationPage] crash", error); }
  render() {
    if (this.state.hasError) {
      return (
        <section className="mx-auto max-w-4xl p-4 md:p-6">
          <Card className="border-destructive/30">
            <CardHeader><CardTitle>Pinterest Automation Admin</CardTitle></CardHeader>
            <CardContent>
              <p className="font-semibold text-destructive">PINTEREST PAGE CRASHED</p>
              <p className="mt-2 break-words text-sm text-muted-foreground">{this.state.errorMessage}</p>
            </CardContent>
          </Card>
        </section>
      );
    }
    return this.props.children;
  }
}

function AuthDebugCard() {
  const location = useLocation();
  const { user, isLoading, isAdmin } = useAuth();

  const authenticated = !!user;
  const emailMatch = isAdminEmail(user?.email);
  const adminSource = isAdmin ? (emailMatch ? "email-allowlist" : "db-role") : "none";
  const denied = !authenticated ? "NOT_LOGGED_IN" : !isAdmin ? "NOT_ADMIN" : null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <Card className="border-2 border-primary/40 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">🔍 Auth Debug</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm font-mono">
        {isLoading && <p className="text-muted-foreground animate-pulse">Loading auth…</p>}
        <p><span className="font-semibold">pathname:</span> {location.pathname}</p>
        <p><span className="font-semibold">authenticated:</span> <span className={authenticated ? "text-green-600" : "text-destructive"}>{String(authenticated)}</span></p>
        <p><span className="font-semibold">email:</span> {user?.email ?? "—"}</p>
        <p><span className="font-semibold">user_id:</span> {user?.id ?? "—"}</p>
        <p><span className="font-semibold">isAdmin:</span> <span className={isAdmin ? "text-green-600" : "text-destructive"}>{String(isAdmin)}</span></p>
        <p><span className="font-semibold">admin_source:</span> {adminSource}</p>
        {denied && <p><span className="font-semibold">denied_reason:</span> <span className="text-destructive">{denied}</span></p>}

        <div className="flex flex-wrap gap-2 pt-3">
          {!authenticated && (
            <Button asChild size="sm">
              <Link to={`/auth?next=${encodeURIComponent(location.pathname)}`}>Go to Login</Link>
            </Button>
          )}
          {authenticated && (
            <Button variant="outline" size="sm" onClick={handleLogout}>Logout ({user?.email})</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PinterestContent() {
  const { user, isAdmin } = useAuth();

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-lg font-semibold text-destructive">Not authenticated</p>
          <p className="text-sm text-muted-foreground mt-1">Please log in with an admin account.</p>
        </CardContent>
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-lg font-semibold text-destructive">Logged in but not admin</p>
          <p className="text-sm text-muted-foreground mt-1">Current email: {user.email}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pinterest Automation Admin</CardTitle>
        <p className="text-sm font-medium text-green-600">✅ PINTEREST PAGE LOADED</p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button>Connect Pinterest</Button>
        <Button variant="outline">Generate Pins</Button>
        <Button variant="outline">Queue Pins</Button>
      </CardContent>
    </Card>
  );
}

export default function PinterestAutomationPage() {
  return (
    <PinterestPageErrorBoundary>
      <section className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
        <AuthDebugCard />
        <PinterestContent />
      </section>
    </PinterestPageErrorBoundary>
  );
}
