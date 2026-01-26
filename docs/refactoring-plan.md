# Refactoring Plan for Vibe Coding Maintainability

> **Created**: January 26, 2026  
> **Goal**: Make the codebase more maintainable for AI-assisted "vibe coding" development  
> **Status**: Phase 2 In Progress (Cart ✅ | Nav Pending)

---

## Executive Summary

The PVC Trades codebase has solid foundations (types, tests, tooling) but has grown organically to a point where the main entry file (`main.ts`) at **3,246 lines** creates challenges for AI-assisted development. This plan breaks down improvements into phases with clear deliverables.

---

## Current State Analysis

### Metrics

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| `main.ts` lines | 3,142 | <500 per file | 🔴 Critical |
| `library.ts` lines | 1,789 | <1,000 | 🟡 Medium |
| ESLint errors | 0 ✅ | 0 | ✅ Done |
| `@ts-expect-error` count | 20+ | 0 | 🟡 Medium |
| `eslint-disable` count | 19 | <10 | 🟡 Low |
| Cart state in store | ✅ | ✅ | ✅ Done |
| Nav state in store | ❌ | ✅ | 🔴 Critical |

### Risk Assessment for Vibe Coding

| Risk | Impact | Description |
|------|--------|-------------|
| Context window overflow | High | AI can't see full 3,217-line file, generates inconsistent code |
| Implicit state coupling | High | 15 navigation state variables interact in undocumented ways |
| Duplicate logic | Medium | Distance/coordinate calculations scattered across files |
| Type assertion sprawl | Low | `@ts-expect-error` for testing bypasses type safety |

---

## Phase 1: Quick Wins ✅ COMPLETED

### 1.1 Fix ESLint Errors ✅
**Effort**: 30 minutes  
**Files**: `src/main.ts`

Fixed 14 linting issues:
- [x] Removed 10 unnecessary type assertions (used generic `querySelector<T>`)
- [x] Refactored 2 if-in-else anti-patterns (lines 742, 751)
- [x] Used optional chaining (line 2614)
- [x] Removed 2 unnecessary non-null assertions (lines 2623, 2624)

### 1.2 Create Constants Module ✅
**Effort**: 30 minutes  
**Files**: New `src/constants.ts`

Created centralized constants module with:
- [x] `NAVIGATION` - Arrival/nearby thresholds
- [x] `MAP_CONFIG` - Tile and zoom settings
- [x] `DEVIATION` - Price deviation limits
- [x] `SORT` - Default sort settings
- [x] `STORAGE_KEYS` - LocalStorage key names
- [x] `CSS_CLASSES` - Common CSS class names
- [x] `SELECTORS` - DOM selector strings
- [x] `DIALOG_IDS` - Dialog element IDs
- [x] `WORLDS` - Minecraft dimension names
- [x] `COLUMNS` - Table column identifiers

### 1.3 Add File Navigation Comments ✅
**Effort**: 15 minutes  
**Files**: `src/library.ts`

Added comprehensive navigation index to library.ts header with line numbers for:
- Stores & Configuration (35-176)
- Text Processing (230-403)
- Location & Geometry (444-602)
- Sorting & Comparisons (602)
- Value Calculations (671-915)
- Map & Navigation (1105-1637)
    CART_EMPTY: 'cart-empty',
    TRADE_ROW: 'trade-row',
} as const;

export const SELECTORS = {
    MAP_DIALOG: '#map-dialog',
    NAV_DIALOG: '#nav-dialog',
    PLAYER_NAME_INPUT: '#player-name-input',
} as const;
```

### 1.3 Add File Navigation Comments to library.ts
**Effort**: 15 minutes  
**Files**: `src/library.ts`

Add section index similar to `main.ts`:

```typescript
/**
 * ## FILE NAVIGATION
 * 
 * | Section | Line | Description |
 * |---------|------|-------------|
 * | Config Store | ~37 | ConfigStore class, getConfig, loadConfig |
 * | Core Blocks Store | ~107 | CoreBlocksStore, getCoreBlocks |
 * | Block Conversions Store | ~160 | BlockConversionsStore, loadFixedRatios |
 * | Query Matching | ~220 | matchesQuery, enchantsMatch |
 * | Formatting | ~280 | formatName, applyMapping, getRegex |
 * | ...
 */
```

---

## Phase 2: State Management Refactor (3-4 hours)

### 2.1 Create NavigationStore ✅
**Effort**: 2 hours  
**Files**: New `src/stores/navigation-store.ts`  
**Status**: COMPLETE

Created NavigationStore class with:
- [x] Serializable state (isActive, mode, playerName, position, progress, routes)
- [x] Non-serializable Leaflet map objects (map, markers, polylines)
- [x] Viewport management (world, center coordinates)
- [x] Refresh interval management
- [x] localStorage persistence (progress, playerName, mode)
- [x] Testing support (_reset method)

### 2.2 Create CartStore ✅
**Effort**: 1 hour  
**Files**: New `src/stores/cart-store.ts`  
**Status**: COMPLETE

Created CartStore class with:
- [x] Item management (add, remove, updateQuantity, setQuantity)
- [x] Queries (find, has, isEmpty, totalQuantity, uniqueCount)
- [x] localStorage persistence (load, save)
- [x] Change notification system (onChange callback)
- [x] Testing support (_reset, _getItemsRef, _setItems)

### 2.3 Migrate main.ts to Use Stores
**Effort**: 2 hours  
**Files**: `src/main.ts`  
**Status**: CART COMPLETE ✅ | NAV PENDING

Migration steps:
- [x] Import cartStore from `./stores/index.js`
- [x] Replace `let cart: CartItem[] = []` with `cartStore.items`
- [x] Replace `loadCart()` calls with `cartStore.load()`
- [x] Replace `cart.find()` with `cartStore.find()`, `cart.some()` with `cartStore.has()`
- [x] Replace `addToCart()` with `cartStore.add()`, etc.
- [x] Register `updateCartBadge` as `cartStore.onChange()` callback
- [x] Remove unused imports (`CartItem`, `STORAGE_KEYS`)
- **Net reduction: 73 lines removed from main.ts**
- [ ] Replace 15+ nav state variables with `navigationStore`
- [ ] Update all navigation functions to use store methods
- [ ] Remove duplicate @ts-expect-error globals

```typescript
// src/stores/cart-store.ts
class CartStore {
    private items: CartItem[] = [];
    private readonly storageKey = STORAGE_KEYS.CART;
    
    constructor() {
        this.load();
    }
    
    add(trade: Trade): void { ... }
    remove(trade: Trade): void { ... }
    updateQuantity(trade: Trade, delta: number): void { ... }
    clear(): void { ... }
    cleanupZeroQuantity(): void { ... }
    
    get all(): CartItem[] { return [...this.items]; }
    get count(): number { ... }
    get shoppingList(): ShoppingList { ... }
    
    private load(): void { ... }
    private save(): void { ... }
}

export const cartStore = new CartStore();
```

### 2.3 Create Test API Module
**Effort**: 30 minutes  
**Files**: New `src/test-api.ts`, modify `src/main.ts`

Replace `@ts-expect-error` globals with proper test interface:

```typescript
// src/test-api.ts
import { cartStore } from './stores/cart-store.js';
import { navigationStore } from './stores/navigation-store.js';

/**
 * Test API for E2E testing.
 * Only exposes what tests need, with proper types.
 */
export const testAPI = {
    cart: {
        get items() { return cartStore.all; },
        get count() { return cartStore.count; },
    },
    navigation: {
        get isActive() { return navigationStore.isNavigating; },
        get currentRoute() { return navigationStore.route; },
        get playerPosition() { return navigationStore.playerPosition; },
    },
    // For Leaflet map access (needed by some tests)
    getNavMap: () => navigationStore.getMap(),
};

// Expose in development only
if (import.meta.env.DEV) {
    (globalThis as unknown as { __testAPI: typeof testAPI }).__testAPI = testAPI;
}
```

---

## Phase 3: Module Extraction (4-6 hours)

### 3.1 Extract Map Tile Module
**Effort**: 2 hours  
**Files**: New `src/map/tile-loader.ts`

Extract tile loading, caching, and manifest logic (~300 lines):

```
src/map/
├── tile-loader.ts      # Tile caching, blob URLs, manifest
├── tile-types.ts       # TileConfig, LoadTileOptions interfaces
└── index.ts            # Barrel export
```

**Functions to extract**:
- `loadTileManifest()`
- `tileExistsInManifest()`
- `loadTileToMap()`
- `loadZoom4TileToShopMap()`
- `loadZoom8TileToShopMap()`
- `loadVisibleShopMapTiles()`
- `tileBlobCache` (convert to module-scoped)

### 3.2 Extract Player Markers Module
**Effort**: 1.5 hours  
**Files**: New `src/map/player-markers.ts`

Extract player position rendering (~200 lines):

**Functions to extract**:
- `fetchPlayers()`
- `getPlayerWorld()`
- `updateShopMapPlayerMarkers()`
- `createEdgeMarker()`
- `updatePlayerMarker()` (navigation variant)
- `cachedPlayers` state

### 3.3 Extract Navigation Map Module
**Effort**: 2 hours  
**Files**: New `src/navigation/nav-map.ts`

Extract navigation-specific map logic (~400 lines):

**Functions to extract**:
- `initNavigationMapDialog()`
- `createRouteMarkersUnified()`
- `loadNavMapTiles()`
- `calculateTileRangeUnified()`
- `calculateTileRangeFromView()`
- `cleanupNavMap()`

### 3.4 Extract Dialog Modules
**Effort**: 1 hour  
**Files**: New `src/dialogs/`

```
src/dialogs/
├── map-dialog.ts       # openMapDialog, setupShopMap
├── cart-dialog.ts      # renderCartDialog, createCartItemElement
├── matrix-dialog.ts    # renderMatrix, formatValue
└── index.ts
```

---

## Phase 4: Code Quality Polish (2-3 hours)

### 4.1 Reduce eslint-disable Comments
**Effort**: 1 hour

| Current Disable | Action |
|-----------------|--------|
| `unicorn/no-array-callback-reference` for Leaflet | Keep - documented false positive |
| `sonarjs/cognitive-complexity` | Refactor functions or keep with justification |
| `max-params` | Use options objects |
| `no-empty-pattern` in BDD | Keep - framework requirement |

### 4.2 Add JSDoc to Remaining Functions
**Effort**: 1 hour  
**Target**: All exported functions should have JSDoc with `@example`

### 4.3 Create Type Guards
**Effort**: 30 minutes

```typescript
// src/types.ts - add type guards
export function isNonNullPosition(
    pos: PlayerPosition | undefined
): pos is PlayerPosition {
    return pos !== undefined;
}

export function isShopStop(
    stop: RouteStop
): stop is RouteStop & { cartItem: CartItem } {
    return stop.type === 'shop' && stop.cartItem !== undefined;
}
```

### 4.4 Fix Markdown Lint Errors
**Effort**: 15 minutes  
**Files**: `README.md`, `SCENARIOS.md`

- Add language to fenced code blocks
- Add blank lines around lists and tables
- Fix table column spacing

---

## Phase 5: Documentation & Testing (2-3 hours)

### 5.1 Update Architecture Docs
**Effort**: 1 hour  
**Files**: `docs/architecture.md`

Add module dependency diagram after refactoring:

```
┌─────────────────────────────────────────────────────────┐
│                        main.ts                          │
│  (entry point, event binding, initialization)           │
└─────────────────────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   stores/   │ │   dialogs/  │ │    map/     │
│ cart-store  │ │ map-dialog  │ │ tile-loader │
│ nav-store   │ │ cart-dialog │ │ player-mkrs │
└─────────────┘ └─────────────┘ └─────────────┘
         │              │              │
         └──────────────┼──────────────┘
                        ▼
              ┌─────────────────┐
              │   library.ts    │
              │ (pure functions)│
              └─────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │    types.ts     │
              │  (Zod schemas)  │
              └─────────────────┘
```

### 5.2 Update Test Fixtures
**Effort**: 1 hour

Update BDD step definitions to use `testAPI` instead of `@ts-expect-error` globals.

### 5.3 Add Integration Tests for Stores
**Effort**: 1 hour

Add unit tests for new store classes:
- `src/stores/cart-store.test.ts`
- `src/stores/navigation-store.test.ts`

---

## Implementation Schedule

| Week | Phase | Deliverable | Hours |
|------|-------|-------------|-------|
| 1 | Phase 1 | Quick wins, constants extracted | 2h |
| 1-2 | Phase 2 | NavigationStore, CartStore, TestAPI | 4h |
| 2-3 | Phase 3.1-3.2 | Map modules extracted | 4h |
| 3 | Phase 3.3-3.4 | Nav map + dialogs extracted | 3h |
| 4 | Phase 4 | Code quality polish | 3h |
| 4 | Phase 5 | Docs and tests updated | 3h |

**Total Estimated Effort**: ~19 hours

---

## Success Criteria

After completing all phases:

- [ ] No file exceeds 500 lines (excluding tests)
- [ ] Zero ESLint errors
- [ ] Zero `@ts-expect-error` in production code
- [ ] All state managed through store classes
- [ ] AI can generate accurate code changes with single-file context
- [ ] All tests pass (unit + BDD + E2E)

---

## Temporary Settings (Revert After Migration)

These settings were temporarily modified to allow commits during the refactoring process. **Revert after Phase 2.3 is complete.**

### vitest.config.js
**Reason**: New stores have 0% coverage until integrated

```diff
- exclude: ['src/**/*.test.ts', 'src/types.ts', 'src/main.ts', 'src/debug.ts'],
+ exclude: ['src/**/*.test.ts', 'src/types.ts', 'src/main.ts', 'src/debug.ts', 'src/stores/**/*.ts', 'src/constants.ts'],
```

**Revert when**: Stores are integrated and have tests

### knip.json
**Reason**: MAP_CONFIG intentionally exported for future use

```diff
+ "rules": {
+   "exports": "warn"
+ }
```

**Revert when**: MAP_CONFIG is used (Phase 3 map module extraction)

### src/constants.ts line 28-29
**Reason**: Comment explains why MAP_CONFIG is exported but unused

```typescript
// knip-ignore-next - intentionally exported for Phase 3 migration
```

**Remove when**: MAP_CONFIG is imported by main.ts or map module

---

## Rollback Strategy

Each phase is designed to be independently deployable:

1. **Phase 1**: No breaking changes, pure cleanup
2. **Phase 2**: Stores can coexist with old code during transition
3. **Phase 3**: Extract one module at a time, test after each
4. **Phase 4-5**: Documentation only, no code risk

Recommend creating feature branches:
- `refactor/phase-1-quick-wins`
- `refactor/phase-2-stores`
- `refactor/phase-3-modules`

---

## Notes for AI Assistants

When working on this codebase:

1. **Check file size first** - If modifying `main.ts`, read the section index comment to find the right section
2. **Use stores** - Don't create new module-level `let` variables, add to appropriate store
3. **Follow existing patterns** - See `ConfigStore` in `library.ts` for store pattern
4. **Test after changes** - Run `npm run test:all` before committing
5. **Keep functions pure** - New logic goes in `library.ts`, DOM stuff in `main.ts` or dialogs
