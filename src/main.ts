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
    getCoreBlocks
} from './lib.js';

import type {
    Trade,
    FilterResult,
    ItemValues,
    RatioGraph,
    MappingRule,
    ShopData,
    Coordinates,
    SortColumn,
    SortState
} from './types.js';

// ============================================================================
// Types
// ============================================================================

interface DeviationResult {
    ratio: number;
    text: string;
    isGood: boolean | null;
}

// ============================================================================
// State
// ============================================================================

let allTrades: Trade[] = [];
let mappingRules: MappingRule[] = [];
let itemValues: ItemValues | null = null;
let ratioGraph: RatioGraph | null = null;
const currentSort: SortState = { column: 'result-amt', direction: 'desc' };
let cachedRegex: RegExp | null = null;
let cachedPattern = '';

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

function getNumberValue(id: string, fallback = 0): number {
    return Number(getElement<HTMLInputElement>(id).value) || fallback;
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

function search(): void {
    const wantRaw = getInputValue('searchWant');
    const giveRaw = getInputValue('searchGive');

    const wantQuery = wantRaw === '*' ? '' : wantRaw;
    const giveQuery = giveRaw === '*' ? '' : giveRaw;
    const showAll = wantRaw === '*' || giveRaw === '*';

    if (!wantQuery && !giveQuery && !showAll) {
        getElement('results').innerHTML = '';
        return;
    }

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
        currentSort.direction = ['cost-name', 'result-name', 'dist'].includes(column) ? 'asc' : 'desc';
    }
    updateSortArrows();
    search();
}

function getRefCoords(): Coordinates {
    return {
        x: getNumberValue('refX'),
        y: getNumberValue('refY'),
        z: getNumberValue('refZ')
    };
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
        sortResultsLib(results, currentSort.column, currentSort.direction, getRefCoords());
    }
}

// ============================================================================
// Deviation Calculation
// ============================================================================

function getDeviation(trade: Trade): DeviationResult | null {
    if (!itemValues) { return null; }

    const costValue = getTrustedItemValue(trade.costName, itemValues);
    const resultValue = getTrustedItemValue(trade.resultName, itemValues);

    if (costValue === null || resultValue === null) { return null; }

    const expectedRate = resultValue / costValue;
    const actualRate = trade.item1.amount / trade.resultAmount;

    const ratio = actualRate / expectedRate;
    const percent = Math.max(DEVIATION_MIN_PERCENT, Math.min(DEVIATION_MAX_PERCENT, Math.round((ratio - 1) * 100)));

    if (percent === 0) {
        return { ratio, text: '0%', isGood: null };
    }

    const isGood = percent < 0;
    const text = percent > 0 ? `+${percent}%` : `−${Math.abs(percent)}%`;

    return { ratio, text, isGood };
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
    });
}

function renderHeader(): void {
    const header = getElement('table-header');
    header.innerHTML = `
        <span class="col header amt" data-col="result-amt" data-label="#">#</span>
        <span class="col header" data-col="result-name" data-label="I need">I need</span>
        <span class="col header amt" data-col="cost-amt" data-label="#">#</span>
        <span class="col header" data-col="cost-name" data-label="I give">I give</span>
        <span class="col header stock-header" data-col="stock" data-label="Stock">Stock</span>
        <span class="col header dev-header" data-col="dev" data-label="Dev" title="Deviation from expected price">Dev</span>
        <span class="col header dist-header" data-col="dist" data-label="Dist">Dist</span>
        <span class="col"><input type="number" id="refX" value="0" placeholder="X" title="Reference X"></span>
        <span class="col"><input type="number" id="refY" value="0" placeholder="Y" title="Reference Y"></span>
        <span class="col"><input type="number" id="refZ" value="0" placeholder="Z" title="Reference Z"></span>
    `;

    header.querySelectorAll<HTMLElement>('.header').forEach(el => {
        el.addEventListener('click', () => {
            const col = el.dataset['col'] as SortColumn | undefined;
            if (col) { sortByColumn(col); }
        });
    });

    ['refX', 'refY', 'refZ'].forEach(id => {
        getElement(id).addEventListener('input', search);
    });

    updateSortArrows();
}

function renderResults(results: FilterResult[], wantRegex: RegExp | null, giveRegex: RegExp | null): void {
    const container = getElement('results');

    if (results.length === 0) {
        container.innerHTML = '<div class="no-results"><h2>No trades found</h2><p>Try a different search term</p></div>';
        return;
    }

    const ref = getRefCoords();
    const html: string[] = [];

    for (const { trade: t, matchResult, matchCost, dist, displayName, displayAmount } of results) {
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
        const d = dist ?? Math.round(Math.hypot(t.x - ref.x, t.y - ref.y, t.z - ref.z));

        const dev = getDeviation(t);
        const devClass = dev && dev.isGood !== null ? (dev.isGood ? 'good-deal' : 'bad-deal') : '';
        const devText = dev ? dev.text : '';

        html.push(`<div class="trade-row">
            <span class="col result-amt">${showAmount}</span>
            <span class="col result-name">${resultDisplay}</span>
            <span class="col cost-amt">${costAmt}</span>
            <span class="col cost-name">${costDisplay}</span>
            <span class="col stock ${stockClass}">${t.displayStock}</span>
            <span class="col dev ${devClass}">${devText}</span>
            <span class="col coord">${Math.round(d)}</span>
            <span class="col coord">${t.x}</span>
            <span class="col coord">${t.y}</span>
            <span class="col coord">${t.z}</span>
        </div>`);
    }

    container.innerHTML = html.join('');
}

// ============================================================================
// Matrix Dialog
// ============================================================================

function formatValue(value: number): string {
    if (value >= 100) { return Math.round(value).toString(); }
    if (value >= 10) { return value.toFixed(1); }
    if (value >= 1) { return value.toFixed(2); }
    return value.toFixed(3);
}

function renderMatrix(): void {
    const container = getElement('matrix-container');

    if (!ratioGraph || ratioGraph.size === 0) {
        container.innerHTML = '<p class="muted">No conversion data available</p>';
        return;
    }

    const coreBlocks = getCoreBlocks();
    let html = '<table class="matrix"><thead><tr><th></th>';
    for (const item of coreBlocks) {
        html += `<th>${escapeHtml(item)}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const row of coreBlocks) {
        html += `<tr><th>${escapeHtml(row)}</th>`;
        for (const col of coreBlocks) {
            if (row === col) {
                html += '<td class="self">1</td>';
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
    html += '<p class="matrix-hint">Cell shows: 1 row item = X column items</p>';
    container.innerHTML = html;
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadShops();

    getElement('searchWant').addEventListener('input', () => {
        requestAnimationFrame(search);
    });
    getElement('searchGive').addEventListener('input', () => {
        requestAnimationFrame(search);
    });

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            getElement<HTMLInputElement>('searchWant').focus();
        }
    });

    // Matrix dialog
    const dialog = getElement<HTMLDialogElement>('matrix-dialog');
    getElement('open-matrix').addEventListener('click', () => {
        renderMatrix();
        dialog.showModal();
    });
    getElement('close-matrix').addEventListener('click', () => {
        dialog.close();
    });
    dialog.addEventListener('click', e => {
        if (e.target === dialog) { dialog.close(); }
    });
});
