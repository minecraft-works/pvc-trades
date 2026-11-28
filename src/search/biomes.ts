/**
 * Biomes: where an item comes from ("Jungle", "Deep Dark", …). A biome
 * narrows one side of a trade to what you collect there: its blocks, plants
 * and the drops of its mobs, never things crafted from them (planks, bricks).
 * Like a lens it matches on the vanilla item ID and a filled shulker box
 * counts by its contents, and an item can come from several biomes (vines:
 * Jungle and Swamp). Biomes are a second WHAT next to the categories, so the
 * two intersect: Food + Ocean is fish.
 *
 * See ADR-023.
 *
 * @module search/biomes
 */

import type { Item, Trade } from '../types.js';
import { getStackTypes, isNamedLensItem, normalizeItemId } from './lenses.js';

/** Identifier of a biome, also used in the URL */
export type BiomeId =
    | 'plains'
    | 'forest'
    | 'birch_forest'
    | 'dark_forest'
    | 'taiga'
    | 'cherry_grove'
    | 'pale_garden'
    | 'jungle'
    | 'bamboo_jungle'
    | 'savanna'
    | 'desert'
    | 'badlands'
    | 'swamp'
    | 'mangrove_swamp'
    | 'mushroom_fields'
    | 'snowy'
    | 'mountains'
    | 'beach'
    | 'ocean'
    | 'warm_ocean'
    | 'lush_caves'
    | 'dripstone_caves'
    | 'deep_dark'
    | 'nether_wastes'
    | 'crimson_forest'
    | 'warped_forest'
    | 'soul_sand_valley'
    | 'basalt_deltas'
    | 'the_end';

/** A biome */
export interface Biome {
    readonly id: BiomeId;
    readonly label: string;
}

/** The biomes, grouped overworld, caves, nether, end (the menu lists them by name) */
export const BIOMES: readonly Biome[] = [
    { id: 'plains', label: 'Plains' },
    { id: 'forest', label: 'Forest' },
    { id: 'birch_forest', label: 'Birch Forest' },
    { id: 'dark_forest', label: 'Dark Forest' },
    { id: 'taiga', label: 'Taiga' },
    { id: 'cherry_grove', label: 'Cherry Grove' },
    { id: 'pale_garden', label: 'Pale Garden' },
    { id: 'jungle', label: 'Jungle' },
    { id: 'bamboo_jungle', label: 'Bamboo Jungle' },
    { id: 'savanna', label: 'Savanna' },
    { id: 'desert', label: 'Desert' },
    { id: 'badlands', label: 'Badlands' },
    { id: 'swamp', label: 'Swamp' },
    { id: 'mangrove_swamp', label: 'Mangrove Swamp' },
    { id: 'mushroom_fields', label: 'Mushroom Fields' },
    { id: 'snowy', label: 'Snowy & Ice' },
    { id: 'mountains', label: 'Mountains' },
    { id: 'beach', label: 'Beach & River' },
    { id: 'ocean', label: 'Ocean' },
    { id: 'warm_ocean', label: 'Warm Ocean' },
    { id: 'lush_caves', label: 'Lush Caves' },
    { id: 'dripstone_caves', label: 'Dripstone Caves' },
    { id: 'deep_dark', label: 'Deep Dark' },
    { id: 'nether_wastes', label: 'Nether Wastes' },
    { id: 'crimson_forest', label: 'Crimson Forest' },
    { id: 'warped_forest', label: 'Warped Forest' },
    { id: 'soul_sand_valley', label: 'Soul Sand Valley' },
    { id: 'basalt_deltas', label: 'Basalt Deltas' },
    { id: 'the_end', label: 'The End' },
];

/** Item IDs and suffixes per biome, once loaded */
interface LoadedRule {
    readonly ids: ReadonlySet<string>;
    readonly suffixes: readonly string[];
}

let rules: ReadonlyMap<BiomeId, LoadedRule> | undefined;
let loading: Promise<void> | undefined;

/**
 * Load the biome item rules (once). Until they are loaded no item is in a
 * biome; the caller searches again when this resolves.
 * @returns Resolves once the rules are loaded
 */
export function loadBiomeRules(): Promise<void> {
    loading ??= import('./biome-rules.js').then(({ BIOME_RULES }) => {
        rules = new Map(BIOMES.map(biome => [biome.id, {
            ids: new Set(BIOME_RULES[biome.id]?.ids),
            suffixes: BIOME_RULES[biome.id]?.suffixes ?? [],
        }]));
    });
    return loading;
}

/**
 * Find a biome by its ID.
 * @param id - Biome ID, e.g. from the URL
 * @returns The biome, or undefined for an unknown ID
 */
export function findBiome(id: string | undefined): Biome | undefined {
    if (id === undefined) { return undefined; }
    const key = id.trim().toLowerCase();
    return BIOMES.find(biome => biome.id === key);
}

/**
 * Whether an item type comes from a biome. False for every item until
 * {@link loadBiomeRules} resolved.
 * @param biome - Biome to check
 * @param type - Vanilla item ID in any case, e.g. "JUNGLE_LOG", or a shulker content key
 * @returns True if the item comes from the biome
 *
 * @example
 * isItemInBiome(findBiome('jungle')!, 'COCOA_BEANS')  // true
 * isItemInBiome(findBiome('jungle')!, 'JUNGLE_PLANKS') // false: crafted
 */
export function isItemInBiome(biome: Biome, type: string): boolean {
    const rule = rules?.get(biome.id);
    if (!rule) { return false; }
    const id = normalizeItemId(type);
    return rule.ids.has(id) || rule.suffixes.some(suffix => id.endsWith(suffix));
}

/**
 * Whether an item stack comes from a biome: by its type, a filled shulker
 * box by its contents. A currency or claim block stands for itself, not
 * for its vanilla type, so it comes from no biome.
 * @param item - Item stack
 * @param biome - Biome to check
 * @returns True if the stack comes from the biome
 */
function isStackInBiome(item: Readonly<Item>, biome: Biome): boolean {
    if (isNamedLensItem(item)) { return false; }
    return getStackTypes(item).some(type => isItemInBiome(biome, type));
}

/**
 * Whether a trade gives you something from a biome (the Buying side).
 * @param trade - Trade to check
 * @param biome - Biome to check
 * @returns True if the received item comes from the biome
 */
export function receivesFromBiome(trade: Readonly<Pick<Trade, 'resultItem' | 'shulkerItems'>>, biome: Biome): boolean {
    if (!trade.shulkerItems) { return isStackInBiome(trade.resultItem, biome); }
    return trade.shulkerItems.some(content => isItemInBiome(biome, content.key));
}

/**
 * Whether a trade asks for something from a biome (the Paying side).
 * @param trade - Trade to check
 * @param biome - Biome to check
 * @returns True if either cost item comes from the biome
 */
export function paysWithBiome(trade: Readonly<Pick<Trade, 'item1' | 'item2'>>, biome: Biome): boolean {
    return [trade.item1, trade.item2].some(item => item !== undefined && isStackInBiome(item, biome));
}
