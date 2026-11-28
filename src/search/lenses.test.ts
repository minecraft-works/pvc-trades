/**
 * Unit tests for the lens catalogue in src/search/lenses.ts
 */
import { describe, expect, test } from 'vitest';

import type { Item, Trade } from '../types.js';
import { findLens, isItemInLens, type Lens, LENSES, paysWithLens, receivesFromLens } from './lenses.js';

function lens(id: string): Lens {
    const found = findLens(id);
    if (!found) { throw new Error(`Unknown lens ${id}`); }
    return found;
}

function lensesOf(type: string): readonly string[] {
    return LENSES.filter(candidate => isItemInLens(candidate, type)).map(candidate => candidate.id);
}

const item = (type: string, lore?: readonly string[]): Item => ({ type, name: '', amount: 1, ...(lore && { lore: [...lore] }) });
const named = (type: string, name: string): Item => ({ type, name, amount: 1 });

function lensesOfStack(resultItem: Item): readonly string[] {
    return LENSES.filter(candidate => receivesFromLens({ resultItem, shulkerItems: undefined }, candidate)).map(candidate => candidate.id);
}

describe('isItemInLens', () => {
    test('redstone covers components whose names lack the word', () => {
        for (const type of ['HOPPER', 'STICKY_PISTON', 'OBSERVER', 'COMPARATOR', 'OAK_BUTTON', 'IRON_TRAPDOOR', 'OXIDIZED_COPPER_BULB']) {
            expect(isItemInLens(lens('redstone'), type), type).toBe(true);
        }
        expect(isItemInLens(lens('redstone'), 'REDSTONE_ORE')).toBe(false);
    });

    test('gear suffixes do not catch pickaxes as axes or vice versa', () => {
        expect(lensesOf('DIAMOND_PICKAXE')).toEqual(['gear']);
        expect(lensesOf('NETHERITE_AXE')).toEqual(['gear']);
        expect(lensesOf('DIAMOND_SWORD')).toEqual(['gear']);
    });

    test('an item can sit in several lenses', () => {
        expect(lensesOf('ELYTRA')).toEqual(['gear', 'collectibles']);
        expect(lensesOf('TIPPED_ARROW')).toEqual(['gear', 'potions']);
    });

    test('armor trims are collectibles, not gear; the netherite upgrade is both', () => {
        expect(lensesOf('SILENCE_ARMOR_TRIM_SMITHING_TEMPLATE')).toEqual(['collectibles']);
        expect(lensesOf('NETHERITE_UPGRADE_SMITHING_TEMPLATE')).toEqual(['gear', 'collectibles']);
    });

    test('maps are map art only', () => {
        expect(lensesOf('FILLED_MAP')).toEqual(['mapart']);
    });

    test('claim ores are claim blocks, other ores stay ores', () => {
        for (const type of ['COAL_ORE', 'LAPIS_ORE', 'REDSTONE_ORE', 'DIAMOND_ORE', 'NETHER_GOLD_ORE']) {
            expect(lensesOf(type), type).toEqual(['claims']);
        }
        expect(lensesOf('IRON_ORE')).toEqual(['ores']);
        expect(lensesOf('DEEPSLATE_DIAMOND_ORE')).toEqual(['ores']);
    });

    test('any ore sold as a protection block is a claim block', () => {
        expect(lensesOfStack({ type: 'COPPER_ORE', name: 'Chunk Protection Block', amount: 1 })).toEqual(['claims']);
        expect(lensesOfStack({ type: 'DEEPSLATE_EMERALD_ORE', name: 'Super Protection Block', amount: 1 })).toEqual(['claims']);
        expect(lensesOfStack(item('COPPER_ORE'))).toEqual(['ores']);
    });

    test('the everyday money is not an ore', () => {
        for (const type of ['DIAMOND', 'EMERALD', 'DIAMOND_BLOCK', 'EMERALD_BLOCK']) {
            expect(lensesOf(type), type).toEqual([]);
        }
    });

    test('accepts namespaced, lowercase and spaced IDs', () => {
        expect(isItemInLens(lens('flowers'), 'minecraft:poppy')).toBe(true);
        expect(isItemInLens(lens('music'), 'music_disc_pigstep')).toBe(true);
        expect(isItemInLens(lens('food'), 'Cooked beef')).toBe(true);
    });

    test('items outside every lens are left alone', () => {
        expect(lensesOf('OAK_LOG')).toEqual([]);
        expect(lensesOf('SHULKER_BOX')).toEqual([]);
        expect(lensesOf('BLAZE_POWDER')).toEqual([]);
    });
});

describe('receivesFromLens / paysWithLens', () => {
    const hopperForDiamonds = { resultItem: item('HOPPER'), shulkerItems: undefined, item1: item('DIAMOND'), item2: undefined } satisfies Partial<Trade>;

    test('checks the received item on the Buying side and the cost items on the Paying side', () => {
        expect(receivesFromLens(hopperForDiamonds, lens('redstone'))).toBe(true);
        expect(paysWithLens(hopperForDiamonds, lens('redstone'))).toBe(false);
        expect(paysWithLens({ ...hopperForDiamonds, item1: item('IRON_INGOT') }, lens('ores'))).toBe(true);
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

describe('Map Art', () => {
    const buying = (resultItem: Item) => receivesFromLens({ resultItem, shulkerItems: undefined }, lens('mapart'));
    const namedBundle: Item = { type: 'BLUE_BUNDLE', name: 'Tardis on Gallifrey', amount: 1 };

    test('takes filled maps and bundles the seller named (map art sets)', () => {
        expect(buying(item('FILLED_MAP'))).toBe(true);
        expect(buying(namedBundle)).toBe(true);
        expect(paysWithLens({ item1: item('DIAMOND'), item2: namedBundle }, lens('mapart'))).toBe(true);
    });

    test('leaves out empty-looking bundles and blank maps', () => {
        expect(buying(item('BUNDLE'))).toBe(false);
        expect(buying({ type: 'BUNDLE', name: 'Bundle', amount: 1 })).toBe(false);
        expect(buying(item('MAP'))).toBe(false);
    });

    test('a named bundle is only map art, not in other lenses', () => {
        expect(LENSES.filter(candidate => receivesFromLens({ resultItem: namedBundle, shulkerItems: undefined }, candidate)).map(candidate => candidate.id))
            .toEqual(['mapart']);
    });

    test('a shulker box of filled maps counts by its contents', () => {
        expect(paysWithLens({ item1: item('SHULKER_BOX', ['- 1x FILLED_MAP', '- 1x FILLED_MAP']), item2: undefined }, lens('mapart'))).toBe(true);
    });
});

describe('Admin and Community Currency', () => {
    test('takes the server-issued items by type and name, and only there', () => {
        expect(lensesOfStack(named('BOOK', 'Playtime Certificate'))).toEqual(['currency']);
        expect(lensesOfStack(named('BOOK', 'T2 Playtime Certificate'))).toEqual(['currency']);
        expect(lensesOfStack(named('DIAMOND', '50 Votes Certificate'))).toEqual(['currency']);
        expect(lensesOfStack(named('LIGHT', 'Lux'))).toEqual(['currency']);
        expect(lensesOfStack(named('SUNFLOWER', 'Event Coin'))).toEqual(['currency']);
        expect(lensesOfStack(named('AMETHYST_SHARD', '§bCaddozzo'))).toEqual(['currency']);
        expect(lensesOfStack(named('JACK_O_LANTERN', 'Trick or Treat Coin'))).toEqual(['currency']);
        expect(lensesOfStack(named('LIME_WOOL', 'Voucher Credits - 120'))).toEqual(['currency']);
    });

    test('player and union coins are community currency', () => {
        expect(lensesOfStack(named('END_CRYSTAL', 'BB Coin'))).toEqual(['community']);
        expect(lensesOfStack(named('MAGMA_CREAM', 'GCU Coin'))).toEqual(['community']);
        expect(lensesOfStack(named('SUNFLOWER', 'Investigation Coin'))).toEqual(['community']);
    });

    test('ignores the name on another item type, and plain items', () => {
        expect(lensesOfStack(named('DIRT', 'Playtime Certificate'))).toEqual([]);
        expect(lensesOfStack(named('LIGHT', 'Lux lamp'))).toEqual(['collectibles']);
        expect(lensesOfStack(item('BOOK'))).toEqual(['enchanting']);
        expect(lensesOfStack(item('DIAMOND'))).toEqual([]);
    });

    test('a shulker box of currency counts by its (named) contents', () => {
        const box = item('SHULKER_BOX', ["- 64x §a§oBank§e§o-§a§oO'§e§o-§a§oNote"]);
        expect(paysWithLens({ item1: box, item2: undefined }, lens('currency'))).toBe(true);
        expect(paysWithLens({ item1: item('SHULKER_BOX', ['- 64x EMERALD_BLOCK']), item2: undefined }, lens('currency'))).toBe(false);
    });
});

describe('findLens', () => {
    test('is case-insensitive and rejects unknown IDs', () => {
        expect(findLens('Redstone')?.label).toBe('Redstone');
        expect(findLens('nether')).toBeUndefined();
        expect(findLens(undefined)).toBeUndefined();
    });

    test('resolves earlier IDs from shared links', () => {
        expect(findLens('tools')?.id).toBe('gear');
        expect(findLens('armor')?.id).toBe('gear');
        expect(findLens('books')?.id).toBe('enchanting');
        expect(findLens('transport')).toBeUndefined();
    });
});
