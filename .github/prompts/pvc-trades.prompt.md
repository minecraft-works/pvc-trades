# PVC Trades Development Skill

Minecraft Shop Trade Viewer with exchange rate matrix, deviation tracking, and Dynmap integration.

---

## Where to Put Code

```
src/
├── main.ts          # DOM, events, rendering - NO pure logic here
├── library.ts       # Pure functions + config stores (ConfigStore, CoreBlocksStore)
├── types.ts         # Zod schemas + TypeScript types (z.infer<>)
├── constants.ts     # Magic numbers, thresholds, CSS selectors
├── debug.ts         # Debug utilities (import debug from 'debug')
├── stores/          # Stateful stores with localStorage persistence
│   ├── cart-store.ts
│   ├── navigation-store.ts
│   └── index.ts     # Barrel exports
├── map/             # Leaflet map tile loading
│   ├── tile-loader.ts
│   ├── tile-types.ts
│   └── index.ts
├── dialogs/         # Modal dialog modules
│   ├── matrix-dialog.ts
│   └── index.ts
└── *.test.ts        # Unit tests adjacent to source

features/
├── *.feature              # Gherkin BDD scenarios
├── *-properties.feature   # Property-based tests (Scenario Outline)
└── steps/
    ├── *.steps.ts         # Step definitions
    └── fixtures.ts        # Shared fixtures, mocks, Leaflet patches
```

**Decision rule**: 
- Needs `document`/`window` → `main.ts`
- Pure calculation → `library.ts`
- Magic number → `constants.ts`

---

## Code Patterns

### Pure Functions (library.ts)

```typescript
// ✅ Early returns, no side effects
export function getTrustedValue(item: string, values: ItemValues): number | undefined {
    if (item === 'emerald') { return 1; }
    if (item === 'emerald block') { return 9; }
    
    const entry = values.get(item.toLowerCase());
    if (!entry) { return undefined; }
    
    return median(entry.buyPrices);
}

// ✅ Max 5 params; use options object for more
export function calculateRoute(
    shops: Shop[],
    startPosition: Position,
    options: RouteOptions = {}
): RouteStop[] { /* ... */ }
```

### External Data Validation

```typescript
// ✅ Always safeParse with fallback - NEVER .parse()
async function loadConfig(): Promise<AppConfig> {
    try {
        const response = await fetch('/config.json');
        const data: unknown = await response.json();
        const result = AppConfigSchema.safeParse(data);
        return result.success ? result.data : DEFAULT_CONFIG;
    } catch {
        return DEFAULT_CONFIG;
    }
}
```

### Type Guards (types.ts)

```typescript
// Discriminate union types with type guards
import { isShopStop, isPortalStop } from './types.js';

const shops = route.filter(isShopStop);     // ShopStop[]
const portals = route.filter(isPortalStop); // PortalStop[]
```

### State Management (stores/*.ts)

```typescript
class CartStore {
    private items: CartItem[] = [];
    
    constructor() {
        this.items = this.loadFromStorage();
    }
    
    add(item: CartItem): void {
        this.items.push(item);
        this.persist();
    }
    
    getAll(): CartItem[] {
        return [...this.items]; // Defensive copy
    }
    
    private persist(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
        } catch { /* Storage full or blocked */ }
    }
    
    private loadFromStorage(): CartItem[] {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { return []; }
            const result = CartItemArraySchema.safeParse(JSON.parse(raw));
            return result.success ? result.data : [];
        } catch { return []; }
    }
}

export const cartStore = new CartStore();
```

### Event Handlers (main.ts)

```typescript
// ✅ Separate wiring from logic
button.addEventListener('click', handleAddToCart);

async function handleAddToCart(event: MouseEvent): Promise<void> {
    const row = (event.target as HTMLElement).closest('.trade-row');
    if (!row) { return; }
    
    const tradeKey = row.dataset.tradeKey;
    if (!tradeKey) { return; }
    
    cartStore.add(getTradeByKey(tradeKey));
    renderCart();
    updateBadge();
}

// ✅ Event delegation for dynamic content (virtual scroll)
container.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const row = target.closest('.trade-row');
    if (row) { handleRowClick(row); }
});
```

### Constants (constants.ts)

Centralized magic numbers and identifiers - **always import from here**:

```typescript
import { NAVIGATION, STORAGE_KEYS, SELECTORS, WORLDS } from './constants.js';

// Thresholds
NAVIGATION.ARRIVAL_THRESHOLD  // 8 blocks - auto-complete shop
NAVIGATION.NEARBY_THRESHOLD   // 100 blocks - show tooltip

// localStorage keys (prevents typos)
STORAGE_KEYS.CART             // 'pvc-trades-cart'
STORAGE_KEYS.NAV_PROGRESS     // 'pvc-trades-nav-progress'

// DOM selectors
SELECTORS.NAV_DIALOG          // '#nav-dialog'
SELECTORS.PLAYER_NAME_INPUT   // '#player-name-input'

// World identifiers
WORLDS.OVERWORLD              // 'overworld'
WORLDS.NETHER                 // 'the_nether'
```

### Debug Utilities (debug.ts)

Production-safe logging with the `debug` package:

```typescript
import { debugNavigation, debugTiles } from './debug.js';

debugNavigation('player moved to %d, %d', x, z);
debugTiles('loading tile %s at zoom %d', tileKey, zoom);
```

**Enable in browser console:**
```javascript
localStorage.debug = 'pvc:*';           // All logs
localStorage.debug = 'pvc:navigation';  // Navigation only
localStorage.debug = 'pvc:tiles';       // Tile loading
// Then reload the page
```

---

## Minecraft Domain Invariants

### Nether Coordinate System (8:1 ratio)

```typescript
// This ratio is HARDCODED in Minecraft - will never change
type WorldType = 'overworld' | 'the_nether' | 'the_end';

function toOverworldEquivalent(x: number, z: number, world: WorldType): [number, number] {
    if (world === 'the_nether') {
        return [x * 8, z * 8];
    }
    return [x, z]; // overworld and the_end are 1:1
}

// Always normalize BEFORE calculating distances
function calculateRouteDistance(
    x1: number, z1: number, world1: WorldType,
    x2: number, z2: number, world2: WorldType
): number {
    const [ox1, oz1] = toOverworldEquivalent(x1, z1, world1);
    const [ox2, oz2] = toOverworldEquivalent(x2, z2, world2);
    return Math.hypot(ox1 - ox2, oz1 - oz2);
}
```

### Price Aggregation

- Use **median** not mean (robust against outliers)
- Shops within **16 blocks** count as 1 source (prevent manipulation)
- Core blocks need **≥3 independent shops** to trust market price

---

## Testing Patterns

### Unit Tests (Vitest) - src/*.test.ts

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

---

## BDD Testing (Playwright-BDD)

This project uses [playwright-bdd](https://github.com/vitalets/playwright-bdd) - Gherkin feature files executed by Playwright.

### File Structure

```
features/
├── cart-management.feature      # Regular scenario tests
├── cart-quantity-properties.feature  # Property-based tests
├── steps/
│   ├── fixtures.ts              # IMPORT STEPS FROM HERE
│   ├── cart.steps.ts            # Cart step definitions
│   ├── cart-property.steps.ts   # Property test steps
│   └── live-navigation.steps.ts
└── support/
```

### Feature File Template

```gherkin
Feature: Cart Management
  As a player planning a shopping trip
  I want to manage my shopping cart
  So that I can see what I need to bring and what I'll receive

  Background:
    Given the app is loaded with mock shop data

  @cart @totals
  Scenario: Show aggregated costs in cart
    Given I add a trade to the cart
    When I open the cart dialog
    Then I should see total costs showing "Diamond"

  @cart @quantity
  Scenario: Quantity affects totals
    Given I add a trade to the cart
    When I increase the quantity to 3
    And I open the cart dialog
    Then I should see total costs showing "3× Diamond"
```

### Tag Conventions

| Tag | Purpose |
|-----|---------|
| `@cart` | Cart-related scenarios |
| `@navigation` | Live navigation tests |
| `@property` | Property-based/generative tests |
| `@tiles` | Tile loading tests |
| `@dialog` | Dialog behavior tests |
| `@zoom` | Zoom/map behavior tests |
| `@route` | Route display/optimization |
| `@shop-map` | Shop map player markers |

Run specific tags: `npx bddgen && npx playwright test --grep @cart`

### Step Definitions

```typescript
// features/steps/cart.steps.ts
// ⚠️ ALWAYS import Given, When, Then from './fixtures' - NOT from playwright-bdd
import { Given, When, Then } from './fixtures';

Given('the app is loaded with mock shop data', async ({ page }) => {
    // Mock the data endpoint BEFORE navigating
    await page.route('**/data.json', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockShopData)
        });
    });
    await page.goto('/');
    await page.waitForSelector('.trade-row');
});

Given('I add a trade to the cart', async ({ page }) => {
    await page.locator('.add-to-cart-btn').first().click();
});

When('I open the cart dialog', async ({ page }) => {
    await page.locator('#cart-button').click();
    await page.waitForSelector('.cart-dialog');
});

Then('I should see total costs showing {string}', async ({ page }, text: string) => {
    await expect(page.locator('.cart-totals')).toContainText(text);
});
```

### Fixtures (features/steps/fixtures.ts)

Custom fixtures disable animations and patch Leaflet:

```typescript
export const test = base.extend<BddFixtures>({
    page: async ({ page }, use) => {
        await page.addInitScript(() => {
            // Disable JS animations (ADR-003)
            (globalThis as any).__animationsDisabled = true;
            document.documentElement.dataset.animationsDisabled = 'true';
            
            // ⚠️ CRITICAL: Patch Leaflet flyTo to use setView
            // flyTo with duration 0 is buggy; setView is reliable
            const patchLeafletFlyTo = () => {
                const L = (globalThis as any).L;
                if (!L?.Map?.prototype?.flyTo) return;
                L.Map.prototype.flyTo = function(latlng: any, zoom?: number) {
                    return this.setView(latlng, zoom, { animate: false });
                };
            };
            if ((globalThis as any).L) patchLeafletFlyTo();
            else Object.defineProperty(globalThis, 'L', {
                configurable: true,
                set(v) { Object.defineProperty(globalThis, 'L', { value: v }); setTimeout(patchLeafletFlyTo, 0); }
            });
        });
        await use(page);
    },
    playerMock: async ({}, use) => await use(createPlayerMock('World')),
    multiPlayerMock: async ({}, use) => await use(createMultiPlayerMock()),
});

export const { Given, When, Then } = createBdd(test);
```

### Using Fixtures in Steps

```typescript
// Navigation steps using playerMock fixture
import { Given, When, Then } from './fixtures';

Given('player is at position {int}, {int}', async ({ page, playerMock }, x: number, z: number) => {
    playerMock.setPosition(x, z);
    await page.route('**/up/world/*/players.json', route => 
        route.fulfill({ body: JSON.stringify(playerMock.getPlayers()) })
    );
});

When('player moves to {int}, {int}', async ({ playerMock }, x: number, z: number) => {
    playerMock.setPosition(x, z);
    // Next poll will pick up new position
});
```

### Mocking Patterns

```typescript
// Mock API responses BEFORE page.goto()
await page.route('**/data.json', route => route.fulfill({
    body: JSON.stringify({ shops: mockShops })
}));

// Mock tile images with colored PNGs
await page.route('**/tiles/**/*.png', route => route.fulfill({
    body: createColoredPng(100, 150, 200),
    contentType: 'image/png'
}));

// Block external requests
await page.route('https://external-api.com/**', route => route.abort());
```

### Property-Based Tests

Files ending in `-properties.feature` use generative testing:

```gherkin
# cart-quantity-properties.feature
@cart @property
Feature: Cart Quantity Properties

  Scenario Outline: Quantity changes are always positive
    Given I add a trade to the cart
    When I set quantity to <value>
    Then the displayed quantity should be at least 1

    Examples:
      | value |
      | 0     |
      | -5    |
      | 1     |
      | 999   |
```

### Test Placement Decision

| What to test | Test type | Location |
|--------------|-----------|----------|
| Pure calculation | Unit | `src/*.test.ts` |
| DOM interaction | BDD | `features/*.feature` |
| Timing-sensitive | Mock time | Never real-wait in tests |

### Running BDD Tests

```bash
# Generate and run all
npm run test:e2e

# Run specific tag
npx bddgen && npx playwright test --grep @cart

# Debug mode
npx playwright test --grep @cart --debug

# Generate HTML report
npx playwright show-report
```

---

## Performance Thresholds

| Threshold | Value | Source | Action |
|-----------|-------|--------|--------|
| Virtual scroll | >100 items | ADR-007 | Apply `<virtual-scroller>` |
| Search debounce | `requestAnimationFrame` | main.ts | Frame-based (not fixed ms) |
| Player polling | **1000ms** | config.json | Dynmap API refresh rate |
| Auto-advance | **8 blocks** | constants.ts | Mark shop complete when player arrives |
| Nearby tooltip | 100 blocks | constants.ts | Show shop tooltip when close |
| Shop clustering | 16 blocks | config.json | Independent shops for price aggregation |

---

## ADR Quick Reference

| ADR | Key Decision |
|-----|--------------|
| 001 | Median for price aggregation, 16-block shop clustering |
| 002 | playwright-bdd over Cucumber + Playwright |
| 003 | Test animations disabled via fixture, not production code |
| 004 | Nearest-neighbor + 2-opt for routing (O(n²), good for <50 shops) |
| 005 | Class-based stores over Redux/Zustand (zero deps) |
| 006 | Zod `.safeParse()` pattern (never `.parse()`) |
| 007 | Virtual scroll at 100+ items |
| 008 | Normalize nether coords to overworld for distance |
| 009 | Tile caching with blob URLs (no service worker) |

---

## Tile System (Dynmap Integration)

### Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BUILD TIME                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  Dynmap Server                                                           │
│       │                                                                  │
│       └── scripts/fetch-tiles.ts (Playwright + stealth)                  │
│                │                                                         │
│                ├── Reads shop locations from data.json                   │
│                ├── Calculates tiles needed (5×5 grid around each shop)   │
│                ├── Fetches zoom 4 AND zoom 8 tiles                       │
│                └── Saves to public/tiles/{world}/{z}/{x}/{y}.png         │
│                                                                          │
│  Output: public/tiles/manifest.json (list of available tiles)            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           RUNTIME                                        │
├─────────────────────────────────────────────────────────────────────────┤
│  Browser loads manifest.json                                             │
│       │                                                                  │
│       └── TileLoader (src/map/tile-loader.ts)                            │
│                │                                                         │
│                ├── Checks manifest before fetching (avoid 404s)          │
│                ├── Fetches tile PNG → creates Blob URL                   │
│                ├── Caches blob URL in memory (tileBlobCache)             │
│                └── Adds L.ImageOverlay to Leaflet map                    │
│                                                                          │
│  Display: L.CRS.Simple coordinate system                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Zoom Levels & Pyramid Structure

```
Zoom   Blocks/Tile   1 tile covers        Use case
────   ───────────   ───────────────      ──────────────────────
  8        512       512×512 blocks       Shop detail view (1px = 1 block)
  7       1024       1024×1024 blocks     
  6       2048       2048×2048 blocks     
  5       4096       4096×4096 blocks     
  4       8192       8192×8192 blocks     Navigation map (overview)
  3      16384       16384×16384 blocks   
  ...
```

**Formula**: `blocksPerTile = tileSize × 2^(maxZoom - zoom)`
- At zoom 8: `512 × 2^(8-8) = 512 blocks/tile`
- At zoom 4: `512 × 2^(8-4) = 8192 blocks/tile`

### Tile Coordinate Calculation

```typescript
// From scripts/tile-utils.ts - convert Minecraft to tile coords
const blocksPerTile = tileSize * Math.pow(2, maxZoom - zoom);
const tileX = Math.floor(x / blocksPerTile);
const tileZ = Math.floor(z / blocksPerTile);

// Example: Shop at (1500, 2400)
// Zoom 8: tile (2, 4) covers blocks (1024-1535, 2048-2559)
// Zoom 4: tile (0, 0) covers blocks (0-8191, 0-8191)
```

### Minecraft to Leaflet Coordinates

Leaflet uses `CRS.Simple` with **inverted Z axis**:

```typescript
// lat = -z (inverted for screen), lng = x
const leafletCoords = { lat: -offsetZ, lng: offsetX };
```

### File Structure

```
public/tiles/
├── manifest.json           # List of available tiles
├── overworld/
│   ├── 4/                  # Zoom 4 (overview)
│   │   ├── 0/
│   │   │   ├── 0.png
│   │   │   └── 1.png
│   │   └── 1/
│   └── 8/                  # Zoom 8 (detail)
│       ├── -3/
│       └── 2/
├── the_nether/
│   ├── 4/
│   └── 8/
└── the_end/
```

### Manifest Format

```json
[
    { "world": "overworld", "tileX": 0, "tileZ": 0, "blocksPerTile": 8192 },
    { "world": "overworld", "tileX": 2, "tileZ": 4, "blocksPerTile": 512 },
    { "world": "the_nether", "tileX": 0, "tileZ": 0, "blocksPerTile": 8192 }
]
```

### TileLoader API (src/map/tile-loader.ts)

```typescript
import { loadTileManifest, tileExistsInManifest, loadTileToMap } from './map/tile-loader.js';

const manifest = await loadTileManifest();  // Load once at startup
tileExistsInManifest(manifest, 'overworld', blocksPerTile, tx, tz);  // Check before fetch
loadTileToMap({ map, worldId, zoom, tx, tz, bounds, addedToMap });   // Handles blob caching
```

### Fetch Workflow

```bash
npx tsx scripts/fetch-tiles.ts
# Playwright + stealth → Dynmap → public/tiles/{world}/{z}/{x}/{y}.png
# Rate-limited: 500ms/tile, 2s between 10-tile batches
```

### World ID Mapping

| World Name (data.json) | Dynmap API ID | Local Tile Directory |
|------------------------|---------------|---------------------|
| `world`, `World` | `minecraft_overworld` | `overworld/` |
| `world_nether` | `minecraft_the_nether` | `the_nether/` |
| `world_the_end` | `minecraft_the_end` | `the_end/` |

**Note**: `getWorldId()` in library.ts converts between formats.

### Key Constants (tile-loader.ts)

```typescript
export const TILE_CONFIG = {
    tileSize: 512,      // Pixels per tile (= blocks at maxZoom)
    baseUrl: 'tiles',   // Relative to site root
    maxZoom: 8,         // 1 pixel = 1 block
    fallbackZoom: 4,    // Overview tiles
    minZoom: 1,
    playersUrl: 'players.json'
};

export const ZOOM4_TILE_SIZE = 512 * 16;  // 8192 blocks
```

---

## Common Mistakes to Avoid

```typescript
// ❌ Don't use .parse() - throws exceptions
const data = Schema.parse(response);

// ❌ Don't put pure logic in main.ts
// main.ts: function calculateDistance(...) { }

// ❌ Don't use forEach
items.forEach(item => process(item));

// ❌ Don't use null
return null;

// ❌ Don't forget nether conversion
const dist = Math.hypot(x1 - x2, z1 - z2); // WRONG for cross-world

// ❌ Don't add test-only code to production
if (isTest) { skipAnimation(); }
```

```typescript
// ✅ Do use safeParse with fallback
const result = Schema.safeParse(response);
return result.success ? result.data : DEFAULT;

// ✅ Do put pure logic in library.ts

// ✅ Do use for...of
for (const item of items) { process(item); }

// ✅ Do use undefined
return undefined;

// ✅ Do normalize coordinates first
const dist = calculateRouteDistance(x1, z1, world1, x2, z2, world2);

// ✅ Do use test fixtures for animation disabling (fixtures.ts)
```

---

## Domain Terms

- **Trade**: Shop offer (give items → receive items)
- **Deviation**: How much a trade differs from median market price
- **Core Blocks**: Emerald, Diamond, Gold, Iron, Netherite blocks
- **Independent Shops**: Shops >16 blocks apart (for fair price aggregation)
- **Route**: Optimized visiting order using nearest-neighbor + 2-opt
