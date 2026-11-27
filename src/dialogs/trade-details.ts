/**
 * Trade Details Dialog
 * 
 * Displays detailed information about a trade's cost and result items,
 * including enchantments and lore.
 * 
 * @module dialogs/trade-details
 */

import { formatName } from '../formatting.js';
import { escapeHtml } from '../library.js';
import type { Item,Trade } from '../types.js';
import { parseShulkerContents } from '../valuation/item-identity.js';
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
 * Group identical lore lines (shulker boxes list one line per stack)
 * @param lore - Raw lore lines
 * @returns Unique lines with how often each occurs, in first-seen order
 */
function groupLoreLines(lore: readonly string[]): { line: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const line of lore) { counts.set(line, (counts.get(line) ?? 0) + 1); }
    return [...counts].map(([line, count]) => ({ line, count }));
}

/**
 * Render item details HTML for the trade details dialog
 * @param item - The item to render details for
 * @returns HTML string with item name, contents summary, lore lines, and enchantments
 */
function renderItemDetails(item: Item): string {
    const name = formatName(item);

    let html = `
        <div class="trade-detail-item">
            <div class="trade-detail-name">${escapeHtml(name)}</div>
    `;

    const contents = item.type.toUpperCase().includes('SHULKER_BOX') && item.lore ? parseShulkerContents(item.lore).items : [];
    if (contents.length > 0) {
        const summary = contents.map(content => `${content.total * item.amount}× ${content.name}`).join(', ');
        html += `<div class="trade-detail-contents">Contains ${escapeHtml(summary)}</div>`;
    }

    if (item.lore && item.lore.length > 0) {
        html += '<div class="trade-detail-lore">';
        for (const { line, count } of groupLoreLines(item.lore)) {
            const repeat = count > 1 ? ` <span class="trade-detail-lore-count">×${count}</span>` : '';
            html += `<span class="trade-detail-lore-line">${escapeHtml(line)}${repeat}</span>`;
        }
        html += '</div>';
    }

    if (item.enchant && Object.keys(item.enchant).length > 0) {
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

        let html: string;

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
