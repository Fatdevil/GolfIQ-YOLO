import { Component, ErrorInfo, ReactNode } from "react";
import { captureException } from "../lib/sentry";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private toastTimer?: number;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info);
    captureException(error);
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.setState({ hasError: false, message: undefined });
    }, 6000);
  }

  componentWillUnmount(): void {
    window.clearTimeout(this.toastTimer);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <>
        {this.props.children}
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded bg-red-600 px-4 py-3 text-sm text-white shadow-lg">
          <strong className="block font-semibold">Something went wrong</strong>
          <span className="block opacity-90">
            {this.state.message ?? "An unexpected error occurred. Please retry."}
          </span>
        </div>
      </>
    );
  }
}
