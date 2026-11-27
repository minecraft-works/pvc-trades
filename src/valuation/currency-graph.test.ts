import { beforeAll, describe, expect, test } from 'vitest';

import { processTrade } from '../library.js';
import { blockConversionsStore, coreBlocksStore } from '../stores/index.js';
import type { Trade } from '../types.js';
import { toBaseUnit } from './item-identity.js';
import { buildValuation } from './valuation.js';

let shopCount = 0;

/**
 * A trade at a shop of its own: a new owner, 100 blocks from the previous shop
 * @param gives - Amount and item type the shop gives
 * @param takes - Amount and item type the shop takes
 * @param stock - Uses left
 * @returns Processed trade
 */
function offer(gives: readonly [number, string], takes: readonly [number, string], stock = 5): Trade {
    shopCount++;
    return processTrade(
        {
            resultItem: { type: gives[1], name: '', amount: gives[0] },
            item1: { type: takes[1], name: '', amount: takes[0] },
            stock,
        },
        { shopOwner: `Owner ${shopCount}`, location: `${shopCount * 100}.0, 64.0, 0.0`, world: 'World', recipes: [] },
        []
    );
}

const atShops = (count: number, make: () => Trade): Trade[] => Array.from({ length: count }, make);

// 3 shops sell a netherite ingot for 16 diamond blocks, 3 buy one for 72 diamonds
const netheriteMarket = (): Trade[] => [
    ...atShops(3, () => offer([1, 'NETHERITE_INGOT'], [16, 'DIAMOND_BLOCK'])),
    ...atShops(3, () => offer([72, 'DIAMOND'], [1, 'NETHERITE_INGOT'])),
];

// 3 shops sell a diamond for 2 emerald blocks, 3 buy one for 9 emeralds
const diamondMarket = (): Trade[] => [
    ...atShops(3, () => offer([1, 'DIAMOND'], [2, 'EMERALD_BLOCK'])),
    ...atShops(3, () => offer([9, 'EMERALD'], [1, 'DIAMOND'])),
];

beforeAll(() => {
    blockConversionsStore._setConversions({
        'diamond block': { base: 'diamond', multiplier: 9 },
        'emerald block': { base: 'emerald', multiplier: 9 },
        'quartz block': { base: 'nether quartz', multiplier: 4, reversible: false },
    });
    coreBlocksStore._setBlocks(['Netherite Ingot', 'Diamond Block', 'Diamond', 'Emerald Block']);
});

describe('currency graph', () => {
    test('quotes each side of a direct market, in blocks or base units alike', () => {
        const { currencies } = buildValuation(netheriteMarket());
        expect(currencies.quote('Netherite ingot', 'Diamond')).toMatchObject({ buy: 144, sell: 72, via: [], crossed: false });
        expect(currencies.quote('Netherite ingot', 'Diamond block')).toMatchObject({ buy: 16, sell: 8 });
    });

    test('composes missing rates: buy along buy rates, sell along sell rates', () => {
        const { currencies } = buildValuation([...netheriteMarket(), ...diamondMarket()]);
        // Buy: 144 diamonds at 18 emeralds; sell: 72 diamonds at 9 emeralds
        expect(currencies.quote('Netherite ingot', 'Emerald')).toMatchObject({ buy: 2592, sell: 648, via: ['Diamond'] });
    });

    test('never quotes sell above buy: a crossed market shows the mid rate', () => {
        const crossed = [
            ...atShops(3, () => offer([1, 'DIAMOND'], [10, 'EMERALD'])),
            ...atShops(3, () => offer([40, 'EMERALD'], [1, 'DIAMOND'])),
        ];
        const quote = buildValuation(crossed).currencies.quote('Diamond', 'Emerald');
        expect(quote).toMatchObject({ buy: 20, sell: 20, mid: 20, crossed: true });
    });

    test('ignores sold-out trades', () => {
        const trades = [
            ...atShops(3, () => offer([1, 'DIAMOND'], [10, 'EMERALD'])),
            ...atShops(3, () => offer([1, 'DIAMOND'], [1, 'EMERALD'], 0)),
        ];
        expect(buildValuation(trades).currencies.quote('Diamond', 'Emerald')?.buy).toBe(10);
    });

    test('a block is always 9 of its base, whatever block trades say; one-way recipes stay separate', () => {
        const trades = [
            ...atShops(3, () => offer([1, 'DIAMOND_BLOCK'], [5, 'DIAMOND'])),
            ...atShops(3, () => offer([1, 'DIAMOND'], [10, 'EMERALD'])),
        ];
        const valuation = buildValuation(trades);
        expect(valuation.currencies.quote('Diamond block', 'Diamond')).toMatchObject({ buy: 9, sell: 9 });
        expect(valuation.getValue('Diamond block')).toBe(90);
        expect(toBaseUnit('Quartz block', 2)).toEqual({ name: 'Quartz block', amount: 2 });
    });

    test('items paid for many different goods at several shops become currencies', () => {
        const goods = ['STONE', 'SAND', 'GRAVEL', 'DIRT', 'GLASS'];
        const trades = [
            ...goods.map(type => offer([1, type], [1, 'SUNFLOWER'])),
            ...atShops(2, () => offer([1, 'DIAMOND'], [8, 'SUNFLOWER'])),
            ...atShops(2, () => offer([6, 'SUNFLOWER'], [1, 'DIAMOND'])),
            // Bamboo buys as many goods, but from a single shop
            ...goods.map(type => ({ ...offer([1, type], [4, 'BAMBOO']), x: 0, shopOwner: 'Bamboo trader' })),
        ];
        const { currencies } = buildValuation(trades);
        expect(currencies.currencies).toContain('Sunflower');
        expect(currencies.currencies).not.toContain('Bamboo');
        expect(currencies.quote('Diamond', 'Sunflower')).toMatchObject({ buy: 8, sell: 6 });
    });
});
