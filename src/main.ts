/**
 * Main application entry point for Shop Trade Viewer
 * 
 * This module handles:
 * - DOM initialization and event binding
 * - Search state management
 * - Rendering trade results and UI components
 * - Dynmap integration for map display
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
    getTradeKey,
    shouldSwitchMapWorld
} from './library.js';

import { debugNavigation, debugWorldSwitch, debugPlayerPoll, debugMap, debugTiles } from './debug.js';

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
    CartItem,
    RouteStop,
    ShoppingList,
    NavigationProgress,
    NavigationMode
} from './types.js';

import { NAV_STORAGE_KEY, NAV_PLAYER_KEY, NAV_TAB_KEY, NAV_MODE_KEY } from './types.js';

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
    const dialog = document.querySelector(`#${dialogId}`) as HTMLDialogElement | null;
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

// Column name constants
const COL_COST_NAME: SortColumn = 'cost-name';
const COL_RESULT_NAME: SortColumn = 'result-name';
const COL_COST_AMT: SortColumn = 'cost-amt';
const COL_RESULT_AMT: SortColumn = 'result-amt';

// Column order for sort priority (left to right)
const COLUMN_ORDER: SortColumn[] = [COL_RESULT_AMT, COL_RESULT_NAME, COL_COST_AMT, COL_COST_NAME, 'dev', 'stock', 'distance', 'world'];

// Sort direction constants
const SORT_ASC: SortDirection = 'asc';
const SORT_DESC: SortDirection = 'desc';

// Multi-column sort state
const activeSorts: Map<SortColumn, SortDirection> = new Map([['dev', SORT_ASC]]);

let cachedRegex: RegExp | undefined;
let cachedPattern = '';
let searchDebounceTimer: number | undefined;
const deviationCache = new Map<Trade, DeviationResult | undefined>();

// Virtual scroller instance for performance
let virtualScroller: VirtualScroller<FilterResult> | undefined;

// Current regex patterns for highlighting (used by virtual scroller render)
let currentWantRegex: RegExp | undefined;
let currentGiveRegex: RegExp | undefined;

// Shopping cart state
let cart: CartItem[] = [];
// @ts-expect-error - exposing for e2e testing
globalThis.__cart = cart;
const CART_STORAGE_KEY = 'pvc-trades-cart';
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
let currentPlayerPosition: { x: number; z: number; world: string; yaw?: number } | undefined;
let navPlayerMarker: L.Marker | undefined;

// Auto-advance threshold in blocks
const NAV_ARRIVAL_THRESHOLD = 50;

// ============================================================================
// Constants
// ============================================================================

const DEVIATION_MIN_PERCENT = -99;
const DEVIATION_MAX_PERCENT = 999;

// CSS class constants
const CLASS_CART_EMPTY = 'cart-empty';
const CLASS_TRADE_ROW = 'trade-row';
const SELECTOR_MAP_DIALOG = '#map-dialog';
const SELECTOR_NAV_DIALOG = '#nav-dialog';
const SELECTOR_PLAYER_NAME_INPUT = '#player-name-input';
const SELECTOR_CLOSE_MATRIX = '#close-matrix';
const SELECTOR_RECENTER_MAP = '#recenter-map';
const DIALOG_ID_CART = 'cart-dialog';
const DIALOG_ID_MATRIX = 'matrix-dialog';
const WORLD_OVERWORLD = 'overworld';
const WORLD_NETHER = 'the_nether';
const WORLD_END = 'the_end';

// ============================================================================
// Shopping Cart Functions
// ============================================================================

/**
 * Load cart from localStorage
 */
function loadCart(): void {
    try {
        const stored = localStorage.getItem(CART_STORAGE_KEY);
        if (stored) {
            cart = JSON.parse(stored);
        }
    } catch {
        cart = [];
    }
    updateCartBadge();
}

/**
 * Save cart to localStorage
 */
function saveCart(): void {
    try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
        // Storage full or unavailable - ignore
    }
    updateCartBadge();
}

/**
 * Add a trade to the cart (or increment quantity if exists)
 */
function addToCart(trade: Trade): void {
    const key = getTradeKey(trade);
    const existing = cart.find(item => getTradeKey(item.trade) === key);
    
    if (existing) {
        existing.quantity++;
    } else {
        cart.push({ trade, quantity: 1 });
    }
    
    saveCart();
}

/**
 * Remove a trade from the cart entirely
 */
function removeFromCart(trade: Trade): void {
    const key = getTradeKey(trade);
    cart = cart.filter(item => getTradeKey(item.trade) !== key);
    saveCart();
}

/**
 * Update quantity for a cart item
 * Allows quantity to go to 0 (item stays in cart until dialog closes)
 */
function updateCartQuantity(trade: Trade, delta: number): void {
    const key = getTradeKey(trade);
    const item = cart.find(cartItem => getTradeKey(cartItem.trade) === key);
    
    if (item) {
        item.quantity = Math.max(0, item.quantity + delta);
        saveCart();
    }
}

/**
 * Remove items with zero quantity from cart
 * Called when cart dialog is closed
 */
function cleanupZeroQuantityItems(): void {
    const hadZeroItems = cart.some(item => item.quantity === 0);
    cart = cart.filter(item => item.quantity > 0);
    if (hadZeroItems) {
        saveCart();
        refreshCartButtonStates();
    }
}

/**
 * Clear the entire cart
 */
function clearCart(): void {
    cart = [];
    saveCart();
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
            const data = JSON.parse(stored);
            navProgress = {
                completedKeys: new Set(data.completedKeys),
                currentIndex: data.currentIndex ?? 0
            };
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
        const count = cart.reduce((sum, item) => sum + item.quantity, 0);
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
    const cartKeys = new Set(cart.map(item => getTradeKey(item.trade)));
    
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
    const costs = new Map<string, number>();
    const gains = new Map<string, number>();
    
    for (const cartItem of cart) {
        const { trade, quantity } = cartItem;
        // Aggregate costs
        const cost1Name = formatName(trade.item1);
        const cost1Amount = trade.item1.amount * quantity;
        costs.set(cost1Name, (costs.get(cost1Name) ?? 0) + cost1Amount);
        
        if (trade.item2) {
            const cost2Name = formatName(trade.item2);
            const cost2Amount = trade.item2.amount * quantity;
            costs.set(cost2Name, (costs.get(cost2Name) ?? 0) + cost2Amount);
        }
        
        // Aggregate gains
        const gainAmount = trade.resultAmount * quantity;
        gains.set(trade.resultName, (gains.get(trade.resultName) ?? 0) + gainAmount);
    }
    
    return { costs, gains };
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
    if (cart.length === 0) { return []; }
    
    // Filter cart items: exclude qty=0 and optionally completed items
    let activeItems = cart.filter(item => item.quantity > 0);
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
        route.push({
            type: 'shop',
            x: item.trade.x,
            y: item.trade.y,
            z: item.trade.z,
            world: item.trade.world,
            cartItem: item
        });
    }
    
    return route;
}

/**
 * Calculate total route distance
 */
function calculateTotalRouteDistance(route: RouteStop[]): number {
    if (route.length === 0) { return 0; }
    
    let total = 0;
    let previousX = 0;
    let previousZ = 0;
    let previousWorld = 'overworld';
    
    for (const stop of route) {
        total += calculateRouteDistance(previousX, previousZ, previousWorld, stop.x, stop.z, stop.world);
        previousX = stop.x;
        previousZ = stop.z;
        previousWorld = stop.world;
    }
    
    return total;
}

// ============================================================================
// DOM Helpers
// ============================================================================

function getElement<T extends HTMLElement>(id: string): T {
    const element = document.querySelector<T>(`#${id}`);
    if (!element) { throw new Error(`Element #${id} not found`); }
    return element;
}

function getInputValue(id: string): string {
    return getElement<HTMLInputElement>(id).value.trim().toLowerCase();
}

// ============================================================================
// Data Loading
// ============================================================================

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
    const startsAsc = column === COL_COST_NAME || column === COL_RESULT_NAME;
    const currentDirection = activeSorts.get(column);
    
    if (currentDirection === undefined) {
        activeSorts.set(column, startsAsc ? SORT_ASC : SORT_DESC);
    } else {
        // Cycle through 3 states based on initial direction
        if (startsAsc) {
            // asc -> desc -> none
            if (currentDirection === SORT_ASC) {
                activeSorts.set(column, SORT_DESC);
            } else {
                activeSorts.delete(column);
            }
        } else {
            // desc -> asc -> none
            if (currentDirection === SORT_DESC) {
                activeSorts.set(column, SORT_ASC);
            } else {
                activeSorts.delete(column);
            }
        }
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
    const multiplier = direction === SORT_ASC ? 1 : -1;
    const ta = a.trade;
    const tb = b.trade;
    
    switch (column) {
        case 'dev': {
            return multiplier * compareDeviation(ta, tb);
        }
        case COL_COST_AMT: {
            return multiplier * (getTotalCostAmount(ta) - getTotalCostAmount(tb));
        }
        case COL_COST_NAME: {
            return multiplier * ta.costName.localeCompare(tb.costName);
        }
        case COL_RESULT_AMT: {
            return multiplier * (ta.resultAmount - tb.resultAmount);
        }
        case COL_RESULT_NAME: {
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
    const percent = Math.max(DEVIATION_MIN_PERCENT, Math.min(DEVIATION_MAX_PERCENT, Math.round((ratio - 1) * 100)));

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
    return direction === SORT_ASC ? '↑' : '↓';
}

// Right-aligned columns get arrow before label, left-aligned get arrow after
const RIGHT_ALIGNED_COLS = new Set([COL_RESULT_AMT, COL_COST_AMT, 'stock', 'dev', 'distance', 'world']);

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
    row.className = CLASS_TRADE_ROW;
    row.dataset['x'] = String(t.x);
    row.dataset['y'] = String(t.y);
    row.dataset['z'] = String(t.z);
    row.dataset['world'] = t.world;
    
    const tradeKey = getTradeKey(t);
    const isInCart = cart.some(item => getTradeKey(item.trade) === tradeKey);
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
        addToCart(t);
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
        container.querySelector(SELECTOR_CLOSE_MATRIX)?.addEventListener('click', () => {
            getElement<HTMLDialogElement>(DIALOG_ID_MATRIX).close();
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
    container.querySelector(SELECTOR_CLOSE_MATRIX)?.addEventListener('click', () => {
        getElement<HTMLDialogElement>(DIALOG_ID_MATRIX).close();
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
    return player.foreign ? WORLD_NETHER : WORLD_OVERWORLD;
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
        const pWorld = p.world ? getWorldId(p.world) : WORLD_OVERWORLD;
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
    const dialog = document.querySelector(SELECTOR_MAP_DIALOG) as HTMLDialogElement | null;
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
            const cartDialog = getElement<HTMLDialogElement>(DIALOG_ID_CART);
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
            updateCartQuantity(trade, -1);
            renderCartDialog();
        }
    });
    
    plusButton.addEventListener('click', () => {
        updateCartQuantity(trade, 1);
        renderCartDialog();
    });
    
    removeButton.addEventListener('click', () => {
        removeFromCart(trade);
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
            const cartDialog = getElement<HTMLDialogElement>(DIALOG_ID_CART);
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
    
    if (cart.length === 0) {
        itemsContainer.innerHTML = `<p class="${CLASS_CART_EMPTY}">Your cart is empty</p>`;
        clearCartButton.classList.add('hidden');
        return;
    }
    
    clearCartButton.classList.remove('hidden');
    
    // Render cart items
    for (const cartItem of cart) {
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
    const input = document.querySelector(SELECTOR_PLAYER_NAME_INPUT) as HTMLInputElement | null;
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
    const playerNameInput = document.querySelector('#player-name-input') as HTMLInputElement | null;
    
    if (!playerNameInput?.value.trim()) {
        playerNameInput?.focus();
        return;
    }
    
    debugNavigation('Starting navigation player=%s cartSize=%d', playerNameInput.value.trim(), cart.length);
    
    isNavigating = true;
    navMode = 'follow';
    saveNavMode();
    
    // Close cart dialog and open navigation dialog
    const cartDialog = getElement<HTMLDialogElement>('cart-dialog');
    const navDialog = document.querySelector(SELECTOR_NAV_DIALOG) as HTMLDialogElement | null;
    
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
                    z: player.position.z,
                    world: playerWorld,
                    yaw: player.rotation?.yaw
                };
                debugNavigation('Initial player position world=%s x=%d z=%d', playerWorld, player.position.x, player.position.z);
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
    const navDialog = document.querySelector(SELECTOR_NAV_DIALOG) as HTMLDialogElement | null;
    const cartDialog = getElement<HTMLDialogElement>(DIALOG_ID_CART);
    
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
        z: player.position.z,
        world: playerWorld,
        yaw: player.rotation?.yaw
    };
    // @ts-expect-error - exposing for e2e testing
    globalThis.__currentPlayerPosition = currentPlayerPosition;
    
    // Check if we need to switch the map to a different world
    const fullRoute = computeRoute(currentPlayerPosition, true);
    const shopsInPlayerWorld = fullRoute.filter(stop => getWorldId(stop.world) === playerWorld);
    
    const shouldSwitch = shouldSwitchMapWorld(previousPosition?.world, playerWorld, navMapWorld, shopsInPlayerWorld.length);
    
    debugWorldSwitch('Checking prev=%s curr=%s map=%s shopsInNew=%d shouldSwitch=%s', 
        previousPosition?.world, playerWorld, navMapWorld, shopsInPlayerWorld.length, shouldSwitch);
    
    if (shouldSwitch) {
        debugWorldSwitch('Switching map from=%s to=%s shopsInNew=%d', navMapWorld, playerWorld, shopsInPlayerWorld.length);
        navCurrentRoute = fullRoute;
        await initNavigationMapDialog(fullRoute, playerWorld);
        // After world switch, show player marker and center on player (not shops)
        updatePlayerMarker();
        updateLiveDistance();
        if (navMode === 'follow') {
            centerMapOnPlayer();
        }
        return;
    }
    
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
    const playerNameInput = document.querySelector(SELECTOR_PLAYER_NAME_INPUT) as HTMLInputElement | null;
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
    
    // Only show player marker if player is in the same world as the map
    // When worlds differ, marker stays hidden until player enters correct world
    // Use getWorldId to normalize world names (e.g., "World" -> "overworld")
    if (getWorldId(currentPlayerPosition.world) !== navMapWorld) {
        if (navPlayerMarker) {
            navPlayerMarker.setOpacity(0);  // Hide but don't remove
        }
        return;
    }
    
    const { lat, lng } = toLeafletCoordsRelative(
        currentPlayerPosition.x,
        currentPlayerPosition.z,
        navMapCenterTileX,
        navMapCenterTileZ,
        MAP_CONFIG.tileSize
    );
    
    // Calculate rotation for direction arrow (convert Minecraft yaw to CSS rotation)
    // Minecraft: 0=south, 90=west, 180=north, 270=east
    // CSS: 0=up(north), so we add 180 to convert
    const rotation = currentPlayerPosition.yaw === undefined ? 0 : currentPlayerPosition.yaw + 180;
    const hasHeading = currentPlayerPosition.yaw !== undefined;
    
    const playerIconHtml = hasHeading
        ? `<div class="nav-player-dot"><div class="nav-player-arrow" style="transform: rotate(${rotation}deg) translate(-50%, -100%)"></div></div>`
        : '<div class="nav-player-dot"></div>';
    
    if (navPlayerMarker) {
        // Update existing marker position and rotation
        navPlayerMarker.setLatLng([lat, lng]);
        navPlayerMarker.setOpacity(1);  // Ensure visible when in correct world
        // Update icon to reflect new heading
        const playerIcon = L.divIcon({
            className: 'nav-player-marker',
            html: playerIconHtml,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });
        navPlayerMarker.setIcon(playerIcon);
    } else {
        // Create new marker
        const playerIcon = L.divIcon({
            className: 'nav-player-marker',
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
 * This only updates markers/polylines for the CURRENT world shown on the map.
 * For world switching, see pollPlayerPosition and checkAutoAdvance.
 */
function recalculateRouteFromPlayer(): void {
    if (!navMap || !currentPlayerPosition) {
        return;
    }
    
    // Only recalculate map visuals if player is in the same world as the map
    // Use getWorldId to normalize world names (e.g., "World" -> "overworld")
    if (getWorldId(currentPlayerPosition.world) !== navMapWorld) {
        return;
    }
    
    // Compute new route from player position, excluding completed items
    const fullRoute = computeRoute(currentPlayerPosition, true);
    
    // Update the full route
    navCurrentRoute = fullRoute;
    
    // Filter to only stops in the current map world for display
    const worldRoute = fullRoute.filter(stop => getWorldId(stop.world) === navMapWorld);
    
    // Check if route order actually changed compared to what's displayed
    const routeChanged = navCurrentWorldRoute.length !== worldRoute.length ||
        worldRoute.some((stop, index) => {
            const oldStop = navCurrentWorldRoute[index];
            return !oldStop || stop.x !== oldStop.x || stop.z !== oldStop.z;
        });
    
    if (!routeChanged) {
        return; // No need to update if route order is the same
    }
    
    navCurrentWorldRoute = worldRoute;
    // @ts-expect-error - exposing for e2e testing
    globalThis.__navCurrentWorldRoute = worldRoute;
    
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
    
    // Draw new route if we have stops in this world
    if (worldRoute.length > 0) {
        const routePoints: L.LatLngExpression[] = [];
        
        for (const [index, element] of worldRoute.entries()) {
            const stop = element!;
            const { lat, lng } = toLeafletCoordsRelative(stop.x, stop.z, navMapCenterTileX, navMapCenterTileZ, MAP_CONFIG.tileSize);
            routePoints.push([lat, lng]);
            
            // Add numbered marker for each stop
            const markerIcon = L.divIcon({
                className: 'nav-route-marker',
                html: `<div class="nav-marker">${index + 1}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });
            
            const tooltipText = stop.cartItem 
                ? `${stop.cartItem.quantity}× ${stop.cartItem.trade.resultName}`
                : `Stop ${index + 1}`;
            
            const marker = L.marker([lat, lng], { icon: markerIcon })
                .bindTooltip(tooltipText, { 
                    permanent: false,
                    direction: 'top',
                    offset: [0, -18]
                })
                .addTo(navMap);
            
            // Click marker to toggle completion during navigation
            marker.on('click', () => {
                toggleStopCompletion(stop, navCurrentRoute);
            });
            
            navStopMarkers.push(marker);
        }
        
        // Draw polyline connecting all stops (solid line between shops)
        navRoutePolyline = L.polyline(routePoints, {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8,
            dashArray: '10, 5'
        }).addTo(navMap);
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
    
    // Only draw line if player is in the same world as the map
    // Use getWorldId to normalize world names (e.g., "World" -> "overworld")
    if (getWorldId(currentPlayerPosition.world) !== navMapWorld) {
        return;
    }
    
    // Use world-filtered route for the line (shows connection to next stop in THIS world)
    if (navCurrentWorldRoute.length === 0) {
        return; // No stops in this world
    }
    
    const nextStop = navCurrentWorldRoute[0]!;
    
    // Get player position in Leaflet coordinates
    const playerCoords = toLeafletCoordsRelative(
        currentPlayerPosition.x,
        currentPlayerPosition.z,
        navMapCenterTileX,
        navMapCenterTileZ,
        MAP_CONFIG.tileSize
    );
    
    // Get next stop position in Leaflet coordinates
    const stopCoords = toLeafletCoordsRelative(
        nextStop.x,
        nextStop.z,
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
 * Get world display name for navigation UI
 */
function getWorldDisplayNameForNav(worldId: string): string {
    if (worldId === WORLD_NETHER) {
        return 'the Nether';
    }
    if (worldId === WORLD_END) {
        return 'the End';
    }
    return 'Overworld';
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
        const playerWorld = getWorldId(currentPlayerPosition.world);
        const stopWorld = getWorldId(currentStop.world);
        const isSameWorld = playerWorld === stopWorld;
        
        const distance = calculateRouteDistance(
            currentPlayerPosition.x, currentPlayerPosition.z, currentPlayerPosition.world,
            currentStop.x, currentStop.z, currentStop.world
        );
        
        const itemName = currentStop.cartItem?.trade.resultName ?? 'Next stop';
        const quantity = currentStop.cartItem?.quantity ?? 1;
        
        // Format world name for display
        const worldDisplayName = getWorldDisplayNameForNav(stopWorld);
        
        const distanceText = Math.round(distance).toLocaleString();
        distanceHtml = isSameWorld
            ? `<span class="distance-label">→ ${itemName}:</span><span class="distance-value">${distanceText} blocks</span>`
            : `<span class="distance-label">🌍 Travel to ${worldDisplayName}</span><span class="distance-value">→ ${itemName}</span>`;
        
        // Detailed display for navigation dialog with coords and items
        const coordsText = `${currentStop.x}, ${currentStop.y}, ${currentStop.z}`;
        const buyText = `${quantity}× ${itemName}`;
        
        dialogHtml = isSameWorld ? `
                <div class="nav-info-row">
                    <span class="nav-info-label">📍</span>
                    <span class="nav-info-coords">${coordsText}</span>
                </div>
                <div class="nav-info-row">
                    <span class="nav-info-label">🛒</span>
                    <span class="nav-info-item">${buyText}</span>
                </div>
                <div class="nav-info-row">
                    <span class="nav-info-label">↗</span>
                    <span class="nav-info-distance">${Math.round(distance).toLocaleString()} blocks</span>
                </div>
            ` : `
                <div class="nav-info-row">
                    <span class="nav-info-label">🌍</span>
                    <span class="nav-info-world">Travel to ${worldDisplayName}</span>
                </div>
                <div class="nav-info-row">
                    <span class="nav-info-label">📍</span>
                    <span class="nav-info-coords">${coordsText}</span>
                </div>
                <div class="nav-info-row">
                    <span class="nav-info-label">🛒</span>
                    <span class="nav-info-item">${buyText}</span>
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
 * Check if player is close enough to auto-advance to next stop
 */
function checkAutoAdvance(): void {
    if (!currentPlayerPosition || navCurrentRoute.length === 0) {
        return;
    }
    
    // First stop is always the current target (completed items are filtered out)
    const currentStop = navCurrentRoute[0]!;
    const distance = calculateRouteDistance(
        currentPlayerPosition.x, currentPlayerPosition.z, currentPlayerPosition.world,
        currentStop.x, currentStop.z, currentStop.world
    );
    
    if (distance < NAV_ARRIVAL_THRESHOLD && currentStop.cartItem) {
        // Auto-complete this stop
        const key = getTradeKey(currentStop.cartItem.trade);
        navProgress.completedKeys.add(key);
        saveNavProgress();
        
        // Recalculate route to remove completed item
        const fullRoute = computeRoute(currentPlayerPosition, true);
        navCurrentRoute = fullRoute;
        
        // Check if the next shop is in a different world - if so, switch the map
        const nextWorld = getNextShopWorld(fullRoute);
        if (nextWorld && nextWorld !== navMapWorld) {
            // Next shop is in a different world - reinitialize map for that world
            void initNavigationMapDialog(fullRoute);
        } else {
            // Same world - just update markers and polylines
            recalculateRouteFromPlayer();
        }
        
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
    
    if (nearestShop && nearestShop.cartItem) {
        const shopKey = `${nearestShop.x},${nearestShop.z}`;
        
        // Only show tooltip when ENTERING a new shop area
        if (currentNearbyShopKey !== shopKey) {
            currentNearbyShopKey = shopKey;
            
            // Group all items at this shop location
            const itemsAtShop = cart.filter(item => 
                item.trade.x === nearestShop!.x && 
                item.trade.z === nearestShop!.z &&
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
    
    // Only center on player if they're in the same world as the map
    // Use getWorldId to normalize world names (e.g., "World" -> "overworld")
    if (getWorldId(currentPlayerPosition.world) !== navMapWorld) {
        return;
    }
    
    const { lat, lng } = toLeafletCoordsRelative(
        currentPlayerPosition.x,
        currentPlayerPosition.z,
        navMapCenterTileX,
        navMapCenterTileZ,
        MAP_CONFIG.tileSize
    );
    
    // Calculate overworld-equivalent distance to nearest non-completed shop IN THIS WORLD
    const route = navCurrentWorldRoute.length > 0 ? navCurrentWorldRoute : [];
    let minDistance = Infinity;
    const isNether = currentPlayerPosition.world.toLowerCase().includes('nether');
    
    for (const stop of route) {
        const deltaX = currentPlayerPosition.x - stop.x;
        const deltaZ = currentPlayerPosition.z - stop.z;
        let distance = Math.hypot(deltaX, deltaZ);
        
        // In nether, multiply distance by 8 to get overworld-equivalent
        // This makes zoom behavior consistent: 100 nether blocks feels like 800 OW blocks
        if (isNether) {
            distance *= 8;
        }
        
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
    const recenterButton = document.querySelector(SELECTOR_RECENTER_MAP);
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
    const recenterButton = document.querySelector(SELECTOR_RECENTER_MAP);
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
    const recenterButton = document.querySelector(SELECTOR_RECENTER_MAP);
    const closeNavButton = document.querySelector('#close-nav');
    
    startButton?.addEventListener('click', toggleNavigation);
    recenterButton?.addEventListener('click', switchToFollowMode);
    closeNavButton?.addEventListener('click', stopNavigation);
    
    // Set up nav dialog backdrop close
    const navDialog = document.querySelector(SELECTOR_NAV_DIALOG) as HTMLDialogElement | null;
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
let navMapWorld: string = WORLD_OVERWORLD;  // World currently shown on nav map

/**
 * Get the world of the next uncompleted shop in the route.
 * This determines which world the map should show.
 */
function getNextShopWorld(route: RouteStop[]): string | undefined {
    if (route.length === 0) {
        return undefined;
    }
    return getWorldId(route[0]!.world);
}

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

function determineWorldToShow(route: RouteStop[], targetWorld?: string): string {
    if (targetWorld) {
        const shopsInTarget = route.filter(stop => getWorldId(stop.world) === targetWorld);
        if (shopsInTarget.length > 0) {
            debugMap('determineWorldToShow: using targetWorld=%s shops=%d', targetWorld, shopsInTarget.length);
            return targetWorld;
        }
        debugMap('determineWorldToShow: targetWorld=%s has no shops, routeWorlds=%o', 
            targetWorld, [...new Set(route.map(s => getWorldId(s.world)))]);
    } else if (currentPlayerPosition) {
        const playerWorld = currentPlayerPosition.world;
        const shopsInPlayerWorld = route.filter(stop => getWorldId(stop.world) === playerWorld);
        if (shopsInPlayerWorld.length > 0) {
            debugMap('determineWorldToShow: using playerWorld=%s shops=%d', playerWorld, shopsInPlayerWorld.length);
            return playerWorld;
        }
        debugMap('determineWorldToShow: playerWorld=%s has no shops, routeWorlds=%o', 
            playerWorld, [...new Set(route.map(s => getWorldId(s.world)))]);
    }
    const fallback = getWorldId(route[0]!.world);
    debugMap('determineWorldToShow: using first stop world=%s', fallback);
    return fallback;
}

interface TileRange {
    minTileX: number;
    maxTileX: number;
    minTileZ: number;
    maxTileZ: number;
    centerTileX: number;
    centerTileZ: number;
}

function calculateTileRange(stops: RouteStop[]): TileRange {
    const xs = stops.map(stop => stop.x);
    const zs = stops.map(stop => stop.z);
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

// eslint-disable-next-line sonarjs/cognitive-complexity -- Nested loops for tile loading across zoom levels
function loadNavMapTiles(
    manifest: Set<string>, 
    worldId: string, 
    tileRange: TileRange, 
    addedToMap: Set<string>
): void {
    if (!navMap) {return;}
    const { minTileX, maxTileX, minTileZ, maxTileZ, centerTileX, centerTileZ } = tileRange;
    const zoom4TileSize = MAP_CONFIG.tileSize * 16;
    
    debugTiles('loadNavMapTiles: world=%s tileRange=[%d,%d]->[%d,%d] center=[%d,%d]', 
        worldId, minTileX, minTileZ, maxTileX, maxTileZ, centerTileX, centerTileZ);
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
                    const dx = startZ8X - centerTileX;
                    const dy = startZ8Z - centerTileZ;
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
                const relativeX = tx - centerTileX;
                const relativeZ = tz - centerTileZ;
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

function createRouteMarkers(
    stopsInWorld: RouteStop[], 
    centerTileX: number, 
    centerTileZ: number, 
    route: RouteStop[]
): L.LatLngExpression[] {
    if (!navMap) {return [];}
    const routePoints: L.LatLngExpression[] = [];
    navStopMarkers = [];
    
    for (const [index, element] of stopsInWorld.entries()) {
        const stop = element!;
        const { lat, lng } = toLeafletCoordsRelative(stop.x, stop.z, centerTileX, centerTileZ, MAP_CONFIG.tileSize);
        routePoints.push([lat, lng]);
        
        const markerIcon = L.divIcon({
            className: 'nav-route-marker',
            html: `<div class="nav-marker">${index + 1}</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
        
        const tooltipText = stop.cartItem 
            ? `${stop.cartItem.quantity}× ${stop.cartItem.trade.resultName}`
            : `Stop ${index + 1}`;
        
        const marker = L.marker([lat, lng], { icon: markerIcon })
            .bindTooltip(tooltipText, { permanent: false, direction: 'top', offset: [0, -18] })
            .addTo(navMap);
        
        marker.on('click', () => toggleStopCompletion(stop, route));
        navStopMarkers.push(marker);
    }
    
    return routePoints;
}

async function initNavigationMapDialog(route: RouteStop[], targetWorld?: string): Promise<void> {
    const container = document.querySelector('#nav-dialog-map-container');
    if (!container) {
        debugMap('Map container not found');
        return;
    }
    
    cleanupNavMap();
    navCurrentRoute = route;
    
    if (route.length === 0) {
        container.innerHTML = `<p class="${CLASS_CART_EMPTY}" style="text-align: center; padding: 20px; color: var(--color-text-muted);">No route to display</p>`;
        navCurrentWorldRoute = [];
        debugMap('Empty route, no map displayed');
        return;
    }
    
    container.innerHTML = '';
    
    const worldToShow = determineWorldToShow(route, targetWorld);
    navMapWorld = worldToShow;
    
    debugMap('Map initialized targetWorld=%s worldToShow=%s stops=%d stopsInWorld=%d', 
        targetWorld, worldToShow, route.length, route.filter(stop => getWorldId(stop.world) === worldToShow).length);
    
    const stopsInWorld = route.filter(stop => getWorldId(stop.world) === worldToShow);
    navCurrentWorldRoute = stopsInWorld;
    // @ts-expect-error - exposing for e2e testing
    globalThis.__navCurrentWorldRoute = stopsInWorld;
    
    const tileRange = calculateTileRange(stopsInWorld);
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
    
    // Initial tile load for shop-centered view
    loadNavMapTiles(manifest, worldToShow, tileRange, addedToNavMap);
    
    // Dynamic tile loading when map moves (e.g., when centering on player)
    const loadVisibleNavMapTiles = () => {
        const viewTileRange = calculateTileRangeFromView(navMapCenterTileX, navMapCenterTileZ);
        if (viewTileRange) {
            debugTiles('loadVisibleNavMapTiles: view range [%d,%d]->[%d,%d]', 
                viewTileRange.minTileX, viewTileRange.minTileZ, viewTileRange.maxTileX, viewTileRange.maxTileZ);
            loadNavMapTiles(manifest, worldToShow, viewTileRange, addedToNavMap);
        }
    };
    navMap.on('moveend', loadVisibleNavMapTiles);
    navMap.on('zoomend', loadVisibleNavMapTiles);
    
    const routePoints = createRouteMarkers(stopsInWorld, tileRange.centerTileX, tileRange.centerTileZ, route);
    
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
            navTimeline.innerHTML = `<p class="${CLASS_CART_EMPTY}">Add items to cart to see route</p>`;
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
    loadCart();
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
    const matrixDialog = getElement<HTMLDialogElement>(DIALOG_ID_MATRIX);
    setupDialogBackdropClose(matrixDialog);
    getElement('open-matrix').addEventListener('click', () => {
        openDialog(DIALOG_ID_MATRIX, renderMatrix);
    });

    // Map dialog
    const mapDialog = document.querySelector(SELECTOR_MAP_DIALOG) as HTMLDialogElement | null;
    if (mapDialog) {
        setupDialogBackdropClose(mapDialog);
    }
    
    // Cart dialog
    const cartDialog = getElement<HTMLDialogElement>(DIALOG_ID_CART);
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
        const row = (event.target as HTMLElement).closest<HTMLElement>(`.${CLASS_TRADE_ROW}`);
        if (row) {
            const x = Number.parseInt(row.dataset['x'] ?? '0', 10);
            const y = Number.parseInt(row.dataset['y'] ?? '0', 10);
            const z = Number.parseInt(row.dataset['z'] ?? '0', 10);
            const world = row.dataset['world'] ?? WORLD_OVERWORLD;
            openMapDialog(x, y, z, world);
        }
    });
});
