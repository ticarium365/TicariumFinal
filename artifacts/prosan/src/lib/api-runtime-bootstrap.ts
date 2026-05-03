import {
  setBaseUrl,
  setResponseValidationFailureHandler,
  type ResponseValidationFailureContext,
} from "@workspace/api-client-react";
import { getApiOrigin } from "./api";
import { captureException } from "./sentry";

setResponseValidationFailureHandler((ctx: ResponseValidationFailureContext) => {
  const err = new Error(
    `API response validation failed: ${ctx.method} ${ctx.pathname}`,
  );
  err.name = "ApiResponseValidationFailed";
  captureException(err, {
    pathname: ctx.pathname,
    url: ctx.url,
    method: ctx.method,
    zodIssues: ctx.zodError.flatten(),
    received: ctx.received,
  });
});

function installApiFetch(): void {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;

  const apiOrigin = getApiOrigin();
  if (!apiOrigin) return;

  const origFetch = window.fetch.bind(window);

  function rewriteSameOriginApiHref(href: string): string | null {
    let u: URL;
    try {
      u = new URL(href, window.location.origin);
    } catch {
      return null;
    }
    if (u.origin !== window.location.origin) return null;
    if (!u.pathname.startsWith("/api")) return null;
    return `${apiOrigin}${u.pathname}${u.search}${u.hash}`;
  }

  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (typeof input === "string") {
      if (input.startsWith("/api")) return origFetch(`${apiOrigin}${input}`, init);
      return origFetch(input, init);
    }

    if (typeof URL !== "undefined" && input instanceof URL) {
      const rewritten = rewriteSameOriginApiHref(input.href);
      if (rewritten) return origFetch(rewritten, init);
      return origFetch(input, init);
    }

    if (typeof Request !== "undefined" && input instanceof Request) {
      const rewritten = rewriteSameOriginApiHref(input.url);
      if (rewritten) {
        // Browser cloning pattern: reuse method, headers, body from the original request.
        return origFetch(new Request(rewritten, input), init);
      }
    }

    return origFetch(input as RequestInfo, init);
  };
}

installApiFetch();

const origin = getApiOrigin();
if (origin) setBaseUrl(origin);
