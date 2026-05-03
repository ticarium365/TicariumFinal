import {
  sectionBand,
  gap,
  h2,
  promptBox,
  pb,
} from "./helpers.mjs";

export function phase3Blocks() {
  return [
    sectionBand(
      "3",
      "UX / Interaction Quality",
      "Empty states, loading skeletons, error boundaries, feedback — the details that make it feel finished",
    ),
    gap(120),

    h2("P3-A  —  Loading & skeleton states"),
    promptBox(
      "P3-A · Loading States",
      "Phase 3 → UX",
      `Add proper loading states to all data-fetching screens.

Create: artifacts/prosan/src/components/ui/Skeleton.tsx
  - <SkeletonLine width? height=16px borderRadius=4px />
  - <SkeletonBlock width height borderRadius? />
  - <SkeletonTable rows=5 columns=4 /> — renders a full table skeleton

Rules:
- Every page that fetches data MUST show a skeleton while loading, not a spinner
  (exception: actions like "Save" use button spinner)
- Skeleton dimensions must match the real content dimensions — measure the actual
  rendered height of the DataTable row (40px) and use that for skeleton rows
- Use CSS animation: opacity 0.5→1→0.5 at 1.5s ease-in-out, infinite
  Color: var(--color-neutral-100) with shimmer overlay

Screens that MUST have skeleton loading (priority):
  Dashboard · SalesHistory · Products · Finance Panel · Marketplace accounts
  Orders · StockEntries · Suppliers

TanStack Query integration:
  In each page component, use the isLoading state from useQuery to conditionally
  render <SkeletonTable> vs actual <DataTable>.
  Never render an empty DataTable while loading.`,
      null,
    ),
    gap(80),

    h2("P3-B  —  Empty states"),
    promptBox(
      "P3-B · Empty States",
      "Phase 3 → UX",
      `Design and implement empty states for all list/table views.

Create: artifacts/prosan/src/components/ui/EmptyState.tsx
  Props: icon (SVG component) · title · description · action? (label + onClick)
  Layout: centered, icon 48px, title 16px semibold, description 14px neutral-500,
          action button below with 16px gap

Empty state content by screen (write the actual copy in Turkish):

Ürünler (no products yet):
  Icon: box/package
  Title: "Henüz ürün eklenmedi"
  Description: "İlk ürününüzü ekleyerek stok takibine başlayın."
  Action: "Ürün Ekle"

Müşteriler (no customers):
  Icon: user group
  Title: "Müşteri listesi boş"
  Description: "Yeni müşteri ekleyin veya mevcut verileri içe aktarın."
  Action: "Müşteri Ekle"

Satış Geçmişi (no sales):
  Icon: receipt
  Title: "Henüz satış yok"
  Description: "İlk satışınızı yapmak için Satış Ekranı'nı kullanın."
  Action: "Satış Yap"

Pazaryeri accounts (no channels connected):
  Icon: store
  Title: "Henüz kanal bağlanmadı"
  Description: "Trendyol, Hepsiburada veya n11 hesabınızı bağlayarak satışlarınızı senkronize edin."
  Action: "Kanal Bağla"

Teklifler / Siparişler: similar pattern — create for all 8 remaining list screens.

Wire these into all DataTable usages via the emptyState prop.`,
      null,
    ),
    gap(80),

    h2("P3-C  —  Error handling & boundaries"),
    promptBox(
      "P3-C · Error Handling",
      "Phase 3 → UX",
      `Implement consistent error handling across the frontend.

1. React Error Boundary:
   Create artifacts/prosan/src/components/ErrorBoundary.tsx
   - Wraps each page route
   - On uncaught error: show centered error card (not blank screen)
     "Bir hata oluştu · Sayfayı yenile" with a Retry button
   - Log error to Sentry (import from src/lib/sentry.ts)

2. API error handling (TanStack Query):
   Create a useApiError hook that maps backend error codes to user-facing messages:
     TENANT_SESSION_MISMATCH → "Oturum hatası. Lütfen tekrar giriş yapın." + redirect /login
     401 Unauthorized → redirect /login
     403 Forbidden → "Bu işlem için yetkiniz yok."
     404 Not Found → "Kayıt bulunamadı."
     500 Internal → "Sunucu hatası. Lütfen tekrar deneyin."
     Network error → "İnternet bağlantınızı kontrol edin."

3. Form validation errors:
   - Never use alert() or console.error for user-facing errors
   - Field-level errors: red border + message below field using <Input error="..."> prop
   - Form-level errors: <Banner variant="danger"> at top of form

4. Toast notifications:
   Install and configure sonner (already common in Vite/React projects)
   or use a simple custom toast context.
   Success toasts: green, auto-dismiss 3s
   Error toasts: red, auto-dismiss 6s, has "Kapat" button

   Usage pattern:
     After successful save → toast.success("Kaydedildi")
     After delete → toast.success("Silindi") with Undo action (5s window)
     After API error → toast.error(mappedErrorMessage)`,
      null,
    ),
    gap(80),

    h2("P3-D  —  Micro-interactions & feedback"),
    promptBox(
      "P3-D · Interactions",
      "Phase 3 → UX",
      `Add micro-interactions that make the UI feel responsive and polished.

1. Button feedback:
   - All buttons: scale(0.97) on active press (CSS transition 80ms)
   - Primary action buttons: subtle ring on focus (outline 2px var(--color-brand-500) offset 2px)

2. Table row interactions:
   - Hover: background var(--color-neutral-50), transition 120ms
   - Click to expand detail: smooth height animation (use CSS grid rows trick, not max-height)
   - Row selection: checkbox slides in from left on hover of any row in the table

3. Sidebar navigation:
   - Active item: left border 3px brand-500 animates in on route change (scale-y from 0→1, 150ms)
   - Tooltip on collapsed mode: delay 400ms before showing, positioned to the right

4. Form interactions:
   - Label: floats up when input is focused (floating label pattern) — optional, only if clean
   - Input focus: border-color transitions to brand-500 in 120ms
   - Save button: disabled until form is dirty (has unsaved changes)

5. Page transitions:
   - On route change: fade-in 150ms ease-out
   - Do NOT do slide animations (causes layout shift with sidebar)

6. Command palette (Ctrl+K):
   - Already mentioned in docs — ensure it is working and includes:
     All 53 page names in Turkish · Recent pages · Quick actions (Yeni Satış, Yeni Ürün, etc.)

Keep all animations under 200ms. No animation on data tables (too much content shifting).`,
      null,
    ),
    gap(80),

    h2("P3-E  —  Mobile responsiveness"),
    promptBox(
      "P3-E · Mobile",
      "Phase 3 → UX",
      `Make Ticarium365 functional on mobile and tablet.

Breakpoints (add to tailwind config):
  sm: 640px · md: 768px · lg: 1024px · xl: 1280px · 2xl: 1536px

Priority screens for mobile (Turkish SMB owners check these on phone):
  Dashboard · POS (Hızlı Satış) · SalesHistory · Notifications · Abonelik

POS screen mobile layout:
  - Stack vertically: product search at top, cart below, payment button fixed at bottom
  - Product grid: 2 columns on mobile (vs 4+ on desktop)
  - Cart items: full width, swipe right to remove

Dashboard mobile:
  - KPI cards: 2-column grid (not 4 across)
  - Activity feed: full width, remove secondary columns
  - Quick actions: horizontal scroll row

DataTable mobile:
  - Show 3 most important columns only (configure per screen via a mobileColumns prop)
  - "Tümünü Gör" button opens drawer with full row detail

Sidebar mobile:
  - Hidden by default, hamburger menu top-left
  - Opens as overlay drawer (not push layout)
  - Close on route change

Forms:
  - Full-width inputs on mobile
  - Action buttons: stack vertically, primary on top

Test on: 375px (iPhone SE) and 768px (iPad) viewport widths.`,
      null,
    ),

    pb(),
  ];
}
