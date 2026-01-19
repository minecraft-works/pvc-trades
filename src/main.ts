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
    computeOptimalOrder
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
let currentPlayerPosition: { x: number; z: number; world: string } | null = null;
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
 * Generate a unique key for a trade (used to detect duplicates)
 */
function getTradeKey(trade: Trade): string {
    return `${trade.x},${trade.y},${trade.z},${trade.world},${trade.resultName},${trade.costName}`;
}

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
 */
function updateCartQuantity(trade: Trade, delta: number): void {
    const key = getTradeKey(trade);
    const item = cart.find(i => getTradeKey(i.trade) === key);
    
    if (item) {
        item.quantity = Math.max(1, item.quantity + delta);
        saveCart();
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
    
    // Re-render the cart dialog to update timeline
    renderCartDialog();
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

/**
 * Check if a point is in the nether
 */
function isNether(world: string): boolean {
    return world.toLowerCase().includes('nether');
}

/**
 * Compute optimal route using nearest-neighbor + 2-opt optimization
 * Starts from origin (0, 0) in overworld
 */
function computeRoute(): RouteStop[] {
    if (cart.length === 0) { return []; }
    
    // Convert cart items to RoutePoints for optimization
    const points = cart.map(item => ({
        x: item.trade.x,
        z: item.trade.z,
        world: item.trade.world
    }));
    
    // Get optimized order using lib functions
    const order = computeOptimalOrder(points);
    
    // Build route with shop stops only
    const route: RouteStop[] = [];
    
    for (const idx of order) {
        const item = cart[idx]!;
        route.push({
            type: 'shop',
            x: item.trade.x,
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
    tileSize: 512,  // pixels per tile (and blocks per tile)
    baseUrl: 'tiles',
    zoom: 8,  // zoom level for pyramid tile path
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
    requestAnimationFrame(() => {
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
        // We'll set bounds to show a 3x3 tile area centered on the shop's tile
        leafletMap = L.map(container, {
            crs: L.CRS.Simple,
            minZoom: -2,   // Will be set dynamically
            maxZoom: 2,    // Allow zooming in
            zoomControl: true,
            attributionControl: false,
            maxBoundsViscosity: 1.0,  // Prevent panning outside bounds (no rubber band)
            zoomSnap: 0,   // Allow fractional zoom levels
            zoomDelta: 0.5 // Zoom step when using buttons
        });
        
        // Add tiles in a 5x5 grid around the shop's tile
        // Each tile is placed as an ImageOverlay at its correct bounds
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const tx = tileX + dx;
                const tz = tileZ + dy;
                const tileUrl = `${MAP_CONFIG.baseUrl}/${worldId}/${MAP_CONFIG.zoom}/${tx}/${tz}.png`;
                
                // In CRS.Simple, bounds are [[south, west], [north, east]]
                // We want tile at (dx, dy) relative to center (0,0)
                // Each tile is 512 units
                const south = -dy * MAP_CONFIG.tileSize - MAP_CONFIG.tileSize;
                const north = -dy * MAP_CONFIG.tileSize;
                const west = dx * MAP_CONFIG.tileSize;
                const east = dx * MAP_CONFIG.tileSize + MAP_CONFIG.tileSize;
                
                L.imageOverlay(tileUrl, [[south, west], [north, east]]).addTo(leafletMap);
            }
        }
        
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
            
            // Only show players in overworld (all players are assumed to be in overworld for now)
            if (worldId !== 'overworld' || !leafletMap || cachedPlayers.length === 0) {return;}
            
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
            
            for (const player of cachedPlayers) {
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
        
        // Define the exact 5x5 tile bounds (for panning limits)
        // Grid spans: lat from -1536 to 1024, lng from -1024 to 1536 (2560 x 2560 units)
        const gridBounds = L.latLngBounds(
            [-1536, -1024],  // SW corner (bottom-left)
            [1024, 1536]     // NE corner (top-right)
        );
        
        // Center on the shop's position (marker coords)
        const shopCenter = L.latLng(markerLat, markerLng);
        
        leafletMap.invalidateSize();
        
        // Calculate zoom to show ~3x3 tiles (1536 units) for nice initial view
        // while having 5x5 tiles loaded for panning buffer
        const containerSize = leafletMap.getSize();
        const visibleSize = MAP_CONFIG.tileSize * 3;  // Show 3 tiles × 512 units
        const smallerDimension = Math.min(containerSize.x, containerSize.y);
        
        // Calculate zoom to fit visible area (3x3)
        const initialZoom = calculateFitZoom(smallerDimension, visibleSize);
        
        // Min zoom fits full 5x5 grid (for zoom out limit)
        const gridSize = MAP_CONFIG.tileSize * 5;
        const minZoom = calculateFitZoom(smallerDimension, gridSize);
        
        // Set zoom limits
        leafletMap.setMinZoom(minZoom);
        leafletMap.setMaxBounds(gridBounds);
        
        // Set view centered on shop at initial zoom (showing ~3x3 tiles)
        leafletMap.setView(shopCenter, initialZoom);
        
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
        if (quantity > 1) {
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
 */
function createTimelineStop(
    stop: RouteStop,
    stopIndex: number,
    route: RouteStop[],
    _prevStop: RouteStop | null
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
    
    content.innerHTML = `<span class="stop-text">${item.quantity}× ${item.trade.resultName}</span><span class="coord-ow">${owCoords}</span><span class="coord-nether">${netherCoords}</span>`;
    
    // Make shop content clickable to open map
    content.classList.add('clickable');
    content.addEventListener('click', () => {
        mapOpenedFromCart = true;
        const cartDialog = getElement<HTMLDialogElement>('cart-dialog');
        cartDialog.close();
        openMapDialog(stop.x, item.trade.y, stop.z, stop.world);
    });
    
    el.appendChild(content);
    
    return el;
}

/**
 * Render the route timeline
 */
function renderRouteTimeline(route: RouteStop[]): void {
    const timeline = getElement('route-timeline');
    timeline.innerHTML = '';
    
    if (route.length === 0) { return; }
    
    // Sync navigation progress with current cart
    syncNavProgressWithCart(route);
    
    // Render each stop
    let prevStop: RouteStop | null = null;
    for (let i = 0; i < route.length; i++) {
        const stop = route[i]!;
        timeline.appendChild(createTimelineStop(stop, i, route, prevStop));
        prevStop = stop;
    }
}

/**
 * Render the cart dialog contents
 */
function renderCartDialog(): void {
    const itemsContainer = getElement('cart-items');
    const costsContainer = getElement('cart-costs');
    const gainsContainer = getElement('cart-gains');
    const timelineContainer = getElement('route-timeline');
    const routeDistance = getElement('route-distance');
    const clearCartBtn = getElement('clear-cart');
    
    // Clear previous contents
    itemsContainer.innerHTML = '';
    costsContainer.innerHTML = '';
    gainsContainer.innerHTML = '';
    timelineContainer.innerHTML = '';
    
    if (cart.length === 0) {
        itemsContainer.innerHTML = '<p class="cart-empty">Your cart is empty</p>';
        routeDistance.textContent = '';
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
    
    // Compute and render route
    const route = computeRoute();
    const totalDistance = calculateTotalRouteDistance(route);
    const netherDistance = Math.round(totalDistance / 8);
    
    routeDistance.innerHTML = `<span class="dist-label">Distance:</span><span class="dist-ow">${Math.round(totalDistance).toLocaleString()}</span><span class="dist-nether">${netherDistance.toLocaleString()}</span>`;
    
    renderRouteTimeline(route);
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
function startNavigation(): void {
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
    
    cartDialog.close();
    
    if (navDialog) {
        // Initialize navigation map in the dialog
        const route = computeRoute();
        initNavigationMapDialog(route);
        renderNavTimelinePanel(route);
        
        navDialog.showModal();
        
        // Start polling player position
        pollPlayerPosition();
        const config = getConfig();
        navPlayerRefreshInterval = setInterval(pollPlayerPosition, config.dynmap.playerRefreshMs);
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
    
    currentPlayerPosition = null;
    
    // Close nav dialog and reopen cart dialog
    if (navDialog) {
        navDialog.close();
    }
    
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
            currentPlayerPosition = {
                x: player.position.x,
                z: player.position.z,
                world: 'overworld' // Assume overworld for now
            };
            
            updatePlayerMarker();
            updateLiveDistance();
            checkAutoAdvance();
            
            // In follow mode, center on player
            if (navMode === 'follow') {
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
    
    const { lat, lng } = toLeafletCoordsRelative(
        currentPlayerPosition.x,
        currentPlayerPosition.z,
        navMapCenterTileX,
        navMapCenterTileZ,
        MAP_CONFIG.tileSize
    );
    
    if (navPlayerMarker) {
        // Update existing marker position
        navPlayerMarker.setLatLng([lat, lng]);
    } else {
        // Create new marker
        const playerIcon = L.divIcon({
            className: 'nav-player-marker',
            html: '<div class="nav-player-dot"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        
        navPlayerMarker = L.marker([lat, lng], { icon: playerIcon, zIndexOffset: 1000 });
        navPlayerMarker.addTo(navMap);
    }
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
    
    const route = computeRoute();
    if (route.length === 0) {
        return;
    }
    
    // Find current stop (first non-completed)
    const currentStopIndex = findCurrentStopIndex(route);
    
    let distanceHtml: string;
    if (currentStopIndex < 0 || currentStopIndex >= route.length) {
        distanceHtml = '<span class="distance-label">Route complete! 🎉</span>';
    } else {
        const currentStop = route[currentStopIndex]!;
        const distance = calculateRouteDistance(
            currentPlayerPosition.x, currentPlayerPosition.z, currentPlayerPosition.world,
            currentStop.x, currentStop.z, currentStop.world
        );
        
        const itemName = currentStop.cartItem?.trade.resultName ?? 'Next stop';
        
        distanceHtml = `
            <span class="distance-label">→ ${itemName}:</span>
            <span class="distance-value">${Math.round(distance).toLocaleString()} blocks</span>
        `;
    }
    
    if (liveDistance) {
        liveDistance.innerHTML = distanceHtml;
    }
    if (dialogDistance) {
        dialogDistance.innerHTML = distanceHtml;
    }
}

/**
 * Find the index of the current (first non-completed) stop
 */
function findCurrentStopIndex(route: RouteStop[]): number {
    for (let i = 0; i < route.length; i++) {
        const stop = route[i]!;
        if (stop.cartItem) {
            const key = getTradeKey(stop.cartItem.trade);
            if (!navProgress.completedKeys.has(key)) {
                return i;
            }
        }
    }
    return route.length;
}

/**
 * Check if player is close enough to auto-advance to next stop
 */
function checkAutoAdvance(): void {
    if (!currentPlayerPosition) {
        return;
    }
    
    const route = computeRoute();
    const currentStopIndex = findCurrentStopIndex(route);
    
    if (currentStopIndex < 0 || currentStopIndex >= route.length) {
        return;
    }
    
    const currentStop = route[currentStopIndex]!;
    const distance = calculateRouteDistance(
        currentPlayerPosition.x, currentPlayerPosition.z, currentPlayerPosition.world,
        currentStop.x, currentStop.z, currentStop.world
    );
    
    if (distance < NAV_ARRIVAL_THRESHOLD && currentStop.cartItem) {
        // Auto-complete this stop
        const key = getTradeKey(currentStop.cartItem.trade);
        navProgress.completedKeys.add(key);
        navProgress.currentIndex = currentStopIndex + 1;
        saveNavProgress();
        
        // Re-render timeline panel in nav dialog
        const newRoute = computeRoute();
        renderNavTimelinePanel(newRoute);
    }
}

/**
 * Center the navigation map on the player position
 */
function centerMapOnPlayer(): void {
    if (!navMap || !currentPlayerPosition) {
        return;
    }
    
    const { lat, lng } = toLeafletCoordsRelative(
        currentPlayerPosition.x,
        currentPlayerPosition.z,
        navMapCenterTileX,
        navMapCenterTileZ,
        MAP_CONFIG.tileSize
    );
    
    navMap.setView([lat, lng], navMap.getZoom());
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
    const stopNavBtn = document.getElementById('stop-nav');
    
    startBtn?.addEventListener('click', toggleNavigation);
    recenterBtn?.addEventListener('click', switchToFollowMode);
    stopNavBtn?.addEventListener('click', stopNavigation);
    
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

/**
 * Initialize navigation map inside the circular dialog
 */
function initNavigationMapDialog(route: RouteStop[]): void {
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
    }
    
    if (route.length === 0) {
        container.innerHTML = '<p class="cart-empty" style="text-align: center; padding: 20px; color: var(--color-text-muted);">No route to display</p>';
        return;
    }
    
    // Clear container
    container.innerHTML = '';
    
    // Calculate bounds of all shops
    const xs = route.map(stop => stop.x);
    const zs = route.map(stop => stop.z);
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
    
    // Load tiles - expand range by 1 for padding
    for (let tz = minTileZ - 1; tz <= maxTileZ + 1; tz++) {
        for (let tx = minTileX - 1; tx <= maxTileX + 1; tx++) {
            // All route stops should be in overworld for now
            const tileUrl = `${MAP_CONFIG.baseUrl}/overworld/${MAP_CONFIG.zoom}/${tx}/${tz}.png`;
            
            // Bounds relative to center tile
            const relX = tx - centerTileX;
            const relZ = tz - centerTileZ;
            const south = -relZ * MAP_CONFIG.tileSize - MAP_CONFIG.tileSize;
            const north = -relZ * MAP_CONFIG.tileSize;
            const west = relX * MAP_CONFIG.tileSize;
            const east = relX * MAP_CONFIG.tileSize + MAP_CONFIG.tileSize;
            
            L.imageOverlay(tileUrl, [[south, west], [north, east]]).addTo(navMap);
        }
    }
    
    // Convert route stops to Leaflet coordinates
    const routePoints: L.LatLngExpression[] = [];
    
    for (let i = 0; i < route.length; i++) {
        const stop = route[i]!;
        const { lat, lng } = toLeafletCoordsRelative(stop.x, stop.z, centerTileX, centerTileZ, MAP_CONFIG.tileSize);
        routePoints.push([lat, lng]);
        
        // Add numbered marker for each stop
        const isOrigin = i === 0;
        const tooltipText = stop.cartItem 
            ? `${stop.cartItem.quantity}× ${stop.cartItem.trade.resultName}`
            : (isOrigin ? 'Start' : `Stop ${i}`);
        const markerIcon = L.divIcon({
            className: 'nav-route-marker',
            html: `<div class="nav-marker ${isOrigin ? 'nav-marker-origin' : ''}">${isOrigin ? '🏠' : i}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        L.marker([lat, lng], { icon: markerIcon })
            .bindTooltip(tooltipText, { 
                permanent: false,
                direction: 'top',
                offset: [0, -12]
            })
            .addTo(navMap);
    }
    
    // Draw polyline connecting all stops
    L.polyline(routePoints, {
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
 * Render the floating timeline panel in the navigation dialog
 */
function renderNavTimelinePanel(route: RouteStop[]): void {
    const panelTimeline = document.getElementById('nav-panel-timeline');
    if (!panelTimeline) {
        return;
    }
    
    panelTimeline.innerHTML = '';
    
    if (route.length === 0) {
        panelTimeline.innerHTML = '<p class="cart-empty" style="text-align: center; padding: 12px;">No route</p>';
        return;
    }
    
    // Sync progress
    syncNavProgressWithCart(route);
    
    // Create timeline container
    const timeline = document.createElement('div');
    timeline.className = 'route-timeline navigating';
    
    let prevStop: RouteStop | null = null;
    for (let i = 0; i < route.length; i++) {
        const stop = route[i]!;
        timeline.appendChild(createTimelineStop(stop, i, route, prevStop));
        prevStop = stop;
    }
    
    panelTimeline.appendChild(timeline);
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
