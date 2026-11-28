/**
 * Search scope: everything that narrows the results besides the typed text.
 * WHAT (a lens and a biome per side), WHO (a shop or owner) and HOW (trade
 * filters such as "Best per item"). Pure helpers for the filter catalogue
 * and URL state.
 *
 * See ADR-023.
 *
 * @module search/scope
 */

import { QUICK_SEARCH } from '../constants.js';
import type { QuickFilters, ShopFilter, Trade } from '../types.js';
import { type BiomeId, findBiome, paysWithBiome, receivesFromBiome } from './biomes.js';
import { findLens, type LensId, paysWithLens, receivesFromLens } from './lenses.js';
import { buildShopFilterHref, readShopFilter } from './shop-filter.js';

/** Search field a scope option belongs to: Buying (received) or Paying (cost) */
export type SearchSide = 'buy' | 'pay';

/** A part of the scope a count can leave out: a field's lens or biome, or the shop filter */
export type ScopePart = SearchSide | 'buyBiome' | 'payBiome' | 'shop';

/** Everything besides the typed text that narrows the results */
export interface SearchScope {
    /** Lens on the received item */
    readonly buyLens: LensId | undefined;
    /** Lens on the cost items */
    readonly payLens: LensId | undefined;
    /** Biome the received item comes from */
    readonly buyBiome: BiomeId | undefined;
    /** Biome the cost items come from */
    readonly payBiome: BiomeId | undefined;
    /** Shop or owner the results are limited to */
    readonly shop: ShopFilter | undefined;
    /** Trade filters */
    readonly filters: QuickFilters;
}

/**
 * A trade filter in the Buying menu and pill row. Filters, like the shop
 * filter, apply to the whole trade, so only the Buying field (the main
 * entry point) offers them; the Paying menu only offers lenses.
 */
export interface TradeFilterSpec {
    readonly key: keyof QuickFilters;
    /** Value in the URL `filters` list */
    readonly param: string;
    /** Pill text */
    readonly label: string;
    /** Menu text, when it needs more words than the pill */
    readonly menuLabel: string;
    readonly title: string;
}

const DEALS_PERCENT = Math.abs(QUICK_SEARCH.DEALS_ONLY_MAX_PERCENT);

/** The trade filters, in Alt+1…4 order */
export const TRADE_FILTERS: readonly TradeFilterSpec[] = [
    {
        key: 'dealsOnly', param: 'deals', label: `Deals ≤ −${DEALS_PERCENT}%`, menuLabel: `Deals ≤ −${DEALS_PERCENT}%`,
        title: `Only trades at least ${DEALS_PERCENT}% below market`,
    },
    {
        key: 'bestPerItem', param: 'best', label: 'Best per item', menuLabel: 'Best per item',
        title: 'Only the cheapest offer for each item',
    },
    {
        key: 'shulkersOnly', param: 'shulkers', label: 'Shulkers', menuLabel: 'Shulker boxes',
        title: 'Only trades that buy or sell a filled shulker box',
    },
    {
        key: 'newOnly', param: 'new', label: 'New', menuLabel: 'New since last visit',
        title: 'Only trades that are new since your last visit',
    },
];

/** No filters on */
export const NO_FILTERS: QuickFilters = { dealsOnly: false, bestPerItem: false, shulkersOnly: false, newOnly: false };

/** Nothing narrows the results */
export const EMPTY_SCOPE: SearchScope = {
    buyLens: undefined, payLens: undefined, buyBiome: undefined, payBiome: undefined, shop: undefined, filters: NO_FILTERS,
};

const LENS_PARAM: Readonly<Record<SearchSide, string>> = { buy: 'lens', pay: 'paylens' };
const BIOME_PARAM: Readonly<Record<SearchSide, string>> = { buy: 'biome', pay: 'paybiome' };
const FILTERS_PARAM = 'filters';

/**
 * The lens of one side of the scope.
 * @param scope - Search scope
 * @param side - Buying or Paying
 * @returns Lens ID, if any
 */
export function getScopeLens(scope: SearchScope, side: SearchSide): LensId | undefined {
    return side === 'buy' ? scope.buyLens : scope.payLens;
}

/**
 * The biome of one side of the scope.
 * @param scope - Search scope
 * @param side - Buying or Paying
 * @returns Biome ID, if any
 */
export function getScopeBiome(scope: SearchScope, side: SearchSide): BiomeId | undefined {
    return side === 'buy' ? scope.buyBiome : scope.payBiome;
}

/**
 * The scope part that is one side's biome.
 * @param side - Buying or Paying
 * @returns Scope part to leave out when counting the biomes of that side
 */
export function biomePart(side: SearchSide): ScopePart {
    return side === 'buy' ? 'buyBiome' : 'payBiome';
}

/**
 * Whether anything besides the typed text narrows the results.
 * @param scope - Search scope
 * @returns True if a lens, biome, shop or filter is set
 */
export function isScopeActive(scope: SearchScope): boolean {
    return scope.buyLens !== undefined || scope.payLens !== undefined
        || scope.buyBiome !== undefined || scope.payBiome !== undefined || scope.shop !== undefined
        || Object.values(scope.filters).some(Boolean);
}

/**
 * A check whether a trade is inside the scope's lenses and biomes (WHAT),
 * optionally leaving one of them out, e.g. to count what each lens would show.
 * @param scope - Search scope
 * @param leaveOut - Lens or biome to ignore; the shop part is not checked here
 * @returns True for a trade every active lens and biome keeps
 *
 * @example
 * const isInside = createItemScopeMatcher({ ...EMPTY_SCOPE, buyLens: 'food', buyBiome: 'ocean' });
 * isInside(codForEmeralds) // true: fish is food from the ocean
 */
export function createItemScopeMatcher(scope: SearchScope, leaveOut?: ScopePart): (trade: Trade) => boolean {
    const buyLens = leaveOut === 'buy' ? undefined : findLens(scope.buyLens);
    const payLens = leaveOut === 'pay' ? undefined : findLens(scope.payLens);
    const buyBiome = leaveOut === 'buyBiome' ? undefined : findBiome(scope.buyBiome);
    const payBiome = leaveOut === 'payBiome' ? undefined : findBiome(scope.payBiome);
    return trade => (!buyLens || receivesFromLens(trade, buyLens))
        && (!payLens || paysWithLens(trade, payLens))
        && (!buyBiome || receivesFromBiome(trade, buyBiome))
        && (!payBiome || paysWithBiome(trade, payBiome));
}

/**
 * Names of the scope's active lenses and biomes, e.g. for "4 trades outside Food and Ocean".
 * @param scope - Search scope
 * @returns Labels in pill order
 */
export function getItemScopeLabels(scope: SearchScope): readonly string[] {
    return [findLens(scope.buyLens), findBiome(scope.buyBiome), findLens(scope.payLens), findBiome(scope.payBiome)]
        .filter(option => option !== undefined)
        .map(option => option.label);
}

/**
 * Read the scope from a URL query string.
 *
 * @param search - `location.search`, e.g. "?lens=redstone&biome=jungle&owner=Val&filters=best,new"
 * @returns The scope; unknown lenses, biomes and filters are ignored
 */
export function readScope(search: string): SearchScope {
    const parameters = new URLSearchParams(search);
    const filterNames = new Set((parameters.get(FILTERS_PARAM) ?? '').split(',').map(part => part.trim().toLowerCase()));
    let filters = NO_FILTERS;
    for (const spec of TRADE_FILTERS) {
        if (filterNames.has(spec.param)) { filters = { ...filters, [spec.key]: true }; }
    }
    return {
        buyLens: findLens(parameters.get(LENS_PARAM.buy) ?? undefined)?.id,
        payLens: findLens(parameters.get(LENS_PARAM.pay) ?? undefined)?.id,
        buyBiome: findBiome(parameters.get(BIOME_PARAM.buy) ?? undefined)?.id,
        payBiome: findBiome(parameters.get(BIOME_PARAM.pay) ?? undefined)?.id,
        shop: readShopFilter(search),
        filters,
    };
}

/**
 * Build a URL with the scope, keeping all other parts. Unset parts are removed.
 *
 * @param href - Current URL
 * @param scope - Search scope
 * @returns Updated URL string
 */
export function buildScopeHref(href: string, scope: SearchScope): string {
    const url = new URL(buildShopFilterHref(href, scope.shop));
    const parameters: readonly (readonly [string, string | undefined])[] = [
        [LENS_PARAM.buy, scope.buyLens], [LENS_PARAM.pay, scope.payLens],
        [BIOME_PARAM.buy, scope.buyBiome], [BIOME_PARAM.pay, scope.payBiome],
    ];
    for (const [key, value] of parameters) {
        if (value) {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
    }
    const filterNames = TRADE_FILTERS.filter(spec => scope.filters[spec.key]).map(spec => spec.param);
    if (filterNames.length > 0) {
        url.searchParams.set(FILTERS_PARAM, filterNames.join(','));
    } else {
        url.searchParams.delete(FILTERS_PARAM);
    }
    return url.href;
}

/**
 * The scope without the last pill a field's Backspace removes: in Buying the
 * last pill of the row (trade filters, then the shop, then the Buying biome
 * and lens); in Paying the Paying biome, then the Paying lens.
 *
 * @param scope - Search scope
 * @param side - Field where Backspace was pressed
 * @returns The scope without that pill, or undefined if the field has none
 */
export function removeLastPill(scope: SearchScope, side: SearchSide): SearchScope | undefined {
    if (side === 'pay') {
        if (scope.payBiome) { return { ...scope, payBiome: undefined }; }
        return scope.payLens === undefined ? undefined : { ...scope, payLens: undefined };
    }
    const lastFilter = TRADE_FILTERS.findLast(spec => scope.filters[spec.key]);
    if (lastFilter) { return { ...scope, filters: { ...scope.filters, [lastFilter.key]: false } }; }
    if (scope.shop) { return { ...scope, shop: undefined }; }
    if (scope.buyBiome) { return { ...scope, buyBiome: undefined }; }
    if (scope.buyLens) { return { ...scope, buyLens: undefined }; }
    return undefined;
}
