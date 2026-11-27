/**
 * Unit tests for src/search/deviation.ts
 */
import { beforeAll, describe, expect, test } from 'vitest';

import { processTrade } from '../library.js';
import { blockConversionsStore, coreBlocksStore } from '../stores/index.js';
import { createTrade, plainItem, setupTestStores } from '../test-fixtures.js';
import type { Trade } from '../types.js';
import { buildValuation } from '../valuation/valuation.js';
import { confidentOnly, createDeviationCalculator } from './deviation.js';

// String constants to avoid duplication
const EMERALD = 'EMERALD';
const COOKED_BEEF_TITLE = 'Cooked beef';

// Mock fetch and load block conversions, core blocks and config before tests run
setupTestStores();

// Helper: one cooked beef sold for `costAmount` of `costType` at (x, 64, 0)
const beefTrade = (costType: string, costAmount: number, x: number): Trade => ({
    ...createTrade(1, costAmount, COOKED_BEEF_TITLE, 1),
    x,
    y: 64,
    resultItem: plainItem('COOKED_BEEF', 1),
    item1: plainItem(costType, costAmount),
});

// Helper: deviation calculator built from the given trades, as the data loader does
const calculatorFor = (trades: readonly Trade[]) => createDeviationCalculator(buildValuation(trades));

describe('deviation calculator', () => {
    test('compares with other listings in the same currency first', () => {
        const cheap = beefTrade('GOLD_INGOT', 1, 0);
        const expensive = beefTrade('GOLD_INGOT', 3, 1000);
        const getDeviation = calculatorFor([cheap, expensive]);
        // Median gold price is 2 per beef
        expect(getDeviation(cheap)).toMatchObject({ percent: -50, basis: 'same-currency' });
        expect(getDeviation(expensive)).toMatchObject({ percent: 50, basis: 'same-currency' });
    });

    test('gives no deviation without trusted data on either basis', () => {
        const getDeviation = calculatorFor([beefTrade(EMERALD, 2, 0), beefTrade(EMERALD, 2, 1000)]);
        // Gold has no trusted value and no other gold-priced beef exists
        expect(getDeviation(beefTrade('GOLD_INGOT', 1, 2000))).toBeUndefined();
    });

    test('counts a shulker of emeralds and emerald blocks as one currency', () => {
        const getDeviation = calculatorFor([beefTrade(EMERALD, 2, 0), beefTrade(EMERALD, 2, 1000)]);
        const shulkerTrade: Trade = {
            ...beefTrade(EMERALD, 1, 2000),
            resultItem: { type: 'COOKED_BEEF', name: '', amount: 64 },
            resultAmount: 64,
            item1: { type: 'SHULKER_BOX', name: '', amount: 1, lore: ['- 28x EMERALD', '- 4x EMERALD_BLOCK'] },
        };
        // 28 + 4×9 = 64 emeralds for 64 beef that usually cost 2 emeralds each
        expect(getDeviation(shulkerTrade)).toMatchObject({ percent: -50, basis: 'same-currency' });
    });
});

describe('deal % (deviation)', () => {
    let shopCount = 0;

    /**
     * A trade at a shop of its own: a new owner, 100 blocks from the previous shop
     * @param gives - Amount and item type the shop gives
     * @param takes - Amount and item type the shop takes
     * @returns Processed trade
     */
    function offer(gives: readonly [number, string], takes: readonly [number, string]): Trade {
        shopCount++;
        return processTrade(
            {
                resultItem: { type: gives[1], name: '', amount: gives[0] },
                item1: { type: takes[1], name: '', amount: takes[0] },
                stock: 5,
            },
            { shopOwner: `Owner ${shopCount}`, location: `${shopCount * 100}.0, 64.0, 0.0`, world: 'World', recipes: [] },
            []
        );
    }

    beforeAll(() => {
        blockConversionsStore._setConversions({
            'diamond block': { base: 'diamond', multiplier: 9 },
            'emerald block': { base: 'emerald', multiplier: 9 },
        });
        coreBlocksStore._setBlocks(['Diamond Block', 'Diamond', 'Emerald Block']);
    });

    test('paying with a block or with its base gives the same Deal %', () => {
        const inDiamonds = offer([64, 'GUNPOWDER'], [9, 'DIAMOND']);
        const inBlock = offer([64, 'GUNPOWDER'], [1, 'DIAMOND_BLOCK']);
        const expensive = offer([64, 'GUNPOWDER'], [18, 'DIAMOND']);
        const getDeviation = createDeviationCalculator(buildValuation([
            inDiamonds,
            inBlock,
            expensive,
            offer([64, 'GUNPOWDER'], [1, 'DIAMOND_BLOCK']),
            offer([64, 'GUNPOWDER'], [10, 'DIAMOND']),
        ]));

        // One market of 9, 9, 9, 10 and 18 diamonds: the median is 9
        expect(getDeviation(inDiamonds)).toMatchObject({ percent: 0, basis: 'same-currency' });
        expect(getDeviation(inBlock)).toMatchObject({ percent: 0, basis: 'same-currency' });
        expect(getDeviation(expensive)).toMatchObject({ percent: 100, text: '+100%' });
    });

    test('a cross-currency comparison is marked as an estimate and is not a deal', () => {
        const beefForDiamonds = offer([10, 'COOKED_BEEF'], [1, 'DIAMOND']);
        const getDeviation = createDeviationCalculator(buildValuation([
            offer([1, 'COOKED_BEEF'], [2, 'EMERALD']),
            offer([1, 'COOKED_BEEF'], [2, 'EMERALD']),
            offer([1, 'DIAMOND'], [10, 'EMERALD']),
            offer([1, 'DIAMOND'], [10, 'EMERALD']),
            offer([1, 'DIAMOND'], [10, 'EMERALD']),
            beefForDiamonds,
        ]));

        // 1 diamond = 10 emeralds for 10 beef that usually cost 2 emeralds each
        expect(getDeviation(beefForDiamonds)).toMatchObject({ percent: -50, basis: 'cross-currency', text: '≈−50%' });
        expect(confidentOnly(getDeviation)(beefForDiamonds)).toBeUndefined();
    });
});
