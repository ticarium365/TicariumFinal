// Optional web-vitals integration - if package is not installed, this will be a no-op
let initWebVitalsFn: (() => void) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { onCLS, onFID, onLCP } = require("web-vitals");
  
  /**
   * Report Web Vitals to console in dev, to Sentry in production
   * Target: LCP < 2.5s, CLS < 0.1
   */
  initWebVitalsFn = () => {
    if (typeof window === "undefined") return;

    const reportMetric = (metric: any, name: string, target?: string, threshold?: number) => {
      const value = metric.value.toFixed(2);
      if (import.meta.env.MODE === "development") {
        const thresholdMsg = target ? ` (target: ${target})` : "";
        console.log(`[Web Vitals] ${name}: ${value}ms${thresholdMsg}`);
      } else {
        // Send to Sentry in production
        if (typeof window !== "undefined" && (window as any).Sentry) {
          (window as any).Sentry.captureMessage(`Web Vitals: ${name}`, {
            level: threshold && metric.value > threshold ? "warning" : "info",
            extra: { 
              value: `${value}ms`,
              ...(target && { target }),
            },
          });
        }
      }
    };

    onLCP((metric: any) => {
      reportMetric(metric, "LCP", "< 2.5s", 2500);
    });

    onFID((metric: any) => {
      reportMetric(metric, "FID");
    });

    onCLS((metric: any) => {
      reportMetric(metric, "CLS", "< 0.1", 0.1);
    });
  };
} catch {
  // web-vitals package not installed, export a no-op function
  initWebVitalsFn = () => {
    console.warn("[Web Vitals] web-vitals package not installed. Install with: pnpm add web-vitals");
  };
}

export function initWebVitals(): void {
  if (initWebVitalsFn) {
    initWebVitalsFn();
  }
}
