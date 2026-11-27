import { beforeAll, describe, expect, test } from 'vitest';

import { processTrade } from '../library.js';
import { blockConversionsStore, coreBlocksStore } from '../stores/index.js';
import type { Trade } from '../types.js';
import { buildValuation } from '../valuation/valuation.js';
import { confidentOnly, createDeviationCalculator } from './deviation.js';

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

describe('deal % (deviation)', () => {
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
