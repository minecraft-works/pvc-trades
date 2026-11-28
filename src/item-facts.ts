/**
 * Item Facts
 *
 * Reads what the server's custom items say about themselves in their lore:
 * the area a protection block covers and the world it works in. Also cleans
 * lore for display and recognises enchantments that only make an item glow.
 *
 * @module item-facts
 */

import type { Item } from './types.js';

/** What an item's lore says that is worth showing in the list */
export interface ItemFacts {
    /** Area covered, e.g. `32x32` or `Chunk` */
    readonly size: string | undefined;
    /** Where the item does not work, e.g. `Nether only` */
    readonly restriction: string | undefined;
    /** Lowercase text the search matches against */
    readonly searchText: string;
}

const NO_FACTS: ItemFacts = { size: undefined, restriction: undefined, searchText: '' };

const FORMAT_CODE: Readonly<RegExp> = /§[\da-fk-orx]/gi;
const LEADING_BULLET: Readonly<RegExp> = /^\s*•\s*/;
const AREA_PATTERN: Readonly<RegExp> = /protects?\s+(?<width>\d+)\s*x\s*(?<depth>\d+)/i;
const CHUNK_PATTERN: Readonly<RegExp> = /protects?\s+an\s+entire\s+(?:world\s+)?chunk/i;
const NETHER_ONLY_PATTERN: Readonly<RegExp> = /does\s+not\s+work\s+in\s+the\s+overworld/i;

/**
 * Lore line without Minecraft colour codes (`§6`) and the leading bullet
 *
 * @param line - Raw lore line
 * @returns Plain text
 *
 * @example
 * cleanLoreLine('§7• §6Will protect 32x32 blocks.') // 'Will protect 32x32 blocks.'
 */
export function cleanLoreLine(line: string): string {
    return line.replaceAll(FORMAT_CODE, '').replace(LEADING_BULLET, '').trim();
}

function getProtectedArea(text: string): string | undefined {
    const area = AREA_PATTERN.exec(text)?.groups;
    if (area?.width && area.depth) { return `${area.width}x${area.depth}`; }
    return CHUNK_PATTERN.test(text) ? 'Chunk' : undefined;
}

/**
 * Size and world restriction stated in an item's lore. Shulker boxes are
 * skipped: their lore lists contents.
 *
 * @param item - Item stack
 * @returns Size, restriction and search text; empty for items without such facts
 *
 * @example
 * getItemFacts({ type: 'COAL_ORE', name: 'Standard Protection Block', amount: 1, lore: ['§6Will protect 32x32 blocks.'] })
 * // { size: '32x32', restriction: undefined, searchText: '32x32' }
 */
export function getItemFacts(item: Readonly<Item>): ItemFacts {
    if (!item.lore || item.lore.length === 0 || item.type.toUpperCase().includes('SHULKER_BOX')) { return NO_FACTS; }
    const text = cleanLoreLine(item.lore.join(' '));

    const size = getProtectedArea(text);
    const restriction = NETHER_ONLY_PATTERN.test(text) ? 'Nether only' : undefined;
    if (size === undefined && restriction === undefined) { return NO_FACTS; }

    return { size, restriction, searchText: [size, restriction].filter(fact => fact !== undefined).join(' ').toLowerCase() };
}

/**
 * A name without the size it starts with, for showing next to a badge that
 * already says that size.
 *
 * @param name - Display name
 * @param size - Size from the item's facts, if any
 * @returns The name without its leading size, or the name itself
 *
 * @example
 * withoutLeadingSize('16x16 protection block', '16x16') // 'protection block'
 * withoutLeadingSize('Standard protection block', '32x32') // 'Standard protection block'
 */
export function withoutLeadingSize(name: string, size: string | undefined): string {
    if (size === undefined || !name.toLowerCase().startsWith(size.toLowerCase())) { return name; }
    const rest = name.slice(size.length);
    return /^\s/.test(rest) && rest.trim() ? rest.trim() : name;
}

/**
 * Whether an enchantment is only there to make the item glow, like Lure on a
 * protection block. Lure on a fishing rod is real.
 *
 * @param type - Item type
 * @param enchantment - Enchantment identifier, with or without `minecraft:`
 * @returns True for a cosmetic glint
 *
 * @example
 * isCosmeticEnchant('COAL_ORE', 'minecraft:lure')     // true
 * isCosmeticEnchant('FISHING_ROD', 'minecraft:lure')  // false
 */
export function isCosmeticEnchant(type: string, enchantment: string): boolean {
    const normalizedType = type.replace('minecraft:', '').toUpperCase();
    return enchantment.replace('minecraft:', '') === 'lure' && normalizedType !== 'FISHING_ROD';
}
