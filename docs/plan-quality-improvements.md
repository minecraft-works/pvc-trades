# Quality Improvements Implementation Plan

## Overview

8 improvements to close testing, dev, and CI gaps. Each item lists where it runs (pre-commit, CI, or neither — code-only changes).

## Items

### 1. axe-core Accessibility Testing *(CI only — BDD tests are slow)*

- [x] Install `@axe-core/playwright`
- [x] Add shared BDD step `Then the page should have no accessibility violations`
- [x] Create `features/accessibility.feature` with scenarios for:
  - Main page with search results
  - Cart dialog
  - Favorites dialog
  - Trade details popover
- [x] Add step definition in `features/steps/accessibility.steps.ts`
- [x] Runs via `npm run test:e2e` (already in CI)

### 2. Cart Store Zod Validation *(code change only)*

- [x] Add `CartItemSchema` / `CartItemArraySchema` to `types.ts`
- [x] Replace `as CartItem[]` cast in `cart-store.ts` `load()` with `.safeParse()`
- [x] Update `cart-store.test.ts` with a corrupt-data test case

### 3. Bundle Size Budget *(CI only — requires build)*

- [x] Install `size-limit` and `@size-limit/file`
- [x] Add `size-limit` config to `package.json` (120 kB brotli limit)
- [x] Add `"size"` script to `package.json`
- [x] Add size check step to `ci.yml` (after build)

### 4. Global Error Boundary *(code change only)*

- [x] Add `unhandledrejection` listener in `main.ts` initialization
- [x] Route to existing `debug` logger

### 5. Expand Mutation Testing Scope *(CI only — very slow)*

- [x] Add `snapshot-store.ts`, `favorites-store.ts`, `tile-coords.ts`, `player-interpolator.ts` to `stryker.config.mjs` `mutate` array

### 6. Coverage JSON Reporter for CI *(CI only)*

- [x] Add `json-summary` to vitest coverage reporters

### 7. Visual Regression Testing *(CI only — BDD screenshot tests are slow)*

- [x] Create `features/visual-regression.feature` with key UI states
- [x] Add step definitions using Playwright `toHaveScreenshot()`
- [x] Scenarios: main trade table, cart dialog, favorites dialog, trade details popover
- [ ] Store baseline screenshots in repo (generated on first `npx playwright test --update-snapshots`)

### 8. Flaky Test Detection *(CI only)*

- [x] Add JSON reporter to Playwright config for test result tracking
- [x] Upload Playwright JSON report + HTML report as CI artifact (30-day retention)

## Pre-commit vs CI Decision

| Check | Pre-commit | CI | Rationale |
|-------|------------|-----|-----------|
| axe-core a11y | No | Yes | BDD tests take 30s+ |
| Cart Zod validation | n/a (code) | n/a | Covered by existing typecheck + unit tests |
| Bundle size budget | No | Yes | Requires full build |
| Global error boundary | n/a (code) | n/a | Code change only |
| Mutation scope | No | Yes | Takes minutes |
| Coverage JSON | No | Yes | Reporter addition |
| Visual regression | No | Yes | Screenshot comparison is slow |
| Flaky test detection | No | Yes | CI-only concept |

**Conclusion**: No new pre-commit hooks needed. All new checks run via existing CI jobs or as code changes validated by existing pre-commit hooks (typecheck, lint, unit tests).

## Implementation Order

1. Cart store Zod validation (tiny, fixes consistency gap)
2. Global error boundary (tiny, code only)
3. Expand mutation scope (tiny config change)
4. Coverage JSON reporter (tiny config change)
5. Bundle size budget (small, install + config)
6. axe-core a11y testing (small, new feature + scenarios)
7. Visual regression testing (medium, new screenshots)
8. Flaky test detection (small, CI config)
