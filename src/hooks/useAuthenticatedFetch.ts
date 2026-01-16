import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface FetchOptions extends RequestInit {
  retryOnAuthError?: boolean;
}

export const useAuthenticatedFetch = () => {
  const refreshSessionIfNeeded = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return null;
    }

    // Check if token expires within the next 5 minutes
    const expiresAt = session.expires_at;
    if (expiresAt) {
      const expiresAtMs = expiresAt * 1000;
      const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
      
      if (expiresAtMs < fiveMinutesFromNow) {
        console.log('Token expiring soon, refreshing...');
        const { data, error } = await supabase.auth.refreshSession();
        
        if (error) {
          console.error('Failed to refresh session:', error);
          return null;
        }
        
        return data.session;
      }
    }

    return session;
  }, []);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const session = await refreshSessionIfNeeded();
    
    if (!session?.access_token) {
      return null;
    }

    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }, [refreshSessionIfNeeded]);

  const authenticatedFetch = useCallback(async <T>(
    url: string,
    options: FetchOptions = {}
  ): Promise<{ data: T | null; error: Error | null }> => {
    const { retryOnAuthError = true, ...fetchOptions } = options;

    const authHeaders = await getAuthHeaders();
    
    if (!authHeaders) {
      return { 
        data: null, 
        error: new Error('Not authenticated') 
      };
    }

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          ...authHeaders,
          ...fetchOptions.headers,
        },
      });

      if (response.status === 401 && retryOnAuthError) {
        console.log('Received 401, attempting to refresh session and retry...');
        
        // Force refresh the session
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !refreshData.session) {
          console.error('Session refresh failed:', refreshError);
          return { 
            data: null, 
            error: new Error('Session expired. Please log in again.') 
          };
        }

        // Retry with new token
        const retryResponse = await fetch(url, {
          ...fetchOptions,
          headers: {
            'Authorization': `Bearer ${refreshData.session.access_token}`,
            'Content-Type': 'application/json',
            ...fetchOptions.headers,
          },
        });

        if (!retryResponse.ok) {
          const errorData = await retryResponse.json().catch(() => ({}));
          return { 
            data: null, 
            error: new Error(errorData.error || `Request failed with status ${retryResponse.status}`) 
          };
        }

        const data = await retryResponse.json();
        return { data, error: null };
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { 
          data: null, 
          error: new Error(errorData.error || `Request failed with status ${response.status}`) 
        };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (err) {
      return { 
        data: null, 
        error: err instanceof Error ? err : new Error('Unknown error occurred') 
      };
    }
  }, [getAuthHeaders]);

  return {
    authenticatedFetch,
    getAuthHeaders,
    refreshSessionIfNeeded,
  };
};
