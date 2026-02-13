# PVC Trades Development Guide

## Project Overview

A Minecraft Shop Trade Viewer with exchange rate matrix, deviation tracking, and Dynmap integration for live navigation.

## File Organization

```
src/
├── main.ts          # DOM/UI code, event handlers, rendering
├── library.ts       # Pure functions - no DOM dependencies
├── types.ts         # TypeScript types and Zod schemas
└── debug.ts         # Debug utilities

features/
├── *.feature        # Gherkin BDD scenarios
└── steps/           # Step definitions using playwright-bdd
    └── fixtures.ts  # Shared test fixtures
```

### When to Put Code Where

| Code Type | Location | Example |
|-----------|----------|---------|
| Pure calculations | `library.ts` | `calculateRouteDistance()`, `median()` |
| Zod schemas | `types.ts` | `AppConfigSchema`, `BlockConversionsSchema` |
| TypeScript interfaces | `types.ts` | `Trade`, `CartItem`, `FilterResult` |
| DOM manipulation | `main.ts` | `renderCart()`, `openDialog()` |
| Event handlers | `main.ts` | `handleAddToCart()`, `handleSearch()` |
| BDD scenarios | `features/*.feature` | Browser integration tests |
| Unit tests | `src/*.test.ts` | Pure function tests |

## Coding Conventions

### Naming Conventions

- `camelCase` for functions and variables
- `PascalCase` for types, interfaces, and classes
- `SCREAMING_SNAKE_CASE` for constants
- Prefix unused parameters with `_` (e.g., `_event`, `_index`)

### Function Patterns

```typescript
// ✅ Pure functions: no side effects, return value based on inputs
export function calculateDistance(x1: number, z1: number, x2: number, z2: number): number {
    return Math.hypot(x1 - x2, z1 - z2);
}

// ✅ Early returns over nested conditionals
export function getTrustedValue(item: string, values: ItemValues): number | undefined {
    if (item === 'emerald') { return 1; }
    if (item === 'emerald block') { return 9; }
    
    const entry = values.get(item.toLowerCase());
    if (!entry) { return undefined; }
    
    return median(entry.buyPrices);
}

// ✅ Max 5 parameters; use options object for more
export function getTrustedItemValue(
    itemName: string,
    itemValues: ItemValues,
    options: TrustedValueOptions = {}
): number | undefined { ... }
```

### TypeScript Style

- Prefer `undefined` over `null` (enforced by `unicorn/no-null`)
- Use `unknown` for external data, validate with Zod
- Prefer `for...of` over `.forEach()` (enforced by `unicorn/no-array-for-each`)
- Use template literals over string concatenation
- Always add JSDoc for exported functions

```typescript
// ✅ Validate external data with Zod
const data: unknown = await response.json();
const parsed = AppConfigSchema.safeParse(data);
if (!parsed.success) { return DEFAULT_CONFIG; }
return parsed.data;

// ✅ Use for...of
for (const item of items) {
    processItem(item);
}

// ❌ Don't use forEach
items.forEach(item => processItem(item));
```

### State Management Pattern

Use class-based stores for shared state:

```typescript
class CartStore {
    private items: CartItem[] = [];
    
    add(item: CartItem): void { /* ... */ }
    remove(key: string): void { /* ... */ }
    get(): CartItem[] { return [...this.items]; }
}

export const cartStore = new CartStore();
```

### Event Handler Pattern

Separate event wiring from business logic:

```typescript
// ✅ Separate concerns
button.addEventListener('click', handleAddToCart);

async function handleAddToCart(event: MouseEvent): Promise<void> {
    const item = getItemFromEvent(event);
    cartStore.add(item);
    renderCart();
}

// ❌ Don't mix concerns
button.addEventListener('click', async (e) => {
    const data = await fetch(...);
    processData(data);
    updateUI(data);
});
```

## Testing Patterns

### Unit Tests (Vitest)

- Location: `src/*.test.ts` adjacent to source
- Pure functions only, no browser needed
- Fast, isolated, precise failure messages

```typescript
import { describe, test, expect } from 'vitest';
import { calculateRouteDistance, median } from './library.js';

describe('calculateRouteDistance', () => {
    test('same point returns zero', () => {
        expect(calculateRouteDistance(0, 0, 'overworld', 0, 0, 'overworld')).toBe(0);
    });
    
    test('nether coords multiplied by 8', () => {
        const dist = calculateRouteDistance(0, 0, 'overworld', 100, 100, 'the_nether');
        expect(dist).toBeCloseTo(Math.hypot(800, 800));
    });
});
```

### BDD Tests (Playwright-BDD)

- Location: `features/*.feature` for scenarios
- Location: `features/steps/*.steps.ts` for step definitions
- Use fixtures pattern from `fixtures.ts`
- Mock external APIs, never hit real endpoints

```gherkin
@cart @totals
Scenario: Show aggregated costs in cart
  Given the app is loaded with mock shop data
  And I add a trade to the cart
  When I open the cart dialog
  Then I should see total costs showing "Diamond"
```

```typescript
import { Given, When, Then } from './fixtures';

Given('I add a trade to the cart', async ({ page }) => {
    await page.locator('.add-to-cart-btn').first().click();
});
```

## CSS Conventions

- Use CSS custom properties for theming (defined in `:root`)
- Follow BEM-like naming: `.component-element--modifier`
- Mobile-first responsive design

```css
/* Custom properties for theming */
:root {
    --color-primary: #4a9eff;
    --color-success: #4caf50;
    --spacing-sm: 4px;
}

/* BEM-like naming */
.cart-item { }
.cart-item-quantity { }
.cart-item--completed { }
```

## Domain Invariants

These are Minecraft/domain facts that never change:

### Coordinate Systems

- **Nether coordinates × 8 = overworld equivalent** (Minecraft hardcoded)
- Always normalize to overworld for distance calculations
- World types: `'overworld' | 'the_nether' | 'the_end'`

```typescript
// Cross-world distance: normalize first
const [ox1, oz1] = world1 === 'the_nether' ? [x1 * 8, z1 * 8] : [x1, z1];
const [ox2, oz2] = world2 === 'the_nether' ? [x2 * 8, z2 * 8] : [x2, z2];
return Math.hypot(ox1 - ox2, oz1 - oz2);
```

### External Data Handling

- All external data is `unknown` until validated
- Use `.safeParse()` with fallback, never `.parse()` that throws
- Catch network errors at call site, return fallback value

```typescript
// ✅ Correct pattern
const result = Schema.safeParse(data);
return result.success ? result.data : DEFAULT_VALUE;

// ❌ Never do this
try { return Schema.parse(data); } catch { return DEFAULT_VALUE; }
```

### Performance Thresholds

- Virtual scroll when list exceeds ~100 items
- Debounce user input (search: 100-200ms)
- Player position polling: 1000ms interval
- Auto-advance threshold: 8 blocks from shop

### Test Placement

| Code Under Test | Test Type | Location |
|-----------------|-----------|----------|
| Pure calculation | Unit test | `src/*.test.ts` |
| DOM interaction | BDD test | `features/*.feature` |
| Timing-sensitive | Mock time | Never real-wait |

## Domain Glossary

| Term | Definition |
|------|------------|
| **Overworld** | Main Minecraft dimension (green coords in UI) |
| **Nether** | Hell dimension with 8:1 coordinate ratio (red coords in UI) |
| **Trade** | A shop offer: give items to receive items |
| **Deviation** | How much a trade's price differs from median market price |
| **Core Blocks** | Base currencies: Emerald, Diamond, Gold, Iron, Netherite blocks |
| **Route** | Optimized order to visit shops in cart |
| **Independent Shops** | Shops >16 blocks apart (prevents price manipulation) |

## Tile System Workflow

Map tiles are pre-fetched at build time to minimize requests to the external Dynmap server.

### Build-Time Tile Collection

```
Deploy Workflow:
├── 1. Restore tile cache (GitHub Actions cache)
├── 2. npm run fetch-data      → Fresh shop data
├── 3. npm run fetch-tiles     → Fetch tiles around CURRENT shops
│   ├── Read shops from public/data.json
│   ├── Calculate 5×5 tile grid around each shop (zoom 8)
│   ├── Add base map tiles (zoom 4, range -5 to 4)
│   ├── Skip tiles already in cache
│   ├── Fetch missing tiles with rate limiting
│   └── Write manifest.json (only successful tiles)
├── 4. npm run validate-tiles  → Check integrity + coverage
├── 5. npm run build           → Bundle to dist/
└── 6. Deploy dist/ to GitHub Pages
```

### Key Files

| File | Purpose |
|------|---------|. 
| `scripts/fetch-tiles.ts` | Build-time tile fetcher with Playwright + stealth |
| `scripts/validate-tiles.ts` | Post-fetch validation (manifest ↔ files, shop coverage) |
| `src/tile-coords.ts` | **Shared** coordinate utilities (single source of truth) |
| `src/map/tile-loader.ts` | Runtime tile loading with blob URL caching |
| `public/tiles/manifest.json` | Lists all available tiles |

### Tile Coordinate System

```typescript
// Tile size at each zoom level
const blocksPerTile = tileSize × 2^(maxZoom - zoom)
// zoom 8 (max): 512 blocks/tile (detail tiles)
// zoom 4:       8192 blocks/tile (overview tiles)

// Block coords → tile coords
const tileX = Math.floor(blockX / blocksPerTile);
const tileZ = Math.floor(blockZ / blocksPerTile);
```

### Important Constraints

- **Never spam the Dynmap server** - tiles are cached in GitHub Actions
- **Manifest reflects reality** - only successfully fetched tiles are listed
- **Validation catches drift** - detects missing tiles before deploy
- **Shared coordinate logic** - `src/tile-coords.ts` is the single source of truth

See [ADR-010](docs/adr/010-tile-loading-minimization.md) for the rationale.

## Git Conventions

### Branching Strategy

- `main` - Production-ready code
- `develop` - Integration branch
- `feature/*` - New features
- `fix/*` - Bug fixes

### Conventional Commits

```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat:` - New feature (minor version bump)
- `fix:` - Bug fix (patch version bump)
- `docs:` - Documentation only
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `ci:` - CI/CD changes

**Breaking Changes:**
Add `!` after type or include `BREAKING CHANGE:` in the footer:

```
feat!: change API endpoint

BREAKING CHANGE: This changes the endpoint structure
```

## Quick Reference

### Common Commands

```bash
npm run dev          # Start dev server
npm test             # Run unit tests
npm run test:e2e     # Run BDD tests
npm run typecheck    # TypeScript check
npm run lint         # ESLint check
npm run lint:fix     # Auto-fix lint issues
```

### Debug Logging

Enable debug logging in production via browser console:

```javascript
localStorage.debug = 'pvc:*';           // All logs
localStorage.debug = 'pvc:navigation';  // Navigation only
localStorage.debug = 'pvc:playerpoll';  // Player polling only
localStorage.debug = 'pvc:map';         // Map operations
localStorage.debug = 'pvc:tiles';       // Tile loading details
delete localStorage.debug;              // Disable logging
```

Logs appear in browser console with namespace prefixes (e.g., `pvc:navigation Starting navigation...`).

### Key Files to Know

- `config.json` - App configuration (Dynmap URLs, analysis settings)
- `core_currencies.json` - List of core blocks for ratio matrix
- `block_conversions.json` - Block ↔ ingot conversion rates

### Architectural Decision Records (ADRs)

Significant design decisions are documented in `docs/adr/`. Consult these before making changes to established patterns:

- [ADR-001](docs/adr/001-price-aggregation-design.md) - Price aggregation design
- [ADR-002](docs/adr/002-bdd-test-framework.md) - BDD test framework choice
- [ADR-003](docs/adr/003-disable-animations-in-tests.md) - Disabling animations in tests
- [ADR-004](docs/adr/004-route-optimization-algorithm.md) - Route optimization (nearest-neighbor + 2-opt)
- [ADR-005](docs/adr/005-class-based-stores.md) - Class-based store pattern
- [ADR-006](docs/adr/006-zod-runtime-validation.md) - Zod runtime validation
- [ADR-007](docs/adr/007-virtual-scrolling.md) - Virtual scrolling for large lists
- [ADR-008](docs/adr/008-nether-coordinate-system.md) - Nether coordinate normalization
- [ADR-009](docs/adr/009-tile-caching-strategy.md) - Tile caching with blob URLs
- [ADR-010](docs/adr/010-tile-loading-minimization.md) - Minimizing external tile requests

**Key principles:**
- **ADR-003**: Test-specific logic belongs in test fixtures, not production code
- **ADR-006**: Always use `.safeParse()` with fallback, never `.parse()`
- **ADR-008**: Normalize all coordinates to overworld-equivalent for distance calculations
