# Design Decisions

This document captures key architectural and algorithmic decisions made for the shops ratio calculation system.

## Price Aggregation: Median over Mean

**Decision**: Use **median** for all price aggregations instead of arithmetic mean.

**Rationale**:
- Median is robust against outliers (up to 50% breakdown point)
- Works uniformly for any sample size n ≥ 1 without conditional logic
- A single extreme trade (e.g., Diamond Block at 18.69 emeralds vs crafted value of 1134) won't skew the entire calculation

**Alternatives Considered**:
| Method | Pros | Cons |
|--------|------|------|
| Trimmed Mean | Removes extremes | Needs % parameter, complex for small n |
| Winsorized Mean | Caps outliers | Needs percentile choice |
| VWAP | Volume-weighted | Domain-specific, assumes volume data |

**Implementation**: `median()` function in `lib.js` extracts `.price` from price objects and returns the middle value(s).

---

## Independent Shop Clustering

**Decision**: Trades from shops within **16 blocks** of each other are considered from the **same source** and count as 1 independent data point.

**Rationale**:
- Prevents a single mega-shop with many trades from dominating price calculations
- 16 blocks is a reasonable proximity threshold for "same shop area"
- Ensures market prices reflect multiple independent sellers

**Implementation**: `countIndependentShops()` function clusters price locations using 3D Euclidean distance.

---

## Core Block Trust Threshold

**Decision**: Core blocks (Netherite Block, Diamond Block, Emerald Block, Gold Block, Iron Block) require **≥3 independent shops** for their market data to be trusted.

**Rationale**:
- Core blocks are used as base items for ratio calculations (denominators)
- A single outlier trade on a core block would corrupt all ratios in that row/column
- With <3 sources, fall back to crafting value (ingot × 9)

**Example**:
- Diamond Block: 1 shop at 18.69 em → NOT trusted → use Diamond × 9 = 1134 em
- Gold Block: 5 shops at ~20 em → trusted → use market value 20.25 em

**Implementation**: `getBaseEmValue()` in `ratio.js` checks `hasEnoughIndependentData()` before using market prices.

---

## Market Prices vs Fixed Ratios

**Decision**: **Market prices take priority** over fixed crafting ratios. Fixed ratios only fill gaps.

**Rationale**:
- Real trades reflect actual player economy and supply/demand
- Fixed ratios (block = 9 ingots) are theoretical minimums
- Market may value items differently due to convenience, rarity, or speculation

**Priority Order**:
1. Market median (if ≥3 independent shops for core blocks)
2. Crafted value from ingot × 9 (fallback for core blocks)
3. Fixed ratio of 1 (ultimate fallback)

---

## Price Data Structure

**Decision**: Store prices as objects with location: `{ price, x, y, z }`

**Rationale**:
- Enables independent shop clustering
- Preserves provenance for debugging
- Backward compatible (old plain numbers handled gracefully)

**Schema**:
```javascript
{
  price: number,    // Emerald value per item
  x: number,        // Shop X coordinate
  y: number,        // Shop Y coordinate  
  z: number         // Shop Z coordinate
}
```

---

## Configuration Files

| File | Purpose |
|------|---------|
| `ratios_fixed.json` | Block ↔ ingot conversions (e.g., diamond block = 9 diamonds) |
| `core_currencies.json` | List of core blocks for ratio matrix |

These are loaded at runtime and can be modified without code changes.
---

## Testing Strategy: Scenarios vs Unit Tests

**Decision**: Use **Cucumber scenarios** only for behaviors that require browser integration. Use **unit tests** for pure logic.

**Rationale**:
- Scenarios are expensive: they spin up a browser, start a dev server, and interact with real DOM/Leaflet maps
- Unit tests are fast, isolated, and provide precise failure messages
- Only behaviors involving browser APIs, tile loading, or polling loops truly need integration testing

**Scenarios Should Test** (Cucumber):
| Behavior | Why Integration Required |
|----------|-------------------------|
| Map tile initialization | Requires Leaflet to request tiles via network |
| Map world transitions | Requires polling loop + Leaflet tile layer swap |
| Tile request verification | Must intercept real network requests |

**Unit Tests Should Test** (Vitest):
| Behavior | Why Unit Test Sufficient |
|----------|-------------------------|
| `shouldSwitchMapWorld()` | Pure function: world comparison logic |
| `formatDistance()` | Pure function: number → string |
| Distance calculations | Pure math with no DOM dependency |
| Navigation text formatting | String manipulation |

**Implementation**:
- `features/` directory contains Cucumber `.feature` files for BDD scenarios
- `src/*.test.ts` files contain Vitest unit tests for pure functions
- `tests/` directory contains Playwright component tests for layout/rendering