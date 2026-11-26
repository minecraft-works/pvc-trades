/**
 * Unit tests for the fast-search helpers in src/search/query.ts
 */
import { describe, expect, test } from 'vitest';

import type { Trade } from '../types.js';
import {
    buildSearchHref,
    collectItemNames,
    formatUnitPrice,
    parseExactQuery,
    pickBestPerItem,
    rankSuggestions,
    readSearchTerms,
    toExactQuery,
} from './query.js';

const BASE = 'https://example.com/pvc-trades/';

describe('exact queries', () => {
    test('quoted text is an exact query, unquoted is not', () => {
        expect(parseExactQuery('"Emerald Block"')).toBe('emerald block');
        expect(parseExactQuery('  "emerald" ')).toBe('emerald');
        expect(parseExactQuery('emerald')).toBeUndefined();
        expect(parseExactQuery('""')).toBeUndefined();
        expect(parseExactQuery('"emerald')).toBeUndefined();
    });

    test('toExactQuery round-trips through parseExactQuery', () => {
        expect(parseExactQuery(toExactQuery('Diamond block'))).toBe('diamond block');
    });
});

describe('URL search terms', () => {
    test('reads terms and defaults to empty strings', () => {
        expect(readSearchTerms('?buy=diamond&pay=%22emerald%22')).toEqual({ buy: 'diamond', pay: '"emerald"' });
        expect(readSearchTerms('')).toEqual({ buy: '', pay: '' });
    });

    test('sets terms, removes empty ones and keeps other parameters and the hash', () => {
        const href = buildSearchHref(`${BASE}?debug=1&buy=old#top`, 'netherite ingot', '');
        const url = new URL(href);
        expect(url.searchParams.get('buy')).toBe('netherite ingot');
        expect(url.searchParams.has('pay')).toBe(false);
        expect(url.searchParams.get('debug')).toBe('1');
        expect(url.hash).toBe('#top');
        expect(readSearchTerms(url.search).buy).toBe('netherite ingot');
    });

    test('a cleared search gives a clean URL', () => {
        expect(buildSearchHref(`${BASE}?buy=diamond&pay=emerald`, ' ', '')).toBe(BASE);
    });
});

describe('rankSuggestions', () => {
    const names = ['Diamond block', 'Diamond', 'Cut diamond', 'Polished diorite', 'Emerald'];

    test('prefix matches first, then word starts, then substrings; shorter first', () => {
        expect(rankSuggestions(names, 'dia', 10)).toEqual(['Diamond', 'Diamond block', 'Cut diamond']);
        expect(rankSuggestions(['Cobblestone', 'Stone', 'Redstone', 'Stone bricks'], 'stone', 10)).toEqual(['Stone', 'Stone bricks', 'Redstone', 'Cobblestone']);
        expect(rankSuggestions(['Cut diamond', 'Diamond'], 'dia', 10)).toEqual(['Diamond', 'Cut diamond']);
    });

    test('respects the limit and ignores empty queries', () => {
        expect(rankSuggestions(names, 'd', 2)).toHaveLength(2);
        expect(rankSuggestions(names, '  ', 5)).toEqual([]);
    });
});

describe('formatUnitPrice', () => {
    test('shows cost per item when one item costs at least one unit', () => {
        expect(formatUnitPrice(5, 2)).toBe('2.5 each');
        expect(formatUnitPrice(1000, 3)).toBe('333 each');
    });

    test('shows items per cost unit when items are cheaper than one unit', () => {
        expect(formatUnitPrice(1, 16)).toBe('16 for 1');
        expect(formatUnitPrice(3, 64)).toBe('21.33 for 1');
    });

    test('is empty for invalid amounts', () => {
        expect(formatUnitPrice(0, 5)).toBe('');
        expect(formatUnitPrice(5, 0)).toBe('');
    });
});

describe('pickBestPerItem', () => {
    interface Offer { name: string; percent: number | undefined; stock: number }
    const pick = (offers: Offer[]) => pickBestPerItem(offers, o => o.name, o => o.percent, o => o.stock);

    test('keeps the lowest deviation per item', () => {
        const offers = [
            { name: 'beef', percent: 10, stock: 5 },
            { name: 'beef', percent: -30, stock: 1 },
            { name: 'pork', percent: 0, stock: 1 },
        ];
        expect(pick(offers)).toEqual([offers[1], offers[2]]);
    });

    test('a known deviation beats an unknown one; stock breaks ties', () => {
        const unknown = { name: 'beef', percent: undefined, stock: 99 };
        const known = { name: 'beef', percent: 50, stock: 1 };
        expect(pick([unknown, known])).toEqual([known]);

        const small = { name: 'pork', percent: -10, stock: 2 };
        const large = { name: 'pork', percent: -10, stock: 20 };
        expect(pick([small, large])).toEqual([large]);
    });
});

describe('collectItemNames', () => {
    test('collects unique received (including shulker contents) and paid names', () => {
        const trades = [
            {
                resultName: 'Diamond', shulkerItems: undefined,
                item1: { type: 'EMERALD', name: '', amount: 1 }, item2: { type: 'GOLD_INGOT', name: '', amount: 1 },
            },
            {
                resultName: 'diamond', shulkerItems: [{ key: 'sand', name: 'Sand', total: 64 }],
                item1: { type: 'EMERALD', name: '', amount: 2 }, item2: undefined,
            },
        ] as unknown as Trade[];
        const names = collectItemNames(trades);
        expect(names.want).toEqual(['Diamond', 'Sand']);
        expect(names.give).toEqual(['Emerald', 'Gold ingot']);
    });
});
