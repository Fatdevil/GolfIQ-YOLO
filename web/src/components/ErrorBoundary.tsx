import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/browser";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const client = Sentry.getCurrentHub().getClient();
    if (client) {
      Sentry.captureException(error, {
        extra: { componentStack: info.componentStack },
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert" className="error-boundary">
            <p>Something went wrong. Please refresh and try again.</p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
