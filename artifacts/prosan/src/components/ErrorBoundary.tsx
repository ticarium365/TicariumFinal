import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { captureException } from "@/lib/sentry";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, { componentStack: info.componentStack });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 dark:bg-slate-900 p-6">
        <div className="max-w-md w-full bg-card dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-foreground dark:text-white mb-6">
            Bir hata oluştu · Sayfayı yenile
          </h1>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition"
          >
            <RefreshCw className="w-4 h-4" aria-hidden />
            Yenile
          </button>
        </div>
      </div>
    );
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (ev) => {
    if (ev.error instanceof Error) captureException(ev.error, { source: "window.error" });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const err = ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason));
    captureException(err, { source: "unhandledrejection" });
  });
}

export default ErrorBoundary;
