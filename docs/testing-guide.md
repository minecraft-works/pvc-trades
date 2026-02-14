# Testing Guide

This guide explains how to write and run tests for PVC Trades.

## Test Architecture Overview

```
┌─────────────────────────────────────────────┐
│              Unit Tests (Vitest)             │
│  • Pure functions in library.ts              │
│  • Fast, isolated, no browser needed         │
│  • Location: src/*.test.ts                   │
└─────────────────────────────────────────────┘
                      ↑
                      │ Foundation
                      │
┌─────────────────────────────────────────────┐
│           BDD Tests (Playwright-BDD)         │
│  • User journeys and integration             │
│  • Real browser, mocked APIs                 │
│  • Location: features/*.feature              │
│  • Steps: features/steps/*.steps.ts          │
└─────────────────────────────────────────────┘
```

## Running Tests

### Unit Tests
```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test -- src/library.test.ts
```

### BDD Tests
```bash
# Run with visible browser (debugging)
npm run test:e2e

# Run headless (CI mode)
npm run test:ci

# Run specific feature file
npx bddgen && npx playwright test --grep "cart"

# Generate report
npm run test:e2e -- --reporter=html
```

## Unit Tests (Vitest)

### When to Write Unit Tests
- Pure functions with no DOM dependencies
- Data transformations
- Calculations and algorithms
- Validation logic

### Test File Location
Place test files adjacent to the source:
```
src/
├── library.ts
├── library.test.ts           ← Unit tests
├── library.property.test.ts  ← Property-based tests
├── tile-coords.test.ts
├── interpolation.test.ts
├── stores/
│   ├── cart-store.test.ts
│   ├── favorites-store.test.ts
│   ├── navigation-store.test.ts
│   └── snapshot-store.test.ts
├── map/
│   └── players.test.ts
scripts/
└── tile-utils.test.ts
```

### Writing Unit Tests

```typescript
// src/library.test.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { calculateRouteDistance, median, filterTrade } from './library.js';

describe('calculateRouteDistance', () => {
    test('returns zero for same point', () => {
        const distance = calculateRouteDistance(
            0, 0, 'overworld',
            0, 0, 'overworld'
        );
        expect(distance).toBe(0);
    });

    test('multiplies nether coords by 8', () => {
        const distance = calculateRouteDistance(
            0, 0, 'overworld',
            100, 100, 'the_nether'
        );
        // Nether (100, 100) = Overworld (800, 800)
        expect(distance).toBeCloseTo(Math.hypot(800, 800));
    });

    test('calculates direct overworld distance', () => {
        const distance = calculateRouteDistance(
            0, 0, 'overworld',
            300, 400, 'overworld'
        );
        expect(distance).toBe(500); // 3-4-5 triangle
    });
});

describe('median', () => {
    test('returns middle value for odd array', () => {
        expect(median([1, 2, 3])).toBe(2);
    });

    test('returns average of middle values for even array', () => {
        expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    test('handles single element', () => {
        expect(median([42])).toBe(42);
    });

    test('handles unsorted input', () => {
        expect(median([3, 1, 2])).toBe(2);
    });
});

describe('filterTrade', () => {
    const mockTrade = {
        resultName: 'Diamond Sword',
        resultAmount: 1,
        item1: { name: 'emerald', amount: 10 },
        costName: 'Emerald',
        x: 0, y: 64, z: 0,
        world: 'overworld',
        displayStock: 5
    };

    test('matches result name', () => {
        const result = filterTrade(mockTrade, /diamond/i, undefined, []);
        expect(result).not.toBeNull();
        expect(result?.matchResult).toBe(true);
    });

    test('matches cost name', () => {
        const result = filterTrade(mockTrade, undefined, /emerald/i, []);
        expect(result).not.toBeNull();
        expect(result?.matchCost).toBe(true);
    });

    test('returns null when no match', () => {
        const result = filterTrade(mockTrade, /gold/i, undefined, []);
        expect(result).toBeNull();
    });
});
```

### Test Patterns

#### Arrange-Act-Assert
```typescript
test('adds item to empty cart', () => {
    // Arrange
    const cart: CartItem[] = [];
    const trade = createMockTrade();
    
    // Act
    addToCart(cart, trade);
    
    // Assert
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(1);
});
```

#### Edge Cases
```typescript
describe('edge cases', () => {
    test('handles empty array', () => {
        expect(median([])).toBeUndefined();
    });

    test('handles negative values', () => {
        expect(median([-3, -1, -2])).toBe(-2);
    });

    test('handles very large numbers', () => {
        expect(median([Number.MAX_SAFE_INTEGER])).toBe(Number.MAX_SAFE_INTEGER);
    });
});
```

## BDD Tests (Playwright-BDD)

### When to Write BDD Tests
- User-facing features
- Integration between components
- Navigation flows
- Dialog interactions
- State persistence

### Feature File Structure

```gherkin
# features/cart-management.feature

@cart
Feature: Shopping Cart Management
  As a trader
  I want to manage items in my cart
  So that I can plan my shopping trips

  Background:
    Given the app is loaded with mock shop data

  @add-item
  Scenario: Add a trade to the cart
    When I click the add to cart button on a trade
    Then the cart badge should show "1"
    And the trade should be marked as in cart

  @quantity
  Scenario: Adjust item quantity in cart
    Given I have a trade in my cart
    When I open the cart dialog
    And I click the plus button on the cart item
    Then the quantity should show "2"

  @persistence
  Scenario: Cart persists across page reload
    Given I have a trade in my cart
    When I reload the page
    Then the cart badge should show "1"
```

### Step Definitions

```typescript
// features/steps/cart.steps.ts
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';

Given('the app is loaded with mock shop data', async ({ page }) => {
    // Mock the data endpoint
    await page.route('**/data.json', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockShopData)
        });
    });
    
    // Navigate and wait for data to load
    await page.goto('/');
    await page.waitForSelector('.trade-row');
});

Given('I have a trade in my cart', async ({ page }) => {
    await page.locator('.add-to-cart-btn').first().click();
    await expect(page.locator('#cart-badge')).toBeVisible();
});

When('I click the add to cart button on a trade', async ({ page }) => {
    await page.locator('.add-to-cart-btn').first().click();
});

When('I open the cart dialog', async ({ page }) => {
    await page.click('#open-cart');
    await expect(page.locator('#cart-dialog')).toBeVisible();
});

When('I click the plus button on the cart item', async ({ page }) => {
    await page.locator('.cart-item .qty-plus').first().click();
});

Then('the cart badge should show {string}', async ({ page }, count: string) => {
    await expect(page.locator('#cart-badge')).toHaveText(count);
});

Then('the quantity should show {string}', async ({ page }, qty: string) => {
    await expect(page.locator('.cart-item .qty-display').first()).toHaveText(qty);
});
```

### Fixtures

```typescript
// features/steps/fixtures.ts
import { test as base, createBdd } from 'playwright-bdd';
import type { ShopData } from '../../src/types.js';

// Extend base test with custom fixtures
export const test = base.extend<{
    mockShopData: ShopData;
    mockPlayers: Player[];
}>({
    mockShopData: async ({}, use) => {
        await use({
            shops: [
                {
                    x: 100, y: 64, z: 200,
                    world: 'overworld',
                    trades: [
                        {
                            resultName: 'Diamond Sword',
                            resultAmount: 1,
                            item1: { name: 'emerald', amount: 10 },
                            stock: 5
                        }
                    ]
                }
            ]
        });
    },
    
    mockPlayers: async ({}, use) => {
        await use([
            {
                name: 'TestPlayer',
                position: { x: 0, y: 64, z: 0 },
                world: 'overworld'
            }
        ]);
    }
});

export const { Given, When, Then } = createBdd(test);
```

### API Mocking

```typescript
// Mock data.json
await page.route('**/data.json', route => {
    route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockShopData)
    });
});

// Mock players.json (polling endpoint)
await page.route('**/players.json', route => {
    route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ players: mockPlayers })
    });
});

// Mock tile images
await page.route('**/tiles/**/*.png', route => {
    route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(/* 1x1 transparent PNG */)
    });
});
```

### Data Tables

```gherkin
Scenario: Filter by multiple criteria
  When I enter the following search criteria:
    | Field | Value    |
    | Want  | diamond  |
    | Give  | emerald  |
  Then I should see filtered results
```

```typescript
import { DataTable } from '@cucumber/cucumber';

When('I enter the following search criteria:', async ({ page }, dataTable: DataTable) => {
    const rows = dataTable.hashes();
    for (const row of rows) {
        const selector = row.Field === 'Want' ? '#searchWant' : '#searchGive';
        await page.fill(selector, row.Value);
    }
    await page.waitForTimeout(200); // Debounce
});
```

## Best Practices

### 1. Mock External Dependencies
```typescript
// ✅ Good: Mock API
await page.route('**/data.json', route => route.fulfill({ body: mockData }));

// ❌ Bad: Hit real API
await page.goto('/'); // Uses real data.json
```

### 2. Use Explicit Waits
```typescript
// ✅ Good: Wait for specific condition
await expect(page.locator('.trade-row')).toHaveCount(10);

// ❌ Bad: Arbitrary timeout
await page.waitForTimeout(1000);
```

### 3. Test One Thing Per Scenario
```gherkin
# ✅ Good: Focused scenario
Scenario: Add item to cart
  When I click add to cart
  Then the badge shows 1

# ❌ Bad: Multiple unrelated assertions
Scenario: Everything works
  When I do many things
  Then many things happened
```

### 4. Use Meaningful Selectors
```typescript
// ✅ Good: Semantic selectors
await page.click('[data-testid="add-to-cart"]');
await page.click('#open-cart');
await page.click('.add-to-cart-btn');

// ❌ Bad: Brittle selectors
await page.click('div > div > button:nth-child(3)');
```

### 5. Clean Up State
```typescript
// In hooks.ts
import { Before, After } from '@cucumber/cucumber';

Before(async ({ page }) => {
    // Clear localStorage before each scenario
    await page.evaluate(() => localStorage.clear());
});
```

## Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Functions | 80% |
| Branches | 80% |
| Statements | 80% |

Run coverage report:
```bash
npm run test:coverage
```

## Debugging Tests

### Unit Tests
```bash
# Run with debugging output
npm test -- --reporter=verbose

# Run single test
npm test -- -t "specific test name"
```

### BDD Tests
```bash
# Run headed with slow motion
npx playwright test --headed --slowmo=500

# Run with debug mode
PWDEBUG=1 npx playwright test

# View trace
npx playwright show-trace reports/trace/trace.zip
```

## CI Integration

Tests run automatically on:
- Pull request creation
- Push to main branch

See `.github/workflows/` for CI configuration.
