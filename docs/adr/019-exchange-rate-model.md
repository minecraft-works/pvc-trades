# ADR-019: One Exchange-Rate Model

## Status
**Implemented** - 2026-11. Supersedes [ADR-001](001-price-aggregation-design.md) decision 4 ("market prices vs fixed ratios") and amends [ADR-018](018-trade-deviation-model.md) decision 3 (same-currency comparison).

## Context (before this ADR)

Prices are compared in three places, and each place has its own rules:

| Feature | How it gets a rate | Trust rule | Sold-out trades |
|---------|--------------------|------------|-----------------|
| Deal % (`search/deviation.ts`) | Median of the same `result\|cost` pair, else both sides in emeralds (`getTrustedItemValue`) | ≥ 2 shops (≥ 3 for core) across both sides | Counted |
| 💱 Rates and converter (`valuation/ratio-graph.ts`) | Emerald value per side, then `valueA / valueB` on the same side | ≥ 3 shops on that side, defer to a 2× better-backed block/base partner | Counted |
| Flips (`valuation/flips.ts`) | Exact `result\|cost` pair; profit in emeralds via `getTrustedItemValue` | None | Ignored |

The emerald values come from `calculateItemValues`, which spreads prices through other items one step at a time. The `fix/netherite-rates` work (per-side trust, deferring blocks to a better-backed base) was merged in #194. It reduced the symptoms in the Rates tab, but the issues below remain.

### Findings on live data

Snapshot of 2026-11-27: 1,167 shops, 6,774 trades, 4,686 in stock and 2,088 sold out.

**1. A block and its base are different currencies.** Pair keys use the raw name, so "Diamond" and "Diamond block" form separate markets. There are **468 item pairs (2,672 trades)** priced in both a block and its base. In the gunpowder example, 1,728 gunpowder for 9 Diamond shows **−10%**, while 1,728 for 1 Diamond block shows **0%**. The diamond group's median (10) includes a sold-out offer at 10 diamonds.

**2. Market prices for blocks are worse than the crafting ratio.** The emerald value of a Diamond block from its own trades is 380 (buy, 3 shops) and 1,426 (sell, 5 shops), while 9 × Diamond = 1,296. Per item, the price in blocks divided by the price in base units has a median of 0.90 for diamond blocks (IQR 0.67–1.5) and 1.56 for emerald blocks (IQR 0.94–3.5). The spread is wide and there is no consistent premium in either direction.

**3. Sell is above Buy in the Rates table.** In 9 of 15 core pairs, Sell is above Buy. For example, 1 Diamond = Buy 8 / Sell 18.3 Gold blocks. `buildExchangeMatrix` divides A's *buy* value by B's *buy* value. Buying A with B actually means selling B and buying A, so the rate is `buy(A) / sell(B)`. The direct market for that pair says 1 Diamond = Buy 23 / Sell 8 Gold blocks.

**4. Direct currency markets exist and are consistent.** All rates below use base units; for each pair, the second line shows only in-stock trades:

| Pair | Buy | Sell | Shops (buy / sell) |
|------|-----|------|--------------------|
| 1 Netherite ingot in Diamond | 144 | 72 | 16 / 11 |
| ↳ in stock | 144 | 72 | 6 / 7 |
| 1 Diamond in Emerald | 144 | 144 | 18 / 24 |
| ↳ in stock | 171 | 144 | 11 / 18 |
| 1 Diamond in Gold ingot | 207 | 72 | 4 / 6 |

The current table routes everything through emeralds and shows 1 Netherite ingot = 17.2 / 8.8 Diamond blocks instead of 16 / 8. In every direct base pair that is in stock, Sell ≤ Buy. A crossed market would be a flip.

**5. The two economies make cross-currency judgements unreliable.** There are 142 items with trusted prices in both emeralds and diamonds. Their prices imply **≈ 41 emeralds per diamond**, while the direct exchange rate is 144. When an item's diamond price is predicted from its emerald price, the typical error is:

| Conversion rate | Median error | 75th percentile |
|-----------------|--------------|-----------------|
| Exchange rate (144) | ×3.5 | ×11.8 |
| Price level of goods (≈ 41) | ×2.5 | ×4.7 |

On the same trade, the emerald basis and the same-currency basis give opposite verdicts 607 times. Yet the emerald fallback produces **339 of the 755** in-stock "≥ 20% below market" deals, and 121 of the 254 "≥ +300%" trades.

**6. Mixed lot sizes.** 374 of 1,007 multi-trade pairs mix lot sizes at least 10× apart, for example 64 gunpowder versus 1,728. The bulk discount is real, so 64 for 1 Diamond (+200%) is a fair verdict. This ADR keeps that behaviour.

**7. There are no timestamps.** The feed has `shopName, shopOwner, location, world, recipes`, and recipes have only `resultItem, item1, item2, stock`. Stale sold-out trades cannot be aged out from the feed.

## Decision

One model in `src/valuation/`, built once per data refresh by `buildValuation()` and read by every feature.

### 1. Base units: reversible crafting always wins

- A block that crafts back into its base (block ↔ 9 base) **is** its base. `toBaseUnit()` converts every item stack once, in `getItemComponents()`, so pair keys, medians, flips and rates only ever see base units. A shulker box with "28 Emerald + 4 Emerald block" is 64 Emerald.
- One-way recipes are not merged. `block_conversions.json` has a `reversible` flag (default `true`; `false` for the quartz block).
- Market prices *between* a block and its base are ignored, because crafting is free.

### 2. One market, in-stock trades only

- `calculatePairPrices()` (per-unit prices per `result|cost` pair, in base units) is the single market. **Only in-stock trades count**, everywhere. The table hides sold-out trades, nobody can act on them, and without timestamps stale ones cannot be aged out.
- Trust uses one rule: ≥ `minIndependentShopsPerItem` independent shops (ADR-001 clustering), or ≥ `minIndependentShops` when core currencies are involved. Core currencies are recognised in base units too, so "Gold ingot" is core because "Gold Block" is.

### 3. Currency graph (`currency-graph.ts`)

- **Nodes** are the core currencies in base units (Netherite ingot, Diamond, Emerald, Gold ingot, Iron ingot). Other items also count when they pay for **≥ 5 different goods at ≥ 3 independent shops**: on live data, Bb coin, Playtime certificate and Inactivity ticket. Nodes without a single trusted market are left out.
- **Buy** of A in B is the median price of shops selling A for B. **Sell** is the median of what shops pay in B for A. Each side needs enough independent shops on its own.
- When a side has no trusted direct market, it is composed along the **shortest chain** of markets, at most 3. Ties go to the best-backed weakest link. Buy multiplies buy rates and sell multiplies sell rates. The rate is marked "≈" and the tooltip names the currencies passed through.
- **Sell ≤ Buy always.** If the two sides cross, which is possible when they come from different shops or paths, both show the mid rate `√(buy × sell)` and the tooltip says so. The crossing itself shows up as a flip.
- The **mid rate** anchors currencies in emeralds. `calculateItemValues()` treats anchored currencies like emeralds, so every good priced in any currency is valued at the rates the Rates tab shows.

### 4. Consumers

| Feature | Reads |
|---------|-------|
| Rates tab and converter | `presentRate()`: Buy and Sell from the currency graph; custom currencies in their own table; the converter offers every currency and its block |
| Deal % | Same item in the same currency (base units) first. Otherwise an **estimate**: both sides in emeralds at graph rates, shown as "≈−40%" in lighter italics with a tooltip saying so |
| Deals filter, watchlist alerts, deals badge, dashboard and snapshot baseline | Same-currency judgements only (`confidentOnly()`); estimates never trigger them |
| Sort by Deal | Estimates come after same-currency judgements, in either direction |
| Flips | Pairs in base units, so "buy for 1 Diamond block, sell for 12 Diamond" pairs up. Profit is counted in a currency rather than a good, in blocks when that reads better. Each leg is shown as its shop lists it. |

### 5. Presentation (`rate-presentation.ts`)

- The more valuable currency comes first, so amounts are ≥ 1.
- Blocks are used when the amount is ≥ 64 base units, or when every amount is a whole number of blocks. So "1 Netherite ingot = 16 / 8 Diamond block", while "13 Emerald" stays in emeralds.
- Rounding: whole numbers from 10 up, two significant digits below 10, and snap to a whole number when within 2%.

### Not changed

- **Lot sizes:** the bulk discount is real, so "64 for 1 Diamond" against "1,728 for 9 Diamond" is still +200%.
- `calculateItemValues()` keeps its transitive derivation for goods; only its anchors changed.

## Results (live data, 2026-11-27, in-stock trades)

| Metric | Before | After |
|--------|--------|-------|
| Trades judged | 3,207 | 3,081 (2,348 same-currency, 733 estimates "≈") |
| Deal % changed | — | 1,575 trades (1,465 by ≥ 5 points); median change 35 points |
| Deals ≤ −75% (Deals filter) | 206 | 136 |
| Deals ≤ −20% | 755 | 589 |
| ≥ +300% (incl. estimates) | 254 | 237 |
| Flips | 136 | 172 (109 in Emerald, 61 in Diamond; 36 pair a block leg with a base leg) |

Gunpowder: 1,728 for 9 Diamond goes from −10% to **0%**, the same as 1,728 for 1 Diamond block.

| Rates tab | Before | After |
|-----------|--------|-------|
| 1 Netherite ingot | 17.2 / 8.8 Diamond block | 16 / 8 Diamond block |
| 1 Diamond | 16 / 16 Emerald block | 19 / 16 Emerald block |
| 1 Gold | 2 / 0.88 Emerald block (per block) | ≈ 3.2 / 0.67 Emerald (per ingot, via Diamond) |
| Emerald ↔ Iron | 1 Emerald block = 1 / 6.75 Iron block (sell > buy) | 1 Emerald = — / 1 Iron ingot |
| Other currencies | — | 1 Diamond = 8 / 8 Bb coin; 1 Playtime certificate = 32 / 16 Diamond block; 1 Inactivity ticket = — / 2 Diamond |

## Alternatives considered

| Alternative | Why not |
|-------------|---------|
| Keep the market price for blocks and fall back to crafting (ADR-001 §4) | Block markets are thin and noisy (finding 2), and crafting is free both ways |
| Fix only the matrix formula (`buy(A) / sell(B)`) | Fixes Sell > Buy, but still routes through emeralds (17.2 instead of 16) and does not help Deal % or flips |
| Convert estimates at the price level of goods (≈ 41 em/diamond) | Better than the exchange rate (×2.5 vs ×3.5 typical error) but still too weak to count as a deal, and it would need a second, unexplained rate |
| Hide cross-currency Deal % ("—") | Loses useful orientation; marking it "≈" and excluding it from deals keeps it visible without harm |
| Count sold-out trades, or only for trust | They cannot be acted on and cannot be aged out without timestamps |
| Weight medians by lot size | The bulk discount is real; that is a separate question |

## Consequences

**Positive**
- One rule each for units, trust and sold-out trades, so block and base give the same Deal %.
- Sell ≤ Buy in every rate, and rates follow the direct markets.
- Deals, alerts and the dashboard rely only on same-currency comparisons.
- Flips across block and base become visible, counted in real currencies.

**Negative**
- 126 in-stock trades lose their Deal % because their market existed only in sold-out trades.
- The snapshot baseline key moved to `shop-trades-snapshot-dev4`, so the dashboard starts a new baseline once.
- `ratio-graph.ts` (`buildRatioGraph`, `buildExchangeMatrix`) and `hasEnoughIndependentData` were removed.