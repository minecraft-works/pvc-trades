/**
 * Data loading, refresh, and trade state management.
 *
 * Uses a factory pattern: call {@link createDataLoaderHandler} with
 * dependencies from the host module (main.ts) to get a handler object.
 *
 * Owns the canonical trade list, mapping rules, item values, deviation
 * calculator, and new-trade highlight set.  Other modules access these
 * through the handler getters.
 *
 * @module data/data-loader
 */

import {
    calculateItemValues,
    formatName,
    getConfig,
    getTradeKey,
    loadBaseItems,
    loadConfig,
    loadFixedRatios,
    processTrade,
} from '../library.js';
import { createDeviationCalculator } from '../search/index.js';
import type { DeviationResult } from '../types.js';
import type {
    ItemValues,
    MappingRule,
    Shop,
    ShopData,
    Trade,
} from '../types.js';

// ============================================================================
// Dependency & Handler interfaces
// ============================================================================

/**
 * Dependencies injected from the host module.
 *
 * Lazy callbacks (`renderHeader`, `search`, `showDashboard`) reference
 * handlers created _after_ the data loader but _before_ `loadShops`
 * resumes from its first `await`.
 */
export interface DataLoaderDeps {
    /** Get a DOM element by id (throws if missing) */
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers specify concrete element types
    getElement: <T extends HTMLElement = HTMLElement>(id: string) => T;
    /** Render table header (lazy: bound after renderer init) */
    renderHeader: () => void;
    /** Execute a full search (lazy: bound after searchHandler init) */
    search: () => void;
    /** Show the daily-deals dashboard (lazy: bound after dashboardUI init) */
    showDashboard: () => void;
}

/**
 * Public API returned by the factory.
 */
export interface DataLoaderHandler {
    /** Initial load: fetch config, shop data, mapping rules */
    loadShops: () => Promise<void>;
    /** Refresh shop data from remote API */
    refreshShopData: () => Promise<number>;
    /** Return current trade list */
    getAllTrades: () => readonly Trade[];
    /** Look up a trade by its unique key */
    getTradeByKey: (key: string) => Trade | undefined;
    /** Return current deviation calculator function */
    getDeviation: () => (t: Trade) => DeviationResult | undefined;
    /** Return current item values (may be undefined before load) */
    getItemValues: () => ItemValues | undefined;
    /** Return set of new trade keys for highlighting */
    getNewTradeKeys: () => ReadonlySet<string>;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a data-loader handler with injected dependencies.
 *
 * Manages trade data, item values, deviation calculator, and refresh
 * interval as internal closure state.
 * @param deps - Dependencies injected from the host module
 * @returns Handler object with trade access and lifecycle methods
 */
// eslint-disable-next-line max-lines-per-function -- factory function encapsulates module state via closures
export function createDataLoaderHandler(deps: DataLoaderDeps): DataLoaderHandler {
    let allTrades: Trade[] = [];
    const tradesByKey = new Map<string, Trade>();
    let mappingRules: MappingRule[] = [];
    let itemValues: ItemValues | undefined;
    let getDeviation = createDeviationCalculator(itemValues);
    const newTradeKeys = new Set<string>();
    let _shopRefreshInterval: ReturnType<typeof setInterval> | undefined;

    /**
     * Build the item-value calculation input from current trades
     * @param trades - Current trade list to build inputs from
     * @returns Array of trade input objects for item value calculation
     */
    function buildItemValueInput(trades: readonly Trade[]) {
        return trades.map(t => ({
            resultName: t.resultName,
            resultAmount: t.resultAmount,
            costName: t.costName,
            costAmount: t.item1.amount,
            item1Name: formatName(t.item1),
            item2: t.item2,
            x: t.x, y: t.y, z: t.z,
        }));
    }

    function processShops(shops: readonly Shop[]): void {
        allTrades = [];
        tradesByKey.clear();
        for (const shop of shops) {
            for (const recipe of shop.recipes) {
                const trade = processTrade(recipe, shop, mappingRules);
                allTrades.push(trade);
                tradesByKey.set(getTradeKey(trade), trade);
            }
        }
    }

    /**
     * Refresh shop data from remote API.
     * Returns the number of new trades detected and marks them for highlighting.
     * @returns Number of new trades detected since the last load
     */
    async function refreshShopData(): Promise<number> {
        try {
            const config = getConfig();
            const response = await fetch(config.dataUrl);

            if (!response.ok) {
                console.warn('Failed to refresh shop data:', response.status);
                return 0;
            }

            const data = (await response.json()) as ShopData;

            // Track existing trade keys before processing new data
            // eslint-disable-next-line functional/prefer-tacit -- unicorn/no-array-callback-reference conflicts
            const existingTradeKeys = new Set(allTrades.map(t => getTradeKey(t)));

            processShops(data.data);

            // Identify new trades and add them to the highlight set
            for (const trade of allTrades) {
                const key = getTradeKey(trade);
                if (!existingTradeKeys.has(key)) {
                    newTradeKeys.add(key);
                }
            }

            // Recalculate item values
            itemValues = calculateItemValues(buildItemValueInput(allTrades), 'emerald');
            getDeviation = createDeviationCalculator(itemValues);

            // Refresh the search results
            deps.search();

            const newTradeCount = newTradeKeys.size;
            if (newTradeCount > 0) {
                console.log(`Shop data refreshed: ${newTradeCount} new trades`);
            }

            return newTradeCount;
        } catch (error) {
            console.warn('Error refreshing shop data:', error);
            return 0;
        }
    }

    async function loadShops(): Promise<void> {
        try {
            // Load config first to get the data URL
            await Promise.all([
                loadFixedRatios(),
                loadBaseItems(),
                loadConfig(),
            ]);

            const config = getConfig();
            const [dataResponse, mappingResponse] = await Promise.all([
                fetch(config.dataUrl),
                fetch('trade_conversions.json'),
            ]);

            if (!dataResponse.ok || !mappingResponse.ok) {
                throw new Error('Failed to load shop data');
            }

            const data = (await dataResponse.json()) as ShopData;
            mappingRules = (await mappingResponse.json()) as MappingRule[];
            processShops(data.data);

            // Calculate item values for deviation column
            itemValues = calculateItemValues(buildItemValueInput(allTrades), 'emerald');
            getDeviation = createDeviationCalculator(itemValues);

            deps.renderHeader();
            deps.search(); // Show all trades on load

            // Show daily deals dashboard (compare with previous session)
            deps.showDashboard();

            // Start background refresh interval
            if (config.dataRefreshMs && config.dataRefreshMs > 0) {
                _shopRefreshInterval = setInterval(() => void refreshShopData(), config.dataRefreshMs);
            }

            // Expose refreshShopData for E2E testing
            (globalThis as unknown as { refreshShopData: typeof refreshShopData }).refreshShopData = refreshShopData;
        } catch (error) {
            console.error('Failed to load shop data:', error);
            deps.getElement('results').innerHTML =
                '<div class="no-results"><h2>Error loading data</h2><p>Please refresh the page</p></div>';
        }
    }

    return {
        loadShops,
        refreshShopData,
        getAllTrades: (): readonly Trade[] => allTrades,
        getTradeByKey: (key) => tradesByKey.get(key),
        getDeviation: () => getDeviation,
        getItemValues: () => itemValues,
        getNewTradeKeys: (): ReadonlySet<string> => newTradeKeys,
    };
}
