/**
 * Price Deviation Calculator
 * 
 * Calculates how much a trade's price deviates from the median market price.
 * Uses caching to avoid repeated calculations for the same trade.
 * 
 * @module search/deviation
 */

import { DEVIATION } from '../constants.js';
import { formatName, getTrustedItemValue } from '../library.js';
import type { ItemValues,Trade } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a deviation calculation
 */
export interface DeviationResult {
    /** The ratio of actual price to expected price (>1 = paying more) */
    ratio: number;
    /** Percentage deviation, clamped to [-99, 999] for display */
    percent: number;
    /** Display text like "+10%" or "−5%" */
    text: string;
    /** True if good deal (negative deviation), false if bad, undefined if neutral */
    isGood: boolean | undefined;
}

// ============================================================================
// Deviation Calculator
// ============================================================================

/**
 * Create a deviation calculator with internal caching.
 * 
 * The calculator caches results per trade object. When item values change,
 * create a new calculator instance to reset the cache.
 * 
 * @param itemValues - The current item values for price lookups
 * @returns Function to calculate deviation for a trade
 * 
 * @example
 * ```typescript
 * const getDeviation = createDeviationCalculator(itemValues);
 * const result = getDeviation(trade);
 * console.log(result?.text); // "+10%" or "−5%"
 * ```
 */
export function createDeviationCalculator(
    itemValues: ItemValues | undefined
): (trade: Trade) => DeviationResult | undefined {
    // Internal cache for this calculator instance
    const cache = new Map<Trade, DeviationResult | undefined>();

    return function getDeviation(trade: Trade): DeviationResult | undefined {
        // Check cache first
        if (cache.has(trade)) {
            return cache.get(trade);
        }

        // No item values means no deviation can be calculated
        if (!itemValues) { 
            return undefined; 
        }

        // Get value of item1
        const item1Name = formatName(trade.item1);
        const item1Value = getTrustedItemValue(item1Name, itemValues);
        if (item1Value === undefined) { return undefined; }

        // Calculate total cost value (item1 + optional item2)
        let totalCostValue = item1Value * trade.item1.amount;
        if (trade.item2) {
            const item2Name = formatName(trade.item2);
            const item2Value = getTrustedItemValue(item2Name, itemValues);
            if (item2Value === undefined) { return undefined; }
            totalCostValue += item2Value * trade.item2.amount;
        }

        const resultValue = getTrustedItemValue(trade.resultName, itemValues);
        if (resultValue === undefined) { return undefined; }

        // Expected: how much output value per input value
        // Actual: total input value / total output value
        const totalResultValue = resultValue * trade.resultAmount;
        const actualRate = totalCostValue / totalResultValue;

        // ratio > 1 means paying more than expected (bad deal)
        // ratio < 1 means paying less than expected (good deal)
        const ratio = actualRate;
        const percent = Math.max(
            DEVIATION.MIN_PERCENT, 
            Math.min(DEVIATION.MAX_PERCENT, Math.round((ratio - 1) * 100))
        );

        // Build result
        let result: DeviationResult;
        if (percent === 0) {
            result = { ratio, percent, text: '0%', isGood: undefined };
        } else {
            const isGood = percent < 0;
            const text = percent > 0 ? `+${percent}%` : `−${Math.abs(percent)}%`;
            result = { ratio, percent, text, isGood };
        }

        cache.set(trade, result);
        return result;
    };
}
