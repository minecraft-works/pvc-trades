/**
 * Trade Details Dialog
 * 
 * Displays detailed information about a trade's cost and result items,
 * including enchantments and lore.
 * 
 * @module dialogs/trade-details
 */

import { html, nothing, type TemplateResult } from 'lit-html';

import { formatName } from '../formatting.js';
import { cleanLoreLine, isCosmeticEnchant } from '../item-facts.js';
import { replaceContent } from '../rendering/render.js';
import type { Item,Trade } from '../types.js';
import { parseShulkerContents } from '../valuation/item-identity.js';
import { setupDialogBackdropClose } from './dialog-utilities.js';

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format enchantment name for display (e.g., "minecraft:fire_aspect" -> "Fire aspect")
 * @param name - Raw enchantment identifier, with or without the `minecraft:` prefix
 * @returns Human-readable enchantment name with spaces and capitalised first letter
 */
function formatEnchantmentName(name: string): string {
    const plain = name.replace('minecraft:', '');
    return plain.charAt(0).toUpperCase() + plain.slice(1).replaceAll('_', ' ');
}

/**
 * Group identical lore lines (shulker boxes list one line per stack)
 * @param lore - Raw lore lines
 * @returns Unique plain-text lines (colour codes and bullets removed, blank lines dropped)
 *          with how often each occurs, in first-seen order
 */
function groupLoreLines(lore: readonly string[]): { line: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const raw of lore) {
        const line = cleanLoreLine(raw);
        if (line) { counts.set(line, (counts.get(line) ?? 0) + 1); }
    }
    return [...counts].map(([line, count]) => ({ line, count }));
}

/**
 * Lore lines, identical lines grouped with a count
 * @param lore - Raw lore lines
 * @returns Template for the lore block, or nothing without lore
 */
function renderLore(lore: readonly string[] | undefined): TemplateResult | typeof nothing {
    if (!lore || lore.length === 0) { return nothing; }
    const lines = groupLoreLines(lore).map(({ line, count }) => {
        const repeat = count > 1 ? html` <span class="trade-detail-lore-count">×${count}</span>` : nothing;
        return html`<span class="trade-detail-lore-line">${line}${repeat}</span>`;
    });
    return html`<div class="trade-detail-lore">${lines}</div>`;
}

/**
 * One enchantment with its level; one that only makes the item glow says so
 * @param item - Item carrying the enchantment
 * @param name - Raw enchantment identifier
 * @param level - Enchantment level
 * @returns Template for the enchantment line
 */
function renderEnchant(item: Readonly<Item>, name: string, level: number): TemplateResult {
    if (isCosmeticEnchant(item.type, name)) {
        return html`<span class="trade-detail-enchant" title="${formatEnchantmentName(name)} ${level}: only makes the item glow">Glint effect</span>`;
    }
    return html`<span class="trade-detail-enchant">${formatEnchantmentName(name)} ${level}</span>`;
}

/**
 * Enchantments with their levels
 * @param item - Item whose enchantments to render
 * @returns Template for the enchantments block, or nothing without enchantments
 */
function renderEnchants(item: Readonly<Item>): TemplateResult | typeof nothing {
    const entries = item.enchant ? Object.entries(item.enchant) : [];
    if (entries.length === 0) { return nothing; }
    return html`<div class="trade-detail-enchants">${entries.map(([name, level]) => renderEnchant(item, name, level))}</div>`;
}

/**
 * Render item details for the trade details dialog
 * @param item - The item to render details for
 * @returns Template with item name, contents summary, lore lines, and enchantments
 */
function renderItemDetails(item: Item): TemplateResult {
    const contents = item.type.toUpperCase().includes('SHULKER_BOX') && item.lore ? parseShulkerContents(item.lore).items : [];
    const summary = contents.map(content => `${content.total * item.amount}× ${content.name}`).join(', ');
    const contentsBlock = contents.length > 0 ? html`<div class="trade-detail-contents">Contains ${summary}</div>` : nothing;

    return html`
        <div class="trade-detail-item">
            <div class="trade-detail-name">${formatName(item)}</div>
            ${contentsBlock}${renderLore(item.lore)}${renderEnchants(item)}
        </div>
    `;
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

        titleElement.textContent = 'Item Details';

        const items = isResult ? [trade.resultItem] : [trade.item1, ...(trade.item2 ? [trade.item2] : [])];
        replaceContent(contentElement, html`${items.map(item => renderItemDetails(item))}`);

        // Set up close button
        const closeButton = dialog.querySelector('#close-trade-details');
        closeButton?.addEventListener('click', () => dialog.close(), { once: true });

        // Set up backdrop close
        setupDialogBackdropClose(dialog);

        dialog.showModal();
    };
}
