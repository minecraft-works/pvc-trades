import { beforeAll, describe, expect, test } from 'vitest';

import { processTrade } from '../library.js';
import { blockConversionsStore } from '../stores/index.js';
import type { Trade } from '../types.js';
import { findFlips } from './flips.js';

interface Offer {
    readonly owner: string;
    readonly x: number;
    readonly gives: readonly [number, string];
    readonly takes: readonly [number, string];
    readonly stock: number;
}

function makeTrade({ owner, x, gives, takes, stock }: Offer): Trade {
    return processTrade(
        {
            resultItem: { type: gives[1], name: '', amount: gives[0] },
            item1: { type: takes[1], name: '', amount: takes[0] },
            stock,
        },
        { shopOwner: owner, location: `${x}.0, 64.0, 0.0`, world: 'World', recipes: [] },
        []
    );
}

// Ann sells 16 iron for 1 emerald; Ben pays 1 emerald for 8 iron
const annSellsIron = (stock = 10): Trade => makeTrade({ owner: 'Ann', x: 0, gives: [16, 'IRON_INGOT'], takes: [1, 'EMERALD'], stock });
const benBuysIron = (stock = 20, owner = 'Ben'): Trade => makeTrade({ owner, stock, x: 300, gives: [1, 'EMERALD'], takes: [8, 'IRON_INGOT'] });

/** Emerald values, as the app passes them; gold has no trusted value */
const VALUES: Readonly<Record<string, number | undefined>> = { 'Emerald': 1, 'Iron ingot': 1 / 16, 'Diamond': 9 };
const getValue = (name: string): number | undefined => VALUES[name];

beforeAll(() => {
    blockConversionsStore._setConversions({ 'diamond block': { base: 'diamond', multiplier: 9 } });
});

describe('findFlips', () => {
    test('pairs a price in blocks with a price in their base', () => {
        const sellsForBlock = makeTrade({ owner: 'Ann', x: 0, gives: [64, 'GUNPOWDER'], takes: [1, 'DIAMOND_BLOCK'], stock: 5 });
        const buysForDiamonds = makeTrade({ owner: 'Ben', x: 300, gives: [12, 'DIAMOND'], takes: [64, 'GUNPOWDER'], stock: 5 });
        expect(findFlips([sellsForBlock, buysForDiamonds], { getValue })[0]).toMatchObject({ item: 'Gunpowder', currency: 'Diamond', profit: 15 });
    });

    test('buys low at one shop and sells high at another, using whole trades within stock', () => {
        const [flip, ...rest] = findFlips([annSellsIron(), benBuysIron()], { getValue });
        expect(rest).toHaveLength(0);
        expect(flip).toMatchObject({ item: 'Iron ingot', currency: 'Emerald', profit: 10, margin: 1, distance: 300 });
        // 20 sales take 160 iron = 10 purchases, the most Ann has in stock
        expect(flip?.buy.uses).toBe(10);
        expect(flip?.sell.uses).toBe(20);
    });

    test('buys whole lots and counts leftovers as lost', () => {
        const sellsThree = makeTrade({ owner: 'Ann', x: 0, gives: [3, 'IRON_INGOT'], takes: [1, 'EMERALD'], stock: 100 });
        const buysTwo = (stock: number): Trade => makeTrade({ owner: 'Ben', x: 50, gives: [1, 'EMERALD'], takes: [2, 'IRON_INGOT'], stock });

        // 3 sales need 6 iron = 2 lots of 3: paid 2 emeralds, earned 3
        expect(findFlips([sellsThree, buysTwo(3)], { getValue })[0]).toMatchObject({ currency: 'Emerald', profit: 1, buy: { uses: 2 }, sell: { uses: 3 } });
        // 2 sales need 4 iron = 2 lots: no emerald profit, but the reverse loop
        // (2 iron → 1 emerald → 3 iron, twice) still gains 2 iron
        expect(findFlips([sellsThree, buysTwo(2)], { getValue })).toMatchObject([{ currency: 'Iron ingot', profit: 2 }]);
    });

    test('ignores one player\'s own shops, sold-out trades and tiny margins', () => {
        expect(findFlips([annSellsIron(), benBuysIron(20, 'ann')], { getValue })).toEqual([]);
        expect(findFlips([annSellsIron(0), benBuysIron()], { getValue })).toEqual([]);
        const paysTheSame = makeTrade({ owner: 'Ben', x: 300, gives: [1, 'EMERALD'], takes: [16, 'IRON_INGOT'], stock: 20 });
        expect(findFlips([annSellsIron(), paysTheSame], { getValue })).toEqual([]);
    });

    test('never pairs items that only look alike, such as unnamed written books', () => {
        const sellsBook = makeTrade({ owner: 'Ann', x: 0, gives: [1, 'WRITTEN_BOOK'], takes: [1, 'DIAMOND'], stock: 10 });
        const buysBook = makeTrade({ owner: 'Ben', x: 300, gives: [4, 'DIAMOND'], takes: [1, 'WRITTEN_BOOK'], stock: 10 });
        expect(findFlips([sellsBook, buysBook])).toEqual([]);
    });

    test('lists a loop once, counting profit in the more valuable currency', () => {
        const trades = [annSellsIron(), benBuysIron()];
        const emeraldsWorthMore = findFlips(trades, { getValue: name => (name === 'Emerald' ? 1 : 1 / 16) });
        expect(emeraldsWorthMore.map(flip => flip.currency)).toEqual(['Emerald']);
        expect(emeraldsWorthMore[0]?.profitValue).toBe(10);

        const ironWorthMore = findFlips(trades, { getValue: name => (name === 'Emerald' ? 1 : 2) });
        expect(ironWorthMore.map(flip => flip.currency)).toEqual(['Iron ingot']);

        // A currency wins over a more valuable good
        const emeraldIsCurrency = findFlips(trades, { getValue: name => (name === 'Emerald' ? 1 : 2), isCurrency: name => name === 'Emerald' });
        expect(emeraldIsCurrency.map(flip => flip.currency)).toEqual(['Emerald']);
    });

    test('ranks by emerald value of the profit, unvalued currencies last', () => {
        const diamondFlip = [
            makeTrade({ owner: 'Cy', x: 1000, gives: [1, 'GOLD_INGOT'], takes: [1, 'DIAMOND'], stock: 4 }),
            makeTrade({ owner: 'Di', x: 1200, gives: [2, 'DIAMOND'], takes: [1, 'GOLD_INGOT'], stock: 4 }),
        ];
        const flips = findFlips([annSellsIron(), benBuysIron(), ...diamondFlip], { getValue });
        // 4 diamonds (worth 36) beat 10 emeralds
        expect(flips.map(flip => flip.currency)).toEqual(['Diamond', 'Emerald']);
    });
});
