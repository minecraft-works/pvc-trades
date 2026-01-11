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
    sortResults as sortResultsLib,
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
    toLeafletCoords
} from './lib.js';

import type {
    Trade,
    FilterResult,
    ItemValues,
    RatioGraph,
    MappingRule,
    ShopData,
    SortColumn,
    SortState
} from './types.js';

import * as L from 'leaflet';

// ============================================================================
// Types
// ============================================================================

interface DeviationResult {
    ratio: number;
    text: string;
    isGood: boolean | null;
}

// ============================================================================
// Dialog Utilities
// ============================================================================

/**
 * Set up a dialog to close when clicking on backdrop (outside the dialog box)
 */
function setupDialogBackdropClose(dialog: HTMLDialogElement): void {
    dialog.addEventListener('click', e => {
        const rect = dialog.getBoundingClientRect();
        const clickedInDialog = (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
        );
        if (!clickedInDialog) {
            dialog.close();
        }
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
const currentSort: SortState = { column: 'dev', direction: 'asc' };
let cachedRegex: RegExp | null = null;
let cachedPattern = '';
let searchDebounceTimer: number | null = null;
const deviationCache = new Map<Trade, DeviationResult | null>();

// ============================================================================
// Constants
// ============================================================================

const DEVIATION_MIN_PERCENT = -99;
const DEVIATION_MAX_PERCENT = 999;

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
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = ['cost-name', 'result-name'].includes(column) ? 'asc' : 'desc';
    }
    updateSortArrows();
    search();
}

function sortResults(results: FilterResult[]): void {
    if (currentSort.column === 'dev') {
        const dir = currentSort.direction === 'asc' ? 1 : -1;
        results.sort((a, b) => {
            const devA = getDeviation(a.trade);
            const devB = getDeviation(b.trade);
            if (!devA && !devB) { return 0; }
            if (!devA) { return 1; }
            if (!devB) { return -1; }
            return dir * (devA.ratio - devB.ratio);
        });
    } else {
        sortResultsLib(results, currentSort.column, currentSort.direction);
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
        const result = { ratio, text: '0%', isGood: null };
        deviationCache.set(trade, result);
        return result;
    }

    const isGood = percent < 0;
    const text = percent > 0 ? `+${percent}%` : `−${Math.abs(percent)}%`;
    const result = { ratio, text, isGood };
    deviationCache.set(trade, result);

    return result;
}

// ============================================================================
// Rendering
// ============================================================================

function getArrow(col: string): string {
    if (currentSort.column !== col) { return ''; }
    return currentSort.direction === 'asc' ? '▲' : '▼';
}

function updateSortArrows(): void {
    document.querySelectorAll<HTMLElement>('#table-header .header').forEach(el => {
        const label = el.dataset['label'] ?? '';
        const col = el.dataset['col'] ?? '';
        el.textContent = label + getArrow(col);
        el.classList.toggle('active-sort', col === currentSort.column);
    });
}

function renderHeader(): void {
    const header = getElement('table-header');
    header.innerHTML = `
        <span class="col header amt" data-col="result-amt" data-label="#">#</span>
        <span class="col header" data-col="result-name" data-label="I need">I need</span>
        <span class="col header amt" data-col="cost-amt" data-label="#">#</span>
        <span class="col header" data-col="cost-name" data-label="I give">I give</span>
        <span class="col header dev-header" data-col="dev" data-label="Deal" title="Deal quality vs expected price">Deal</span>
        <span class="col header stock-header" data-col="stock" data-label="Stock">Stock</span>
        <span class="col coord mobile-coords">Loc</span>
        <span class="col header world-header" data-col="world" data-label="W" title="World">W</span>
        <span class="col coord">X</span>
        <span class="col coord">Y</span>
        <span class="col coord">Z</span>
    `;

    header.querySelectorAll<HTMLElement>('.header').forEach(el => {
        el.addEventListener('click', () => {
            const col = el.dataset['col'] as SortColumn | undefined;
            if (col) { sortByColumn(col); }
        });
    });

    updateSortArrows();
}

function renderResults(results: FilterResult[], wantRegex: RegExp | null, giveRegex: RegExp | null): void {
    const container = getElement('results');

    if (results.length === 0) {
        container.innerHTML = '<div class="no-results"><h2>No trades found</h2><p>Try a different search term</p></div>';
        return;
    }

    const html: string[] = [];

    for (const { trade: t, matchResult, matchCost, displayName, displayAmount } of results) {
        const showName = displayName ?? t.resultName;
        const showAmount = displayAmount ?? t.resultAmount;
        const stockClass = t.displayStock === 0 ? 'no-stock' : 'in-stock';

        let costAmt = String(t.item1.amount);
        let costName = t.costName;
        if (t.item2) {
            costAmt += '+' + t.item2.amount;
            costName += ' + ' + formatName(t.item2);
        }

        const costDisplay = matchCost && giveRegex ? highlight(costName, giveRegex) : escapeHtml(costName);
        const resultDisplay = matchResult && wantRegex ? highlight(showName, wantRegex) : escapeHtml(showName);

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

        html.push(`<div class="trade-row" data-x="${t.x}" data-y="${t.y}" data-z="${t.z}" data-world="${t.world}">
            <span class="col result-amt">${showAmount}</span>
            <span class="col result-name">${resultDisplay}</span>
            <span class="col cost-amt">${costAmt}</span>
            <span class="col cost-name">${costDisplay}</span>
            <span class="col dev ${devClass}">${devText}</span>
            <span class="col stock ${stockClass}">${t.displayStock}</span>
            <span class="col coord mobile-coords" title="${t.x}, ${t.y}, ${t.z}">${t.x},${t.z}</span>
            <span class="col coord world" title="${worldTitle}">${worldAbbrev}</span>
            <span class="col coord">${t.x}</span>
            <span class="col coord">${t.y}</span>
            <span class="col coord">${t.z}</span>
        </div>`);
    }

    container.innerHTML = html.join('');
    
    // Add click handlers for map modal
    container.querySelectorAll<HTMLElement>('.trade-row').forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
            const x = parseInt(row.dataset['x'] ?? '0', 10);
            const y = parseInt(row.dataset['y'] ?? '0', 10);
            const z = parseInt(row.dataset['z'] ?? '0', 10);
            const world = row.dataset['world'] ?? 'overworld';
            openMapDialog(x, y, z, world);
        });
    });
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
        container.innerHTML = '<p class="muted">No conversion data available</p>';
        return;
    }

    const coreBlocks = getCoreBlocks();
    let html = '<table class="matrix"><thead><tr><th></th>';
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

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ============================================================================
// Map Dialog (Leaflet)
// ============================================================================

const MAP_CONFIG = {
    tileSize: 512,  // pixels per tile (and blocks per tile)
    baseUrl: 'tiles'
};

// Leaflet map instance (reused across dialog opens)
let leafletMap: L.Map | null = null;

/**
 * Initialize or update the Leaflet map
 */
function openMapDialog(x: number, y: number, z: number, world: string): void {
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
        
        // Add tiles in a 3x3 grid around the shop's tile
        // Each tile is placed as an ImageOverlay at its correct bounds
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const tx = tileX + dx;
                const tz = tileZ + dy;
                const tileUrl = `${MAP_CONFIG.baseUrl}/${worldId}/${tx}_${tz}.png`;
                
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
        
        // Use circleMarker with pulsing effect via CSS
        L.circleMarker(latLng, {
            radius: 8,
            className: 'leaflet-pulsing-marker',
            color: '#ff0000',
            fillColor: '#ff0000',
            fillOpacity: 1,
            weight: 2
        }).addTo(leafletMap);
        
        // Define the exact 3x3 tile bounds
        // Grid spans: lat from -1024 to 512, lng from -512 to 1024 (1536 x 1536 units)
        const gridBounds = L.latLngBounds(
            [-1024, -512],  // SW corner (bottom-left)
            [512, 1024]     // NE corner (top-right)
        );
        
        // Center of 3x3 grid
        const gridCenter = L.latLng(-256, 256);
        
        leafletMap.invalidateSize();
        
        // Calculate exact zoom to fit grid in container
        const containerSize = leafletMap.getSize();
        const gridSize = MAP_CONFIG.tileSize * 3;  // 3 tiles × 512 units
        const smallerDimension = Math.min(containerSize.x, containerSize.y);
        
        // Calculate exact zoom needed to fit grid
        const exactZoom = calculateFitZoom(smallerDimension, gridSize);
        
        // Round up slightly to ensure no panning at min zoom
        const minZoom = Math.ceil(exactZoom * 100) / 100;
        
        // Set this as the minimum zoom
        leafletMap.setMinZoom(minZoom);
        leafletMap.setMaxBounds(gridBounds);
        
        // Set view centered on grid at calculated zoom
        leafletMap.setView(gridCenter, minZoom);
    });
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadShops();

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
});
