import { beforeAll, describe, expect, test } from 'vitest';

import { blockConversionsStore } from '../stores/index.js';
import type { CurrencyGraph, Quote } from './currency-graph.js';
import { formatAmount, presentAmount, presentRate } from './rate-presentation.js';

const direct = (buy: number, sell: number): Quote => ({ buy, sell, mid: Math.sqrt(buy * sell), via: [], crossed: false });

/** 1 netherite ingot = 144 / 72 diamonds; 1 gold ingot = 5.2 / 1.3 emeralds */
const QUOTES: Readonly<Record<string, Quote>> = {
    'Netherite ingot|Diamond': direct(144, 72),
    'Diamond|Netherite ingot': direct(1 / 72, 1 / 144),
    'Gold ingot|Emerald': direct(5.2, 1.3),
    'Emerald|Gold ingot': direct(1 / 1.3, 1 / 5.2),
};

const graph: CurrencyGraph = {
    currencies: ['Netherite ingot', 'Diamond', 'Emerald', 'Gold ingot'],
    quote: (item, currency) => QUOTES[`${item}|${currency}`],
};

beforeAll(() => {
    blockConversionsStore._setConversions({
        'diamond block': { base: 'diamond', multiplier: 9 },
        'emerald block': { base: 'emerald', multiplier: 9 },
    });
});

describe('rate presentation', () => {
    test('puts the more valuable currency first and uses blocks for large or whole-block amounts', () => {
        expect(presentRate(graph, 'Diamond', 'Netherite ingot')).toMatchObject({ item: 'Netherite ingot', unit: 'Diamond block', buy: 16, sell: 8 });
        expect(presentRate(graph, 'Emerald', 'Gold ingot')).toMatchObject({ item: 'Gold ingot', unit: 'Emerald', buy: 5.2, sell: 1.3 });
        expect(presentAmount(144, 'Emerald')).toEqual({ amount: 16, unit: 'Emerald block' });
        expect(presentAmount(13, 'Emerald')).toEqual({ amount: 13, unit: 'Emerald' });
    });

    test('rounds to what matters', () => {
        expect(formatAmount(17.2)).toBe('17');
        expect(formatAmount(5.22)).toBe('5.2');
        expect(formatAmount(7.95)).toBe('8');
        expect(formatAmount(1728)).toBe('1,728');
        expect(formatAmount(undefined)).toBe('\u2014');
    });
});
