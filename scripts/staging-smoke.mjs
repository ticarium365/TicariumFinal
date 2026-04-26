#!/usr/bin/env node
/**
 * Ticarium365 lean staging smoke check.
 *
 * Required:
 *   SMOKE_APP_URL=https://app.staging.example.com
 *   SMOKE_API_URL=https://api.staging.example.com
 *
 * Optional:
 *   SMOKE_ORIGIN=https://app.staging.example.com
 */

const appUrl = trimSlash(process.env.SMOKE_APP_URL || "");
const apiUrl = trimSlash(process.env.SMOKE_API_URL || "");
const origin = process.env.SMOKE_ORIGIN || appUrl;

const results = [];

if (!appUrl || !apiUrl) {
  console.error("staging-smoke: SMOKE_APP_URL and SMOKE_API_URL are required");
  console.error("example: SMOKE_APP_URL=https://app.staging.example.com SMOKE_API_URL=https://api.staging.example.com pnpm run smoke:staging");
  process.exit(2);
}

function trimSlash(value) {
  return String(value).replace(/\/+$/, "");
}

async function check(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail });
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, detail: error?.message || String(error) });
  }
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function expectStatus(res, allowed) {
  if (!allowed.includes(res.status)) {
    throw new Error(`unexpected status ${res.status}`);
  }
}

await check("healthz reachable", async () => {
  const res = await fetchWithTimeout(`${apiUrl}/api/healthz`);
  expectStatus(res, [200]);
  return `status ${res.status}`;
});

await check("readyz reachable", async () => {
  const res = await fetchWithTimeout(`${apiUrl}/api/readyz`);
  expectStatus(res, [200]);
  return `status ${res.status}`;
});

await check("homepage reachable", async () => {
  const res = await fetchWithTimeout(`${appUrl}/`);
  expectStatus(res, [200]);
  const text = await res.text();
  if (!/Ticarium365|Ticarium/i.test(text)) throw new Error("homepage loaded but brand text not found");
  return `status ${res.status}`;
});

await check("login page reachable", async () => {
  const res = await fetchWithTimeout(`${appUrl}/login`);
  expectStatus(res, [200]);
  const text = await res.text();
  if (!/Ticarium365|Ticarium|login|giriş/i.test(text)) throw new Error("login page loaded but expected text not found");
  return `status ${res.status}`;
});

await check("API responds", async () => {
  const res = await fetchWithTimeout(`${apiUrl}/api/auth/me`, {
    headers: { Accept: "application/json" },
    redirect: "manual",
  });
  expectStatus(res, [401, 403]);
  return `unauthenticated /api/auth/me returned ${res.status}`;
});

await check("CORS sanity", async () => {
  const res = await fetchWithTimeout(`${apiUrl}/api/healthz`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
    },
  });
  expectStatus(res, [200, 204]);
  const allowOrigin = res.headers.get("access-control-allow-origin") || "";
  if (allowOrigin !== origin && allowOrigin !== "true") {
    throw new Error(`unexpected access-control-allow-origin: ${allowOrigin || "<missing>"}`);
  }
  return `allow-origin ${allowOrigin}`;
});

await check("expected redirect/auth behavior", async () => {
  const res = await fetchWithTimeout(`${apiUrl}/api/subscriptions/current`, {
    headers: { Accept: "application/json" },
    redirect: "manual",
  });
  expectStatus(res, [401, 403]);
  return `protected endpoint rejected anonymous request with ${res.status}`;
});

console.log("\nTicarium365 staging smoke summary");
console.log("================================");
for (const r of results) {
  const icon = r.ok ? "PASS" : "FAIL";
  console.log(`${icon} ${r.name} (${r.ms}ms) — ${r.detail}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\nFAIL SUMMARY: ${failed.length}/${results.length} checks failed`);
  for (const f of failed) console.error(`- ${f.name}: ${f.detail}`);
  process.exit(1);
}

console.log(`\nAll ${results.length} smoke checks passed.`);

