# Test Scenarios for PVC Trades

This document outlines all scenarios that should be tested, categorized by test type.

## Quick Reference

For implementation guidance, see:
- [docs/testing-guide.md](docs/testing-guide.md) - How to write tests
- [docs/code-patterns.md](docs/code-patterns.md) - Code patterns to follow
- [features/steps/fixtures.ts](features/steps/fixtures.ts) - Shared test fixtures

## Legend

| Test Type | Description | Location |
|-----------|-------------|----------|
| **Cucumber** | Browser integration tests - requires real browser, network mocking, timing | `features/*.feature` |
| **Unit** | Pure function tests - input/output, no browser needed | `src/*.test.ts` |
| **E2E** | Already covered in Playwright E2E tests | `tests/*.spec.ts` |

---

## 1. Search & Filtering

### 1.1 Basic Search
| Scenario | Type | Status |
|----------|------|--------|
| Filter trades by "want" item name | Unit | ✅ `filterTrade` tested |
| Filter trades by "give" item name | Unit | ✅ `filterTrade` tested |
| Combined want + give filter | Unit | ✅ `filterTrade` tested |
| Flexible matching (underscore, space, no-space) | Unit | ✅ `matchesQuery` tested |
| Wildcard matching | Unit | ✅ `getRegex` tested |

### 1.2 Search UI
| Scenario | Type | Status |
|----------|------|--------|
| Search input triggers results update | Cucumber | ❌ Not covered |
| Debounced search (performance) | Cucumber | ❌ Not covered |
| No results message displays | Cucumber | ❌ Not covered |
| Search highlighting in results | Cucumber | ❌ Not covered |

### 1.3 Sorting
| Scenario | Type | Status |
|----------|------|--------|
| Sort by result amount | Unit | ✅ `sortResults` tested |
| Sort by result name | Unit | ✅ `sortResults` tested |
| Sort by deviation | Unit | ✅ `sortResults` tested |
| Sort by distance | Unit | ✅ `sortResults` tested |
| Multi-column sorting | Unit | ✅ `sortResults` tested |
| Click column header toggles sort | Cucumber | ❌ Not covered |

---

## 2. Shopping Cart

### 2.1 Add to Cart
| Scenario | Type | Status |
|----------|------|--------|
| Add item to empty cart | E2E | ✅ Covered |
| Add item increments quantity | E2E | ✅ Covered |
| Badge count updates | E2E | ✅ Covered |
| Cart persists to localStorage | E2E | ✅ Covered |
| Button shows "in-cart" state | Cucumber | ❌ Not covered |

### 2.2 Remove from Cart
| Scenario | Type | Status |
|----------|------|--------|
| Remove item from cart | E2E | ✅ Covered (via quantity) |
| Decrement quantity to zero | E2E | ✅ Covered |
| Zero-quantity cleanup on dialog close | Cucumber | ❌ Not covered |
| Button reverts from "in-cart" state | Cucumber | ❌ Not covered |

### 2.3 Cart Display
| Scenario | Type | Status |
|----------|------|--------|
| Show cart items in dialog | E2E | ✅ Covered |
| Show total cost aggregation | Cucumber | ❌ Not covered |
| Show total gains aggregation | Cucumber | ❌ Not covered |
| Empty cart message | E2E | ✅ Covered (implicit) |
| Clear cart button | E2E | ✅ Covered |

---

## 3. Route Calculation

### 3.1 Route Optimization
| Scenario | Type | Status |
|----------|------|--------|
| Nearest-neighbor algorithm | Unit | ✅ `nearestNeighborOrder` tested |
| 2-opt optimization | Unit | ✅ `twoOptOptimize` tested |
| Compute optimal order | Unit | ✅ `computeOptimalOrder` tested |
| Route distance calculation | Unit | ✅ `calculateRouteDistance` tested |
| Cross-world distance (nether conversion) | Unit | ✅ `toOverworldEquivalent` tested |
| Distance matrix building | Unit | ✅ `buildDistanceMatrix` tested |

### 3.2 Route Display
| Scenario | Type | Status |
|----------|------|--------|
| Show route timeline in navigate tab | Cucumber | ❌ Not covered |
| Show total route distance | Cucumber | ❌ Not covered |
| Route updates when cart changes | Cucumber | ❌ Not covered |
| Route shows overworld and nether coords | Cucumber | ❌ Not covered |

---

## 4. Live Navigation

### 4.1 Navigation Start/Stop
| Scenario | Type | Status |
|----------|------|--------|
| Start navigation opens map dialog | E2E | ✅ Covered |
| Start navigation requires player name | Cucumber | ❌ Not covered |
| Stop navigation closes map dialog | Cucumber | ❌ Not covered |
| Stop navigation returns to cart dialog | Cucumber | ❌ Not covered |

### 4.2 Player Position Polling
| Scenario | Type | Status |
|----------|------|--------|
| Poll player position from API | Cucumber | ❌ Not covered |
| Update player marker on map | Cucumber | ❌ Not covered |
| Handle player not found | Cucumber | ❌ Not covered |
| Update live distance display | Cucumber | ❌ Not covered |

### 4.3 Route Updates During Navigation
| Scenario | Type | Status |
|----------|------|--------|
| Recalculate route when player moves significantly | Cucumber | ❌ Not covered |
| Route excludes completed items | Cucumber | ❌ Not covered |
| Update polyline when route changes | Cucumber | ❌ Not covered |
| Dotted line from player to next stop | Cucumber | ❌ Not covered |

### 4.4 Auto-Advance
| Scenario | Type | Status |
|----------|------|--------|
| Auto-complete when player arrives (< 50 blocks) | Cucumber | ❌ Not covered |
| Route recalculates after auto-complete | Cucumber | ❌ Not covered |
| Navigation progress persists | Cucumber | ❌ Not covered |
| Route complete message when all done | Cucumber | ❌ Not covered |

### 4.5 Manual Completion
| Scenario | Type | Status |
|----------|------|--------|
| Click dot to mark stop complete | Cucumber | ❌ Not covered |
| Click dot to unmark completed stop | Cucumber | ❌ Not covered |
| Completion syncs with cart dialog | Cucumber | ❌ Not covered |

---

## 5. Map & Zoom Behavior

### 5.1 Map Tile Loading
| Scenario | Type | Status |
|----------|------|--------|
| Map initializes with overworld tiles | Cucumber | ✅ Covered |
| Map initializes with nether tiles | Cucumber | ✅ Covered |
| Map transitions worlds when player moves | Cucumber | ✅ Covered |

### 5.2 Zoom Behavior
| Scenario | Type | Status |
|----------|------|--------|
| Zoom in when near shop (< 50 blocks) | Cucumber | ❌ Not covered |
| Zoom out when far from shop (> 800 blocks) | Cucumber | ❌ Not covered |
| Zoom levels based on distance brackets | Cucumber | ❌ Not covered |

### 5.3 Map Modes
| Scenario | Type | Status |
|----------|------|--------|
| Follow mode centers on player | Cucumber | ❌ Not covered |
| Manual mode when user drags map | Cucumber | ❌ Not covered |
| Re-center button returns to follow mode | Cucumber | ❌ Not covered |

### 5.4 Shop Tooltip
| Scenario | Type | Status |
|----------|------|--------|
| Show tooltip when entering shop area (< 100 blocks) | Cucumber | ❌ Not covered |
| Tooltip shows shopping list for that shop | Cucumber | ❌ Not covered |
| Tooltip auto-hides after 4 seconds | Cucumber | ❌ Not covered |

---

## 6. Multi-World Navigation

### 6.1 World Detection
| Scenario | Type | Status |
|----------|------|--------|
| Detect overworld from world names | Unit | ✅ `getWorldId` tested |
| Detect nether from world names | Unit | ✅ `getWorldId` tested |
| Detect end from world names | Unit | ✅ `getWorldId` tested |
| Check if world is nether | Unit | ✅ `isNether` tested |

### 6.2 World Switching Logic
| Scenario | Type | Status |
|----------|------|--------|
| Determine when to switch map world | Unit | ✅ `shouldSwitchMapWorld` tested |
| Show travel instruction when worlds differ | Cucumber | ❌ Not covered |

---

## 7. Price Analysis

### 7.1 Deviation Calculation
| Scenario | Type | Status |
|----------|------|--------|
| Calculate trade deviation from market | Unit | ✅ Partially (via getRatio) |
| Handle missing ratio data | Unit | ✅ Covered |

### 7.2 Ratio Matrix
| Scenario | Type | Status |
|----------|------|--------|
| Build ratio graph | Unit | ✅ `buildRatioGraph` tested |
| Get ratio between items | Unit | ✅ `getRatio` tested |
| Display ratio matrix dialog | Cucumber | ❌ Not covered |

---

## Priority Implementation List

### High Priority (Core User Flows)
1. **Search UI interaction** - User enters search, results update
2. **Cart totals display** - Show aggregated costs/gains
3. **Auto-advance on arrival** - Key navigation feature
4. **Zoom based on distance** - Important UX

### Medium Priority (Navigation Features)
5. **Player marker updates** - Visual feedback during navigation
6. **Route recalculation** - Dynamic route optimization
7. **Manual completion toggle** - User control
8. **Follow/Manual mode switching** - Map interaction

### Lower Priority (Edge Cases)
9. **Shop tooltip display** - Nice-to-have UX
10. **Sort column click** - Already works, just needs E2E verification
11. **Debounced search** - Performance optimization

---

## Cucumber Feature Files

| File | Scenarios | Status |
|------|-----------|--------|
| `multi-world-navigation.feature` | 3 | ✅ Implemented |
| `search-and-filter.feature` | 6 | 📝 Created |
| `cart-management.feature` | 8 | 📝 Created |
| `live-navigation.feature` | 16 | 📝 Created |
| `zoom-behavior.feature` | 9 | 📝 Created |
| `route-display.feature` | 12 | 📝 Created |
| `shop-tooltip.feature` | 6 | 📝 Created |

**Total: 60 scenarios** (3 implemented, 57 to implement)
---

## Implementation Guidance

### Adding a New BDD Scenario

1. **Choose the right feature file** based on the category above
2. **Add scenario to feature file** following Gherkin syntax:
   ```gherkin
   @tag
   Scenario: Descriptive name
     Given precondition
     When action
     Then expected result
   ```
3. **Create/update step definitions** in `features/steps/`
4. **Run `npx bddgen`** to generate Playwright test code
5. **Run `npm run test:e2e`** to execute tests

### Step Definition Template

```typescript
// features/steps/your-feature.steps.ts
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';

Given('precondition step', async ({ page }) => {
    // Setup code
});

When('action step', async ({ page }) => {
    // Action code
});

Then('assertion step', async ({ page }) => {
    await expect(page.locator('.element')).toBeVisible();
});
```

### Mock Data Requirements

Most scenarios need mock data. Use `page.route()` to intercept:

```typescript
await page.route('**/data.json', route => {
    route.fulfill({
        body: JSON.stringify(mockShopData)
    });
});
```

See [features/steps/fixtures.ts](features/steps/fixtures.ts) for mock data examples.

### Testing Navigation Scenarios

Navigation tests require:
1. Mock `players.json` endpoint with player position
2. Update mock between polls to simulate movement
3. Use `page.waitForResponse()` to sync with polls

```typescript
let playerPosition = { x: 0, z: 0 };

await page.route('**/players.json', route => {
    route.fulfill({
        body: JSON.stringify({
            players: [{ name: 'TestPlayer', position: playerPosition }]
        })
    });
});

// Simulate player movement
playerPosition = { x: 100, z: 100 };
await page.waitForResponse('**/players.json');
```

### Common Assertions

```typescript
// Element visibility
await expect(page.locator('#element')).toBeVisible();
await expect(page.locator('#element')).toBeHidden();

// Text content
await expect(page.locator('.badge')).toHaveText('5');
await expect(page.locator('.message')).toContainText('success');

// Count
await expect(page.locator('.trade-row')).toHaveCount(10);

// CSS class
await expect(page.locator('.btn')).toHaveClass(/active/);

// Attribute
await expect(page.locator('input')).toHaveAttribute('disabled', '');
```