/**
 * Unit tests for the search scope helpers in src/search/scope.ts
 */
import { describe, expect, test } from 'vitest';

import { buildScopeHref, EMPTY_SCOPE, NO_FILTERS, readScope, removeLastPill, type SearchScope } from './scope.js';

const BASE = 'https://example.com/pvc-trades/?buy=torch';

describe('scope URL state', () => {
    test('round-trips lenses, shop and filters, keeping other parameters', () => {
        const scope: SearchScope = {
            buyLens: 'redstone',
            payLens: 'ores',
            shop: { owner: 'ValeriaShares' },
            filters: { ...NO_FILTERS, bestPerItem: true, newOnly: true },
        };
        const href = buildScopeHref(BASE, scope);
        const url = new URL(href);
        expect(url.searchParams.get('buy')).toBe('torch');
        expect(url.searchParams.get('lens')).toBe('redstone');
        expect(url.searchParams.get('paylens')).toBe('ores');
        expect(url.searchParams.get('filters')).toBe('best,new');
        expect(readScope(url.search)).toEqual(scope);
    });

    test('an empty scope removes its parameters', () => {
        const withScope = buildScopeHref(BASE, { ...EMPTY_SCOPE, buyLens: 'food', filters: { ...NO_FILTERS, dealsOnly: true } });
        expect(buildScopeHref(withScope, EMPTY_SCOPE)).toBe(BASE);
    });

    test('ignores unknown lenses and filters', () => {
        expect(readScope('?lens=nether&filters=deals,sparkly')).toEqual({ ...EMPTY_SCOPE, filters: { ...NO_FILTERS, dealsOnly: true } });
    });
});

describe('removeLastPill', () => {
    const full: SearchScope = {
        buyLens: 'redstone', payLens: 'ores', shop: { owner: 'Val' }, filters: { ...NO_FILTERS, dealsOnly: true, newOnly: true },
    };

    test('Backspace in Buying removes filters from the end, then the shop, then the Buying lens', () => {
        const steps: SearchScope[] = [];
        let scope: SearchScope | undefined = full;
        while (scope) {
            steps.push(scope);
            scope = removeLastPill(scope, 'buy');
        }
        expect(steps.slice(1).map(step => [step.filters.newOnly, step.filters.dealsOnly, step.shop?.owner, step.buyLens])).toEqual([
            [false, true, 'Val', 'redstone'],
            [false, false, 'Val', 'redstone'],
            [false, false, undefined, 'redstone'],
            [false, false, undefined, undefined],
        ]);
        expect(steps.at(-1)?.payLens).toBe('ores');
    });

    test('Backspace in Paying only removes the Paying lens', () => {
        expect(removeLastPill(full, 'pay')).toEqual({ ...full, payLens: undefined });
        expect(removeLastPill({ ...full, payLens: undefined }, 'pay')).toBeUndefined();
    });
});
