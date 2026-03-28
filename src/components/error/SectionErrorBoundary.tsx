import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Name for logging — which section crashed */
  section?: string;
  /** Optional fallback UI. If omitted, renders nothing on error. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Lightweight error boundary for individual page sections.
 * On error: hides the broken section instead of crashing the whole page.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    const section = this.props.section || 'unknown';
    console.warn(`[SectionErrorBoundary] "${section}" crashed silently:`, error.message);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
