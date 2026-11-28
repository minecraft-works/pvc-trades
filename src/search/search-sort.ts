/**
 * Search, filtering, and multi-column sort logic.
 *
 * Uses a factory pattern: call {@link createSearchSortHandler} with
 * dependencies from the host module (main.ts) to get a handler object.
 *
 * Pure helpers are exported directly for reuse and testing.
 *
 * @module search/search-sort
 */

import {
    COLUMNS,
    QUICK_SEARCH,
    SORT,
} from '../constants.js';
import { isFavoritesFilterActive } from '../favorites/index.js';
import { filterTrade, formatTradeCostNames, getRegex, getTotalCostAmount } from '../library.js';
import { getTradeKey } from '../map/map-math.js';
import { getOverworldDistanceFromOrigin } from '../routing/route-optimizer.js';
import { cartStore, favoritesStore } from '../stores/index.js';
import type {
    DeviationResult,
    EmptyResultsHint,
    FilterResult,
    QuickFilters,
    SortColumn,
    SortDirection,
    Trade,
} from '../types.js';
import { isFilledShulker } from '../valuation/item-identity.js';
import { confidentOnly, isEstimate } from './deviation.js';
import { findLens, type Lens, paysWithLens, receivesFromLens } from './lenses.js';
import { parseExactQuery, pickBestPerItem } from './query.js';
import type { SearchScope, SearchSide } from './scope.js';
import { matchesShopFilter } from './shop-filter.js';

/** "Deals only" shows trades at least this much below market */
const DEALS_ONLY_MAX_PERCENT = QUICK_SEARCH.DEALS_ONLY_MAX_PERCENT;

/**
 * Whether a trade buys or sells a filled shulker box
 * @param trade - Trade to check
 * @returns True if any side of the trade is a shulker box with contents
 */
function involvesFilledShulker(trade: Readonly<Trade>): boolean {
    return [trade.resultItem, trade.item1, trade.item2].some(item => item !== undefined && isFilledShulker(item));
}

// ============================================================================
// Dependency & Handler interfaces
// ============================================================================

/**
 * Dependencies injected from the host module.
 *
 * Renderer deps (`renderResults`, `updateSortArrows`, `isFilterCartOnly`)
 * are lazy callbacks — the renderer is created after
 * the search handler but before any user interaction triggers `search()`.
 */
export interface SearchSortDeps {
    /** Return current trade list */
    getAllTrades: () => readonly Trade[];
    /** Return current deviation calculator */
    getDeviation: () => (t: Trade) => DeviationResult | undefined;
    /** Return set of new trade keys for highlighting */
    getNewTradeKeys: () => ReadonlySet<string>;
    /** Read trimmed lowercase value from an input element */
    getInputValue: (id: string) => string;
    /** Get a DOM element by id (throws if missing) */
    getElement: <T extends HTMLElement = HTMLElement>(id: string) => T;
    /** Render filtered results via virtual scroller (lazy: bound after renderer init) */
    renderResults: (
        results: readonly FilterResult[],
        wantRegex: Readonly<RegExp> | undefined,
        giveRegex: Readonly<RegExp> | undefined,
        emptyHint?: EmptyResultsHint
    ) => void;
    /** Update sort arrow indicators in header (lazy: bound after renderer init) */
    updateSortArrows: () => void;
    /** Update the deals badge count (lazy: bound after favoritesUI init) */
    updateDealsBadge: (count: number) => void;
    /** Whether "cart only" filter is active (lazy) */
    isFilterCartOnly: () => boolean;
    /** Lenses, shop filter and trade filters (lazy) */
    getScope: () => SearchScope;
    /** Remove the lenses, from the empty-results hint */
    clearLenses: () => void;
    /** Called after every search, e.g. to sync the URL and quick-bar state */
    onSearched: () => void;
}

/**
 * Public API returned by the factory.
 */
export interface SearchSortHandler {
    /** Execute a full search: filter → sort → render */
    search: () => void;
    /** Debounced search (requestAnimationFrame) */
    debouncedSearch: () => void;
    /** Alias for search, used by features that trigger refresh */
    triggerSearch: () => void;
    /** Toggle sort direction on a column and re-search */
    sortByColumn: (col: SortColumn) => void;
    /** Clear an input field and refresh search */
    clearSearchInput: (inputId: string, clearButtonId: string) => void;
    /** Return current active sort columns for renderer */
    getActiveSorts: () => ReadonlyMap<SortColumn, SortDirection>;
    /**
     * A check for the current search without one field's lens, e.g. to count
     * what each lens of that field would show (Best per item not applied)
     */
    createSearchMatcher: (side: SearchSide) => (trade: Trade) => FilterResult | undefined;
}

// ============================================================================
// Pure helpers (exported)
// ============================================================================

/**
 * Show or hide a clear button based on whether the associated input has content.
 * @param input - Input element to check for content
 * @param clearButtonId - ID of the clear button element to show or hide
 */
export function updateClearButtonVisibility(input: Readonly<HTMLInputElement>, clearButtonId: string): void {
    const button = document.querySelector(`#${clearButtonId}`);
    if (!button) { return; }
    button.classList.toggle('hidden', input.value.length === 0);
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a search/sort handler with injected dependencies.
 *
 * Manages sort state, regex cache, and debounce timer as internal
 * closure state.
 * @param deps - Injected dependencies for the handler
 * @returns Search/sort handler bound to the provided dependencies
 */
export function createSearchSortHandler(deps: SearchSortDeps): SearchSortHandler {
    // Multi-column sort state (default: sort by deviation ascending)
    const activeSorts = new Map<SortColumn, SortDirection>([['dev', SORT.ASC]]);

    // Regex cache
    let cachedRegex: RegExp | undefined;
    let cachedPattern = '';
    let searchDebounceTimer: number | undefined;

    function getCachedRegex(pattern: string): Readonly<RegExp> {
        if (pattern === cachedPattern && cachedRegex) { return cachedRegex; }
        cachedPattern = pattern;
        cachedRegex = getRegex(pattern);
        return cachedRegex;
    }

    function debouncedSearch(): void {
        if (searchDebounceTimer !== undefined) {
            cancelAnimationFrame(searchDebounceTimer);
        }
        searchDebounceTimer = requestAnimationFrame(() => {
            searchDebounceTimer = undefined;
            search();
        });
    }

    /**
     * Count trades in results that meet their favorite threshold.
     * A "deal" is a trade for a favorited item with:
     * - A threshold set AND deviation meets that threshold
     * @param results - Filtered trade results to count deals in
     * @returns Number of trades meeting their favorite threshold
     */
    function countDeals(results: readonly FilterResult[]): number {
        const deviationCalc = confidentOnly(deps.getDeviation());
        let count = 0;
        for (const result of results) {
            const trade = result.trade;
            const itemName = trade.resultName.toLowerCase();
            const favorite = favoritesStore.get(itemName);
            if (favorite?.maxDeviation === undefined) {
                continue;
            }
            const deviation = deviationCalc(trade);
            if (deviation && deviation.percent <= favorite.maxDeviation) {
                count++;
            }
        }
        return count;
    }

    /**
     * Whether header toggles, the shop filter or trade filters exclude a trade before text matching
     * @param trade - Trade to check
     * @param scope - Current search scope
     * @returns True if the trade should be hidden
     */
    function isExcludedByFilters(trade: Trade, scope: SearchScope): boolean {
        if (scope.shop && !matchesShopFilter(trade, scope.shop)) { return true; }
        if (deps.isFilterCartOnly() && !cartStore.has(trade)) { return true; }
        if (isFavoritesFilterActive() && !favoritesStore.has(trade.resultName.toLowerCase())) { return true; }
        return isExcludedByQuickFilters(trade, scope.filters);
    }

    /**
     * Whether the trade filters exclude a trade
     * @param trade - Trade to check
     * @param filters - Current trade filters
     * @returns True if the trade should be hidden
     */
    function isExcludedByQuickFilters(trade: Trade, filters: QuickFilters): boolean {
        if (filters.newOnly && !deps.getNewTradeKeys().has(getTradeKey(trade))) { return true; }
        if (filters.shulkersOnly && !involvesFilledShulker(trade)) { return true; }
        if (!filters.dealsOnly) { return false; }
        // Cross-currency estimates are too uncertain to count as deals (ADR-019)
        const deviation = confidentOnly(deps.getDeviation())(trade);
        return deviation === undefined || deviation.percent > DEALS_ONLY_MAX_PERCENT;
    }

    /**
     * The empty-results hint when only the lenses hide matching trades
     * @param outsideCount - Trades that match everything but the lenses
     * @param lenses - Active lenses
     * @returns Hint, or undefined when nothing is hidden by a lens
     */
    function buildLensHint(outsideCount: number, lenses: readonly Lens[]): EmptyResultsHint | undefined {
        if (outsideCount === 0 || lenses.length === 0) { return undefined; }
        const names = lenses.map(lens => lens.label).join(' and ');
        const trades = outsideCount === 1 ? '1 matching trade' : `${outsideCount.toLocaleString()} matching trades`;
        return {
            message: `${trades} outside ${names}`,
            actionLabel: 'Show all',
            onAction: deps.clearLenses,
        };
    }

    /**
     * Trades matching the search, and how many more only the lenses hide
     * @param scope - Current search scope
     * @param wantQuery - Buying text
     * @param giveQuery - Paying text
     * @returns Matching results and the count hidden by the lenses
     */
    function collectResults(scope: SearchScope, wantQuery: string, giveQuery: string): { readonly results: readonly FilterResult[]; readonly outsideLensCount: number } {
        const buyLens = findLens(scope.buyLens);
        const payLens = findLens(scope.payLens);
        const results: FilterResult[] = [];
        let outsideLensCount = 0;
        for (const trade of deps.getAllTrades()) {
            const result = isExcludedByFilters(trade, scope) ? undefined : filterTrade(trade, wantQuery, giveQuery);
            if (!result) { continue; }
            const isOutside = (buyLens !== undefined && !receivesFromLens(trade, buyLens)) || (payLens !== undefined && !paysWithLens(trade, payLens));
            if (isOutside) {
                outsideLensCount++;
            } else {
                results.push(result);
            }
        }
        return { results, outsideLensCount };
    }

    /**
     * A check for the current search (text, shop, header toggles, trade
     * filters and the other field's lens), leaving out one field's lens
     * @param side - Field whose lens is left out
     * @returns Match for a trade, or undefined when the search leaves it out
     */
    function createSearchMatcher(side: SearchSide): (trade: Trade) => FilterResult | undefined {
        const scope = deps.getScope();
        const wantQuery = deps.getInputValue('searchWant');
        const giveQuery = deps.getInputValue('searchGive');
        const otherLens = findLens(side === 'buy' ? scope.payLens : scope.buyLens);
        const isInOtherLens = side === 'buy' ? paysWithLens : receivesFromLens;
        return (trade) => {
            const passes = !isExcludedByFilters(trade, scope) && (!otherLens || isInOtherLens(trade, otherLens));
            return passes ? filterTrade(trade, wantQuery, giveQuery) : undefined;
        };
    }

    function search(): void {
        const wantQuery = deps.getInputValue('searchWant');
        const giveQuery = deps.getInputValue('searchGive');
        const scope = deps.getScope();

        // Exact queries ("emerald") highlight the name inside the quotes
        const wantRegex = wantQuery ? getCachedRegex(parseExactQuery(wantQuery) ?? wantQuery) : undefined;
        const giveRegex = giveQuery ? getCachedRegex(parseExactQuery(giveQuery) ?? giveQuery) : undefined;
        const collected = collectResults(scope, wantQuery, giveQuery);
        let results = collected.results;

        if (scope.filters.bestPerItem) {
            const deviationCalc = deps.getDeviation();
            results = [...pickBestPerItem(
                results,
                r => r.displayName.toLowerCase(),
                r => deviationCalc(r.trade)?.percent,
                r => r.trade.displayStock
            )];
        }

        const sortedResults = sortResults(results);
        const lenses = [findLens(scope.buyLens), findLens(scope.payLens)].filter(lens => lens !== undefined);
        const hint = sortedResults.length === 0 ? buildLensHint(collected.outsideLensCount, lenses) : undefined;
        deps.renderResults(sortedResults, wantRegex, giveRegex, hint);

        // Update deals badge with count of trades meeting thresholds
        const dealsCount = countDeals(sortedResults);
        deps.updateDealsBadge(dealsCount);
        deps.onSearched();
    }

    function compareDeviation(ta: Trade, tb: Trade, multiplier: number): number {
        const deviationCalc = deps.getDeviation();
        const deviationA = deviationCalc(ta);
        const deviationB = deviationCalc(tb);
        // Trades without a deviation always sink to the bottom, regardless of direction
        if (!deviationA && !deviationB) { return 0; }
        if (!deviationA) { return 1; }
        if (!deviationB) { return -1; }
        // Cross-currency estimates come after same-currency judgements, regardless of direction
        const estimateA = isEstimate(deviationA);
        if (estimateA !== isEstimate(deviationB)) { return estimateA ? 1 : -1; }
        return multiplier * (deviationA.percent - deviationB.percent);
    }

    function compareByColumn(a: FilterResult, b: FilterResult, column: SortColumn, direction: SortDirection): number {
        const multiplier = direction === SORT.ASC ? 1 : -1;
        const ta = a.trade;
        const tb = b.trade;

        switch (column) {
            case 'dev': {
                return compareDeviation(ta, tb, multiplier);
            }
            case COLUMNS.COST_AMT: {
                return multiplier * (getTotalCostAmount(ta) - getTotalCostAmount(tb));
            }
            case COLUMNS.COST_NAME: {
                return multiplier * formatTradeCostNames(ta).localeCompare(formatTradeCostNames(tb));
            }
            case COLUMNS.RESULT_AMT: {
                return multiplier * (ta.resultAmount - tb.resultAmount);
            }
            case COLUMNS.RESULT_NAME: {
                return multiplier * ta.resultName.localeCompare(tb.resultName);
            }
            case 'stock': {
                return multiplier * (ta.displayStock - tb.displayStock);
            }
            case 'world': {
                return multiplier * ta.world.localeCompare(tb.world);
            }
            case 'distance': {
                return multiplier * (getOverworldDistanceFromOrigin(ta) - getOverworldDistanceFromOrigin(tb));
            }
            default: {
                return 0;
            }
        }
    }

    function sortResults(results: readonly FilterResult[]): readonly FilterResult[] {
        if (activeSorts.size === 0) {
            return results; // No sorting applied
        }

        // Map insertion order is the sort priority (most recently clicked first)
        const sortColumns = [...activeSorts.entries()];

        return results.toSorted((a, b) => {
            for (const [column, direction] of sortColumns) {
                const cmp = compareByColumn(a, b, column, direction);
                if (cmp !== 0) { return cmp; }
            }
            return 0;
        });
    }

    /**
     * Set a column's sort direction and make it the primary sort key.
     * @param column - Column to promote
     * @param direction - Sort direction to apply
     */
    function promoteSort(column: SortColumn, direction: SortDirection): void {
        const previous = [...activeSorts.entries()].filter(([col]) => col !== column);
        activeSorts.clear();
        activeSorts.set(column, direction);
        for (const [col, direction] of previous) { activeSorts.set(col, direction); }
    }

    function sortByColumn(column: SortColumn): void {
        const startsAsc = column === COLUMNS.COST_NAME || column === COLUMNS.RESULT_NAME;
        const currentDirection = activeSorts.get(column);

        if (currentDirection === undefined) {
            // First click: set initial direction based on column type
            promoteSort(column, startsAsc ? SORT.ASC : SORT.DESC);
        } else if (startsAsc && currentDirection === SORT.ASC) {
            // Name columns: asc -> desc -> none
            promoteSort(column, SORT.DESC);
        } else if (!startsAsc && currentDirection === SORT.DESC) {
            // Numeric columns: desc -> asc -> none
            promoteSort(column, SORT.ASC);
        } else {
            // Third click: remove sort
            activeSorts.delete(column);
        }
        deps.updateSortArrows();
        search();
    }

    function clearSearchInput(inputId: string, clearButtonId: string): void {
        const input = deps.getElement<HTMLInputElement>(inputId);
        input.value = '';
        updateClearButtonVisibility(input, clearButtonId);
        search();
        input.focus();
    }

    return {
        search,
        debouncedSearch,
        sortByColumn,
        clearSearchInput,
        createSearchMatcher,
        triggerSearch: search,
        getActiveSorts: () => activeSorts,
    };
}
