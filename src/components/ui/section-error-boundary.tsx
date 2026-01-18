import React, { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    // Safely extract error message
    const errorMessage = error?.message || 'Unknown error occurred';
    return { hasError: true, error, errorMessage };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const sectionName = this.props.sectionName || 'Unknown';
    const errorMsg = error?.message || 'No error message';
    console.error(`Error in section "${sectionName}":`, errorMsg, errorInfo?.componentStack || '');
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
      const errorMessage = this.state.errorMessage || 'Unknown error';

      return (
        <div className="py-12 px-4">
          <div className="max-w-md mx-auto text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Er is iets misgegaan
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Er is een onverwachte fout opgetreden. Probeer de pagina te vernieuwen.
            </p>
            <div className="flex flex-col gap-2">
              <Button 
                onClick={this.handleRetry}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Opnieuw Proberen
              </Button>
              <Button 
                variant="outline"
                onClick={this.handlePageRefresh}
              >
                Pagina Vernieuwen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Fout: {errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SectionErrorBoundary;
