# ADR-001: Price Aggregation and Market Analysis Design

## Status
**Implemented** - 2024

## Context

The shop trade viewer needs to calculate fair market prices and detect deals. This requires aggregating price data from multiple shops and handling outliers.

## Decisions

### 1. Median over Mean for Price Aggregation

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

**Implementation**: `median()` function in `library.ts` extracts values and returns the middle value(s).

---

### 2. Independent Shop Clustering

**Decision**: Trades from shops within **16 blocks** of each other are considered from the **same source** and count as 1 independent data point.

**Rationale**:
- Prevents a single mega-shop with many trades from dominating price calculations
- 16 blocks is a reasonable proximity threshold for "same shop area"
- Ensures market prices reflect multiple independent sellers

**Implementation**: `countIndependentShops()` function clusters price locations using 3D Euclidean distance.

---

### 3. Core Block Trust Threshold

**Decision**: Core blocks (Netherite Ingot, Diamond Block, Emerald Block, Gold Block, Iron Block) require **≥3 independent shops** for their market data to be trusted.

**Rationale**:
- Core blocks are used as base items for ratio calculations (denominators)
- A single outlier trade on a core block would corrupt all ratios in that row/column
- With <3 sources, fall back to crafting value (ingot × 9)

**Example**:
- Diamond Block: 1 shop at 18.69 em → NOT trusted → use Diamond × 9 = 1134 em
- Gold Block: 5 shops at ~20 em → trusted → use market value 20.25 em

**Implementation**: `getBaseEmValue()` checks `hasEnoughIndependentData()` before using market prices.

---

### 4. Market Prices vs Fixed Ratios

**Decision**: **Market prices take priority** over fixed crafting ratios. Fixed ratios only fill gaps.

**Rationale**:
- Real trades reflect actual player economy and supply/demand
- Fixed ratios (block = 9 ingots) are theoretical minimums
- Market may value items differently due to convenience, rarity, or speculation

**Priority Order**:
1. Market median from direct emerald trades (if ≥3 independent shops for core blocks)
2. Transitive derivation through known intermediaries (iterative)
3. Block conversion value from ingot × 9 or block ÷ 9 (bidirectional fallback)
4. No value (`undefined`) — item is omitted from matrix and deviation calculations

---

### 5. Price Data Structure

**Decision**: Store prices as objects with location: `{ price, x, y, z }`

**Rationale**:
- Enables independent shop clustering
- Preserves provenance for debugging
- Backward compatible (old plain numbers handled gracefully)

**Schema**:
```typescript
interface PriceData {
  price: number;    // Emerald value per item
  x: number;        // Shop X coordinate
  y: number;        // Shop Y coordinate  
  z: number;        // Shop Z coordinate
}
```

---

### 6. Transitive Derivation with Snapshot-per-Iteration

**Decision**: `calculateItemValues()` uses iterative transitive expansion. Each iteration snapshots known keys before processing trades, so all trades in one pass see consistent state.

**Rationale**:
- Many items (e.g., Netherite Ingot) have no direct emerald trades — they're only priced via intermediaries like Diamond Block
- Without snapshotting, the first trade adding a value for an item would prevent subsequent trades from contributing, starving the trust filter for core blocks
- The snapshot ensures every trade in an iteration contributes data points, so core currencies accumulate enough independent shops (≥3) to pass the trust threshold

**Algorithm**:
```
Phase 1: Process all direct emerald trades
Phase 2: While changed and iterations < max:
  1. Snapshot knownKeys = set of items with entries
  2. For each trade:
     - If cost is known (in snapshot) and result is unknown → derive result value
     - If result is known and cost is unknown → derive cost value
  3. Set changed = true if any new values added
```

**Example**: Netherite Ingot priced via Diamond Block
1. Phase 1: Diamond Block gets emerald value from 3+ direct trades
2. Phase 2, Iteration 1: snapshot knows "diamond block" but not "netherite ingot"
   - All 15 "Diamond Block → Netherite Ingot" trades contribute buy values
   - Netherite Ingot now has 15 independent data points → passes trust filter

## Configuration Files

| File | Purpose |
|------|---------|
| `block_conversions.json` | Block ↔ ingot conversions (e.g., diamond block = 9 diamonds) |
| `core_currencies.json` | List of core blocks for ratio matrix |

These are loaded at runtime and can be modified without code changes.

## Consequences

### Positive
- Robust against price manipulation attempts
- Accurate market representation
- Clear fallback hierarchy

### Negative
- Requires ≥3 independent shops for trusted core block prices
- May show "no data" for rare items
