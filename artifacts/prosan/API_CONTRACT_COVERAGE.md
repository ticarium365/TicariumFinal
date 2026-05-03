# Prosan ↔ API contract coverage

Runtime validation happens in `@workspace/api-client-react` **`customFetch`**: after a successful HTTP response, JSON bodies are matched against Zod via `RESPONSE_SCHEMA_ROUTES` in `lib/api-client-react/src/response-schema-registry.ts` (pathnames normalized, query strings stripped). On failure: **`setResponseValidationFailureHandler`** runs (Prosan: `src/lib/api-runtime-bootstrap.ts` → Sentry + beacon), then **`ApiValidationError`** is thrown.

| Endpoint | Schema in `@workspace/api-zod` | Registry (`customFetch` auto-parse) | Notes |
|----------|-------------------------------|--------------------------------------|--------|
| `POST /api/sales` | Y (`zSaleCreateResponse` + generated sale shape) | Y | Orval `createSale` uses `customFetch` |
| `POST /api/billing/checkout` | Y (`zBillingCheckoutResponse`) | Y | `pricing.tsx` uses `customFetch` |
| `GET /api/auth/me` | Y (`GetMeResponse` / `zAuthMeResponse`) | Y | `company-context.tsx` uses `customFetch`; generated `getMe` also covered |
| `POST /api/stock/entry` | Y (`zStockEntryCreateResponse`) | Y | `pages/stock/index.tsx` uses `customFetch` (not `/stock/entries`) |

All other paths exposed by the **Orval-generated** client (`createProduct`, `listSales`, `getDashboardStats`, …) share the same pipeline: **`customFetch` + registry** for routes listed in `RESPONSE_SCHEMA_ROUTES`.

### Raw `fetch("/api/...")` in Prosan

Many pages still call **`window.fetch` directly**. Those responses are **not** parsed by `customFetch` unless migrated. Examples (non-exhaustive): `/api/subscriptions/*`, `/api/finance/*`, `/api/integrations/*`, `/api/marketplace/*`, `/api/auth/tenant`, CSV/export URLs, etc.

**Convention:** migrate calls to `customFetch` (and add a Zod schema + registry row when missing).

### Maintaining declaration builds

`artifacts/prosan` references `lib/api-client-react` with **`composite`** emit to `dist/`. After changing `@workspace/api-client-react` exports, run:

`pnpm exec tsc -p lib/api-client-react`

### `lib/api-zod` package exports

The root package no longer re-exports `./generated/types` (it overlapped `./generated/api` and broke `tsc`). Import split TypeScript types from `@workspace/api-zod/generated/types` if needed.
