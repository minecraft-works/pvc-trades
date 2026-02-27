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
    type PriceEntry,
    type TradeInput,
} from '../types.js';
import { getTrustedItemValue } from './statistics.js';

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
    let changed = true;
    let iterations = 0;

    while (changed && iterations < config.analysis.maxTransitiveIterations) {
        changed = false;
        iterations++;

        // Snapshot which items have entries BEFORE this iteration so all trades
        // in one pass see consistent state. Without this, the first trade adding
        // a value for an item prevents subsequent trades from contributing more
        // data points, which starves core-block trust filters.
        const knownKeys = new Set(values.keys());

        for (const trade of trades) {
            if (deriveTransitiveValue(trade, baseCurrency, values, knownKeys)) {
                changed = true;
            }
        }
    }

    return values;
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

// eslint-disable-next-line max-params
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
    knownKeys: ReadonlySet<string>
): boolean {
    // For trades with item2, we need different handling
    if (trade.item2) {
        return deriveTransitiveValueWithItem2(trade, baseCurrency, values, knownKeys);
    }

    const item1Name = trade.item1Name;
    const costKey = item1Name.toLowerCase();
    const resultKey = trade.resultName.toLowerCase();

    const costIsBase = normalizeToBaseCurrency(item1Name, 1, baseCurrency).matches;
    const resultIsBase = normalizeToBaseCurrency(trade.resultName, 1, baseCurrency).matches;
    if (costIsBase || resultIsBase) { return false; }

    // Use the snapshot to decide which direction to derive. This ensures all
    // trades in one iteration contribute values for newly-discovered items,
    // so core blocks can accumulate enough independent shops to pass trust filters.
    const costKnown = knownKeys.has(costKey);
    const resultKnown = knownKeys.has(resultKey);
    let changed = false;

    if (costKnown && !resultKnown) {
        const costValue = getTrustedItemValue(item1Name, values);
        if (costValue !== undefined) {
            const pricePerResult = (trade.costAmount * costValue) / trade.resultAmount;
            addValue(values, trade.resultName, pricePerResult, 'buy', trade.x, trade.y, trade.z);
            changed = true;
        }
    }

    if (resultKnown && !costKnown) {
        const resultValue = getTrustedItemValue(trade.resultName, values);
        if (resultValue !== undefined) {
            const pricePerCost = (trade.resultAmount * resultValue) / trade.costAmount;
            addValue(values, item1Name, pricePerCost, 'sell', trade.x, trade.y, trade.z);
            changed = true;
        }
    }

    return changed;
}

function deriveTransitiveValueWithItem2(
    trade: TradeInput,
    baseCurrency: string,
    values: Map<string, ItemValueEntry>,
    knownKeys: ReadonlySet<string>
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

    const item1Value = getTrustedItemValue(item1Name, values);
    const item2Value = getTrustedItemValue(item2Name, values);
    const resultKnown = knownKeys.has(resultKey);

    // If we know both input values but result was unknown at start of iteration
    if (item1Value !== undefined && item2Value !== undefined && !resultKnown) {
        const totalCostValue = (trade.costAmount * item1Value) + (trade.item2.amount * item2Value);
        const pricePerResult = totalCostValue / trade.resultAmount;
        addValue(values, trade.resultName, pricePerResult, 'buy', trade.x, trade.y, trade.z);
        return true;
    }

    return false;
}
