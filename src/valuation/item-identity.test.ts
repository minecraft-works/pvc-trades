/**
 * Unit tests for src/valuation/item-identity.ts
 */
import { describe, expect, test } from 'vitest';

import { createTrade, setupTestStores } from '../test-fixtures.js';
import { getItemComponents, getValuationName, parseShulkerContents, toValuationInput } from './item-identity.js';

// Base units (blocks counted as their base) come from the block conversions store
setupTestStores();

// String constants to avoid duplication
const COOKED_BEEF_TITLE = 'Cooked beef';
const LORE_GUNPOWDER = '- 64x GUNPOWDER';
const DIAMOND_BLOCK_TITLE = 'Diamond Block';
const DIAMOND_TITLE = 'Diamond';
const MINECRAFT_EFFICIENCY = 'minecraft:efficiency';

describe('parseShulkerContents', () => {
    test('parses single item type', () => {
        const lore = [LORE_GUNPOWDER, LORE_GUNPOWDER, LORE_GUNPOWDER];
        const result = parseShulkerContents(lore);
        expect(result.defaultName).toBe('Gunpowder');
        expect(result.defaultTotal).toBe(192);
    });

    test('parses mixed items and returns most common', () => {
        const lore = ['- 64x COOKED_COD', '- 10x COOKED_BEEF'];
        const result = parseShulkerContents(lore);
        expect(result.defaultName).toBe('Cooked cod');
        expect(result.defaultTotal).toBe(64);
    });

    test('includes minority items for search', () => {
        const lore = ['- 64x COOKED_COD', '- 10x COOKED_BEEF'];
        const result = parseShulkerContents(lore);
        const beef = result.items.find(index => index.key === 'cooked_beef');
        expect(beef?.name).toBe(COOKED_BEEF_TITLE);
        expect(beef?.total).toBe(10);
    });

    test('handles empty lore', () => {
        const result = parseShulkerContents([]);
        expect(result.defaultName).toBe('Shulker box');
        expect(result.items.length).toBe(0);
    });

    test('sums up multiple stacks', () => {
        const lore = ['- 64x DIAMOND', '- 64x DIAMOND', '- 32x DIAMOND'];
        const result = parseShulkerContents(lore);
        expect(result.defaultTotal).toBe(160);
    });
});

describe('item identity for valuation', () => {
    test('plain items are priced under their display name', () => {
        expect(getValuationName({ type: 'DIAMOND_PICKAXE', name: '', amount: 1 })).toBe('Diamond pickaxe');
    });

    test('enchanted variants get their own sorted enchantment signature', () => {
        const item = { type: 'DIAMOND_PICKAXE', name: '', amount: 1, enchant: { unbreaking: 3, [MINECRAFT_EFFICIENCY]: 5 } };
        expect(getValuationName(item)).toBe('Diamond pickaxe [efficiency 5, unbreaking 3]');
    });

    test('items whose variant is not in the data cannot be priced', () => {
        expect(getValuationName({ type: 'POTION', name: '', amount: 1, enchant: {} })).toBeUndefined();
        expect(getValuationName({ type: 'ENCHANTED_BOOK', name: '', amount: 1, enchant: {} })).toBeUndefined();
        expect(getValuationName({ type: 'POTION', name: 'Berry Juice', amount: 1 })).toBe('Berry juice');
    });

    test('filled shulker boxes are broken down into their contents', () => {
        const shulker = { type: 'SHULKER_BOX', name: '', amount: 2, lore: [LORE_GUNPOWDER, LORE_GUNPOWDER, '- 10x SAND'] };
        expect(getItemComponents(shulker)).toEqual([
            { name: 'Gunpowder', amount: 256 },
            { name: 'Sand', amount: 20 },
        ]);
    });

    test('toValuationInput maps a single-content shulker cost to its contents, in base units', () => {
        const trade = {
            ...createTrade(14, 1, DIAMOND_BLOCK_TITLE, 1),
            resultItem: { type: 'DIAMOND_BLOCK', name: '', amount: 14 },
            item1: { type: 'SHULKER_BOX', name: '', amount: 1, lore: [LORE_GUNPOWDER, LORE_GUNPOWDER] },
        };
        expect(toValuationInput(trade)).toMatchObject({
            resultName: DIAMOND_TITLE, resultAmount: 126, item1Name: 'Gunpowder', costAmount: 128,
        });
    });

    test('toValuationInput skips trades that cannot be attributed to one item', () => {
        const potionTrade = { ...createTrade(1, 5, 'Potion', 1), resultItem: { type: 'POTION', name: '', amount: 1 } };
        const mixedShulker = { ...createTrade(1, 5, 'Gunpowder', 1), resultItem: { type: 'SHULKER_BOX', name: '', amount: 1, lore: [LORE_GUNPOWDER, '- 10x SAND'] } };
        expect(toValuationInput(potionTrade)).toBeUndefined();
        expect(toValuationInput(mixedShulker)).toBeUndefined();
    });
});
