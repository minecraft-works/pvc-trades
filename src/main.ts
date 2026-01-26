/**
 * Main application entry point for Shop Trade Viewer
 * 
 * This module handles:
 * - DOM initialization and event binding
 * - Search state management
 * - Rendering trade results and UI components
 * - Dynmap integration for map display
 * 
 * ## FILE NAVIGATION (for AI assistants)
 * 
 * This file is organized into sections marked with `// ===...` separators.
 * Use these line numbers to jump to sections:
 * 
 * | Section | Line | Description |
 * |---------|------|-------------|
 * | Types | ~68 | Local interfaces (DeviationResult) |
 * | Dialog Utilities | ~79 | setupDialogBackdropClose, openDialog |
 * | State | ~128 | Global state variables |
 * | Constants | ~188 | CSS classes, selectors, magic numbers |
 * | Shopping Cart Functions | ~209 | Cart CRUD operations |
 * | Navigation Progress | ~303 | Route completion tracking |
 * | DOM Helpers | ~538 | getElement helper |
 * | Data Loading | ~552 | loadShops, processRawData |
 * | Search & Sort | ~610 | debouncedSearch, sortByColumn |
 * | Deviation Calculation | ~743 | getDeviation, deviationCache |
 * | Rendering | ~779 | createTradeRowElement, renderResults |
 * | Matrix Dialog | ~947 | Exchange rate matrix UI |
 * | Map Dialog | ~1034 | Leaflet map, tile loading |
 * | Cart Dialog | ~1613 | Cart items, timeline |
 * | Tab Switching | ~1817 | Cart dialog tabs |
 * | Live Navigation | ~1879 | Player polling, auto-advance |
 * | Shop Tooltip | ~2521 | Proximity-based shop info |
 * | Navigation Map | ~2738 | Navigation-specific map |
 * | Initialization | ~3107 | DOMContentLoaded setup |
 * 
 * ## KEY PATTERNS
 * 
 * - State persistence: localStorage with try/catch
 * - Event delegation: Single listener on parent for dynamic children
 * - Virtual scrolling: For trade list performance
 * - Leaflet maps: Custom tile loading with caching
 * 
 * @module main
 */

import {
    getRegex,
    formatName,
    highlight,
    escapeHtml,
    processTrade,
    filterTrade,
    calculateItemValues,
    getTrustedItemValue,
    loadFixedRatios,
    loadBaseItems,
    loadConfig,
    getConfig,
    buildRatioGraph,
    getRatio,
    getCoreBlocks,
    getWorldId,
    getTileCoords,
    calculateFitZoom,
    toLeafletCoords,
    toLeafletCoordsRelative,
    fromLeafletCoordsRelative,
    clampToCircle,
    calculateRouteDistance,
    computeOptimalOrder,
    isNether,
    toOverworldEquivalent,
    getTradeKey,
    aggregateShoppingList,
    calculateTotalRouteDistance,
    buildMarkerContent,
    buildStopTooltip
} from './library.js';

import { debugNavigation, debugPlayerPoll, debugMap, debugTiles } from './debug.js';

import VirtualScroller from 'virtual-scroller/dom';

import type {
    Trade,
    FilterResult,
    ItemValues,
    RatioGraph,
    MappingRule,
    ShopData,
    SortColumn,
    SortDirection,
    Player,
    PlayersData,
    RouteStop,
    ShoppingList,
    NavigationProgress,
    NavigationMode
} from './types.js';

import { NAV_STORAGE_KEY, NAV_PLAYER_KEY, NAV_TAB_KEY, NAV_MODE_KEY } from './types.js';

import {
    NAVIGATION,
    DEVIATION,
    SORT,
    CSS_CLASSES,
    SELECTORS,
    DIALOG_IDS,
    WORLDS,
    COLUMNS
} from './constants.js';

import { cartStore } from './stores/index.js';

import * as L from 'leaflet';

// ============================================================================
// Types
// ============================================================================

interface DeviationResult {
    ratio: number;
    percent: number;  // Rounded integer for sorting
    text: string;
    isGood: boolean | undefined;
}

// ============================================================================
// Dialog Utilities
// ============================================================================

/**
 * Set up a dialog to close when clicking on backdrop (outside the dialog box)
 * Only closes if both mousedown and mouseup happen outside the dialog,
 * preventing accidental closes when panning a map and releasing outside.
 */
function setupDialogBackdropClose(dialog: HTMLDialogElement): void {
    let mouseDownOutside = false;
    
    const isOutsideDialog = (event: MouseEvent): boolean => {
        const rect = dialog.getBoundingClientRect();
        return (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
        );
    };
    
    dialog.addEventListener('mousedown', event => {
        mouseDownOutside = isOutsideDialog(event);
    });
    
    dialog.addEventListener('click', event => {
        if (mouseDownOutside && isOutsideDialog(event)) {
            dialog.close();
        }
        mouseDownOutside = false;
    });
}

/**
 * Open a dialog with content preparation
 */
function openDialog(dialogId: string, prepare?: () => void): void {
    const dialog = document.querySelector<HTMLDialogElement>(`#${dialogId}`);
    if (!dialog) {
        return;
    }
    
    if (prepare) {
        prepare();
    }
    dialog.showModal();
}

// ============================================================================
// State
// ============================================================================

let allTrades: Trade[] = [];
let mappingRules: MappingRule[] = [];
let itemValues: ItemValues | undefined;
let ratioGraph: RatioGraph | undefined;

// Column order for sort priority (left to right)
const COLUMN_ORDER: SortColumn[] = [COLUMNS.RESULT_AMT, COLUMNS.RESULT_NAME, COLUMNS.COST_AMT, COLUMNS.COST_NAME, 'dev', 'stock', 'distance', 'world'];

// Multi-column sort state
const activeSorts = new Map<SortColumn, SortDirection>([['dev', SORT.ASC]]);

let cachedRegex: RegExp | undefined;
let cachedPattern = '';
let searchDebounceTimer: number | undefined;
const deviationCache = new Map<Trade, DeviationResult | undefined>();

// Virtual scroller instance for performance
let virtualScroller: VirtualScroller<FilterResult> | undefined;

// Current regex patterns for highlighting (used by virtual scroller render)
let currentWantRegex: RegExp | undefined;
let currentGiveRegex: RegExp | undefined;

// Flag to track if map was opened from cart (for back navigation)
let mapOpenedFromCart = false;

// Navigation progress state
let navProgress: NavigationProgress = {
    completedKeys: new Set(),
    currentIndex: 0
};

// Live navigation state
let isNavigating = false;
let navMode: NavigationMode = 'follow';
let navPlayerRefreshInterval: ReturnType<typeof setInterval> | undefined;
let currentPlayerPosition: { x: number; y: number; z: number; world: string; yaw?: number } | undefined;
let navPlayerMarker: L.Marker | undefined;

// Shop data refresh interval (assigned for potential future stop functionality)
let _shopRefreshInterval: ReturnType<typeof setInterval> | undefined;

// ============================================================================
// Cart Helper Functions
// ============================================================================

/**
 * Remove items with zero quantity from cart
 * Called when cart dialog is closed
 */
function cleanupZeroQuantityItems(): void {
    if (cartStore.cleanupZeroQuantity()) {
        refreshCartButtonStates();
    }
}

/**
 * Clear the entire cart and reset navigation progress
 */
function clearCart(): void {
    cartStore.clear();
    // Reset navigation progress when cart is cleared
    navProgress = { completedKeys: new Set(), currentIndex: 0 };
    saveNavProgress();
}

// ============================================================================
// Navigation Progress
// ============================================================================

/**
 * Load navigation progress from localStorage
 */
function loadNavProgress(): void {
    try {
        const stored = localStorage.getItem(NAV_STORAGE_KEY);
        if (stored) {
            const data: unknown = JSON.parse(stored);
            if (data && typeof data === 'object' && 'completedKeys' in data) {
                const typedData = data as { completedKeys?: string[]; currentIndex?: number };
                navProgress = {
                    completedKeys: new Set(typedData.completedKeys),
                    currentIndex: typedData.currentIndex ?? 0
                };
            }
        }
    } catch {
        navProgress = { completedKeys: new Set(), currentIndex: 0 };
    }
}

/**
 * Save navigation progress to localStorage
 */
function saveNavProgress(): void {
    try {
        localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify({
            completedKeys: [...navProgress.completedKeys],
            currentIndex: navProgress.currentIndex
        }));
    } catch {
        // Storage full or unavailable - ignore
    }
}

/**
 * Sync navigation progress with current cart
 * Removes completed keys for items no longer in cart
 * Recalculates current index
 */
function syncNavProgressWithCart(route: RouteStop[]): void {
    // Get keys of all shop stops in current route
    const currentShopKeys = new Set(
        route
            .filter(stop => stop.type === 'shop' && stop.cartItem)
            .map(stop => getTradeKey(stop.cartItem!.trade))
    );
    
    // Remove completed keys that are no longer in cart
    const validCompleted = new Set(
        [...navProgress.completedKeys].filter(key => currentShopKeys.has(key))
    );
    
    // Find first non-completed shop stop index
    let currentIndex = 0;
    for (let index = 0; index < route.length; index++) {
        const stop = route[index];
        if (stop?.type === 'shop' && stop.cartItem) {
            const key = getTradeKey(stop.cartItem.trade);
            if (!validCompleted.has(key)) {
                currentIndex = index;
                break;
            }
        }
        // If we reach the end, all are completed
        if (index === route.length - 1) {
            currentIndex = route.length;
        }
    }
    
    navProgress = {
        completedKeys: validCompleted,
        currentIndex
    };
    saveNavProgress();
}

/**
 * Toggle completion status of a route stop
 */
function toggleStopCompletion(stop: RouteStop, route: RouteStop[]): void {
    if (stop.type !== 'shop' || !stop.cartItem) { return; }
    
    const key = getTradeKey(stop.cartItem.trade);
    
    if (navProgress.completedKeys.has(key)) {
        navProgress.completedKeys.delete(key);
    } else {
        navProgress.completedKeys.add(key);
    }
    
    // Recalculate current index
    syncNavProgressWithCart(route);
    saveNavProgress();
    
    // Re-render both cart and navigate tabs
    renderCartDialog();
    renderNavigateTab();
    
    // If navigation is active, recalculate the route to exclude completed items
    if (isNavigating && currentPlayerPosition) {
        recalculateRouteFromPlayer();
        updatePlayerToNextLine();
        updateLiveDistance();
    }
}

/**
 * Update the cart badge count
 */
function updateCartBadge(): void {
    const badge = document.querySelector('#cart-badge');
    if (badge) {
        const count = cartStore.totalQuantity;
        badge.textContent = count > 0 ? String(count) : '';
        badge.classList.toggle('hidden', count === 0);
    }
}

/**
 * Refresh the in-cart state of all visible cart buttons
 * Call this after cart modifications (remove, clear) to update button styling
 */
function refreshCartButtonStates(): void {
    const buttons = document.querySelectorAll<HTMLElement>('.add-to-cart-btn[data-trade-key]');
    const cartKeys = new Set(cartStore.items.map(item => getTradeKey(item.trade)));
    
    for (const button of buttons) {
        const key = button.dataset.tradeKey;
        if (key) {
            button.classList.toggle('in-cart', cartKeys.has(key));
        }
    }
}

/**
 * Aggregate cart into shopping lists
 */
function getShoppingList(): ShoppingList {
    return aggregateShoppingList(cartStore.items);
}

interface RouteOrigin {
    x: number;
    z: number;
    world: string;
}

/**
 * Compute optimal route using nearest-neighbor + 2-opt optimization
 * @param origin - Optional starting position (defaults to 0,0 in overworld)
 * @param excludeCompleted - If true, exclude items marked as collected
 */
function computeRoute(origin?: RouteOrigin, excludeCompleted = false): RouteStop[] {
    if (cartStore.isEmpty) { return []; }
    
    // Filter cart items: exclude qty=0 and optionally completed items
    let activeItems = cartStore.items.filter(item => item.quantity > 0);
    if (excludeCompleted) {
        activeItems = activeItems.filter(item => !navProgress.completedKeys.has(getTradeKey(item.trade)));
    }
    
    if (activeItems.length === 0) { return []; }
    
    // Convert cart items to RoutePoints for optimization
    const points = activeItems.map(item => ({
        x: item.trade.x,
        z: item.trade.z,
        world: item.trade.world
    }));
    
    // Get optimized order using lib functions, passing origin if provided
    const order = computeOptimalOrder(points, origin);
    
    // Build route with shop stops only
    const route: RouteStop[] = [];
    
    for (const index of order) {
        const item = activeItems[index]!;
        const stopIsNether = isNether(item.trade.world);
        const displayCoords = toOverworldEquivalent(item.trade.x, item.trade.z, item.trade.world);
        route.push({
            type: 'shop',
            x: item.trade.x,
            y: item.trade.y,
            z: item.trade.z,
            world: item.trade.world,
            displayX: displayCoords.x,
            displayZ: displayCoords.z,
            isNether: stopIsNether,
            cartItem: item
        });
    }
    
    return route;
}

/**
 * Get all cart items as RouteStops (for display purposes - includes completed items)
 * Completed items are included but can be identified via navProgress.completedKeys
 */
function getAllCartStops(): RouteStop[] {
    const activeItems = cartStore.items.filter(item => item.quantity > 0);
    
    return activeItems.map(item => {
        const stopIsNether = isNether(item.trade.world);
        const displayCoords = toOverworldEquivalent(item.trade.x, item.trade.z, item.trade.world);
        return {
            type: 'shop' as const,
            x: item.trade.x,
            y: item.trade.y,
            z: item.trade.z,
            world: item.trade.world,
            displayX: displayCoords.x,
            displayZ: displayCoords.z,
            isNether: stopIsNether,
            cartItem: item
        };
    });
}

// ============================================================================
// DOM Helpers
// ============================================================================

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id) as T | null;
    if (!element) { throw new Error(`Element #${id} not found`); }
    return element;
}

function getInputValue(id: string): string {
    return getElement<HTMLInputElement>(id).value.trim().toLowerCase();
}

// ============================================================================
// Data Loading
// ============================================================================

/**
 * Refresh shop data from remote API
 * Returns the number of new trades detected (for future highlighting feature)
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
        const previousTradeCount = allTrades.length;
        
        processShops(data.data);
        
        // Recalculate item values
        itemValues = calculateItemValues(allTrades.map(t => ({
            resultName: t.resultName,
            resultAmount: t.resultAmount,
            costName: t.costName,
            costAmount: t.item1.amount,
            item2: t.item2,
            x: t.x, y: t.y, z: t.z
        })), 'emerald');
        
        ratioGraph = buildRatioGraph(itemValues);
        
        // Refresh the search results
        search();
        
        const newTradeCount = allTrades.length - previousTradeCount;
        if (newTradeCount > 0) {
            console.log(`Shop data refreshed: ${newTradeCount} new trades`);
        }
        
        return Math.max(0, newTradeCount);
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
            loadConfig()
        ]);

        const config = getConfig();
        const [dataResponse, mappingResponse] = await Promise.all([
            fetch(config.dataUrl),
            fetch('trade_conversions.json')
        ]);

        if (!dataResponse.ok || !mappingResponse.ok) {
            throw new Error('Failed to load shop data');
        }

        const data = (await dataResponse.json()) as ShopData;
        mappingRules = (await mappingResponse.json()) as MappingRule[];
        processShops(data.data);

        // Calculate item values for deviation column
        itemValues = calculateItemValues(allTrades.map(t => ({
            resultName: t.resultName,
            resultAmount: t.resultAmount,
            costName: t.costName,
            costAmount: t.item1.amount,
            item2: t.item2,
            x: t.x, y: t.y, z: t.z
        })), 'emerald');

        // Build ratio graph for matrix
        ratioGraph = buildRatioGraph(itemValues);

        renderHeader();
        search(); // Show all trades on load
        
        // Start background refresh interval
        if (config.dataRefreshMs && config.dataRefreshMs > 0) {
            _shopRefreshInterval = setInterval(() => void refreshShopData(), config.dataRefreshMs);
        }
    } catch (error) {
        console.error('Failed to load shop data:', error);
        getElement('results').innerHTML =
            '<div class="no-results"><h2>Error loading data</h2><p>Please refresh the page</p></div>';
    }
}

function processShops(shops: ShopData['data']): void {
    allTrades = [];
    for (const shop of shops) {
        for (const recipe of shop.recipes) {
            allTrades.push(processTrade(recipe, shop, mappingRules));
        }
    }
}

// ============================================================================
// Search & Sort
// ============================================================================

function getCachedRegex(pattern: string): RegExp {
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

function search(): void {
    const wantQuery = getInputValue('searchWant');
    const giveQuery = getInputValue('searchGive');

    const wantRegex = wantQuery ? getCachedRegex(wantQuery) : undefined;
    const giveRegex = giveQuery ? getCachedRegex(giveQuery) : undefined;
    const results: FilterResult[] = [];

    for (const trade of allTrades) {
        const result = filterTrade(trade, wantQuery, giveQuery);
        if (result) { results.push(result); }
    }

    sortResults(results);
    renderResults(results, wantRegex, giveRegex);
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
    updateSortArrows();
    search();
}

function sortResults(results: FilterResult[]): void {
    if (activeSorts.size === 0) {
        return; // No sorting applied
    }
    
    // Get active columns in left-to-right order
    const sortColumns = COLUMN_ORDER.filter(col => activeSorts.has(col));
    
    results.sort((a, b) => {
        for (const column of sortColumns) {
            const direction = activeSorts.get(column)!;
            const cmp = compareByColumn(a, b, column, direction);
            if (cmp !== 0) {return cmp;}
        }
        return 0;
    });
}

function compareDeviation(ta: Trade, tb: Trade): number {
    const deviationA = getDeviation(ta);
    const deviationB = getDeviation(tb);
    if (!deviationA && !deviationB) {return 0;}
    if (!deviationA) {return 1;}
    if (!deviationB) {return -1;}
    return deviationA.percent - deviationB.percent;
}

function getTotalCostAmount(t: Trade): number {
    return t.item1.amount + (t.item2?.amount || 0);
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

// ============================================================================
// Deviation Calculation
// ============================================================================

function getDeviation(trade: Trade): DeviationResult | undefined {
    if (deviationCache.has(trade)) {
        return deviationCache.get(trade);
    }

    if (!itemValues) { return undefined; }

    const costValue = getTrustedItemValue(trade.costName, itemValues);
    const resultValue = getTrustedItemValue(trade.resultName, itemValues);

    if (costValue === undefined || resultValue === undefined) { return undefined; }

    const expectedRate = resultValue / costValue;
    const actualRate = trade.item1.amount / trade.resultAmount;

    const ratio = actualRate / expectedRate;
    const percent = Math.max(DEVIATION.MIN_PERCENT, Math.min(DEVIATION.MAX_PERCENT, Math.round((ratio - 1) * 100)));

    if (percent === 0) {
        const result = { ratio, percent, text: '0%', isGood: undefined };
        deviationCache.set(trade, result);
        return result;
    }

    const isGood = percent < 0;
    const text = percent > 0 ? `+${percent}%` : `−${Math.abs(percent)}%`;
    const result = { ratio, percent, text, isGood };
    deviationCache.set(trade, result);

    return result;
}

// ============================================================================
// Rendering
// ============================================================================

function getArrow(col: string): string {
    const direction = activeSorts.get(col as SortColumn);
    if (!direction) {return '';}
    return direction === SORT.ASC ? '↑' : '↓';
}

// Right-aligned columns get arrow before label, left-aligned get arrow after
const RIGHT_ALIGNED_COLS = new Set([COLUMNS.RESULT_AMT, COLUMNS.COST_AMT, 'stock', 'dev', 'distance', 'world']);

function updateSortArrows(): void {
    for (const element of document.querySelectorAll<HTMLElement>('#table-header .header')) {
        const label = element.dataset['label'] ?? '';
        const col = element.dataset['col'] ?? '';
        const arrow = getArrow(col);
        element.textContent = RIGHT_ALIGNED_COLS.has(col) ? arrow + label : label + arrow;
        element.classList.toggle('active-sort', activeSorts.has(col as SortColumn));
    }
}

function renderHeader(): void {
    const header = getElement('table-header');
    header.innerHTML = `
        <span class="col header amt" data-col="result-amt" data-label="#">#</span>
        <span class="col header" data-col="result-name" data-label="Item">Item</span>
        <span class="col header amt" data-col="cost-amt" data-label="#">#</span>
        <span class="col header" data-col="cost-name" data-label="Cost">Cost</span>
        <span class="col header dev-header" data-col="dev" data-label="Deal" title="Deal quality vs expected price">Deal</span>
        <span class="col header stock-header" data-col="stock" data-label="Stock">Stock</span>
        <span class="col header distance-header desktop-only" data-col="distance" data-label="Distance" title="Distance from origin (X, Z)">Distance</span>
        <span class="col header distance-header mobile-only" data-col="distance" data-label="Dist" title="Distance from origin (X, Z)">Dist</span>
        <span class="col header world-header" data-col="world" data-label="W" title="World">W</span>
        <span class="col cart-col-header" title="Add to cart"></span>
    `;

    for (const element of header.querySelectorAll<HTMLElement>('.header')) {
        element.addEventListener('click', () => {
            const col = element.dataset['col'] as SortColumn | undefined;
            if (col) { sortByColumn(col); }
        });
    }

    updateSortArrows();
}

function getCostDisplayInfo(t: Trade): { costAmt: string; costName: string } {
    let costAmt = String(t.item1.amount);
    let costName = t.costName;
    if (t.item2) {
        costAmt += '+' + t.item2.amount;
        costName += ' + ' + formatName(t.item2);
    }
    return { costAmt, costName };
}

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

function getDeviationClass(isGood: boolean | undefined): string {
    if (isGood === undefined) {
        return '';
    }
    return isGood ? 'good-deal' : 'bad-deal';
}

function getDeviationDisplayInfo(t: Trade): { devClass: string; devText: string } {
    const deviation = getDeviation(t);
    if (!deviation) {
        return { devClass: '', devText: '' };
    }
    return { devClass: getDeviationClass(deviation.isGood), devText: deviation.text };
}

/**
 * Create a trade row DOM element for a single result
 */
function createTradeRowElement(result: FilterResult): HTMLElement {
    const { trade: t, matchResult, matchCost, displayName, displayAmount } = result;
    const showName = displayName ?? t.resultName;
    const showAmount = displayAmount ?? t.resultAmount;
    const stockClass = t.displayStock === 0 ? 'no-stock' : 'in-stock';

    const { costAmt, costName } = getCostDisplayInfo(t);
    const costDisplay = matchCost && currentGiveRegex ? highlight(costName, currentGiveRegex) : escapeHtml(costName);
    const resultDisplay = matchResult && currentWantRegex ? highlight(showName, currentWantRegex) : escapeHtml(showName);

    const { devClass, devText } = getDeviationDisplayInfo(t);
    const { abbrev: worldAbbrev, title: worldTitle } = getWorldDisplayInfo(t.world);

    const row = document.createElement('div');
    row.className = CSS_CLASSES.TRADE_ROW;
    row.dataset['x'] = String(t.x);
    row.dataset['y'] = String(t.y);
    row.dataset['z'] = String(t.z);
    row.dataset['world'] = t.world;
    
    const tradeKey = getTradeKey(t);
    const isInCart = cartStore.has(t);
    const inCartClass = isInCart ? ' in-cart' : '';
    
    row.innerHTML = `
        <span class="col result-amt">${showAmount}</span>
        <span class="col result-name">${resultDisplay}</span>
        <span class="col cost-amt">${costAmt}</span>
        <span class="col cost-name">${costDisplay}</span>
        <span class="col dev ${devClass}">${devText}</span>
        <span class="col stock ${stockClass}">${t.displayStock}</span>
        <span class="col coord distance" title="X: ${t.x}, Y: ${t.y}, Z: ${t.z}">${Math.round(Math.hypot(t.x, t.z))}</span>
        <span class="col coord world" title="${worldTitle}">${worldAbbrev}</span>
        <button class="col add-to-cart-btn${inCartClass}" data-trade-key="${tradeKey}" title="Add to cart">+</button>
    `;
    
    const cartButton = row.querySelector('.add-to-cart-btn') as HTMLButtonElement;
    cartButton.addEventListener('click', (event) => {
        event.stopPropagation();
        cartStore.add(t);
        cartButton.classList.add('in-cart', 'added');
        setTimeout(() => cartButton.classList.remove('added'), 200);
    });
    
    return row;
}

function renderResults(results: FilterResult[], wantRegex: RegExp | undefined, giveRegex: RegExp | undefined): void {
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
        virtualScroller.setItems(results);
    } else {
        virtualScroller = new VirtualScroller(
            container,
            results,
            createTradeRowElement,
            {
                getEstimatedItemHeight: () => 32,
                getItemId: (item: FilterResult) => `${item.trade.x}-${item.trade.y}-${item.trade.z}-${item.trade.resultName}-${item.trade.costName}`
            }
        );
    }
}

// ============================================================================
// Matrix Dialog
// ============================================================================

const ITEM_ICONS: Record<string, string> = {
    'Netherite Ingot': 'icons/netherite_ingot.png',
    'Netherite Block': 'icons/netherite_block.png',
    'Diamond Block': 'icons/diamond_block.png',
    'Diamond': 'icons/diamond.png',
    'Emerald Block': 'icons/emerald_block.png',
    'Emerald': 'icons/emerald.png',
    'Gold Block': 'icons/gold_block.png',
    'Gold Ingot': 'icons/gold_ingot.png',
    'Iron Block': 'icons/iron_block.png',
    'Iron Ingot': 'icons/iron_ingot.png',
};

function getItemIcon(name: string): string {
    const url = ITEM_ICONS[name];
    if (url) {
        return `<img src="${url}" alt="${escapeHtml(name)}" class="matrix-icon" title="${escapeHtml(name)}">`;
    }
    return escapeHtml(name);
}

function formatValue(value: number): string {
    // Always show as ratio X:1 or 1:X
    if (value >= 1) {
        // Value >= 1: show as "X:1"
        const rounded = Math.round(value);
        return `${rounded}:1`;
    } else {
        // Value < 1: show as "1:X"
        const inverse = Math.round(1 / value);
        return `1:${inverse}`;
    }
}

const MATRIX_HEADER_HTML = '<header><h2>Conversion Matrix</h2><button id="close-matrix" aria-label="Close">&times;</button></header>';

function renderMatrix(): void {
    const container = getElement('matrix-container');

    if (!ratioGraph || ratioGraph.size === 0) {
        container.innerHTML = `${MATRIX_HEADER_HTML}<p class="muted">No conversion data available</p>`;
        container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', () => {
            getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close();
        });
        return;
    }

    const coreBlocks = getCoreBlocks();
    let html = MATRIX_HEADER_HTML;
    html += '<div class="matrix-wrapper"><table class="matrix"><thead><tr><th></th>';
    // Skip last column header (not needed for lower triangle)
    for (let index = 0; index < coreBlocks.length - 1; index++) {
        html += `<th>${getItemIcon(coreBlocks[index]!)}</th>`;
    }
    html += '</tr></thead><tbody>';

    // Skip first row (rowIdx=0) since it would be all skip cells
    for (let rowIndex = 1; rowIndex < coreBlocks.length; rowIndex++) {
        const row = coreBlocks[rowIndex]!;
        html += `<tr><th>${getItemIcon(row)}</th>`;
        // Skip last column (not needed for lower triangle)
        for (let colIndex = 0; colIndex < coreBlocks.length - 1; colIndex++) {
            const col = coreBlocks[colIndex]!;
            if (colIndex >= rowIndex) {
                // Diagonal and upper triangle - skip (redundant data)
                html += '<td class="skip"></td>';
            } else {
                const ratio = getRatio(ratioGraph, row, col);
                html += ratio === undefined ? '<td class="unknown" title="No conversion path found">?</td>' : `<td title="1 ${escapeHtml(row)} = ${ratio.toFixed(4)} ${escapeHtml(col)}">${formatValue(ratio)}</td>`;
            }
        }
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
    
    // Add close button handler
    container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', () => {
        getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close();
    });
}

// ============================================================================
// Map Dialog (Leaflet)
// ============================================================================

const MAP_CONFIG = {
    tileSize: 512,  // pixels per tile (and blocks per tile at maxZoom)
    baseUrl: 'tiles',
    maxZoom: 8,     // highest detail zoom level (1 pixel = 1 block)
    fallbackZoom: 4, // base map zoom level for fallback
    minZoom: 1,     // lowest detail zoom level (not used in fallback)
    playersUrl: 'players.json'  // Local fallback; production uses worker URL
};

// Leaflet map instance (reused across dialog opens)
let leafletMap: L.Map | undefined;

// Layer group for player markers (to clear/update on pan/zoom)
let playerMarkersLayer: L.LayerGroup | undefined;

// Cached player data
let cachedPlayers: Player[] = [];

// Player refresh interval (cleared when dialog closes)
let playerRefreshInterval: ReturnType<typeof setInterval> | undefined;

// Global cache for tile blob URLs (persists across map sessions)
// Key format: "world/zoom/x/z" -> blob URL
const tileBlobCache = new Map<string, string>();

// Global cache for tile manifest (which tiles exist)
// Key format: "world/blocksPerTile/x/z" -> true
let tileManifestCache: Set<string> | undefined;
let manifestLoadPromise: Promise<void> | undefined;

/**
 * Load the tile manifest (cached globally)
 */
async function loadTileManifest(): Promise<Set<string>> {
    // If already loaded, return it
    if (tileManifestCache !== undefined) {
        debugTiles('manifest: returning cached manifest size=%d', tileManifestCache.size);
        return tileManifestCache;
    }
    
    // If loading is in progress, wait for it
    if (manifestLoadPromise !== undefined) {
        debugTiles('manifest: waiting for in-progress load');
        await manifestLoadPromise;
        debugTiles('manifest: in-progress load complete size=%d', tileManifestCache!.size);
        return tileManifestCache!;
    }
    
    // Start loading - DON'T set tileManifestCache until fetch completes
    // This prevents race conditions where empty cache is returned
    debugTiles('manifest: starting fresh load from %s/manifest.json', MAP_CONFIG.baseUrl);
    manifestLoadPromise = (async () => {
        const newCache = new Set<string>();
        try {
            const response = await fetch(`${MAP_CONFIG.baseUrl}/manifest.json`);
            if (response.ok) {
                const manifest = await response.json() as Array<{ world: string; tileX: number; tileZ: number; blocksPerTile: number }>;
                debugTiles('manifest: fetched %d entries', manifest.length);
                for (const entry of manifest) {
                    // Normalize world name to match what getWorldId returns
                    const normalizedWorld = getWorldId(entry.world);
                    const key = `${normalizedWorld}/${entry.blocksPerTile}/${entry.tileX}/${entry.tileZ}`;
                    newCache.add(key);
                }
                debugTiles('manifest: processed into %d unique keys', newCache.size);
            } else {
                debugTiles('manifest: fetch failed status=%d', response.status);
            }
        } catch (error) {
            console.warn('Failed to load tile manifest');
            debugTiles('manifest: fetch error %o', error);
        }
        // Only set the global cache AFTER loading completes
        tileManifestCache = newCache;
    })();
    
    await manifestLoadPromise;
    return tileManifestCache!;
}

/**
 * Check if a tile exists in the manifest
 */
function tileExistsInManifest(manifest: Set<string>, world: string, blocksPerTile: number, tx: number, tz: number): boolean {
    const key = `${world}/${blocksPerTile}/${tx}/${tz}`;
    const exists = manifest.has(key);
    debugTiles('checkManifest: key=%s exists=%s', key, exists);
    return exists;
}

/**
 * Load a tile and add it to a map (non-blocking, uses cache)
 * @param map - Leaflet map to add tile to
 * @param worldId - World identifier (overworld, the_nether)
 * @param zoom - Zoom level (4 or 8)
 * @param tx - Tile X coordinate at the specified zoom
 * @param tz - Tile Z coordinate at the specified zoom
 * @param bounds - Bounds for the tile overlay
 * @param addedToMap - Set tracking tiles already added to this map instance
 */
interface LoadTileOptions {
    map: L.Map;
    worldId: string;
    zoom: number;
    tx: number;
    tz: number;
    bounds: L.LatLngBoundsExpression;
    addedToMap: Set<string>;
}

function loadTileToMap(options: LoadTileOptions): void {
    const { map, worldId, zoom, tx, tz, bounds, addedToMap } = options;
    const mapKey = `z${zoom}:${tx},${tz}`;
    if (addedToMap.has(mapKey)) {
        debugTiles('loadTile: SKIP already added mapKey=%s', mapKey);
        return;
    }
    addedToMap.add(mapKey);
    
    const cacheKey = `${worldId}/${zoom}/${tx}/${tz}`;
    
    // Check if we already have this tile cached
    const cachedBlobUrl = tileBlobCache.get(cacheKey);
    if (cachedBlobUrl) {
        debugTiles('loadTile: CACHE HIT cacheKey=%s', cacheKey);
        L.imageOverlay(cachedBlobUrl, bounds).addTo(map);
        return;
    }
    
    // Fire-and-forget: load tile without blocking
    const url = `${MAP_CONFIG.baseUrl}/${worldId}/${zoom}/${tx}/${tz}.png`;
    debugTiles('loadTile: FETCH url=%s', url);
    fetch(url)
        .then(response => {
            if (!response.ok) {
                debugTiles('loadTile: FETCH FAIL url=%s status=%d', url, response.status);
                return;
            }
            debugTiles('loadTile: FETCH OK url=%s', url);
            return response.blob();
        })
        .then(blob => {
            if (blob) {
                const blobUrl = URL.createObjectURL(blob);
                tileBlobCache.set(cacheKey, blobUrl);
                // Check map still exists before adding
                if (map.getContainer()?.isConnected) {
                    debugTiles('loadTile: ADDED to map cacheKey=%s', cacheKey);
                    L.imageOverlay(blobUrl, bounds).addTo(map);
                } else {
                    debugTiles('loadTile: MAP GONE cacheKey=%s (still cached)', cacheKey);
                }
            }
        })
        .catch((error) => {
            debugTiles('loadTile: ERROR url=%s error=%o', url, error);
        });
}

/**
 * Determine which world a player is in.
 * Uses the `world` field if available, otherwise falls back to `foreign` flag.
 * `foreign: true` means the player is in the nether (different server in linked network).
 */
function getPlayerWorld(player: Player): string {
    if (player.world) {
        return getWorldId(player.world);
    }
    // Fallback: foreign=true means nether, false means overworld
    return player.foreign ? WORLDS.NETHER : WORLDS.OVERWORLD;
}

/**
 * Fetch player positions from API
 * Returns empty array if fetch fails (no dots shown)
 */
async function fetchPlayers(): Promise<Player[]> {
    try {
        const response = await fetch('https://pvc-players.minecraft-works.workers.dev', {
            signal: AbortSignal.timeout(3000)
        });
        if (response.ok) {
            const data = (await response.json()) as PlayersData;
            cachedPlayers = data.players || [];
            return cachedPlayers;
        }
    } catch (error) {
        console.warn('Failed to fetch players:', error);
    }
    // Return empty on failure - no dots shown
    cachedPlayers = [];
    return cachedPlayers;
}

interface MapTileContext {
    worldId: string;
    centerTileX: number;
    centerTileZ: number;
    addedToMapZoom4: Set<string>;
    addedToMapZoom8: Set<string>;
    manifest: Set<string>;
}

const ZOOM4_TILE_SIZE = MAP_CONFIG.tileSize * 16;

function calculateZoom4Coords(z8x: number, z8z: number): { x: number; z: number } {
    return {
        x: Math.floor(z8x / 16),
        z: Math.floor(z8z / 16)
    };
}

function loadZoom4TileToShopMap(context: MapTileContext, z4x: number, z4z: number): void {
    const { worldId, centerTileX, centerTileZ, addedToMapZoom4, manifest } = context;
    const mapKey = `z4:${z4x},${z4z}`;
    if (addedToMapZoom4.has(mapKey)) {return;}
    addedToMapZoom4.add(mapKey);
    
    if (!tileExistsInManifest(manifest, worldId, 8192, z4x, z4z)) {return;}
    
    const startZ8X = z4x * 16;
    const startZ8Z = z4z * 16;
    const dx = startZ8X - centerTileX;
    const dy = startZ8Z - centerTileZ;
    const bounds: L.LatLngBoundsExpression = [
        [-dy * MAP_CONFIG.tileSize - ZOOM4_TILE_SIZE, dx * MAP_CONFIG.tileSize],
        [-dy * MAP_CONFIG.tileSize, dx * MAP_CONFIG.tileSize + ZOOM4_TILE_SIZE]
    ];
    
    const cacheKey = `${worldId}/4/${z4x}/${z4z}`;
    const cachedBlobUrl = tileBlobCache.get(cacheKey);
    if (cachedBlobUrl) {
        if (leafletMap) {L.imageOverlay(cachedBlobUrl, bounds).addTo(leafletMap);}
        return;
    }
    
    const url = `${MAP_CONFIG.baseUrl}/${worldId}/${MAP_CONFIG.fallbackZoom}/${z4x}/${z4z}.png`;
    fetch(url)
        .then(response => (response.ok && leafletMap) ? response.blob() : undefined)
        .then(blob => {
            if (blob && leafletMap) {
                const blobUrl = URL.createObjectURL(blob);
                tileBlobCache.set(cacheKey, blobUrl);
                L.imageOverlay(blobUrl, bounds).addTo(leafletMap);
            }
        })
        .catch(() => {});
}

function loadZoom8TileToShopMap(context: MapTileContext, tx: number, tz: number, dx: number, dy: number): void {
    const { worldId, addedToMapZoom8, manifest } = context;
    const mapKey = `z8:${tx},${tz}`;
    if (addedToMapZoom8.has(mapKey)) {return;}
    addedToMapZoom8.add(mapKey);
    
    if (!tileExistsInManifest(manifest, worldId, 512, tx, tz)) {return;}
    
    const bounds: L.LatLngBoundsExpression = [
        [-dy * MAP_CONFIG.tileSize - MAP_CONFIG.tileSize, dx * MAP_CONFIG.tileSize],
        [-dy * MAP_CONFIG.tileSize, dx * MAP_CONFIG.tileSize + MAP_CONFIG.tileSize]
    ];
    
    const cacheKey = `${worldId}/8/${tx}/${tz}`;
    const cachedBlobUrl = tileBlobCache.get(cacheKey);
    if (cachedBlobUrl) {
        if (leafletMap) {L.imageOverlay(cachedBlobUrl, bounds).addTo(leafletMap);}
        return;
    }
    
    const url = `${MAP_CONFIG.baseUrl}/${worldId}/${MAP_CONFIG.maxZoom}/${tx}/${tz}.png`;
    fetch(url)
        .then(response => (response.ok && leafletMap) ? response.blob() : undefined)
        .then(blob => {
            if (blob && leafletMap) {
                const blobUrl = URL.createObjectURL(blob);
                tileBlobCache.set(cacheKey, blobUrl);
                L.imageOverlay(blobUrl, bounds).addTo(leafletMap);
            }
        })
        .catch(() => {});
}

function loadVisibleShopMapTiles(context: MapTileContext): void {
    if (!leafletMap) {return;}
    const bounds = leafletMap.getBounds();
    const currentZoom = leafletMap.getZoom();
    
    const minDx = Math.floor(bounds.getWest() / MAP_CONFIG.tileSize);
    const maxDx = Math.ceil(bounds.getEast() / MAP_CONFIG.tileSize);
    const minDy = -Math.ceil(bounds.getNorth() / MAP_CONFIG.tileSize);
    const maxDy = -Math.floor(bounds.getSouth() / MAP_CONFIG.tileSize);
    
    const zoom4Tiles = new Set<string>();
    for (let dy = minDy - 1; dy <= maxDy + 1; dy++) {
        for (let dx = minDx - 1; dx <= maxDx + 1; dx++) {
            const tx = context.centerTileX + dx;
            const tz = context.centerTileZ + dy;
            const z4 = calculateZoom4Coords(tx, tz);
            const key = `${z4.x},${z4.z}`;
            if (!zoom4Tiles.has(key)) {
                zoom4Tiles.add(key);
                loadZoom4TileToShopMap(context, z4.x, z4.z);
            }
        }
    }
    
    if (currentZoom > -2) {
        for (let dy = minDy; dy <= maxDy; dy++) {
            for (let dx = minDx; dx <= maxDx; dx++) {
                const tx = context.centerTileX + dx;
                const tz = context.centerTileZ + dy;
                loadZoom8TileToShopMap(context, tx, tz, dx, dy);
            }
        }
    }
}

interface EdgeMarkerParameters {
    player: Player;
    angle: number;
    centerX: number;
    centerY: number;
    edgeRadius: number;
    visibleRadiusMapUnits: number;
    playerCoords: { lat: number; lng: number };
    mapCenter: L.LatLng;
}

function createEdgeMarker(parameters: EdgeMarkerParameters): HTMLElement {
    const { player, angle, centerX, centerY, edgeRadius, visibleRadiusMapUnits, playerCoords, mapCenter } = parameters;
    const dx = playerCoords.lng - mapCenter.lng;
    const dy = playerCoords.lat - mapCenter.lat;
    const distance = Math.hypot(dx, dy);
    const minSize = 4;
    const maxSize = 12;
    const logScale = Math.log10(distance / visibleRadiusMapUnits + 1);
    const size = Math.max(minSize, maxSize - logScale * 4);
    
    const edgeX = centerX + edgeRadius * Math.cos(angle);
    const edgeY = centerY - edgeRadius * Math.sin(angle);
    
    const edgeMarker = document.createElement('div');
    edgeMarker.className = 'player-edge-marker';
    edgeMarker.title = player.name;
    edgeMarker.style.left = `${edgeX}px`;
    edgeMarker.style.top = `${edgeY}px`;
    edgeMarker.style.width = `${size}px`;
    edgeMarker.style.height = `${size}px`;
    
    const nameLabel = document.createElement('span');
    nameLabel.className = 'player-name';
    nameLabel.textContent = player.name;
    
    const angleDeg = angle * 180 / Math.PI;
    if (angleDeg > 45 && angleDeg < 135) {
        nameLabel.classList.add('label-bottom');
    } else if (angleDeg < -45 && angleDeg > -135) {
        nameLabel.classList.add('label-top');
    } else if (edgeX > centerX) {
        nameLabel.classList.add('label-left');
    }
    
    edgeMarker.append(nameLabel);
    return edgeMarker;
}

function updateShopMapPlayerMarkers(
    dialog: HTMLDialogElement,
    container: HTMLElement,
    worldId: string,
    tileX: number,
    tileZ: number
): void {
    playerMarkersLayer?.clearLayers();
    for (const element of dialog.querySelectorAll('.player-edge-marker')) {element.remove();}
    
    if (!leafletMap || cachedPlayers.length === 0) {return;}
    
    const playersInWorld = cachedPlayers.filter(p => {
        const pWorld = p.world ? getWorldId(p.world) : WORLDS.OVERWORLD;
        return pWorld === worldId;
    });
    
    const mapCenter = leafletMap.getCenter();
    const containerRect = container.getBoundingClientRect();
    const containerRadius = Math.min(containerRect.width, containerRect.height) / 2;
    
    const point1 = leafletMap.containerPointToLatLng([containerRect.width / 2, containerRect.height / 2]);
    const point2 = leafletMap.containerPointToLatLng([containerRect.width / 2 + containerRadius, containerRect.height / 2]);
    const visibleRadiusMapUnits = Math.abs(point2.lng - point1.lng);
    
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    const edgeRadius = containerRect.width / 2 + 8;
    
    for (const player of playersInWorld) {
        const playerCoords = toLeafletCoordsRelative(player.position.x, player.position.z, tileX, tileZ, MAP_CONFIG.tileSize);
        const clamped = clampToCircle(playerCoords.lat, playerCoords.lng, mapCenter.lat, mapCenter.lng, visibleRadiusMapUnits);
        
        if (clamped.clamped) {
            const dx = playerCoords.lng - mapCenter.lng;
            const dy = playerCoords.lat - mapCenter.lat;
            const angle = Math.atan2(dy, dx);
            const marker = createEdgeMarker({ player, angle, centerX, centerY, edgeRadius, visibleRadiusMapUnits, playerCoords, mapCenter });
            dialog.append(marker);
        } else {
            L.marker([playerCoords.lat, playerCoords.lng], {
                icon: L.divIcon({
                    className: 'leaflet-player-marker',
                    html: `<span class="player-name">${player.name}</span>`,
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                }),
                title: player.name
            }).addTo(playerMarkersLayer!);
        }
    }
}

interface ShopMapSetupParameters {
    container: HTMLElement;
    coordinatesElement: HTMLElement;
    dialog: HTMLDialogElement;
    worldId: string;
    worldDisplay: string;
    x: number;
    y: number;
    z: number;
    tileX: number;
    tileZ: number;
    manifest: Set<string>;
}

function setupShopMap(parameters: ShopMapSetupParameters): void {
    const { container, coordinatesElement, dialog, worldId, worldDisplay, x, y, z, tileX, tileZ, manifest } = parameters;
    // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- This is Leaflet's L.map(), not Array.map()
    leafletMap = L.map(container, {
        crs: L.CRS.Simple,
        minZoom: -5,
        maxZoom: 2,
        zoomControl: true,
        attributionControl: false,
        zoomSnap: 0,
        zoomDelta: 0.5
    });
    
    const context: MapTileContext = {
        worldId,
        centerTileX: tileX,
        centerTileZ: tileZ,
        addedToMapZoom4: new Set<string>(),
        addedToMapZoom8: new Set<string>(),
        manifest
    };
    
    const loadTiles = () => loadVisibleShopMapTiles(context);
    leafletMap.on('moveend', loadTiles);
    leafletMap.on('zoomend', loadTiles);
    
    const { lat: markerLat, lng: markerLng } = toLeafletCoords(x, z, MAP_CONFIG.tileSize);
    L.marker([markerLat, markerLng], {
        icon: L.divIcon({
            className: 'leaflet-pin-marker',
            iconSize: [24, 24],
            iconAnchor: [4, 24]
        })
    }).addTo(leafletMap);
    
    playerMarkersLayer = L.layerGroup().addTo(leafletMap);
    
    const updateCoordsLabel = (): void => {
        if (!leafletMap) {return;}
        const mapCenter = leafletMap.getCenter();
        const mcCoords = fromLeafletCoordsRelative(mapCenter.lat, mapCenter.lng, tileX, tileZ, MAP_CONFIG.tileSize);
        coordinatesElement.textContent = `${worldDisplay}: ${mcCoords.x}, ${y}, ${mcCoords.z}`;
    };
    
    const updatePlayerMarkers = () => updateShopMapPlayerMarkers(dialog, container, worldId, tileX, tileZ);
    
    const updateZoomClass = () => {
        container.classList.toggle('zoomed-out', leafletMap!.getZoom() < 0.5);
    };
    
    fetchPlayers().then(players => {
        if (!leafletMap) {return;}
        cachedPlayers = players;
        updatePlayerMarkers();
    });
    
    playerRefreshInterval = setInterval(() => {
        fetchPlayers().then(players => {
            if (!leafletMap) {return;}
            cachedPlayers = players;
            updatePlayerMarkers();
        });
    }, 5000);
    
    leafletMap.on('move', () => { updateCoordsLabel(); updatePlayerMarkers(); });
    leafletMap.on('zoomend', () => { updateCoordsLabel(); updatePlayerMarkers(); updateZoomClass(); });
    
    leafletMap.invalidateSize();
    const containerSize = leafletMap.getSize();
    const visibleSize = MAP_CONFIG.tileSize * 3;
    const smallerDimension = Math.min(containerSize.x, containerSize.y);
    const initialZoom = calculateFitZoom(smallerDimension, visibleSize);
    
    leafletMap.setView([markerLat, markerLng], initialZoom);
    loadTiles();
    updateZoomClass();
}

/**
 * Initialize or update the Leaflet map
 */
function getWorldDisplayName(world: string): string {
    if (world.includes('nether')) {
        return 'Nether';
    }
    if (world.includes('end')) {
        return 'The End';
    }
    return 'Overworld';
}

async function openMapDialog(x: number, y: number, z: number, world: string): Promise<void> {
    const dialog = document.querySelector<HTMLDialogElement>(SELECTORS.MAP_DIALOG);
    const container = document.querySelector('#map-container');
    const coordsElement = document.querySelector('#map-coords');
    
    if (!dialog || !container || !coordsElement) {
        return;
    }
    
    const worldId = getWorldId(world);
    const worldDisplay = getWorldDisplayName(world);
    coordsElement.textContent = `${worldDisplay}: ${x}, ${y}, ${z}`;
    
    if (playerRefreshInterval) {
        clearInterval(playerRefreshInterval);
        playerRefreshInterval = undefined;
    }

    const closeButton = dialog.querySelector<HTMLElement>('#close-map');
    if (closeButton && !Object.hasOwn(closeButton.dataset, 'initialized')) {
        closeButton.dataset.initialized = 'true';
        closeButton.addEventListener('click', () => dialog.close());
    }

    dialog.addEventListener('close', () => {
        if (playerRefreshInterval) {
            clearInterval(playerRefreshInterval);
            playerRefreshInterval = undefined;
        }
        if (mapOpenedFromCart) {
            mapOpenedFromCart = false;
            const cartDialog = getElement<HTMLDialogElement>(DIALOG_IDS.CART);
            renderCartDialog();
            cartDialog.showModal();
        }
    }, { once: true });
    
    const { tileX, tileZ } = getTileCoords(x, z, MAP_CONFIG.tileSize);
    dialog.showModal();
    
    requestAnimationFrame(async () => {
        if (leafletMap) {
            try { leafletMap.remove(); } catch { /* already removed */ }
            leafletMap = undefined;
        }
        
        const manifest = await loadTileManifest();
        setupShopMap({ container: container as HTMLElement, coordinatesElement: coordsElement as HTMLElement, dialog, worldId, worldDisplay, x, y, z, tileX, tileZ, manifest });
    });
}

// ============================================================================
// Cart Dialog
// ============================================================================

/**
 * Create a cart item element
 */
function createCartItemElement(trade: Trade, quantity: number): HTMLElement {
    const itemElement = document.createElement('div');
    itemElement.className = 'cart-item';
    
    // Mark zero-quantity items visually
    if (quantity === 0) {
        itemElement.classList.add('zero-quantity');
    }
    
    itemElement.innerHTML = `
        <span class="cart-item-info">
            <strong>${trade.resultAmount}× ${trade.resultName}</strong>
            <span class="cart-item-cost">← ${trade.item1.amount}× ${trade.costName}</span>
        </span>
        <span class="cart-item-controls">
            <button class="qty-btn qty-minus" aria-label="Decrease quantity">−</button>
            <span class="qty-display">${quantity}</span>
            <button class="qty-btn qty-plus" aria-label="Increase quantity">+</button>
            <button class="remove-btn" aria-label="Remove from cart">×</button>
        </span>
    `;
    
    // Event handlers
    const minusButton = itemElement.querySelector('.qty-minus')!;
    const plusButton = itemElement.querySelector('.qty-plus')!;
    const removeButton = itemElement.querySelector('.remove-btn')!;
    
    minusButton.addEventListener('click', () => {
        if (quantity > 0) {
            cartStore.updateQuantity(trade, -1);
            renderCartDialog();
        }
    });
    
    plusButton.addEventListener('click', () => {
        cartStore.updateQuantity(trade, 1);
        renderCartDialog();
    });
    
    removeButton.addEventListener('click', () => {
        cartStore.remove(trade);
        refreshCartButtonStates();
        renderCartDialog();
    });
    
    return itemElement;
}

/**
 * Get status for a route stop based on navigation progress
 */
function getStopStatus(stop: RouteStop, stopIndex: number, _route: RouteStop[]): 'completed' | 'current' | 'pending' {
    if (stop.type === 'portal') {
        // Portal inherits status from current index comparison
        if (stopIndex < navProgress.currentIndex) { return 'completed'; }
        if (stopIndex === navProgress.currentIndex) { return 'current'; }
        return 'pending';
    }
    
    if (stop.type === 'shop' && stop.cartItem) {
        const key = getTradeKey(stop.cartItem.trade);
        if (navProgress.completedKeys.has(key)) { return 'completed'; }
        if (stopIndex === navProgress.currentIndex) { return 'current'; }
    }
    
    return 'pending';
}

/**
 * Create a timeline stop element - compact single-line style
 * @param forNavPanel - if true, hide coordinates (shown on map instead)
 */
function createTimelineStop(
    stop: RouteStop,
    stopIndex: number,
    route: RouteStop[],
    _previousStop: RouteStop | undefined,
    forNavPanel = false
): HTMLElement {
    const status = getStopStatus(stop, stopIndex, route);
    
    const element = document.createElement('div');
    const netherClass = isNether(stop.world) ? ' timeline-stop-nether' : '';
    element.className = `timeline-stop timeline-stop-${stop.type}${netherClass} timeline-status-${status}`;
    
    // Connector column (dot + line)
    const connector = document.createElement('div');
    connector.className = 'timeline-connector';
    
    const dot = document.createElement('button');
    dot.className = 'timeline-dot';
    dot.setAttribute('aria-label', status === 'completed' ? 'Mark incomplete' : 'Mark complete');
    
    dot.innerHTML = status === 'completed' ? '✓' : '';
    
    // Click dot to toggle completion (only for shop stops)
    if (stop.type === 'shop') {
        dot.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleStopCompletion(stop, route);
        });
    }
    
    connector.append(dot);
    
    // Line below dot (connects to next stop)
    const line = document.createElement('div');
    line.className = 'timeline-line';
    connector.append(line);
    
    element.append(connector);
    
    // Content (single line with all info)
    const content = document.createElement('div');
    content.className = 'timeline-content';
    
    const item = stop.cartItem!;
    const isNetherShop = isNether(stop.world);
    
    // Calculate both coordinate systems
    let owCoords: string;
    let netherCoords: string;
    if (isNetherShop) {
        // Nether shop: raw coords are nether, multiply by 8 for overworld equivalent
        netherCoords = `${stop.x}, ${stop.z}`;
        owCoords = `${stop.x * 8}, ${stop.z * 8}`;
    } else {
        // Overworld shop: raw coords are overworld, divide by 8 for nether equivalent
        owCoords = `${stop.x}, ${stop.z}`;
        netherCoords = `${Math.round(stop.x / 8)}, ${Math.round(stop.z / 8)}`;
    }
    
    // During navigation, hide coords (they're shown on map markers)
    content.innerHTML = forNavPanel ? `<span class="stop-text">${item.quantity}× ${item.trade.resultName}</span>` : `<span class="stop-text">${item.quantity}× ${item.trade.resultName}</span><span class="coord-ow">${owCoords}</span><span class="coord-nether">${netherCoords}</span>`;
    
    // Make shop content clickable
    content.classList.add('clickable');
    content.addEventListener('click', () => {
        // During navigation, clicking toggles completion instead of opening map
        if (navPlayerRefreshInterval) {
            toggleStopCompletion(stop, route);
        } else {
            mapOpenedFromCart = true;
            const cartDialog = getElement<HTMLDialogElement>(DIALOG_IDS.CART);
            cartDialog.close();
            openMapDialog(stop.x, item.trade.y, stop.z, stop.world);
        }
    });
    
    element.append(content);
    
    return element;
}

/**
 * Render the cart dialog contents
 */
function renderCartDialog(): void {
    const itemsContainer = getElement('cart-items');
    const costsContainer = getElement('cart-costs');
    const gainsContainer = getElement('cart-gains');
    const clearCartButton = getElement('clear-cart');
    
    // Clear previous contents
    itemsContainer.innerHTML = '';
    costsContainer.innerHTML = '';
    gainsContainer.innerHTML = '';
    
    if (cartStore.isEmpty) {
        itemsContainer.innerHTML = `<p class="${CSS_CLASSES.CART_EMPTY}">Your cart is empty</p>`;
        clearCartButton.classList.add('hidden');
        return;
    }
    
    clearCartButton.classList.remove('hidden');
    
    // Render cart items
    for (const cartItem of cartStore.items) {
        itemsContainer.append(createCartItemElement(cartItem.trade, cartItem.quantity));
    }
    
    // Render shopping lists
    const shoppingList = getShoppingList();
    
    for (const [name, amount] of shoppingList.costs) {
        const li = document.createElement('li');
        li.textContent = `${amount}× ${name}`;
        costsContainer.append(li);
    }
    
    for (const [name, amount] of shoppingList.gains) {
        const li = document.createElement('li');
        li.textContent = `${amount}× ${name}`;
        gainsContainer.append(li);
    }
}

// ============================================================================
// Tab Switching
// ============================================================================

function setupCartTabs(): void {
    const tabCart = document.querySelector('#tab-cart');
    const tabNavigate = document.querySelector('#tab-navigate');
    
    tabCart?.addEventListener('click', () => switchTab('cart'));
    tabNavigate?.addEventListener('click', () => switchTab('navigate'));
}

function switchTab(tab: 'cart' | 'navigate'): void {
    const tabCart = document.querySelector('#tab-cart');
    const tabNavigate = document.querySelector('#tab-navigate');
    const contentCart = document.querySelector('#tab-content-cart');
    const contentNavigate = document.querySelector('#tab-content-navigate');
    
    if (tab === 'cart') {
        tabCart?.classList.add('active');
        tabNavigate?.classList.remove('active');
        contentCart?.classList.add('active');
        contentNavigate?.classList.remove('active');
    } else {
        tabCart?.classList.remove('active');
        tabNavigate?.classList.add('active');
        contentCart?.classList.remove('active');
        contentNavigate?.classList.add('active');
        // Render navigate tab content when switching to it
        renderNavigateTab();
    }
    
    localStorage.setItem(NAV_TAB_KEY, tab);
}

function restoreActiveTab(): void {
    const savedTab = localStorage.getItem(NAV_TAB_KEY);
    if (savedTab === 'navigate') {
        switchTab('navigate');
    } else {
        switchTab('cart');
    }
}

function setupPlayerNameInput(): void {
    const input = document.querySelector<HTMLInputElement>(SELECTORS.PLAYER_NAME_INPUT);
    if (!input) {
        return;
    }
    
    // Restore saved player name
    const savedName = localStorage.getItem(NAV_PLAYER_KEY);
    if (savedName) {
        input.value = savedName;
    }
    
    // Save on input
    input.addEventListener('input', () => {
        localStorage.setItem(NAV_PLAYER_KEY, input.value);
    });
}

// ============================================================================
// Live Navigation
// ============================================================================

// Store center tile coords for the current nav map (needed for coord conversion)
let navMapCenterTileX = 0;
let navMapCenterTileZ = 0;

/**
 * Load navigation mode from localStorage
 */
function loadNavMode(): void {
    const saved = localStorage.getItem(NAV_MODE_KEY);
    navMode = saved === 'manual' ? 'manual' : 'follow';
}

/**
 * Save navigation mode to localStorage
 */
function saveNavMode(): void {
    localStorage.setItem(NAV_MODE_KEY, navMode);
}

/**
 * Start live navigation - poll player position and update map
 */
async function startNavigation(): Promise<void> {
    const playerNameInput = document.querySelector<HTMLInputElement>('#player-name-input');
    
    if (!playerNameInput?.value.trim()) {
        playerNameInput?.focus();
        return;
    }
    
    debugNavigation('Starting navigation player=%s cartSize=%d', playerNameInput.value.trim(), cartStore.uniqueCount);
    
    isNavigating = true;
    navMode = 'follow';
    saveNavMode();
    
    // Close cart dialog and open navigation dialog
    const cartDialog = getElement<HTMLDialogElement>('cart-dialog');
    const navDialog = document.querySelector<HTMLDialogElement>(SELECTORS.NAV_DIALOG);
    
    cartDialog.close();
    
    // Prevent background scrolling
    document.body.style.overflow = 'hidden';
    
    if (navDialog) {
        navDialog.showModal();
        
        // First, get the player's current position
        const playerName = playerNameInput.value.trim().toLowerCase();
        try {
            const players = await fetchPlayers();
            const player = players.find(p => p.name.toLowerCase() === playerName);
            
            if (player) {
                const playerWorld = getPlayerWorld(player);
                currentPlayerPosition = {
                    x: player.position.x,
                    y: player.position.y,
                    z: player.position.z,
                    world: playerWorld,
                    yaw: player.rotation?.yaw
                };
                debugNavigation('Initial player position world=%s x=%d y=%d z=%d', playerWorld, player.position.x, player.position.y, player.position.z);
            }
        } catch (error) {
            debugNavigation('Failed to get initial player position: %s', error);
            console.warn('Failed to get initial player position:', error);
        }
        
        // Initialize map after dialog is visible (needs dimensions)
        requestAnimationFrame(async () => {
            // Compute route from player position (or 0,0 if not found), excluding completed items
            const route = computeRoute(currentPlayerPosition, true);
            navCurrentRoute = route;
            
            // Pass player's world so the map shows where the player is (if they have shops there)
            const playerWorld = currentPlayerPosition?.world;
            
            debugNavigation('Initializing map stops=%d targetWorld=%s worlds=%o', route.length, playerWorld, [...new Set(route.map(s => getWorldId(s.world)))]);
            
            await initNavigationMapDialog(route, playerWorld);
            
            // After map is initialized, center on player if in follow mode
            if (navMode === 'follow' && currentPlayerPosition) {
                centerMapOnPlayer();
            }
            
            // Start polling player position
            pollPlayerPosition();
            const config = getConfig();
            navPlayerRefreshInterval = setInterval(pollPlayerPosition, config.dynmap.playerRefreshMs);
        });
    } else {
        console.error('nav-dialog element not found!');
    }
}

/**
 * Stop live navigation
 */
function stopNavigation(): void {
    const navDialog = document.querySelector<HTMLDialogElement>(SELECTORS.NAV_DIALOG);
    const cartDialog = getElement<HTMLDialogElement>(DIALOG_IDS.CART);
    
    isNavigating = false;
    
    // Clear polling interval
    if (navPlayerRefreshInterval) {
        clearInterval(navPlayerRefreshInterval);
        navPlayerRefreshInterval = undefined;
    }
    
    // Remove player marker from map
    if (navPlayerMarker && navMap) {
        navMap.removeLayer(navPlayerMarker);
        navPlayerMarker = undefined;
    }
    
    // Remove route polyline
    if (navRoutePolyline && navMap) {
        navMap.removeLayer(navRoutePolyline);
        navRoutePolyline = undefined;
    }
    
    // Remove player-to-next line
    if (navPlayerToNextLine && navMap) {
        navMap.removeLayer(navPlayerToNextLine);
        navPlayerToNextLine = undefined;
    }
    
    // Remove stop markers
    if (navMap) {
        for (const marker of navStopMarkers) {
            navMap.removeLayer(marker);
        }
    }
    navStopMarkers = [];
    navCurrentRoute = [];
    navMapWorld = 'overworld';
    
    currentPlayerPosition = undefined;
    
    // Close nav dialog and reopen cart dialog
    if (navDialog) {
        navDialog.close();
    }
    
    // Restore background scrolling
    document.body.style.overflow = '';
    
    // Clean up nav map
    if (navMap) {
        try {
            navMap.remove();
        } catch {
            // Map already removed
        }
        navMap = undefined;
    }
    
    // Reopen cart dialog to navigate tab
    renderCartDialog();
    switchTab('navigate');
    cartDialog.showModal();
}

/**
 * Toggle navigation on/off
 */
function toggleNavigation(): void {
    if (isNavigating) {
        stopNavigation();
    } else {
        startNavigation();
    }
}

/**
 * Poll for player position and update the map
 */
interface PlayerPosition {
    x: number;
    z: number;
    world: string;
    yaw?: number;
}

function hasPositionMoved(previousPosition: PlayerPosition | undefined, current: PlayerPosition, threshold: number): boolean {
    if (!previousPosition) {return true;}
    return Math.abs(previousPosition.x - current.x) > threshold || Math.abs(previousPosition.z - current.z) > threshold;
}

function showPlayerNotFound(playerNameInput: HTMLInputElement | null): void {
    const distanceDisplay = document.querySelector('#nav-dialog-distance');
    if (distanceDisplay) {
        distanceDisplay.innerHTML = `<span class="distance-label">Player "${playerNameInput?.value}" not found</span>`;
    }
}

async function handleFoundPlayer(player: Player, previousPosition: PlayerPosition | undefined): Promise<void> {
    const playerWorld = getPlayerWorld(player);
    currentPlayerPosition = {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        world: playerWorld,
        yaw: player.rotation?.yaw
    };
    // @ts-expect-error - exposing for e2e testing
    globalThis.__currentPlayerPosition = currentPlayerPosition;
    
    // UNIFIED VIEW: No world switching needed - all stops on one map
    // Just update marker, distance, and check for auto-advance
    
    updatePlayerMarker();
    updateLiveDistance();
    checkAutoAdvance();
    updateNearbyShopTooltip();
    
    const positionMoved = hasPositionMoved(previousPosition, currentPlayerPosition, 1);
    const shouldRecalcRoute = hasPositionMoved(previousPosition, currentPlayerPosition, 10);
    
    if (shouldRecalcRoute) {
        recalculateRouteFromPlayer();
    }
    
    updatePlayerToNextLine();
    
    if (navMode === 'follow' && positionMoved) {
        centerMapOnPlayer();
    }
}

async function pollPlayerPosition(): Promise<void> {
    const playerNameInput = document.querySelector<HTMLInputElement>(SELECTORS.PLAYER_NAME_INPUT);
    const playerName = playerNameInput?.value.trim().toLowerCase();
    
    if (!playerName || !navMap) {
        return;
    }
    
    try {
        const players = await fetchPlayers();
        const player = players.find(p => p.name.toLowerCase() === playerName);
        
        if (player) {
            const previousPosition = currentPlayerPosition;
            debugPlayerPoll('Player found name=%s world=%s x=%d z=%d prevWorld=%s', 
                player.name, player.world, player.position.x, player.position.z, previousPosition?.world);
            await handleFoundPlayer(player, previousPosition);
        } else {
            debugPlayerPoll('Player not found: %s', playerName);
            showPlayerNotFound(playerNameInput);
        }
    } catch (error) {
        debugPlayerPoll('Poll failed: %s', error);
        console.warn('Failed to poll player position:', error);
    }
}

/**
 * Update or create the player marker on the navigation map
 */
function updatePlayerMarker(): void {
    if (!navMap || !currentPlayerPosition) {
        return;
    }
    
    // UNIFIED VIEW: Always show player at overworld-equivalent position
    const playerIsNether = isNether(currentPlayerPosition.world);
    const displayCoords = toOverworldEquivalent(
        currentPlayerPosition.x, 
        currentPlayerPosition.z, 
        currentPlayerPosition.world
    );
    
    const { lat, lng } = toLeafletCoordsRelative(
        displayCoords.x,
        displayCoords.z,
        navMapCenterTileX,
        navMapCenterTileZ,
        MAP_CONFIG.tileSize
    );
    
    // Calculate rotation for direction arrow (convert Minecraft yaw to CSS rotation)
    // Minecraft: 0=south, 90=west, 180=north, 270=east
    // CSS: 0=up(north), so we add 180 to convert
    const rotation = currentPlayerPosition.yaw === undefined ? 0 : currentPlayerPosition.yaw + 180;
    const hasHeading = currentPlayerPosition.yaw !== undefined;
    
    // Add nether styling class when player is in nether
    const netherClass = playerIsNether ? ' nav-player-marker--nether' : '';
    
    const playerIconHtml = hasHeading
        ? `<div class="nav-player-dot"><div class="nav-player-arrow" style="transform: rotate(${rotation}deg) translate(-50%, -100%)"></div></div>`
        : '<div class="nav-player-dot"></div>';
    
    if (navPlayerMarker) {
        // Update existing marker position and rotation
        navPlayerMarker.setLatLng([lat, lng]);
        navPlayerMarker.setOpacity(1);
        // Update icon to reflect new heading and nether state
        const playerIcon = L.divIcon({
            className: `nav-player-marker${netherClass}`,
            html: playerIconHtml,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });
        navPlayerMarker.setIcon(playerIcon);
    } else {
        // Create new marker
        const playerIcon = L.divIcon({
            className: `nav-player-marker${netherClass}`,
            html: playerIconHtml,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });
        
        navPlayerMarker = L.marker([lat, lng], { icon: playerIcon, zIndexOffset: 1000 });
        navPlayerMarker.addTo(navMap);
    }
}

/**
 * Recalculate route from the current player position and update the map
 * 
 * UNIFIED VIEW: Updates markers for all shops (both worlds) on the single map.
 * Completed shops are shown with checkmarks, incomplete with numbers.
 */
function recalculateRouteFromPlayer(): void {
    if (!navMap || !currentPlayerPosition) {
        return;
    }
    
    // Compute new route from player position, excluding completed items (for navCurrentRoute)
    const fullRoute = computeRoute(currentPlayerPosition, true);
    
    // Update the full route (incomplete shops only - for navigation logic)
    navCurrentRoute = fullRoute;
    
    // UNIFIED VIEW: Get all cart stops (including completed) for display
    const allStops = getAllCartStops();
    
    // Check if the number of stops changed (items added/removed)
    const stopsChanged = navCurrentWorldRoute.length !== allStops.length ||
        allStops.some((stop, index) => {
            const oldStop = navCurrentWorldRoute[index];
            return !oldStop || stop.x !== oldStop.x || stop.z !== oldStop.z;
        });
    
    if (!stopsChanged) {
        return; // No need to update if stop list is the same
    }
    
    navCurrentWorldRoute = allStops;
    // @ts-expect-error - exposing for e2e testing
    globalThis.__navCurrentWorldRoute = allStops;
    
    // Remove old route polyline
    if (navRoutePolyline) {
        navMap.removeLayer(navRoutePolyline);
        navRoutePolyline = undefined;
    }
    
    // Remove old stop markers
    for (const marker of navStopMarkers) {
        navMap.removeLayer(marker);
    }
    navStopMarkers = [];
    
    // Draw new route with all stops (completed shown with checkmarks)
    if (allStops.length > 0) {
        const routePoints = createRouteMarkersUnified(allStops, navMapCenterTileX, navMapCenterTileZ, navProgress.completedKeys);
        
        // Redraw polyline (only connecting incomplete shops)
        if (routePoints.length > 0) {
            navRoutePolyline = L.polyline(routePoints, {
                color: '#3b82f6',
                weight: 3,
                opacity: 0.8,
                dashArray: '10, 5'
            }).addTo(navMap);
        }
    }
}

/**
 * Update the dotted line from player to the next stop
 * Only draws the line when player is in the same world as the map
 */
function updatePlayerToNextLine(): void {
    if (!navMap || !currentPlayerPosition) {
        return;
    }
    
    // Remove existing line
    if (navPlayerToNextLine) {
        navMap.removeLayer(navPlayerToNextLine);
        navPlayerToNextLine = undefined;
    }
    
    // UNIFIED VIEW: Find the first INCOMPLETE stop to draw line to
    const nextStop = navCurrentWorldRoute.find(stop => 
        stop.cartItem && !navProgress.completedKeys.has(getTradeKey(stop.cartItem.trade))
    );
    
    if (!nextStop) {
        return; // No incomplete stops
    }
    
    // UNIFIED VIEW: Use overworld-equivalent coordinates for player
    const playerDisplayCoords = toOverworldEquivalent(
        currentPlayerPosition.x,
        currentPlayerPosition.z,
        currentPlayerPosition.world
    );
    
    // Get player position in Leaflet coordinates
    const playerCoords = toLeafletCoordsRelative(
        playerDisplayCoords.x,
        playerDisplayCoords.z,
        navMapCenterTileX,
        navMapCenterTileZ,
        MAP_CONFIG.tileSize
    );
    
    // Get next stop position in Leaflet coordinates (using displayX/displayZ)
    const stopCoords = toLeafletCoordsRelative(
        nextStop.displayX,
        nextStop.displayZ,
        navMapCenterTileX,
        navMapCenterTileZ,
        MAP_CONFIG.tileSize
    );
    
    // Draw dotted line from player to next stop
    navPlayerToNextLine = L.polyline(
        [
            [playerCoords.lat, playerCoords.lng],
            [stopCoords.lat, stopCoords.lng]
        ],
        {
            color: '#22c55e', // Green color to distinguish from route
            weight: 3,
            opacity: 0.9,
            dashArray: '5, 8' // Shorter dash pattern for distinction
        }
    ).addTo(navMap);
}

/**
 * Update the live distance display
 */
function updateLiveDistance(): void {
    // Update both embedded and dialog distance displays
    const liveDistance = document.querySelector('#nav-live-distance');
    const dialogDistance = document.querySelector('#nav-dialog-distance');
    
    if (!currentPlayerPosition) {
        return;
    }
    
    // Use current navigation route if available, otherwise compute fresh (excluding completed)
    const route = navCurrentRoute.length > 0 ? navCurrentRoute : computeRoute(currentPlayerPosition, true);
    
    let distanceHtml: string;
    let dialogHtml: string;
    if (route.length === 0) {
        distanceHtml = '<span class="distance-label">Route complete! 🎉</span>';
        dialogHtml = distanceHtml;
    } else {
        // First stop is always the current target (completed items are filtered out)
        const currentStop = route[0]!;
        const stopWorld = getWorldId(currentStop.world);
        const isNetherShop = stopWorld.includes('nether');
        
        // In unified view, distance is always calculated using overworld-equivalent coords
        // (calculateRouteDistance internally converts nether coords × 8)
        const distance = calculateRouteDistance(
            currentPlayerPosition.x, currentPlayerPosition.z, currentPlayerPosition.world,
            currentStop.x, currentStop.z, currentStop.world
        );
        
        const itemName = currentStop.cartItem?.trade.resultName ?? 'Next stop';
        const quantity = currentStop.cartItem?.quantity ?? 1;
        
        const distanceText = Math.round(distance).toLocaleString();
        
        // Unified view: always show distance, add world indicator for nether shops
        const worldIndicator = isNetherShop ? '🔥 ' : '';
        distanceHtml = `<span class="distance-label">→ ${worldIndicator}${itemName}:</span><span class="distance-value">${distanceText} blocks</span>`;
        
        // Detailed display for navigation dialog with coords and items
        // For nether shops, show both original coords and display coords
        const coordsText = isNetherShop 
            ? `${currentStop.x}, ${currentStop.y}, ${currentStop.z} (Nether → OW: ${currentStop.displayX}, ${currentStop.displayZ})`
            : `${currentStop.x}, ${currentStop.y}, ${currentStop.z}`;
        const buyText = `${quantity}× ${itemName}`;
        
        dialogHtml = `
                <div class="nav-info-row">
                    <span class="nav-info-label">📍</span>
                    <span class="nav-info-coords">${coordsText}</span>
                </div>
                <div class="nav-info-row">
                    <span class="nav-info-label">🛒</span>
                    <span class="nav-info-item">${worldIndicator}${buyText}</span>
                </div>
                <div class="nav-info-row">
                    <span class="nav-info-label">↗</span>
                    <span class="nav-info-distance">${Math.round(distance).toLocaleString()} blocks</span>
                </div>
            `;
    }
    
    if (liveDistance) {
        liveDistance.innerHTML = distanceHtml;
    }
    if (dialogDistance) {
        dialogDistance.innerHTML = dialogHtml;
    }
}

/**
 * Update route markers when a shop is completed
 * Re-renders all markers with current completion state (completed = checkmark, incomplete = number)
 */
function updateRouteMarkersForCompletion(): void {
    if (!navMap) {
        return;
    }
    
    // Remove old stop markers
    for (const marker of navStopMarkers) {
        navMap.removeLayer(marker);
    }
    navStopMarkers = [];
    
    // Remove old route polyline
    if (navRoutePolyline) {
        navMap.removeLayer(navRoutePolyline);
        navRoutePolyline = undefined;
    }
    
    // Get all cart stops for display
    const allStops = getAllCartStops();
    if (allStops.length === 0) {
        return;
    }
    
    // Re-create markers with updated completion state
    const routePoints = createRouteMarkersUnified(allStops, navMapCenterTileX, navMapCenterTileZ, navProgress.completedKeys);
    
    // Redraw polyline (only connecting incomplete shops)
    if (routePoints.length > 0) {
        navRoutePolyline = L.polyline(routePoints, {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8,
            dashArray: '10, 5'
        }).addTo(navMap);
    }
}

/**
 * Check if player is close enough to auto-advance to next stop
 * Requires player to be within NAVIGATION.ARRIVAL_THRESHOLD blocks in X/Z AND Y directions
 */
function checkAutoAdvance(): void {
    if (!currentPlayerPosition || navCurrentRoute.length === 0) {
        return;
    }
    
    // Find the first incomplete stop in the route
    const currentStop = navCurrentRoute.find(stop => 
        stop.cartItem && !navProgress.completedKeys.has(getTradeKey(stop.cartItem.trade))
    );
    if (!currentStop?.cartItem) {
        return;
    }
    
    const distance = calculateRouteDistance(
        currentPlayerPosition.x, currentPlayerPosition.z, currentPlayerPosition.world,
        currentStop.x, currentStop.z, currentStop.world
    );
    
    // Check Y distance separately (must be within threshold in all directions)
    const yDistance = Math.abs(currentPlayerPosition.y - currentStop.y);
    
    if (distance < NAVIGATION.ARRIVAL_THRESHOLD && yDistance < NAVIGATION.ARRIVAL_THRESHOLD) {
        // Auto-complete this stop
        const key = getTradeKey(currentStop.cartItem.trade);
        navProgress.completedKeys.add(key);
        saveNavProgress();
        
        // Update markers to show completion (keep completed shops visible with checkmark)
        updateRouteMarkersForCompletion();
        
        updatePlayerToNextLine();
        updateLiveDistance();
        renderCartDialog();
    }
}

// Track which shop tooltip is currently shown
let currentNearbyShopKey: string | undefined;

// Distance threshold to show shop tooltip (in blocks)
const SHOP_NEARBY_THRESHOLD = 100;

/**
 * Update the shop tooltip when player enters a shop area
 * Shows briefly then auto-hides
 */
let shopTooltipTimeout: ReturnType<typeof setTimeout> | undefined;

// eslint-disable-next-line sonarjs/cognitive-complexity -- Shop tooltip logic requires multiple conditions
function updateNearbyShopTooltip(): void {
    const tooltip = document.querySelector('#nav-shop-tooltip');
    if (!tooltip || !currentPlayerPosition) {
        return;
    }
    
    // Use current route (already excludes completed items)
    const route = navCurrentRoute.length > 0 ? navCurrentRoute : computeRoute(currentPlayerPosition, true);
    
    // Find all shops within range (not just current stop)
    let nearestShop: RouteStop | undefined;
    let nearestDistance = Infinity;
    
    for (const stop of route) {
        if (!stop.cartItem) { continue; }
        
        const distance = calculateRouteDistance(
            currentPlayerPosition.x, currentPlayerPosition.z, currentPlayerPosition.world,
            stop.x, stop.z, stop.world
        );
        
        if (distance < SHOP_NEARBY_THRESHOLD && distance < nearestDistance) {
            nearestDistance = distance;
            nearestShop = stop;
        }
    }
    
    if (nearestShop?.cartItem) {
        const shopKey = `${nearestShop.x},${nearestShop.z}`;
        
        // Only show tooltip when ENTERING a new shop area
        if (currentNearbyShopKey !== shopKey) {
            currentNearbyShopKey = shopKey;
            
            // Group all items at this shop location
            const itemsAtShop = cartStore.items.filter(item => 
                item.trade.x === nearestShop.x && 
                item.trade.z === nearestShop.z &&
                !navProgress.completedKeys.has(getTradeKey(item.trade))
            );
            
            // Build shopping list HTML
            const itemsHtml = itemsAtShop.map(cartItem => 
                `<li><span class="item-name">${cartItem.trade.resultName}</span><span class="item-qty">×${cartItem.quantity}</span></li>`
            ).join('');
            
            tooltip.innerHTML = `
                <h4>🛒 Shopping List</h4>
                <ul>${itemsHtml}</ul>
            `;
            tooltip.classList.remove('hidden');
            
            // Auto-hide after 4 seconds
            if (shopTooltipTimeout) {
                clearTimeout(shopTooltipTimeout);
            }
            shopTooltipTimeout = setTimeout(() => {
                tooltip.classList.add('hidden');
            }, 4000);
        }
    } else {
        // Left all shop areas
        currentNearbyShopKey = undefined;
    }
}

/**
 * Calculate zoom level based on overworld-equivalent distance.
 * Nether distances are multiplied by 8 to account for portal scaling.
 * 
 * Distance thresholds (in overworld-equivalent blocks):
 *   - < 60 blocks: zoom 2 (maximum - arriving at shop, before auto-advance at 50)
 *   - 60-100 blocks: zoom 1 (close)
 *   - 100-300 blocks: zoom 0 (medium)
 *   - 300-600 blocks: zoom -1 (far)
 *   - 600-1200 blocks: zoom -2 (very far)
 *   - > 1200 blocks: zoom -3 (maximum out)
 */
function getZoomForDistance(overworldEquivalentDistance: number): number {
    if (overworldEquivalentDistance < 60) {
        return 2;  // Maximum zoom - arriving at shop
    } else if (overworldEquivalentDistance < 100) {
        return 1;  // Close
    } else if (overworldEquivalentDistance < 300) {
        return 0;  // Medium
    } else if (overworldEquivalentDistance < 600) {
        return -1; // Far
    } else if (overworldEquivalentDistance < 1200) {
        return -2; // Very far
    } else {
        return -3; // Maximum out
    }
}

/**
 * Center the navigation map on the player position
 * Zoom level adjusts based on overworld-equivalent distance to nearest shop
 * (Nether distances are multiplied by 8 to account for portal scaling)
 */
function centerMapOnPlayer(): void {
    if (!navMap || !currentPlayerPosition) {
        return;
    }
    
    // UNIFIED VIEW: Use overworld-equivalent coordinates
    const displayCoords = toOverworldEquivalent(
        currentPlayerPosition.x,
        currentPlayerPosition.z,
        currentPlayerPosition.world
    );
    
    const { lat, lng } = toLeafletCoordsRelative(
        displayCoords.x,
        displayCoords.z,
        navMapCenterTileX,
        navMapCenterTileZ,
        MAP_CONFIG.tileSize
    );
    
    // Calculate distance to nearest non-completed shop using display coords
    const route = navCurrentWorldRoute.length > 0 ? navCurrentWorldRoute : [];
    let minDistance = Infinity;
    
    for (const stop of route) {
        // Use displayX/displayZ for consistent distance calculation
        const deltaX = displayCoords.x - stop.displayX;
        const deltaZ = displayCoords.z - stop.displayZ;
        const distance = Math.hypot(deltaX, deltaZ);
        
        if (distance < minDistance) {
            minDistance = distance;
        }
    }
    
    const zoom = getZoomForDistance(minDistance);
    
    // Use flyTo for smoother animation instead of setView
    navMap.flyTo([lat, lng], zoom, { duration: 0.3, easeLinearity: 0.5 });
}

/**
 * Switch to manual mode (triggered when user pans the map)
 */
function switchToManualMode(): void {
    if (!isNavigating) {
        return;
    }
    
    navMode = 'manual';
    saveNavMode();
    
    // Show re-center button (for both embedded and dialog maps)
    const recenterButton = document.querySelector(SELECTORS.RECENTER_MAP);
    const dialogRecenterButton = document.querySelector('#nav-dialog-recenter');
    recenterButton?.classList.remove('hidden');
    dialogRecenterButton?.classList.remove('hidden');
}

/**
 * Switch back to follow mode and re-center
 */
function switchToFollowMode(): void {
    navMode = 'follow';
    saveNavMode();
    
    // Hide re-center buttons
    const recenterButton = document.querySelector(SELECTORS.RECENTER_MAP);
    const dialogRecenterButton = document.querySelector('#nav-dialog-recenter');
    recenterButton?.classList.add('hidden');
    dialogRecenterButton?.classList.add('hidden');
    
    // Center on player
    centerMapOnPlayer();
}

/**
 * Set up navigation event handlers
 */
function setupNavigationControls(): void {
    const startButton = document.querySelector('#start-navigation');
    const recenterButton = document.querySelector(SELECTORS.RECENTER_MAP);
    const closeNavButton = document.querySelector('#close-nav');
    
    startButton?.addEventListener('click', toggleNavigation);
    recenterButton?.addEventListener('click', switchToFollowMode);
    closeNavButton?.addEventListener('click', stopNavigation);
    
    // Set up nav dialog backdrop close
    const navDialog = document.querySelector<HTMLDialogElement>(SELECTORS.NAV_DIALOG);
    if (navDialog) {
        navDialog.addEventListener('click', (event) => {
            if (event.target === navDialog) {
                stopNavigation();
            }
        });
    }
}

// ============================================================================
// Navigation Map
// ============================================================================

let navMap: L.Map | undefined;
let navRoutePolyline: L.Polyline | undefined;
let navPlayerToNextLine: L.Polyline | undefined;
let navStopMarkers: L.Marker[] = [];
let navCurrentRoute: RouteStop[] = [];  // Full route (all worlds)
let navCurrentWorldRoute: RouteStop[] = [];  // Route filtered to current map world
let navMapWorld: string = WORLDS.OVERWORLD;  // World currently shown on nav map

/**
 * Initialize navigation map inside the circular dialog.
 * 
 * Design principle: The map shows the world where the player currently is,
 * IF there are shops to visit in that world. Otherwise, it shows the world
 * of the first shop in the route.
 * 
 * @param route - The full route (all worlds)
 * @param targetWorld - Optional: force the map to show this world
 */
function cleanupNavMap(): void {
    if (navMap) {
        try {
            navMap.remove();
        } catch {
            // Map already removed
        }
    }
    navMap = undefined;
    navPlayerMarker = undefined;
    navRoutePolyline = undefined;
    navPlayerToNextLine = undefined;
    navStopMarkers = [];
}

interface TileRange {
    minTileX: number;
    maxTileX: number;
    minTileZ: number;
    maxTileZ: number;
    centerTileX: number;
    centerTileZ: number;
}

/**
 * Calculate tile range using overworld-equivalent (display) coordinates for unified view.
 * This ensures nether shops at (100, 50) are positioned at (800, 400) in overworld tiles.
 */
function calculateTileRangeUnified(stops: RouteStop[]): TileRange {
    // Use displayX/displayZ which are already overworld-equivalent
    const xs = stops.map(stop => stop.displayX);
    const zs = stops.map(stop => stop.displayZ);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    const { tileX: minTileX, tileZ: minTileZ } = getTileCoords(minX - 256, minZ - 256, MAP_CONFIG.tileSize);
    const { tileX: maxTileX, tileZ: maxTileZ } = getTileCoords(maxX + 256, maxZ + 256, MAP_CONFIG.tileSize);
    const { tileX: centerTileX, tileZ: centerTileZ } = getTileCoords(centerX, centerZ, MAP_CONFIG.tileSize);
    
    return { minTileX, maxTileX, minTileZ, maxTileZ, centerTileX, centerTileZ };
}

/**
 * Calculate tile range from current map view bounds (for dynamic tile loading)
 */
function calculateTileRangeFromView(centerTileX: number, centerTileZ: number): TileRange | undefined {
    if (!navMap) {return undefined;}
    
    const bounds = navMap.getBounds();
    
    // Convert leaflet bounds to tile coordinates
    // Leaflet uses (lat, lng) where lat is up/down and lng is left/right
    // Our tiles use: dx = (lng) / tileSize, dz = (-lat) / tileSize
    const minDx = Math.floor(bounds.getWest() / MAP_CONFIG.tileSize);
    const maxDx = Math.ceil(bounds.getEast() / MAP_CONFIG.tileSize);
    const minDz = -Math.ceil(bounds.getNorth() / MAP_CONFIG.tileSize);
    const maxDz = -Math.floor(bounds.getSouth() / MAP_CONFIG.tileSize);
    
    // Convert relative deltas to absolute tile coordinates
    const minTileX = centerTileX + minDx;
    const maxTileX = centerTileX + maxDx;
    const minTileZ = centerTileZ + minDz;
    const maxTileZ = centerTileZ + maxDz;
    
    // Recalculate center based on view bounds
    const viewCenterTileX = Math.floor((minTileX + maxTileX) / 2);
    const viewCenterTileZ = Math.floor((minTileZ + maxTileZ) / 2);
    
    return { minTileX, maxTileX, minTileZ, maxTileZ, centerTileX: viewCenterTileX, centerTileZ: viewCenterTileZ };
}

interface LoadNavMapTilesOptions {
    manifest: Set<string>;
    worldId: string;
    tileRange: TileRange;
    addedToMap: Set<string>;
    mapCenterTileX?: number;
    mapCenterTileZ?: number;
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- Nested loops for tile loading across zoom levels
function loadNavMapTiles(options: LoadNavMapTilesOptions): void {
    const { manifest, worldId, tileRange, addedToMap, mapCenterTileX, mapCenterTileZ } = options;
    if (!navMap) {return;}
    const { minTileX, maxTileX, minTileZ, maxTileZ, centerTileX, centerTileZ } = tileRange;
    // Use map center for positioning (relative to Leaflet origin), fall back to tileRange center
    const positionCenterX = mapCenterTileX ?? centerTileX;
    const positionCenterZ = mapCenterTileZ ?? centerTileZ;
    const zoom4TileSize = MAP_CONFIG.tileSize * 16;
    
    debugTiles('loadNavMapTiles: world=%s tileRange=[%d,%d]->[%d,%d] center=[%d,%d] posCenter=[%d,%d]', 
        worldId, minTileX, minTileZ, maxTileX, maxTileZ, centerTileX, centerTileZ, positionCenterX, positionCenterZ);
    debugTiles('loadNavMapTiles: manifest size=%d, checking zoom4 (8192) and zoom8 (512) tiles', manifest.size);
    
    let zoom4Loaded = 0;
    let zoom4Skipped = 0;
    let zoom8Loaded = 0;
    let zoom8Skipped = 0;
    
    // Load zoom 4 tiles as base layer
    const zoom4Tiles = new Set<string>();
    for (let tz = minTileZ - 1; tz <= maxTileZ + 1; tz++) {
        for (let tx = minTileX - 1; tx <= maxTileX + 1; tx++) {
            const z4 = calculateZoom4Coords(tx, tz);
            const key = `${z4.x},${z4.z}`;
            if (!zoom4Tiles.has(key)) {
                zoom4Tiles.add(key);
                if (tileExistsInManifest(manifest, worldId, 8192, z4.x, z4.z)) {
                    zoom4Loaded++;
                    const startZ8X = z4.x * 16;
                    const startZ8Z = z4.z * 16;
                    const dx = startZ8X - positionCenterX;
                    const dy = startZ8Z - positionCenterZ;
                    const bounds: L.LatLngBoundsExpression = [
                        [-dy * MAP_CONFIG.tileSize - zoom4TileSize, dx * MAP_CONFIG.tileSize],
                        [-dy * MAP_CONFIG.tileSize, dx * MAP_CONFIG.tileSize + zoom4TileSize]
                    ];
                    loadTileToMap({ map: navMap, worldId, zoom: 4, tx: z4.x, tz: z4.z, bounds, addedToMap });
                } else {
                    zoom4Skipped++;
                }
            }
        }
    }
    
    debugTiles('loadNavMapTiles: zoom4 loaded=%d skipped=%d (not in manifest)', zoom4Loaded, zoom4Skipped);
    
    // Load zoom 8 tiles on top
    for (let tz = minTileZ - 1; tz <= maxTileZ + 1; tz++) {
        for (let tx = minTileX - 1; tx <= maxTileX + 1; tx++) {
            if (tileExistsInManifest(manifest, worldId, 512, tx, tz)) {
                zoom8Loaded++;
                const relativeX = tx - positionCenterX;
                const relativeZ = tz - positionCenterZ;
                const bounds: L.LatLngBoundsExpression = [
                    [-relativeZ * MAP_CONFIG.tileSize - MAP_CONFIG.tileSize, relativeX * MAP_CONFIG.tileSize],
                    [-relativeZ * MAP_CONFIG.tileSize, relativeX * MAP_CONFIG.tileSize + MAP_CONFIG.tileSize]
                ];
                loadTileToMap({ map: navMap, worldId, zoom: 8, tx, tz, bounds, addedToMap });
            } else {
                zoom8Skipped++;
            }
        }
    }
    
    debugTiles('loadNavMapTiles: zoom8 loaded=%d skipped=%d (not in manifest)', zoom8Loaded, zoom8Skipped);
    debugTiles('loadNavMapTiles: TOTAL loaded=%d (zoom4=%d zoom8=%d)', zoom4Loaded + zoom8Loaded, zoom4Loaded, zoom8Loaded);
}

/**
 * Create route markers for unified view using display coordinates.
 * Nether shops are positioned at overworld-equivalent coords and styled differently.
 */
function createRouteMarkersUnified(
    allStops: RouteStop[], 
    centerTileX: number, 
    centerTileZ: number,
    completedKeys: Set<string>
): L.LatLngExpression[] {
    if (!navMap) {return [];}
    const routePoints: L.LatLngExpression[] = [];
    navStopMarkers = [];
    
    let incompleteIndex = 0;
    
    for (const stop of allStops) {
        const { lat, lng } = toLeafletCoordsRelative(stop.displayX, stop.displayZ, centerTileX, centerTileZ, MAP_CONFIG.tileSize);
        const isCompleted = Boolean(stop.cartItem && completedKeys.has(getTradeKey(stop.cartItem.trade)));
        
        if (!isCompleted) {
            routePoints.push([lat, lng]);
            incompleteIndex++;
        }
        
        const netherClass = stop.isNether ? ' nav-route-marker--nether' : '';
        const completedClass = isCompleted ? ' nav-route-marker--completed' : '';
        const displayIndex = isCompleted ? 0 : incompleteIndex;
        
        const markerIcon = L.divIcon({
            className: `nav-route-marker${netherClass}${completedClass}`,
            html: buildMarkerContent(isCompleted, displayIndex, stop.isNether),
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
        
        const marker = L.marker([lat, lng], { icon: markerIcon })
            .bindTooltip(buildStopTooltip(stop, isCompleted), { permanent: false, direction: 'top', offset: [0, -18] })
            .addTo(navMap);
        
        marker.on('click', () => toggleStopCompletion(stop, allStops));
        navStopMarkers.push(marker);
    }
    
    return routePoints;
}

async function initNavigationMapDialog(route: RouteStop[], _targetWorld?: string): Promise<void> {
    const container = document.querySelector('#nav-dialog-map-container');
    if (!container) {
        debugMap('Map container not found');
        return;
    }
    
    cleanupNavMap();
    navCurrentRoute = route;
    // @ts-expect-error - exposing for e2e testing
    globalThis.__navCurrentRoute = navCurrentRoute;
    
    // Get ALL cart stops for display (including completed ones)
    const allStops = getAllCartStops();
    
    if (allStops.length === 0) {
        container.innerHTML = `<p class="${CSS_CLASSES.CART_EMPTY}" style="text-align: center; padding: 20px; color: var(--color-text-muted);">No route to display</p>`;
        navCurrentWorldRoute = [];
        debugMap('Empty route, no map displayed');
        return;
    }
    
    container.innerHTML = '';
    
    // UNIFIED VIEW: Always use overworld tiles and show ALL stops
    const worldToShow = 'overworld';
    navMapWorld = worldToShow;
    
    // All stops are shown on unified map (using displayX/displayZ for positioning)
    navCurrentWorldRoute = allStops;
    // @ts-expect-error - exposing for e2e testing
    globalThis.__navCurrentWorldRoute = allStops;
    
    debugMap('Unified map: stops=%d overworldStops=%d netherStops=%d completedStops=%d', 
        allStops.length, 
        allStops.filter(s => !s.isNether).length,
        allStops.filter(s => s.isNether).length,
        [...navProgress.completedKeys].length);
    
    // Calculate tile range using ALL stops (including completed) for proper map bounds
    const tileRange = calculateTileRangeUnified(allStops);
    navMapCenterTileX = tileRange.centerTileX;
    navMapCenterTileZ = tileRange.centerTileZ;
    
    // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- This is Leaflet's L.map(), not Array.map()
    navMap = L.map(container as HTMLElement, {
        crs: L.CRS.Simple,
        minZoom: -5,
        maxZoom: 2,
        zoomControl: true,
        attributionControl: false,
        maxBoundsViscosity: 1
    });
    
    // @ts-expect-error - exposing for e2e testing
    globalThis.__navMap = navMap;
    // @ts-expect-error - exposing for e2e testing
    globalThis.__navMapWorld = navMapWorld;
    // @ts-expect-error - exposing for e2e testing
    globalThis.__navMapCenterTileX = tileRange.centerTileX;
    // @ts-expect-error - exposing for e2e testing
    globalThis.__navMapCenterTileZ = tileRange.centerTileZ;
    
    navMap.on('dragstart', () => {
        if (isNavigating) {
            switchToManualMode();
        }
    });
    
    const manifest = await loadTileManifest();
    const addedToNavMap = new Set<string>();
    
    // Always load overworld tiles for unified view
    loadNavMapTiles({ manifest, worldId: worldToShow, tileRange, addedToMap: addedToNavMap });
    
    // Dynamic tile loading when map moves
    const loadVisibleNavMapTiles = () => {
        const viewTileRange = calculateTileRangeFromView(navMapCenterTileX, navMapCenterTileZ);
        if (viewTileRange) {
            debugTiles('loadVisibleNavMapTiles: view range [%d,%d]->[%d,%d]', 
                viewTileRange.minTileX, viewTileRange.minTileZ, viewTileRange.maxTileX, viewTileRange.maxTileZ);
            loadNavMapTiles({ 
                manifest, 
                worldId: worldToShow, 
                tileRange: viewTileRange, 
                addedToMap: addedToNavMap, 
                mapCenterTileX: navMapCenterTileX, 
                mapCenterTileZ: navMapCenterTileZ 
            });
        }
    };
    navMap.on('moveend', loadVisibleNavMapTiles);
    navMap.on('zoomend', loadVisibleNavMapTiles);
    
    // Create markers using display coordinates (unified view)
    // Pass completedKeys so completed shops show checkmarks instead of numbers
    const routePoints = createRouteMarkersUnified(allStops, tileRange.centerTileX, tileRange.centerTileZ, navProgress.completedKeys);
    
    navRoutePolyline = L.polyline(routePoints, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.8,
        dashArray: '10, 5'
    }).addTo(navMap);
    
    if (routePoints.length > 0) {
        const bounds = L.latLngBounds(routePoints);
        navMap.fitBounds(bounds, { padding: [50, 50] });
    }
}

/**
 * Render navigation tab content (route preview timeline only - map is in dialog)
 */
function renderNavigateTab(): void {
    const route = computeRoute();
    
    // Render timeline in navigate tab (preview mode)
    const navTimeline = document.querySelector('#nav-timeline');
    const navDistance = document.querySelector('#nav-distance');
    
    if (navTimeline) {
        navTimeline.innerHTML = '';
        
        if (route.length === 0) {
            navTimeline.innerHTML = `<p class="${CSS_CLASSES.CART_EMPTY}">Add items to cart to see route</p>`;
        } else {
            // Sync progress and render using same function as cart tab
            syncNavProgressWithCart(route);
            
            let previousStop: RouteStop | undefined;
            for (let index = 0; index < route.length; index++) {
                const stop = route[index]!;
                navTimeline.append(createTimelineStop(stop, index, route, previousStop));
                previousStop = stop;
            }
            
            // Add navigating class when navigation is active for matching styling
            navTimeline.classList.toggle('navigating', navPlayerRefreshInterval !== undefined);
        }
    }
    
    // Update distance display
    if (navDistance) {
        if (route.length === 0) {
            navDistance.textContent = '';
        } else {
            const totalDistance = calculateTotalRouteDistance(route);
            const netherDistance = Math.round(totalDistance / 8);
            navDistance.innerHTML = `<span class="dist-label">Distance:</span><span class="dist-ow">${Math.round(totalDistance).toLocaleString()}</span><span class="dist-nether">${netherDistance.toLocaleString()}</span>`;
        }
    }
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadShops();
    
    // Register cart change listener before loading
    cartStore.onChange(updateCartBadge);
    cartStore.load();
    loadNavProgress();
    loadNavMode();

    getElement('searchWant').addEventListener('input', () => {
        debouncedSearch();
    });
    getElement('searchGive').addEventListener('input', () => {
        debouncedSearch();
    });

    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
            event.preventDefault();
            getElement<HTMLInputElement>('searchWant').focus();
        }
    });

    // Matrix dialog
    const matrixDialog = getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX);
    setupDialogBackdropClose(matrixDialog);
    getElement('open-matrix').addEventListener('click', () => {
        openDialog(DIALOG_IDS.MATRIX, renderMatrix);
    });

    // Map dialog
    const mapDialog = document.querySelector<HTMLDialogElement>(SELECTORS.MAP_DIALOG);
    if (mapDialog) {
        setupDialogBackdropClose(mapDialog);
    }
    
    // Cart dialog
    const cartDialog = getElement<HTMLDialogElement>(DIALOG_IDS.CART);
    setupDialogBackdropClose(cartDialog);
    
    // Clean up zero-quantity items when cart dialog closes
    cartDialog.addEventListener('close', () => {
        cleanupZeroQuantityItems();
    });
    
    getElement('open-cart').addEventListener('click', () => {
        renderCartDialog();
        restoreActiveTab();
        cartDialog.showModal();
    });
    getElement('close-cart').addEventListener('click', () => {
        // Stop navigation when closing cart dialog
        if (isNavigating) {
            stopNavigation();
        }
        cartDialog.close();
    });
    getElement('clear-cart').addEventListener('click', () => {
        clearCart();
        refreshCartButtonStates();
        cartDialog.close();
    });
    
    // Tab switching
    setupCartTabs();
    
    // Player name input persistence
    setupPlayerNameInput();
    
    // Navigation controls
    setupNavigationControls();
    
    // Event delegation for trade row clicks (prevents memory leaks)
    getElement('results').addEventListener('click', (event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>(`.${CSS_CLASSES.TRADE_ROW}`);
        if (row) {
            const x = Number.parseInt(row.dataset['x'] ?? '0', 10);
            const y = Number.parseInt(row.dataset['y'] ?? '0', 10);
            const z = Number.parseInt(row.dataset['z'] ?? '0', 10);
            const world = row.dataset['world'] ?? WORLDS.OVERWORLD;
            openMapDialog(x, y, z, world);
        }
    });
});
