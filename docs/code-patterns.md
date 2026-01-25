# Code Patterns Reference

This document describes the established patterns used in pvc-trades. Follow these patterns when adding new features.

## State Management Pattern

### Class-Based Stores (Preferred for Complex State)

Use class-based stores for shared state that needs encapsulation:

```typescript
// Example: Cart store pattern
class CartStore {
    private items: CartItem[] = [];
    private readonly storageKey = 'pvc-trades-cart';
    
    constructor() {
        this.load();
    }
    
    private load(): void {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.items = JSON.parse(stored);
            }
        } catch {
            this.items = [];
        }
    }
    
    private save(): void {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.items));
        } catch {
            // Storage full or unavailable - silent fail
        }
    }
    
    add(item: CartItem): void {
        const existing = this.items.find(i => getTradeKey(i.trade) === getTradeKey(item.trade));
        if (existing) {
            existing.quantity++;
        } else {
            this.items.push(item);
        }
        this.save();
    }
    
    remove(key: string): void {
        this.items = this.items.filter(i => getTradeKey(i.trade) !== key);
        this.save();
    }
    
    get(): CartItem[] {
        return [...this.items]; // Return copy to prevent external mutation
    }
    
    clear(): void {
        this.items = [];
        this.save();
    }
}

export const cartStore = new CartStore();
```

### Module-Level State (For Simple State)

For simple state that doesn't need methods, use module-level variables:

```typescript
// In main.ts - simple state
let cachedRegex: RegExp | undefined;
let cachedPattern = '';
let searchDebounceTimer: number | undefined;
```

### State Persistence Pattern

Always wrap localStorage operations in try/catch:

```typescript
function loadState<T>(key: string, fallback: T): T {
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            return JSON.parse(stored) as T;
        }
    } catch {
        // Corrupted data - use fallback
    }
    return fallback;
}

function saveState<T>(key: string, value: T): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage full or unavailable - silent fail
    }
}
```

## Event Handler Pattern

### Separation of Concerns

Separate event wiring from business logic:

```typescript
// ✅ Good: Clear separation
button.addEventListener('click', handleAddToCart);

function handleAddToCart(event: MouseEvent): void {
    const item = getItemFromEvent(event);
    cartStore.add(item);
    renderCart();
    updateBadge();
}

// ❌ Bad: Mixed concerns
button.addEventListener('click', async (e) => {
    const data = await fetch(...);
    processData(data);
    document.querySelector('.result').innerHTML = ...;
});
```

### Event Delegation Pattern

Use event delegation for dynamic content:

```typescript
// ✅ Good: Single listener for all trade rows
getElement('results').addEventListener('click', (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.trade-row');
    if (row) {
        const x = Number.parseInt(row.dataset['x'] ?? '0', 10);
        const y = Number.parseInt(row.dataset['y'] ?? '0', 10);
        const z = Number.parseInt(row.dataset['z'] ?? '0', 10);
        const world = row.dataset['world'] ?? 'overworld';
        openMapDialog(x, y, z, world);
    }
});

// ❌ Bad: Listener per row (memory leak with virtual scrolling)
rows.forEach(row => {
    row.addEventListener('click', () => openMapDialog(...));
});
```

### Debounce Pattern

For search and other frequent events:

```typescript
let searchDebounceTimer: number | undefined;

function debouncedSearch(): void {
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = window.setTimeout(() => {
        performSearch();
    }, 150);
}
```

## DOM Helper Pattern

### Type-Safe Element Access

```typescript
function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Element with id "${id}" not found`);
    }
    return element as T;
}

// Usage
const input = getElement<HTMLInputElement>('searchWant');
const dialog = getElement<HTMLDialogElement>('cart-dialog');
```

### Dialog Pattern

```typescript
function setupDialogBackdropClose(dialog: HTMLDialogElement): void {
    let mouseDownOutside = false;
    
    const isOutsideDialog = (event: MouseEvent): boolean => {
        const rect = dialog.getBoundingClientRect();
        return (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
        );
    };
    
    dialog.addEventListener('mousedown', event => {
        mouseDownOutside = isOutsideDialog(event);
    });
    
    dialog.addEventListener('click', event => {
        if (mouseDownOutside && isOutsideDialog(event)) {
            dialog.close();
        }
        mouseDownOutside = false;
    });
}

function openDialog(dialogId: string, prepare?: () => void): void {
    const dialog = document.querySelector(`#${dialogId}`) as HTMLDialogElement | null;
    if (!dialog) { return; }
    
    if (prepare) { prepare(); }
    dialog.showModal();
}
```

## Rendering Pattern

### Virtual Scroller Integration

For large lists (100+ items), use virtual scrolling:

```typescript
import VirtualScroller from 'virtual-scroller/dom';

let virtualScroller: VirtualScroller<FilterResult> | undefined;

function renderResults(results: FilterResult[]): void {
    const container = getElement('results');
    
    if (results.length === 0) {
        if (virtualScroller) {
            virtualScroller.stop();
            virtualScroller = undefined;
        }
        container.innerHTML = '<div class="no-results">No trades found</div>';
        return;
    }
    
    if (virtualScroller) {
        virtualScroller.setItems(results);
    } else {
        virtualScroller = new VirtualScroller(
            container,
            results,
            createRowElement,  // Row factory function
            {
                getEstimatedItemHeight: () => 32,
                getItemId: (item) => getUniqueId(item)
            }
        );
    }
}

// Row factory - creates DOM element for single item
function createRowElement(result: FilterResult): HTMLElement {
    const row = document.createElement('div');
    row.className = 'trade-row';
    row.innerHTML = `...`;
    return row;
}
```

### HTML Escaping

Always escape user/external data:

```typescript
import { escapeHtml } from './library.js';

// ✅ Good: Escaped
row.innerHTML = `<span>${escapeHtml(trade.resultName)}</span>`;

// ❌ Bad: XSS vulnerability
row.innerHTML = `<span>${trade.resultName}</span>`;
```

## BDD Testing Pattern

### Feature File Structure

```gherkin
@tag1 @tag2
Feature: Feature Name
  Brief description of the feature
  
  Background:
    Given common setup steps
  
  @specific-tag
  Scenario: Scenario name
    Given initial state
    When action is performed
    Then expected result
    And additional assertion
```

### Step Definition Pattern

```typescript
// features/steps/feature-name.steps.ts
import { Given, When, Then, DataTable } from './fixtures';

Given('the app is loaded with mock shop data', async ({ page }) => {
    await page.route('**/data.json', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockData)
        });
    });
    await page.goto('/');
    await page.waitForSelector('.trade-row');
});

When('I search for {string}', async ({ page }, searchTerm: string) => {
    await page.fill('#searchWant', searchTerm);
    await page.waitForTimeout(200); // Debounce
});

Then('I should see {int} results', async ({ page }, count: number) => {
    await expect(page.locator('.trade-row')).toHaveCount(count);
});
```

### Fixture Pattern

```typescript
// features/steps/fixtures.ts
import { test as base, createBdd } from 'playwright-bdd';

export const test = base.extend<{
    mockData: ShopData;
}>({
    mockData: async ({}, use) => {
        await use(createMockShopData());
    }
});

export const { Given, When, Then } = createBdd(test);
```

## Pure Function Pattern

### Location: `src/library.ts`

Keep pure functions (no side effects, no DOM access) in library.ts:

```typescript
/**
 * Calculate Manhattan-style distance accounting for Nether portal shortcuts.
 * @param x1 - Start X coordinate
 * @param z1 - Start Z coordinate
 * @param world1 - Start world ('overworld', 'the_nether', etc.)
 * @param x2 - End X coordinate
 * @param z2 - End Z coordinate
 * @param world2 - End world
 * @returns Distance in overworld blocks
 */
export function calculateRouteDistance(
    x1: number,
    z1: number,
    world1: string,
    x2: number,
    z2: number,
    world2: string
): number {
    // Convert nether coords to overworld equivalent (8:1 ratio)
    const ow1x = isNether(world1) ? x1 * 8 : x1;
    const ow1z = isNether(world1) ? z1 * 8 : z1;
    const ow2x = isNether(world2) ? x2 * 8 : x2;
    const ow2z = isNether(world2) ? z2 * 8 : z2;
    
    return Math.hypot(ow2x - ow1x, ow2z - ow1z);
}
```

### Function Signature Guidelines

- Max 5 parameters; use options object for more
- Use JSDoc for all exported functions
- Return early over nested conditionals
- Prefer `undefined` over `null`

## Zod Validation Pattern

### External Data Validation

```typescript
// types.ts
import { z } from 'zod';

export const TradeSchema = z.object({
    resultName: z.string(),
    resultAmount: z.number().int().positive(),
    item1: ItemSchema,
    item2: ItemSchema.optional(),
    x: z.number().int(),
    y: z.number().int(),
    z: z.number().int(),
    world: z.string().default('overworld')
});

export type Trade = z.infer<typeof TradeSchema>;

// library.ts
export async function loadTrades(): Promise<Trade[]> {
    const response = await fetch('/data.json');
    const data: unknown = await response.json();
    
    const result = z.array(TradeSchema).safeParse(data);
    if (!result.success) {
        console.error('Invalid trade data:', result.error);
        return [];
    }
    
    return result.data;
}
```

## Error Handling Pattern

### Graceful Degradation

```typescript
// ✅ Good: Graceful fallback
function loadConfig(): AppConfig {
    try {
        const stored = localStorage.getItem('config');
        if (stored) {
            const parsed = AppConfigSchema.safeParse(JSON.parse(stored));
            if (parsed.success) {
                return parsed.data;
            }
        }
    } catch {
        console.warn('Failed to load config, using defaults');
    }
    return DEFAULT_CONFIG;
}

// ❌ Bad: Throws to user
function loadConfig(): AppConfig {
    const stored = localStorage.getItem('config')!;
    return JSON.parse(stored);
}
```

### Debug Logging

```typescript
// debug.ts
import debug from 'debug';

export const debugNavigation = debug('pvc:navigation');
export const debugMap = debug('pvc:map');
export const debugTiles = debug('pvc:tiles');

// Usage
debugNavigation('Starting route calculation items=%d', cart.length);
debugMap('Centering on x=%d z=%d zoom=%d', x, z, zoom);
```

## Map/Leaflet Pattern

### Tile Layer Creation

```typescript
const tileLayer = L.tileLayer('tiles/{world}/{z}/{x}/{y}.png', {
    minZoom: 1,
    maxZoom: 8,
    noWrap: true,
    bounds: worldBounds,
    errorTileUrl: 'tiles/missing.png'
});
```

### Marker Management

```typescript
// Use layer groups for easy cleanup
const markerGroup = L.layerGroup();
map.addLayer(markerGroup);

// Add markers
for (const shop of shops) {
    const marker = L.marker(toLeafletCoords(shop.x, shop.z));
    marker.bindPopup(createShopPopup(shop));
    markerGroup.addLayer(marker);
}

// Clear all markers
markerGroup.clearLayers();
```
