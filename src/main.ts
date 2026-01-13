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
    clampToCircle
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
    ShoppingList
} from './types.js';

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
 * Convert nether coords to overworld-equivalent for distance calculation
 */
function toOverworldEquivalent(x: number, z: number, world: string): { x: number; z: number } {
    if (isNether(world)) {
        return { x: x * 8, z: z * 8 };
    }
    return { x, z };
}

/**
 * Calculate distance between two points (using overworld-equivalent coords)
 */
function calculateDistance(
    x1: number, z1: number, world1: string,
    x2: number, z2: number, world2: string
): number {
    const p1 = toOverworldEquivalent(x1, z1, world1);
    const p2 = toOverworldEquivalent(x2, z2, world2);
    return Math.hypot(p1.x - p2.x, p1.z - p2.z);
}

/**
 * Compute optimal route using nearest-neighbor heuristic
 * Starts from origin (0, 0) in overworld
 */
function computeRoute(): RouteStop[] {
    if (cart.length === 0) { return []; }
    
    // Create list of shop stops to visit
    const unvisited: CartItem[] = [...cart];
    const route: RouteStop[] = [];
    
    // Start at origin (overworld)
    let currentX = 0;
    let currentZ = 0;
    let currentWorld = 'overworld';
    
    while (unvisited.length > 0) {
        // Find nearest unvisited shop
        let nearestIdx = 0;
        let nearestDist = Infinity;
        
        for (let i = 0; i < unvisited.length; i++) {
            const item = unvisited[i]!;
            const dist = calculateDistance(
                currentX, currentZ, currentWorld,
                item.trade.x, item.trade.z, item.trade.world
            );
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestIdx = i;
            }
        }
        
        const nextItem = unvisited.splice(nearestIdx, 1)[0]!;
        const nextWorld = nextItem.trade.world;
        
        // Check if we need a portal transition
        const wasNether = isNether(currentWorld);
        const willBeNether = isNether(nextWorld);
        
        if (wasNether !== willBeNether) {
            if (willBeNether) {
                // Entering nether: portal in overworld near next shop's OW-equivalent
                const owEquiv = toOverworldEquivalent(nextItem.trade.x, nextItem.trade.z, nextWorld);
                route.push({
                    type: 'portal',
                    x: owEquiv.x,
                    z: owEquiv.z,
                    world: 'overworld',
                    portalAction: 'enter'
                });
            } else {
                // Exiting nether: portal exit to overworld
                const owEquiv = toOverworldEquivalent(currentX, currentZ, currentWorld);
                route.push({
                    type: 'portal',
                    x: owEquiv.x,
                    z: owEquiv.z,
                    world: nextWorld,
                    portalAction: 'exit'
                });
            }
        }
        
        // Add the shop stop
        route.push({
            type: 'shop',
            x: nextItem.trade.x,
            z: nextItem.trade.z,
            world: nextWorld,
            cartItem: nextItem
        });
        
        currentX = nextItem.trade.x;
        currentZ = nextItem.trade.z;
        currentWorld = nextWorld;
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
        total += calculateDistance(prevX, prevZ, prevWorld, stop.x, stop.z, stop.world);
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
    row.innerHTML = `
        <span class="col result-amt">${showAmount}</span>
        <span class="col result-name">${resultDisplay}</span>
        <span class="col cost-amt">${costAmt}</span>
        <span class="col cost-name">${costDisplay}</span>
        <span class="col dev ${devClass}">${devText}</span>
        <span class="col stock ${stockClass}">${t.displayStock}</span>
        <span class="col coord distance" title="X: ${t.x}, Y: ${t.y}, Z: ${t.z}">${Math.round(Math.hypot(t.x, t.z))}</span>
        <span class="col coord world" title="${worldTitle}">${worldAbbrev}</span>
        <button class="col add-to-cart-btn" title="Add to cart">+</button>
    `;
    
    // Add click handler for cart button (stop propagation to prevent row click)
    const cartBtn = row.querySelector('.add-to-cart-btn') as HTMLButtonElement;
    cartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(t);
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
            <span class="cart-item-cost">for ${trade.item1.amount}× ${trade.costName}</span>
        </span>
        <span class="cart-item-controls">
            <button class="qty-btn qty-minus" aria-label="Decrease quantity">−</button>
            <span class="qty-display">${quantity}</span>
            <button class="qty-btn qty-plus" aria-label="Increase quantity">+</button>
            <button class="remove-btn" aria-label="Remove from cart">🗑️</button>
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
        renderCartDialog();
    });
    
    return itemEl;
}

/**
 * Create a route stop element
 */
function createRouteStopElement(stop: RouteStop): HTMLElement {
    const li = document.createElement('li');
    li.className = `route-stop route-stop-${stop.type}`;
    
    if (stop.type === 'portal') {
        const action = stop.portalAction === 'enter' ? 'Enter portal' : 'Exit portal';
        const destWorld = isNether(stop.world) ? 'Nether' : 'Overworld';
        li.innerHTML = `<span class="route-icon">⛩️</span> ${action} at (${stop.x}, ${stop.z}) → ${destWorld}`;
    } else {
        const item = stop.cartItem!;
        const worldName = isNether(stop.world) ? 'Nether' : 'Overworld';
        li.innerHTML = `<span class="route-icon">🏪</span> Get ${item.quantity}× ${item.trade.resultName} at (${stop.x}, ${stop.z}) ${worldName}`;
        
        // Make shop stops clickable to open map
        li.classList.add('clickable');
        li.addEventListener('click', () => {
            mapOpenedFromCart = true;
            const cartDialog = getElement<HTMLDialogElement>('cart-dialog');
            cartDialog.close();
            openMapDialog(stop.x, item.trade.y, stop.z, stop.world);
        });
    }
    
    return li;
}

/**
 * Render the cart dialog contents
 */
function renderCartDialog(): void {
    const itemsContainer = getElement('cart-items');
    const costsContainer = getElement('cart-costs');
    const gainsContainer = getElement('cart-gains');
    const routeContainer = getElement('cart-route');
    const routeDistance = getElement('route-distance');
    const clearCartBtn = getElement('clear-cart');
    
    // Clear previous contents
    itemsContainer.innerHTML = '';
    costsContainer.innerHTML = '';
    gainsContainer.innerHTML = '';
    routeContainer.innerHTML = '';
    
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
    
    routeDistance.textContent = `Total distance: ~${Math.round(totalDistance)} blocks`;
    
    for (const stop of route) {
        routeContainer.appendChild(createRouteStopElement(stop));
    }
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadShops();
    loadCart();

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
        cartDialog.showModal();
    });
    getElement('close-cart').addEventListener('click', () => {
        cartDialog.close();
    });
    getElement('clear-cart').addEventListener('click', () => {
        clearCart();
        renderCartDialog();
    });
    
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
