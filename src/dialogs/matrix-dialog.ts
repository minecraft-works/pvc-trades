/**
 * Exchange Rate Converter Dialog Module
 *
 * Shows key currency pairs at a glance with editable amounts,
 * plus a custom converter for arbitrary core-currency combinations.
 * Buy/Sell tabs control which median prices are used.
 *
 * @module dialogs/matrix-dialog
 */

import { DIALOG_IDS,SELECTORS } from '../constants.js';
import { buildExchangeMatrix,escapeHtml } from '../library.js';
import type { ExchangeMatrix,ItemValues } from '../types.js';

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

/** Key currency pairs shown as quick converters */
const KEY_PAIRS: [string, string][] = [
    ['Diamond', 'Emerald Block'],
    ['Diamond Block', 'Netherite Ingot'],
    ['Emerald Block', 'Gold Block'],
    ['Emerald Block', 'Iron Block'],
];

const DIALOG_HEADER_HTML = '<header><h2>Exchange Rates</h2><button id="close-matrix" aria-label="Close">&times;</button></header>';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the icon HTML for an item, or escaped text if no icon exists
 * @param name - Item name to look up an icon for
 * @returns HTML string: an <img> tag if icon found, otherwise escaped text
 */
function getItemIcon(name: string): string {
    const url = ITEM_ICONS[name];
    if (url) {
        return `<img src="${url}" alt="${escapeHtml(name)}" class="matrix-icon" title="${escapeHtml(name)}">`;
    }
    return escapeHtml(name);
}

/**
 * Format a ratio value for display with appropriate precision
 * @param value - Numeric ratio to format, or undefined for no data
 * @returns Formatted string (e.g., '1.5', '2', or '—' if undefined)
 */
function formatRatio(value: number | undefined): string {
    if (value === undefined) { return '\u2014'; }
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
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
 * Format a converted amount — show up to 2 decimals, strip trailing zeros
 * @param value - Numeric amount to format
 * @returns Formatted locale string, or '—' if not finite
 */
function formatAmount(value: number): string {
    if (!Number.isFinite(value)) { return '\u2014'; }
    return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// ============================================================================
// Quick Conversions Section
// ============================================================================

/**
 * Build HTML for a single static rate row
 * @param fromName - Source currency display name
 * @param toName - Target currency display name
 * @param index - Index used to identify the rate value element via data-rate
 * @returns HTML string for the rate row div
 */
function buildRateRow(fromName: string, toName: string, index: number): string {
    return `<div class="rate-row">
        ${getItemIcon(fromName)}
        <span class="rate-from-amount">1</span>
        <span class="rate-eq">=</span>
        <span class="rate-value" data-rate="${index}">\u2014</span>
        ${getItemIcon(toName)}
    </div>`;
}

/**
 * Build HTML for the key rates overview
 * @returns HTML string for the key rates section
 */
function buildKeyRates(): string {
    let html = '<div class="converter-section"><h3 class="converter-section-title">Key Rates</h3>';
    html += '<div class="rate-rows">';
    for (const [index, [from, to]] of KEY_PAIRS.entries()) {
        html += buildRateRow(from, to, index);
    }
    html += '</div></div>';
    return html;
}

// ============================================================================
// Custom Converter Section
// ============================================================================

/**
 * Build the <option> elements for a currency select dropdown
 * @param labels - All available currency labels
 * @param selected - Currently selected label to mark as selected
 * @returns HTML string of <option> elements
 */
function buildCurrencyOptions(labels: readonly string[], selected: string): string {
    let html = '';
    for (const label of labels) {
        const sel = label === selected ? ' selected' : '';
        html += `<option value="${escapeHtml(label)}"${sel}>${escapeHtml(label)}</option>`;
    }
    return html;
}

/**
 * Build HTML for the custom converter
 * @param labels - Available currency labels for the dropdowns
 * @returns HTML string for the custom converter section
 */
function buildCustomConverter(labels: readonly string[]): string {
    const from = labels[0] ?? '';
    const to = labels[1] ?? '';

    return `<div class="converter-section">
        <h3 class="converter-section-title">Custom Converter</h3>
        <div class="converter-custom">
            <div class="converter-custom-field">
                <label class="converter-label">From</label>
                <div class="converter-row">
                    <input type="number" id="converter-from-amount" class="converter-input"
                           inputmode="decimal" min="0" step="any" value="1"
                           aria-label="Amount to convert">
                    <select id="converter-from-select" class="converter-select">${buildCurrencyOptions(labels, from)}</select>
                </div>
            </div>
            <button id="converter-swap" class="converter-swap-btn" aria-label="Swap currencies"
                    title="Swap currencies">\u21C5 Swap</button>
            <div class="converter-custom-field">
                <label class="converter-label">To</label>
                <div class="converter-row">
                    <div class="converter-result-box" id="converter-custom-result">\u2014</div>
                    <select id="converter-to-select" class="converter-select">${buildCurrencyOptions(labels, to)}</select>
                </div>
            </div>
            <p class="converter-rate-hint" id="converter-rate-hint"></p>
        </div>
    </div>`;
}

// ============================================================================
// Update Logic
// ============================================================================

/**
 * Update the static key-rate values for the active matrix
 * @param container - DOM element containing the rate value elements
 * @param matrix - Exchange matrix with current ratio data
 */
function updateKeyRates(container: HTMLElement, matrix: ExchangeMatrix): void {
    for (const [index, [fromName, toName]] of KEY_PAIRS.entries()) {
        const ratio = getMatrixRatio(matrix, fromName, toName);
        const element = container.querySelector<HTMLElement>(`[data-rate="${index}"]`);
        if (element) {
            element.textContent = formatRatio(ratio);
        }
    }
}

/**
 * Update the custom converter result
 * @param container - DOM element containing the converter inputs and output
 * @param matrix - Exchange matrix with current ratio data
 */
function updateCustomConverter(container: HTMLElement, matrix: ExchangeMatrix): void {
    const fromSelect = container.querySelector<HTMLSelectElement>('#converter-from-select');
    const toSelect = container.querySelector<HTMLSelectElement>('#converter-to-select');
    const amountInput = container.querySelector<HTMLInputElement>('#converter-from-amount');
    const resultBox = container.querySelector<HTMLElement>('#converter-custom-result');
    const rateHint = container.querySelector<HTMLElement>('#converter-rate-hint');

    if (!fromSelect || !toSelect || !amountInput || !resultBox) { return; }

    const from = fromSelect.value;
    const to = toSelect.value;
    const amount = Number.parseFloat(amountInput.value) || 0;

    if (from === to) {
        resultBox.textContent = formatAmount(amount);
        if (rateHint) { rateHint.textContent = 'Same currency'; }
        return;
    }

    const ratio = getMatrixRatio(matrix, from, to);
    if (ratio === undefined) {
        resultBox.textContent = '\u2014';
        if (rateHint) { rateHint.textContent = 'No rate available'; }
        return;
    }

    resultBox.textContent = formatAmount(amount * ratio);
    if (rateHint) {
        rateHint.textContent = `Rate: 1 ${from} = ${formatRatio(ratio)} ${to}`;
    }
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render the exchange rate converter dialog with quick pairs and custom converter.
 * Buy/Sell tabs control which median prices are used for ratios.
 *
 * @param container - Container element for the dialog content
 * @param itemValues - The computed item values, or undefined if not available
 * @param getElement - Helper function to get elements by ID
 */
export function renderExchangeMatrix(
    container: HTMLElement,
    itemValues: ItemValues | undefined,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers specify concrete element types
    getElement: <T extends HTMLElement = HTMLElement>(id: string) => T
): void {
    if (!itemValues || itemValues.size === 0) {
        container.innerHTML = `${DIALOG_HEADER_HTML}<p class="muted">No price data available</p>`;
        container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', () => {
            getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close();
        });
        return;
    }

    const buyMatrix = buildExchangeMatrix(itemValues, 'buy');
    const sellMatrix = buildExchangeMatrix(itemValues, 'sell');
    let activeMatrix = buyMatrix;

    let html = DIALOG_HEADER_HTML;
    html += '<div class="matrix-tabs">';
    html += '<button class="matrix-tab matrix-tab--active" data-tab="buy">Buy</button>';
    html += '<button class="matrix-tab" data-tab="sell">Sell</button>';
    html += '</div>';
    html += buildKeyRates();
    html += buildCustomConverter(buyMatrix.labels);
    container.innerHTML = html;

    // Initial update
    updateKeyRates(container, activeMatrix);
    updateCustomConverter(container, activeMatrix);

    // --- Event wiring ---

    /** Re-compute all results with the current active matrix */
    const refreshAll = (): void => {
        updateKeyRates(container, activeMatrix);
        updateCustomConverter(container, activeMatrix);
    };

    // Tab switching changes which matrix is active
    for (const tab of container.querySelectorAll<HTMLButtonElement>('.matrix-tab')) {
        tab.addEventListener('click', () => {
            for (const element of container.querySelectorAll('.matrix-tab')) {
                element.classList.remove('matrix-tab--active');
            }
            tab.classList.add('matrix-tab--active');
            activeMatrix = tab.dataset.tab === 'sell' ? sellMatrix : buyMatrix;
            refreshAll();
        });
    }

    // Custom converter inputs
    const customInputs = [
        container.querySelector<HTMLSelectElement>('#converter-from-select'),
        container.querySelector<HTMLSelectElement>('#converter-to-select'),
        container.querySelector<HTMLInputElement>('#converter-from-amount'),
    ];
    for (const element of customInputs) {
        element?.addEventListener('input', () => {
            updateCustomConverter(container, activeMatrix);
        });
        // Also handle 'change' for <select> elements
        element?.addEventListener('change', () => {
            updateCustomConverter(container, activeMatrix);
        });
    }

    // Swap button
    container.querySelector('#converter-swap')?.addEventListener('click', () => {
        const fromSelect = container.querySelector<HTMLSelectElement>('#converter-from-select');
        const toSelect = container.querySelector<HTMLSelectElement>('#converter-to-select');
        if (fromSelect && toSelect) {
            const temporary = fromSelect.value;
            fromSelect.value = toSelect.value;
            toSelect.value = temporary;
            updateCustomConverter(container, activeMatrix);
        }
    });

    // Close button
    container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', () => {
        getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close();
    });
}
