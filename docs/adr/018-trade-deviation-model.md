# ADR-018: Trade Deviation Model (Item Identity and Same-Currency Comparison)

## Status
**Implemented** - 2026-11. Extends [ADR-001](001-price-aggregation-design.md).

## Context

The **Deal** column (deviation) is the default sort and the main reason to use the app. A review of live data (6,748 trades, 4,702 in stock) found that most of the column was misleading:

| Symptom | Share of judged trades | Cause |
|---------|------------------------|-------|
| `0%` | 35% | A single listing set the "market price" for any non-core item, so it was compared with itself |
| `≥ +300%` | 18% | Variants shared one price (plain vs enchanted gear, all enchanted books, all potions); diamond-priced goods were compared with emerald-priced goods |
| `≤ −90%` | first 104 rows of the default view | Filled shulker boxes used as payment were valued as empty boxes |

Two facts about the data shape the design:

1. **Variants are often missing from the data.** Potions have no effect, written books no content, and enchanted books have an empty `enchant` (stored enchantments are not exported). Enchanted gear *does* carry `enchant`.
2. **The server runs two inconsistent currencies.** Direct trades put 1 Diamond at ~144 emeralds (16 emerald blocks), but goods priced in diamonds imply a much lower rate. Of 482 remaining `≥ +300%` trades, 258 were paid in diamonds.

## Decisions

### 1. Item identity (`src/valuation/item-identity.ts`)

- Enchanted items get their own price key: `Diamond pickaxe [efficiency 5, unbreaking 3]` (sorted, normalized).
- Unidentifiable types (potions, tipped arrows, written/enchanted books, suspicious stew, maps, goat horns, fish/axolotl buckets) **cannot be priced** unless they have a custom name or enchantments.
- Filled shulker boxes are valued by their **contents** (× number of boxes), on both cost and result side. Mixed-content boxes are skipped for price *derivation* but still valued (sum of contents) when judging a trade.

### 2. Minimum evidence for every item

Non-core items need **≥ 2 independent shops** (`analysis.minIndependentShopsPerItem`, default 2) before they get a market price. Core blocks keep the ≥ 3 rule from ADR-001. Without enough evidence the Deal cell shows **"—"** instead of a fake `0%`.

### 3. Compare in the same currency first

A single-cost trade is first compared with the **median per-unit price of the same item paid in the same currency** (e.g. hanging roots bought with diamonds), when that pair has enough independent shops. Only otherwise are both sides converted to emeralds (the ADR-001 model). The cell tooltip states which basis was used.

### 4. Reset dashboard baselines

Deviation snapshots from the old model are not comparable, so the snapshot storage key is versioned (`shop-trades-snapshot-dev2`) and the legacy key is removed on load. Otherwise the first visit would report false "price drops".

## Results (same live dataset)

| Metric | Before | After |
|--------|--------|-------|
| Rows ≤ −90% | 104 | 61 |
| Rows ≥ +300% | 852 | 258 |
| 90th percentile deviation | +653% | +175% |

## Consequences

### Positive
- The default "best deals" view surfaces plausible deals instead of artefacts
- Each judgement is explainable via the cell tooltip
- Trades that cannot be judged are clearly marked instead of hidden behind `0%`

### Negative
- Fewer trades get a deviation (≈ 3,300 of 4,700 in stock), because single-shop items and unidentifiable items are no longer judged
- The remaining cross-currency (emerald fallback) judgements still inherit the diamond/emerald inconsistency; they are now the minority

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| Exclude diamond-priced trades | Hides a large part of the market |
| Derive the diamond rate from goods instead of direct trades | Changes the exchange-rate matrix, which correctly reflects direct currency trades |
| Require 3 shops for all items | Leaves too few judged trades |
