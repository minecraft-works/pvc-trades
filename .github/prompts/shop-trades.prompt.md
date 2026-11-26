# Shop Trades Development Skill

Minecraft Shop Trade Viewer with exchange rate matrix, deviation tracking, daily deals dashboard, and live Squaremap integration.

---

## Browser Interaction (Chrome DevTools MCP)

AI agents can interact with the running app via Chrome DevTools tools:

### Starting the Dev Server

```bash
npm run dev   # Starts Vite at http://localhost:5173
```

### Available Browser Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `mcp_chrome-devtoo_navigate_page` | Open URL | Navigate to `http://localhost:5173` |
| `mcp_chrome-devtoo_click` | Click element | Click `.add-to-cart-btn` |
| `mcp_chrome-devtoo_fill` | Type in input | Fill `#player-name-input` |
| `mcp_chrome-devtoo_take_screenshot` | Capture state | Debug visual issues |
| `mcp_chrome-devtoo_take_snapshot` | Get DOM/accessibility tree | Inspect structure |
| `mcp_chrome-devtoo_evaluate_script` | Run JS in page | Check `cartStore.getAll()` |
| `mcp_chrome-devtoo_get_console_message` | Read console | Check for errors |
| `mcp_chrome-devtoo_list_network_requests` | See API calls | Debug fetch issues |

### Common Debugging Workflow

```
1. Navigate to http://localhost:5173
2. Take snapshot to see current state
3. Click elements / fill inputs to reproduce issue
4. Evaluate script to inspect stores:
   - window.cartStore.getAll()
   - window.navigationStore.getState()
5. Check console for errors
6. Take screenshot to verify fix
```

### Key DOM Selectors

From `constants.ts`:

```typescript
SELECTORS.MAP_DIALOG         // '#map-dialog'
SELECTORS.NAV_DIALOG         // '#nav-dialog'
SELECTORS.PLAYER_NAME_INPUT  // '#player-name-input'
SELECTORS.CLOSE_MATRIX       // '#close-matrix'
SELECTORS.RECENTER_MAP       // '#recenter-map'

// Common elements
'#cart-button'               // Open cart dialog
'#open-dashboard'            // Toggle daily deals dashboard
'#deals-dashboard'           // Dashboard banner container
'#mark-as-seen'              // Save snapshot + dismiss dashboard
'.trade-row'                 // Trade list items
'.add-to-cart-btn'           // Add to cart buttons
'.cart-dialog'               // Cart dialog container
```

### Enabling Debug Logs

Before debugging, enable verbose logging:

```javascript
// In evaluate_script or browser console
localStorage.debug = 'app:*';
location.reload();
```

Then check console messages for `app:navigation`, `app:tiles`, etc.

### Using Local Data (Offline/Development)

To avoid network issues or test with static data, configure `config.json` to use local data:

```json
{
  "dataUrl": "./data.json",   // Local file instead of remote API
  "dataRefreshMs": 60000,
  ...
}
```

The remote API (`dataUrl` in `config.json`) may be blocked by corporate networks. Switch to local `data.json` for development.

---

## Git Workflow

### Commit Message Format (Conventional Commits)

```
<type>: <subject>
```

**Types:**
- `feat:` - New feature (triggers minor version bump)
- `fix:` - Bug fix (triggers patch version bump)
- `docs:` - Documentation only
- `test:` - Adding or updating tests
- `refactor:` - Code refactoring (no behavior change)
- `chore:` - Maintenance, dependencies
- `ci:` - CI/CD changes

**Examples:**
```bash
git commit -m "feat: add route optimization toggle"
git commit -m "fix: correct nether coordinate scaling"
git commit -m "docs: update skill with DevTools section"
git commit -m "test: add cart quantity BDD scenarios"
```

**Breaking Changes:** Add `!` after type:
```bash
git commit -m "feat!: change API endpoint structure"
```

### Pre-commit Hooks (MANDATORY)

**NEVER bypass pre-commit or pre-push hooks.** Do not use:
- ❌ `--no-verify`
- ❌ `-n`
- ❌ `HUSKY=0`

The hooks run essential quality checks:
1. **lint-staged** - Lints staged files
2. **typecheck** - TypeScript compilation
3. **knip** - Unused export detection
4. **test:coverage** - Unit tests with coverage
5. **docs** - TypeDoc generation

If hooks fail, **fix the underlying issue** rather than bypassing.

### Standard Workflow

```bash
# Stage changes
git add <files>

# Commit (hooks will run automatically)
git commit -m "type: description"

# Push (pre-push hooks will run)
git push
```

### If Hooks Fail

1. Read the error output carefully
2. Fix the issue (lint error, type error, failing test)
3. Stage the fix: `git add .`
4. Retry the commit

Common fixes:
- **Lint errors**: `npm run lint:fix`
- **Type errors**: Check TypeScript issues in VS Code
- **Test failures**: Run `npm test` to debug
- **Unused exports**: Remove or add to `knip.json` if intentional

---

## Where to Put Code

```
src/
├── main.ts          # DOM, events, rendering - NO pure logic here
├── library.ts       # Pure functions (computeDashboardData, route calc, etc.)
├── types.ts         # Zod schemas + TypeScript types (z.infer<>)
├── constants.ts     # Magic numbers, thresholds, CSS selectors
├── debug.ts         # Debug utilities (import debug from 'debug')
├── stores/          # Stateful stores with localStorage persistence
│   ├── cart-store.ts
│   ├── navigation-store.ts
│   ├── favorites-store.ts
│   ├── snapshot-store.ts   # Trade snapshot for daily deals dashboard
│   ├── player-interpolator.ts
│   └── index.ts     # Barrel exports
├── search/          # Search & deviation calculation
│   └── deviation.ts
├── navigation/      # Shop tooltip & navigation helpers
│   └── shop-tooltip.ts
├── favorites/       # Favorites UI rendering
│   └── favorites-ui.ts
├── map/             # Leaflet map tile loading
│   ├── tile-loader.ts
│   ├── tile-types.ts
│   └── index.ts
├── dialogs/         # Modal dialog modules
│   ├── matrix-dialog.ts
│   ├── trade-details.ts
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
STORAGE_KEYS.CART             // 'shop-trades-cart'
STORAGE_KEYS.SNAPSHOT         // 'shop-trades-snapshot'
STORAGE_KEYS.NAV_PROGRESS     // 'shop-trades-nav-progress'

// Dashboard thresholds
DASHBOARD.PRICE_DROP_THRESHOLD // 5 percentage points

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
localStorage.debug = 'app:*';           // All logs
localStorage.debug = 'app:navigation';  // Navigation only
localStorage.debug = 'app:tiles';       // Tile loading
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
├── cart-management.feature              # Regular scenario tests
├── cart-quantity-properties.feature      # Property-based tests
├── daily-deals-dashboard.feature        # Dashboard scenarios (18 scenarios)
├── daily-deals-dashboard-properties.feature  # Dashboard edge cases (6 scenarios)
├── steps/
│   ├── fixtures.ts              # IMPORT STEPS FROM HERE
│   ├── cart.steps.ts            # Cart step definitions
│   ├── cart-property.steps.ts   # Property test steps
│   ├── dashboard.steps.ts       # Dashboard steps (self-contained mock data)
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
| `@dashboard` | Daily deals dashboard |
| `@toggle` | Dashboard toggle button |
| `@mark-seen` | Explicit snapshot save |
| `@dismiss` | Dashboard dismiss behavior |

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
| Player polling | **1000ms** | config.json | Player list refresh rate |
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
| 009 | Tiles loaded directly from the map server (no referrer, `<img>` only) |

---

## Daily Deals Dashboard

Compares current trade state against a saved snapshot to show what changed since the user's last visit.

### Architecture

```
Page Load → snapshotStore.load() → computeDashboardData() → renderDashboard()
                  ↓                         ↓
          Previous snapshot         Current trades + deviations
          (localStorage)            compared to find:
                                    - New trade keys
                                    - Price drops (≥5pp improvement)
                                    - Watchlist hits (favorited items with deals)
```

### Snapshot Lifecycle

| Event | Action | Effect |
|-------|--------|--------|
| First visit (no snapshot) | Auto-save silently | Baseline established, no dashboard shown |
| Return visit | Compare current vs stored | Dashboard banner appears if changes found |
| Dismiss (✕) | Hide dashboard | Toggle button (📊) remains visible to re-show |
| Toggle (📊) | Show/hide dashboard | No snapshot update |
| Mark as seen (✓) | Save new snapshot | Dashboard hidden, toggle hidden, baseline updated |
| Page reload | Re-compare against last "Mark as seen" | Dashboard reappears if still different |

**Key design**: Snapshots are **never auto-saved** on page load. The baseline only updates when the user explicitly clicks "Mark as seen". This lets users revisit changes across multiple sessions.

### Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `computeDashboardData()` | `library.ts` | Pure: compares trades against snapshot |
| `showDashboard()` | `main.ts` | Orchestrates load → compute → render |
| `renderDashboard()` | `main.ts` | DOM: builds dashboard HTML |
| `toggleDashboard()` | `main.ts` | DOM: shows/hides the banner |
| `markDashboardAsSeen()` | `main.ts` | Saves snapshot + dismisses + hides toggle |
| `snapshotStore.save()` | `stores/snapshot-store.ts` | Persists trade state to localStorage |
| `snapshotStore.load()` | `stores/snapshot-store.ts` | Loads previous snapshot |

### Types (types.ts)

```typescript
TradeSnapshot          // { timestamp, trades: Record<key, TradeSnapshotEntry> }
TradeSnapshotEntry     // { deviationPercent?, stock }
DashboardData          // { newTradeKeys, priceDrops, watchlistHits, lastVisit }
PriceDrop              // { tradeKey, itemName, oldDeviation, newDeviation }
WatchlistHit           // { itemName, currentDeviation, previousDeviation }
```

### Testing Dashboard BDD Steps

Dashboard steps use **self-contained mock data** with 5 shops providing enough independent sources for trusted deviation calculation (`minIndependentShops: 3`):

```typescript
// features/steps/dashboard.steps.ts
Given('the app is loaded with dashboard test data', async ({ page }) => {
    // Intercepts config.json + data.json with calibrated mock data
    // 4 Diamond shops at prices [1, 1.5, 2, 4] → median = 1.75
    // Deviations: -43%, -14%, +14%, +129%
    await setupDashboardMock(page);
    // Injects previous snapshot via localStorage with different deviations
    // so dashboard detects price drops between sessions
});
```

---

## Tile System (Squaremap Integration)

### Overview

The browser loads tiles directly from the map server.

```
{squaremap.baseUrl}/tiles/minecraft_{world}/{zoom}/{tileX}_{tileZ}.png

Browser ── <img> via L.imageOverlay ──► Squaremap server
   │            (no Referer: <meta name="referrer" content="no-referrer">)
   └── JSON (players, shops) ──► Cloudflare Workers (add CORS) ──► origin servers
```

- `src/map/tile-layout.ts` maps app pyramid levels (0 = overview … 4 = detail) to server zooms 4–8 and builds URLs.
- `src/map/tile-loader.ts` adds each tile to a Leaflet map once; unrendered tiles (HTTP 200, empty body) fail to decode and their overlay is removed on `error`.
- The server returns 403 for tile requests with a foreign `Referer` and sends no CORS headers, so tiles can only be used as plain images.
- See ADR-009 and ADR-010.

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
// From src/tile-coords.ts - convert Minecraft to tile coords
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

### TileLoader API (src/map/tile-loader.ts)

```typescript
import { addTileOverlay, getTileUrl, loadTileToMap } from './map/tile-loader.js';

getTileUrl('overworld', level, tx, tz);                              // Absolute tile URL
loadTileToMap({ map, worldId, zoom, tx, tz, bounds, addedToMap });   // Once per map, drops missing tiles
```

### World ID Mapping

| World Name (data.json) | Tile URL world segment |
|------------------------|------------------------|
| `world`, `World` | `minecraft_overworld` |
| `world_nether` | `minecraft_the_nether` |
| `world_the_end` | `minecraft_the_end` |

**Note**: `getWorldId()` in library.ts returns the normalized name (`overworld`, `the_nether`, `the_end`); `tile-layout.ts` adds the `minecraft_` prefix.

### Key Constants (tile-loader.ts)

```typescript
export const TILE_CONFIG = {
    tileSize: 512,              // Blocks per detail tile (1 px = 1 block)
    maxZoom: 4,                 // Detail pyramid level (server zoom 8)
    fallbackZoom: 0,            // Overview pyramid level (server zoom 4)
    overviewTileBlocks: 8192,
    detailToOverviewRatio: 16
};
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
- **Snapshot**: Saved trade state (deviations + stock) for session-to-session comparison
- **Dashboard**: Banner showing price drops, new trades, and watchlist hits since last visit
- **Mark as seen**: Explicit user action to update the comparison baseline (no auto-save)
- **Watchlist Hit**: A favorited item whose deviation improved since last snapshot
