# Plan: Enforce File Size Limits (400 Lines)

## Status: **IN PROGRESS** — ESLint rule added, decomposition not started

## Rule

| Scope | Threshold | Enforcement |
|-------|-----------|-------------|
| `src/**/*.ts` (production) | 400 lines (skip blanks + comments) | ESLint `max-lines` error |
| `src/**/*.test.ts` | exempt | `max-lines: 'off'` override |
| `src/**/*.property.test.ts` | exempt | `max-lines: 'off'` override |
| `tests/**/*.spec.ts` | exempt | `max-lines: 'off'` override |
| `features/**/*.ts` | exempt | `max-lines: 'off'` override |
| `scripts/*.ts` | exempt | `max-lines: 'off'` override |

## Current Violations

3 files exceed 400 effective lines (blank + comment lines excluded). Each has `/* eslint-disable max-lines */` with a reference back to this plan.

| # | File | Raw lines | Effective | Over by | Suppressed |
|---|------|----------:|----------:|--------:|:---:|
| 1 | `src/main.ts` | 2,823 | ~2,400+ | +2,000+ | Yes |
| 2 | `src/library.ts` | 2,095 | ~1,700+ | +1,300+ | Yes |
| 3 | `src/favorites/favorites-ui.ts` | 495 | ~430 | ~+30 | Yes |

### Watch List (under 400 effective, but close)

These files are compliant today but should be monitored. No suppression needed.

| File | Raw lines | Status |
|------|----------:|--------|
| `src/stores/navigation-store.ts` | 504 | Under 400 effective (many comments) |
| `src/map/shop-map-dialog.ts` | 467 | Under 400 effective (many blanks + comments) |
| `src/types.ts` | 433 | Under 400 effective (many comments) |
| `src/stores/player-interpolator.ts` | 313 | Well under limit |

---

## Decomposition Plans

### 1. `src/main.ts` → 7 new modules (~2,823 → ~400 lines)

The god file has 16 logical sections. Extract these section groups into new modules:

#### 1a. `src/dashboard/dashboard-ui.ts` (~310 lines)

Extract the Daily Deals Dashboard rendering section (lines 647–953).

**Functions to move:**
- `showDashboard()` — DOM: shows/hides dashboard banner
- `formatDeviationText()` — pure
- `renderWatchlistItem()` — pure (returns HTML string)
- `buildWatchlistDelta()` — pure (returns HTML string)
- `buildWatchlistSection()` — DOM: creates section element
- `buildNewTradesSection()` — DOM: creates section element
- `buildPriceDropsSection()` — DOM: creates section element
- `appendDashboardSections()` — DOM
- `wireDashboardItemLinks()` — DOM
- `renderDashboard()` — DOM
- `dismissDashboard()` — DOM
- `toggleDashboard()` — DOM

**Dependencies:** `DashboardData`, `PriceDrop`, `WatchlistHit` types, `snapshotStore`, `DASHBOARD` constants, `formatRelativeTime` from library.

**Pattern:** Factory function `createDashboardHandler(deps)` like `createFavoritesUIHandler`.

#### 1b. `src/rendering/trade-row.ts` (~250 lines)

Extract trade row rendering (lines 954–1220).

**Functions to move:**
- `getArrow()` — pure
- `updateSortArrows()` — DOM
- `renderHeader()` — DOM
- `getCostDisplayInfo()` — pure
- `getWorldDisplayInfo()` — pure
- `getDeviationClass()` — pure
- `itemHasDetails()` — pure
- `getDeviationDisplayInfo()` — reads module state
- `getFavoriteInfo()` — reads stores
- `applyTradeRowClasses()` — DOM
- `buildTradeRowHTML()` — pure (returns HTML string)
- `createTradeRowElement()` — DOM
- `renderResults()` — DOM + VirtualScroller

**Dependencies:** `FilterResult`, `Trade` types, `CSS_CLASSES`, `COLUMNS`, stores, `getDeviation`, VirtualScroller.

#### 1c. `src/cart/cart-dialog.ts` (~280 lines)

Extract Cart Dialog section + Tab Switching (lines 1244–1521).

**Functions to move:**
- `createCartItemElement()` — DOM
- `getStopStatus()` — pure
- `createTimelineStop()` — DOM
- `renderCartDialog()` — DOM
- `setupCartTabs()` — DOM
- `setActive()`, `setHidden()` — DOM helpers
- `switchTab()` — DOM
- `restoreActiveTab()` — DOM
- `setupPlayerNameInput()` — DOM

**Dependencies:** `Trade`, `RouteStop` types, `cartStore`, `navigationStore`, constants.

**Pattern:** Factory function `createCartDialogHandler(deps)`.

#### 1d. `src/navigation/live-navigation.ts` (~400 lines)

Extract Live Navigation + Nav Animation Loop (lines 1522–2500, currently 980 lines → split further if needed).

**Functions to move:**
- `startNavigation()` — DOM + Leaflet
- `stopNavigation()` — DOM + Leaflet
- `toggleNavigation()` — wrapper
- `showPlayerNotFound()` — DOM
- `handlePortalCrossing()` — DOM + map reinit
- `pushInterpolatorSample()` — pure
- `handleFoundPlayer()` — mixed
- `pollPlayerPosition()` — DOM + fetch
- `updatePlayerMarker()` — Leaflet
- `updatePlayerMarkerPosition()` — Leaflet
- `startNavAnimationLoop()` — RAF + Leaflet
- `stopNavAnimationLoop()` — cancelAnimationFrame
- `recalculateRouteFromPlayer()` — Leaflet
- `updatePlayerToNextLine()` — Leaflet
- `updateLiveDistance()` — DOM + Leaflet
- `updateRouteMarkersForCompletion()` — Leaflet
- `checkAutoAdvance()` — mixed

If still >400, split further into `live-navigation.ts` (poll + state) and `nav-animation.ts` (RAF loop + markers).

#### 1e. `src/navigation/nav-map.ts` (~400 lines)

Extract Navigation Map section (lines 2501–2895).

**Functions to move:**
- `cleanupNavMap()` — Leaflet
- `calculateTileRangeForView()` — pure
- `calculateTileRangeFromView()` — Leaflet reads
- `loadZoom4Tiles()` / `loadZoom8Tiles()` — Leaflet
- `loadNavMapTiles()` — Leaflet
- `createRouteMarkersUnified()` — Leaflet
- `createNavLeafletMap()` — Leaflet
- `exposeNavTestGlobals()` — globalThis
- `bindDynamicTileLoading()` — Leaflet events
- `initNavigationMapDialog()` — Leaflet + DOM
- `renderNavigateTab()` — DOM

These plus view-world toggle functions: `initViewWorldButtons()`, `toggleViewWorldMode()`, `toggleViewWorld()`, `centerMapOnPlayer()`, `switchToManualMode()`/`switchToFollowMode()`, `updateFollowToggleButton()`, `toggleFollowMode()`, `setupNavigationControls()`.

If >400 lines, split view-world/follow-mode into `nav-controls.ts`.

#### 1f. `src/sorting/sort-engine.ts` (~80 lines)

Extract sorting logic from main.ts (currently misplaced in Dashboard section).

**Functions to move:**
- `sortByColumn()` — DOM (calls search)
- `sortResults()` — pure
- `compareDeviation()` — pure
- `getTotalCostAmount()` — pure
- `compareByColumn()` — pure

**Dependencies:** `FilterResult`, `SortColumn`, `SortDirection`, `SORT` constants.

The pure functions here could also go into `library.ts` or `search/` — but a dedicated module is cleaner.

#### 1g. Residual `src/main.ts` (~400 lines)

What remains:
- Imports + state declarations (~50 lines)
- Cart helper functions (~25 lines)
- Navigation progress helpers (~185 lines — some pure, keep here as app-level orchestration)
- DOM helpers (~15 lines)
- Data loading (`refreshShopData`, `loadShops`, `processShops` — ~130 lines)
- Search functions (`debouncedSearch`, `search`, `triggerSearch`, `clearSearchInput` — ~106 lines)
- Initialization / DOMContentLoaded (~175 lines)

Total residual: ~685 lines. Needs one more split:

#### 1h. `src/data/data-loader.ts` (~130 lines)

Move `refreshShopData()`, `loadShops()`, `processShops()` here.

#### After all extractions, `main.ts` residual: ~555 lines

Still over 400. Further extract:

#### 1i. `src/search/search-ui.ts` (~110 lines)

Move `getCachedRegex()`, `debouncedSearch()`, `countDeals()`, `search()`, `triggerSearch()`, `updateClearButtonVisibility()`, `clearSearchInput()`.

**Final `main.ts` residual: ~445 lines.** Close to 400. The initialization section (177 lines) could be split to `src/init.ts` to bring it under, or the state declarations + nav progress helpers can be trimmed further.

---

### 2. `src/library.ts` → 5 new modules (~2,095 → ~400 lines)

#### 2a. `src/valuation/item-values.ts` (~230 lines)

Extract Item Value Calculation (lines 759–988).

**Functions:**
- `calculateItemValues()` — exported
- `getTrustedItemValue()` — exported
- `normalizeToBaseCurrency()`, `addValue()`, `processDirectTrade()`, `processDirectTradeWithItem2()`, `deriveTransitiveValue()`, `deriveTransitiveValueWithItem2()` — private helpers

#### 2b. `src/valuation/ratio-graph.ts` (~190 lines)

Extract Ratio Graph + Exchange Matrix (lines 571–758).

**Functions:**
- `buildRatioGraph()`, `getRatio()`, `buildExchangeMatrix()` — exported
- `addRatioToGraph()`, `buildEmeraldValuesFromTrades()`, `addBlockConversionValues()`, `calculateCoreBlockRatios()`, `buildDirectionalEmeraldValues()` — private helpers

#### 2c. `src/valuation/statistics.ts` (~100 lines)

**Functions:**
- `median()`, `countIndependentShops()`, `hasEnoughIndependentData()` — exported
- `getMedianValue()`, `getDirectTradeValue()`, `getBlockConversionValue()`, `getReverseConversionValue()` — private helpers

#### 2d. `src/routing/route-optimizer.ts` (~330 lines)

Extract Route Optimization TSP section (lines 1408–1738).

**Functions:**
- `toOverworldEquivalent()`, `toViewCoords()`, `calculateRouteDistance()`, `buildDistanceMatrix()` — exported
- `nearestNeighborOrder()`, `calculateOrderDistance()`, `twoOptOptimize()`, `computeOptimalOrder()` — exported
- `calculateEdgeIndices()`, `shouldSwapEdges()`, `applyTwoOptSwap()` — private helpers

#### 2e. `src/dashboard/dashboard-data.ts` (~250 lines)

Extract Daily Deals Dashboard computation (lines 2061–2308).

**Functions:**
- `computeDashboardData()`, `formatRelativeTime()` — exported
- `isNewTrade()`, `detectPriceDrop()`, `updateWatchlistHit()`, `buildBestDeviationMap()`, `filterToGlobalBestDrops()`, `processDashboardTrade()` — private helpers

#### 2f. Residual `src/library.ts` (~400 lines)

What remains:
- Store re-exports (~23 lines — to be removed eventually)
- Query matching (~60 lines)
- Formatting (~94 lines)
- Shulker parsing (~45 lines)
- HTML utilities (~41 lines)
- Location/distance (~22 lines)
- Trade processing (~64 lines)
- Trade filtering (~72 lines)
- Sorting (~69 lines)
- Shopping/navigation helpers (~173 lines — `aggregateShoppingList`, `buildMarkerContent`, etc.)

Total: ~665 lines. Still over. Further split:

#### 2g. `src/routing/navigation-helpers.ts` (~175 lines)

Move shopping & navigation helpers: `aggregateShoppingList()`, `calculateTotalRouteDistance()`, `buildMarkerContent()`, `buildStopTooltip()`, `getZoomForHeight()`, `hasPositionMoved()`.

#### 2h. Move interpolation functions out of `library.ts`

The Player Position Interpolation section (lines 1912–2060, ~149 lines) contains: `estimateVelocity()`, `extrapolatePosition()`, `lerpPosition()`, `lerpAngle()`, `shouldExtrapolate()`. These are already duplicated — `src/stores/player-interpolator.ts` exists. Verify if library.ts versions are dead code or the canonical source, then consolidate.

#### 2i. `src/map/map-math.ts` (~230 lines)

Move Map Utilities: `isNether()`, `getTradeKey()`, `getWorldId()`, `shouldSwitchMapWorld()`, `getTileOffset()`, `calculateFitZoom()`, `toLeafletCoords()`, `toLeafletCoordsRelative()`, `fromLeafletCoordsRelative()`, `clampToCircle()`.

**Final `library.ts` residual: ~310 lines** (query matching + formatting + shulker parsing + HTML utils + location + trade processing + trade filtering + sorting). Under 400. ✅

---

### 3. `src/stores/navigation-store.ts` (504 → <400 lines)

The store has a single class. Split approach:

#### 3a. Extract serialization methods → `src/stores/navigation-persistence.ts` (~80 lines)

Move `saveProgress()`, `loadProgress()`, `clearProgress()` and the `NavigationProgress` serialization logic.

#### 3b. Extract map object management → reuse in `src/navigation/`

The `MapObjects` interface and methods like `setMap()`, `getMap()`, `setPlayerMarker()`, `getPlayerMarker()`, `setRoutePolyline()`, etc. are Leaflet wrappers. Consider moving the map-object portion to `src/navigation/nav-state.ts`.

**Target: ~400 lines.** Only 104 lines over — one extraction suffices.

---

### 4. `src/favorites/favorites-ui.ts` (495 → <400 lines)

#### 4a. Extract popover logic → `src/favorites/favorites-popover.ts` (~120 lines)

**Functions:**
- `hidePopover()`
- `positionAndShowPopover()`
- `updatePopoverThresholdControls()`
- `updatePopoverUI()`
- `readThresholdFromPopover()`

These are self-contained popover display/read functions.

**Target: ~375 lines.** ✅

---

### 5. `src/map/shop-map-dialog.ts` (467 → <400 lines)

#### 5a. Extract tile loading → `src/map/shop-map-tiles.ts` (~100 lines)

**Functions:**
- `loadZoom4TileToShopMap()`
- `loadZoom8TileToShopMap()`
- `loadVisibleShopMapTiles()`

These are self-contained tile-loading routines with a `ShopMapTileContext` interface.

**Target: ~370 lines.** ✅

---

### 6. `src/types.ts` (433 → <400 lines)

#### 6a. Extract snapshot types → `src/types/snapshot-types.ts` (~80 lines)

Move: `TradeSnapshotEntry`, `TradeSnapshot`, `TradeSnapshotSchema`, `SnapshotHistorySchema`, `CompactSnapshot`, `CompactSnapshotHistory`, `CompactSnapshotHistorySchema`, `PriceDrop`, `WatchlistHit`, `DashboardData`.

These are all dashboard/snapshot related and only used by `snapshot-store.ts` and `dashboard-data` logic.

#### 6b. Alternative: exempt `types.ts` from `max-lines`

Schema/type centralization is an intentional project convention. Adding an ESLint override for `src/types.ts` specifically may be more pragmatic than splitting type files (which creates import churn). Only 33 lines over.

**Recommendation:** Split if combining with `valuation/` module extraction (the `ItemValueEntry`, `PriceEntry`, `RatioGraph` types would move to `src/valuation/types.ts`). Otherwise, exempt.

---

## Implementation Order

Work bottom-up (small wins first, unblock the large files later):

| Phase | File | Extraction | Lines saved | Difficulty |
|-------|------|-----------|-------------|------------|
| 1 | `types.ts` | Snapshot types → `types/snapshot-types.ts` (or exempt) | ~80 | Easy |
| 2 | `shop-map-dialog.ts` | Tile loading → `map/shop-map-tiles.ts` | ~100 | Easy |
| 3 | `favorites-ui.ts` | Popover → `favorites/favorites-popover.ts` | ~120 | Easy |
| 4 | `navigation-store.ts` | Persistence → `stores/navigation-persistence.ts` | ~80 | Easy |
| 5 | `library.ts` | Valuation → `valuation/` (3 files) | ~520 | Medium |
| 6 | `library.ts` | Route optimizer → `routing/` | ~330 | Medium |
| 7 | `library.ts` | Dashboard data → `dashboard/dashboard-data.ts` | ~250 | Medium |
| 8 | `library.ts` | Map math → `map/map-math.ts` | ~230 | Medium |
| 9 | `library.ts` | Nav helpers + interpolation cleanup | ~325 | Medium |
| 10 | `main.ts` | Dashboard UI → `dashboard/dashboard-ui.ts` | ~310 | Hard |
| 11 | `main.ts` | Trade row → `rendering/trade-row.ts` | ~250 | Hard |
| 12 | `main.ts` | Cart dialog → `cart/cart-dialog.ts` | ~280 | Hard |
| 13 | `main.ts` | Nav map + controls → `navigation/nav-map.ts` | ~400 | Hard |
| 14 | `main.ts` | Live navigation → `navigation/live-navigation.ts` | ~400 | Hard |
| 15 | `main.ts` | Data loader + search UI | ~240 | Medium |

**After all phases:** every production file in `src/` ≤ 400 lines, and all `eslint-disable max-lines` suppressions are removed.

## Rules for New Code

- **No new file may exceed 400 lines** (enforced by ESLint `max-lines` error)
- Before adding a function to an existing file, check if it pushes the file over 400 lines
- Prefer creating a new sub-module over growing an existing file
- Each extraction phase should include unit tests for any newly-exposed exported functions
- Update barrel `index.ts` files when adding modules to maintain clean imports

## Verification

After each phase:
1. `npm run lint` — no `max-lines` violations (or one fewer suppression)
2. `npm run typecheck` — no type errors
3. `npm test` — unit tests pass
4. `npm run test:e2e` — BDD tests pass (critical for `main.ts` extractions)
5. Remove the `eslint-disable max-lines` from the completed file
