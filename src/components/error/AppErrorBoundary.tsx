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
 * If anything crashes (providers, context, routing), this catches it
 * and shows a recoverable fallback instead of a white screen.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: '', errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
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

  handleCopyErrorId = () => {
    try {
      navigator.clipboard.writeText(this.state.errorId);
    } catch {
      // fallback: do nothing
    }
  };

  render() {
    if (this.state.hasError) {
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
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '20px' }}>
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
