/**
 * Name Formatting Utilities
 *
 * Extracted as a leaf module to prevent circular dependencies.
 * These functions depend only on `types.ts`.
 *
 * @module formatting
 */

import type { Item } from './types.js';

/**
 * Format an item's display name from its type or name field.
 * Replaces underscores with spaces and applies title case (first letter
 * uppercase, rest lowercase).
 *
 * @param item - The item to format
 * @returns Formatted display string
 *
 * @example
 * formatName({ type: 'DIAMOND_PICKAXE', name: '', amount: 1 }) // 'Diamond pickaxe'
 * formatName({ type: 'ITEM', name: 'Vote Diamond', amount: 1 }) // 'Vote diamond'
 */
export function formatName(item: Readonly<Item>): string {
    const text = item.name || item.type.replaceAll('_', ' ');
    if (!text) { return ''; }
    const lower = text.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}
