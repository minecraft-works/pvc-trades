/**
 * Lenses: built-in item categories ("Redstone", "Food", …) that narrow one
 * side of a trade to a theme. A lens matches on the vanilla item ID, so
 * renamed items still count; a filled shulker box counts by its contents.
 * An item can sit in several lenses (elytra: Armor, Transportation,
 * Collectibles & Rarities).
 *
 * See ADR-023.
 *
 * @module search/lenses
 */

import type { Item, Trade } from '../types.js';
import { isFilledShulker, parseShulkerContents } from '../valuation/item-identity.js';

/** Identifier of a built-in lens, also used in the URL */
export type LensId =
    | 'armor'
    | 'weapons'
    | 'tools'
    | 'redstone'
    | 'flowers'
    | 'ores'
    | 'food'
    | 'potions'
    | 'books'
    | 'transport'
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
}

/** Display order of the lenses in the menu */
export const LENSES: readonly Lens[] = [
    { id: 'armor', label: 'Armor' },
    { id: 'weapons', label: 'Weapons' },
    { id: 'tools', label: 'Tools' },
    { id: 'redstone', label: 'Redstone' },
    { id: 'flowers', label: 'Flowers' },
    { id: 'ores', label: 'Ores & Minerals' },
    { id: 'food', label: 'Food' },
    { id: 'potions', label: 'Potions' },
    { id: 'books', label: 'Enchanted Books' },
    { id: 'transport', label: 'Transportation' },
    { id: 'music', label: 'Music & Discs' },
    { id: 'collectibles', label: 'Collectibles & Rarities' },
];

const RAILS: readonly string[] = ['rail', 'powered_rail', 'detector_rail', 'activator_rail'];

const LENS_RULES: Readonly<Record<LensId, LensRule>> = {
    armor: {
        ids: ['wolf_armor', 'shield', 'elytra'],
        suffixes: ['_helmet', '_chestplate', '_leggings', '_boots', '_horse_armor', '_nautilus_armor', '_smithing_template'],
    },
    weapons: {
        ids: ['bow', 'crossbow', 'arrow', 'spectral_arrow', 'tipped_arrow', 'trident', 'mace', 'wind_charge', 'firework_rocket', 'end_crystal', 'tnt'],
        suffixes: ['_sword', '_spear'],
    },
    tools: {
        ids: [
            'fishing_rod', 'shears', 'brush', 'spyglass', 'compass', 'recovery_compass', 'clock', 'flint_and_steel',
            'lead', 'name_tag', 'map', 'filled_map', 'bucket', 'water_bucket', 'lava_bucket',
            'carrot_on_a_stick', 'warped_fungus_on_a_stick',
        ],
        suffixes: ['_pickaxe', '_axe', '_shovel', '_hoe'],
    },
    redstone: {
        ids: [
            'redstone', 'redstone_block', 'redstone_torch', 'redstone_lamp', 'repeater', 'comparator', 'piston', 'sticky_piston',
            'observer', 'hopper', 'dropper', 'dispenser', 'lever', 'tripwire_hook', 'daylight_detector', 'target', 'note_block',
            'tnt', 'sculk_sensor', 'calibrated_sculk_sensor', 'crafter', 'lectern', 'trapped_chest', 'lightning_rod',
            'slime_block', 'honey_block', ...RAILS,
        ],
        suffixes: ['_button', '_pressure_plate', '_door', '_trapdoor', 'copper_bulb'],
    },
    flowers: {
        ids: [
            'dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip',
            'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'wither_rose', 'torchflower', 'pitcher_plant', 'sunflower', 'lilac',
            'rose_bush', 'peony', 'spore_blossom', 'pink_petals', 'wildflowers', 'open_eyeblossom', 'closed_eyeblossom',
            'cactus_flower', 'flowering_azalea', 'chorus_flower',
        ],
    },
    ores: {
        ids: [
            'coal', 'charcoal', 'diamond', 'emerald', 'lapis_lazuli', 'amethyst_shard', 'amethyst_block', 'quartz',
            'netherite_scrap', 'ancient_debris', 'echo_shard', 'redstone', 'glowstone_dust', 'flint',
            'coal_block', 'diamond_block', 'emerald_block', 'lapis_block', 'gold_block', 'iron_block', 'copper_block',
            'netherite_block', 'redstone_block', 'quartz_block',
        ],
        prefixes: ['raw_'],
        suffixes: ['_ore', '_ingot', '_nugget'],
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
    potions: {
        ids: [
            'potion', 'splash_potion', 'lingering_potion', 'tipped_arrow', 'brewing_stand', 'blaze_powder', 'magma_cream',
            'glistering_melon_slice', 'ghast_tear', 'nether_wart', 'fermented_spider_eye', 'rabbit_foot', 'glass_bottle',
            'dragon_breath', 'phantom_membrane', 'ominous_bottle',
        ],
    },
    books: {
        ids: ['enchanted_book', 'experience_bottle', 'enchanting_table', 'bookshelf'],
    },
    transport: {
        ids: ['minecart', 'saddle', 'elytra', 'firework_rocket', 'ender_pearl', 'lead', 'carrot_on_a_stick', 'warped_fungus_on_a_stick', ...RAILS],
        suffixes: ['_minecart', '_boat', '_raft', '_horse_armor', '_nautilus_armor', '_harness'],
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
 * Find a lens by its ID.
 * @param id - Lens ID, e.g. from the URL
 * @returns The lens, or undefined for an unknown ID
 */
export function findLens(id: string | undefined): Lens | undefined {
    return id === undefined ? undefined : LENSES.find(lens => lens.id === id.trim().toLowerCase());
}

/**
 * Whether an item type belongs to a lens.
 * @param lens - Lens to check
 * @param type - Vanilla item ID in any case, e.g. "HOPPER"
 * @returns True if the item is in the lens
 *
 * @example
 * isItemInLens(findLens('redstone')!, 'HOPPER')        // true
 * isItemInLens(findLens('tools')!, 'DIAMOND_PICKAXE')  // true
 */
export function isItemInLens(lens: Lens, type: string): boolean {
    const id = normalizeItemId(type);
    if (RULE_IDS.get(lens.id)?.has(id)) { return true; }
    const rule = LENS_RULES[lens.id];
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
 * Whether a trade gives you something from a lens (the Buying side).
 * A filled shulker box counts if any of its contents is in the lens.
 * @param trade - Trade to check
 * @param lens - Lens to check
 * @returns True if the received item is in the lens
 */
export function receivesFromLens(trade: Readonly<Pick<Trade, 'resultItem' | 'shulkerItems'>>, lens: Lens): boolean {
    const types = trade.shulkerItems ? trade.shulkerItems.map(content => content.key) : getStackTypes(trade.resultItem);
    return types.some(type => isItemInLens(lens, type));
}

/**
 * Whether a trade asks for something from a lens (the Paying side).
 * A filled shulker box counts if any of its contents is in the lens.
 * @param trade - Trade to check
 * @param lens - Lens to check
 * @returns True if either cost item is in the lens
 */
export function paysWithLens(trade: Readonly<Pick<Trade, 'item1' | 'item2'>>, lens: Lens): boolean {
    return [trade.item1, trade.item2].some(item => item !== undefined && getStackTypes(item).some(type => isItemInLens(lens, type)));
}
