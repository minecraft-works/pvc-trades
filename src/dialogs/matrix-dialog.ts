/**
 * Exchange Rates Dialog Module
 *
 * Rates tab: key currency pairs in a small table (the more valuable item
 * first, with names and icons) and a converter for any two core currencies.
 * Each rate shows both sides of the market at once: Buy is what an item costs
 * at a shop, Sell is what a shop pays for it. The Flips tab lists profitable
 * round trips between shops.
 *
 * @module dialogs/matrix-dialog
 */

import { DIALOG_IDS, SELECTORS } from '../constants.js';
import { escapeHtml } from '../library.js';
import type { ExchangeMatrix, ItemValues } from '../types.js';
import { buildExchangeMatrix } from '../valuation/ratio-graph.js';
import { type FlipsPanelDeps, renderFlipsPanel } from './flips-panel.js';

// ============================================================================
// Constants
// ============================================================================

/** Icon URLs for core currency items */
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

/** Key currency pairs; each is shown with its more valuable item first */
const KEY_PAIRS: [string, string][] = [
    ['Netherite Ingot', 'Diamond Block'],
    ['Diamond', 'Emerald Block'],
    ['Gold Block', 'Emerald Block'],
    ['Emerald Block', 'Iron Block'],
];

const DIALOG_HEADER_HTML = '<header><h2>Exchange Rates</h2><button id="close-matrix" aria-label="Close">&times;</button></header>';

const RATES_HINT_HTML = '<p class="rates-hint"><strong>Buy</strong> is what one item costs at a shop, <strong>Sell</strong> what a shop pays you for it.</p>';

/** Both sides of the market */
interface Matrices {
    readonly buy: ExchangeMatrix;
    readonly sell: ExchangeMatrix;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Item name as written in the trade table ("Netherite ingot")
 * @param label - Currency label, e.g. "Netherite Ingot"
 * @returns Name with only the first letter capitalised
 */
function toDisplayName(label: string): string {
    return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

/**
 * Icon and name of a currency
 * @param label - Currency label
 * @returns HTML with an icon (when known) and the display name
 */
function itemWithIcon(label: string): string {
    const url = ITEM_ICONS[label];
    const icon = url ? `<img src="${url}" alt="" class="matrix-icon" aria-hidden="true">` : '';
    return `${icon}<span>${escapeHtml(toDisplayName(label))}</span>`;
}

/**
 * Format a rate so it reads at a glance: whole numbers from 100, one decimal
 * from 10, otherwise up to two decimals
 * @param value - Rate, or undefined when there is no data
 * @returns Formatted rate, or a dash
 */
function formatRate(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) { return '\u2014'; }
    let digits = 2;
    if (value >= 100) {
        digits = 0;
    } else if (value >= 10) {
        digits = 1;
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/**
 * Get exchange ratio from matrix: how many of `to` for 1 of `from`
 * @param matrix - The exchange matrix to query
 * @param from - Source currency label
 * @param to - Target currency label
 * @returns The ratio value, or undefined if either currency is not in the matrix
 */
function getMatrixRatio(matrix: ExchangeMatrix, from: string, to: string): number | undefined {
    const fromIndex = matrix.labels.indexOf(from);
    const toIndex = matrix.labels.indexOf(to);
    if (fromIndex === -1 || toIndex === -1) { return undefined; }
    return matrix.ratios[fromIndex]?.[toIndex];
}

/**
 * Put the more valuable item first, so rates read "1 netherite ingot = 17
 * diamond blocks" rather than "1 diamond block = 0.06 netherite ingot"
 * @param pair - Two currency labels
 * @param matrices - Buy and sell matrices
 * @returns The pair, more valuable item first
 */
function orientPair(pair: readonly [string, string], matrices: Matrices): [string, string] {
    const [a, b] = pair;
    const buy = getMatrixRatio(matrices.buy, a, b);
    const sell = getMatrixRatio(matrices.sell, a, b);
    const ratio = buy === undefined || sell === undefined ? buy ?? sell : Math.sqrt(buy * sell);
    return ratio !== undefined && ratio < 1 ? [b, a] : [a, b];
}

// ============================================================================
// Rates Panel
// ============================================================================

/**
 * Build the key rates table
 * @param matrices - Buy and sell matrices
 * @returns HTML for the key rates section
 */
function buildKeyRates(matrices: Matrices): string {
    const rows = KEY_PAIRS.map(pair => {
        const [item, unit] = orientPair(pair, matrices);
        return `<div class="rate-table-row" role="row">
            <span class="rate-item" role="cell">${itemWithIcon(item)}</span>
            <span class="rate-num" role="cell">${formatRate(getMatrixRatio(matrices.buy, item, unit))}</span>
            <span class="rate-num" role="cell">${formatRate(getMatrixRatio(matrices.sell, item, unit))}</span>
            <span class="rate-unit" role="cell">${itemWithIcon(unit)}</span>
        </div>`;
    }).join('');
    return `<section class="converter-section">
        <h3 class="converter-section-title">Key rates</h3>
        <div class="rate-table" role="table" aria-label="Key rates">
            <div class="rate-table-row rate-table-head" role="row">
                <span role="columnheader">1 ×</span>
                <span class="rate-num" role="columnheader">Buy</span>
                <span class="rate-num" role="columnheader">Sell</span>
                <span role="columnheader">in</span>
            </div>
            ${rows}
        </div>
    </section>`;
}

/**
 * Build the <option> elements for a currency select dropdown
 * @param labels - All available currency labels
 * @param selected - Currently selected label to mark as selected
 * @returns HTML string of <option> elements
 */
function buildCurrencyOptions(labels: readonly string[], selected: string): string {
    return labels
        .map(label => `<option value="${escapeHtml(label)}"${label === selected ? ' selected' : ''}>${escapeHtml(toDisplayName(label))}</option>`)
        .join('');
}

/**
 * Build the converter
 * @param labels - Available currency labels for the dropdowns
 * @returns HTML string for the converter section
 */
function buildConverter(labels: readonly string[]): string {
    const from = labels.find(label => label === 'Netherite Ingot') ?? labels[0] ?? '';
    const to = labels.find(label => label === 'Diamond Block') ?? labels[1] ?? '';
    return `<section class="converter-section">
        <h3 class="converter-section-title">Convert</h3>
        <div class="converter-custom">
            <div class="converter-row">
                <input type="number" id="converter-from-amount" class="converter-input"
                       inputmode="decimal" min="0" step="any" value="1" aria-label="Amount to convert">
                <select id="converter-from-select" class="converter-select" aria-label="Convert from">${buildCurrencyOptions(labels, from)}</select>
            </div>
            <div class="converter-row">
                <button type="button" id="converter-swap" class="converter-swap-btn" aria-label="Swap currencies" title="Swap currencies">\u21C5</button>
                <select id="converter-to-select" class="converter-select" aria-label="Convert to">${buildCurrencyOptions(labels, to)}</select>
            </div>
            <div class="converter-results">
                <div class="converter-result"><span class="converter-result-label">Buy</span><strong id="converter-buy">\u2014</strong></div>
                <div class="converter-result"><span class="converter-result-label">Sell</span><strong id="converter-sell">\u2014</strong></div>
            </div>
        </div>
    </section>`;
}

/**
 * Update the converter results for the chosen amount and currencies
 * @param container - Dialog content
 * @param matrices - Buy and sell matrices
 */
function updateConverter(container: HTMLElement, matrices: Matrices): void {
    const from = container.querySelector<HTMLSelectElement>('#converter-from-select')?.value ?? '';
    const to = container.querySelector<HTMLSelectElement>('#converter-to-select')?.value ?? '';
    const amount = Number.parseFloat(container.querySelector<HTMLInputElement>('#converter-from-amount')?.value ?? '') || 0;
    const convert = (matrix: ExchangeMatrix): string => {
        if (from === to) { return formatRate(amount); }
        const ratio = getMatrixRatio(matrix, from, to);
        return ratio === undefined ? '\u2014' : formatRate(amount * ratio);
    };
    const buy = container.querySelector('#converter-buy');
    const sell = container.querySelector('#converter-sell');
    if (buy) { buy.textContent = convert(matrices.buy); }
    if (sell) { sell.textContent = convert(matrices.sell); }
}

/**
 * Wire the converter inputs and swap button
 * @param container - Dialog content
 * @param matrices - Buy and sell matrices
 */
function wireConverter(container: HTMLElement, matrices: Matrices): void {
    const update = (): void => { updateConverter(container, matrices); };
    for (const id of ['#converter-from-select', '#converter-to-select', '#converter-from-amount']) {
        container.querySelector(id)?.addEventListener('input', update);
    }
    container.querySelector('#converter-swap')?.addEventListener('click', () => {
        const fromSelect = container.querySelector<HTMLSelectElement>('#converter-from-select');
        const toSelect = container.querySelector<HTMLSelectElement>('#converter-to-select');
        if (!fromSelect || !toSelect) { return; }
        const previousFrom = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = previousFrom;
        update();
    });
    update();
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render the exchange rates dialog: Rates (key rates and converter) and Flips.
 *
 * @param container - Container element for the dialog content
 * @param itemValues - The computed item values, or undefined if not available
 * @param getElement - Helper function to get elements by ID
 * @param flips - Flips tab callbacks; the tab is left out without them
 */
export function renderExchangeMatrix(
    container: HTMLElement,
    itemValues: ItemValues | undefined,
    getElement: <T extends HTMLElement = HTMLElement>(id: string) => T,
    flips?: FlipsPanelDeps
): void {
    const closeDialog = (): void => { getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close(); };
    if (!itemValues || itemValues.size === 0) {
        container.innerHTML = `${DIALOG_HEADER_HTML}<p class="muted">No price data available</p>`;
        container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', closeDialog);
        return;
    }

    const matrices: Matrices = { buy: buildExchangeMatrix(itemValues, 'buy'), sell: buildExchangeMatrix(itemValues, 'sell') };
    const flipsTab = flips ? '<button class="matrix-tab" data-tab="flips" title="Buy at one shop, sell to another for profit">Flips</button>' : '';
    container.innerHTML = `${DIALOG_HEADER_HTML}
        <div class="matrix-tabs">
            <button class="matrix-tab matrix-tab--active" data-tab="rates">Rates</button>
            ${flipsTab}
        </div>
        <div class="matrix-rates">
            ${RATES_HINT_HTML}
            ${buildKeyRates(matrices)}
            ${buildConverter(matrices.buy.labels)}
        </div>
        <div class="matrix-flips hidden"></div>`;

    wireConverter(container, matrices);

    const ratesPanel = container.querySelector<HTMLElement>('.matrix-rates');
    const flipsPanel = container.querySelector<HTMLElement>('.matrix-flips');
    let flipsRendered = false;
    for (const tab of container.querySelectorAll<HTMLButtonElement>('.matrix-tab')) {
        tab.addEventListener('click', () => {
            for (const element of container.querySelectorAll('.matrix-tab')) {
                element.classList.toggle('matrix-tab--active', element === tab);
            }
            const showFlips = tab.dataset.tab === 'flips';
            ratesPanel?.classList.toggle('hidden', showFlips);
            flipsPanel?.classList.toggle('hidden', !showFlips);
            if (showFlips && flips && flipsPanel && !flipsRendered) {
                flipsRendered = true;
                renderFlipsPanel(flipsPanel, flips);
            }
        });
    }

    container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', closeDialog);
}