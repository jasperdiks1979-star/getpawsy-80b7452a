import { Component, ReactNode } from 'react';
import { recordCrashAndCheckBreaker } from '@/lib/crash-circuit-breaker';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorId: string;
  errorMessage: string;
}

/**
 * Top-level Error Boundary — wraps the ENTIRE app.
 * 
 * NON-BLOCKING POLICY: Never show a full-screen overlay to shoppers.
 * Instead, show a small dismissible banner at the top and attempt to
 * render children anyway. Shopping must never be interrupted.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: '', errorMessage: '' };
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

    // Record for circuit breaker tracking
    recordCrashAndCheckBreaker(errorMessage);

    return { hasError: true, errorId, errorMessage };
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
    this.setState({ hasError: false, errorId: '', errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      // ALWAYS non-blocking: show a slim banner + render children anyway
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
            <span>⚠️ Temporary issue. Your shopping is not affected.</span>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '4px 12px', borderRadius: '6px', border: 'none',
                  background: '#1a1a1a', color: '#fff', fontSize: '12px',
                  cursor: 'pointer', fontWeight: 500,
                }}
              >
                Refresh
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
          {/* Always attempt to render children — never block shopping */}
          {this.props.children}
        </>
      );
    }

    return this.props.children;
  }
}
