/**
 * Price Table Dialog Module
 *
 * Renders a buy/sell price table for core currencies in emeralds.
 *
 * @module dialogs/matrix-dialog
 */

import { escapeHtml, buildPriceTable } from '../library.js';
import { SELECTORS, DIALOG_IDS } from '../constants.js';
import type { ItemValues, PriceTableEntry } from '../types.js';

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

const TABLE_HEADER_HTML = '<header><h2>Price Table</h2><button id="close-matrix" aria-label="Close">&times;</button></header>';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the icon HTML for an item, or escaped text if no icon exists
 */
function getItemIcon(name: string): string {
    const url = ITEM_ICONS[name];
    if (url) {
        return `<img src="${url}" alt="${escapeHtml(name)}" class="price-table-icon" title="${escapeHtml(name)}">`;
    }
    return escapeHtml(name);
}

/**
 * Format a price value for display
 */
function formatPrice(value: number | undefined, tradeCount: number): string {
    if (value === undefined) { return '<span class="price-na">—</span>'; }
    const rounded = Math.round(value * 100) / 100;
    const display = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
    return `${display}<span class="price-table-hint"> (${tradeCount})</span>`;
}

/**
 * Get the CSS class for a spread value
 */
function getSpreadClass(spread: number): string {
    if (spread <= 15) { return 'spread-low'; }
    if (spread <= 30) { return 'spread-medium'; }
    return 'spread-high';
}

/**
 * Format spread percentage for display
 */
function formatSpread(spread: number | undefined): string {
    if (spread === undefined) { return '<span class="price-na">—</span>'; }
    const cls = getSpreadClass(spread);
    return `<span class="${cls}">${Math.round(spread)}%</span>`;
}

/**
 * Build a single table row for a price table entry
 */
function buildPriceTableRow(entry: PriceTableEntry): string {
    let buyTitle = `${entry.buyTradeCount} trade(s)`;
    if (entry.buyPrice !== undefined) {
        buyTitle = `${entry.buyPrice.toFixed(4)} emeralds — ${buyTitle}`;
    }

    let sellTitle = `${entry.sellTradeCount} trade(s)`;
    if (entry.sellPrice !== undefined) {
        sellTitle = `${entry.sellPrice.toFixed(4)} emeralds — ${sellTitle}`;
    }

    return `<tr>
        <td>${getItemIcon(entry.name)}</td>
        <td title="${buyTitle}">${formatPrice(entry.buyPrice, entry.buyTradeCount)}</td>
        <td title="${sellTitle}">${formatPrice(entry.sellPrice, entry.sellTradeCount)}</td>
        <td>${formatSpread(entry.spread)}</td>
        <td>${entry.independentShopCount}</td>
    </tr>`;
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render the price table dialog
 *
 * @param container - Container element for the table
 * @param itemValues - The computed item values, or undefined if not available
 * @param getElement - Helper function to get elements by ID
 */
export function renderPriceTable(
    container: HTMLElement,
    itemValues: ItemValues | undefined,
    getElement: <T extends HTMLElement = HTMLElement>(id: string) => T
): void {
    if (!itemValues || itemValues.size === 0) {
        container.innerHTML = `${TABLE_HEADER_HTML}<p class="muted">No price data available</p>`;
        container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', () => {
            getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close();
        });
        return;
    }

    const entries = buildPriceTable(itemValues);

    let html = TABLE_HEADER_HTML;
    html += '<div class="price-table-wrapper"><table class="price-table"><thead><tr>';
    html += '<th>Currency</th><th>Buy</th><th>Sell</th><th>Spread</th><th>Shops</th>';
    html += '</tr></thead><tbody>';

    for (const entry of entries) {
        html += buildPriceTableRow(entry);
    }

    html += '</tbody></table>';
    html += '<p class="price-table-hint">Prices in emeralds. Trade counts in parentheses. Spread = (buy−sell)/buy.</p>';
    html += '</div>';
    container.innerHTML = html;

    container.querySelector(SELECTORS.CLOSE_MATRIX)?.addEventListener('click', () => {
        getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX).close();
    });
}
