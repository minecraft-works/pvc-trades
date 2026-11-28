/**
 * Unit tests for the search scope helpers in src/search/scope.ts
 */
import { beforeAll, describe, expect, test } from 'vitest';

import type { Item, Trade } from '../types.js';
import { loadBiomeRules } from './biomes.js';
import {
    buildScopeHref, createItemScopeMatcher, EMPTY_SCOPE, getItemScopeLabels, NO_FILTERS, readScope, removeLastPill, type SearchScope,
} from './scope.js';

beforeAll(async () => { await loadBiomeRules(); });

const BASE = 'https://example.com/pvc-trades/?buy=torch';

const plainItem = (type: string): Item => ({ type, name: '', amount: 1 });
const plainTrade = (result: string): Trade => ({ resultItem: plainItem(result), item1: plainItem('EMERALD') }) as Trade;

describe('scope URL state', () => {
    test('round-trips lenses, biomes, shop and filters, keeping other parameters', () => {
        const scope: SearchScope = {
            buyLens: 'redstone',
            payLens: 'ores',
            buyBiome: 'jungle',
            payBiome: 'the_end',
            shop: { owner: 'ValeriaShares' },
            filters: { ...NO_FILTERS, bestPerItem: true, newOnly: true },
        };
        const href = buildScopeHref(BASE, scope);
        const url = new URL(href);
        expect(url.searchParams.get('buy')).toBe('torch');
        expect(url.searchParams.get('lens')).toBe('redstone');
        expect(url.searchParams.get('paylens')).toBe('ores');
        expect(url.searchParams.get('biome')).toBe('jungle');
        expect(url.searchParams.get('paybiome')).toBe('the_end');
        expect(url.searchParams.get('filters')).toBe('best,new');
        expect(readScope(url.search)).toEqual(scope);
    });

    test('an empty scope removes its parameters', () => {
        const withScope = buildScopeHref(BASE, { ...EMPTY_SCOPE, buyLens: 'food', buyBiome: 'ocean', filters: { ...NO_FILTERS, dealsOnly: true } });
        expect(buildScopeHref(withScope, EMPTY_SCOPE)).toBe(BASE);
    });

    test('ignores unknown lenses, biomes and filters', () => {
        expect(readScope('?lens=nether&biome=moon&filters=deals,sparkly')).toEqual({ ...EMPTY_SCOPE, filters: { ...NO_FILTERS, dealsOnly: true } });
    });
});

describe('removeLastPill', () => {
    const full: SearchScope = {
        buyLens: 'redstone', payLens: 'ores', buyBiome: 'jungle', payBiome: 'ocean', shop: { owner: 'Val' }, filters: { ...NO_FILTERS, dealsOnly: true, newOnly: true },
    };

    test('Backspace in Buying removes filters from the end, then the shop, then the Buying biome and lens', () => {
        const steps: SearchScope[] = [];
        let scope: SearchScope | undefined = full;
        while (scope) {
            steps.push(scope);
            scope = removeLastPill(scope, 'buy');
        }
        const describeStep = (step: SearchScope) => [step.filters.newOnly, step.filters.dealsOnly, step.shop?.owner, step.buyBiome, step.buyLens];
        expect(steps.slice(1).map(step => describeStep(step))).toEqual([
            [false, true, 'Val', 'jungle', 'redstone'],
            [false, false, 'Val', 'jungle', 'redstone'],
            [false, false, undefined, 'jungle', 'redstone'],
            [false, false, undefined, undefined, 'redstone'],
            [false, false, undefined, undefined, undefined],
        ]);
        expect(steps.at(-1)?.payLens).toBe('ores');
    });

    test('Backspace in Paying only removes the Paying biome, then the Paying lens', () => {
        expect(removeLastPill(full, 'pay')).toEqual({ ...full, payBiome: undefined });
        expect(removeLastPill({ ...full, payBiome: undefined }, 'pay')).toEqual({ ...full, payBiome: undefined, payLens: undefined });
        expect(removeLastPill({ ...full, payBiome: undefined, payLens: undefined }, 'pay')).toBeUndefined();
    });
});

describe('createItemScopeMatcher', () => {
    const trades = [plainTrade('COD'), plainTrade('BEEF'), plainTrade('PRISMARINE')];
    const matches = (scope: SearchScope, leaveOut?: Parameters<typeof createItemScopeMatcher>[1]): readonly string[] =>
        trades.filter(createItemScopeMatcher(scope, leaveOut)).map(candidate => candidate.resultItem.type);

    test('a category and a biome on the same side intersect', () => {
        expect(matches({ ...EMPTY_SCOPE, buyLens: 'food', buyBiome: 'ocean' })).toEqual(['COD']);
        expect(matches({ ...EMPTY_SCOPE, buyBiome: 'ocean' })).toEqual(['COD', 'PRISMARINE']);
    });

    test('leaves out one part, to count what the others would show', () => {
        expect(matches({ ...EMPTY_SCOPE, buyLens: 'food', buyBiome: 'ocean' }, 'buyBiome')).toEqual(['COD', 'BEEF']);
        expect(matches({ ...EMPTY_SCOPE, buyLens: 'food', buyBiome: 'ocean' }, 'buy')).toEqual(['COD', 'PRISMARINE']);
    });

    test('a Paying biome checks the cost items', () => {
        expect(matches({ ...EMPTY_SCOPE, payBiome: 'ocean' })).toEqual([]);
    });
});

describe('getItemScopeLabels', () => {
    test('names the lenses and biomes in pill order', () => {
        expect(getItemScopeLabels({ ...EMPTY_SCOPE, buyLens: 'food', buyBiome: 'ocean', payBiome: 'jungle' })).toEqual(['Food', 'Ocean', 'Jungle']);
    });
});
