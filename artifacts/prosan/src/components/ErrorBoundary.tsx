import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

function reportError(error: Error, info?: ErrorInfo) {
  try {
    const payload = {
      message: error.message ?? String(error),
      stack: error.stack,
      componentStack: info?.componentStack,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      severity: "error",
    };
    const url = `${(import.meta as any).env?.BASE_URL ?? "/"}api/client-errors`;
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {/* swallow */}
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info);
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
  }

  handleReload = () => { window.location.reload(); };
  handleHome = () => { window.location.href = "/"; };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 dark:bg-slate-900 p-6">
        <div className="max-w-md w-full bg-card dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground dark:text-white mb-2">
            Beklenmedik bir hata oluştu
          </h1>
          <p className="text-sm text-muted-foreground dark:text-slate-300 mb-6">
            Hata teknik ekibe iletildi. Sayfayı yenileyip tekrar deneyebilirsiniz.
          </p>
          {this.state.error?.message && (
            <pre className="text-xs text-left bg-muted dark:bg-slate-900 p-3 rounded-lg overflow-auto max-h-32 mb-6 text-foreground/90 dark:text-slate-300">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition"
            >
              <RefreshCw className="w-4 h-4" /> Sayfayı Yenile
            </button>
            <button
              onClick={this.handleHome}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border dark:border-slate-600 hover:bg-muted dark:hover:bg-slate-700 text-sm font-medium transition text-foreground/90 dark:text-slate-200"
            >
              <Home className="w-4 h-4" /> Anasayfa
            </button>
          </div>
        </div>
      </div>
    );
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (ev) => {
    if (ev.error instanceof Error) reportError(ev.error);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const err = ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason));
    reportError(err);
  });
}

export default ErrorBoundary;
