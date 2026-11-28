/**
 * Search scope: everything that narrows the results besides the typed text.
 * WHAT (a lens per side), WHO (a shop or owner) and HOW (trade filters such
 * as "Best per item"). Pure helpers for the filter catalogue and URL state.
 *
 * See ADR-023.
 *
 * @module search/scope
 */

import { QUICK_SEARCH } from '../constants.js';
import type { QuickFilters, ShopFilter } from '../types.js';
import { findLens, type LensId } from './lenses.js';
import { buildShopFilterHref, isAdminFilter, readShopFilter } from './shop-filter.js';

/** Search field a scope option belongs to: Buying (received) or Paying (cost) */
export type SearchSide = 'buy' | 'pay';

/** Everything besides the typed text that narrows the results */
export interface SearchScope {
    /** Lens on the received item */
    readonly buyLens: LensId | undefined;
    /** Lens on the cost items */
    readonly payLens: LensId | undefined;
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

/** The trade filters, in Alt+1…5 order */
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
    {
        key: 'hideAdmin', param: 'noadmin', label: 'No admin shops', menuLabel: 'Hide admin shops',
        title: 'Only player shops: leave out the server\'s own shops at spawn',
    },
];

/** No filters on */
export const NO_FILTERS: QuickFilters = { dealsOnly: false, bestPerItem: false, shulkersOnly: false, newOnly: false, hideAdmin: false };

/** Nothing narrows the results */
export const EMPTY_SCOPE: SearchScope = { buyLens: undefined, payLens: undefined, shop: undefined, filters: NO_FILTERS };

const LENS_PARAM: Readonly<Record<SearchSide, string>> = { buy: 'lens', pay: 'paylens' };
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
 * Whether anything besides the typed text narrows the results.
 * @param scope - Search scope
 * @returns True if a lens, shop or filter is set
 */
export function isScopeActive(scope: SearchScope): boolean {
    return scope.buyLens !== undefined || scope.payLens !== undefined || scope.shop !== undefined
        || Object.values(scope.filters).some(Boolean);
}

/**
 * Read the scope from a URL query string.
 *
 * @param search - `location.search`, e.g. "?lens=redstone&owner=Val&filters=best,new"
 * @returns The scope; unknown lenses and filters are ignored, and an admin
 *   shop filter wins over "Hide admin shops"
 */
export function readScope(search: string): SearchScope {
    const parameters = new URLSearchParams(search);
    const filterNames = new Set((parameters.get(FILTERS_PARAM) ?? '').split(',').map(part => part.trim().toLowerCase()));
    let filters = NO_FILTERS;
    for (const spec of TRADE_FILTERS) {
        if (filterNames.has(spec.param)) { filters = { ...filters, [spec.key]: true }; }
    }
    return withShop({
        buyLens: findLens(parameters.get(LENS_PARAM.buy) ?? undefined)?.id,
        payLens: findLens(parameters.get(LENS_PARAM.pay) ?? undefined)?.id,
        shop: undefined,
        filters,
    }, readShopFilter(search));
}

/**
 * The scope with another shop filter (or none). Showing admin shops and
 * hiding them exclude each other: picking the admin shops turns off
 * "Hide admin shops".
 *
 * @param scope - Search scope
 * @param shop - New shop filter, or undefined for all shops
 * @returns Updated scope
 */
export function withShop(scope: SearchScope, shop: ShopFilter | undefined): SearchScope {
    const filters = isAdminFilter(shop) ? { ...scope.filters, hideAdmin: false } : scope.filters;
    return { ...scope, shop, filters };
}

/**
 * The scope with a trade filter turned on or off. Turning on "Hide admin
 * shops" drops a shop filter that shows admin shops.
 *
 * @param scope - Search scope
 * @param key - Trade filter
 * @param enabled - New state
 * @returns Updated scope
 */
export function withFilter(scope: SearchScope, key: keyof QuickFilters, enabled: boolean): SearchScope {
    const hidesAdminShop = key === 'hideAdmin' && enabled && isAdminFilter(scope.shop);
    return { ...scope, shop: hidesAdminShop ? undefined : scope.shop, filters: { ...scope.filters, [key]: enabled } };
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
    const lenses: readonly (readonly [string, string | undefined])[] = [[LENS_PARAM.buy, scope.buyLens], [LENS_PARAM.pay, scope.payLens]];
    for (const [key, value] of lenses) {
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
 * last pill of the row (trade filters, then the shop, then the Buying lens);
 * in Paying the Paying lens.
 *
 * @param scope - Search scope
 * @param side - Field where Backspace was pressed
 * @returns The scope without that pill, or undefined if the field has none
 */
export function removeLastPill(scope: SearchScope, side: SearchSide): SearchScope | undefined {
    if (side === 'pay') {
        return scope.payLens === undefined ? undefined : { ...scope, payLens: undefined };
    }
    const lastFilter = TRADE_FILTERS.findLast(spec => scope.filters[spec.key]);
    if (lastFilter) { return { ...scope, filters: { ...scope.filters, [lastFilter.key]: false } }; }
    if (scope.shop) { return { ...scope, shop: undefined }; }
    if (scope.buyLens) { return { ...scope, buyLens: undefined }; }
    return undefined;
}
