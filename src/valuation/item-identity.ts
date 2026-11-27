/**
 * Item Identity for Valuation
 *
 * Decides which items can share a market price. Enchanted variants get their
 * own price key, shulker boxes are valued by their contents, and items whose
 * variant is missing from the shop data (potion effect, book contents, stored
 * enchantments) cannot be priced at all.
 *
 * @module valuation/item-identity
 */

import { formatName } from '../formatting.js';
import type { Item, ShulkerItem, ShulkerParseResult, Trade, TradeInput } from '../types.js';

/**
 * Item types whose variant is not present in the shop data. Without a custom
 * name or enchantments, two stacks of these can be completely different items.
 */
const UNIDENTIFIABLE_TYPES: ReadonlySet<string> = new Set([
    'POTION',
    'SPLASH_POTION',
    'LINGERING_POTION',
    'TIPPED_ARROW',
    'WRITTEN_BOOK',
    'ENCHANTED_BOOK',
    'SUSPICIOUS_STEW',
    'FILLED_MAP',
    'GOAT_HORN',
    'TROPICAL_FISH_BUCKET',
    'AXOLOTL_BUCKET',
]);

/** One priced component of an item stack */
export interface ItemComponent {
    /** Valuation name (display name plus enchantment signature) */
    readonly name: string;
    /** Number of units of this component */
    readonly amount: number;
}

function normalizeType(type: string): string {
    return type.replace('minecraft:', '').toUpperCase();
}

/**
 * Whether an item is a shulker box with listed contents
 * @param item - Item stack
 * @returns True for a filled shulker box
 */
export function isFilledShulker(item: Readonly<Item>): boolean {
    return normalizeType(item.type).includes('SHULKER_BOX') && (item.lore?.length ?? 0) > 0;
}

function enchantSignature(item: Readonly<Item>): string {
    const entries = Object.entries(item.enchant ?? {}).filter(([, level]) => typeof level === 'number');
    if (entries.length === 0) { return ''; }
    const parts = entries
        .map(([key, level]) => `${key.replace('minecraft:', '').replaceAll('_', ' ').toLowerCase()} ${level}`)
        .toSorted((a, b) => a.localeCompare(b));
    return ` [${parts.join(', ')}]`;
}

/**
 * Parse shulker box lore to extract contained items and quantities.
 *
 * @param lore - Array of lore lines from shulker box item
 * @returns Parsed result with items array and default display values
 *
 * @example
 * parseShulkerContents(['- 64x DIAMOND', '- 32x GOLD_INGOT'])
 * // { items: [{key: 'diamond', name: 'Diamond', total: 64}, ...], defaultName: 'Diamond', defaultTotal: 64 }
 */
export function parseShulkerContents(lore: readonly string[]): Readonly<ShulkerParseResult> {
    const counts: Record<string, number> = {};
    const shulkerRegex = /-\s*(?<quantity>\d+)x\s+(?<item>.+)/i;
    for (const line of lore) {
        const match = shulkerRegex.exec(line);
        if (match?.groups?.quantity && match.groups.item) {
            const amt = Number.parseInt(match.groups.quantity, 10);
            const item = match.groups.item.trim();
            counts[item] = (counts[item] ?? 0) + amt;
        }
    }

    const items: ShulkerItem[] = Object.entries(counts).map(([key, total]) => {
        const formatted = key.replaceAll('_', ' ').toLowerCase();
        return {
            key: key.toLowerCase(),
            name: formatted.charAt(0).toUpperCase() + formatted.slice(1),
            total
        };
    });

    items.sort((a, b) => b.total - a.total);

    const firstItem = items[0];
    if (!firstItem) { return { items: [], defaultName: 'Shulker box', defaultTotal: 1 }; }
    return { items, defaultName: firstItem.name, defaultTotal: firstItem.total };
}

/**
 * Describe an item stack for display: a filled shulker box with one kind of
 * content shows as that content ("1728 Cobblestone"); a mixed shulker lists
 * its contents; anything else uses the item's own name and amount.
 *
 * @param item - Item stack
 * @returns Display amount and name
 *
 * @example
 * describeItemStack({ type: 'SHULKER_BOX', name: '', amount: 1, lore: ['- 64x SAND'] }) // { amount: 64, name: 'Sand' }
 */
export function describeItemStack(item: Readonly<Item>): { readonly amount: number; readonly name: string } {
    if (!isFilledShulker(item)) { return { amount: item.amount, name: formatName(item) }; }
    const contents = parseShulkerContents(item.lore ?? []).items;
    const label = getShulkerLabel(item);
    const labelSuffix = label ? ` “${label}”` : '';
    const [only] = contents;
    if (contents.length === 1 && only) { return { amount: only.total * item.amount, name: `${only.name}${labelSuffix}` }; }
    const boxName = formatName({ ...item, name: '' });
    return { amount: item.amount, name: `${boxName}${labelSuffix} (${contents.map(content => content.name).join(', ')})` };
}

/**
 * The name a seller gave a filled shulker box, e.g. "mending" on a box of
 * enchanted books. Names that only repeat the box type or its contents are
 * skipped.
 *
 * @param item - Item stack
 * @returns The seller's name, or undefined
 *
 * @example
 * getShulkerLabel({ type: 'SHULKER_BOX', name: 'mending', amount: 1, lore: ['- 1x ENCHANTED_BOOK'] }) // 'mending'
 * getShulkerLabel({ type: 'SHULKER_BOX', name: 'Sand', amount: 1, lore: ['- 64x SAND'] })             // undefined
 */
export function getShulkerLabel(item: Readonly<Item>): string | undefined {
    const label = item.name.trim();
    if (!label || !isFilledShulker(item)) { return undefined; }
    const lower = label.toLowerCase();
    const contents = parseShulkerContents(item.lore ?? []).items;
    const isRedundant = lower === formatName({ ...item, name: '' }).toLowerCase()
        || contents.some(content => content.name.toLowerCase() === lower);
    return isRedundant ? undefined : label;
}

/**
 * Names an item stack can be found by: its own name plus any shulker contents.
 *
 * @param item - Item stack
 * @returns Display names (any case)
 */
export function getItemStackNames(item: Readonly<Item>): readonly string[] {
    const contents = isFilledShulker(item) ? parseShulkerContents(item.lore ?? []).items.map(content => content.name) : [];
    return [formatName(item), ...contents];
}

/**
 * Get the name an item is priced under, or undefined if it cannot be priced.
 *
 * @param item - Item to identify
 * @returns Valuation name, e.g. "Diamond pickaxe [efficiency 5, unbreaking 3]"
 *
 * @example
 * getValuationName({ type: 'DIAMOND', name: '', amount: 1 })            // 'Diamond'
 * getValuationName({ type: 'POTION', name: '', amount: 1 })             // undefined
 * getValuationName({ type: 'IRON_SWORD', name: '', amount: 1, enchant: { sharpness: 2 } }) // 'Iron sword [sharpness 2]'
 */
export function getValuationName(item: Readonly<Item>): string | undefined {
    const signature = enchantSignature(item);
    if (UNIDENTIFIABLE_TYPES.has(normalizeType(item.type)) && !signature && !item.name) {
        return undefined;
    }
    return formatName(item) + signature;
}

/**
 * Break an item stack into priced components. A filled shulker box becomes its
 * contents (multiplied by the number of boxes).
 *
 * @param item - Item stack to break down
 * @returns Components, or undefined if any part cannot be priced
 *
 * @example
 * getItemComponents({ type: 'SHULKER_BOX', name: '', amount: 1, lore: ['- 64x SAND'] })
 * // [{ name: 'Sand', amount: 64 }]
 */
export function getItemComponents(item: Readonly<Item>): readonly ItemComponent[] | undefined {
    if (isFilledShulker(item)) {
        const contents = parseShulkerContents(item.lore ?? []).items;
        if (contents.length === 0) { return undefined; }
        return contents.map(content => ({ name: content.name, amount: content.total * item.amount }));
    }
    const name = getValuationName(item);
    return name === undefined ? undefined : [{ name, amount: item.amount }];
}

/**
 * Value an item stack in emeralds by summing the value of its components.
 *
 * @param item - Item stack to value
 * @param getValue - Looks up the per-unit value of a valuation name
 * @returns Total value, or undefined if any component has no trusted value
 */
export function valueItemStack(
    item: Readonly<Item>,
    getValue: (name: string) => number | undefined
): number | undefined {
    const components = getItemComponents(item);
    if (!components) { return undefined; }
    let total = 0;
    for (const component of components) {
        const value = getValue(component.name);
        if (value === undefined) { return undefined; }
        total += value * component.amount;
    }
    return total;
}

function getSingleComponent(item: Readonly<Item>): ItemComponent | undefined {
    const components = getItemComponents(item);
    return components?.length === 1 ? components[0] : undefined;
}

/**
 * Build the key for a (result, cost) currency pair.
 *
 * @param resultName - Valuation name of the item received
 * @param costName - Valuation name of the item paid
 * @returns Case-insensitive pair key
 */
export function getPairKey(resultName: string, costName: string): string {
    return `${resultName.toLowerCase()}|${costName.toLowerCase()}`;
}

/**
 * Get a single-cost trade's price per result unit and the pair it belongs to.
 *
 * @param trade - Processed trade
 * @returns Pair names and per-unit price, or undefined for two-item costs,
 *          mixed shulker boxes, or unidentifiable items
 */
export function getPairPrice(trade: Readonly<Trade>): Readonly<{ resultName: string; costName: string; price: number }> | undefined {
    if (trade.item2) { return undefined; }
    const result = getSingleComponent(trade.resultItem);
    const cost = getSingleComponent(trade.item1);
    if (!result || !cost || result.amount <= 0) { return undefined; }
    return { resultName: result.name, costName: cost.name, price: cost.amount / result.amount };
}

/**
 * Convert a trade into item-value calculation input. Trades involving
 * unidentifiable items or mixed shulker boxes are skipped (undefined), since
 * they cannot be attributed to a single item price.
 *
 * @param trade - Processed trade
 * @returns Valuation input, or undefined if the trade cannot be used for pricing
 */
export function toValuationInput(trade: Readonly<Trade>): TradeInput | undefined {
    const result = getSingleComponent(trade.resultItem);
    const cost = getSingleComponent(trade.item1);
    if (!result || !cost) { return undefined; }

    let item2: Item | undefined;
    if (trade.item2) {
        const second = getSingleComponent(trade.item2);
        if (!second) { return undefined; }
        item2 = { type: second.name, name: second.name, amount: second.amount };
    }

    return {
        item2,
        resultName: result.name,
        resultAmount: result.amount,
        costName: cost.name,
        costAmount: cost.amount,
        item1Name: cost.name,
        x: trade.x,
        y: trade.y,
        z: trade.z,
    };
}
