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
    getTradeKey
} from './lib.js';

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
    isGood: boolean | null;
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
    
    const isOutsideDialog = (e: MouseEvent): boolean => {
        const rect = dialog.getBoundingClientRect();
        return (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
        );
    };
    
    dialog.addEventListener('mousedown', e => {
        mouseDownOutside = isOutsideDialog(e);
    });
    
    dialog.addEventListener('click', e => {
        if (mouseDownOutside && isOutsideDialog(e)) {
            dialog.close();
        }
        mouseDownOutside = false;
    });
}

/**
 * Open a dialog with content preparation
 */
function openDialog(dialogId: string, prepare?: () => void): void {
    const dialog = document.getElementById(dialogId) as HTMLDialogElement | null;
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
let itemValues: ItemValues | null = null;
let ratioGraph: RatioGraph | null = null;

// Column order for sort priority (left to right)
const COLUMN_ORDER: SortColumn[] = ['result-amt', 'result-name', 'cost-amt', 'cost-name', 'dev', 'stock', 'distance', 'world'];

// Multi-column sort state
const activeSorts: Map<SortColumn, SortDirection> = new Map([['dev', 'asc']]);

let cachedRegex: RegExp | null = null;
let cachedPattern = '';
let searchDebounceTimer: number | null = null;
const deviationCache = new Map<Trade, DeviationResult | null>();

// Virtual scroller instance for performance
let virtualScroller: VirtualScroller<FilterResult> | null = null;

// Current regex patterns for highlighting (used by virtual scroller render)
let currentWantRegex: RegExp | null = null;
let currentGiveRegex: RegExp | null = null;

// Shopping cart state
let cart: CartItem[] = [];
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
let navPlayerRefreshInterval: ReturnType<typeof setInterval> | null = null;
let currentPlayerPosition: { x: number; z: number; world: string; yaw?: number } | null = null;
let navPlayerMarker: L.Marker | null = null;

// Auto-advance threshold in blocks
const NAV_ARRIVAL_THRESHOLD = 50;

// ============================================================================
// Constants
// ============================================================================

const DEVIATION_MIN_PERCENT = -99;
const DEVIATION_MAX_PERCENT = 999;

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
    const item = cart.find(i => getTradeKey(i.trade) === key);
    
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
                completedKeys: new Set(data.completedKeys ?? []),
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
    for (let i = 0; i < route.length; i++) {
        const stop = route[i];
        if (stop?.type === 'shop' && stop.cartItem) {
            const key = getTradeKey(stop.cartItem.trade);
            if (!validCompleted.has(key)) {
                currentIndex = i;
                break;
            }
        }
        // If we reach the end, all are completed
        if (i === route.length - 1) {
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
    const badge = document.getElementById('cart-badge');
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
    const buttons = document.querySelectorAll('.add-to-cart-btn[data-trade-key]');
    const cartKeys = new Set(cart.map(item => getTradeKey(item.trade)));
    
    buttons.forEach(btn => {
        const key = btn.getAttribute('data-trade-key');
        if (key) {
            btn.classList.toggle('in-cart', cartKeys.has(key));
        }
    });
}

/**
 * Aggregate cart into shopping lists
 */
function getShoppingList(): ShoppingList {
    const costs = new Map<string, number>();
    const gains = new Map<string, number>();
    
    for (const { trade, quantity } of cart) {
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
    
    // Filter cart items if excluding completed
    const activeItems = excludeCompleted
        ? cart.filter(item => !navProgress.completedKeys.has(getTradeKey(item.trade)))
        : cart;
    
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
    
    for (const idx of order) {
        const item = activeItems[idx]!;
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
    let prevX = 0;
    let prevZ = 0;
    let prevWorld = 'overworld';
    
    for (const stop of route) {
        total += calculateRouteDistance(prevX, prevZ, prevWorld, stop.x, stop.z, stop.world);
        prevX = stop.x;
        prevZ = stop.z;
        prevWorld = stop.world;
    }
    
    return total;
}

// ============================================================================
// DOM Helpers
// ============================================================================

function getElement<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) { throw new Error(`Element #${id} not found`); }
    return el as T;
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
        const [dataRes, mappingRes] = await Promise.all([
            fetch(config.dataUrl),
            fetch('trade_conversions.json')
        ]);

        if (!dataRes.ok || !mappingRes.ok) {
            throw new Error('Failed to load shop data');
        }

        const data = (await dataRes.json()) as ShopData;
        mappingRules = (await mappingRes.json()) as MappingRule[];
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
    if (searchDebounceTimer !== null) {
        cancelAnimationFrame(searchDebounceTimer);
    }
    searchDebounceTimer = requestAnimationFrame(() => {
        searchDebounceTimer = null;
        search();
    });
}

function search(): void {
    const wantQuery = getInputValue('searchWant');
    const giveQuery = getInputValue('searchGive');

    const wantRegex = wantQuery ? getCachedRegex(wantQuery) : null;
    const giveRegex = giveQuery ? getCachedRegex(giveQuery) : null;
    const results: FilterResult[] = [];

    for (const trade of allTrades) {
        const result = filterTrade(trade, wantQuery, giveQuery);
        if (result) { results.push(result); }
    }

    sortResults(results);
    renderResults(results, wantRegex, giveRegex);
}

function sortByColumn(column: SortColumn): void {
    const startsAsc = ['cost-name', 'result-name'].includes(column);
    const currentDir = activeSorts.get(column);
    
    if (currentDir !== undefined) {
        // Cycle through 3 states based on initial direction
        if (startsAsc) {
            // asc -> desc -> none
            if (currentDir === 'asc') {
                activeSorts.set(column, 'desc');
            } else {
                activeSorts.delete(column);
            }
        } else {
            // desc -> asc -> none
            if (currentDir === 'desc') {
                activeSorts.set(column, 'asc');
            } else {
                activeSorts.delete(column);
            }
        }
    } else {
        activeSorts.set(column, startsAsc ? 'asc' : 'desc');
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

function compareByColumn(a: FilterResult, b: FilterResult, column: SortColumn, direction: SortDirection): number {
    const dir = direction === 'asc' ? 1 : -1;
    const ta = a.trade;
    const tb = b.trade;
    
    switch (column) {
        case 'dev': {
            const devA = getDeviation(ta);
            const devB = getDeviation(tb);
            if (!devA && !devB) {return 0;}
            if (!devA) {return 1;}
            if (!devB) {return -1;}
            return dir * (devA.percent - devB.percent);
        }
        case 'cost-amt':
            return dir * ((ta.item1.amount + (ta.item2?.amount || 0)) - (tb.item1.amount + (tb.item2?.amount || 0)));
        case 'cost-name':
            return dir * ta.costName.localeCompare(tb.costName);
        case 'result-amt':
            return dir * (ta.resultAmount - tb.resultAmount);
        case 'result-name':
            return dir * ta.resultName.localeCompare(tb.resultName);
        case 'stock':
            return dir * (ta.displayStock - tb.displayStock);
        case 'world':
            return dir * ta.world.localeCompare(tb.world);
        case 'distance':
            return dir * (Math.hypot(ta.x, ta.z) - Math.hypot(tb.x, tb.z));
        default:
            return 0;
    }
}

// ============================================================================
// Deviation Calculation
// ============================================================================

function getDeviation(trade: Trade): DeviationResult | null {
    if (deviationCache.has(trade)) {
        return deviationCache.get(trade)!;
    }

    if (!itemValues) { return null; }

    const costValue = getTrustedItemValue(trade.costName, itemValues);
    const resultValue = getTrustedItemValue(trade.resultName, itemValues);

    if (costValue === null || resultValue === null) { return null; }

    const expectedRate = resultValue / costValue;
    const actualRate = trade.item1.amount / trade.resultAmount;

    const ratio = actualRate / expectedRate;
    const percent = Math.max(DEVIATION_MIN_PERCENT, Math.min(DEVIATION_MAX_PERCENT, Math.round((ratio - 1) * 100)));

    if (percent === 0) {
        const result = { ratio, percent, text: '0%', isGood: null };
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
    return direction === 'asc' ? '↑' : '↓';
}

// Right-aligned columns get arrow before label, left-aligned get arrow after
const RIGHT_ALIGNED_COLS = new Set(['result-amt', 'cost-amt', 'stock', 'dev', 'distance', 'world']);

function updateSortArrows(): void {
    document.querySelectorAll<HTMLElement>('#table-header .header').forEach(el => {
        const label = el.dataset['label'] ?? '';
        const col = el.dataset['col'] ?? '';
        const arrow = getArrow(col);
        if (RIGHT_ALIGNED_COLS.has(col)) {
            el.textContent = arrow + label;
        } else {
            el.textContent = label + arrow;
        }
        el.classList.toggle('active-sort', activeSorts.has(col as SortColumn));
    });
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

    header.querySelectorAll<HTMLElement>('.header').forEach(el => {
        el.addEventListener('click', () => {
            const col = el.dataset['col'] as SortColumn | undefined;
            if (col) { sortByColumn(col); }
        });
    });

    updateSortArrows();
}

/**
 * Create a trade row DOM element for a single result
 */
function createTradeRowElement(result: FilterResult): HTMLElement {
    const { trade: t, matchResult, matchCost, displayName, displayAmount } = result;
    const showName = displayName ?? t.resultName;
    const showAmount = displayAmount ?? t.resultAmount;
    const stockClass = t.displayStock === 0 ? 'no-stock' : 'in-stock';

    let costAmt = String(t.item1.amount);
    let costName = t.costName;
    if (t.item2) {
        costAmt += '+' + t.item2.amount;
        costName += ' + ' + formatName(t.item2);
    }

    const costDisplay = matchCost && currentGiveRegex ? highlight(costName, currentGiveRegex) : escapeHtml(costName);
    const resultDisplay = matchResult && currentWantRegex ? highlight(showName, currentWantRegex) : escapeHtml(showName);

    const dev = getDeviation(t);
    const devClass = dev && dev.isGood !== null ? (dev.isGood ? 'good-deal' : 'bad-deal') : '';
    const devText = dev ? dev.text : '';

    // Abbreviate world names: O=Overworld, N=Nether, E=End
    const worldLower = t.world.toLowerCase();
    const worldAbbrev = worldLower.includes('nether') ? 'N' 
        : worldLower.includes('end') ? 'E' 
        : 'O';
    const worldTitle = worldAbbrev === 'N' ? 'The Nether' 
        : worldAbbrev === 'E' ? 'The End' 
        : 'Overworld';

    const row = document.createElement('div');
    row.className = 'trade-row';
    row.dataset['x'] = String(t.x);
    row.dataset['y'] = String(t.y);
    row.dataset['z'] = String(t.z);
    row.dataset['world'] = t.world;
    
    // Check if this trade is already in cart
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
    
    // Add click handler for cart button (stop propagation to prevent row click)
    const cartBtn = row.querySelector('.add-to-cart-btn') as HTMLButtonElement;
    cartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(t);
        cartBtn.classList.add('in-cart');
        // Visual feedback
        cartBtn.classList.add('added');
        setTimeout(() => cartBtn.classList.remove('added'), 200);
    });
    
    return row;
}

function renderResults(results: FilterResult[], wantRegex: RegExp | null, giveRegex: RegExp | null): void {
    const container = getElement('results');

    // Update global regex state for the row renderer
    currentWantRegex = wantRegex;
    currentGiveRegex = giveRegex;

    // Handle empty results
    if (results.length === 0) {
        // Clean up virtual scroller if it exists
        if (virtualScroller) {
            virtualScroller.stop();
            virtualScroller = null;
        }
        container.innerHTML = '<div class="no-results"><h2>No trades found</h2><p>Try a different search term</p></div>';
        return;
    }

    // Initialize or update virtual scroller
    if (!virtualScroller) {
        virtualScroller = new VirtualScroller(
            container,
            results,
            createTradeRowElement,
            {
                getEstimatedItemHeight: () => 32,
                getItemId: (item: FilterResult) => `${item.trade.x}-${item.trade.y}-${item.trade.z}-${item.trade.resultName}-${item.trade.costName}`
            }
        );
    } else {
        virtualScroller.setItems(results);
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

function renderMatrix(): void {
    const container = getElement('matrix-container');

    if (!ratioGraph || ratioGraph.size === 0) {
        container.innerHTML = '<header><h2>Conversion Matrix</h2><button id="close-matrix" aria-label="Close">&times;</button></header><p class="muted">No conversion data available</p>';
        container.querySelector('#close-matrix')?.addEventListener('click', () => {
            getElement<HTMLDialogElement>('matrix-dialog').close();
        });
        return;
    }

    const coreBlocks = getCoreBlocks();
    let html = '<header><h2>Conversion Matrix</h2><button id="close-matrix" aria-label="Close">&times;</button></header>';
    html += '<div class="matrix-wrapper"><table class="matrix"><thead><tr><th></th>';
    // Skip last column header (not needed for lower triangle)
    for (let i = 0; i < coreBlocks.length - 1; i++) {
        html += `<th>${getItemIcon(coreBlocks[i]!)}</th>`;
    }
    html += '</tr></thead><tbody>';

    // Skip first row (rowIdx=0) since it would be all skip cells
    for (let rowIdx = 1; rowIdx < coreBlocks.length; rowIdx++) {
        const row = coreBlocks[rowIdx]!;
        html += `<tr><th>${getItemIcon(row)}</th>`;
        // Skip last column (not needed for lower triangle)
        for (let colIdx = 0; colIdx < coreBlocks.length - 1; colIdx++) {
            const col = coreBlocks[colIdx]!;
            if (colIdx >= rowIdx) {
                // Diagonal and upper triangle - skip (redundant data)
                html += '<td class="skip"></td>';
            } else {
                const ratio = getRatio(ratioGraph, row, col);
                if (ratio === null) {
                    html += '<td class="unknown" title="No conversion path found">?</td>';
                } else {
                    html += `<td title="1 ${escapeHtml(row)} = ${ratio.toFixed(4)} ${escapeHtml(col)}">${formatValue(ratio)}</td>`;
                }
            }
        }
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
    
    // Add close button handler
    container.querySelector('#close-matrix')?.addEventListener('click', () => {
        getElement<HTMLDialogElement>('matrix-dialog').close();
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
let leafletMap: L.Map | null = null;

// Layer group for player markers (to clear/update on pan/zoom)
let playerMarkersLayer: L.LayerGroup | null = null;

// Cached player data
let cachedPlayers: Player[] = [];

// Player refresh interval (cleared when dialog closes)
let playerRefreshInterval: ReturnType<typeof setInterval> | null = null;

// Global cache for tile blob URLs (persists across map sessions)
// Key format: "world/zoom/x/z" -> blob URL
const tileBlobCache = new Map<string, string>();

// Global cache for tile manifest (which tiles exist)
// Key format: "world/blocksPerTile/x/z" -> true
let tileManifestCache: Set<string> | null = null;
let manifestLoadPromise: Promise<void> | null = null;

/**
 * Load the tile manifest (cached globally)
 */
async function loadTileManifest(): Promise<Set<string>> {
    if (tileManifestCache) {
        return tileManifestCache;
    }
    
    // Avoid multiple simultaneous fetches
    if (manifestLoadPromise) {
        await manifestLoadPromise;
        return tileManifestCache!;
    }
    
    manifestLoadPromise = (async () => {
        tileManifestCache = new Set<string>();
        try {
            const response = await fetch(`${MAP_CONFIG.baseUrl}/manifest.json`);
            if (response.ok) {
                const manifest = await response.json() as Array<{ world: string; tileX: number; tileZ: number; blocksPerTile: number }>;
                for (const entry of manifest) {
                    // Normalize world name to match what getWorldId returns
                    const normalizedWorld = getWorldId(entry.world);
                    const key = `${normalizedWorld}/${entry.blocksPerTile}/${entry.tileX}/${entry.tileZ}`;
                    tileManifestCache.add(key);
                }
            }
        } catch {
            console.warn('Failed to load tile manifest');
        }
    })();
    
    await manifestLoadPromise;
    return tileManifestCache!;
}

/**
 * Check if a tile exists in the manifest
 */
function tileExistsInManifest(manifest: Set<string>, world: string, blocksPerTile: number, tx: number, tz: number): boolean {
    const key = `${world}/${blocksPerTile}/${tx}/${tz}`;
    return manifest.has(key);
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
function loadTileToMap(
    map: L.Map,
    worldId: string,
    zoom: number,
    tx: number,
    tz: number,
    bounds: L.LatLngBoundsExpression,
    addedToMap: Set<string>
): void {
    const mapKey = `z${zoom}:${tx},${tz}`;
    if (addedToMap.has(mapKey)) {
        return;
    }
    addedToMap.add(mapKey);
    
    const cacheKey = `${worldId}/${zoom}/${tx}/${tz}`;
    
    // Check if we already have this tile cached
    const cachedBlobUrl = tileBlobCache.get(cacheKey);
    if (cachedBlobUrl) {
        L.imageOverlay(cachedBlobUrl, bounds).addTo(map);
        return;
    }
    
    // Fire-and-forget: load tile without blocking
    const url = `${MAP_CONFIG.baseUrl}/${worldId}/${zoom}/${tx}/${tz}.png`;
    fetch(url)
        .then(response => {
            if (response.ok) {
                return response.blob();
            }
            return null;
        })
        .then(blob => {
            if (blob) {
                const blobUrl = URL.createObjectURL(blob);
                tileBlobCache.set(cacheKey, blobUrl);
                // Check map still exists before adding
                if (map.getContainer()?.isConnected) {
                    L.imageOverlay(blobUrl, bounds).addTo(map);
                }
            }
        })
        .catch(() => {
            // Tile doesn't exist, skip
        });
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

/**
 * Initialize or update the Leaflet map
 */
async function openMapDialog(x: number, y: number, z: number, world: string): Promise<void> {
    const dialog = document.getElementById('map-dialog') as HTMLDialogElement | null;
    const container = document.getElementById('map-container');
    const coordsEl = document.getElementById('map-coords');
    
    if (!dialog || !container || !coordsEl) {
        return;
    }
    
    const worldId = getWorldId(world);
    
    // Show coordinates
    let worldDisplay = 'Overworld';
    if (world.includes('nether')) {
        worldDisplay = 'Nether';
    } else if (world.includes('end')) {
        worldDisplay = 'The End';
    }
    coordsEl.textContent = `${worldDisplay}: ${x}, ${y}, ${z}`;
    
    // Clear any existing player refresh interval
    if (playerRefreshInterval) {
        clearInterval(playerRefreshInterval);
        playerRefreshInterval = null;
    }

    // Ensure close button is set up
    const closeBtn = dialog.querySelector('#close-map');
    if (closeBtn && !closeBtn.hasAttribute('data-initialized')) {
        closeBtn.setAttribute('data-initialized', 'true');
        closeBtn.addEventListener('click', () => dialog.close());
    }

    // Clear player refresh interval when dialog closes, and reopen cart if needed
    dialog.addEventListener('close', () => {
        if (playerRefreshInterval) {
            clearInterval(playerRefreshInterval);
            playerRefreshInterval = null;
        }
        if (mapOpenedFromCart) {
            mapOpenedFromCart = false;
            const cartDialog = getElement<HTMLDialogElement>('cart-dialog');
            renderCartDialog();
            cartDialog.showModal();
        }
    }, { once: true });
    
    // Calculate which tile this shop is on
    const { tileX, tileZ } = getTileCoords(x, z, MAP_CONFIG.tileSize);
    
    // Show dialog first so container has dimensions
    dialog.showModal();
    
    // Wait for dialog to render
    requestAnimationFrame(async () => {
        // Destroy old map if it exists (cleaner than reusing)
        if (leafletMap) {
            try {
                leafletMap.remove();
            } catch {
                // Map already removed
            }
            leafletMap = null;
        }
        
        // Create map with CRS.Simple
        // Free navigation - no bounds restrictions
        leafletMap = L.map(container, {
            crs: L.CRS.Simple,
            minZoom: -5,   // Allow zooming far out
            maxZoom: 2,    // Allow zooming in
            zoomControl: true,
            attributionControl: false,
            zoomSnap: 0,   // Allow fractional zoom levels
            zoomDelta: 0.5 // Zoom step when using buttons
        });
        
        // Load tile manifest (uses global cache)
        const manifest = await loadTileManifest();
        
        // Helper to check if a tile exists in manifest
        const tileExists = (world: string, blocksPerTile: number, tx: number, tz: number): boolean => {
            return tileExistsInManifest(manifest, world, blocksPerTile, tx, tz);
        };
        
        // Track tiles added to THIS map instance (cleared when map is recreated)
        // Different from tileBlobCache which persists blob URLs across sessions
        const addedToMapZoom8 = new Set<string>();
        const addedToMapZoom4 = new Set<string>();
        
        // Zoom 4 tile size in map units (8192 blocks / 512 blocks per unit at zoom 8)
        const zoom4TileSize = MAP_CONFIG.tileSize * 16;  // 512 * 16 = 8192
        
        // Calculate zoom 4 tile coords from zoom 8 coords
        const getZoom4Coords = (z8x: number, z8z: number) => ({
            x: Math.floor(z8x / 16),
            z: Math.floor(z8z / 16)
        });
        
        // Load a zoom 4 tile at its proper bounds (non-blocking)
        const loadZoom4Tile = (z4x: number, z4z: number) => {
            const mapKey = `z4:${z4x},${z4z}`;
            if (addedToMapZoom4.has(mapKey)) {
                return;
            }
            addedToMapZoom4.add(mapKey);
            
            // Check if tile exists in manifest (zoom 4 = 8192 blocksPerTile)
            if (!tileExists(worldId, 8192, z4x, z4z)) {
                return;  // Tile doesn't exist, skip
            }
            
            // Calculate where this tile should be in the map coordinate system
            // Zoom 4 tile (z4x, z4z) covers zoom 8 tiles from (z4x*16, z4z*16) to (z4x*16+15, z4z*16+15)
            // We need to express this relative to the center tile (tileX, tileZ)
            const startZ8X = z4x * 16;
            const startZ8Z = z4z * 16;
            
            // Convert to relative coordinates (dx, dy from center tile)
            const dx = startZ8X - tileX;
            const dy = startZ8Z - tileZ;
            
            // Calculate bounds (same formula as zoom 8, but 16x larger)
            const south = -dy * MAP_CONFIG.tileSize - zoom4TileSize;
            const north = -dy * MAP_CONFIG.tileSize;
            const west = dx * MAP_CONFIG.tileSize;
            const east = dx * MAP_CONFIG.tileSize + zoom4TileSize;
            const bounds: L.LatLngBoundsExpression = [[south, west], [north, east]];
            
            // Global cache key for the tile blob
            const cacheKey = `${worldId}/4/${z4x}/${z4z}`;
            
            // Check if we already have this tile cached
            const cachedBlobUrl = tileBlobCache.get(cacheKey);
            if (cachedBlobUrl) {
                if (leafletMap) {
                    L.imageOverlay(cachedBlobUrl, bounds).addTo(leafletMap);
                }
                return;
            }
            
            // Fire-and-forget: load tile without blocking
            const url = `${MAP_CONFIG.baseUrl}/${worldId}/${MAP_CONFIG.fallbackZoom}/${z4x}/${z4z}.png`;
            fetch(url)
                .then(response => {
                    if (response.ok && leafletMap) {
                        return response.blob();
                    }
                    return null;
                })
                .then(blob => {
                    if (blob && leafletMap) {
                        const blobUrl = URL.createObjectURL(blob);
                        tileBlobCache.set(cacheKey, blobUrl);  // Cache for reuse
                        L.imageOverlay(blobUrl, bounds).addTo(leafletMap);
                    }
                })
                .catch(() => {
                    // Tile doesn't exist, just skip
                });
        };
        
        // Load a zoom 8 tile (non-blocking)
        const loadZoom8Tile = (tx: number, tz: number, dx: number, dy: number) => {
            const mapKey = `z8:${tx},${tz}`;
            if (addedToMapZoom8.has(mapKey)) {
                return;
            }
            addedToMapZoom8.add(mapKey);
            
            // Check if tile exists in manifest (zoom 8 = 512 blocksPerTile)
            if (!tileExists(worldId, 512, tx, tz)) {
                return;  // Tile doesn't exist, skip
            }
            
            // Calculate bounds for this tile
            const south = -dy * MAP_CONFIG.tileSize - MAP_CONFIG.tileSize;
            const north = -dy * MAP_CONFIG.tileSize;
            const west = dx * MAP_CONFIG.tileSize;
            const east = dx * MAP_CONFIG.tileSize + MAP_CONFIG.tileSize;
            const bounds: L.LatLngBoundsExpression = [[south, west], [north, east]];
            
            // Global cache key for the tile blob
            const cacheKey = `${worldId}/8/${tx}/${tz}`;
            
            // Check if we already have this tile cached
            const cachedBlobUrl = tileBlobCache.get(cacheKey);
            if (cachedBlobUrl) {
                if (leafletMap) {
                    L.imageOverlay(cachedBlobUrl, bounds).addTo(leafletMap);
                }
                return;
            }
            
            // Fire-and-forget: load tile without blocking
            const url = `${MAP_CONFIG.baseUrl}/${worldId}/${MAP_CONFIG.maxZoom}/${tx}/${tz}.png`;
            fetch(url)
                .then(response => {
                    if (response.ok && leafletMap) {
                        return response.blob();
                    }
                    return null;
                })
                .then(blob => {
                    if (blob && leafletMap) {
                        const blobUrl = URL.createObjectURL(blob);
                        tileBlobCache.set(cacheKey, blobUrl);  // Cache for reuse
                        L.imageOverlay(blobUrl, bounds).addTo(leafletMap);
                    }
                })
                .catch(() => {
                    // Tile doesn't exist, zoom 4 layer will show
                });
        };
        
        // Function to load tiles based on current viewport (non-blocking)
        const loadVisibleTiles = () => {
            if (!leafletMap) {
                return;
            }
            
            const bounds = leafletMap.getBounds();
            const currentZoom = leafletMap.getZoom();
            
            // Calculate which zoom 8 tiles are visible
            const minLat = bounds.getSouth();
            const maxLat = bounds.getNorth();
            const minLng = bounds.getWest();
            const maxLng = bounds.getEast();
            
            // Convert bounds to tile coordinates (relative to center)
            const minDx = Math.floor(minLng / MAP_CONFIG.tileSize);
            const maxDx = Math.ceil(maxLng / MAP_CONFIG.tileSize);
            const minDy = -Math.ceil(maxLat / MAP_CONFIG.tileSize);
            const maxDy = -Math.floor(minLat / MAP_CONFIG.tileSize);
            
            // First, load zoom 4 tiles as base layer
            const zoom4Tiles = new Set<string>();
            for (let dy = minDy - 1; dy <= maxDy + 1; dy++) {
                for (let dx = minDx - 1; dx <= maxDx + 1; dx++) {
                    const tx = tileX + dx;
                    const tz = tileZ + dy;
                    const z4 = getZoom4Coords(tx, tz);
                    const key = `${z4.x},${z4.z}`;
                    if (!zoom4Tiles.has(key)) {
                        zoom4Tiles.add(key);
                        loadZoom4Tile(z4.x, z4.z);
                    }
                }
            }
            
            // Only load zoom 8 tiles when zoomed in enough to see detail
            // At zoom -2 or below, zoom 8 tiles would be tiny (8x8 pixels or less)
            // so just use zoom 4 tiles as base layer
            if (currentZoom > -2) {
                // Then load zoom 8 tiles on top (they'll overlay the zoom 4 tiles)
                for (let dy = minDy; dy <= maxDy; dy++) {
                    for (let dx = minDx; dx <= maxDx; dx++) {
                        const tx = tileX + dx;
                        const tz = tileZ + dy;
                        loadZoom8Tile(tx, tz, dx, dy);
                    }
                }
            }
        };
        
        // Load tiles when map moves or zooms
        leafletMap.on('moveend', loadVisibleTiles);
        leafletMap.on('zoomend', loadVisibleTiles);
        
        // Marker position relative to center tile
        // Convert Minecraft coords to Leaflet CRS.Simple coords
        const { lat: markerLat, lng: markerLng } = toLeafletCoords(x, z, MAP_CONFIG.tileSize);
        
        const latLng = L.latLng(markerLat, markerLng);
        
        // Simple pin marker for the shop
        L.marker(latLng, {
            icon: L.divIcon({
                className: 'leaflet-pin-marker',
                iconSize: [24, 24],
                iconAnchor: [4, 24]  // Bottom-left corner of pin points to location
            })
        }).addTo(leafletMap);
        
        // Create layer group for player markers
        playerMarkersLayer = L.layerGroup().addTo(leafletMap);
        
        /**
         * Update the coordinate label to show current map center
         */
        const updateCoordsLabel = (): void => {
            if (!leafletMap) {return;}
            const mapCenter = leafletMap.getCenter();
            const mcCoords = fromLeafletCoordsRelative(
                mapCenter.lat,
                mapCenter.lng,
                tileX,
                tileZ,
                MAP_CONFIG.tileSize
            );
            coordsEl.textContent = `${worldDisplay}: ${mcCoords.x}, ${y}, ${mcCoords.z}`;
        };
        
        /**
         * Update player markers based on current viewport.
         * Players inside the visible circle appear on the map.
         * Players outside appear as DOM elements on the circle edge.
         * Only shows players if the map is showing the overworld (all players assumed to be in overworld).
         */
        const updatePlayerMarkers = (): void => {
            // Clear existing markers first
            playerMarkersLayer?.clearLayers();
            const existingEdgeMarkers = dialog.querySelectorAll('.player-edge-marker');
            existingEdgeMarkers.forEach(el => el.remove());
            
            // Only show players that are in the same world as the shop
            if (!leafletMap || cachedPlayers.length === 0) {return;}
            
            // Filter players to only those in the same world as the shop
            const playersInWorld = cachedPlayers.filter(p => {
                const pWorld = p.world ? getWorldId(p.world) : 'overworld';
                return pWorld === worldId;
            });
            
            // Get current map center in Leaflet coords
            const mapCenter = leafletMap.getCenter();
            
            // Calculate visible radius in map units based on current zoom
            // The container is circular, so visible radius = half the smaller container dimension
            const containerRect = container.getBoundingClientRect();
            const containerRadius = Math.min(containerRect.width, containerRect.height) / 2;
            
            // Convert container pixels to map units at current zoom
            const point1 = leafletMap.containerPointToLatLng([containerRect.width / 2, containerRect.height / 2]);
            const point2 = leafletMap.containerPointToLatLng([containerRect.width / 2 + containerRadius, containerRect.height / 2]);
            const visibleRadiusMapUnits = Math.abs(point2.lng - point1.lng);
            
            // Edge marker positioning (in screen space)
            const centerX = containerRect.width / 2;
            const centerY = containerRect.height / 2;
            const edgeRadius = containerRect.width / 2 + 8;  // Slightly outside the circle
            
            for (const player of playersInWorld) {
                // Convert player Minecraft coords to Leaflet coords relative to shop's tile
                const playerCoords = toLeafletCoordsRelative(
                    player.position.x,
                    player.position.z,
                    tileX,
                    tileZ,
                    MAP_CONFIG.tileSize
                );
                
                // Check if player is inside visible circle (centered on current map view)
                const clamped = clampToCircle(
                    playerCoords.lat,
                    playerCoords.lng,
                    mapCenter.lat,
                    mapCenter.lng,
                    visibleRadiusMapUnits
                );
                
                if (clamped.clamped) {
                    // Player is outside visible area - render as DOM element on circle edge
                    // Calculate angle from map center to player
                    const dx = playerCoords.lng - mapCenter.lng;
                    const dy = playerCoords.lat - mapCenter.lat;
                    const angle = Math.atan2(dy, dx);
                    
                    // Calculate distance for size scaling (logarithmic)
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    // Use log scale: closer = larger, further = smaller
                    // minSize = 4px, maxSize = 12px
                    // At visibleRadius distance, size = 12px; at 100x that, size = 4px
                    const minSize = 4;
                    const maxSize = 12;
                    const logScale = Math.log10(distance / visibleRadiusMapUnits + 1);
                    const size = Math.max(minSize, maxSize - logScale * 4);
                    
                    // Position on circle edge (CSS uses inverted Y)
                    const edgeX = centerX + edgeRadius * Math.cos(angle);
                    const edgeY = centerY - edgeRadius * Math.sin(angle);  // Invert Y for screen coords
                    
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
                    
                    // Position label based on marker location to avoid clipping
                    // Angle is in radians: 0 = right, PI/2 = top, PI = left, -PI/2 = bottom
                    const angleDeg = angle * 180 / Math.PI;
                    if (angleDeg > 45 && angleDeg < 135) {
                        // Top edge - label below
                        nameLabel.classList.add('label-bottom');
                    } else if (angleDeg < -45 && angleDeg > -135) {
                        // Bottom edge - label above
                        nameLabel.classList.add('label-top');
                    } else if (Math.abs(angleDeg) > 135 || Math.abs(angleDeg) < 45) {
                        // Left or right edge - label on opposite side
                        if (edgeX > centerX) {
                            nameLabel.classList.add('label-left');  // Marker on right, label on left
                        }
                        // Default: label on right (marker on left side)
                    }
                    
                    edgeMarker.appendChild(nameLabel);
                    
                    dialog.appendChild(edgeMarker);
                } else {
                    // Player is inside visible area - render as Leaflet marker
                    const playerLatLng = L.latLng(playerCoords.lat, playerCoords.lng);
                    
                    L.marker(playerLatLng, {
                        icon: L.divIcon({
                            className: 'leaflet-player-marker',
                            html: `<span class="player-name">${player.name}</span>`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]  // Center of marker
                        }),
                        title: player.name
                    }).addTo(playerMarkersLayer!);
                }
            }
        };
        
        // Fetch players and set up dynamic updates
        fetchPlayers().then(players => {
            if (!leafletMap) {return;}
            cachedPlayers = players;
            updatePlayerMarkers();
        });

        // Refresh player positions every 5 seconds
        playerRefreshInterval = setInterval(() => {
            fetchPlayers().then(players => {
                if (!leafletMap) {return;}
                cachedPlayers = players;
                updatePlayerMarkers();
            });
        }, 5000);
        
        // Toggle zoomed-out class based on zoom level for image rendering
        const updateZoomClass = () => {
            const zoom = leafletMap!.getZoom();
            // When zoom is below 0.5, we're zoomed out enough that pixelated causes moiré
            if (zoom < 0.5) {
                container.classList.add('zoomed-out');
            } else {
                container.classList.remove('zoomed-out');
            }
        };

        // Update coordinate label and player markers when map is panned or zoomed
        leafletMap.on('move', () => {
            updateCoordsLabel();
            updatePlayerMarkers();
        });
        leafletMap.on('zoomend', () => {
            updateCoordsLabel();
            updatePlayerMarkers();
            updateZoomClass();
        });
        
        // Center on the shop's position (marker coords)
        const shopCenter = L.latLng(markerLat, markerLng);
        
        leafletMap.invalidateSize();
        
        // Calculate zoom to show ~3x3 tiles (1536 units) for nice initial view
        const containerSize = leafletMap.getSize();
        const visibleSize = MAP_CONFIG.tileSize * 3;  // Show 3 tiles × 512 units
        const smallerDimension = Math.min(containerSize.x, containerSize.y);
        
        // Calculate zoom to fit visible area (3x3)
        const initialZoom = calculateFitZoom(smallerDimension, visibleSize);
        
        // Set view centered on shop at initial zoom (showing ~3x3 tiles)
        leafletMap.setView(shopCenter, initialZoom);
        
        // Load initial visible tiles around the shop
        loadVisibleTiles();
        
        // Apply initial zoom class
        updateZoomClass();
    });
}

// ============================================================================
// Cart Dialog
// ============================================================================

/**
 * Create a cart item element
 */
function createCartItemElement(trade: Trade, quantity: number): HTMLElement {
    const itemEl = document.createElement('div');
    itemEl.className = 'cart-item';
    
    // Mark zero-quantity items visually
    if (quantity === 0) {
        itemEl.classList.add('zero-quantity');
    }
    
    itemEl.innerHTML = `
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
    const minusBtn = itemEl.querySelector('.qty-minus')!;
    const plusBtn = itemEl.querySelector('.qty-plus')!;
    const removeBtn = itemEl.querySelector('.remove-btn')!;
    
    minusBtn.addEventListener('click', () => {
        if (quantity > 0) {
            updateCartQuantity(trade, -1);
            renderCartDialog();
        }
    });
    
    plusBtn.addEventListener('click', () => {
        updateCartQuantity(trade, 1);
        renderCartDialog();
    });
    
    removeBtn.addEventListener('click', () => {
        removeFromCart(trade);
        refreshCartButtonStates();
        renderCartDialog();
    });
    
    return itemEl;
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
    _prevStop: RouteStop | null,
    forNavPanel = false
): HTMLElement {
    const status = getStopStatus(stop, stopIndex, route);
    
    const el = document.createElement('div');
    const netherClass = isNether(stop.world) ? ' timeline-stop-nether' : '';
    el.className = `timeline-stop timeline-stop-${stop.type}${netherClass} timeline-status-${status}`;
    
    // Connector column (dot + line)
    const connector = document.createElement('div');
    connector.className = 'timeline-connector';
    
    const dot = document.createElement('button');
    dot.className = 'timeline-dot';
    dot.setAttribute('aria-label', status === 'completed' ? 'Mark incomplete' : 'Mark complete');
    
    if (status === 'completed') {
        dot.innerHTML = '✓';
    } else {
        dot.innerHTML = '';
    }
    
    // Click dot to toggle completion (only for shop stops)
    if (stop.type === 'shop') {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleStopCompletion(stop, route);
        });
    }
    
    connector.appendChild(dot);
    
    // Line below dot (connects to next stop)
    const line = document.createElement('div');
    line.className = 'timeline-line';
    connector.appendChild(line);
    
    el.appendChild(connector);
    
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
    if (forNavPanel) {
        content.innerHTML = `<span class="stop-text">${item.quantity}× ${item.trade.resultName}</span>`;
    } else {
        content.innerHTML = `<span class="stop-text">${item.quantity}× ${item.trade.resultName}</span><span class="coord-ow">${owCoords}</span><span class="coord-nether">${netherCoords}</span>`;
    }
    
    // Make shop content clickable
    content.classList.add('clickable');
    content.addEventListener('click', () => {
        // During navigation, clicking toggles completion instead of opening map
        if (navPlayerRefreshInterval) {
            toggleStopCompletion(stop, route);
        } else {
            mapOpenedFromCart = true;
            const cartDialog = getElement<HTMLDialogElement>('cart-dialog');
            cartDialog.close();
            openMapDialog(stop.x, item.trade.y, stop.z, stop.world);
        }
    });
    
    el.appendChild(content);
    
    return el;
}

/**
 * Render the cart dialog contents
 */
function renderCartDialog(): void {
    const itemsContainer = getElement('cart-items');
    const costsContainer = getElement('cart-costs');
    const gainsContainer = getElement('cart-gains');
    const clearCartBtn = getElement('clear-cart');
    
    // Clear previous contents
    itemsContainer.innerHTML = '';
    costsContainer.innerHTML = '';
    gainsContainer.innerHTML = '';
    
    if (cart.length === 0) {
        itemsContainer.innerHTML = '<p class="cart-empty">Your cart is empty</p>';
        clearCartBtn.classList.add('hidden');
        return;
    }
    
    clearCartBtn.classList.remove('hidden');
    
    // Render cart items
    for (const { trade, quantity } of cart) {
        itemsContainer.appendChild(createCartItemElement(trade, quantity));
    }
    
    // Render shopping lists
    const shoppingList = getShoppingList();
    
    for (const [name, amount] of shoppingList.costs) {
        const li = document.createElement('li');
        li.textContent = `${amount}× ${name}`;
        costsContainer.appendChild(li);
    }
    
    for (const [name, amount] of shoppingList.gains) {
        const li = document.createElement('li');
        li.textContent = `${amount}× ${name}`;
        gainsContainer.appendChild(li);
    }
}

// ============================================================================
// Tab Switching
// ============================================================================

function setupCartTabs(): void {
    const tabCart = document.getElementById('tab-cart');
    const tabNavigate = document.getElementById('tab-navigate');
    
    tabCart?.addEventListener('click', () => switchTab('cart'));
    tabNavigate?.addEventListener('click', () => switchTab('navigate'));
}

function switchTab(tab: 'cart' | 'navigate'): void {
    const tabCart = document.getElementById('tab-cart');
    const tabNavigate = document.getElementById('tab-navigate');
    const contentCart = document.getElementById('tab-content-cart');
    const contentNavigate = document.getElementById('tab-content-navigate');
    
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
    const input = document.getElementById('player-name-input') as HTMLInputElement | null;
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
    if (saved === 'manual') {
        navMode = 'manual';
    } else {
        navMode = 'follow';
    }
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
    const playerNameInput = document.getElementById('player-name-input') as HTMLInputElement | null;
    
    if (!playerNameInput?.value.trim()) {
        playerNameInput?.focus();
        return;
    }
    
    isNavigating = true;
    navMode = 'follow';
    saveNavMode();
    
    // Close cart dialog and open navigation dialog
    const cartDialog = getElement<HTMLDialogElement>('cart-dialog');
    const navDialog = document.getElementById('nav-dialog') as HTMLDialogElement | null;
    
    console.log('Starting navigation, navDialog:', navDialog);
    
    cartDialog.close();
    
    // Prevent background scrolling
    document.body.style.overflow = 'hidden';
    
    if (navDialog) {
        navDialog.showModal();
        console.log('Dialog opened, fetching player position...');
        
        // First, get the player's current position
        const playerName = playerNameInput.value.trim().toLowerCase();
        try {
            const players = await fetchPlayers();
            const player = players.find(p => p.name.toLowerCase() === playerName);
            
            if (player) {
                const playerWorld = player.world ? getWorldId(player.world) : 'overworld';
                currentPlayerPosition = {
                    x: player.position.x,
                    z: player.position.z,
                    world: playerWorld,
                    yaw: player.rotation?.yaw
                };
            }
        } catch (error) {
            console.warn('Failed to get initial player position:', error);
        }
        
        // Initialize map after dialog is visible (needs dimensions)
        requestAnimationFrame(() => {
            // Compute route from player position (or 0,0 if not found), excluding completed items
            const route = computeRoute(currentPlayerPosition ?? undefined, true);
            navCurrentRoute = route;
            console.log('Route computed from player position:', route.length, 'stops');
            initNavigationMapDialog(route);
            
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
    const navDialog = document.getElementById('nav-dialog') as HTMLDialogElement | null;
    const cartDialog = getElement<HTMLDialogElement>('cart-dialog');
    
    isNavigating = false;
    
    // Clear polling interval
    if (navPlayerRefreshInterval) {
        clearInterval(navPlayerRefreshInterval);
        navPlayerRefreshInterval = null;
    }
    
    // Remove player marker from map
    if (navPlayerMarker && navMap) {
        navMap.removeLayer(navPlayerMarker);
        navPlayerMarker = null;
    }
    
    // Remove route polyline
    if (navRoutePolyline && navMap) {
        navMap.removeLayer(navRoutePolyline);
        navRoutePolyline = null;
    }
    
    // Remove player-to-next line
    if (navPlayerToNextLine && navMap) {
        navMap.removeLayer(navPlayerToNextLine);
        navPlayerToNextLine = null;
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
    
    currentPlayerPosition = null;
    
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
        navMap = null;
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
async function pollPlayerPosition(): Promise<void> {
    const playerNameInput = document.getElementById('player-name-input') as HTMLInputElement | null;
    const playerName = playerNameInput?.value.trim().toLowerCase();
    
    if (!playerName || !navMap) {
        return;
    }
    
    try {
        const players = await fetchPlayers();
        const player = players.find(p => p.name.toLowerCase() === playerName);
        
        if (player) {
            const previousPosition = currentPlayerPosition;
            // Use player's world if available, otherwise assume overworld
            const playerWorld = player.world ? getWorldId(player.world) : 'overworld';
            currentPlayerPosition = {
                x: player.position.x,
                z: player.position.z,
                world: playerWorld,
                yaw: player.rotation?.yaw
            };
            
            // Check if player changed worlds
            const worldChanged = previousPosition && previousPosition.world !== playerWorld;
            
            // Check if we need to switch the map to a different world
            // This happens when:
            // 1. Player enters a new world AND
            // 2. The next shop in the route is in that world
            if (worldChanged) {
                const fullRoute = computeRoute(currentPlayerPosition, true);
                const nextShopWorld = getNextShopWorld(fullRoute);
                
                if (nextShopWorld && nextShopWorld === playerWorld && nextShopWorld !== navMapWorld) {
                    // Player entered the world where their next shop is - switch the map!
                    // Store full route before reinitializing
                    navCurrentRoute = fullRoute;
                    await initNavigationMapDialog(fullRoute);
                    updateLiveDistance();
                    return; // Map was reinitialized, skip the rest
                }
            }
            
            updatePlayerMarker();
            updateLiveDistance();
            checkAutoAdvance();
            updateNearbyShopTooltip();
            
            // Check if position actually changed (not just rotation)
            const positionMoved = !previousPosition || 
                Math.abs(previousPosition.x - currentPlayerPosition.x) > 1 ||
                Math.abs(previousPosition.z - currentPlayerPosition.z) > 1;
            
            // Recalculate route from new player position if position changed significantly
            const shouldRecalcRoute = !previousPosition || 
                Math.abs(previousPosition.x - currentPlayerPosition.x) > 10 ||
                Math.abs(previousPosition.z - currentPlayerPosition.z) > 10;
            
            if (shouldRecalcRoute) {
                recalculateRouteFromPlayer();
            }
            
            // Update the dotted line from player to next stop
            updatePlayerToNextLine();
            
            // In follow mode, center on player only when position moves
            if (navMode === 'follow' && positionMoved) {
                centerMapOnPlayer();
            }
        } else {
            // Player not found - show in live distance display
            const liveDistance = document.getElementById('nav-live-distance');
            if (liveDistance) {
                liveDistance.innerHTML = `<span class="distance-label">Player "${playerNameInput?.value}" not found</span>`;
            }
        }
    } catch (error) {
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
    if (currentPlayerPosition.world !== navMapWorld) {
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
    const rotation = currentPlayerPosition.yaw !== undefined ? currentPlayerPosition.yaw + 180 : 0;
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
    if (currentPlayerPosition.world !== navMapWorld) {
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
        worldRoute.some((stop, i) => {
            const oldStop = navCurrentWorldRoute[i];
            return !oldStop || stop.x !== oldStop.x || stop.z !== oldStop.z;
        });
    
    if (!routeChanged) {
        return; // No need to update if route order is the same
    }
    
    navCurrentWorldRoute = worldRoute;
    
    // Remove old route polyline
    if (navRoutePolyline) {
        navMap.removeLayer(navRoutePolyline);
        navRoutePolyline = null;
    }
    
    // Remove old stop markers
    for (const marker of navStopMarkers) {
        navMap.removeLayer(marker);
    }
    navStopMarkers = [];
    
    // Draw new route if we have stops in this world
    if (worldRoute.length > 0) {
        const routePoints: L.LatLngExpression[] = [];
        
        for (let i = 0; i < worldRoute.length; i++) {
            const stop = worldRoute[i]!;
            const { lat, lng } = toLeafletCoordsRelative(stop.x, stop.z, navMapCenterTileX, navMapCenterTileZ, MAP_CONFIG.tileSize);
            routePoints.push([lat, lng]);
            
            // Add numbered marker for each stop
            const markerIcon = L.divIcon({
                className: 'nav-route-marker',
                html: `<div class="nav-marker">${i + 1}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18]
            });
            
            const tooltipText = stop.cartItem 
                ? `${stop.cartItem.quantity}× ${stop.cartItem.trade.resultName}`
                : `Stop ${i + 1}`;
            
            const marker = L.marker([lat, lng], { icon: markerIcon })
                .bindTooltip(tooltipText, { 
                    permanent: false,
                    direction: 'top',
                    offset: [0, -18]
                })
                .addTo(navMap);
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
        navPlayerToNextLine = null;
    }
    
    // Only draw line if player is in the same world as the map
    if (currentPlayerPosition.world !== navMapWorld) {
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
 * Update the live distance display
 */
function updateLiveDistance(): void {
    // Update both embedded and dialog distance displays
    const liveDistance = document.getElementById('nav-live-distance');
    const dialogDistance = document.getElementById('nav-dialog-distance');
    
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
        const worldDisplayName = stopWorld === 'the_nether' ? 'the Nether' 
            : stopWorld === 'the_end' ? 'the End' 
            : 'Overworld';
        
        if (isSameWorld) {
            // Player is in same world as next shop - show distance
            distanceHtml = `
                <span class="distance-label">→ ${itemName}:</span>
                <span class="distance-value">${Math.round(distance).toLocaleString()} blocks</span>
            `;
        } else {
            // Player is in different world - show travel instruction
            distanceHtml = `
                <span class="distance-label">🌍 Travel to ${worldDisplayName}</span>
                <span class="distance-value">→ ${itemName}</span>
            `;
        }
        
        // Detailed display for navigation dialog with coords and items
        const coordsText = `${currentStop.x}, ${currentStop.y}, ${currentStop.z}`;
        const buyText = `${quantity}× ${itemName}`;
        
        if (isSameWorld) {
            dialogHtml = `
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
            `;
        } else {
            dialogHtml = `
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
let currentNearbyShopKey: string | null = null;

// Distance threshold to show shop tooltip (in blocks)
const SHOP_NEARBY_THRESHOLD = 100;

/**
 * Update the shop tooltip when player enters a shop area
 * Shows briefly then auto-hides
 */
let shopTooltipTimeout: ReturnType<typeof setTimeout> | null = null;

function updateNearbyShopTooltip(): void {
    const tooltip = document.getElementById('nav-shop-tooltip');
    if (!tooltip || !currentPlayerPosition) {
        return;
    }
    
    // Use current route (already excludes completed items)
    const route = navCurrentRoute.length > 0 ? navCurrentRoute : computeRoute(currentPlayerPosition, true);
    
    // Find all shops within range (not just current stop)
    let nearestShop: RouteStop | null = null;
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
            const itemsHtml = itemsAtShop.map(item => 
                `<li><span class="item-name">${item.trade.resultName}</span><span class="item-qty">×${item.quantity}</span></li>`
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
        currentNearbyShopKey = null;
    }
}

/**
 * Center the navigation map on the player position
 * Zoom level adjusts based on distance to nearest shop
 */
function centerMapOnPlayer(): void {
    if (!navMap || !currentPlayerPosition) {
        return;
    }
    
    // Only center on player if they're in the same world as the map
    if (currentPlayerPosition.world !== navMapWorld) {
        return;
    }
    
    const { lat, lng } = toLeafletCoordsRelative(
        currentPlayerPosition.x,
        currentPlayerPosition.z,
        navMapCenterTileX,
        navMapCenterTileZ,
        MAP_CONFIG.tileSize
    );
    
    // Calculate distance to nearest non-completed shop IN THIS WORLD
    const route = navCurrentWorldRoute.length > 0 ? navCurrentWorldRoute : [];
    let minDistance = Infinity;
    for (const stop of route) {
        const dx = currentPlayerPosition.x - stop.x;
        const dz = currentPlayerPosition.z - stop.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < minDistance) {
            minDistance = dist;
        }
    }
    
    // Zoom levels: closer = more zoomed in
    // Distance < 50 blocks: zoom 1 (very close - max zoom)
    // Distance 50-150: zoom 0 (close)
    // Distance 150-400: zoom -1
    // Distance 400-800: zoom -2
    // Distance > 800: zoom -3
    let zoom: number;
    if (minDistance < 50) {
        zoom = 1;
    } else if (minDistance < 150) {
        zoom = 0;
    } else if (minDistance < 400) {
        zoom = -1;
    } else if (minDistance < 800) {
        zoom = -2;
    } else {
        zoom = -3;
    }
    
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
    const recenterBtn = document.getElementById('recenter-map');
    const dialogRecenterBtn = document.getElementById('nav-dialog-recenter');
    recenterBtn?.classList.remove('hidden');
    dialogRecenterBtn?.classList.remove('hidden');
}

/**
 * Switch back to follow mode and re-center
 */
function switchToFollowMode(): void {
    navMode = 'follow';
    saveNavMode();
    
    // Hide re-center buttons
    const recenterBtn = document.getElementById('recenter-map');
    const dialogRecenterBtn = document.getElementById('nav-dialog-recenter');
    recenterBtn?.classList.add('hidden');
    dialogRecenterBtn?.classList.add('hidden');
    
    // Center on player
    centerMapOnPlayer();
}

/**
 * Set up navigation event handlers
 */
function setupNavigationControls(): void {
    const startBtn = document.getElementById('start-navigation');
    const recenterBtn = document.getElementById('recenter-map');
    const closeNavBtn = document.getElementById('close-nav');
    
    startBtn?.addEventListener('click', toggleNavigation);
    recenterBtn?.addEventListener('click', switchToFollowMode);
    closeNavBtn?.addEventListener('click', stopNavigation);
    
    // Set up nav dialog backdrop close
    const navDialog = document.getElementById('nav-dialog') as HTMLDialogElement | null;
    if (navDialog) {
        navDialog.addEventListener('click', (e) => {
            if (e.target === navDialog) {
                stopNavigation();
            }
        });
    }
}

// ============================================================================
// Navigation Map
// ============================================================================

let navMap: L.Map | null = null;
let navRoutePolyline: L.Polyline | null = null;
let navPlayerToNextLine: L.Polyline | null = null;
let navStopMarkers: L.Marker[] = [];
let navCurrentRoute: RouteStop[] = [];  // Full route (all worlds)
let navCurrentWorldRoute: RouteStop[] = [];  // Route filtered to current map world
let navMapWorld: string = 'overworld';  // World currently shown on nav map

/**
 * Get the world of the next uncompleted shop in the route.
 * This determines which world the map should show.
 */
function getNextShopWorld(route: RouteStop[]): string | null {
    if (route.length === 0) {
        return null;
    }
    return getWorldId(route[0]!.world);
}

/**
 * Initialize navigation map inside the circular dialog.
 * 
 * Design principle: The map shows the world where the NEXT UNCOMPLETED shop is.
 * - If player is in that world: player marker is visible
 * - If player is in different world: player marker is hidden, UI shows "Travel to [World]"
 */
async function initNavigationMapDialog(route: RouteStop[]): Promise<void> {
    const container = document.getElementById('nav-dialog-map-container');
    if (!container) {
        return;
    }
    
    // Clean up existing map
    if (navMap) {
        try {
            navMap.remove();
        } catch {
            // Map already removed
        }
        navMap = null;
        navPlayerMarker = null;  // Map removal also removes the marker
        navRoutePolyline = null;
        navPlayerToNextLine = null;
    }
    navStopMarkers = [];
    
    // Store the full route (all worlds)
    navCurrentRoute = route;
    
    if (route.length === 0) {
        container.innerHTML = '<p class="cart-empty" style="text-align: center; padding: 20px; color: var(--color-text-muted);">No route to display</p>';
        navCurrentWorldRoute = [];
        return;
    }
    
    // Clear container
    container.innerHTML = '';
    
    // DESIGN: Map shows the world of the FIRST (next) shop in the route
    // This ensures the player always sees their destination
    const targetWorld = getWorldId(route[0]!.world);
    navMapWorld = targetWorld;
    
    // Filter route to shops in the target world only
    const stopsInWorld = route.filter(stop => getWorldId(stop.world) === targetWorld);
    navCurrentWorldRoute = stopsInWorld;
    
    // Calculate bounds of shops in this world
    const xs = stopsInWorld.map(stop => stop.x);
    const zs = stopsInWorld.map(stop => stop.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    
    // Calculate center and which tiles we need
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    // Calculate the tile range needed
    const { tileX: minTileX, tileZ: minTileZ } = getTileCoords(minX - 256, minZ - 256, MAP_CONFIG.tileSize);
    const { tileX: maxTileX, tileZ: maxTileZ } = getTileCoords(maxX + 256, maxZ + 256, MAP_CONFIG.tileSize);
    const { tileX: centerTileX, tileZ: centerTileZ } = getTileCoords(centerX, centerZ, MAP_CONFIG.tileSize);
    
    // Store center tile coords for coordinate conversion in live navigation
    navMapCenterTileX = centerTileX;
    navMapCenterTileZ = centerTileZ;
    
    // Create map
    navMap = L.map(container, {
        crs: L.CRS.Simple,
        minZoom: -5,
        maxZoom: 2,
        zoomControl: true,
        attributionControl: false,
        maxBoundsViscosity: 1
    });
    
    // Listen for user drag to switch to manual mode
    navMap.on('dragstart', () => {
        if (isNavigating) {
            switchToManualMode();
        }
    });
    
    // Load tile manifest (uses global cache)
    const manifest = await loadTileManifest();
    
    // Track tiles added to this map instance
    const addedToNavMap = new Set<string>();
    
    // Zoom 4 tile size in map units
    const zoom4TileSize = MAP_CONFIG.tileSize * 16;
    
    // Calculate zoom 4 tile coords from zoom 8 coords
    const getZoom4Coords = (z8x: number, z8z: number) => ({
        x: Math.floor(z8x / 16),
        z: Math.floor(z8z / 16)
    });
    
    // First load zoom 4 tiles as base layer
    const zoom4Tiles = new Set<string>();
    for (let tz = minTileZ - 1; tz <= maxTileZ + 1; tz++) {
        for (let tx = minTileX - 1; tx <= maxTileX + 1; tx++) {
            const z4 = getZoom4Coords(tx, tz);
            const key = `${z4.x},${z4.z}`;
            if (!zoom4Tiles.has(key)) {
                zoom4Tiles.add(key);
                
                // Check if zoom 4 tile exists in manifest (blocksPerTile = 8192)
                if (tileExistsInManifest(manifest, targetWorld, 8192, z4.x, z4.z)) {
                    // Calculate bounds for zoom 4 tile
                    const startZ8X = z4.x * 16;
                    const startZ8Z = z4.z * 16;
                    const dx = startZ8X - centerTileX;
                    const dy = startZ8Z - centerTileZ;
                    const south = -dy * MAP_CONFIG.tileSize - zoom4TileSize;
                    const north = -dy * MAP_CONFIG.tileSize;
                    const west = dx * MAP_CONFIG.tileSize;
                    const east = dx * MAP_CONFIG.tileSize + zoom4TileSize;
                    const bounds: L.LatLngBoundsExpression = [[south, west], [north, east]];
                    
                    loadTileToMap(navMap, targetWorld, 4, z4.x, z4.z, bounds, addedToNavMap);
                }
            }
        }
    }
    
    // Then load zoom 8 tiles on top
    for (let tz = minTileZ - 1; tz <= maxTileZ + 1; tz++) {
        for (let tx = minTileX - 1; tx <= maxTileX + 1; tx++) {
            // Check if zoom 8 tile exists in manifest (blocksPerTile = 512)
            if (tileExistsInManifest(manifest, targetWorld, 512, tx, tz)) {
                // Bounds relative to center tile
                const relX = tx - centerTileX;
                const relZ = tz - centerTileZ;
                const south = -relZ * MAP_CONFIG.tileSize - MAP_CONFIG.tileSize;
                const north = -relZ * MAP_CONFIG.tileSize;
                const west = relX * MAP_CONFIG.tileSize;
                const east = relX * MAP_CONFIG.tileSize + MAP_CONFIG.tileSize;
                const bounds: L.LatLngBoundsExpression = [[south, west], [north, east]];
                
                loadTileToMap(navMap, targetWorld, 8, tx, tz, bounds, addedToNavMap);
            }
        }
    }
    
    // Convert route stops to Leaflet coordinates
    const routePoints: L.LatLngExpression[] = [];
    
    // Clear old markers
    navStopMarkers = [];
    
    for (let i = 0; i < stopsInWorld.length; i++) {
        const stop = stopsInWorld[i]!;
        const { lat, lng } = toLeafletCoordsRelative(stop.x, stop.z, centerTileX, centerTileZ, MAP_CONFIG.tileSize);
        routePoints.push([lat, lng]);
        
        // Add numbered marker for each stop (no origin marker since we start from player)
        const markerIcon = L.divIcon({
            className: 'nav-route-marker',
            html: `<div class="nav-marker">${i + 1}</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
        
        // Tooltip shows item name on hover
        const tooltipText = stop.cartItem 
            ? `${stop.cartItem.quantity}× ${stop.cartItem.trade.resultName}`
            : `Stop ${i + 1}`;
        
        const marker = L.marker([lat, lng], { icon: markerIcon })
            .bindTooltip(tooltipText, { 
                permanent: false,
                direction: 'top',
                offset: [0, -18]
            })
            .addTo(navMap);
        navStopMarkers.push(marker);
    }
    
    // Draw polyline connecting all stops
    navRoutePolyline = L.polyline(routePoints, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.8,
        dashArray: '10, 5'
    }).addTo(navMap);
    
    // Fit map to show all stops with padding
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
    const navTimeline = document.getElementById('nav-timeline');
    const navDistance = document.getElementById('nav-distance');
    
    if (navTimeline) {
        navTimeline.innerHTML = '';
        
        if (route.length === 0) {
            navTimeline.innerHTML = '<p class="cart-empty">Add items to cart to see route</p>';
        } else {
            // Sync progress and render using same function as cart tab
            syncNavProgressWithCart(route);
            
            let prevStop: RouteStop | null = null;
            for (let i = 0; i < route.length; i++) {
                const stop = route[i]!;
                navTimeline.appendChild(createTimelineStop(stop, i, route, prevStop));
                prevStop = stop;
            }
            
            // Add navigating class when navigation is active for matching styling
            if (navPlayerRefreshInterval) {
                navTimeline.classList.add('navigating');
            } else {
                navTimeline.classList.remove('navigating');
            }
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

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            getElement<HTMLInputElement>('searchWant').focus();
        }
    });

    // Matrix dialog
    const matrixDialog = getElement<HTMLDialogElement>('matrix-dialog');
    setupDialogBackdropClose(matrixDialog);
    getElement('open-matrix').addEventListener('click', () => {
        openDialog('matrix-dialog', renderMatrix);
    });

    // Map dialog
    const mapDialog = document.getElementById('map-dialog') as HTMLDialogElement | null;
    if (mapDialog) {
        setupDialogBackdropClose(mapDialog);
    }
    
    // Cart dialog
    const cartDialog = getElement<HTMLDialogElement>('cart-dialog');
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
        renderCartDialog();
    });
    
    // Tab switching
    setupCartTabs();
    
    // Player name input persistence
    setupPlayerNameInput();
    
    // Navigation controls
    setupNavigationControls();
    
    // Event delegation for trade row clicks (prevents memory leaks)
    getElement('results').addEventListener('click', (e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('.trade-row');
        if (row) {
            const x = parseInt(row.dataset['x'] ?? '0', 10);
            const y = parseInt(row.dataset['y'] ?? '0', 10);
            const z = parseInt(row.dataset['z'] ?? '0', 10);
            const world = row.dataset['world'] ?? 'overworld';
            openMapDialog(x, y, z, world);
        }
    });
});
