/**
 * Lenses: built-in item categories ("Redstone", "Food", …) that narrow one
 * side of a trade to a theme. A lens matches on the vanilla item ID, so
 * renamed items still count; a filled shulker box counts by its contents.
 * An item can sit in several lenses (elytra: Gear and Collectibles &
 * Rarities). The server's own currencies (certificates, coins) are the
 * exception: they match on name and sit in Server Currency only.
 *
 * See ADR-023.
 *
 * @module search/lenses
 */

import type { Item, Trade } from '../types.js';
import { isFilledShulker, isNamedBundle, parseShulkerContents } from '../valuation/item-identity.js';

/** Identifier of a built-in lens, also used in the URL */
export type LensId =
    | 'mapart'
    | 'flowers'
    | 'food'
    | 'redstone'
    | 'gear'
    | 'enchanting'
    | 'potions'
    | 'currency'
    | 'claims'
    | 'ores'
    | 'music'
    | 'collectibles';

/** A built-in item category */
export interface Lens {
    readonly id: LensId;
    readonly label: string;
}

/** Which item IDs belong to a lens */
interface LensRule {
    readonly ids?: readonly string[];
    readonly prefixes?: readonly string[];
    readonly suffixes?: readonly string[];
    /** IDs the prefixes and suffixes would catch but that belong elsewhere */
    readonly excludes?: readonly string[];
    /**
     * Bundles the seller named. The data never lists a bundle's contents, but
     * a named bundle is a map art set in practically every case (ADR-023)
     */
    readonly namedBundles?: boolean;
    /** The server's own currencies, recognised by item type and name */
    readonly serverCurrency?: boolean;
}

/** Display order of the lenses in the menu */
export const LENSES: readonly Lens[] = [
    { id: 'mapart', label: 'Map Art' },
    { id: 'flowers', label: 'Flowers' },
    { id: 'food', label: 'Food' },
    { id: 'redstone', label: 'Redstone' },
    { id: 'gear', label: 'Gear' },
    { id: 'enchanting', label: 'Enchanting' },
    { id: 'potions', label: 'Potions' },
    { id: 'currency', label: 'Server Currency' },
    { id: 'claims', label: 'Claim Blocks' },
    { id: 'ores', label: 'Ores & Minerals' },
    { id: 'music', label: 'Music & Discs' },
    { id: 'collectibles', label: 'Collectibles & Rarities' },
];

/** Earlier lens IDs, so shared links keep working */
const LENS_ALIASES: Readonly<Record<string, LensId>> = {
    armor: 'gear',
    weapons: 'gear',
    tools: 'gear',
    books: 'enchanting',
};

/** Placing one of these ores claims land on this server */
const CLAIM_ORES: readonly string[] = ['coal_ore', 'lapis_ore', 'redstone_ore', 'diamond_ore', 'nether_gold_ore'];

/**
 * Items the server (or its long-standing institutions) issues as currency:
 * vanilla items with a fixed name. The pattern is tested against the name
 * without colour codes, in lowercase.
 */
const SERVER_CURRENCIES: readonly { readonly type: string; readonly name: RegExp }[] = [
    { type: 'book', name: /playtime certificate|inactivity certificate/ },
    { type: 'paper', name: /inactivity ticket|bank-?o['’]?-?note/ },
    { type: 'diamond', name: /votes? (?:certificate|diamond)/ },
    { type: 'diamond_block', name: /big fat diamond/ },
    { type: 'emerald', name: /(?:super|hyper|uber)-?emerald|sponsor token/ },
    { type: 'amethyst_shard', name: /caddozzo/ },
    { type: 'end_crystal', name: /bb coin/ },
    { type: 'light', name: /^lux$/ },
    { type: 'magma_cream', name: /gcu coin/ },
    { type: 'heart_of_the_sea', name: /llamacoin/ },
    { type: 'charcoal', name: /nepero|quarry extractor fuel/ },
    { type: 'sunflower', name: /coin$/ },
    { type: 'golden_apple', name: /notch apple/ },
    { type: 'apple', name: /youtuber's apple/ },
    { type: 'feather', name: /writer's quill/ },
];

const LENS_RULES: Readonly<Record<LensId, LensRule>> = {
    // Single maps, and sets as named bundles; blank maps are a supply, not art
    mapart: {
        ids: ['filled_map'],
        namedBundles: true,
    },
    flowers: {
        ids: [
            'dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip',
            'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'wither_rose', 'torchflower', 'pitcher_plant', 'sunflower', 'lilac',
            'rose_bush', 'peony', 'spore_blossom', 'pink_petals', 'wildflowers', 'open_eyeblossom', 'closed_eyeblossom',
            'cactus_flower', 'flowering_azalea', 'chorus_flower',
        ],
    },
    food: {
        ids: [
            'beef', 'chicken', 'mutton', 'porkchop', 'rabbit', 'cod', 'salmon', 'pufferfish', 'tropical_fish', 'bread', 'cake',
            'cookie', 'pumpkin_pie', 'golden_carrot', 'golden_apple', 'enchanted_golden_apple', 'apple', 'carrot', 'potato',
            'baked_potato', 'poisonous_potato', 'beetroot', 'melon_slice', 'dried_kelp', 'sweet_berries', 'glow_berries',
            'chorus_fruit', 'honey_bottle', 'milk_bucket',
        ],
        prefixes: ['cooked_'],
        suffixes: ['_stew', '_soup'],
    },
    redstone: {
        ids: [
            'redstone', 'redstone_block', 'redstone_torch', 'redstone_lamp', 'repeater', 'comparator', 'piston', 'sticky_piston',
            'observer', 'hopper', 'dropper', 'dispenser', 'lever', 'tripwire_hook', 'daylight_detector', 'target', 'note_block',
            'tnt', 'sculk_sensor', 'calibrated_sculk_sensor', 'crafter', 'lectern', 'trapped_chest', 'lightning_rod',
            'slime_block', 'honey_block', 'rail', 'powered_rail', 'detector_rail', 'activator_rail',
        ],
        suffixes: ['_button', '_pressure_plate', '_door', '_trapdoor', 'copper_bulb'],
    },
    // Armor, weapons and tools; armor trims are cosmetic and only in Collectibles
    gear: {
        ids: [
            'wolf_armor', 'shield', 'elytra', 'netherite_upgrade_smithing_template',
            'bow', 'crossbow', 'arrow', 'spectral_arrow', 'tipped_arrow', 'trident', 'mace', 'wind_charge', 'firework_rocket',
            'fishing_rod', 'shears', 'brush', 'spyglass', 'compass', 'recovery_compass', 'clock', 'flint_and_steel',
            'lead', 'name_tag', 'bucket', 'water_bucket', 'lava_bucket', 'carrot_on_a_stick', 'warped_fungus_on_a_stick',
        ],
        suffixes: [
            '_helmet', '_chestplate', '_leggings', '_boots', '_horse_armor', '_nautilus_armor',
            '_sword', '_spear', '_pickaxe', '_axe', '_shovel', '_hoe',
        ],
    },
    enchanting: {
        ids: [
            'enchanted_book', 'experience_bottle', 'enchanting_table', 'bookshelf', 'chiseled_bookshelf', 'book',
            'anvil', 'chipped_anvil', 'damaged_anvil', 'grindstone',
        ],
    },
    // Ready potions; brewing ingredients are reachable by typing
    potions: {
        ids: ['potion', 'splash_potion', 'lingering_potion', 'tipped_arrow', 'ominous_bottle'],
    },
    currency: {
        serverCurrency: true,
    },
    claims: {
        ids: CLAIM_ORES,
    },
    // Diamonds and emeralds are the everyday money: almost every trade would match
    ores: {
        ids: [
            'coal', 'charcoal', 'lapis_lazuli', 'amethyst_shard', 'amethyst_block', 'quartz',
            'netherite_scrap', 'ancient_debris', 'echo_shard', 'redstone', 'glowstone_dust', 'flint',
            'coal_block', 'lapis_block', 'gold_block', 'iron_block', 'copper_block',
            'netherite_block', 'redstone_block', 'quartz_block',
        ],
        prefixes: ['raw_'],
        suffixes: ['_ore', '_ingot', '_nugget'],
        excludes: CLAIM_ORES,
    },
    music: {
        ids: ['jukebox', 'note_block', 'goat_horn', 'disc_fragment_5'],
        prefixes: ['music_disc_'],
    },
    collectibles: {
        ids: [
            'decorated_pot', 'sniffer_egg', 'trial_key', 'ominous_trial_key', 'heavy_core', 'dragon_egg', 'spawner',
            'written_book', 'totem_of_undying', 'nether_star', 'beacon', 'conduit', 'heart_of_the_sea',
            'enchanted_golden_apple', 'elytra', 'echo_shard', 'light', 'creaking_heart',
        ],
        suffixes: ['_pottery_sherd', '_banner_pattern', '_smithing_template', '_head', '_skull', '_spawn_egg'],
    },
};

const RULE_IDS: ReadonlyMap<LensId, ReadonlySet<string>> = new Map(
    LENSES.map(lens => [lens.id, new Set(LENS_RULES[lens.id].ids)])
);

/**
 * Normalize an item ID or shulker content key: "minecraft:HOPPER" and
 * "Redstone torch" become "hopper" and "redstone_torch".
 * @param type - Item type or content key
 * @returns Lowercase vanilla ID without namespace
 */
function normalizeItemId(type: string): string {
    return type.trim().replace(/^minecraft:/i, '').toLowerCase().replaceAll(/\s+/g, '_');
}

/**
 * Normalize a display name or content key for the currency patterns:
 * "§a§oBank§e§o-§a§oO'§e§o-§a§oNote" becomes "bank-o'-note".
 * @param name - Item name or shulker content key
 * @returns Lowercase name without colour codes
 */
function normalizeName(name: string): string {
    return name.replaceAll(/§./g, '').replaceAll('_', ' ').trim().toLowerCase();
}

/**
 * Whether a name is one of the server's currencies. Used for shulker
 * contents, whose key is the name for a named item and carries no type.
 * @param name - Content key or display name
 * @returns True for a server currency name
 */
function isCurrencyName(name: string): boolean {
    const normalized = normalizeName(name);
    return normalized !== '' && SERVER_CURRENCIES.some(currency => currency.name.test(normalized));
}

const serverCurrencyCache = new WeakMap<Readonly<Item>, boolean>();

/**
 * Whether an item stack is one of the server's currencies: the right
 * vanilla type with the right name.
 * @param item - Item stack
 * @returns True for a server currency
 */
function isServerCurrency(item: Readonly<Item>): boolean {
    const cached = serverCurrencyCache.get(item);
    if (cached !== undefined) { return cached; }
    const name = normalizeName(item.name);
    const type = normalizeItemId(item.type);
    const found = name !== '' && SERVER_CURRENCIES.some(currency => currency.type === type && currency.name.test(name));
    serverCurrencyCache.set(item, found);
    return found;
}

/**
 * Find a lens by its ID. Earlier IDs (armor, weapons, tools, books) still
 * resolve, to the lens that took them over.
 * @param id - Lens ID, e.g. from the URL
 * @returns The lens, or undefined for an unknown ID
 */
export function findLens(id: string | undefined): Lens | undefined {
    if (id === undefined) { return undefined; }
    const key = id.trim().toLowerCase();
    const target = LENS_ALIASES[key] ?? key;
    return LENSES.find(lens => lens.id === target);
}

/**
 * Whether an item type belongs to a lens. For Server Currency the "type" is
 * a name: only shulker contents carry no item type to check.
 * @param lens - Lens to check
 * @param type - Vanilla item ID in any case, e.g. "HOPPER", or a content key
 * @returns True if the item is in the lens
 *
 * @example
 * isItemInLens(findLens('redstone')!, 'HOPPER')       // true
 * isItemInLens(findLens('gear')!, 'DIAMOND_PICKAXE')  // true
 */
export function isItemInLens(lens: Lens, type: string): boolean {
    const rule = LENS_RULES[lens.id];
    if (rule.serverCurrency === true) { return isCurrencyName(type); }
    const id = normalizeItemId(type);
    if (rule.excludes?.includes(id) === true) { return false; }
    if (RULE_IDS.get(lens.id)?.has(id)) { return true; }
    return (rule.prefixes ?? []).some(prefix => id.startsWith(prefix))
        || (rule.suffixes ?? []).some(suffix => id.endsWith(suffix));
}

const stackTypesCache = new WeakMap<Readonly<Item>, readonly string[]>();

/**
 * Item types an item stack stands for: a filled shulker box stands for its
 * contents, any other stack for its own type.
 * @param item - Item stack
 * @returns Item types (content keys for a shulker box)
 */
function getStackTypes(item: Readonly<Item>): readonly string[] {
    const cached = stackTypesCache.get(item);
    if (cached) { return cached; }
    const types = isFilledShulker(item)
        ? parseShulkerContents(item.lore ?? []).items.map(content => content.key)
        : [item.type];
    stackTypesCache.set(item, types);
    return types;
}

/**
 * Whether an item stack is in a lens: by its type (a filled shulker box by
 * its contents), or as a named bundle for a lens that takes those. A server
 * currency is in Server Currency only, not in the lens of its vanilla type
 * (a Vote Certificate is a diamond, Lux a light block).
 * @param item - Item stack
 * @param lens - Lens to check
 * @returns True if the stack is in the lens
 */
function isStackInLens(item: Readonly<Item>, lens: Lens): boolean {
    const rule = LENS_RULES[lens.id];
    if (isServerCurrency(item)) { return rule.serverCurrency === true; }
    if (rule.namedBundles === true && isNamedBundle(item)) { return true; }
    return getStackTypes(item).some(type => isItemInLens(lens, type));
}

/**
 * Whether a trade gives you something from a lens (the Buying side).
 * A filled shulker box counts if any of its contents is in the lens.
 * @param trade - Trade to check
 * @param lens - Lens to check
 * @returns True if the received item is in the lens
 */
export function receivesFromLens(trade: Readonly<Pick<Trade, 'resultItem' | 'shulkerItems'>>, lens: Lens): boolean {
    if (!trade.shulkerItems) { return isStackInLens(trade.resultItem, lens); }
    return trade.shulkerItems.some(content => isItemInLens(lens, content.key));
}

/**
 * Whether a trade asks for something from a lens (the Paying side).
 * A filled shulker box counts if any of its contents is in the lens.
 * @param trade - Trade to check
 * @param lens - Lens to check
 * @returns True if either cost item is in the lens
 */
export function paysWithLens(trade: Readonly<Pick<Trade, 'item1' | 'item2'>>, lens: Lens): boolean {
    return [trade.item1, trade.item2].some(item => item !== undefined && isStackInLens(item, lens));
}
