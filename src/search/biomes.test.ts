/**
 * Unit tests for the biome catalogue in src/search/biomes.ts
 */
import { beforeAll, describe, expect, test } from 'vitest';

import type { Item } from '../types.js';
import { BIOME_RULES } from './biome-rules.js';
import { type Biome, BIOMES, findBiome, isItemInBiome, loadBiomeRules, paysWithBiome, receivesFromBiome } from './biomes.js';

beforeAll(async () => { await loadBiomeRules(); });

function biome(id: string): Biome {
    const found = findBiome(id);
    if (!found) { throw new Error(`Unknown biome ${id}`); }
    return found;
}

function biomesOf(type: string): readonly string[] {
    return BIOMES.filter(candidate => isItemInBiome(candidate, type)).map(candidate => candidate.id);
}

const item = (type: string, lore?: readonly string[]): Item => ({ type, name: '', amount: 1, ...(lore && { lore: [...lore] }) });

describe('isItemInBiome', () => {
    test('counts what you collect in a biome, not what is crafted from it', () => {
        expect(biomesOf('JUNGLE_LOG')).toEqual(['jungle']);
        expect(biomesOf('COCOA_BEANS')).toEqual(['jungle']);
        expect(biomesOf('JUNGLE_PLANKS')).toEqual([]);
        expect(biomesOf('STRIPPED_CHERRY_LOG')).toEqual([]);
        expect(biomesOf('MUD')).toEqual(['mangrove_swamp']);
        expect(biomesOf('MUD_BRICKS')).toEqual([]);
        expect(biomesOf('RESIN_CLUMP')).toEqual(['pale_garden']);
        expect(biomesOf('RESIN_BRICKS')).toEqual([]);
    });

    test('only the terracotta colours that generate in the badlands', () => {
        expect(biomesOf('ORANGE_TERRACOTTA')).toEqual(['badlands']);
        expect(biomesOf('BLUE_TERRACOTTA')).toEqual([]);
        expect(biomesOf('ORANGE_GLAZED_TERRACOTTA')).toEqual([]);
    });

    test('coral of every kind and state comes from the ocean, and the warm ocean in particular', () => {
        for (const type of ['BRAIN_CORAL', 'DEAD_TUBE_CORAL_BLOCK', 'FIRE_CORAL_FAN']) {
            expect(biomesOf(type), type).toEqual(['ocean', 'warm_ocean']);
        }
        expect(biomesOf('TROPICAL_FISH_BUCKET')).toEqual(['ocean', 'warm_ocean']);
        expect(biomesOf('PRISMARINE')).toEqual(['ocean']);
    });

    test('loot of a structure that only generates in one biome counts for that biome', () => {
        expect(biomesOf('DUNE_ARMOR_TRIM_SMITHING_TEMPLATE')).toEqual(['desert']);
        expect(biomesOf('VEX_ARMOR_TRIM_SMITHING_TEMPLATE')).toEqual(['dark_forest']);
        expect(biomesOf('ANGLER_POTTERY_SHERD')).toEqual(['ocean', 'warm_ocean']);
        // Trial chambers, trail ruins and nether bastions generate in many biomes
        expect(biomesOf('BOLT_ARMOR_TRIM_SMITHING_TEMPLATE')).toEqual([]);
        expect(biomesOf('HOWL_POTTERY_SHERD')).toEqual([]);
        expect(biomesOf('SNOUT_ARMOR_TRIM_SMITHING_TEMPLATE')).toEqual([]);
    });

    test('an item can come from several biomes', () => {
        expect(biomesOf('VINE')).toEqual(['jungle', 'swamp']);
        expect(biomesOf('SHROOMLIGHT')).toEqual(['crimson_forest', 'warped_forest']);
    });

    test('accepts namespaced and shulker content spellings', () => {
        expect(isItemInBiome(biome('the_end'), 'minecraft:chorus_fruit')).toBe(true);
        expect(isItemInBiome(biome('deep_dark'), 'Echo shard')).toBe(true);
    });
});

describe('receivesFromBiome / paysWithBiome', () => {
    test('checks the received item on Buying and the cost items on Paying', () => {
        const sandForPrismarine = { resultItem: item('SAND'), shulkerItems: undefined, item1: item('PRISMARINE_SHARD'), item2: undefined };
        expect(receivesFromBiome(sandForPrismarine, biome('desert'))).toBe(true);
        expect(paysWithBiome(sandForPrismarine, biome('desert'))).toBe(false);
        expect(paysWithBiome(sandForPrismarine, biome('ocean'))).toBe(true);
    });

    test('a filled shulker box counts by its contents', () => {
        const box = item('SHULKER_BOX', ['- 64x PACKED_ICE']);
        const contents = [{ key: 'PACKED_ICE', name: 'Packed ice', total: 64 }];
        expect(paysWithBiome({ item1: box, item2: undefined }, biome('snowy'))).toBe(true);
        expect(receivesFromBiome({ resultItem: box, shulkerItems: contents }, biome('snowy'))).toBe(true);
        expect(receivesFromBiome({ resultItem: box, shulkerItems: contents }, biome('the_end'))).toBe(false);
    });

    test('a currency stands for itself, not for the biome of its vanilla type', () => {
        const llamaCoin: Item = { type: 'HEART_OF_THE_SEA', name: 'LlamaCoin', amount: 1 };
        expect(receivesFromBiome({ resultItem: llamaCoin, shulkerItems: undefined }, biome('ocean'))).toBe(false);
        expect(receivesFromBiome({ resultItem: item('HEART_OF_THE_SEA'), shulkerItems: undefined }, biome('ocean'))).toBe(true);
    });
});

describe('findBiome', () => {
    test('every biome in the menu has item rules, and every rule a biome', () => {
        expect(new Set(Object.keys(BIOME_RULES))).toEqual(new Set(BIOMES.map(candidate => candidate.id)));
    });

    test('finds a biome by its URL ID in any case', () => {
        expect(findBiome('Deep_Dark')?.label).toBe('Deep Dark');
        expect(findBiome('moon')).toBeUndefined();
        expect(findBiome(undefined)).toBeUndefined();
    });
});
