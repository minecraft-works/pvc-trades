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
import {
    filterTrade,
    getOverworldDistanceFromOrigin,
    getRegex,
    getTradeKey,
} from '../library.js';
import { cartStore, favoritesStore } from '../stores/index.js';
import type {
    DeviationResult,
    FilterResult,
    SortColumn,
    SortDirection,
    Trade,
} from '../types.js';
import { parseExactQuery, pickBestPerItem } from './query.js';

/** "Deals only" shows trades at least this much below market */
const DEALS_ONLY_MAX_PERCENT = QUICK_SEARCH.DEALS_ONLY_MAX_PERCENT;

// ============================================================================
// Dependency & Handler interfaces
// ============================================================================

/**
 * Dependencies injected from the host module.
 *
 * Renderer deps (`renderResults`, `updateSortArrows`, `isFilterNewOnly`,
 * `isFilterCartOnly`) are lazy callbacks — the renderer is created after
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
    renderResults: (results: readonly FilterResult[], wantRegex: Readonly<RegExp> | undefined, giveRegex: Readonly<RegExp> | undefined) => void;
    /** Update sort arrow indicators in header (lazy: bound after renderer init) */
    updateSortArrows: () => void;
    /** Update the deals badge count (lazy: bound after favoritesUI init) */
    updateDealsBadge: (count: number) => void;
    /** Whether "new trades only" filter is active (lazy) */
    isFilterNewOnly: () => boolean;
    /** Whether "cart only" filter is active (lazy) */
    isFilterCartOnly: () => boolean;
    /** Quick-bar toggles: only good deals, and only the best offer per item (lazy) */
    getQuickFilters: () => { readonly dealsOnly: boolean; readonly bestPerItem: boolean };
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
}

// ============================================================================
// Pure helpers (exported)
// ============================================================================

/**
 * Get total cost amount including optional second item
 * @param t - Trade to compute cost for
 * @returns Total cost amount including optional second item
 */
function getTotalCostAmount(t: Trade): number {
    return t.item1.amount + (t.item2?.amount ?? 0);
}

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
        const deviationCalc = deps.getDeviation();
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
     * Whether header toggles or quick filters exclude a trade before text matching
     * @param trade - Trade to check
     * @returns True if the trade should be hidden
     */
    function isExcludedByFilters(trade: Trade): boolean {
        if (deps.isFilterNewOnly() && !deps.getNewTradeKeys().has(getTradeKey(trade))) { return true; }
        if (deps.isFilterCartOnly() && !cartStore.has(trade)) { return true; }
        if (isFavoritesFilterActive() && !favoritesStore.has(trade.resultName.toLowerCase())) { return true; }
        if (!deps.getQuickFilters().dealsOnly) { return false; }
        const deviation = deps.getDeviation()(trade);
        return deviation === undefined || deviation.percent > DEALS_ONLY_MAX_PERCENT;
    }

    function search(): void {
        const wantQuery = deps.getInputValue('searchWant');
        const giveQuery = deps.getInputValue('searchGive');

        // Exact queries ("emerald") highlight the name inside the quotes
        const wantRegex = wantQuery ? getCachedRegex(parseExactQuery(wantQuery) ?? wantQuery) : undefined;
        const giveRegex = giveQuery ? getCachedRegex(parseExactQuery(giveQuery) ?? giveQuery) : undefined;
        let results: FilterResult[] = [];

        for (const trade of deps.getAllTrades()) {
            if (isExcludedByFilters(trade)) { continue; }

            const result = filterTrade(trade, wantQuery, giveQuery);
            if (result) { results.push(result); }
        }

        if (deps.getQuickFilters().bestPerItem) {
            const deviationCalc = deps.getDeviation();
            results = [...pickBestPerItem(
                results,
                r => r.displayName.toLowerCase(),
                r => deviationCalc(r.trade)?.percent,
                r => r.trade.displayStock
            )];
        }

        const sortedResults = sortResults(results);
        deps.renderResults(sortedResults, wantRegex, giveRegex);

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
                return multiplier * ta.costName.localeCompare(tb.costName);
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
        triggerSearch: search,
        getActiveSorts: () => activeSorts,
    };
}
