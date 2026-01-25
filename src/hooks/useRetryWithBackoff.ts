import { useCallback, useRef, useState } from 'react';

interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

interface RetryState {
  attempt: number;
  isRetrying: boolean;
  lastError: Error | null;
}

type AsyncFn<T> = () => Promise<T>;

/**
 * Hook for executing async operations with exponential backoff retry logic
 */
export function useRetryWithBackoff(config: RetryConfig = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
  } = config;

  const [retryState, setRetryState] = useState<RetryState>({
    attempt: 0,
    isRetrying: false,
    lastError: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const calculateDelay = useCallback((attempt: number): number => {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
    return Math.min(exponentialDelay + jitter, maxDelayMs);
  }, [baseDelayMs, backoffMultiplier, maxDelayMs]);

  const sleep = useCallback((ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }, []);

  /**
   * Execute a function with retry logic and exponential backoff
   */
  const executeWithRetry = useCallback(async <T>(
    fn: AsyncFn<T>,
    options?: {
      onRetry?: (attempt: number, error: Error, delayMs: number) => void;
      shouldRetry?: (error: Error, attempt: number) => boolean;
    }
  ): Promise<T> => {
    const { onRetry, shouldRetry = () => true } = options || {};

    abortControllerRef.current = new AbortController();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        setRetryState({
          attempt,
          isRetrying: attempt > 0,
          lastError,
        });

        const result = await fn();
        
        // Success - reset state
        setRetryState({
          attempt: 0,
          isRetrying: false,
          lastError: null,
        });
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if we should retry
        if (attempt < maxRetries && shouldRetry(lastError, attempt)) {
          const delayMs = calculateDelay(attempt);
          
          if (onRetry) {
            onRetry(attempt + 1, lastError, delayMs);
          }
          
          console.log(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delayMs)}ms: ${lastError.message}`);
          
          // Wait with exponential backoff
          await sleep(delayMs);
          
          // Check if aborted during sleep
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error('Operation aborted');
          }
        } else {
          // Max retries reached or should not retry
          setRetryState({
            attempt,
            isRetrying: false,
            lastError,
          });
          throw lastError;
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error('Unknown error');
  }, [maxRetries, calculateDelay, sleep]);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    setRetryState({
      attempt: 0,
      isRetrying: false,
      lastError: null,
    });
  }, []);

  const reset = useCallback(() => {
    setRetryState({
      attempt: 0,
      isRetrying: false,
      lastError: null,
    });
  }, []);

  return {
    executeWithRetry,
    retryState,
    abort,
    reset,
    isRetrying: retryState.isRetrying,
    currentAttempt: retryState.attempt,
    lastError: retryState.lastError,
  };
}

/**
 * Standalone retry function for use outside React components
 */
export async function retryWithBackoff<T>(
  fn: AsyncFn<T>,
  config: RetryConfig & {
    onRetry?: (attempt: number, error: Error, delayMs: number) => void;
    shouldRetry?: (error: Error, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    onRetry,
    shouldRetry = () => true,
  } = config;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries && shouldRetry(lastError, attempt)) {
        const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt);
        const jitter = Math.random() * 0.3 * exponentialDelay;
        const delayMs = Math.min(exponentialDelay + jitter, maxDelayMs);
        
        if (onRetry) {
          onRetry(attempt + 1, lastError, delayMs);
        }
        
        console.log(`Retry ${attempt + 1}/${maxRetries} after ${Math.round(delayMs)}ms: ${lastError.message}`);
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Unknown error');
}
