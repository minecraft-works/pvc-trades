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

### Key Files to Know

- `config.json` - App configuration (Dynmap URLs, analysis settings)
- `core_currencies.json` - List of core blocks for ratio matrix
- `block_conversions.json` - Block ↔ ingot conversion rates
- `SCENARIOS.md` - Test scenario coverage matrix

### Architectural Decision Records (ADRs)

Significant design decisions are documented in `docs/adr/`. Consult these before making changes to established patterns:

- [ADR-001](docs/adr/001-price-aggregation-design.md) - Price aggregation design
- [ADR-002](docs/adr/002-bdd-test-framework.md) - BDD test framework choice
- [ADR-003](docs/adr/003-disable-animations-in-tests.md) - Disabling animations in tests

**Key principle from ADR-003**: Test-specific logic belongs in test fixtures, not production code. For example, Leaflet's `flyTo` method is patched in test fixtures to use `setView` instead—no if/else branching in `main.ts`.
