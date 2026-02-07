# ADR-003: Disable Animations During E2E Testing

## Status
**Implemented** - February 2026

## Context

E2E tests using Playwright were experiencing:

1. **Flaky timing**: CSS transitions and Leaflet map animations (`flyTo`, `zoomAnimation`) introduce non-deterministic timing that causes intermittent test failures.

2. **Slow execution**: Animation durations (300ms flyTo, 150ms CSS transitions, 200ms tooltip appear) add up across hundreds of test scenarios.

3. **Wait complexity**: Tests needed explicit waits or retry logic to account for animation completion, adding noise to test code.

### Requirements

- Production code should remain clean (no `if (isTest)` scattered throughout)
- Solution should be opt-in from test code, not require build-time flags
- Should also respect `prefers-reduced-motion` for accessibility
- Must disable both JavaScript animations (Leaflet) and CSS animations/transitions

## Decision

Implement a **flag-based animation disable system** that test code sets before page load:

```
┌─────────────────┐                    ┌──────────────────┐
│  Test Fixture   │                    │  Application     │
│                 │                    │                  │
│ addInitScript() │───────────────────►│ globalThis.      │
│                 │  Sets flags before │ __animationsDisabled │
│                 │  page loads        │                  │
└─────────────────┘                    │ document.dataset.│
                                       │ animationsDisabled │
                                       └────────┬─────────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
                    ▼                           ▼                           ▼
          ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
          │  Leaflet Maps   │        │  CSS Rules      │        │  flyTo duration │
          │                 │        │                 │        │                 │
          │ fadeAnimation:  │        │ [data-*] {      │        │ getAnimation-   │
          │   false         │        │   animation:    │        │   Duration(300) │
          │ zoomAnimation:  │        │     0.01ms;     │        │   → 0           │
          │   false         │        │   transition:   │        │                 │
          │                 │        │     0.01ms;     │        │                 │
          └─────────────────┘        └─────────────────┘        └─────────────────┘
```

### Implementation Details

#### 1. Global Type Declaration (`src/types.ts`)

```typescript
declare global {
    var __animationsDisabled: boolean | undefined;
}

export function shouldDisableAnimations(): boolean {
    if (globalThis.window === undefined) return false;
    return globalThis.__animationsDisabled === true;
}

export function getAnimationDuration(defaultMs: number): number {
    return shouldDisableAnimations() ? 0 : defaultMs;
}
```

#### 2. CSS Animation Disable Rules (`styles.css`)

```css
/* Accessibility: respect user preference */
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}

/* Test mode: disable via data attribute */
[data-animations-disabled="true"] *, 
[data-animations-disabled="true"] *::before, 
[data-animations-disabled="true"] *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
}
```

#### 3. Leaflet Map Configuration (`src/main.ts`)

```typescript
const animationOptions = shouldDisableAnimations() ? {
    fadeAnimation: false,
    zoomAnimation: false,
    markerZoomAnimation: false
} : {};

leafletMap = L.map(container, {
    ...existingOptions,
    ...animationOptions
});
```

#### 4. Test Fixtures

**BDD Tests** (`features/steps/fixtures.ts`):
```typescript
export const test = base.extend({
    page: async ({ page }, use) => {
        await page.addInitScript(() => {
            globalThis.__animationsDisabled = true;
            document.documentElement.dataset.animationsDisabled = 'true';
        });
        await use(page);
    },
});
```

**Spec Tests** (`tests/helpers/global-setup.ts`):
Same pattern, imported by spec files instead of `@playwright/test`.

#### 5. Leaflet Method Patching (Preferred for Animation Methods)

For methods like `flyTo` that have animated behavior, patch the Leaflet prototype in test fixtures rather than adding if/else logic in production code:

```typescript
// In test fixtures (addInitScript)
await page.addInitScript(() => {
    // Patch Leaflet flyTo to use instant setView in tests
    const checkLeaflet = setInterval(() => {
        if (typeof L !== 'undefined' && L.Map?.prototype) {
            L.Map.prototype.flyTo = function(latlng: L.LatLngExpression, zoom?: number) {
                return this.setView(latlng, zoom, { animate: false });
            };
            clearInterval(checkLeaflet);
        }
    }, 10);
});
```

**Key Principle**: Production code calls `flyTo()` normally. Test fixtures intercept and redirect to `setView()`. No if/else in production code.

This approach:
- Keeps production code clean and simple
- Tests exercise the same code paths (just with patched library behavior)
- Avoids `if (shouldDisableAnimations())` branching on method selection

## Consequences

### Positive

- **Clean production code**: Only 3 small integration points (2 map configs, 1 flyTo call)
- **Test stability**: Eliminates animation-related timing flakiness
- **Test speed**: Removes ~500ms+ of animation time per map interaction
- **Accessibility bonus**: `prefers-reduced-motion` support comes free
- **Centralized control**: Single flag enables/disables all animations

### Negative

- **Test/prod divergence**: Tests don't exercise animation code paths
- **Initial setup**: Each test runner needs to inject the flag
- **Debugging**: If a test fails, developer may not see the same animations

### Mitigations

- Visual regression tests (if added) should run WITHOUT the animation disable flag
- Manual testing during development still has animations enabled
- Animation logic itself is simple enough to not need E2E coverage

## Alternatives Considered

### 1. Build-time flag (`IS_TEST` environment variable)

**Rejected**: Requires separate builds for test vs production, complicates CI.

### 2. Conditional logic scattered throughout code

```typescript
// ❌ Don't do this
if (!window.__testMode) {
    element.classList.add('animate');
}
```

**Rejected**: Pollutes production code, easy to miss spots, harder to maintain.

### 3. CSS-only solution with `prefers-reduced-motion`

```typescript
// In test, emulate reduced motion
await page.emulateMedia({ reducedMotion: 'reduce' });
```

**Rejected**: Doesn't affect JavaScript animations (Leaflet flyTo). Would need dual approach anyway.

### 4. Playwright's built-in `page.emulateMedia({ reducedMotion: 'reduce' })`

**Partially adopted**: Our CSS rules respect this, but we still need the JS flag for Leaflet animations, so we use both approaches together via our custom flag.

## References

- [Leaflet Animation Options](https://leafletjs.com/reference.html#map-animation-options)
- [prefers-reduced-motion MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [Playwright addInitScript](https://playwright.dev/docs/api/class-page#page-add-init-script)
