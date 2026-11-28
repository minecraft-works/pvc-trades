/**
 * Unit tests for the search scope helpers in src/search/scope.ts
 */
import { describe, expect, test } from 'vitest';

import { ADMIN_SHOP_OWNER } from '../constants.js';
import { buildScopeHref, EMPTY_SCOPE, NO_FILTERS, readScope, removeLastPill, type SearchScope, withFilter, withShop } from './scope.js';

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

describe('admin shops in the scope', () => {
    const adminShops = { owner: ADMIN_SHOP_OWNER };
    const hidden: SearchScope = { ...EMPTY_SCOPE, filters: { ...NO_FILTERS, hideAdmin: true, dealsOnly: true } };

    test('showing the admin shops turns off "Hide admin shops", and only that filter', () => {
        expect(withShop(hidden, adminShops)).toEqual({ ...hidden, shop: adminShops, filters: { ...hidden.filters, hideAdmin: false } });
        expect(withShop(hidden, { owner: '.aus3z' }).filters.hideAdmin).toBe(true);
    });

    test('hiding the admin shops drops an admin shop filter, but keeps a player one', () => {
        const showing = withShop(EMPTY_SCOPE, { owner: ADMIN_SHOP_OWNER, shop: 'Bulk' });
        expect(withFilter(showing, 'hideAdmin', true)).toEqual({ ...EMPTY_SCOPE, filters: { ...NO_FILTERS, hideAdmin: true } });
        expect(withFilter({ ...EMPTY_SCOPE, shop: { owner: '.aus3z' } }, 'hideAdmin', true).shop).toEqual({ owner: '.aus3z' });
    });

    test('round-trip through the URL, where an admin shop filter wins over hiding them', () => {
        const href = buildScopeHref(BASE, hidden);
        expect(new URL(href).searchParams.get('filters')).toBe('deals,noadmin');
        expect(readScope(new URL(href).search)).toEqual(hidden);
        expect(readScope(`?owner=${encodeURIComponent(ADMIN_SHOP_OWNER)}&filters=noadmin`))
            .toEqual({ ...EMPTY_SCOPE, shop: adminShops });
    });
});
