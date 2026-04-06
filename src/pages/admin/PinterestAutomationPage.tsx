import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class PinterestPageErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "Unknown error",
    };
  }

  componentDidCatch(error: Error) {
    console.error("[PinterestAutomationPage] runtime crash", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="mx-auto max-w-4xl p-4 md:p-6">
          <div className="rounded-xl border border-destructive/30 bg-card p-6">
            <h1 className="text-2xl font-bold text-foreground">Pinterest Automation Admin</h1>
            <p className="mt-4 text-base font-semibold text-destructive">PINTEREST PAGE CRASHED</p>
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {this.state.errorMessage || "Unknown error"}
            </p>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

function PinterestAutomationDebugContent() {
  const location = useLocation();
  const { user, isAdmin } = useAuth();
  const adminRouteMatched = location.pathname === "/admin/pinterest-automation";

  return (
    <section className="mx-auto max-w-4xl p-4 md:p-6">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Pinterest debug mode
          </p>
          <h1 className="text-3xl font-bold text-foreground">Pinterest Automation Admin</h1>
          <p className="text-base font-medium text-foreground">PINTEREST PAGE LOADED</p>
        </div>

        <div className="mt-6 grid gap-3 rounded-lg border border-border bg-background p-4 text-sm text-foreground">
          <p>
            <span className="font-semibold">pathname:</span> {location.pathname}
          </p>
          <p>
            <span className="font-semibold">current user email:</span> {user?.email ?? "not logged in"}
          </p>
          <p>
            <span className="font-semibold">isAdmin:</span> {String(isAdmin)}
          </p>
          <p>
            <span className="font-semibold">admin route matched:</span> {String(adminRouteMatched)}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Connect Pinterest
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Generate Pins
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Queue Pins
          </button>
        </div>
      </div>
    </section>
  );
}

export default function PinterestAutomationPage() {
  return (
    <PinterestPageErrorBoundary>
      <PinterestAutomationDebugContent />
    </PinterestPageErrorBoundary>
  );
}