import { Component, ReactNode } from 'react';

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

    return { hasError: true, errorId, errorMessage };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const route = typeof window !== 'undefined' ? window.location.pathname : 'unknown';
    console.error('[AppErrorBoundary] Fatal crash caught:', {
      message: error.message,
      name: error.name,
      route,
      stack: error.stack?.substring(0, 500),
    });
    console.error('[AppErrorBoundary] Component stack:', errorInfo.componentStack?.substring(0, 800));

    // Best-effort async reporting
    try {
      import('@/lib/error-reporter').then(({ reportError }) => {
        reportError(error, 'AppErrorBoundary', {
          componentStack: errorInfo.componentStack?.substring(0, 1000),
          route,
        });
      }).catch(() => {});
    } catch {
      // swallow
    }
  }

  render() {
    if (this.state.hasError) {
      // STATIC recovery UI only — NO React state resets, NO re-rendering children.
      // All buttons use window.location directly to avoid crash loops.
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: '2rem',
          textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Something went wrong
          </h2>
          <p style={{ color: '#666', marginBottom: '1.5rem', maxWidth: '24rem', fontSize: '0.875rem' }}>
            This usually resolves with a quick refresh.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                sessionStorage.clear();
                window.location.reload();
              }}
              style={{
                padding: '8px 20px', borderRadius: '6px', border: 'none',
                background: '#1a1a1a', color: '#fff', fontSize: '13px',
                cursor: 'pointer', fontWeight: 500,
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              style={{
                padding: '8px 20px', borderRadius: '6px', border: '1px solid #d1d5db',
                background: '#fff', color: '#333', fontSize: '13px',
                cursor: 'pointer', fontWeight: 500,
              }}
            >
              Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
