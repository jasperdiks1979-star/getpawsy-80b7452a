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
        {isAuthError ? 'Authenticatie Fout' : 'Er is een fout opgetreden'}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-3">
          {isAuthError 
            ? 'Je sessie is verlopen of ongeldig. Probeer je sessie te vernieuwen of log opnieuw in.'
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
                Sessie Vernieuwen
              </Button>
              {showSignOut && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleSignOut}
                >
                  <LogOut className="w-3 h-3 mr-1" />
                  Opnieuw Inloggen
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
                Opnieuw Proberen
              </Button>
            )
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default ApiErrorDisplay;
