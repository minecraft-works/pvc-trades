/**
 * Price Deviation Calculator
 * 
 * Calculates how much a trade's price deviates from the median market price.
 * Uses caching to avoid repeated calculations for the same trade.
 * 
 * @module search/deviation
 */

import { DEVIATION } from '../constants.js';
import type { DeviationResult,ItemValues,PairPrices,Trade } from '../types.js';
import { getPairPrice, valueItemStack } from '../valuation/item-identity.js';
import { getTrustedItemValue, getTrustedPairPrice } from '../valuation/statistics.js';

// Re-export for backward compatibility
export type { DeviationResult } from '../types.js';

// ============================================================================
// Deviation Calculator
// ============================================================================

/**
 * Create a deviation calculator with internal caching.
 * 
 * A trade is compared with other trades for the same item paid in the same
 * currency when there is enough independent data; otherwise both sides are
 * converted to emeralds. Trades without trusted data get no deviation.
 * 
 * The calculator caches results per trade object. When item values change,
 * create a new calculator instance to reset the cache.
 * 
 * @param itemValues - The current item values for price lookups
 * @param pairPrices - Optional per-currency prices from calculatePairPrices
 * @returns Function to calculate deviation for a trade
 * 
 * @example
 * ```typescript
 * const getDeviation = createDeviationCalculator(itemValues, pairPrices);
 * const result = getDeviation(trade);
 * console.log(result?.text); // "+10%" or "−5%"
 * ```
 */
export function createDeviationCalculator(
    itemValues: Readonly<ItemValues> | undefined,
    pairPrices?: PairPrices
): (trade: Readonly<Trade>) => Readonly<DeviationResult> | undefined {
    // Internal cache for this calculator instance (also caches "no deviation")
    const cache = new Map<Trade, DeviationResult | undefined>();
    const getValue = (name: string): number | undefined =>
        itemValues ? getTrustedItemValue(name, itemValues) : undefined;

    /**
     * Price ratio against other trades for the same item paid in the same currency
     * @param trade - Trade to compare
     * @returns Actual / median price, or undefined without trusted same-currency data
     */
    function getSameCurrencyRatio(trade: Readonly<Trade>): number | undefined {
        if (!pairPrices) { return undefined; }
        const pair = getPairPrice(trade);
        if (!pair) { return undefined; }
        const expected = getTrustedPairPrice(pairPrices, pair.resultName, pair.costName);
        return expected ? pair.price / expected : undefined;
    }

    /**
     * Price ratio after converting both sides to emeralds
     * @param trade - Trade to compare
     * @returns Cost value / result value, or undefined if any side has no trusted value
     */
    function getEmeraldRatio(trade: Readonly<Trade>): number | undefined {
        // Total cost value (item1 + optional item2); shulker boxes count as their contents
        const item1Value = valueItemStack(trade.item1, getValue);
        if (item1Value === undefined) { return undefined; }
        let totalCostValue = item1Value;
        if (trade.item2) {
            const item2Value = valueItemStack(trade.item2, getValue);
            if (item2Value === undefined) { return undefined; }
            totalCostValue += item2Value;
        }

        const totalResultValue = valueItemStack(trade.resultItem, getValue);
        if (!totalResultValue) { return undefined; }
        return totalCostValue / totalResultValue;
    }

    function computeDeviation(trade: Readonly<Trade>): Readonly<DeviationResult> | undefined {
        // ratio > 1 means paying more than expected (bad deal)
        // ratio < 1 means paying less than expected (good deal)
        const sameCurrencyRatio = getSameCurrencyRatio(trade);
        const basis = sameCurrencyRatio === undefined ? 'emerald' : 'same-currency';
        const ratio = sameCurrencyRatio ?? getEmeraldRatio(trade);
        if (ratio === undefined) { return undefined; }

        const percent = Math.max(
            DEVIATION.MIN_PERCENT, 
            Math.min(DEVIATION.MAX_PERCENT, Math.round((ratio - 1) * 100))
        );

        if (percent === 0) {
            return { ratio, percent, basis, text: '0%', isGood: undefined };
        }
        const isGood = percent < 0;
        const text = percent > 0 ? `+${percent}%` : `−${Math.abs(percent)}%`;
        return { ratio, percent, text, isGood, basis };
    }

    return function getDeviation(trade: Readonly<Trade>): Readonly<DeviationResult> | undefined {
        // No item values means no deviation can be calculated
        if (!itemValues) { return undefined; }

        if (cache.has(trade)) {
            return cache.get(trade);
        }
        const result = computeDeviation(trade);
        cache.set(trade, result);
        return result;
    };
}
