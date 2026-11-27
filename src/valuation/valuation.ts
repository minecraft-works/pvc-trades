/**
 * Valuation
 *
 * Single entry point that turns trades into prices (ADR-019): in-stock trades
 * in base units feed one market (pair prices), the currency graph derives
 * exchange rates from it, and item values in emeralds are anchored to those
 * rates. Deal %, the Rates tab and flips all read from the result.
 *
 * @module valuation/valuation
 */

import type { ItemValues, PairPrices, Trade, TradeInput } from '../types.js';
import { buildCurrencyGraph, type CurrencyGraph, findCurrencies } from './currency-graph.js';
import { toBaseUnit, toValuationInput } from './item-identity.js';
import { calculateItemValues, calculatePairPrices } from './item-values.js';
import { getTrustedItemValue } from './statistics.js';

/** Everything derived from one set of trades */
export interface Valuation {
    /** In-stock per-unit prices per (result, cost) pair, in base units */
    readonly pairPrices: PairPrices;
    /** Exchange rates between currencies */
    readonly currencies: CurrencyGraph;
    /** Emerald values derived from trades (anchored to the currency graph) */
    readonly itemValues: ItemValues;
    /**
     * Emerald value of one unit of an item
     * @param name - Valuation name
     * @returns Value in emeralds, or undefined without trusted data
     */
    readonly getValue: (name: string) => number | undefined;
}

const BASE_CURRENCY = 'Emerald';

/**
 * Build all prices from the current trades. Only in-stock trades count:
 * sold-out offers cannot be used and the feed has no timestamps to age them.
 *
 * @param trades - All processed trades
 * @returns Pair prices, currency graph and item values
 *
 * @example
 * const valuation = buildValuation(trades);
 * valuation.currencies.quote('Netherite ingot', 'Diamond block'); // { buy: 16, sell: 8, ... }
 * valuation.getValue('Sand'); // 0.03
 */
export function buildValuation(trades: readonly Trade[]): Valuation {
    const inputs: TradeInput[] = [];
    for (const trade of trades) {
        if (trade.stock <= 0) { continue; }
        const input = toValuationInput(trade);
        if (input) { inputs.push(input); }
    }

    const pairPrices = calculatePairPrices(inputs);
    const currencies = buildCurrencyGraph(pairPrices, findCurrencies(pairPrices));
    const anchors = new Map<string, number>();
    for (const currency of currencies.currencies) {
        const value = currencies.quote(currency, BASE_CURRENCY)?.mid;
        if (value !== undefined) { anchors.set(currency.toLowerCase(), value); }
    }
    const itemValues = calculateItemValues(inputs, BASE_CURRENCY, anchors);

    return {
        pairPrices,
        currencies,
        itemValues,
        getValue(name: string): number | undefined {
            const base = toBaseUnit(name, 1);
            const anchor = anchors.get(base.name.toLowerCase());
            return anchor === undefined ? getTrustedItemValue(name, itemValues) : anchor * base.amount;
        },
    };
}
