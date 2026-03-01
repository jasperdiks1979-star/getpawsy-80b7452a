import { Component, ReactNode } from 'react';
import { recordCrashAndCheckBreaker } from '@/lib/crash-circuit-breaker';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorId: string;
  errorMessage: string;
  suppressOverlay: boolean;
}

/**
 * Top-level Error Boundary — wraps the ENTIRE app.
 * 
 * Circuit Breaker: If the same crash repeats >2 times in 60s,
 * the blocking overlay is suppressed. A non-blocking banner is shown
 * instead, allowing the user to continue without a full reload.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: '', errorMessage: '', suppressOverlay: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `ERR-${Date.now().toString(36).toUpperCase()}`;
    let errorMessage = 'An unexpected error occurred.';
    try {
      if (error?.message && typeof error.message === 'string') {
        errorMessage = error.message.length > 200
          ? error.message.substring(0, 200) + '...'
          : error.message;
      }
    } catch {
      // safety
    }

    // Circuit breaker check
    const suppressOverlay = recordCrashAndCheckBreaker(errorMessage);

    return { hasError: true, errorId, errorMessage, suppressOverlay };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Fatal crash caught:', error);
    console.error('[AppErrorBoundary] Component stack:', errorInfo.componentStack);

    // Best-effort async reporting
    try {
      import('@/lib/error-reporter').then(({ reportError }) => {
        reportError(error, 'AppErrorBoundary', {
          componentStack: errorInfo.componentStack?.substring(0, 1000),
        });
      }).catch(() => {});
    } catch {
      // swallow
    }
  }

  handleDismiss = () => {
    this.setState({ hasError: false, errorId: '', errorMessage: '', suppressOverlay: false });
  };

  handleCopyErrorId = () => {
    try {
      navigator.clipboard.writeText(this.state.errorId);
    } catch {
      // fallback: do nothing
    }
  };

  render() {
    if (this.state.hasError) {
      // Circuit breaker tripped: show non-blocking banner + try to render children
      if (this.state.suppressOverlay) {
        return (
          <>
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
              background: '#fef3c7', borderBottom: '1px solid #fbbf24',
              padding: '10px 16px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: '12px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: '13px', color: '#92400e',
            }}>
              <span>⚠️ A repeated error occurred. Some features may not work correctly.</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => window.location.reload()}
                  style={{
                    padding: '4px 12px', borderRadius: '6px', border: 'none',
                    background: '#1a1a1a', color: '#fff', fontSize: '12px',
                    cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  Reload
                </button>
                <button
                  onClick={this.handleDismiss}
                  style={{
                    padding: '4px 12px', borderRadius: '6px', border: '1px solid #d1d5db',
                    background: '#fff', color: '#333', fontSize: '12px',
                    cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
            {/* Attempt to render children despite error */}
            {this.props.children}
          </>
        );
      }

      // Standard error UI — non-blocking with "Continue anyway" option
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#fafafa',
          padding: '24px',
        }}>
          <div style={{ textAlign: 'center', maxWidth: '420px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🐾</div>
            <h1 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '8px', color: '#1a1a1a' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '15px', color: '#666', marginBottom: '24px', lineHeight: 1.5 }}>
              We're sorry — the page couldn't load. Please try reloading or go back to the homepage.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '12px' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 24px', borderRadius: '8px', border: 'none',
                  backgroundColor: '#1a1a1a', color: '#fff', fontSize: '14px',
                  fontWeight: 500, cursor: 'pointer',
                }}
              >
                Reload
              </button>
              <button
                onClick={() => { window.location.href = '/'; }}
                style={{
                  padding: '10px 24px', borderRadius: '8px',
                  border: '1px solid #ddd', backgroundColor: '#fff',
                  color: '#333', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                }}
              >
                Go Home
              </button>
            </div>
            <button
              onClick={this.handleDismiss}
              style={{
                padding: '8px 20px', borderRadius: '8px',
                border: '1px solid #ddd', backgroundColor: '#fff',
                color: '#555', fontSize: '13px', cursor: 'pointer',
                marginBottom: '16px',
              }}
            >
              Continue anyway →
            </button>
            <p
              onClick={this.handleCopyErrorId}
              title="Click to copy"
              style={{
                fontSize: '11px', color: '#999', cursor: 'pointer',
                userSelect: 'all',
              }}
            >
              Error ID: {this.state.errorId}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
