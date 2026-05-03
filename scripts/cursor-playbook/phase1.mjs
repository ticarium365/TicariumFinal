import {
  sectionBand,
  gap,
  contextBox,
  h2,
  promptBox,
  pb,
} from "./helpers.mjs";

export function phase1Blocks() {
  return [
    sectionBand(
      "1",
      "Design System & Theme",
      "Establish the single source of truth for every visual decision in the codebase",
    ),
    gap(120),

    contextBox(
      "Current state (from screens): Dark navy sidebar (#0F2444 range), white content area, blue accents.\n" +
        "Issues: no CSS token file, colors are scattered as hardcoded Tailwind classes across 53 pages,\n" +
        "typography is inconsistent (mix of font sizes without scale), spacing has no rhythm,\n" +
        "no dark mode support, component variants are copy-pasted rather than composed.",
    ),
    gap(80),

    h2("P1-A  —  Audit existing tokens"),
    promptBox(
      "P1-A · Token Audit",
      "Phase 1 → Design System",
      `You are working on Ticarium365 — a multi-tenant SaaS ERP for Turkish SMBs.
Tech stack: React + Vite + TypeScript + Tailwind CSS, monorepo at artifacts/prosan.

Task: Audit the entire frontend codebase for design tokens.
1. Search all files under artifacts/prosan/src for hardcoded color values
   (hex strings, rgb(), hsl(), or Tailwind arbitrary values like [#1a2b4a]).
2. Search for hardcoded font-size values not coming from a Tailwind scale.
3. Search for hardcoded spacing values (px, rem) not on the Tailwind scale.
4. Produce a report grouped by: Colors / Typography / Spacing / Border-radius.
   For each group list: value found · file · line number · how many times used.
5. Identify the top-10 most-used color values — these become our token candidates.

Output the report as a markdown table. Do not change any code yet.`,
      "Run this before touching any code. The report drives P1-B.",
    ),
    gap(80),

    h2("P1-B  —  Create design token file"),
    promptBox(
      "P1-B · Design Tokens",
      "Phase 1 → Design System",
      `Based on the P1-A audit report, create the design token foundation for Ticarium365.

Create file: artifacts/prosan/src/styles/tokens.css

Requirements:
- CSS custom properties (--color-*, --font-*, --spacing-*, --radius-*)
- Color palette must include:
    Sidebar/nav background: deep navy family (4 shades)
    Primary brand blue: action color family (5 shades, 50→900)
    Neutral grays: 9-step scale (50→900)
    Semantic: success (green), warning (amber), danger (red), info (blue)
    Surface whites: background, card, elevated
- Typography scale:
    Font family: system-ui stack with Inter as primary (already loaded via CDN or install @fontsource/inter)
    Size scale: 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32 / 40px — named xs/sm/base/lg/xl/2xl/3xl/4xl/5xl
    Weight: 400 regular · 500 medium · 600 semibold · 700 bold
    Line-height: 1.4 tight · 1.6 normal · 1.8 relaxed
- Spacing: 4px base unit, scale 1–16 (4/8/12/16/20/24/32/40/48/64/80/96/128px)
- Border radius: 4/6/8/12/16/24/9999px
- Shadow: 3 elevations (sm / md / lg) — flat by default, subtle

Then update tailwind.config.ts to consume these CSS variables via theme.extend.
Do not delete any existing Tailwind utilities — only extend.`,
      "After this step run: pnpm -C artifacts/prosan build — must have 0 errors.",
    ),
    gap(80),

    h2("P1-C  —  Global stylesheet wiring"),
    promptBox(
      "P1-C · Global Styles",
      "Phase 1 → Design System",
      `Wire the design tokens into the app's global stylesheet.

1. Import tokens.css at the top of artifacts/prosan/src/index.css (before Tailwind directives).
2. Set base HTML/body defaults:
   - background-color: var(--color-surface-bg)
   - color: var(--color-neutral-900)
   - font-family: var(--font-family-sans)
   - font-size: var(--font-size-base)
   - line-height: var(--line-height-normal)
   - -webkit-font-smoothing: antialiased
3. Reset: remove browser default margins on h1-h6, p; set box-sizing: border-box globally.
4. Create utility classes for the sidebar: .sidebar-bg, .sidebar-text, .sidebar-item-active,
   .sidebar-item-hover — using the token variables.
5. Verify the app still renders correctly after these changes (no broken layouts).`,
      null,
    ),
    gap(80),

    h2("P1-D  —  Typography component"),
    promptBox(
      "P1-D · Typography",
      "Phase 1 → Design System",
      `Create a Typography component system for Ticarium365.

Create: artifacts/prosan/src/components/ui/typography.tsx

Export these components (all typed with TypeScript):
  <Heading1> <Heading2> <Heading3> <Heading4>
  <Body> <BodySmall> <Caption> <Label> <Code>
  <PageTitle>  (used at top of every page, 28px semibold)
  <SectionTitle>  (used for card/section headers, 16px semibold)

Each component:
- Accepts className prop for overrides
- Uses token CSS variables for all sizing/color
- Has a default html element (h1-h4, p, span, code) but accepts 'as' prop
- Renders with correct color: headings use --color-neutral-900,
  body uses --color-neutral-700, captions use --color-neutral-500

After creating: search for all raw <h1> <h2> <h3> <p> usages in
artifacts/prosan/src/pages/* and replace with the new Typography components.
Show the diff for 3 example pages before applying globally.`,
      null,
    ),
    gap(80),

    h2("P1-E  —  Sidebar & layout shell"),
    promptBox(
      "P1-E · Layout Shell",
      "Phase 1 → Design System",
      `Refactor the app layout shell to use the design system.

Target files:
- artifacts/prosan/src/components/ (find the sidebar/layout component)
- artifacts/prosan/src/App.tsx (route structure)

Requirements:
1. Sidebar:
   - Background: var(--color-nav-bg) — deep navy
   - Width: 240px collapsed label + icon, 64px icon-only mode with tooltip
   - Nav items: 40px height, 8px border-radius, left border 3px accent when active
   - Font: 14px medium, --color-nav-text default, --color-nav-text-active when selected
   - Group labels: 11px uppercase tracking-wider, --color-neutral-400
   - Bottom section: user avatar + name + role chip + logout
2. Top bar:
   - 56px height, border-bottom 1px --color-border-subtle
   - Left: page title (dynamic)
   - Right: search (Cmd+K trigger), notifications bell, user menu
3. Content area:
   - padding: 24px
   - max-width: none (full width)
   - background: var(--color-surface-bg)
4. Responsive: sidebar collapses to icon-only below 1280px, hidden below 768px (hamburger menu)

Use CSS variables for all colors — no hardcoded Tailwind color classes in this component.`,
      "This is the most visible change. Screenshot before/after for comparison.",
    ),
    gap(80),

    h2("P1-F  —  Color theme consistency sweep"),
    promptBox(
      "P1-F · Color Sweep",
      "Phase 1 → Design System",
      `Replace all hardcoded colors identified in P1-A with design token variables.

Strategy:
1. Create a migration map:  old-value → new-token
   Example: #1a2b4a → var(--color-nav-bg)
            #3b82f6 → var(--color-brand-500)
            text-gray-500 → use --color-neutral-500
2. Run the replacements file by file — do NOT do a global find/replace
   (context matters: same hex can mean different things in different components).
3. After each file: verify the component still renders correctly.
4. Priority order:
   a. Layout components (sidebar, topbar, layout shell) ← do first
   b. Shared UI components (Button, Card, Badge, Input, Table)
   c. Page-level components
5. When done: grep the codebase for remaining hex values.
   Report any that could not be mapped to a token (leave those for manual review).

Do not change any functionality — color/spacing only.`,
      null,
    ),

    pb(),
  ];
}
