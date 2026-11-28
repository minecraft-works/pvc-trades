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

import { html, nothing, render, type TemplateResult } from 'lit-html';

import {
    COLUMNS,
    CSS_CLASSES,
    SORT,
} from '../constants.js';
import { getItemFacts } from '../item-facts.js';
import { formatTradeCostNames, getCostParts, highlightSegments } from '../library.js';
import { getTradeKey, isNether } from '../map/map-math.js';
import { getOverworldDistanceFromOrigin } from '../routing/route-optimizer.js';
import { isEstimate } from '../search/deviation.js';
import type { DeviationResult } from '../search/index.js';
import { formatUnitPrice } from '../search/query.js';
import { getRealStock, isAdminShop } from '../search/shop-filter.js';
import { cartStore, favoritesStore } from '../stores/index.js';
import type {
    EmptyResultsHint,
    FilterResult,
    Item,
    SortColumn,
    SortDirection,
    Trade,
} from '../types.js';
import { replaceContent } from './render.js';
import { createTradeContextMenu, type TradeContextMenu } from './trade-context-menu.js';
import { createVirtualList, type VirtualList } from './virtual-list.js';

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
    renderResults: (results: readonly FilterResult[], wantRegex: RegExp | undefined, giveRegex: RegExp | undefined, emptyHint?: EmptyResultsHint) => void;
    /** Update sort arrow indicators in the header */
    updateSortArrows: () => void;
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
    const parts = getCostParts(t);
    return { costAmt: parts.map(part => part.amount).join('+'), costName: formatTradeCostNames(t) };
}

/**
 * Per-item price badge for the cost cell. Only shown for single-item costs
 * (a shulker of one kind counts as its contents) when more than one item is
 * received; otherwise the cost column already is the per-item price.
 * @param t - Trade
 * @param displayAmount - Number of items received (shulker contents counted)
 * @returns The badge, or nothing
 */
function getUnitPrice(t: Trade, displayAmount: number): TemplateResult | typeof nothing {
    const [cost, ...rest] = getCostParts(t);
    // Mixed shulkers keep their own name, so the badge would be meaningless
    if (!cost || rest.length > 0 || displayAmount <= 1 || cost.name.includes('(')) { return nothing; }
    const text = formatUnitPrice(cost.amount, displayAmount);
    return text ? html`<span class="unit-price" title="Price per item">${text}</span>` : nothing;
}

/**
 * Text with the search matches wrapped in <mark>
 * @param text - Text to show
 * @param regex - Search highlight, if the query matched this text
 * @returns The text, highlighted when there is a regex
 */
function highlight(text: string, regex: RegExp | undefined): TemplateResult | string {
    if (!regex) { return text; }
    const parts = highlightSegments(text, regex).map(segment => segment.match ? mark(segment.text) : segment.text);
    return html`${parts}`;
}

/**
 * A search match
 * @param text - Matched text
 * @returns The text in a <mark>
 */
function mark(text: string): TemplateResult {
    return html`<mark>${text}</mark>`;
}

/**
 * Shop name and owner for the distance cell's tooltip
 * @param t - Trade
 * @returns A new line with the shop, or an empty string when the owner is unknown
 */
function getShopTitle(t: Trade): string {
    if (!t.shopOwner) { return ''; }
    if (isAdminShop(t)) { return t.shopName ? `\n${t.shopName} (admin shop)` : '\nAdmin shop'; }
    return t.shopName ? `\n${t.shopName} by ${t.shopOwner}` : `\nShop of ${t.shopOwner}`;
}

/**
 * The seller's name for a shulker box or bundle, shown after the item name
 * @param label - Seller-given name, if any
 * @param displayName - Item name shown in the cell
 * @param regex - Search highlight, if the Buying query matched
 * @returns The label (nothing without one) and the cell's tooltip
 */
function getResultLabel(label: string | undefined, displayName: string, regex: RegExp | undefined): { content: TemplateResult | typeof nothing; title: string } {
    if (!label) { return { content: nothing, title: displayName }; }
    return {
        content: html`<span class="item-label" title="Name the seller gave it">“${highlight(label, regex)}”</span>`,
        title: `${displayName} “${label}”`,
    };
}

/**
 * Badge with a fact from the lore of the shown items, e.g. the area a protection block covers
 * @param items - Items of the cell
 * @param kind - Which fact: the size comes before the name, a restriction after it
 * @returns The badge, or nothing when the lore has no such fact
 */
function getFactBadge(items: readonly (Item | undefined)[], kind: 'size' | 'restriction'): TemplateResult | typeof nothing {
    const facts = items.flatMap(item => {
        const fact = item ? getItemFacts(item)[kind] : undefined;
        return fact === undefined ? [] : [fact];
    });
    return facts.length > 0 ? html`<span class="item-tag item-tag-${kind}" title="From the item's lore">${facts.join(' + ')}</span>` : nothing;
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

/**
 * Run a handler on click and on Enter/Space, so header controls work from the keyboard.
 * @param element - Focusable header element
 * @param handler - Action to run
 */
function onActivate(element: Readonly<Element>, handler: () => void): void {
    element.addEventListener('click', handler);
    element.addEventListener('keydown', (event) => {
        if (!(event instanceof KeyboardEvent) || (event.key !== 'Enter' && event.key !== ' ')) { return; }
        event.preventDefault();
        handler();
    });
}

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
export function createTradeRendererHandler(deps: TradeRendererDeps): TradeRendererHandler {
    // Internal filter and rendering state
    let filterCartOnly = false;
    let virtualList: VirtualList<FilterResult> | undefined;
    let currentWantRegex: RegExp | undefined;
    let currentGiveRegex: RegExp | undefined;
    let contextMenu: TradeContextMenu | undefined;

    function getContextMenu(): TradeContextMenu {
        contextMenu ??= createTradeContextMenu();
        return contextMenu;
    }
    /** Valid sort column identifiers for dataset.col type narrowing */
    const VALID_SORT_COLUMNS: ReadonlySet<string> = new Set<SortColumn>(
        ['result-amt', 'result-name', 'cost-amt', 'cost-name', 'stock', 'dev', 'world', 'distance']
    );

    function isSortColumn(value: string): value is SortColumn {
        return VALID_SORT_COLUMNS.has(value);
    }

    function getArrow(col: string): string {
        if (!isSortColumn(col)) { return ''; }
        const direction = deps.getActiveSorts().get(col);
        if (!direction) { return ''; }
        return direction === SORT.ASC ? '↑' : '↓';
    }

    function updateSortArrows(): void {
        const [primaryColumn, primaryDirection] = [...deps.getActiveSorts().entries()][0] ?? [];
        for (const element of document.querySelectorAll<HTMLElement>('#table-header .header')) {
            const label = element.dataset.label ?? '';
            const col = element.dataset.col ?? '';
            const arrow = getArrow(col);
            element.textContent = RIGHT_ALIGNED_COLS.has(col) ? arrow + label : label + arrow;
            element.classList.toggle('active-sort', isSortColumn(col) && deps.getActiveSorts().has(col));
            element.removeAttribute('aria-sort');
            if (col === primaryColumn) {
                element.setAttribute('aria-sort', primaryDirection === SORT.ASC ? 'ascending' : 'descending');
            }
        }
    }

    function renderHeader(): void {
        const header = getElement('table-header');
        // The row role only once it has cells: an empty row is invalid ARIA
        header.setAttribute('role', 'row');
        replaceContent(header, html`
            <span class="col fav-col-header" role="columnheader" tabindex="0" title="Show only watchlist items">★<span id="favorites-badge" class="favorites-badge hidden"></span></span>
            <span class="col header amt" role="columnheader" tabindex="0" data-col="result-amt" data-label="#" aria-label="Item amount">#</span>
            <span class="col header" role="columnheader" tabindex="0" data-col="result-name" data-label="Item">Item</span>
            <span class="col header amt" role="columnheader" tabindex="0" data-col="cost-amt" data-label="#" aria-label="Cost amount">#</span>
            <span class="col header" role="columnheader" tabindex="0" data-col="cost-name" data-label="Cost">Cost</span>
            <span class="col header dev-header" role="columnheader" tabindex="0" data-col="dev" data-label="Deal" title="Price compared with other shops (negative is cheaper)">Deal</span>
            <span class="col header stock-header" role="columnheader" tabindex="0" data-col="stock" data-label="Stock">Stock</span>
            <span class="col header distance-header" role="columnheader" tabindex="0" data-col="distance" data-label="Dist" title="Overworld distance from 0, 0 (Nether coordinates ×8)">Dist</span>
            <span class="col header world-header" role="columnheader" tabindex="0" data-col="world" data-label="W" title="World">W</span>
            <span class="col cart-col-header" role="columnheader" tabindex="0" title="Show only trades in cart">🛒</span>
        `);

        for (const element of header.querySelectorAll<HTMLElement>('.header')) {
            onActivate(element, () => {
                const col = element.dataset.col ?? '';
                if (isSortColumn(col)) { deps.sortByColumn(col); }
            });
        }

        // Favorites filter toggle on header star
        const favHeader = header.querySelector('.fav-col-header');
        if (favHeader) {
            onActivate(favHeader, () => {
                favHeader.classList.toggle('active');
                deps.search();
            });
        }

        // Cart filter toggle
        const cartHeader = header.querySelector('.cart-col-header');
        if (cartHeader) {
            onActivate(cartHeader, () => {
                filterCartOnly = !filterCartOnly;
                cartHeader.classList.toggle('active', filterCartOnly);
                deps.search();
            });
        }

        updateSortArrows();
    }

    function getDeviationDisplayInfo(t: Trade): { devClass: string; devText: string; dealTitle: string } {
        const deviation = deps.getDeviation()(t);
        if (!deviation) {
            return { devClass: 'no-data', devText: '—', dealTitle: 'Not enough independent shops to judge this price' };
        }
        const dealTitle = deviation.basis === 'same-currency'
            ? `Compared with other shops selling ${t.resultName} for ${formatTradeCostNames(t)}`
            : `Estimate: too few shops sell ${t.resultName} for ${formatTradeCostNames(t)}, so this is converted from prices in other currencies. Not used for deals or alerts.`;
        const estimateClass = isEstimate(deviation) ? ' deal-estimate' : '';
        return { devClass: `${getDeviationClass(deviation.isGood)}${estimateClass}`, devText: deviation.text, dealTitle };
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
        // Estimates across currencies never trigger a watchlist alert
        const deviationPercent = deviationResult && !isEstimate(deviationResult) ? deviationResult.percent : undefined;

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
     * Build the content of a trade row
     * @param result - Filter result containing trade and match data
     * @param info - Pre-computed row class and key data
     * @param info.isFavorite - Whether the result item is favorited
     * @param info.starClass - CSS class string for the star button
     * @param info.inCartClass - CSS class string suffix for cart button
     * @param info.tradeKey - Unique key for the trade
     * @returns Template for the row's cells
     */
    function buildTradeRowTemplate(result: FilterResult, info: { isFavorite: boolean; starClass: string; inCartClass: string; tradeKey: string }): TemplateResult {
        const { trade: t, matchResult, matchCost, displayName, displayAmount } = result;
        const { costAmt, costName } = getCostDisplayInfo(t);
        const costDisplay = highlight(costName, matchCost ? currentGiveRegex : undefined);
        const wantHighlight = matchResult ? currentWantRegex : undefined;
        const resultDisplay = highlight(displayName, wantHighlight);
        const resultLabel = getResultLabel(t.resultLabel, displayName, wantHighlight);
        const { devClass, devText, dealTitle } = getDeviationDisplayInfo(t);
        const { abbrev: worldAbbrev, title: worldTitle } = getWorldDisplayInfo(t.world);
        const stockClass = t.displayStock === 0 ? 'no-stock' : 'in-stock';
        // Admin shops report a placeholder: their stock is unlimited
        const realStock = getRealStock(t);
        const stockTitle = realStock === undefined ? 'Admin shop: unlimited stock' : nothing;
        const resultInfoIcon = itemHasDetails(t.resultItem) ? html`<button class="info-icon" data-info="result" title="View details">ℹ</button>` : nothing;
        const costInfoIcon = (itemHasDetails(t.item1) || (t.item2 && itemHasDetails(t.item2))) ? html`<button class="info-icon" data-info="cost" title="View details">ℹ</button>` : nothing;
        const starTitle = info.isFavorite ? 'Edit favorite' : 'Add to favorites';
        const coordsTitle = `X: ${t.x}, Y: ${t.y}, Z: ${t.z}`;
        const distanceTitle = (isNether(t.world) ? `${coordsTitle} (Nether; distance shown in overworld blocks)` : coordsTitle) + getShopTitle(t);

        const onStarClick = (event: Event): void => {
            event.stopPropagation();
            deps.openDialogForItem(t.resultName);
        };
        const onCartClick = (event: Event): void => {
            event.stopPropagation();
            const cartButton = event.currentTarget;
            if (!(cartButton instanceof HTMLElement)) { return; }
            cartStore.add(t);
            cartButton.classList.add('in-cart', 'added');
            setTimeout(() => cartButton.classList.remove('added'), 200);
        };

        return html`
            <button class="col ${info.starClass}" role="gridcell" data-item="${t.resultName}" title="${starTitle}" aria-label="${starTitle}: ${t.resultName}" @click=${onStarClick}>★</button>
            <span class="col result-amt" role="gridcell">${displayAmount}</span>
            <span class="col result-name" role="gridcell" title="${resultLabel.title}">${getFactBadge([t.resultItem], 'size')}<span class="name-text">${resultDisplay}</span>${resultLabel.content}${getFactBadge([t.resultItem], 'restriction')}${resultInfoIcon}</span>
            <span class="col cost-amt" role="gridcell">${costAmt}</span>
            <span class="col cost-name" role="gridcell" title="${costName}">${getFactBadge([t.item1, t.item2], 'size')}<span class="name-text">${costDisplay}</span>${getFactBadge([t.item1, t.item2], 'restriction')}${costInfoIcon}${getUnitPrice(t, displayAmount)}</span>
            <span class="col dev ${devClass}" role="gridcell" title="${dealTitle}">${devText}</span>
            <span class="col stock ${stockClass}" role="gridcell" title=${stockTitle}>${realStock ?? '∞'}</span>
            <span class="col coord distance" role="gridcell" title="${distanceTitle}">${Math.round(getOverworldDistanceFromOrigin(t))}</span>
            <span class="col coord world" role="gridcell" title="${worldTitle}">${worldAbbrev}</span>
            <button class="col add-to-cart-btn${info.inCartClass}" role="gridcell" data-trade-key="${info.tradeKey}" title="Add to cart (+ on a focused row)" aria-label="Add ${t.resultName} to cart" @click=${onCartClick}>+</button>
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
        // Focusable so the row's "open map" action works from the keyboard
        row.tabIndex = 0;
        row.dataset.x = String(t.x);
        row.dataset.y = String(t.y);
        row.dataset.z = String(t.z);
        row.dataset.world = t.world;
        getContextMenu().bind(row, result);

        const tradeKey = getTradeKey(t);
        row.dataset.tradeKey = tradeKey;

        const info = applyTradeRowClasses(row, tradeKey, t);
        // A new element per row: rendered once, never diffed
        render(buildTradeRowTemplate(result, { ...info, tradeKey }), row);

        return row;
    }

    function renderResults(results: readonly FilterResult[], wantRegex: RegExp | undefined, giveRegex: RegExp | undefined, emptyHint?: EmptyResultsHint): void {
        const container = getElement('results');

        // Update global regex state for the row renderer
        currentWantRegex = wantRegex;
        currentGiveRegex = giveRegex;

        const status = document.querySelector('#results-status');
        if (status) {
            status.textContent = results.length === 1 ? '1 trade found' : `${results.length.toLocaleString()} trades found`;
        }

        // Handle empty results
        if (results.length === 0) {
            virtualList?.destroy();
            virtualList = undefined;
            const hint = emptyHint
                ? html`<p class="no-results-hint">${emptyHint.message} · <button type="button" class="no-results-action" @click=${emptyHint.onAction}>${emptyHint.actionLabel}</button></p>`
                : html`<p>Try a different search term</p>`;
            replaceContent(container, html`<div class="no-results" role="row"><div role="gridcell"><h2>No trades found</h2>${hint}</div></div>`);
            return;
        }

        if (!virtualList) {
            // Drop a "no results" or load-error message before the list takes over
            container.replaceChildren();
            virtualList = createVirtualList(container, createTradeRowElement);
        }
        virtualList.setItems(results);
    }

    return {
        renderHeader,
        renderResults,
        updateSortArrows,
        isFilterCartOnly: () => filterCartOnly,
    };
}
