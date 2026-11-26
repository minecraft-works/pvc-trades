/**
 * Item Value Calculation
 *
 * Calculates emerald-equivalent values for all items using direct trades
 * and iterative transitive derivation.
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
 * @returns Map of item names to value entries with buy/sell prices
 *
 * @example
 * const values = calculateItemValues(trades, 'Emerald');
 * const diamondValue = getTrustedItemValue('Diamond', values);
 */
export function calculateItemValues(trades: readonly TradeInput[], baseCurrency: string): ItemValues {
    const config = configStore.get();
    const values = new Map<string, ItemValueEntry>();

    // Phase 1: Direct trades with base currency (including item2 trades)
    for (const trade of trades) {
        processDirectTrade(trade, baseCurrency, values);
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
        const known = snapshotKnownSides(values, config.analysis.minIndependentShops);

        for (const trade of trades) {
            // Each trade contributes at most one derived price across all iterations
            if (!applied.has(trade) && deriveTransitiveValue(trade, baseCurrency, values, known)) {
                applied.add(trade);
                changed = true;
            }
        }
    }

    return values;
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
        prices.push({ price: trade.costAmount / trade.resultAmount, x: trade.x, y: trade.y, z: trade.z });
        pairs.set(key, prices);
    }
    return pairs;
}

// ============================================================================
// Private Helpers
// ============================================================================

function normalizeToBaseCurrency(
    itemName: string,
    amount: number,
    baseCurrency: string
): NormalizeResult {
    const blockConversions = blockConversionsStore.get();
    const itemNorm = itemName.toLowerCase();
    const baseNorm = baseCurrency.toLowerCase();

    // Direct match
    if (itemNorm === baseNorm) {
        return { matches: true, amount };
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

function addValue(
    values: Map<string, ItemValueEntry>,
    item: string,
    price: number,
    type: 'buy' | 'sell',
    x: number,
    y: number,
    z: number
): void {
    const key = item.toLowerCase();
    let entry = values.get(key);
    if (!entry) {
        entry = { name: item, buyPrices: [], sellPrices: [] };
        values.set(key, entry);
    }
    const priceObject: PriceEntry = { price, x, y, z };
    if (type === 'buy') {
        entry.buyPrices.push(priceObject);
    } else {
        entry.sellPrices.push(priceObject);
    }
}

function processDirectTrade(
    trade: TradeInput,
    baseCurrency: string,
    values: Map<string, ItemValueEntry>
): void {
    // For trades with item2, we need different handling
    if (trade.item2) {
        return processDirectTradeWithItem2(trade, baseCurrency, values);
    }

    const item1Name = trade.item1Name;
    const costAsBase = normalizeToBaseCurrency(item1Name, trade.costAmount, baseCurrency);
    const resultAsBase = normalizeToBaseCurrency(trade.resultName, trade.resultAmount, baseCurrency);

    if (costAsBase.matches === resultAsBase.matches) { return; }

    if (costAsBase.matches) {
        const pricePerItem = costAsBase.amount / trade.resultAmount;
        addValue(values, trade.resultName, pricePerItem, 'buy', trade.x, trade.y, trade.z);
    } else if (resultAsBase.matches) {
        const pricePerItem = resultAsBase.amount / trade.costAmount;
        addValue(values, item1Name, pricePerItem, 'sell', trade.x, trade.y, trade.z);
    }
}

function processDirectTradeWithItem2(
    trade: TradeInput,
    baseCurrency: string,
    values: Map<string, ItemValueEntry>
): void {
    if (!trade.item2) { return; }

    const item1Name = trade.item1Name;
    const item2Name = formatName(trade.item2);

    const item1AsBase = normalizeToBaseCurrency(item1Name, trade.costAmount, baseCurrency);
    const item2AsBase = normalizeToBaseCurrency(item2Name, trade.item2.amount, baseCurrency);
    const resultAsBase = normalizeToBaseCurrency(trade.resultName, trade.resultAmount, baseCurrency);

    // Both inputs are base currency -> derive result value
    if (item1AsBase.matches && item2AsBase.matches && !resultAsBase.matches) {
        const totalCost = item1AsBase.amount + item2AsBase.amount;
        const pricePerItem = totalCost / trade.resultAmount;
        addValue(values, trade.resultName, pricePerItem, 'buy', trade.x, trade.y, trade.z);
    }
    // Result is base currency, both inputs are not -> can't derive individual values
}

function deriveTransitiveValue(
    trade: TradeInput,
    baseCurrency: string,
    values: Map<string, ItemValueEntry>,
    known: KnownSides
): boolean {
    // For trades with item2, we need different handling
    if (trade.item2) {
        return deriveTransitiveValueWithItem2(trade, baseCurrency, values, known);
    }

    const costIsBase = normalizeToBaseCurrency(trade.item1Name, 1, baseCurrency).matches;
    const resultIsBase = normalizeToBaseCurrency(trade.resultName, 1, baseCurrency).matches;
    if (costIsBase || resultIsBase) { return false; }

    for (const direction of getDerivationOrder(trade, known)) {
        const derived = direction === 'buy'
            ? deriveBuyPrice(trade, values)
            : deriveSellPrice(trade, values);
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

function deriveBuyPrice(trade: TradeInput, values: Map<string, ItemValueEntry>): boolean {
    const costValue = getTrustedItemValue(trade.item1Name, values);
    if (costValue === undefined) { return false; }
    const pricePerResult = (trade.costAmount * costValue) / trade.resultAmount;
    addValue(values, trade.resultName, pricePerResult, 'buy', trade.x, trade.y, trade.z);
    return true;
}

function deriveSellPrice(trade: TradeInput, values: Map<string, ItemValueEntry>): boolean {
    const resultValue = getTrustedItemValue(trade.resultName, values);
    if (resultValue === undefined) { return false; }
    const pricePerCost = (trade.resultAmount * resultValue) / trade.costAmount;
    addValue(values, trade.item1Name, pricePerCost, 'sell', trade.x, trade.y, trade.z);
    return true;
}

function deriveTransitiveValueWithItem2(
    trade: TradeInput,
    baseCurrency: string,
    values: Map<string, ItemValueEntry>,
    known: KnownSides
): boolean {
    if (!trade.item2) { return false; }

    const item1Name = trade.item1Name;
    const item2Name = formatName(trade.item2);
    const resultKey = trade.resultName.toLowerCase();

    const item1IsBase = normalizeToBaseCurrency(item1Name, 1, baseCurrency).matches;
    const item2IsBase = normalizeToBaseCurrency(item2Name, 1, baseCurrency).matches;
    const resultIsBase = normalizeToBaseCurrency(trade.resultName, 1, baseCurrency).matches;

    // If already handled in direct phase, skip
    if ((item1IsBase && item2IsBase) || resultIsBase) { return false; }
    if (known.buy.has(resultKey)) { return false; }

    const item1Value = getTrustedItemValue(item1Name, values);
    const item2Value = getTrustedItemValue(item2Name, values);

    // If we know both input values but the result's buy side was not yet covered
    if (item1Value !== undefined && item2Value !== undefined) {
        const totalCostValue = (trade.costAmount * item1Value) + (trade.item2.amount * item2Value);
        const pricePerResult = totalCostValue / trade.resultAmount;
        addValue(values, trade.resultName, pricePerResult, 'buy', trade.x, trade.y, trade.z);
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

