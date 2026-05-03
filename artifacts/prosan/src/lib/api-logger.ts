/**
 * API response time logging wrapper (dev only)
 * Logs: [METHOD] /endpoint → Xms
 * Warning: > 500ms
 * Error: > 2000ms
 */

const originalFetch = window.fetch;

export function initApiLogger(): void {
  if (import.meta.env.MODE !== "development") return;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || (typeof input === "object" && "method" in input ? input.method : "GET");
    
    const startTime = performance.now();
    
    try {
      const response = await originalFetch(input, init);
      const duration = performance.now() - startTime;
      
      // Log API call
      const logMsg = `[${method.toUpperCase()}] ${url} → ${duration.toFixed(0)}ms`;
      
      if (duration > 2000) {
        console.error(`%c${logMsg}`, "color: red; font-weight: bold");
      } else if (duration > 500) {
        console.warn(`%c${logMsg}`, "color: orange; font-weight: bold");
      } else {
        console.log(`%c${logMsg}`, "color: green");
      }
      
      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[${method.toUpperCase()}] ${url} → ${duration.toFixed(0)}ms (ERROR)`, error);
      throw error;
    }
  };
}
