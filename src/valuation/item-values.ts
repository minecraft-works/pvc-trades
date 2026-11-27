/**
 * Item Value Calculation
 *
 * Calculates emerald-equivalent values for all items using direct trades
 * and iterative transitive derivation. Currencies can be anchored to fixed
 * values from the currency graph (ADR-019), so every item priced in any
 * currency is valued at the same exchange rates the Rates tab shows.
 *
 * @module valuation/item-values
 */

import { formatName } from '../formatting.js';
import {
    blockConversionsStore,
    configStore,
} from '../stores/index.js';
import {
    type ItemValueEntry,
    type ItemValues,
    type NormalizeResult,
    type PairPrices,
    type PriceEntry,
    type TradeInput,
} from '../types.js';
import { getPairKey } from './item-identity.js';
import { countIndependentShops,getTrustedItemValue } from './statistics.js';

// ============================================================================
// Public API
// ============================================================================

/**
 * Calculate item values in emeralds using trades and transitive derivation.
 * Iteratively expands knowledge by using known values as intermediaries.
 *
 * @param trades - Array of processed trades
 * @param baseCurrency - Base currency name (usually 'Emerald')
 * @param anchors - Fixed values in the base currency for other currencies
 *                  (lowercase name → value); trades between anchored
 *                  currencies are left to the currency graph
 * @returns Map of item names to value entries with buy/sell prices
 *
 * @example
 * const values = calculateItemValues(trades, 'Emerald', new Map([['diamond', 144]]));
 * const sandValue = getTrustedItemValue('Sand', values);
 */
export function calculateItemValues(
    trades: readonly TradeInput[],
    baseCurrency: string,
    anchors: ReadonlyMap<string, number> = new Map()
): ItemValues {
    const config = configStore.get();
    const context: ValuationContext = { baseCurrency, anchors, values: new Map() };

    // Phase 1: Direct trades with base currency (including item2 trades)
    for (const trade of trades) {
        processDirectTrade(trade, context);
    }

    // Phase 2: Extend using known item values as intermediaries
    const applied = new Set<TradeInput>();
    let changed = true;
    let iterations = 0;

    while (changed && iterations < config.analysis.maxTransitiveIterations) {
        changed = false;
        iterations++;

        // Snapshot which items have well-covered buy/sell sides BEFORE this
        // iteration so all trades in one pass see consistent state. Without this,
        // the first trade adding a value for an item prevents subsequent trades
        // from contributing more data points, which starves core-block trust
        // filters. Tracked per side so an item with only sell data can still gain
        // buy data (and vice versa).
        const known = snapshotKnownSides(context.values, config.analysis.minIndependentShops);

        for (const trade of trades) {
            // Each trade contributes at most one derived price across all iterations
            if (!applied.has(trade) && deriveTransitiveValue(trade, context, known)) {
                applied.add(trade);
                changed = true;
            }
        }
    }

    return context.values;
}

/**
 * Collect per-unit prices for every (result, cost) pair of single-cost trades.
 * Price is the number of cost units paid per result unit.
 *
 * @param trades - Valuation inputs
 * @returns Prices grouped by pair key
 *
 * @example
 * const pairs = calculatePairPrices(inputs);
 * pairs.get(getPairKey('Hanging roots', 'Diamond')); // [{ price: 0.0156, x, y, z }, ...]
 */
export function calculatePairPrices(trades: readonly TradeInput[]): PairPrices {
    const pairs = new Map<string, PriceEntry[]>();
    for (const trade of trades) {
        if (trade.item2 || trade.resultAmount <= 0) { continue; }
        const key = getPairKey(trade.resultName, trade.item1Name);
        const prices = pairs.get(key) ?? [];
        prices.push(toPriceEntry(trade.costAmount / trade.resultAmount, trade));
        pairs.set(key, prices);
    }
    return pairs;
}

// ============================================================================
// Private Helpers
// ============================================================================

interface ValuationContext {
    readonly baseCurrency: string;
    readonly anchors: ReadonlyMap<string, number>;
    readonly values: Map<string, ItemValueEntry>;
}

/**
 * Express an amount in the base currency when the item is the base currency,
 * a block of it, or an anchored currency
 * @param itemName - Item name
 * @param amount - Number of units
 * @param context - Base currency and anchors
 * @returns Whether the item has a fixed value, and the amount in base units
 */
function normalizeToBaseCurrency(
    itemName: string,
    amount: number,
    context: ValuationContext
): NormalizeResult {
    const blockConversions = blockConversionsStore.get();
    const itemNorm = itemName.toLowerCase();
    const baseNorm = context.baseCurrency.toLowerCase();

    // Direct match
    if (itemNorm === baseNorm) {
        return { matches: true, amount };
    }

    const anchor = context.anchors.get(itemNorm);
    if (anchor !== undefined) {
        return { matches: true, amount: amount * anchor };
    }

    // Check if item is a block version of base currency
    const blockInfo = blockConversions[itemNorm];
    if (blockInfo?.base.toLowerCase() === baseNorm) {
        return { matches: true, amount: amount * blockInfo.multiplier };
    }

    // Check if base is a block and item is its single version
    const baseBlockInfo = blockConversions[baseNorm];
    if (baseBlockInfo?.base.toLowerCase() === itemNorm) {
        return { matches: true, amount: amount / baseBlockInfo.multiplier };
    }

    return { matches: false, amount };
}

/**
 * Value of one unit: fixed for the base currency and anchors, otherwise the trusted market value so far
 * @param itemName - Item name
 * @param context - Base currency, anchors and values so far
 * @returns Value in the base currency, or undefined
 */
function valueOf(itemName: string, context: ValuationContext): number | undefined {
    const fixed = normalizeToBaseCurrency(itemName, 1, context);
    return fixed.matches ? fixed.amount : getTrustedItemValue(itemName, context.values);
}

function toPriceEntry(price: number, source: TradeInput): PriceEntry {
    return { price, x: source.x, y: source.y, z: source.z, owner: source.owner };
}

function addValue(
    values: Map<string, ItemValueEntry>,
    item: string,
    price: number,
    type: 'buy' | 'sell',
    source: TradeInput
): void {
    const key = item.toLowerCase();
    let entry = values.get(key);
    if (!entry) {
        entry = { name: item, buyPrices: [], sellPrices: [] };
        values.set(key, entry);
    }
    const priceObject = toPriceEntry(price, source);
    if (type === 'buy') {
        entry.buyPrices.push(priceObject);
    } else {
        entry.sellPrices.push(priceObject);
    }
}

function processDirectTrade(trade: TradeInput, context: ValuationContext): void {
    // For trades with item2, we need different handling
    if (trade.item2) {
        return processDirectTradeWithItem2(trade, context);
    }

    const item1Name = trade.item1Name;
    const costAsBase = normalizeToBaseCurrency(item1Name, trade.costAmount, context);
    const resultAsBase = normalizeToBaseCurrency(trade.resultName, trade.resultAmount, context);

    if (costAsBase.matches === resultAsBase.matches) { return; }

    if (costAsBase.matches) {
        const pricePerItem = costAsBase.amount / trade.resultAmount;
        addValue(context.values, trade.resultName, pricePerItem, 'buy', trade);
    } else if (resultAsBase.matches) {
        const pricePerItem = resultAsBase.amount / trade.costAmount;
        addValue(context.values, item1Name, pricePerItem, 'sell', trade);
    }
}

function processDirectTradeWithItem2(trade: TradeInput, context: ValuationContext): void {
    if (!trade.item2) { return; }

    const item1Name = trade.item1Name;
    const item2Name = formatName(trade.item2);

    const item1AsBase = normalizeToBaseCurrency(item1Name, trade.costAmount, context);
    const item2AsBase = normalizeToBaseCurrency(item2Name, trade.item2.amount, context);
    const resultAsBase = normalizeToBaseCurrency(trade.resultName, trade.resultAmount, context);

    // Both inputs are base currency -> derive result value
    if (item1AsBase.matches && item2AsBase.matches && !resultAsBase.matches) {
        const totalCost = item1AsBase.amount + item2AsBase.amount;
        const pricePerItem = totalCost / trade.resultAmount;
        addValue(context.values, trade.resultName, pricePerItem, 'buy', trade);
    }
    // Result is base currency, both inputs are not -> can't derive individual values
}

function deriveTransitiveValue(
    trade: TradeInput,
    context: ValuationContext,
    known: KnownSides
): boolean {
    // For trades with item2, we need different handling
    if (trade.item2) {
        return deriveTransitiveValueWithItem2(trade, context, known);
    }

    const costIsBase = normalizeToBaseCurrency(trade.item1Name, 1, context).matches;
    const resultIsBase = normalizeToBaseCurrency(trade.resultName, 1, context).matches;
    if (costIsBase || resultIsBase) { return false; }

    for (const direction of getDerivationOrder(trade, known)) {
        const derived = direction === 'buy'
            ? deriveBuyPrice(trade, context)
            : deriveSellPrice(trade, context);
        if (derived) { return true; }
    }
    return false;
}

/**
 * Decide which price(s) a trade may derive, based on the start-of-iteration snapshot.
 * A trade yields one derived price, flowing from the better-covered item into the
 * less-covered one; deriving both ways would be circular.
 * @param trade - Trade to derive from
 * @param known - Snapshot of covered item sides
 * @returns Directions to try, in order of preference
 */
function getDerivationOrder(trade: TradeInput, known: KnownSides): readonly ('buy' | 'sell')[] {
    const costKey = trade.item1Name.toLowerCase();
    const resultKey = trade.resultName.toLowerCase();
    const canBuy = known.any.has(costKey) && !known.buy.has(resultKey);
    const canSell = known.any.has(resultKey) && !known.sell.has(costKey);

    if (canBuy && canSell) {
        const costCoverage = known.coverage.get(costKey) ?? 0;
        const resultCoverage = known.coverage.get(resultKey) ?? 0;
        return resultCoverage <= costCoverage ? ['buy', 'sell'] : ['sell', 'buy'];
    }
    if (canBuy) { return ['buy']; }
    if (canSell) { return ['sell']; }
    return [];
}

function deriveBuyPrice(trade: TradeInput, context: ValuationContext): boolean {
    const costValue = valueOf(trade.item1Name, context);
    if (costValue === undefined) { return false; }
    const pricePerResult = (trade.costAmount * costValue) / trade.resultAmount;
    addValue(context.values, trade.resultName, pricePerResult, 'buy', trade);
    return true;
}

function deriveSellPrice(trade: TradeInput, context: ValuationContext): boolean {
    const resultValue = valueOf(trade.resultName, context);
    if (resultValue === undefined) { return false; }
    const pricePerCost = (trade.resultAmount * resultValue) / trade.costAmount;
    addValue(context.values, trade.item1Name, pricePerCost, 'sell', trade);
    return true;
}

function deriveTransitiveValueWithItem2(
    trade: TradeInput,
    context: ValuationContext,
    known: KnownSides
): boolean {
    if (!trade.item2) { return false; }

    const item1Name = trade.item1Name;
    const item2Name = formatName(trade.item2);
    const resultKey = trade.resultName.toLowerCase();

    const item1IsBase = normalizeToBaseCurrency(item1Name, 1, context).matches;
    const item2IsBase = normalizeToBaseCurrency(item2Name, 1, context).matches;
    const resultIsBase = normalizeToBaseCurrency(trade.resultName, 1, context).matches;

    // If already handled in direct phase, skip
    if ((item1IsBase && item2IsBase) || resultIsBase) { return false; }
    if (known.buy.has(resultKey)) { return false; }

    const item1Value = valueOf(item1Name, context);
    const item2Value = valueOf(item2Name, context);

    // If we know both input values but the result's buy side was not yet covered
    if (item1Value !== undefined && item2Value !== undefined) {
        const totalCostValue = (trade.costAmount * item1Value) + (trade.item2.amount * item2Value);
        const pricePerResult = totalCostValue / trade.resultAmount;
        addValue(context.values, trade.resultName, pricePerResult, 'buy', trade);
        return true;
    }

    return false;
}

interface KnownSides {
    readonly any: ReadonlySet<string>;
    readonly buy: ReadonlySet<string>;
    readonly sell: ReadonlySet<string>;
    /** Independent shop count (buy + sell) per item, to rank how well-covered an item is */
    readonly coverage: ReadonlyMap<string, number>;
}

/**
 * Snapshot which items have a value, and which sides are already well covered.
 * A side counts as covered only once it has enough independent shops, so a
 * single stray price does not stop further trades from contributing.
 * @param values - Current item values
 * @param minShops - Independent shops needed for a side to count as covered
 * @returns Item keys that have any data, plus those with covered buy / sell sides
 */
function snapshotKnownSides(values: ReadonlyMap<string, ItemValueEntry>, minShops: number): KnownSides {
    const buy = new Set<string>();
    const sell = new Set<string>();
    const coverage = new Map<string, number>();
    for (const [key, entry] of values) {
        const buyShops = countIndependentShops(entry.buyPrices);
        const sellShops = countIndependentShops(entry.sellPrices);
        if (buyShops >= minShops) { buy.add(key); }
        if (sellShops >= minShops) { sell.add(key); }
        coverage.set(key, buyShops + sellShops);
    }
    return { any: new Set(values.keys()), buy, sell, coverage };
}
