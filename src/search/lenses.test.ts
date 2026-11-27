/**
 * Unit tests for the lens catalogue in src/search/lenses.ts
 */
import { describe, expect, test } from 'vitest';

import type { Item, Trade } from '../types.js';
import { findLens, isItemInLens, type Lens, LENSES, paysWithLens, rankLenses, receivesFromLens } from './lenses.js';

function lens(id: string): Lens {
    const found = findLens(id);
    if (!found) { throw new Error(`Unknown lens ${id}`); }
    return found;
}

function lensesOf(type: string): readonly string[] {
    return LENSES.filter(candidate => isItemInLens(candidate, type)).map(candidate => candidate.id);
}

const item = (type: string, lore?: readonly string[]): Item => ({ type, name: '', amount: 1, ...(lore && { lore: [...lore] }) });

describe('isItemInLens', () => {
    test('redstone covers components whose names lack the word', () => {
        for (const type of ['HOPPER', 'STICKY_PISTON', 'OBSERVER', 'COMPARATOR', 'OAK_BUTTON', 'IRON_TRAPDOOR', 'OXIDIZED_COPPER_BULB']) {
            expect(isItemInLens(lens('redstone'), type), type).toBe(true);
        }
        expect(isItemInLens(lens('redstone'), 'REDSTONE_ORE')).toBe(false);
    });

    test('tool suffixes do not catch pickaxes as axes or vice versa', () => {
        expect(lensesOf('DIAMOND_PICKAXE')).toEqual(['tools']);
        expect(lensesOf('NETHERITE_AXE')).toEqual(['tools']);
        expect(lensesOf('DIAMOND_SWORD')).toEqual(['weapons']);
    });

    test('an item can sit in several lenses', () => {
        expect(lensesOf('ELYTRA')).toEqual(['armor', 'transport', 'collectibles']);
        expect(lensesOf('SILENCE_ARMOR_TRIM_SMITHING_TEMPLATE')).toEqual(['armor', 'collectibles']);
        expect(lensesOf('TNT')).toEqual(['weapons', 'redstone']);
    });

    test('accepts namespaced, lowercase and spaced IDs', () => {
        expect(isItemInLens(lens('flowers'), 'minecraft:poppy')).toBe(true);
        expect(isItemInLens(lens('music'), 'music_disc_pigstep')).toBe(true);
        expect(isItemInLens(lens('food'), 'Cooked beef')).toBe(true);
    });

    test('items outside every lens are left alone', () => {
        expect(lensesOf('OAK_LOG')).toEqual([]);
        expect(lensesOf('SHULKER_BOX')).toEqual([]);
    });
});

describe('receivesFromLens / paysWithLens', () => {
    const hopperForDiamonds = { resultItem: item('HOPPER'), shulkerItems: undefined, item1: item('DIAMOND'), item2: undefined } satisfies Partial<Trade>;

    test('checks the received item on the Buying side and the cost items on the Paying side', () => {
        expect(receivesFromLens(hopperForDiamonds, lens('redstone'))).toBe(true);
        expect(paysWithLens(hopperForDiamonds, lens('redstone'))).toBe(false);
        expect(paysWithLens(hopperForDiamonds, lens('ores'))).toBe(true);
    });

    test('a received shulker box counts by its contents', () => {
        const box = { resultItem: item('SHULKER_BOX'), shulkerItems: [{ key: 'cobblestone', name: 'Cobblestone', total: 64 }, { key: 'repeater', name: 'Repeater', total: 64 }] };
        expect(receivesFromLens(box, lens('redstone'))).toBe(true);
        expect(receivesFromLens(box, lens('food'))).toBe(false);
    });

    test('a paid shulker box counts by its contents, including the second cost item', () => {
        const trade = { item1: item('EMERALD'), item2: item('SHULKER_BOX', ['- 64x COOKED_BEEF']) };
        expect(paysWithLens(trade, lens('food'))).toBe(true);
        expect(paysWithLens(trade, lens('redstone'))).toBe(false);
    });
});

describe('rankLenses', () => {
    test('matches the start of a name or of a word in it', () => {
        expect(rankLenses('red', 2).map(match => match.id)).toEqual(['redstone']);
        expect(rankLenses('disc', 2).map(match => match.id)).toEqual(['music']);
    });

    test('finds a lens by keyword after name matches, but not by text inside a word', () => {
        expect(rankLenses('piston', 2).map(match => match.id)).toEqual(['redstone']);
        expect(rankLenses('ar', 3).map(match => match.id)).toEqual(['armor', 'weapons']);
        expect(rankLenses('ities', 3)).toEqual([]);
    });

    test('returns nothing for empty text', () => {
        expect(rankLenses('  ', 5)).toEqual([]);
    });
});

describe('findLens', () => {
    test('is case-insensitive and rejects unknown IDs', () => {
        expect(findLens('Redstone')?.label).toBe('Redstone');
        expect(findLens('nether')).toBeUndefined();
        expect(findLens(undefined)).toBeUndefined();
    });
});
