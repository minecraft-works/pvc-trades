/**
 * Data loading, refresh, and trade state management.
 *
 * Uses a factory pattern: call {@link createDataLoaderHandler} with
 * dependencies from the host module (main.ts) to get a handler object.
 *
 * Owns the canonical trade list, mapping rules, prices (valuation), deviation
 * calculator, and new-trade highlight set.  Other modules access these
 * through the handler getters.
 *
 * @module data/data-loader
 */

import { html } from 'lit-html';
import { z } from 'zod/mini';

import { processTrade } from '../library.js';
import { getTradeKey } from '../map/map-math.js';
import { replaceContent } from '../rendering/render.js';
import { createDeviationCalculator } from '../search/index.js';
import { getConfig, loadBaseItems, loadConfig, loadFixedRatios } from '../stores/index.js';
import type {
    DeviationResult,
    MappingRule,
    Shop,
    Trade,
} from '../types.js';
import {
    MappingRuleSchema,
    ShopDataSchema,
} from '../types.js';
import { buildValuation, type Valuation } from '../valuation/valuation.js';

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
    getElement: <T extends HTMLElement = HTMLElement>(id: string) => T;
    /** Render table header (lazy: bound after renderer init) */
    renderHeader: () => void;
    /** Execute a full search (lazy: bound after searchHandler init) */
    search: () => void;
    /**
     * Show the daily-deals dashboard (lazy: bound after dashboardUI init)
     * @returns Keys of trades that are new since the previous visit
     */
    showDashboard: () => readonly string[];
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
    /** Return current prices: pair prices, exchange rates, item values (undefined before load) */
    getValuation: () => Valuation | undefined;
    /** Return set of new trade keys for highlighting */
    getNewTradeKeys: () => ReadonlySet<string>;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a data-loader handler with injected dependencies.
 *
 * Manages trade data, prices, deviation calculator, and refresh
 * interval as internal closure state.
 * @param deps - Dependencies injected from the host module
 * @returns Handler object with trade access and lifecycle methods
 */
export function createDataLoaderHandler(deps: DataLoaderDeps): DataLoaderHandler {
    let allTrades: Trade[] = [];
    const tradesByKey = new Map<string, Trade>();
    let mappingRules: MappingRule[] = [];
    let valuation: Valuation | undefined;
    let getDeviation = createDeviationCalculator(valuation);
    const newTradeKeys = new Set<string>();
    let _shopRefreshInterval: ReturnType<typeof setInterval> | undefined;
    let lastUpdated: Date | undefined;
    /** Raw body of the last processed shop data, to skip refreshes that bring no changes */
    let lastPayload: string | undefined;

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

    /** Recalculate prices and the deviation calculator from the current trades */
    function recalculateValues(): void {
        valuation = buildValuation(allTrades);
        getDeviation = createDeviationCalculator(valuation);
    }

    /**
     * Show when the shop data was last updated, and whether the latest refresh failed
     * @param stale - True when the latest refresh failed and older data is shown
     */
    function showFreshness(stale: boolean): void {
        const element = document.querySelector('#data-freshness');
        if (!element || !lastUpdated) { return; }
        const time = lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        element.textContent = stale
            ? `Shop data from ${time} · refresh failed, retrying`
            : `Shop data updated ${time}`;
        element.classList.toggle('stale', stale);
    }

    /**
     * Refresh shop data from remote API.
     * Returns the number of new trades detected and marks them for highlighting.
     * @returns Number of new trades detected since the last load
     */
    async function refreshShopData(): Promise<number> {
        try {
            const config = getConfig();
            // Revalidate with the server: unchanged data comes back as a 304 from the HTTP cache
            const response = await fetch(config.dataUrl, { cache: 'no-cache' });

            if (!response.ok) {
                console.warn('Failed to refresh shop data:', response.status);
                showFreshness(true);
                return 0;
            }

            const payload = await response.text();
            if (payload === lastPayload) {
                lastUpdated = new Date();
                showFreshness(false);
                return newTradeKeys.size;
            }

            const json: unknown = JSON.parse(payload);
            const parsed = ShopDataSchema.safeParse(json);
            if (!parsed.success) {
                console.warn('Invalid shop data format');
                showFreshness(true);
                return 0;
            }

            const data = parsed.data;
            lastPayload = payload;

            // Track existing trade keys before processing new data
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
            recalculateValues();

            // Refresh the search results
            deps.search();

            lastUpdated = new Date();
            showFreshness(false);

            const newTradeCount = newTradeKeys.size;
            if (newTradeCount > 0) {
                console.log(`Shop data refreshed: ${newTradeCount} new trades`);
            }

            return newTradeCount;
        } catch (error) {
            console.warn('Error refreshing shop data:', error);
            showFreshness(true);
            return 0;
        }
    }

    /** Replace the results with a load error and a retry button */
    function showLoadError(): void {
        const results = deps.getElement('results');
        const retryLoad = (): void => {
            replaceContent(results, html`<div class="no-results" role="row"><p role="gridcell">Loading…</p></div>`);
            void loadShops();
        };
        // A message inside the trade grid is a row with one cell
        replaceContent(results, html`
            <div class="no-results" role="row"><div role="gridcell"><div role="alert">
                <h2>Couldn't load shop data</h2>
                <p>Check your connection and try again.</p>
                <button type="button" class="retry-load-btn" @click=${retryLoad}>Retry</button>
            </div></div></div>
        `);
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

            const payload = await dataResponse.text();
            const dataJson: unknown = JSON.parse(payload);
            const mappingJson: unknown = await mappingResponse.json();

            const dataParsed = ShopDataSchema.safeParse(dataJson);
            const mappingParsed = z.array(MappingRuleSchema).safeParse(mappingJson);

            if (!dataParsed.success || !mappingParsed.success) {
                throw new Error('Invalid shop data or mapping rules format');
            }

            const data = dataParsed.data;
            lastPayload = payload;
            mappingRules = mappingParsed.data;
            processShops(data.data);

            // Calculate item values for deviation column
            recalculateValues();

            deps.renderHeader();

            // Compare with the previous visit; those trades count as new for the 🆕 filter
            for (const key of deps.showDashboard()) {
                newTradeKeys.add(key);
            }

            deps.search(); // Show all trades on load

            lastUpdated = new Date();
            showFreshness(false);

            // Start background refresh interval
            if (config.dataRefreshMs && config.dataRefreshMs > 0) {
                clearInterval(_shopRefreshInterval);
                _shopRefreshInterval = setInterval(() => void refreshShopData(), config.dataRefreshMs);
            }

            // Expose refreshShopData for E2E tests (dev server only)
            if (import.meta.env.DEV) {
                globalThis.refreshShopData = refreshShopData;
            }
        } catch (error) {
            console.error('Failed to load shop data:', error);
            showLoadError();
        }
    }

    return {
        loadShops,
        refreshShopData,
        getAllTrades: (): readonly Trade[] => allTrades,
        getTradeByKey: (key) => tradesByKey.get(key),
        getDeviation: () => getDeviation,
        getValuation: () => valuation,
        getNewTradeKeys: (): ReadonlySet<string> => newTradeKeys,
    };
}
