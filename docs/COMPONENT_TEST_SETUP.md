# Component Test Setup

## Overview

Component tests have been created for the UI component library using Vitest, @testing-library/react, and jsdom.

## Installation

Test dependencies added to `artifacts/prosan/package.json`:
- `vitest@^2.1.8`
- `@vitest/ui@^2.1.8`
- `@testing-library/react@^16.1.0`
- `@testing-library/jest-dom@^6.6.3`
- `@testing-library/user-event@^14.5.2`
- `jsdom@^25.0.1`

**Run `pnpm install` in `artifacts/prosan` to install dependencies.**

## Configuration

**vitest.config.ts** - Vitest configuration with jsdom environment and path aliases

**src/test/setup.ts** - Test setup file (imports @testing-library/jest-dom)

## Test Files

- `src/components/ui/button.test.tsx` - Button component tests
- `src/components/ui/data-table.test.tsx` - DataTable component tests
- `src/components/ui/modal.test.tsx` - Modal component tests
- `src/components/ui/input.test.tsx` - Input component tests

## Running Tests

```bash
cd artifacts/prosan
pnpm install
pnpm test
```

## Test Coverage

### Button.tsx
- ✅ Renders with correct text
- ✅ Calls onClick when clicked
- ✅ Does NOT call onClick when disabled
- ✅ Shows spinner when loading=true
- ✅ Applies correct CSS class for each variant (primary/secondary/danger/ghost)

### DataTable.tsx
- ✅ Renders column headers correctly
- ✅ Renders correct number of rows
- ✅ Shows loading state when loading=true
- ✅ Shows EmptyState when data=[] and loading=false
- ✅ Calls onSort with correct column key when sortable header clicked
- ✅ Pagination: shows correct page

### Modal.tsx
- ✅ Renders children in body
- ✅ Calls onClose when ESC key pressed
- ✅ Calls onClose when clicking overlay backdrop
- ✅ Does NOT call onClose when clicking modal content

### Input.tsx
- ✅ Shows error message when error prop provided
- ✅ Input has red border-color class when error provided
- ✅ Calls onChange with correct value

## Notes

- Tests use jsdom for DOM simulation
- All tests co-located with source files as `*.test.tsx`
- TypeScript errors will resolve after `pnpm install`
