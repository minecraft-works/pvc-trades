/**
 * Pure helpers for fast searching: exact-match queries, URL state,
 * name suggestions, per-item prices and best-offer selection.
 *
 * @module search/query
 */

import { formatName } from '../formatting.js';
import type { Trade } from '../types.js';

/** URL query parameter holding the "Buying" search */
const BUY_PARAM = 'buy';
/** URL query parameter holding the "Paying" search */
const PAY_PARAM = 'pay';

/**
 * Detect an exact-match query, written in double quotes.
 *
 * @param query - Raw search query
 * @returns The lowercase item name inside the quotes, or undefined for a normal query
 *
 * @example
 * parseExactQuery('"emerald"')  // 'emerald'
 * parseExactQuery('emerald')    // undefined
 */
export function parseExactQuery(query: string): string | undefined {
    const trimmed = query.trim();
    if (trimmed.length < 3 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) { return undefined; }
    const inner = trimmed.slice(1, -1).trim().toLowerCase();
    return inner || undefined;
}

/**
 * Wrap an item name as an exact-match query.
 *
 * @param name - Item name
 * @returns Quoted query, e.g. '"emerald block"'
 */
export function toExactQuery(name: string): string {
    return `"${name.toLowerCase()}"`;
}

/**
 * Read the Buying/Paying search terms from a URL query string.
 *
 * @param search - `location.search`, e.g. "?buy=diamond&pay=emerald"
 * @returns Search terms (empty strings when absent)
 */
export function readSearchTerms(search: string): { readonly buy: string; readonly pay: string } {
    const parameters = new URLSearchParams(search);
    return { buy: parameters.get(BUY_PARAM) ?? '', pay: parameters.get(PAY_PARAM) ?? '' };
}

/**
 * Build a URL with the Buying/Paying search terms, keeping all other parts.
 * Empty terms are removed so a cleared search gives a clean URL.
 *
 * @param href - Current URL
 * @param buy - Buying search term
 * @param pay - Paying search term
 * @returns Updated URL string
 */
export function buildSearchHref(href: string, buy: string, pay: string): string {
    const url = new URL(href);
    for (const [key, value] of [[BUY_PARAM, buy.trim()], [PAY_PARAM, pay.trim()]] as const) {
        if (value) {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
    }
    return url.href;
}

function suggestionRank(nameLower: string, query: string): number {
    if (nameLower.startsWith(query)) { return 0; }
    if (nameLower.split(/\s+/).some(word => word.startsWith(query))) { return 1; }
    return nameLower.includes(query) ? 2 : -1;
}

/**
 * Rank item names for autocomplete: prefix matches first, then word-start
 * matches, then other substring matches; shorter names first within a rank.
 *
 * @param names - Unique item names (any case)
 * @param query - Typed text
 * @param limit - Maximum suggestions to return
 * @returns Best matching names
 *
 * @example
 * rankSuggestions(['Diamond block', 'Diamond', 'Cut diamond'], 'dia', 5) // ['Diamond', 'Diamond block', 'Cut diamond']
 */
export function rankSuggestions(names: readonly string[], query: string, limit: number): readonly string[] {
    const q = query.trim().toLowerCase();
    if (!q) { return []; }
    return names
        .map(name => ({ name, rank: suggestionRank(name.toLowerCase(), q) }))
        .filter(entry => entry.rank >= 0)
        .toSorted((a, b) => a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name))
        .slice(0, limit)
        .map(entry => entry.name);
}

function formatAmount(value: number): string {
    return value >= 100 ? String(Math.round(value)) : String(Number(value.toFixed(2)));
}

/**
 * Collect unique item names for autocomplete (case-insensitive, first spelling wins).
 *
 * @param trades - All trades
 * @returns Names received (including shulker contents) and names paid
 */
export function collectItemNames(trades: readonly Trade[]): { readonly want: readonly string[]; readonly give: readonly string[] } {
    const want = new Map<string, string>();
    const give = new Map<string, string>();
    const add = (target: Map<string, string>, name: string): void => {
        const key = name.toLowerCase();
        if (name && !target.has(key)) { target.set(key, name); }
    };
    for (const trade of trades) {
        add(want, trade.resultName);
        for (const content of trade.shulkerItems ?? []) { add(want, content.name); }
        add(give, formatName(trade.item1));
        if (trade.item2) { add(give, formatName(trade.item2)); }
    }
    return { want: [...want.values()], give: [...give.values()] };
}

/**
 * Format how much one item costs (or how many items one cost unit buys),
 * so offers with different amounts can be compared at a glance.
 *
 * @param costAmount - Amount of the cost item paid
 * @param resultAmount - Amount of items received
 * @returns e.g. "2.5 each" or "16 for 1"; empty when the amounts are invalid
 *
 * @example
 * formatUnitPrice(5, 2)   // '2.5 each'
 * formatUnitPrice(1, 16)  // '16 for 1'
 */
export function formatUnitPrice(costAmount: number, resultAmount: number): string {
    if (costAmount <= 0 || resultAmount <= 0) { return ''; }
    const unit = costAmount / resultAmount;
    return unit >= 1 ? `${formatAmount(unit)} each` : `${formatAmount(1 / unit)} for 1`;
}

/**
 * Keep only the best offer per item: the lowest deviation wins, trades
 * without a deviation lose, and higher stock breaks ties.
 *
 * @param results - Filtered results
 * @param getKey - Item identity for grouping (e.g. lowercase result name)
 * @param getPercent - Deviation percent of a result, undefined if unknown
 * @param getStock - Stock of a result
 * @returns One result per item, in first-seen order
 */
export function pickBestPerItem<T>(
    results: readonly T[],
    getKey: (result: T) => string,
    getPercent: (result: T) => number | undefined,
    getStock: (result: T) => number
): readonly T[] {
    const best = new Map<string, T>();
    const score = (result: T): number => getPercent(result) ?? Number.POSITIVE_INFINITY;
    for (const result of results) {
        const key = getKey(result);
        const current = best.get(key);
        const isBetter = current === undefined
            || score(result) < score(current)
            || (score(result) === score(current) && getStock(result) > getStock(current));
        if (isBetter) { best.set(key, result); }
    }
    return [...best.values()];
}
