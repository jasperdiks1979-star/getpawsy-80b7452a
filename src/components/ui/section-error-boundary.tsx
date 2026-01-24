import React, { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportError, isReact310Error, reportReact310Error } from '@/lib/error-reporter';

interface SectionErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
  fallback?: ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorMessage: string;
}

export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    // Safely extract error message - handle all edge cases
    let errorMessage = 'Unknown error occurred';
    try {
      if (error && typeof error.message === 'string') {
        errorMessage = error.message;
      } else if (error && typeof error === 'object') {
        errorMessage = JSON.stringify(error).substring(0, 200);
      }
    } catch {
      errorMessage = 'Error extracting message';
    }
    return { hasError: true, error, errorMessage };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const sectionName = this.props.sectionName || 'Unknown';
    
    try {
      const errorMsg = error?.message || 'No error message';
      const stack = errorInfo?.componentStack || '';
      console.error(`Error in section "${sectionName}":`, errorMsg, stack);
      
      // Report error to database
      if (isReact310Error(error)) {
        reportReact310Error(error, sectionName, {
          componentStack: stack?.substring(0, 1000),
        });
      } else {
        reportError(error, sectionName, {
          componentStack: stack?.substring(0, 1000),
        });
      }
    } catch (e) {
      console.error('Error in componentDidCatch:', e);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorMessage: '' });
  };

  handlePageRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const sectionName = this.props.sectionName || '';
      let displayError = 'An unexpected error occurred';
      try {
        if (this.state.errorMessage && typeof this.state.errorMessage === 'string') {
          displayError = this.state.errorMessage.length > 100 
            ? this.state.errorMessage.substring(0, 100) + '...' 
            : this.state.errorMessage;
        }
      } catch {
        displayError = 'Error displaying message';
      }

      return (
        <div className="py-12 px-4">
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Something went wrong{sectionName ? ` in ${sectionName}` : ''}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <div className="flex flex-col gap-2">
              <Button 
                onClick={this.handleRetry}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              <Button 
                variant="outline"
                onClick={this.handlePageRefresh}
              >
                Refresh Page
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Error: {displayError}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SectionErrorBoundary;
