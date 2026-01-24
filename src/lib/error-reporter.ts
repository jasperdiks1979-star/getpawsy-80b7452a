/**
 * Error Reporter Service
 * Automatically reports frontend errors (especially React #310) to the database
 */

import { supabase } from '@/integrations/supabase/client';

interface ErrorReport {
  error_type: string;
  error_message: string;
  component_name?: string;
  stack_trace?: string;
  page_url?: string;
  user_agent?: string;
  session_id?: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
}

// Debounce to prevent duplicate reports
const reportedErrors = new Set<string>();
const DEBOUNCE_TIME = 5000; // 5 seconds

/**
 * Generate a unique key for error deduplication
 */
function getErrorKey(error: ErrorReport): string {
  return `${error.error_type}:${error.error_message}:${error.component_name || 'unknown'}`;
}

/**
 * Get or create a session ID for error tracking
 */
function getSessionId(): string {
  try {
    let sessionId = sessionStorage.getItem('error_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem('error_session_id', sessionId);
    }
    return sessionId;
  } catch {
    return `fallback_${Date.now()}`;
  }
}

/**
 * Check if this is a React #310 error
 */
export function isReact310Error(error: Error | string): boolean {
  const message = typeof error === 'string' ? error : error.message;
  return (
    message.includes('Objects are not valid as a React child') ||
    message.includes('Minified React error #310') ||
    message.includes('object with keys')
  );
}

/**
 * Report an error to the database
 */
export async function reportError(
  error: Error | string,
  componentName?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const stackTrace = typeof error === 'object' ? error.stack : undefined;
  
  // Determine error type
  let errorType = 'UNKNOWN';
  if (isReact310Error(error)) {
    errorType = 'REACT_310';
  } else if (errorMessage.includes('Network') || errorMessage.includes('fetch')) {
    errorType = 'NETWORK';
  } else if (errorMessage.includes('TypeError')) {
    errorType = 'TYPE_ERROR';
  } else if (errorMessage.includes('ReferenceError')) {
    errorType = 'REFERENCE_ERROR';
  } else if (errorMessage.includes('SyntaxError')) {
    errorType = 'SYNTAX_ERROR';
  }

  const report: ErrorReport = {
    error_type: errorType,
    error_message: errorMessage.substring(0, 1000), // Limit message length
    component_name: componentName,
    stack_trace: stackTrace?.substring(0, 5000), // Limit stack trace
    page_url: typeof window !== 'undefined' ? window.location.href : undefined,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    session_id: getSessionId(),
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
      isReact310: isReact310Error(error),
    },
  };

  // Deduplicate errors
  const errorKey = getErrorKey(report);
  if (reportedErrors.has(errorKey)) {
    console.log('[ErrorReporter] Duplicate error, skipping:', errorKey);
    return;
  }

  reportedErrors.add(errorKey);
  setTimeout(() => reportedErrors.delete(errorKey), DEBOUNCE_TIME);

  // Get current user if available
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      report.user_id = user.id;
    }
  } catch {
    // Ignore auth errors
  }

  // Send to database
  try {
    // Cast metadata to Json type for Supabase compatibility
    const metadataJson = report.metadata ? JSON.parse(JSON.stringify(report.metadata)) : {};
    
    const { error: insertError } = await supabase
      .from('frontend_error_logs')
      .insert([{
        error_type: report.error_type,
        error_message: report.error_message,
        component_name: report.component_name,
        stack_trace: report.stack_trace,
        page_url: report.page_url,
        user_agent: report.user_agent,
        session_id: report.session_id,
        user_id: report.user_id,
        metadata: metadataJson,
      }]);

    if (insertError) {
      console.error('[ErrorReporter] Failed to save error:', insertError);
    } else {
      console.log('[ErrorReporter] Error reported successfully:', errorType);
    }
  } catch (e) {
    console.error('[ErrorReporter] Exception while reporting:', e);
  }
}

/**
 * Report a React #310 error with additional context
 */
export async function reportReact310Error(
  error: Error,
  componentName: string,
  problematicData?: unknown
): Promise<void> {
  const metadata: Record<string, unknown> = {
    specificError: 'Objects are not valid as a React child',
    componentName,
  };

  // Safely capture problematic data info
  if (problematicData !== undefined) {
    try {
      metadata.dataType = typeof problematicData;
      metadata.isArray = Array.isArray(problematicData);
      metadata.isNull = problematicData === null;
      
      if (problematicData && typeof problematicData === 'object') {
        metadata.objectKeys = Object.keys(problematicData as object).slice(0, 20);
        metadata.dataPreview = JSON.stringify(problematicData).substring(0, 500);
      }
    } catch (e) {
      metadata.dataSerializationError = String(e);
    }
  }

  await reportError(error, componentName, metadata);
}

/**
 * Global error handler for uncaught errors
 */
export function setupGlobalErrorHandler(): void {
  if (typeof window === 'undefined') return;

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    if (event.error) {
      reportError(event.error, 'GlobalErrorHandler', {
        type: 'uncaught',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    }
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error 
      ? event.reason 
      : new Error(String(event.reason));
    
    reportError(error, 'UnhandledPromiseRejection', {
      type: 'unhandled_promise',
    });
  });

  console.log('[ErrorReporter] Global error handlers installed');
}
