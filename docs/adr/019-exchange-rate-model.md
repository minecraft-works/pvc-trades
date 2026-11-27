# ADR-019: One Exchange-Rate Model

## Status
**Proposed** - 2026-11. Would amend [ADR-001](001-price-aggregation-design.md) (decision 4, "market prices vs fixed ratios") and [ADR-018](018-trade-deviation-model.md) (decision 3, same-currency comparison).

## Context

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

## Decision (proposed)

One model in `src/valuation/`, read by every feature.

### 1. Canonical units: fixed, reversible crafting always wins

- A conversion that crafts both ways (block ↔ 9 base) means block and base are **the same currency**. Every quantity is converted to base units **once**, when the valuation input is built (`toValuationInput` / `getPairPrice`), on both the cost and the result side. Pair keys, medians, flips and rates only ever see base units.
- One-way or lossy recipes (quartz block = 4 quartz, which cannot be uncrafted) are **not** merged. `block_conversions.json` gets a `reversible` flag (default `true`; `false` for quartz).
- Market prices *between* a block and its base are ignored, because crafting is free.

### 2. One market book

`calculatePairPrices` and the buy/sell arrays of `calculateItemValues` are replaced by one `MarketBook`. For each ordered pair `(item, currency)` in base units, it holds observations: per-unit price, location, owner and in stock.

- **Ask** of X in C: shops that sell X for C.
- **Bid** of X in C: shops that buy X for C (price = C received per X).
- **Trust:** one rule for every consumer, applied per side. A side needs ≥ `minIndependentShopsPerItem` independent shops, or ≥ `minIndependentShops` for core currencies (`countIndependentShops`, ADR-001 clustering). The side's value is the median.
- **Sold-out trades:** see open question A.

### 3. Currency graph

Nodes are the base core currencies: Emerald, Diamond, Netherite ingot, Gold ingot and Iron ingot. Edges are direct quotes from the market book (ask and bid). When a direct side is missing or untrusted, a path is composed through other currencies:

- an **ask chain multiplies asks**, and a **bid chain multiplies bids**. So **bid ≤ ask holds by construction** whenever each edge has bid ≤ ask;
- the shortest path wins, with ties going to the most evidence (the smallest shop count along the path);
- a crossed direct edge (bid > ask) is not used as a rate. It is listed as a flip.

The **mid rate** is `√(bid × ask)`. It is used wherever one number is needed: ranking flips by value and converting values.

### 4. Consumers

| Feature | Reads |
|---------|-------|
| Rates tab and converter | Currency graph: Buy = ask, Sell = bid |
| Deal % | Same-currency market (base units), then the cross-currency fallback (open question B) |
| Flips | Market book pairs in base units, so "buy for 9 Diamond, sell for 1 Diamond block" pairs up. Profit uses the mid rate in emeralds. |
| Emerald values (`getTrustedItemValue`) | The item's best-backed quote, converted with the mid rate. This replaces the iterative emerald-only derivation. |

### 5. Presentation

- Show the more valuable item first, so the amount is always ≥ 1. Never show "0.06 Netherite".
- Use whole blocks where it reads better: if the amount is ≥ 9 base units and the currency has a reversible block, show blocks. Examples: "1 Netherite ingot = 16 / 8 Diamond block" and "1 Diamond = 16 Emerald block".
- Rounding: whole numbers from 10 up, and two significant digits below 10 (5.2). Snap to a whole number when within 2%.
- The converter accepts any amount and uses the same formatting. A rate composed through a path is marked "≈" and the tooltip shows the path.

## Open questions for the user

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| A | Do sold-out trades count towards market prices? | (1) Count them, as today. (2) In stock only. (3) Count them only towards trust, not the median. | **(2)**. The table hides sold-out trades and they can't be acted on. Without timestamps, stale ones can't be aged out. Cost: 126 trades lose their Deal %. |
| B | How should Deal % work without a same-currency market (≈ 650 in-stock trades after the merge)? | (1) Emerald fallback via the exchange rate, as today. (2) Convert with the price level of goods. (3) Show "—" and put the other currency's typical price in the tooltip. (4) Show a value marked "≈" that is excluded from the Deals filter and the dashboard. | **(4)**, converted with the exchange rate. The verdict stays visible but no longer creates 339 shaky "deals". |
| C | Should custom currencies (Bb coin, Playtime certificate…) become graph nodes once they have trusted quotes against a core currency? | Yes / later | Later. |

## Expected effect (live data, in-stock trades, Deal %)

| Variant | Trades judged | Deal % changed (≥ 5 pts) | Same-currency basis | ≤ −20% | ≥ +300% |
|---------|---------------|--------------------------|---------------------|--------|---------|
| Today | 3,207 | — | 2,198 | 755 | 254 |
| Merge block → base | 3,207 | 844 | 2,561 | 780 | 250 |
| Merge + in stock only | 3,081 | 1,463 | 2,375 | 816 | 231 |

The Rates tab changes from "1 Netherite ingot = 17.2 / 8.8 Diamond block, 1 Diamond = 8 / 18.3 Gold block" to "16 / 8 Diamond block, 23 / 8 Gold block" (all trades; with in-stock trades only, the Gold rate is 24 / 6). Sell ≤ Buy then holds for every pair.

## Alternatives considered

| Alternative | Why not |
|-------------|---------|
| Keep the market price for blocks and fall back to crafting (ADR-001 §4) | Block markets are thin and noisy (see finding 2), and the crafting conversion is free both ways |
| Fix only the formula in `buildExchangeMatrix` (`buy(A) / sell(B)`) | Fixes Sell > Buy, but still routes through emeralds: 17.2 instead of 16, and it does not help Deal % or flips |
| Derive one emerald value for everything, including currencies, from goods | Gives a wrong converter for real currency exchanges (≈ 41 vs 144 em/diamond) |
| Weight medians by lot size | The bulk discount is real; that is a separate question |

## Consequences

**Positive**
- One rule for units, one for trust and one for sold-out trades, so block and base give the same Deal %.
- Sell ≤ Buy by construction, and rates follow the direct markets.
- Flips across block and base become visible.

**Negative**
- Deal % changes for about 850–1,450 in-stock trades. The snapshot baseline key must be versioned again (as in ADR-018 §4), or the dashboard reports false price drops.
- Rewrites `item-values.ts`, `ratio-graph.ts` and part of `statistics.ts`. Their existing unit tests must be revisited.

## Implementation plan (after approval)

1. Canonical units in `item-identity.ts`, plus the `reversible` flag in `block_conversions.json` and its Zod schema.
2. `MarketBook` and per-side quotes (`valuation/market-book.ts`).
3. Currency graph with ask/bid chains (`valuation/currency-graph.ts`), replacing `ratio-graph.ts`.
4. Switch Deal %, Rates and flips over, then version the snapshot key.
5. Unit tests:
   - block and base give the same Deal %;
   - bid ≤ ask on composed paths;
   - transitive rates;
   - reversible conversions win and quartz is not merged.
6. Before/after report on live data, including the Rates table.
