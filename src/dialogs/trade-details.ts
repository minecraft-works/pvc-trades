/**
 * Trade Details Dialog
 * 
 * Displays detailed information about a trade's cost and result items,
 * including enchantments and lore.
 * 
 * @module dialogs/trade-details
 */

import { escapeHtml,formatName } from '../library.js';
import type { Item,Trade } from '../types.js';
import { setupDialogBackdropClose } from './dialog-utilities.js';

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format enchantment name for display (e.g., "sharpness" -> "Sharpness")
 * @param name - Raw enchantment identifier (e.g., "fire_aspect")
 * @returns Human-readable enchantment name with spaces and capitalised first letter
 */
function formatEnchantmentName(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1).replaceAll('_', ' ');
}

/**
 * Render item details HTML for the trade details dialog
 * @param item - The item to render details for
 * @returns HTML string with item name, lore lines, and enchantments
 */
function renderItemDetails(item: Item): string {
    const name = formatName(item);
    const hasLore = item.lore && item.lore.length > 0;
    const hasEnchants = item.enchant && Object.keys(item.enchant).length > 0;

    let html = `
        <div class="trade-detail-item">
            <div class="trade-detail-name">${escapeHtml(name)}</div>
    `;

    if (hasLore && item.lore) {
        html += '<div class="trade-detail-lore">';
        for (const line of item.lore) {
            html += `<span class="trade-detail-lore-line">${escapeHtml(line)}</span>`;
        }
        html += '</div>';
    }

    if (hasEnchants && item.enchant) {
        html += '<div class="trade-detail-enchants">';
        for (const [enchant, level] of Object.entries(item.enchant)) {
            html += `<span class="trade-detail-enchant">${escapeHtml(formatEnchantmentName(enchant))} ${level}</span>`;
        }
        html += '</div>';
    }

    html += '</div>';
    return html;
}

// ============================================================================
// Trade Details Popover
// ============================================================================

/**
 * Options for opening the trade details popover
 */
export interface TradeDetailsOptions {
    /** Function to look up a trade by its key */
    getTrade: (key: string) => Trade | undefined;
}

/**
 * Create a trade details popover handler
 * 
 * @param options - Configuration options
 * @returns Function to open the popover for a specific trade row
 */
export function createTradeDetailsHandler(options: TradeDetailsOptions): (row: HTMLElement, isResult: boolean) => void {
    const { getTrade } = options;

    return function openTradeDetailsPopover(row: HTMLElement, isResult: boolean): void {
        const tradeKey = row.dataset.tradeKey;
        if (!tradeKey) { return; }

        const trade = getTrade(tradeKey);
        if (!trade) { return; }

        const dialog = document.querySelector<HTMLDialogElement>('#trade-details-dialog');
        if (!dialog) { return; }

        const titleElement = dialog.querySelector('#trade-details-title');
        const contentElement = dialog.querySelector('#trade-details-content');
        if (!titleElement || !contentElement) { return; }

        let html = '';

        titleElement.textContent = 'Item Details';

        if (isResult) {
            html = renderItemDetails(trade.resultItem);
        } else {
            html = renderItemDetails(trade.item1);
            if (trade.item2) {
                html += renderItemDetails(trade.item2);
            }
        }

        contentElement.innerHTML = html;

        // Set up close button
        const closeButton = dialog.querySelector('#close-trade-details');
        closeButton?.addEventListener('click', () => dialog.close(), { once: true });

        // Set up backdrop close
        setupDialogBackdropClose(dialog);

        dialog.showModal();
    };
}
