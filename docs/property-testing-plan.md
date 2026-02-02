# Property-Based Testing Implementation Plan

Add fuzz/property-based testing with `fast-check` to catch edge cases and regression bugs that unit tests miss.

## Overview

Property-based testing generates random inputs to verify invariants hold across thousands of test cases. Unlike example-based tests that check specific inputs, property tests discover edge cases automatically.

## Summary

**56 property tests implemented** covering 19 functions across 5 tiers.

### Bugs Found During Implementation

Property testing revealed actual behavioral issues:

1. **`matchesQuery` case sensitivity**: The function's `normalize()` path removes underscores/spaces but does NOT do case folding. The word-split fallback path uses `text.includes(word)` which is also case-sensitive. This means searching for "diamond" won't match "Diamond".

2. **`getRegex` throws on special chars**: Input containing regex metacharacters like `(`, `)`, `[`, `]` causes `SyntaxError` because the function doesn't escape them. Currently mitigated by filtering to alphanumeric input in tests.

3. **`filterTrade` case sensitivity**: Since it uses `matchesQuery`, filtering is case-sensitive. Unit tests passed because they used lowercase `resultText` values.

## Checklist

### Setup
- [x] Install `fast-check` as dev dependency
- [x] Create `src/library.property.test.ts`
- [x] Add `test:property` script to package.json
- [x] Verify tests run with `npm test` (auto-discovered by Vitest)

### Tier 1: Text/Safety Functions (4 functions)
- [x] `escapeHtml` - output never contains raw `<`, `>`, `&`, `"`, `'`
- [x] `matchesQuery` - never throws; text matches itself
- [x] `getRegex` - never throws on alphanumeric; returned regex matches query
- [x] `formatName` - output starts uppercase; underscores → spaces

### Tier 2: Display Functions (2 functions)
- [x] `highlight` - output length ≥ input; mark tags balanced
- [x] `parseLocation` - roundtrip for valid coords; never throws on malformed

### Tier 3: Math/Geometry Functions (7 functions)
- [x] `median` - result ∈ [min, max]; single-element returns itself; order invariant
- [x] `toOverworldEquivalent` - nether × 8 = overworld; overworld unchanged
- [x] `calculateRouteDistance` - symmetric; same point = 0; triangle inequality
- [x] `getTileCoords` - consistent with offset; adjacent coords → adjacent tiles
- [x] `getTileOffset` - always within tile bounds [0, tileSize)
- [x] `clampToCircle` - output ≤ radius; points inside unchanged
- [x] `isNether` / `getWorldId` - correct categorization

### Tier 4: Route Optimization (4 functions)
- [x] `nearestNeighborOrder` - output is permutation; length preserved
- [x] `twoOptOptimize` - distance ≤ input; valid permutation; idempotent
- [x] `buildDistanceMatrix` - symmetric; diagonal zero; non-negative
- [x] `calculateOrderDistance` - non-negative; empty = 0

### Tier 5: Filtering Functions (2 functions)
- [x] `filterTrade` - empty queries match all; zero stock never matches
- [x] `sortResults` - length preserved; same elements after sort

### Integration
- [x] Verify pre-commit hook runs property tests (via `npm run test:coverage`)
- [x] CI automatically includes property tests in `npm test`
- [ ] Monitor CI timing (target: <30s for property tests)

## Configuration

```typescript
// Global config: 500 runs per property
fc.configureGlobal({ numRuns: 500 });
```

## Reproducing Failures

When a property test fails, fast-check prints a seed and path:

```
Property failed after 123 tests
Seed: 1234567890
Path: "0:1:2:3"
Counterexample: [...]
```

To replay the exact failure:

```typescript
fc.assert(
  fc.property(fc.string(), (s) => {
    // ... property
  }),
  { seed: 1234567890, path: "0:1:2:3" }
);
```

## Properties Reference

| Function | Property | Invariant |
|----------|----------|-----------|
| `escapeHtml` | No dangerous chars | `∀s: escapeHtml(s)` contains no `<>&"'` |
| `matchesQuery` | No exceptions | `∀text,query: matchesQuery(text,query)` doesn't throw |
| `median` | Bounded | `∀arr: min(arr) ≤ median(arr) ≤ max(arr)` |
| `median` | Single identity | `median([x]) === x` |
| `toOverworldEquivalent` | Nether scaling | `toOverworld(x,z,'nether') === {x*8, z*8}` |
| `toOverworldEquivalent` | Overworld identity | `toOverworld(x,z,'overworld') === {x, z}` |
| `calculateRouteDistance` | Symmetry | `dist(A,B) === dist(B,A)` |
| `calculateRouteDistance` | Zero self-distance | `dist(P,P) === 0` |
| `nearestNeighborOrder` | Permutation | Output contains each index 0..n-1 exactly once |
| `twoOptOptimize` | Non-increasing | `totalDist(optimized) ≤ totalDist(initial)` |
| `twoOptOptimize` | Valid permutation | Output is permutation of input |

## Future Expansion

1. **State machine testing** for navigation store (idle → navigating → follow/manual → completed)
2. **Race condition tests** for player polling with artificial delays
3. **Snapshot regression** for route optimization determinism
