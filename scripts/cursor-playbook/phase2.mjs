import {
  sectionBand,
  gap,
  contextBox,
  h2,
  promptBox,
  pb,
} from "./helpers.mjs";

export function phase2Blocks() {
  return [
    sectionBand(
      "2",
      "Component Audit & Refactor",
      "Bring all 53 screens to the design system — consistent, composable, maintainable",
    ),
    gap(120),

    contextBox(
      "Ticarium365 has 53 screens across: Sales (8) · Product/Stock (8) · Finance (10) · Online Sales (10) ·\n" +
        "Reports (3) · Management (11) · Auth (3). Each screen needs the same component library.\n" +
        "Goal: one Button, one Table, one Card, one Badge — used everywhere, not copied.",
    ),
    gap(80),

    h2("P2-A  —  UI component library baseline"),
    promptBox(
      "P2-A · Component Library",
      "Phase 2 → Components",
      `Create the base UI component library for Ticarium365.

Create these components in artifacts/prosan/src/components/ui/:

Button.tsx
  Variants: primary | secondary | ghost | danger | link
  Sizes: sm (28px) | md (36px) | lg (44px)
  States: default · hover · active · disabled · loading (spinner replaces icon)
  Props: leftIcon?, rightIcon?, loading?, fullWidth?

Card.tsx
  Variants: default (white bg, 1px border, 8px radius, 16px padding)
            flat (no border, slightly gray bg)
            elevated (box-shadow md)
  Header slot, body slot, footer slot (optional)

Badge.tsx
  Colors mapped to semantic tokens: success | warning | danger | info | neutral | brand
  Sizes: sm | md
  Dot variant (just a colored circle + text)

Input.tsx
  States: default · focus · error · disabled
  Label above, helper text below, error message replaces helper on error
  Left icon slot, right icon slot
  Size: sm | md

Select.tsx — same pattern as Input

DataTable.tsx
  Props: columns (with sortable flag), data, loading, empty state slot
  Built-in: pagination (page size selector: 10/25/50), column sort, row selection checkbox
  Sticky header
  Row hover state

PageHeader.tsx
  Title + optional subtitle + right slot (for action buttons)
  Used at top of every page — standardizes the pattern

Modal.tsx
  Sizes: sm (400px) | md (560px) | lg (720px)
  Header with close button, body, footer (action buttons)
  Focus trap, ESC to close, click-outside to close

All components: TypeScript, full prop types, use design tokens only (no hardcoded colors).`,
      "Do not import these components anywhere yet — just create them. P2-B will integrate.",
    ),
    gap(80),

    h2("P2-B  —  Sales module screens"),
    promptBox(
      "P2-B · Sales Screens",
      "Phase 2 → Components",
      `Refactor all Sales module screens to use the new component library.

Screens to update (artifacts/prosan/src/pages/):
  SalesScreen (Satış Ekranı) · POSScreen (Hızlı Satış) · SalesHistory (Satış Geçmişi)
  Customers (Müşteriler) · Quotes (Teklifler B2B) · Orders (Siparişler B2B)
  LoyaltyPoints (Sadakat & Puan) · Campaigns (Kampanyalar)

For each screen:
1. Replace raw HTML tables with <DataTable> component
2. Replace raw buttons with <Button> component with correct variant
3. Replace inline card-like divs with <Card> component
4. Add <PageHeader> at top with title matching the sidebar label
5. Replace raw <input> elements with <Input> component
6. Add proper loading states (DataTable has built-in skeleton)
7. Add empty state: when list is empty, show centered illustration slot + message + CTA button

SalesScreen specific:
  - Product line items: use a composable line item row, not a big custom component
  - Customer select: combobox with search, show avatar initial + name + tax number
  - Total calculation area: sticky bottom bar on mobile

POSScreen specific:
  - Keep the two-column layout (product grid left, cart right)
  - Cart items: swipe-to-remove on mobile
  - Payment modal: use <Modal lg>

Do not change any business logic or API calls.`,
      null,
    ),
    gap(80),

    h2("P2-C  —  Finance module screens"),
    promptBox(
      "P2-C · Finance Screens",
      "Phase 2 → Components",
      `Refactor all Finance module screens to use the component library.

Screens: Kasa/Finans · Bankacılık · Finans Paneli · Net Kâr · Gerçek Kâr
         Bütçe · Mali Müşavir Portalı · e-Fatura/e-Arşiv · Evrak · Çoklu Para Birimi

Specific requirements:

Finans Paneli / Net Kâr / Gerçek Kâr:
  - KPI cards: use <Card flat> with large number (32px bold), label (12px), trend indicator
    (green up arrow / red down arrow + percentage)
  - Chart containers: 100% width, 300px min height, consistent border/radius
  - Date range picker: standardize to a single DateRangePicker component used on ALL finance screens

e-Fatura/e-Arşiv:
  - Status badges MUST use <Badge> component:
    Gönderildi=success · Beklemede=warning · Hata=danger · Taslak=neutral
  - Document list: <DataTable> with row actions (download PDF, resend, cancel)

Bütçe:
  - Progress bars: consistent height (8px), border-radius (4px), use token colors

Mali Müşavir Portalı:
  - Permission-gated view: if no accountant linked, show empty state with "Müşavir Davet Et" CTA
  - Shared document list: same DataTable pattern

Global rule for all finance screens:
  Currency display: always use Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY'})
  Date display: always use Intl.DateTimeFormat('tr-TR')`,
      null,
    ),
    gap(80),

    h2("P2-D  —  Online Sales / Marketplace screens"),
    promptBox(
      "P2-D · Marketplace Screens",
      "Phase 2 → Components",
      `Refactor Online Sales module screens.

Screens: Pazaryeri · Satış Kanalları · Hazır Mağaza · B2B Vitrin · B2B Ağı
         Ticarium Pazar · Fiyat Motoru · Kanal Karlılığı · Kargo · Reklam Bütçesi

Pazaryeri / Satış Kanalları:
  - Channel cards: logo + name + connection status badge + last sync time + quick actions
  - Connection status: use <Badge dot> — Bağlı=success · Hata=danger · Askıda=warning
  - Health indicator: color-coded dot with tooltip showing error detail

Fiyat Motoru / Kanal Karlılığı:
  - Rule cards: clear visual hierarchy — condition (if X) / action (then Y) layout
  - Profit indicators: always show absolute (TRY) + percentage side by side
  - Table: sortable by profit margin, highlight negative margin rows with danger-50 background

Kargo:
  - Provider selection: card grid with logo, estimated delivery, price — radio-select pattern
  - Tracking status: stepped progress indicator (Hazırlandı → Kargoya Verildi → Dağıtımda → Teslim)

B2B Vitrin / B2B Ağı / B2B Katalogum:
  - Customer group badges with color coding
  - Catalog assignment: drag-and-drop product list (or at minimum clear add/remove UX)

All marketplace screens:
  - MARKETPLACE_BASIC feature gate: if feature not active, show upgrade prompt overlay on the page
    (not a separate page — overlay keeps context)`,
      null,
    ),
    gap(80),

    h2("P2-E  —  Stock & Product screens"),
    promptBox(
      "P2-E · Stock Screens",
      "Phase 2 → Components",
      `Refactor Product & Stock module screens.

Screens: Ürünler · Stok Girişi · Stok Sayım · Barkod Tarama · Etiket Merkezi
         Alış Faturaları · Tedarikçiler · Veri İçe Aktarımı

Ürünler (Products list):
  - Table: image thumbnail (40x40, border-radius 6px) · SKU · name · stock level · price · status
  - Stock level: show as colored badge — Kritik (<min)=danger · Normal=neutral · Fazla (>max)=info
  - Bulk actions bar: appears when rows selected (delete, export, update price, assign category)
  - Quick edit: inline edit for price/stock without opening detail modal

Stok Girişi / Stok Sayım:
  - Line item entry: barcode scan field auto-focused, Enter moves to quantity, Tab moves to next row
  - Running total visible at all times (sticky bottom)
  - Save draft / finalize distinction — clear button states

Barkod Tarama:
  - Large prominent scan area
  - Last 5 scanned items visible
  - Sound/vibration feedback indicator (show state even if actual API not wired)

Veri İçe Aktarımı (Data Import):
  - Step indicator: Upload → Validate → Preview → Import
  - Validation errors: per-row, show row number + column name + issue
  - Preview table: max 20 rows, full column set
  - Progress bar during import with cancelable operation`,
      null,
    ),
    gap(80),

    h2("P2-F  —  Management & Settings screens"),
    promptBox(
      "P2-F · Management Screens",
      "Phase 2 → Components",
      `Refactor Management module screens.

Screens: Personel · Şubeler · Üretim & Reçete · Kullanıcılar · Genel Ayarlar
         Entegrasyonlar · Bildirim Ayarları · Abonelik · Paketler & Fiyatlar
         Belge Merkezi · B2B Katalogum

Genel Ayarlar:
  - Tabbed layout: Firma Bilgileri / Fatura Şablonu / KDV Oranları / Dil & Bölge
  - Logo upload: drag-drop zone, preview, file size/type validation
  - Unsaved changes warning: browser beforeunload + in-page banner

Entegrasyonlar:
  - Integration cards: provider logo + name + status badge + "Ayarla / Test Et / Kaldır" actions
  - API key input: masked by default, reveal toggle, copy button
  - Test connection: inline loading state → success/error result inline

Abonelik / Paketler & Fiyatlar:
  - Current plan highlighted with border-2 brand-500
  - Feature comparison table: checkmark (green) / x (gray) / partial note
  - Upgrade CTA: prominent, above the fold on the current plan card
  - Payment history: DataTable with PDF download per row

Kullanıcılar:
  - Role badges: Admin=brand · Staff=neutral · Viewer=gray — consistent with auth system roles
  - Invite flow: modal with email input + role select + send → pending badge on row
  - Deactivate: confirmation modal, not hard delete

Bildirim Ayarları:
  - Event rows with channel toggles (email/SMS/push) — toggle group, not separate checkboxes
  - Quiet hours: time range picker`,
      null,
    ),
    gap(80),

    h2("P2-G  —  Auth & onboarding screens"),
    promptBox(
      "P2-G · Auth & Onboarding",
      "Phase 2 → Components",
      `Refactor authentication and onboarding screens.

Screens: Giriş (Login) · Kayıt (Register) · Onboarding flow

Login screen (artifacts/prosan/src/pages/login or similar):
  - Center-card layout: max-width 400px, centered vertically and horizontally
  - Logo top center (from Genel Ayarlar company logo, fallback to Ticarium365 wordmark)
  - Form: Username field · Password field (toggle visibility) · Giriş Yap button (full width, primary)
  - "Şifremi Unuttum" link: bottom right, small, ghost style
  - Error state: inline error message below the form (not an alert at top)
  - Loading: button shows spinner, form fields disabled

Kayıt (Register):
  - Same card layout
  - Multi-step if needed: Company info → User info → Plan selection
  - Each step: progress indicator at top (Step 1 of 3)

Onboarding flow (first login redirect):
  - Full-screen wizard, NOT inside the main sidebar layout
  - Steps:
      1. Firma Bilgileri (company name, sector, city, tax number)
      2. İlk Ürün Ekle (product name, SKU, price, stock — optional but encouraged)
      3. Tamamlandı — "Ana Panele Git" CTA
  - Each step: illustration or icon area left, form right (or top/bottom on mobile)
  - Skip option on step 2
  - Progress: step dots at top
  - Completing onboarding: mark flag in user session/DB so it never shows again

All auth screens: no sidebar, no topbar — standalone full-page layout.`,
      "Test: a new user registration must land on onboarding, not dashboard.",
    ),

    pb(),
  ];
}
