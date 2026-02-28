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
    SORT,
} from '../constants.js';
import { isFavoritesFilterActive } from '../favorites/index.js';
import {
    filterTrade,
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers specify concrete element types
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

// Column order for sort priority (left to right)
const COLUMN_ORDER: readonly SortColumn[] = [COLUMNS.RESULT_AMT, COLUMNS.RESULT_NAME, COLUMNS.COST_AMT, COLUMNS.COST_NAME, 'dev', 'stock', 'distance', 'world'];

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
// eslint-disable-next-line max-lines-per-function -- factory function encapsulates module state via closures
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

    function search(): void {
        const wantQuery = deps.getInputValue('searchWant');
        const giveQuery = deps.getInputValue('searchGive');

        const wantRegex = wantQuery ? getCachedRegex(wantQuery) : undefined;
        const giveRegex = giveQuery ? getCachedRegex(giveQuery) : undefined;
        const results: FilterResult[] = [];

        for (const trade of deps.getAllTrades()) {
            const isFilteredOut =
                (deps.isFilterNewOnly() && !deps.getNewTradeKeys().has(getTradeKey(trade))) ||
                (deps.isFilterCartOnly() && !cartStore.has(trade)) ||
                (isFavoritesFilterActive() && !favoritesStore.has(trade.resultName.toLowerCase()));

            if (isFilteredOut) { continue; }

            const result = filterTrade(trade, wantQuery, giveQuery);
            if (result) { results.push(result); }
        }

        const sortedResults = sortResults(results);
        deps.renderResults(sortedResults, wantRegex, giveRegex);

        // Update deals badge with count of trades meeting thresholds
        const dealsCount = countDeals(sortedResults);
        deps.updateDealsBadge(dealsCount);
    }

    function compareDeviation(ta: Trade, tb: Trade): number {
        const deviationCalc = deps.getDeviation();
        const deviationA = deviationCalc(ta);
        const deviationB = deviationCalc(tb);
        if (!deviationA && !deviationB) { return 0; }
        if (!deviationA) { return 1; }
        if (!deviationB) { return -1; }
        return deviationA.percent - deviationB.percent;
    }

    function compareByColumn(a: FilterResult, b: FilterResult, column: SortColumn, direction: SortDirection): number {
        const multiplier = direction === SORT.ASC ? 1 : -1;
        const ta = a.trade;
        const tb = b.trade;

        switch (column) {
            case 'dev': {
                return multiplier * compareDeviation(ta, tb);
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
                return multiplier * (Math.hypot(ta.x, ta.z) - Math.hypot(tb.x, tb.z));
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

        // Get active columns in left-to-right order
        const sortColumns = COLUMN_ORDER.filter(col => activeSorts.has(col));

        return results.toSorted((a, b) => {
            for (const column of sortColumns) {
                const direction = activeSorts.get(column);
                if (direction === undefined) { continue; }
                const cmp = compareByColumn(a, b, column, direction);
                if (cmp !== 0) { return cmp; }
            }
            return 0;
        });
    }

    function sortByColumn(column: SortColumn): void {
        const startsAsc = column === COLUMNS.COST_NAME || column === COLUMNS.RESULT_NAME;
        const currentDirection = activeSorts.get(column);

        if (currentDirection === undefined) {
            // First click: set initial direction based on column type
            activeSorts.set(column, startsAsc ? SORT.ASC : SORT.DESC);
        } else if (startsAsc && currentDirection === SORT.ASC) {
            // Name columns: asc -> desc -> none
            activeSorts.set(column, SORT.DESC);
        } else if (!startsAsc && currentDirection === SORT.DESC) {
            // Numeric columns: desc -> asc -> none
            activeSorts.set(column, SORT.ASC);
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
