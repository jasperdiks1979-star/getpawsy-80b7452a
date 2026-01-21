import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface AuthErrorBoundaryProps {
  children: React.ReactNode;
}

interface AuthErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isAuthError: boolean;
}

export class AuthErrorBoundary extends React.Component<AuthErrorBoundaryProps, AuthErrorBoundaryState> {
  constructor(props: AuthErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, isAuthError: false };
  }

  static getDerivedStateFromError(error: Error): AuthErrorBoundaryState {
    const isAuthError = 
      error.message?.toLowerCase().includes('unauthorized') ||
      error.message?.toLowerCase().includes('401') ||
      error.message?.toLowerCase().includes('session') ||
      error.message?.toLowerCase().includes('token') ||
      error.message?.toLowerCase().includes('auth');
    
    return { hasError: true, error, isAuthError };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AuthErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <AuthErrorFallback 
          error={this.state.error} 
          isAuthError={this.state.isAuthError}
          onRetry={() => this.setState({ hasError: false, error: null, isAuthError: false })}
        />
      );
    }

    return this.props.children;
  }
}

interface AuthErrorFallbackProps {
  error: Error | null;
  isAuthError: boolean;
  onRetry: () => void;
}

const AuthErrorFallback = ({ error, isAuthError, onRetry }: AuthErrorFallbackProps) => {
  const { signOut, refreshSession } = useAuth();

  const handleRefreshSession = async () => {
    try {
      await refreshSession();
      onRetry();
    } catch (err) {
      console.error('Failed to refresh session:', err);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/auth';
  };

  if (isAuthError) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            </div>
            <CardTitle>Session Expired</CardTitle>
            <CardDescription>
              Your session has expired or is invalid. Please try refreshing your session or sign in again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              onClick={handleRefreshSession} 
              className="w-full"
              variant="default"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Session
            </Button>
            <Button 
              onClick={handleSignOut} 
              className="w-full"
              variant="outline"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign In Again
            </Button>
            {error && (
              <p className="text-xs text-muted-foreground text-center mt-4">
                Error: {error.message}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred. Please try refreshing the page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            onClick={onRetry} 
            className="w-full"
            variant="default"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <Button 
            onClick={() => window.location.reload()} 
            className="w-full"
            variant="outline"
          >
            Refresh Page
          </Button>
          {error && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              Error: {error.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthErrorBoundary;
