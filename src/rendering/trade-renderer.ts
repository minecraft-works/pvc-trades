/**
 * Trade row rendering and virtual scrolling management.
 *
 * Uses a factory pattern: call {@link createTradeRendererHandler} with
 * dependencies from the host module (main.ts) to get a handler object.
 *
 * Pure helper functions are exported directly for reuse and testing.
 *
 * @module rendering/trade-renderer
 */

import VirtualScroller from 'virtual-scroller/dom';

import {
    COLUMNS,
    CSS_CLASSES,
    SORT,
} from '../constants.js';
import {
    escapeHtml,
    formatName,
    getTradeKey,
    highlight,
} from '../library.js';
import type { DeviationResult } from '../search/index.js';
import { cartStore, favoritesStore } from '../stores/index.js';
import type {
    FilterResult,
    Item,
    SortColumn,
    SortDirection,
    Trade,
} from '../types.js';

// ============================================================================
// Dependency & Handler interfaces
// ============================================================================

/**
 * Dependencies injected from the host module.
 */
export interface TradeRendererDeps {
    /** Return current deviation calculator */
    getDeviation: () => (t: Trade) => DeviationResult | undefined;
    /** Return current active sort columns */
    getActiveSorts: () => ReadonlyMap<SortColumn, SortDirection>;
    /** Return set of new trade keys for highlighting */
    getNewTradeKeys: () => ReadonlySet<string>;
    /** Trigger a search refresh */
    search: () => void;
    /** Sort by a column (handles toggle logic) */
    sortByColumn: (col: SortColumn) => void;
    /** Open favorites dialog for an item */
    openDialogForItem: (itemName: string) => void;
}

/**
 * Public API returned by the factory.
 */
export interface TradeRendererHandler {
    /** Render the table header with sort arrows and filter toggles */
    renderHeader: () => void;
    /** Render trade results using virtual scrolling */
    renderResults: (results: readonly FilterResult[], wantRegex: RegExp | undefined, giveRegex: RegExp | undefined) => void;
    /** Update sort arrow indicators in the header */
    updateSortArrows: () => void;
    /** Whether the "new trades only" filter is active */
    isFilterNewOnly: () => boolean;
    /** Whether the "cart only" filter is active */
    isFilterCartOnly: () => boolean;
}

// ============================================================================
// Local DOM helper
// ============================================================================

/**
 * Get a DOM element by ID, throwing if not found.
 * @param id - DOM element ID to find
 * @throws Error if element not found
 * @returns The found element cast to the specified type
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers specify concrete element types
function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.querySelector<T>(`#${id}`);
    if (!element) { throw new Error(`Element #${id} not found`); }
    return element;
}

// ============================================================================
// Pure helpers (exported)
// ============================================================================

/**
 * Get cost display info for a trade (handles multi-item costs)
 * @param t - Trade to extract cost info from
 * @returns Formatted cost amount and name strings for display
 */
function getCostDisplayInfo(t: Trade): { costAmt: string; costName: string } {
    let costAmt = String(t.item1.amount);
    let costName = t.costName;
    if (t.item2) {
        costAmt += '+' + t.item2.amount;
        costName += ' + ' + formatName(t.item2);
    }
    return { costAmt, costName };
}

/**
 * Get world abbreviation and full title
 * @param world - World name string to categorize
 * @returns World abbreviation and full title for display
 */
function getWorldDisplayInfo(world: string): { abbrev: string; title: string } {
    const worldLower = world.toLowerCase();
    if (worldLower.includes('nether')) {
        return { abbrev: 'N', title: 'The Nether' };
    }
    if (worldLower.includes('end')) {
        return { abbrev: 'E', title: 'The End' };
    }
    return { abbrev: 'O', title: 'Overworld' };
}

/**
 * Map isGood to CSS class name
 * @param isGood - Whether the trade is a good deal
 * @returns CSS class name for the deviation cell
 */
// eslint-disable-next-line sonarjs/bool-param-default -- undefined vs false has distinct meaning (no deviation vs bad deal)
function getDeviationClass(isGood?: boolean  ): string {
    if (isGood === undefined) {
        return '';
    }
    return isGood ? 'good-deal' : 'bad-deal';
}

/**
 * Check if an item has additional details (lore or enchantments)
 * @param item - Item to check for lore or enchantments
 * @returns True if the item has lore or enchantments
 */
function itemHasDetails(item: Item): boolean {
    const hasLore = Boolean(item.lore && item.lore.length > 0);
    const hasEnchants = Boolean(item.enchant && Object.keys(item.enchant).length > 0);
    return hasLore || hasEnchants;
}

// Right-aligned columns get arrow before label, left-aligned get arrow after
const RIGHT_ALIGNED_COLS = new Set([COLUMNS.RESULT_AMT, COLUMNS.COST_AMT, 'stock', 'dev', 'distance', 'world']);

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a trade renderer handler with injected dependencies.
 *
 * Manages filter state (new-only, cart-only), virtual scrolling,
 * and regex highlighting as internal closure state.
 * @param deps - Injected dependencies for the handler
 * @returns Trade renderer handler bound to the provided dependencies
 */
// eslint-disable-next-line max-lines-per-function -- factory function encapsulates module state via closures
export function createTradeRendererHandler(deps: TradeRendererDeps): TradeRendererHandler {
    // Internal filter and rendering state
    let filterNewOnly = false;
    let filterCartOnly = false;
    let virtualScroller: VirtualScroller<FilterResult> | undefined;
    let currentWantRegex: RegExp | undefined;
    let currentGiveRegex: RegExp | undefined;

    function getArrow(col: string): string {
        const direction = deps.getActiveSorts().get(col as SortColumn);
        if (!direction) { return ''; }
        return direction === SORT.ASC ? '↑' : '↓';
    }

    function updateSortArrows(): void {
        for (const element of document.querySelectorAll<HTMLElement>('#table-header .header')) {
            const label = element.dataset.label ?? '';
            const col = element.dataset.col ?? '';
            const arrow = getArrow(col);
            element.textContent = RIGHT_ALIGNED_COLS.has(col) ? arrow + label : label + arrow;
            element.classList.toggle('active-sort', deps.getActiveSorts().has(col as SortColumn));
        }
    }

    function renderHeader(): void {
        const header = getElement('table-header');
        header.innerHTML = `
            <span class="col fav-col-header" role="columnheader" title="Filter by favorites">★<span id="favorites-badge" class="favorites-badge hidden"></span></span>
            <span class="col header amt" role="columnheader" data-col="result-amt" data-label="#">#</span>
            <span class="col header" role="columnheader" data-col="result-name" data-label="Item">Item</span>
            <span class="col header amt" role="columnheader" data-col="cost-amt" data-label="#">#</span>
            <span class="col header" role="columnheader" data-col="cost-name" data-label="Cost">Cost</span>
            <span class="col header dev-header" role="columnheader" data-col="dev" data-label="Deal" title="Deal quality vs expected price">Deal</span>
            <span class="col header stock-header" role="columnheader" data-col="stock" data-label="Stock">Stock</span>
            <span class="col header distance-header" role="columnheader" data-col="distance" data-label="Dist" title="Distance from origin (X, Z)">Dist</span>
            <span class="col header world-header" role="columnheader" data-col="world" data-label="W" title="World">W</span>
            <span class="col new-col-header" role="columnheader" title="Filter new items">🆕</span>
            <span class="col cart-col-header" role="columnheader" title="Add to cart">🛒</span>
        `;

        for (const element of header.querySelectorAll<HTMLElement>('.header')) {
            element.addEventListener('click', () => {
                const col = element.dataset.col as SortColumn | undefined;
                if (col) { deps.sortByColumn(col); }
            });
        }

        // Favorites filter toggle on header star
        const favHeader = header.querySelector('.fav-col-header');
        favHeader?.addEventListener('click', () => {
            favHeader.classList.toggle('active');
            deps.search();
        });

        // New items filter toggle
        const newHeader = header.querySelector('.new-col-header');
        newHeader?.addEventListener('click', () => {
            filterNewOnly = !filterNewOnly;
            newHeader.classList.toggle('active', filterNewOnly);
            deps.search();
        });

        // Cart filter toggle
        const cartHeader = header.querySelector('.cart-col-header');
        cartHeader?.addEventListener('click', () => {
            filterCartOnly = !filterCartOnly;
            cartHeader.classList.toggle('active', filterCartOnly);
            deps.search();
        });

        updateSortArrows();
    }

    function getDeviationDisplayInfo(t: Trade): { devClass: string; devText: string } {
        const deviation = deps.getDeviation()(t);
        if (!deviation) {
            return { devClass: '', devText: '' };
        }
        return { devClass: getDeviationClass(deviation.isGood), devText: deviation.text };
    }

    /**
     * Get favorite status info for a trade's result item
     *
     * Star is filled (active) when:
     * - Item is in favorites with NO threshold (watching at any price)
     * - Item is in favorites WITH threshold AND deviation meets threshold
     * @param t - Trade to evaluate favorite status for
     * @returns Favorite status flags and star CSS class for the trade
     */
    function getFavoriteInfo(t: Trade): { isFavorite: boolean; isDealAlert: boolean; starClass: string } {
        const resultItemNormalized = t.resultName.toLowerCase();
        const favorite = favoritesStore.get(resultItemNormalized);
        const isFavorite = Boolean(favorite);

        if (!favorite) {
            return { isFavorite: false, isDealAlert: false, starClass: 'favorite-star' };
        }

        const deviationResult = deps.getDeviation()(t);
        const deviationPercent = deviationResult?.percent;

        const threshold = favorite.maxDeviation;
        const isDealAlert = threshold !== undefined
            && deviationPercent !== undefined
            && deviationPercent <= threshold;

        const starActive = threshold === undefined || isDealAlert;
        const starClass = starActive ? 'favorite-star active' : 'favorite-star';

        return { isFavorite, isDealAlert, starClass };
    }

    /**
     * Apply status classes (favorite, deal-alert, new-item) to a trade row
     * @param row - DOM element for the trade row
     * @param tradeKey - Unique key identifying the trade
     * @param t - Trade to evaluate for status classes
     * @returns Row class info for use in HTML building
     */
    function applyTradeRowClasses(row: HTMLElement, tradeKey: string, t: Trade): { isFavorite: boolean; starClass: string; inCartClass: string } {
        const { isFavorite, isDealAlert, starClass } = getFavoriteInfo(t);
        const inCartClass = cartStore.has(t) ? ' in-cart' : '';

        if (isFavorite) { row.classList.add('favorite'); }
        if (isDealAlert) { row.classList.add('deal-alert'); }

        if (deps.getNewTradeKeys().has(tradeKey)) {
            row.classList.add('new-item');
            row.dataset.new = 'true';
        }

        return { isFavorite, starClass, inCartClass };
    }

    /**
     * Build the inner HTML for a trade row
     * @param result - Filter result containing trade and match data
     * @param info - Pre-computed row class and key data
     * @param info.isFavorite - Whether the result item is favorited
     * @param info.starClass - CSS class string for the star button
     * @param info.inCartClass - CSS class string suffix for cart button
     * @param info.tradeKey - Unique key for the trade
     * @returns Inner HTML string for the trade row
     */
    function buildTradeRowHTML(result: FilterResult, info: { isFavorite: boolean; starClass: string; inCartClass: string; tradeKey: string }): string {
        const { trade: t, matchResult, matchCost, displayName, displayAmount } = result;
        const { costAmt, costName } = getCostDisplayInfo(t);
        const costDisplay = matchCost && currentGiveRegex ? highlight(costName, currentGiveRegex) : escapeHtml(costName);
        const resultDisplay = matchResult && currentWantRegex ? highlight(displayName, currentWantRegex) : escapeHtml(displayName);
        const { devClass, devText } = getDeviationDisplayInfo(t);
        const { abbrev: worldAbbrev, title: worldTitle } = getWorldDisplayInfo(t.world);
        const stockClass = t.displayStock === 0 ? 'no-stock' : 'in-stock';
        const resultInfoIcon = itemHasDetails(t.resultItem) ? '<button class="info-icon" data-info="result" title="View details">ℹ</button>' : '';
        const costInfoIcon = (itemHasDetails(t.item1) || (t.item2 && itemHasDetails(t.item2))) ? '<button class="info-icon" data-info="cost" title="View details">ℹ</button>' : '';
        const starTitle = info.isFavorite ? 'Edit favorite' : 'Add to favorites';

        return `
            <button class="col ${info.starClass}" role="gridcell" data-item="${escapeHtml(t.resultName)}" title="${starTitle}">★</button>
            <span class="col result-amt" role="gridcell">${displayAmount}</span>
            <span class="col result-name" role="gridcell">${resultDisplay}${resultInfoIcon}</span>
            <span class="col cost-amt" role="gridcell">${costAmt}</span>
            <span class="col cost-name" role="gridcell">${costDisplay}${costInfoIcon}</span>
            <span class="col dev ${devClass}" role="gridcell">${devText}</span>
            <span class="col stock ${stockClass}" role="gridcell">${t.displayStock}</span>
            <span class="col coord distance" role="gridcell" title="X: ${t.x}, Y: ${t.y}, Z: ${t.z}">${Math.round(Math.hypot(t.x, t.z))}</span>
            <span class="col coord world" role="gridcell" title="${worldTitle}">${worldAbbrev}</span>
            <span class="col new-col" role="gridcell"></span>
            <button class="col add-to-cart-btn${info.inCartClass}" role="gridcell" data-trade-key="${info.tradeKey}" title="Add to cart">+</button>
        `;
    }

    /**
     * Create a trade row DOM element for a single result
     * @param result - Filter result to render as a row element
     * @returns Configured DOM element for the trade row
     */
    function createTradeRowElement(result: FilterResult): HTMLElement {
        const { trade: t } = result;

        const row = document.createElement('div');
        row.className = CSS_CLASSES.TRADE_ROW;
        row.setAttribute('role', 'row');
        row.dataset.x = String(t.x);
        row.dataset.y = String(t.y);
        row.dataset.z = String(t.z);
        row.dataset.world = t.world;

        const tradeKey = getTradeKey(t);
        row.dataset.tradeKey = tradeKey;

        const info = applyTradeRowClasses(row, tradeKey, t);
        row.innerHTML = buildTradeRowHTML(result, { ...info, tradeKey });

        // Star button click handler (opens favorites dialog)
        const starButton = row.querySelector('.favorite-star');
        if (starButton) {
            starButton.addEventListener('click', (event) => {
                event.stopPropagation();
                deps.openDialogForItem(t.resultName);
            });
        }

        const cartButton = row.querySelector('.add-to-cart-btn');
        if (cartButton) {
            cartButton.addEventListener('click', (event) => {
                event.stopPropagation();
                cartStore.add(t);
                cartButton.classList.add('in-cart', 'added');
                setTimeout(() => cartButton.classList.remove('added'), 200);
            });
        }

        return row;
    }

    function renderResults(results: readonly FilterResult[], wantRegex: RegExp | undefined, giveRegex: RegExp | undefined): void {
        const container = getElement('results');

        // Update global regex state for the row renderer
        currentWantRegex = wantRegex;
        currentGiveRegex = giveRegex;

        // Handle empty results
        if (results.length === 0) {
            // Clean up virtual scroller if it exists
            if (virtualScroller) {
                virtualScroller.stop();
                virtualScroller = undefined;
            }
            container.innerHTML = '<div class="no-results"><h2>No trades found</h2><p>Try a different search term</p></div>';
            return;
        }

        // Initialize or update virtual scroller
        if (virtualScroller) {
            virtualScroller.setItems(results as FilterResult[]);
        } else {
            virtualScroller = new VirtualScroller(
                container,
                results as FilterResult[],
                createTradeRowElement,
                {
                    getEstimatedItemHeight: () => 32,
                    getItemId: (item: FilterResult) => `${item.trade.x}-${item.trade.y}-${item.trade.z}-${item.trade.resultName}-${item.trade.costName}`
                }
            );
        }
    }

    return {
        renderHeader,
        renderResults,
        updateSortArrows,
        isFilterNewOnly: () => filterNewOnly,
        isFilterCartOnly: () => filterCartOnly,
    };
}
