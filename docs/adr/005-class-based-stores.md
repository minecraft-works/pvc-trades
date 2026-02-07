# ADR-005: Class-Based Store Pattern

## Status
**Implemented** - 2025

## Context

The application needs to manage several pieces of state that:

1. Persist across page reloads (localStorage)
2. Are accessed from multiple parts of the codebase
3. Require encapsulated update logic
4. Need cleanup/sync behavior on certain events

### State Categories

| State | Persistence | Complexity |
|-------|-------------|------------|
| Cart items | localStorage | High (quantities, aggregation) |
| Navigation progress | localStorage | Medium (completion tracking) |
| Player name | localStorage | Low (single value) |
| Current tab | sessionStorage | Low (single value) |

## Decision

Use **class-based stores** with encapsulated state and methods. Each store is a singleton instance exported from its module.

```typescript
class CartStore {
    private items: CartItem[] = [];
    
    add(item: CartItem): void { /* ... */ }
    remove(key: string): void { /* ... */ }
    getAll(): CartItem[] { return [...this.items]; }
}

export const cartStore = new CartStore();
```

## Rationale

### Why Classes Over Plain Objects?

| Aspect | Plain Object | Class |
|--------|--------------|-------|
| Encapsulation | Properties exposed | Private state |
| Method binding | Manual `this` handling | Automatic |
| Initialization | Scattered | Constructor |
| TypeScript | Requires explicit typing | Natural inference |

Classes provide clear boundaries around state mutation and make it obvious which operations are valid.

### Why Not External State Libraries?

| Library | Pros | Cons | Decision |
|---------|------|------|----------|
| Redux | Predictable, devtools | Boilerplate, learning curve, dependency | Rejected |
| Zustand | Minimal, hooks-friendly | React-oriented, dependency | Rejected |
| MobX | Reactive, automatic | Magic, dependency, complexity | Rejected |
| Signals | Fine-grained reactivity | Newer pattern, dependency | Rejected |

**Key factors**:
- This is a vanilla TypeScript app, not React/Vue
- State is simple enough that external tools add complexity without benefit
- Zero dependencies means faster loads and no version management
- Team can understand stores without learning library-specific patterns

### Why Singletons?

- State is inherently global (one cart, one navigation session)
- Avoids prop drilling through component tree
- Simplifies testing (can reset store between tests)
- Clear ownership of where state lives

## Implementation

### Store Structure

```
src/stores/
├── cart-store.ts       # Cart items, quantities, totals
└── navigation-store.ts # Route progress, Leaflet refs
```

### Common Patterns

1. **Private state, public methods**
   ```typescript
   private items: CartItem[] = [];
   getAll(): CartItem[] { return [...this.items]; } // Defensive copy
   ```

2. **Persistence in methods**
   ```typescript
   add(item: CartItem): void {
       this.items.push(item);
       this.persist(); // Encapsulated
   }
   ```

3. **Safe localStorage access**
   ```typescript
   private persist(): void {
       try {
           localStorage.setItem(KEY, JSON.stringify(this.items));
       } catch { /* Storage full or blocked */ }
   }
   ```

4. **Hydration from storage**
   ```typescript
   constructor() {
       this.items = this.loadFromStorage();
   }
   ```

## Consequences

### Positive

- Zero external dependencies
- Clear, predictable state management
- Easy to test (mock stores, reset state)
- TypeScript provides full type safety
- Encapsulated persistence logic

### Negative

- No automatic UI updates (must manually trigger re-renders)
- No devtools for state inspection (use debug logging)
- Pattern is less familiar than Redux/Context to some developers

### Mitigations

- UI re-renders are explicit: call `renderCart()` after state change
- Debug logging added via `debug` package for state inspection
- Pattern documented in code-patterns.md

## Future Considerations

If the app grows to need:
- **Reactive updates**: Consider signals or a simple pub/sub
- **Complex derived state**: Add computed getters
- **Undo/redo**: Add action history to stores
