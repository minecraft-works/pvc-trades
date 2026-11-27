/**
 * Price Deviation Calculator
 * 
 * Calculates how much a trade's price deviates from the median market price.
 * Uses caching to avoid repeated calculations for the same trade.
 * 
 * @module search/deviation
 */

import { DEVIATION } from '../constants.js';
import type { DeviationResult,Trade } from '../types.js';
import { getPairPrice, valueItemStack } from '../valuation/item-identity.js';
import { getTrustedPairPrice } from '../valuation/statistics.js';
import type { Valuation } from '../valuation/valuation.js';

// Re-export for backward compatibility
export type { DeviationResult } from '../types.js';

/** What the deviation calculator reads from a {@link Valuation} */
export type DeviationInput = Pick<Valuation, 'pairPrices' | 'getValue'>;

// ============================================================================
// Deviation Calculator
// ============================================================================

/**
 * Create a deviation calculator with internal caching.
 * 
 * A trade is compared with other trades for the same item paid in the same
 * currency (blocks count as their base) when there is enough independent
 * data. Otherwise both sides are converted to emeralds at the currency-graph
 * rates; that judgement is only an estimate (ADR-019) and is marked "≈".
 * Trades without trusted data get no deviation.
 * 
 * The calculator caches results per trade object. When prices change,
 * create a new calculator instance to reset the cache.
 * 
 * @param valuation - Current prices, or undefined before data is loaded
 * @returns Function to calculate deviation for a trade
 * 
 * @example
 * ```typescript
 * const getDeviation = createDeviationCalculator(buildValuation(trades));
 * const result = getDeviation(trade);
 * console.log(result?.text); // "+10%", "−5%" or "≈−40%"
 * ```
 */
export function createDeviationCalculator(
    valuation: DeviationInput | undefined
): (trade: Readonly<Trade>) => Readonly<DeviationResult> | undefined {
    // Internal cache for this calculator instance (also caches "no deviation")
    const cache = new Map<Trade, DeviationResult | undefined>();

    /**
     * Price ratio against other trades for the same item paid in the same currency
     * @param input - Current prices
     * @param trade - Trade to compare
     * @returns Actual / median price, or undefined without trusted same-currency data
     */
    function getSameCurrencyRatio(input: DeviationInput, trade: Readonly<Trade>): number | undefined {
        const pair = getPairPrice(trade);
        if (!pair) { return undefined; }
        const expected = getTrustedPairPrice(input.pairPrices, pair.resultName, pair.costName);
        return expected ? pair.price / expected : undefined;
    }

    /**
     * Price ratio after converting both sides to emeralds
     * @param input - Current prices
     * @param trade - Trade to compare
     * @returns Cost value / result value, or undefined if any side has no trusted value
     */
    function getEmeraldRatio(input: DeviationInput, trade: Readonly<Trade>): number | undefined {
        const getValue = (name: string): number | undefined => input.getValue(name);
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

    function computeDeviation(input: DeviationInput, trade: Readonly<Trade>): Readonly<DeviationResult> | undefined {
        // ratio > 1 means paying more than expected (bad deal)
        // ratio < 1 means paying less than expected (good deal)
        const sameCurrencyRatio = getSameCurrencyRatio(input, trade);
        const basis = sameCurrencyRatio === undefined ? 'cross-currency' : 'same-currency';
        const ratio = sameCurrencyRatio ?? getEmeraldRatio(input, trade);
        if (ratio === undefined) { return undefined; }

        const percent = Math.max(
            DEVIATION.MIN_PERCENT, 
            Math.min(DEVIATION.MAX_PERCENT, Math.round((ratio - 1) * 100))
        );
        const prefix = basis === 'cross-currency' ? '≈' : '';

        if (percent === 0) {
            return { ratio, percent, basis, text: `${prefix}0%`, isGood: undefined };
        }
        const isGood = percent < 0;
        const text = percent > 0 ? `${prefix}+${percent}%` : `${prefix}−${Math.abs(percent)}%`;
        return { ratio, percent, text, isGood, basis };
    }

    return function getDeviation(trade: Readonly<Trade>): Readonly<DeviationResult> | undefined {
        // No prices means no deviation can be calculated
        if (!valuation) { return undefined; }

        if (cache.has(trade)) {
            return cache.get(trade);
        }
        const result = computeDeviation(valuation, trade);
        cache.set(trade, result);
        return result;
    };
}

/**
 * Whether a deviation is an estimate across currencies rather than a
 * comparison with the same item in the same currency
 * @param deviation - Deviation result
 * @returns True for cross-currency estimates
 */
export function isEstimate(deviation: Readonly<DeviationResult>): boolean {
    return deviation.basis === 'cross-currency';
}

/**
 * Wrap a deviation calculator so estimates count as "no deviation". Used where
 * a shaky estimate must not trigger anything: the Deals filter, watchlist
 * alerts and the dashboard (ADR-019).
 * @param getDeviation - Deviation calculator
 * @returns Calculator that only returns same-currency judgements
 *
 * @example
 * const confident = confidentOnly(getDeviation);
 * confident(tradeWithOnlyAnEstimate); // undefined
 */
export function confidentOnly(
    getDeviation: (trade: Readonly<Trade>) => Readonly<DeviationResult> | undefined
): (trade: Readonly<Trade>) => Readonly<DeviationResult> | undefined {
    return trade => {
        const deviation = getDeviation(trade);
        return deviation && !isEstimate(deviation) ? deviation : undefined;
    };
}
