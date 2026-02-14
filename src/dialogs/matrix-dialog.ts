/**
 * Exchange Rate Matrix Dialog Module
 *
 * Renders a tabbed NxN exchange rate matrix for core currencies.
 * Two tabs: Buy (ask prices) and Sell (bid prices).
 *
 * @module dialogs/matrix-dialog
 */

import { escapeHtml, buildExchangeMatrix } from '../library.js';
import { SELECTORS, DIALOG_IDS } from '../constants.js';
import type { ItemValues, ExchangeMatrix } from '../types.js';

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

const DIALOG_HEADER_HTML = '<header><h2>Exchange Rates</h2><button id="close-matrix" aria-label="Close">&times;</button></header>';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the icon HTML for an item, or escaped text if no icon exists
 */
function getItemIcon(name: string): string {
    const url = ITEM_ICONS[name];
    if (url) {
        return `<img src="${url}" alt="${escapeHtml(name)}" class="matrix-icon" title="${escapeHtml(name)}">`;
    }
    return escapeHtml(name);
}

/**
 * Format a ratio value for display
 */
function formatRatio(value: number | undefined): string {
    if (value === undefined) { return '<span class="price-na">\u2014</span>'; }
    if (value === 1) { return '<span class="matrix-diagonal">\u2014</span>'; }
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
}

/**
 * Build the HTML table for an exchange matrix
 */
function buildMatrixTable(matrix: ExchangeMatrix): string {
    let html = '<table class="exchange-matrix"><thead><tr><th></th>';

    for (const label of matrix.labels) {
        html += `<th>${getItemIcon(label)}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const [rowIndex, label] of matrix.labels.entries()) {
        html += `<tr><th>${getItemIcon(label)}</th>`;
        const row = matrix.ratios[rowIndex];
        if (row) {
            for (const cell of row) {
                html += `<td>${formatRatio(cell)}</td>`;
            }
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render the exchange rate matrix dialog with Buy/Sell tabs
 *
 * @param container - Container element for the dialog content
 * @param itemValues - The computed item values, or undefined if not available
 * @param getElement - Helper function to get elements by ID
 */
export function renderExchangeMatrix(
    container: HTMLElement,
    itemValues: ItemValues | undefined,
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

    let html = DIALOG_HEADER_HTML;
    html += '<div class="matrix-tabs">';
    html += '<button class="matrix-tab matrix-tab--active" data-tab="buy">Buy</button>';
    html += '<button class="matrix-tab" data-tab="sell">Sell</button>';
    html += '</div>';
    html += `<div class="matrix-panel" data-panel="buy">${buildMatrixTable(buyMatrix)}</div>`;
    html += `<div class="matrix-panel matrix-panel--hidden" data-panel="sell">${buildMatrixTable(sellMatrix)}</div>`;
    html += '<p class="matrix-hint">Read as: 1 row = X columns. Derived from median trade prices.</p>';
    container.innerHTML = html;

    // Tab switching
    for (const tab of container.querySelectorAll<HTMLButtonElement>('.matrix-tab')) {
        tab.addEventListener('click', () => {
            for (const element of container.querySelectorAll('.matrix-tab')) {
                element.classList.remove('matrix-tab--active');
            }
            tab.classList.add('matrix-tab--active');
            const target = tab.dataset['tab'];
            for (const panel of container.querySelectorAll<HTMLElement>('.matrix-panel')) {
                panel.classList.toggle('matrix-panel--hidden', panel.dataset['panel'] !== target);
            }
        });
    }

    container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', () => {
        getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close();
    });
}
