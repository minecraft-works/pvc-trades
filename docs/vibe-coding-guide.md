# Vibe Coding Optimization Guide

**Date**: January 25, 2026  
**Project**: pvc-trades  
**Purpose**: Recommendations for optimizing the project for AI-assisted development (vibe coding)

---

## What is Vibe Coding?

Vibe coding is a development style where developers collaborate with AI assistants (like GitHub Copilot, Claude, Cursor) to write, review, and refactor code. The "vibe" comes from having a productive flow where the AI understands your intentions and generates useful code with minimal friction.

---

## Current State Assessment

### Already Good for Vibe Coding ✅

| Aspect | Why It Helps |
|--------|--------------|
| **Strict TypeScript** | AI can infer types and generate type-safe code |
| **Zod schemas** | Clear data contracts for AI to understand |
| **BDD Feature Files** | Natural language specs AI can read and implement |
| **Clean separation** | `library.ts` vs `main.ts` - clear boundaries |
| **Conventional Commits** | AI can generate proper commit messages |

### Needs Improvement ⚠️

| Aspect | Issue |
|--------|-------|
| **Copilot instructions** | Only covers git conventions, missing coding patterns |
| **No API documentation** | AI can't quickly understand function signatures |
| **Large main.ts** | 3191 lines - too big for AI context windows |
| **No example patterns** | AI doesn't know preferred coding style |

---

## Recommendations

### 1. Expand `.github/copilot-instructions.md`

**Current**: Only git conventions  
**Needed**: Full coding style guide

```markdown
## Coding Conventions

### File Organization
- Pure functions go in `library.ts`
- DOM/UI code goes in `main.ts`
- Types and Zod schemas go in `types.ts`
- Each feature's step definitions in `features/steps/{feature}.steps.ts`

### Naming Conventions
- Use `camelCase` for functions and variables
- Use `PascalCase` for types, interfaces, and classes
- Use `SCREAMING_SNAKE_CASE` for constants
- Prefix unused parameters with `_` (e.g., `_event`)

### Function Patterns
- Pure functions: no side effects, return value based on inputs
- Prefer early returns over nested conditionals
- Max 5 parameters; use options object for more
- Always add JSDoc for exported functions

### Testing Patterns
- Unit tests in `*.test.ts` adjacent to source
- BDD scenarios in `features/*.feature`
- Step definitions use fixtures pattern from `fixtures.ts`
- Mock external APIs, never hit real endpoints in tests

### TypeScript Style
- Prefer `undefined` over `null` (enforced by unicorn/no-null)
- Use `unknown` for external data, validate with Zod
- Prefer `for...of` over `.forEach()` (enforced by unicorn)
- Use template literals over string concatenation

### CSS Conventions
- Use CSS custom properties for theming
- Follow BEM-like naming: `.component-element--modifier`
- Mobile-first responsive design
```

### 2. Add JSDoc to All Exported Functions

AI assistants work much better when functions are documented:

```typescript
/**
 * Calculates the optimal visiting order for cart items using nearest-neighbor + 2-opt.
 * 
 * @param items - Cart items with coordinates
 * @param startPosition - Optional starting position (defaults to origin)
 * @returns Reordered array of items in optimal visiting order
 * 
 * @example
 * const optimized = computeOptimalOrder(cartItems, { x: 0, z: 0 });
 */
export function computeOptimalOrder(
    items: CartItem[],
    startPosition?: Coordinates
): CartItem[] {
    // ...
}
```

**Action**: Add JSDoc to all 50+ exported functions in `library.ts`

### 3. Split `main.ts` into Focused Modules

At 3191 lines, `main.ts` exceeds typical AI context windows (~8K tokens ≈ 2000 lines). Split by feature:

```
src/
├── main.ts              # Entry point, initialization only
├── library.ts           # Pure logic (keep as-is)
├── types.ts             # Types (keep as-is)
├── ui/
│   ├── cart-dialog.ts   # Cart dialog UI
│   ├── map-dialog.ts    # Map/navigation UI
│   ├── search.ts        # Search & filtering UI
│   ├── virtual-scroll.ts # Trade list rendering
│   └── dialogs.ts       # Dialog utilities
├── state/
│   ├── cart-state.ts    # Shopping cart state
│   ├── nav-state.ts     # Navigation progress state
│   └── search-state.ts  # Search/sort state
└── debug.ts             # Debug utilities (keep as-is)
```

### 4. Create Code Patterns Document

Help AI understand your preferred patterns:

```markdown
# docs/code-patterns.md

## State Management Pattern

Use class-based stores for shared state:

\`\`\`typescript
class CartStore {
    private items: CartItem[] = [];
    
    add(item: CartItem): void { ... }
    remove(key: string): void { ... }
    get(): CartItem[] { return [...this.items]; }
}

export const cartStore = new CartStore();
\`\`\`

## Event Handler Pattern

Separate event wiring from business logic:

\`\`\`typescript
// ❌ Don't mix concerns
button.addEventListener('click', async (e) => {
    const data = await fetch(...);
    processData(data);
    updateUI(data);
});

// ✅ Separate concerns
button.addEventListener('click', handleAddToCart);

async function handleAddToCart(event: MouseEvent): Promise<void> {
    const item = getItemFromEvent(event);
    cartStore.add(item);
    renderCart();
}
\`\`\`

## BDD Step Definition Pattern

Use fixtures for shared setup:

\`\`\`typescript
import { Given, When, Then } from './fixtures';

Given('I add a trade to the cart', async ({ page }) => {
    await page.locator('.add-to-cart-btn').first().click();
});
\`\`\`
```

### 5. Add `.cursorrules` / `.aider.conf.yml`

For users of Cursor or Aider:

```yaml
# .cursorrules or cursor.rules
rules:
  - Always use TypeScript strict mode
  - Validate external data with Zod schemas
  - Write unit tests for pure functions
  - Use playwright-bdd for browser tests
  - Follow conventional commits
  - Prefer for...of over forEach
  - Use undefined, never null
```

### 6. Create Feature Spec Templates

When adding new features, provide a template that guides AI:

```markdown
# docs/templates/feature-spec.md

## Feature: [Name]

### User Story
As a [role], I want [feature] so that [benefit].

### Acceptance Criteria
- [ ] Given [context], when [action], then [result]
- [ ] ...

### Technical Notes
- Pure logic goes in: `library.ts`
- UI goes in: `src/ui/[feature].ts`
- Types needed: [list]

### Test Plan
- Unit tests: [functions to test]
- BDD scenarios: [features/[name].feature]
```

### 7. Leverage SCENARIOS.md More Effectively

Your `SCENARIOS.md` is excellent! Enhance it for AI:

```markdown
## How to Implement Missing Scenarios

When implementing a scenario marked ❌:

1. Check if pure logic exists in `library.ts` (convert to unit test)
2. If UI-dependent, add to appropriate `.feature` file
3. Add step definitions in `features/steps/`
4. Follow the fixture pattern in `fixtures.ts`

### Example: Implementing "Search highlighting in results"

**Feature file** (features/search-and-filter.feature):
\`\`\`gherkin
@search @highlight
Scenario: Search highlighting in results
  Given the app is loaded with mock shop data
  When I search for "diamond"
  Then the results should highlight "diamond" matches
\`\`\`

**Step definition** (features/steps/search.steps.ts):
\`\`\`typescript
Then('the results should highlight {string} matches', async ({ page }, term) => {
    const highlight = page.locator('.highlight').first();
    await expect(highlight).toContainText(term, { ignoreCase: true });
});
\`\`\`
```

### 8. Add Context Files for AI

Create focused context files that AI can reference:

```
docs/
├── architecture.md      # System overview for AI context
├── api-reference.md     # All exported functions with signatures
├── code-patterns.md     # Preferred patterns (see above)
├── testing-guide.md     # How to write tests
└── glossary.md          # Domain terms (Nether, Overworld, trade, etc.)
```

### 9. Use Structured Comments for Complex Logic

Help AI understand complex algorithms:

```typescript
/**
 * 2-opt optimization for route improvement.
 * 
 * Algorithm:
 * 1. Start with initial route from nearest-neighbor
 * 2. For each pair of edges (i,i+1) and (j,j+1):
 *    - Try reversing the segment between i+1 and j
 *    - If new distance < old distance, keep the swap
 * 3. Repeat until no improvement found
 * 
 * Time complexity: O(n²) per iteration
 * Typical iterations: 2-5 for small routes
 */
function twoOptOptimize(route: CartItem[]): CartItem[] {
    // ...
}
```

### 10. Define AI-Friendly Interfaces

Use discriminated unions that AI can pattern-match:

```typescript
// ✅ AI-friendly: clear discrimination
type DialogAction = 
    | { type: 'open'; dialogId: string }
    | { type: 'close'; dialogId: string }
    | { type: 'toggle'; dialogId: string };

// ✅ AI-friendly: self-documenting options
interface SearchOptions {
    /** Filter by items you want to receive */
    wantFilter?: string;
    /** Filter by items you need to give */
    giveFilter?: string;
    /** Sort column (default: 'dev') */
    sortBy?: SortColumn;
    /** Sort direction (default: 'asc') */
    sortDirection?: SortDirection;
}
```

---

## Implementation Priority

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 🔴 High | Expand copilot-instructions.md | Low | High |
| 🔴 High | Add JSDoc to library.ts exports | Medium | High |
| 🟡 Medium | Split main.ts into modules | High | High |
| 🟡 Medium | Create code-patterns.md | Low | Medium |
| 🟢 Low | Add .cursorrules | Low | Medium |
| 🟢 Low | Create architecture.md | Medium | Medium |

---

## Quick Wins (Do Today)

1. **Expand copilot-instructions.md** with coding conventions (30 min)
2. **Add JSDoc to top 10 most-used functions** in library.ts (1 hour)
3. **Create code-patterns.md** with 3-4 key patterns (30 min)

---

## Measuring Success

After implementing these changes, vibe coding should feel better when:

- [ ] AI generates code that passes lint on first try
- [ ] AI correctly uses Zod schemas without prompting
- [ ] AI writes tests in the correct location and style
- [ ] AI generates conventional commit messages automatically
- [ ] AI understands domain terms (Nether, Overworld, trade)
- [ ] AI can implement a new BDD scenario end-to-end

---

## Conclusion

The pvc-trades project has excellent foundations for vibe coding (strict types, BDD, clean architecture). The main gaps are **documentation for AI context** and **file size for context windows**. 

Expanding the copilot instructions and adding JSDoc will provide immediate improvements. Splitting `main.ts` is higher effort but will enable AI to work with focused, digestible chunks of code.
