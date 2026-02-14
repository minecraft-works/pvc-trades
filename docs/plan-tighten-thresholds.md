# Plan: Tighten Quality Thresholds

## Status: **COMPLETE**

## Summary

| Area | Previous | New | Type |
|------|----------|-----|------|
| Cyclomatic complexity | 15 | **12** | Tighter |
| Cognitive complexity | 15 | 15 (keep) | No change |
| Max lines/function | 100 | **75** | Tighter |
| Test max lines (spec) | 250 | **200** | Tighter |
| Duplicate string | 3 | **4** | More lenient |
| Bundle size (fail) | 120 kB | 120 kB (keep) | No change |
| Bundle size (warn) | — | **100 kB** | New CI warning |
| Lighthouse perf | 0.70 warn | 0.70 (defer 0.80) | Deferred |

---

## Phase 0 — Config-Only Changes

- [x] `eslint.config.js`: Change `sonarjs/no-duplicate-string` threshold from 3 → 4
- [x] `eslint.config.js`: Change `tests/**/*.spec.ts` `max-lines-per-function` from 250 → 200
- [x] Verify: `npm run lint` passes

## Phase 1 — Fix Pre-existing Complexity Violations

`createTradeRowElement` was already under CC 15. Six other functions exceeded CC 12.

- [x] Extract `applyTradeRowClasses()` and `buildTradeRowHTML()` from `createTradeRowElement`
- [x] Verify: function now under CC 12

## Phase 2 — Complexity Threshold (15 → 12)

- [x] Refactor `renderDashboard` (CC 15): extracted `appendDashboardSections()`, `wireDashboardItemLinks()`
- [x] Refactor `switchTab` (CC 14): extracted `setActive()`, `setHidden()` helpers with `classList.toggle()`
- [x] Refactor `handleFoundPlayer` (CC 14): extracted `handlePortalCrossing()`, `pushInterpolatorSample()`
- [x] Refactor `setupFavoritesDialog` (CC 14): extracted `handleFavoritesListClick()`, `setupPopoverHandlers()`
- [x] Refactor `computeDashboardData` (CC 13): extracted `processDashboardTrade()` with `DashboardTradeContext` interface
- [x] Refactor `loadNavMapTiles`: extracted `loadZoom4Tiles()`, `loadZoom8Tiles()` with `TileLoadContext` interface; removed cognitive-complexity suppress
- [x] Change `eslint.config.js` `complexity` from 15 → 12
- [x] Lint and typecheck pass at CC 12

## Phase 3 — Line Count Threshold (100 → 75)

- [x] Split `initNavigationMapDialog` (89 lines): extracted `createNavLeafletMap()`, `exposeNavTestGlobals()`, `bindDynamicTileLoading()`
- [x] Split `DOMContentLoaded` callback (99 lines): extracted `setupSearchInputHandlers()`, `setupKeyboardShortcuts()`, `setupAllDialogs()`
- [x] Fix `processDashboardTrade` max-params regression (9 params → `DashboardTradeContext` interface)
- [x] Change `eslint.config.js` `max-lines-per-function` from 100 → 75
- [x] Keep `createFavoritesUIHandler` suppression (factory pattern justified)
- [x] Lint and typecheck pass at 75 lines

## Phase 4 — Test File Split

- [x] `tests/layout.spec.ts` already passes at 200-line spec override — no split needed

## Phase 5 — Bundle Size Warning (CI)

- [x] Added CI step in `.github/workflows/ci.yml` that emits `::warning::` if bundle > 100 kB
- [x] Existing 120 kB hard-fail step unchanged

## Phase 6 — Documentation

- [x] Updated this plan with completion status
- [x] Updated `docs/plan-quality-improvements.md` with new thresholds

## Deferred

- Lighthouse performance: leave at 0.70, raise to 0.80 as separate performance effort

## Decisions

- `createFavoritesUIHandler` keeps its `max-lines-per-function` suppression — factory closures make splitting counterproductive
- Scripts override stays at `complexity: 25`, `max-lines: 150`
- `src/**/*.test.ts` keeps `max-lines-per-function: off` — only `tests/**/*.spec.ts` gets 200
- Bundle warning uses CI script step (no size-limit plugin for warn-only)

## Refactoring Summary

### Files Modified

| File | Changes |
|------|---------|
| `eslint.config.js` | complexity 15→12, max-lines 100→75, duplicate-string 3→4, spec test max-lines 250→200 |
| `src/main.ts` | ~12 helper functions extracted from 6 large functions |
| `src/library.ts` | Extracted `processDashboardTrade()` with `DashboardTradeContext` |
| `src/favorites/favorites-ui.ts` | Extracted `handleFavoritesListClick()`, `setupPopoverHandlers()` |
| `.github/workflows/ci.yml` | Added 100kB warning step |

## Verification

All phases verified with: `npm run lint`, `npm test`, `npm run typecheck`
After Phase 3: `npm run test:e2e` (extracted functions are DOM code — BDD tests are the safety net)
After Phase 5: Push to branch, verify CI shows warning annotation
