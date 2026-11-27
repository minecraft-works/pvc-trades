/**
 * Currency Graph
 *
 * Exchange rates between currencies (ADR-019). Rates come from the direct
 * market between two currencies when it has enough independent shops;
 * otherwise they are composed through other currencies. Buy rates multiply
 * along a path of buy rates and sell rates along a path of sell rates, and a
 * crossed result (sell above buy) collapses to the mid rate, so Sell ≤ Buy
 * always holds.
 *
 * @module valuation/currency-graph
 */

import { configStore, coreBlocksStore } from '../stores/index.js';
import type { PairPrices, PriceEntry } from '../types.js';
import { getPairKey, toBaseUnit } from './item-identity.js';
import { countIndependentShops, median } from './statistics.js';

/** Exchange rate of one item expressed in a currency */
export interface Quote {
    /** What one unit costs at a shop, in the currency */
    readonly buy: number | undefined;
    /** What a shop pays for one unit, in the currency */
    readonly sell: number | undefined;
    /** One number for valuations: geometric mean of buy and sell, or whichever exists */
    readonly mid: number;
    /** Currencies passed through when there is no trusted direct market (empty when direct) */
    readonly via: readonly string[];
    /** True when buy and sell crossed and were both replaced by the mid rate */
    readonly crossed: boolean;
}

/** Rates between all currencies found in the market */
export interface CurrencyGraph {
    /** Currency valuation names, core currencies first */
    readonly currencies: readonly string[];
    /**
     * Rate of an item in a currency. Blocks are accepted and converted
     * (1 Diamond block = 9 Diamond).
     * @param item - Currency to price
     * @param currency - Currency to express the price in
     * @returns Quote, or undefined when no trusted path exists
     */
    readonly quote: (item: string, currency: string) => Quote | undefined;
}

type Side = 'buy' | 'sell';

const SIDES: readonly Side[] = ['buy', 'sell'];

interface Edge {
    readonly rate: number;
    readonly shops: number;
}

interface Path {
    readonly rate: number;
    readonly via: readonly string[];
}

/** Longest chain of markets used to compose a rate */
const MAX_HOPS = 3;
/** Different items a non-core currency must pay for */
const MIN_ITEMS_PAID_FOR = 5;

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

/**
 * Core currencies in base units, in the order of core_currencies.json
 * @returns Valuation names, e.g. ['Netherite ingot', 'Diamond', 'Emerald', 'Gold ingot', 'Iron ingot']
 */
function getCoreCurrencies(): readonly string[] {
    const names = coreBlocksStore.get().map(block => capitalize(toBaseUnit(block, 1).name));
    return [...new Set(names)];
}

/**
 * Find the currencies in a market: the core currencies plus any other item
 * used to pay for many different items at several independent shops
 * (coins, certificates).
 *
 * @param pairPrices - In-stock prices per (result, cost) pair, in base units
 * @returns Currency valuation names, core first
 *
 * @example
 * findCurrencies(pairPrices) // ['Netherite ingot', 'Diamond', 'Emerald', 'Gold ingot', 'Iron ingot', 'Bb coin [loyalty 10]']
 */
export function findCurrencies(pairPrices: PairPrices): readonly string[] {
    const core = getCoreCurrencies();
    const coreKeys = new Set(core.map(name => name.toLowerCase()));
    const paidFor = new Map<string, { readonly items: Set<string>; readonly entries: PriceEntry[] }>();
    for (const [key, prices] of pairPrices) {
        const [result = '', cost = ''] = key.split('|', 2);
        if (coreKeys.has(cost)) { continue; }
        const usage = paidFor.get(cost) ?? { items: new Set<string>(), entries: [] };
        usage.items.add(result);
        usage.entries.push(...prices);
        paidFor.set(cost, usage);
    }

    const minShops = configStore.get().analysis.minIndependentShops;
    const custom = [...paidFor]
        .filter(([, usage]) => usage.items.size >= MIN_ITEMS_PAID_FOR && countIndependentShops(usage.entries) >= minShops)
        .map(([cost]) => capitalize(cost))
        .toSorted((a, b) => a.localeCompare(b));
    return [...core, ...custom];
}

/**
 * Build the exchange-rate graph between currencies.
 *
 * @param pairPrices - In-stock prices per (result, cost) pair, in base units
 * @param currencies - Currency valuation names (see {@link findCurrencies})
 * @returns Graph that quotes any currency in any other; currencies without a
 *          single trusted market are left out
 *
 * @example
 * const graph = buildCurrencyGraph(pairPrices, findCurrencies(pairPrices));
 * graph.quote('Netherite ingot', 'Diamond block') // { buy: 16, sell: 8, mid: 11.3, via: [], crossed: false }
 */
export function buildCurrencyGraph(pairPrices: PairPrices, currencies: readonly string[]): CurrencyGraph {
    const coreKeys = new Set(getCoreCurrencies().map(name => name.toLowerCase()));
    const { minIndependentShops, minIndependentShopsPerItem = 2 } = configStore.get().analysis;
    const required = (a: string, b: string): number =>
        coreKeys.has(a) && coreKeys.has(b) ? minIndependentShops : minIndependentShopsPerItem;

    const keys = currencies.map(name => name.toLowerCase());
    const edges = new Map<string, Edge>();
    for (const [a, b] of orderedPairs(keys)) {
        for (const side of SIDES) {
            const edge = getDirectEdge(pairPrices, a, b, side, required(a, b));
            if (edge) { edges.set(edgeKey(a, b, side), edge); }
        }
    }

    const connected = currencies.filter(name => {
        const key = name.toLowerCase();
        return keys.some(other => edges.has(edgeKey(key, other, 'buy')) || edges.has(edgeKey(key, other, 'sell')));
    });
    const connectedKeys = connected.map(name => name.toLowerCase());
    const names = new Map(connected.map(name => [name.toLowerCase(), name]));
    const cache = new Map<string, Quote | undefined>();

    function quoteBase(item: string, currency: string): Quote | undefined {
        const cacheKey = `${item}|${currency}`;
        if (cache.has(cacheKey)) { return cache.get(cacheKey); }
        const buy = findPath(edges, connectedKeys, item, currency, 'buy');
        const sell = findPath(edges, connectedKeys, item, currency, 'sell');
        const quote = toQuote(buy, sell, names);
        cache.set(cacheKey, quote);
        return quote;
    }

    return {
        currencies: connected,
        quote(item: string, currency: string): Quote | undefined {
            const from = toBaseUnit(item, 1);
            const to = toBaseUnit(currency, 1);
            const fromKey = from.name.toLowerCase();
            const toKey = to.name.toLowerCase();
            const scale = from.amount / to.amount;
            if (fromKey === toKey) { return { buy: scale, sell: scale, mid: scale, via: [], crossed: false }; }
            if (!names.has(fromKey) || !names.has(toKey)) { return undefined; }
            const base = quoteBase(fromKey, toKey);
            return base && scaleQuote(base, scale);
        },
    };
}

// ============================================================================
// Private Helpers
// ============================================================================

function edgeKey(a: string, b: string, side: Side): string {
    return `${a}|${b}|${side}`;
}

function orderedPairs(keys: readonly string[]): readonly (readonly [string, string])[] {
    return keys.flatMap(a => keys.filter(b => b !== a).map(b => [a, b] as const));
}

/**
 * Direct market rate of currency `a` in currency `b`
 * @param pairPrices - Prices per (result, cost) pair
 * @param a - Item currency (lowercase)
 * @param b - Price currency (lowercase)
 * @param side - Buy: shops selling `a` for `b`; sell: shops buying `a` with `b`
 * @param minShops - Independent shops needed
 * @returns Median rate (units of `b` per `a`) and its evidence, or undefined if untrusted
 */
function getDirectEdge(pairPrices: PairPrices, a: string, b: string, side: Side, minShops: number): Edge | undefined {
    // A shop giving `a` for `b` lists the price in b per a; a shop giving `b` for `a` lists a per b
    const prices = side === 'buy'
        ? pairPrices.get(getPairKey(a, b))
        : pairPrices.get(getPairKey(b, a))?.map(entry => ({ ...entry, price: 1 / entry.price }));
    if (!prices || prices.length === 0) { return undefined; }
    const shops = countIndependentShops(prices);
    if (shops < minShops) { return undefined; }
    const rate = median(prices);
    return rate !== undefined && Number.isFinite(rate) && rate > 0 ? { rate, shops } : undefined;
}

/** A chain of markets explored so far; `via` lists every currency reached, the last being `node` */
interface PartialPath {
    readonly node: string;
    readonly rate: number;
    readonly via: readonly string[];
    readonly shops: number;
}

/**
 * Best chain of direct markets from `from` to `to` on one side: fewest hops,
 * then the best-backed weakest link
 * @param edges - Direct edges
 * @param nodes - Currency keys
 * @param from - Item currency
 * @param to - Price currency
 * @param side - Market side
 * @returns Composed rate and the currencies passed through, or undefined
 */
function findPath(edges: ReadonlyMap<string, Edge>, nodes: readonly string[], from: string, to: string, side: Side): Path | undefined {
    let frontier: readonly PartialPath[] = [{ node: from, rate: 1, via: [], shops: Number.POSITIVE_INFINITY }];
    for (let hop = 1; hop <= MAX_HOPS && frontier.length > 0; hop++) {
        frontier = frontier.flatMap(path => extendPath(edges, nodes, path, from, side));
        let best: PartialPath | undefined;
        for (const path of frontier) {
            if (path.node === to && (!best || path.shops > best.shops)) { best = path; }
        }
        if (best) { return { rate: best.rate, via: best.via.slice(0, -1) }; }
    }
    return undefined;
}

/**
 * Every one-market extension of a path to a currency it has not visited
 * @param edges - Direct edges
 * @param nodes - Currency keys
 * @param path - Path so far
 * @param from - Start currency
 * @param side - Market side
 * @returns Extended paths
 */
function extendPath(edges: ReadonlyMap<string, Edge>, nodes: readonly string[], path: PartialPath, from: string, side: Side): readonly PartialPath[] {
    const extended: PartialPath[] = [];
    for (const next of nodes) {
        const isNew = next !== from && !path.via.includes(next);
        const edge = isNew ? edges.get(edgeKey(path.node, next, side)) : undefined;
        if (edge) {
            extended.push({ node: next, rate: path.rate * edge.rate, via: [...path.via, next], shops: Math.min(path.shops, edge.shops) });
        }
    }
    return extended;
}

function toQuote(buy: Path | undefined, sell: Path | undefined, names: ReadonlyMap<string, string>): Quote | undefined {
    const via = [...new Set([...(buy?.via ?? []), ...(sell?.via ?? [])])].map(key => names.get(key) ?? key);
    if (buy && sell) { return bothSides(buy.rate, sell.rate, via); }
    const only = buy ?? sell;
    if (!only) { return undefined; }
    return { via, buy: buy?.rate, sell: sell?.rate, mid: only.rate, crossed: false };
}

/**
 * Quote with both sides; a crossed market (sell above buy) shows the mid rate on both
 * @param buy - Buy rate
 * @param sell - Sell rate
 * @param via - Currencies passed through
 * @returns Quote with sell ≤ buy
 */
function bothSides(buy: number, sell: number, via: readonly string[]): Quote {
    const mid = Math.sqrt(buy * sell);
    return sell > buy
        ? { via, mid, buy: mid, sell: mid, crossed: true }
        : { via, buy, sell, mid, crossed: false };
}

function scaleQuote(quote: Quote, scale: number): Quote {
    if (scale === 1) { return quote; }
    return {
        ...quote,
        buy: quote.buy === undefined ? undefined : quote.buy * scale,
        sell: quote.sell === undefined ? undefined : quote.sell * scale,
        mid: quote.mid * scale,
    };
}
