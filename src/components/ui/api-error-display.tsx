import { AlertCircle, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';

interface ApiErrorDisplayProps {
  error: Error | string | null;
  onRetry?: () => void;
  showSignOut?: boolean;
  className?: string;
}

export const ApiErrorDisplay = ({ 
  error, 
  onRetry, 
  showSignOut = true,
  className = '' 
}: ApiErrorDisplayProps) => {
  const { signOut, refreshSession } = useAuth();
  
  const errorMessage = error instanceof Error ? error.message : error;
  
  const isAuthError = errorMessage?.toLowerCase().includes('unauthorized') ||
    errorMessage?.toLowerCase().includes('401') ||
    errorMessage?.toLowerCase().includes('session') ||
    errorMessage?.toLowerCase().includes('expired');

  const handleRefreshSession = async () => {
    try {
      await refreshSession();
      onRetry?.();
    } catch (err) {
      console.error('Failed to refresh session:', err);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/auth';
  };

  if (!error) return null;

  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>
        {isAuthError ? 'Authentication Error' : 'An error occurred'}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-3">
          {isAuthError 
            ? 'Your session has expired or is invalid. Please try refreshing your session or sign in again.'
            : errorMessage
          }
        </p>
        <div className="flex gap-2 flex-wrap">
          {isAuthError ? (
            <>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleRefreshSession}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh Session
              </Button>
              {showSignOut && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleSignOut}
                >
                  <LogOut className="w-3 h-3 mr-1" />
                  Sign In Again
                </Button>
              )}
            </>
          ) : (
            onRetry && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={onRetry}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Try Again
              </Button>
            )
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default ApiErrorDisplay;
