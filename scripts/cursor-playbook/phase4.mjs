import {
  sectionBand,
  gap,
  h2,
  promptBox,
  pb,
} from "./helpers.mjs";

export function phase4Blocks() {
  return [
    sectionBand(
      "4",
      "Architecture & Performance",
      "API contracts, query optimization, bundle size, auth hardening",
    ),
    gap(120),

    h2("P4-A  —  API contract & Zod validation"),
    promptBox(
      "P4-A · API Contract",
      "Phase 4 → Architecture",
      `Audit and harden the API contract between frontend and backend.

Context: The project uses lib/api-zod for shared Zod schemas.
Already done: Zod version standardized (O2), N+1 fixed (K2), duplicate endpoint removed (K3).

Tasks:
1. List every API endpoint used in artifacts/prosan/src — extract from useQuery/useMutation calls.
2. For each endpoint: verify there is a corresponding Zod schema in lib/api-zod.
3. Endpoints missing Zod schemas: create the response schema.
   Naming: z[Resource][Action]Response — e.g. zSaleCreateResponse, zProductListResponse
4. In the frontend API client (lib/api-client-react): add runtime validation.
   After each fetch: parse the response through the Zod schema.
   On parse failure: log to Sentry + throw typed error (do NOT silently swallow).
5. Critical endpoints that MUST be covered first:
   POST /api/sales (sale creation — money involved)
   POST /api/billing/checkout (payment — critical)
   GET /api/auth/me (auth — security)
   POST /api/stock/entries (stock — inventory integrity)
6. Generate a coverage report: list of endpoints with schema coverage Y/N.`,
      null,
    ),
    gap(80),

    h2("P4-B  —  Bundle optimization"),
    promptBox(
      "P4-B · Bundle Size",
      "Phase 4 → Architecture",
      `Analyze and optimize the frontend bundle size.

1. Run bundle analysis:
   Add to vite.config.ts:
     import { visualizer } from 'rollup-plugin-visualizer'
     plugins: [visualizer({ open: true, gzipSize: true })]
   Build: pnpm -C artifacts/prosan build
   Report: what are the top 10 largest modules?

2. Code splitting:
   Every page component must be lazy-loaded via React.lazy() + Suspense.
   Route-level splitting ensures the initial bundle only loads auth + layout + dashboard.
   Target: initial JS bundle < 200KB gzipped.

3. Heavy library audit:
   Check if any of these are imported globally (should be lazy or replaced):
   - moment.js → replace with date-fns or native Intl
   - lodash (full) → use lodash-es with tree-shaking or specific imports
   - Any chart library → only load on Finance/Reports pages

4. Image optimization:
   - All product images: lazy load (loading="lazy" + IntersectionObserver fallback)
   - Company logo: preload in <head> if used on every page
   - No images > 200KB without compression

5. TanStack Query cache:
   Set staleTime: 5 * 60 * 1000 for reference data (product list, customer list)
   Set staleTime: 0 for transaction data (sales, stock movements)
   Add queryClient.prefetchQuery on sidebar hover for likely next page.`,
      null,
    ),
    gap(80),

    h2("P4-C  —  Auth & session hardening"),
    promptBox(
      "P4-C · Auth Hardening",
      "Phase 4 → Architecture",
      `Harden the authentication and session flow on the frontend.

Context from tech docs:
- Session: cookie-based, connect-pg-simple store on PostgreSQL
- Auth validation: GET /api/auth/me — must have numeric id, non-empty username, valid role
- TENANT_SESSION_MISMATCH: session companyId vs host/subdomain mismatch → force logout
- ProtectedRoute: shows full-screen loader → redirects to /login?next=... if no auth
- Stale-on-error prevention: on /me error, clear cache immediately (already implemented)

Tasks:
1. Verify ProtectedRoute implementation covers ALL protected routes in App.tsx.
   Map every route — mark as public or protected. Any route serving real data must be protected.

2. Role-based access control (RBAC) on the frontend:
   Create usePermission(action) hook that checks current user's role:
     admin → all actions
     staff → no user management, no billing, no settings
     viewer → read-only on all screens (no create/edit/delete buttons)
   Replace any hardcoded role checks with this hook.

3. Session expiry UX:
   When /me returns 401 mid-session (tab left open):
   Show a modal: "Oturumunuz sona erdi. Devam etmek için lütfen tekrar giriş yapın."
   With "Giriş Yap" button → redirects preserving current URL as ?next=
   Do NOT redirect immediately (user may have unsaved form data).

4. Logout:
   Clear TanStack Query cache: queryClient.clear()
   Clear any localStorage/sessionStorage used by the app
   Then redirect to /login`,
      null,
    ),
    gap(80),

    h2("P4-D  —  Multi-tenant UI"),
    promptBox(
      "P4-D · Multi-tenant",
      "Phase 4 → Architecture",
      `Ensure the frontend properly handles multi-tenant behavior.

Context: Each company (tenant) has its own subdomain. The backend enforces isolation.
Frontend must never mix tenant data or show wrong-tenant UI.

Tasks:
1. Company branding:
   Fetch company settings (logo, colors) from /api/settings/company on login.
   Store in React context (not localStorage — security risk).
   Apply company logo in: sidebar header · login page · PDF headers.
   If no custom logo: show "T365" wordmark fallback.

2. Tenant-aware error handling:
   If TENANT_SESSION_MISMATCH received anywhere → call logout() immediately.
   Log event to Sentry with companyId tag before clearing session.

3. Data isolation verification:
   In development mode, add a console assertion after every API response:
   assert(response.companyId === currentUser.companyId, 'TENANT LEAK DETECTED')
   This runs only in NODE_ENV=development — zero cost in production.

4. Super admin UI:
   Routes under /super-admin/* must check requireSuperAdmin.
   If non-superadmin visits these routes: 404 page, not 403 (don't reveal the route exists).
   Super admin mode: show a persistent banner "Super Admin Modu" in top bar.`,
      null,
    ),
    gap(80),

    h2("P4-E  —  Real-time & optimistic updates"),
    promptBox(
      "P4-E · Optimistic UI",
      "Phase 4 → Architecture",
      `Implement optimistic updates for the most frequent user actions.

TanStack Query optimistic update pattern to use:
  onMutate: update cache immediately
  onError: rollback to previous cache state
  onSettled: refetch to sync with server

Implement for these high-frequency actions:
1. Add item to POS cart → instant cart update, stock check in background
2. Mark sale as paid → status badge changes immediately
3. Toggle product active/inactive → switch flips immediately
4. Delete a row (with undo) → row disappears, toast appears with 5s Undo
   If user clicks Undo: rollback. If not: mutation confirms.
5. Update quantity in stock entry form → running total updates in real time

For the POS screen specifically:
- Local cart state is source of truth while building the sale
- Sale submission: optimistic pending state, spinner on "Satışı Kaydet" button
- On success: clear cart + navigate to receipt
- On failure: keep cart intact, show error toast

Do not implement WebSocket/SSE yet — optimistic updates cover 90% of the UX need.`,
      null,
    ),
    gap(80),

    h2("P4-F  —  Performance monitoring setup"),
    promptBox(
      "P4-F · Performance",
      "Phase 4 → Architecture",
      `Set up frontend performance monitoring.

1. Sentry frontend integration:
   Check artifacts/prosan/src/lib/sentry.ts (or create it).
   Initialize Sentry with:
     dsn: import.meta.env.VITE_SENTRY_DSN (must be separate from backend DSN)
     environment: import.meta.env.MODE (development / production)
     tracesSampleRate: 0.1 (10% of transactions in production)
     integrations: [Sentry.browserTracingIntegration()]

   Capture user context after login:
     Sentry.setUser({ id: user.id, username: user.username, role: user.role })
   Clear on logout: Sentry.setUser(null)

2. Web Vitals:
   Add web-vitals package and report LCP, FID, CLS to console in dev,
   to Sentry in production.
   Target: LCP < 2.5s, CLS < 0.1

3. API response time logging (dev only):
   Wrap the fetch client to log: [METHOD] /endpoint → Xms
   Anything over 500ms: log as warning
   Anything over 2000ms: log as error

4. React Query Devtools:
   Only in development mode:
   import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
   Add to App.tsx wrapped in {import.meta.env.DEV && <ReactQueryDevtools />}`,
      null,
    ),

    pb(),
  ];
}
