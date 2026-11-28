import { describe, expect, test } from 'vitest';

import { ADMIN_SHOP_OWNER } from '../constants.js';
import { processTrade } from '../library.js';
import type { Recipe, Shop, Trade } from '../types.js';
import {
    buildShopFilterHref,
    collectShopLocations,
    collectShopSuggestions,
    getRealStock,
    isAdminFilter,
    isAdminShop,
    matchesShopFilter,
    rankShopSuggestions,
    readShopFilter,
    summarizeOwner,
    summarizeShopAt,
} from './shop-filter.js';

const BASE = 'https://example.test/pvc-trades/';

function makeTrade(shop: Partial<Shop>, resultType = 'DIAMOND', stock = 5): Trade {
    const recipe: Recipe = {
        resultItem: { type: resultType, name: '', amount: 1 },
        item1: { type: 'EMERALD', name: '', amount: 4 },
        stock,
    };
    return processTrade(recipe, { location: '0.0, 64.0, 0.0', world: 'World', recipes: [], ...shop }, []);
}

const vendor = { shopName: 'End Item Vendor', shopOwner: '.aus3z', location: '-1087.0, 65.0, -7251.0' };
const bank = { shopName: 'The Bank', shopOwner: '.aus3z', location: '10.0, 64.0, 10.0' };

/**
 * A distinct location per test shop
 * @param index - Shop number
 * @returns Location string
 */
function at(index: number): string {
    return `${index}.0, 64.0, 0.0`;
}

describe('matchesShopFilter', () => {
    test('an owner filter matches all of that owner\'s shops, ignoring case', () => {
        expect(matchesShopFilter(makeTrade(vendor), { owner: '.AUS3Z' })).toBe(true);
        expect(matchesShopFilter(makeTrade(bank), { owner: '.aus3z' })).toBe(true);
        expect(matchesShopFilter(makeTrade({ shopOwner: 'Other' }), { owner: '.aus3z' })).toBe(false);
    });

    test('a shop filter matches only that shop of the owner', () => {
        const filter = { owner: '.aus3z', shop: 'end item vendor' };
        expect(matchesShopFilter(makeTrade(vendor), filter)).toBe(true);
        expect(matchesShopFilter(makeTrade(bank), filter)).toBe(false);
        expect(matchesShopFilter(makeTrade({ shopName: 'End Item Vendor', shopOwner: 'Copycat' }), filter)).toBe(false);
    });

    test('trades without a known owner never match', () => {
        expect(matchesShopFilter(makeTrade({}), { owner: '.aus3z' })).toBe(false);
    });
});

describe('admin shops', () => {
    const adminTrade = makeTrade({ shopName: 'Bulk', shopOwner: ADMIN_SHOP_OWNER }, 'COBBLESTONE', 93_313);
    const playerTrade = makeTrade(vendor, 'ELYTRA', 4);

    test('are told apart from player shops by their owner, ignoring case', () => {
        expect(isAdminShop(adminTrade)).toBe(true);
        expect(isAdminShop({ shopOwner: ADMIN_SHOP_OWNER.toUpperCase() })).toBe(true);
        expect(isAdminShop(playerTrade)).toBe(false);
        expect(isAdminShop({ shopOwner: undefined })).toBe(false);
    });

    test('an admin filter is one on the admin owner, for all admin shops or one of them', () => {
        expect(isAdminFilter({ owner: ADMIN_SHOP_OWNER })).toBe(true);
        expect(isAdminFilter({ owner: ADMIN_SHOP_OWNER, shop: 'Bulk' })).toBe(true);
        expect(isAdminFilter({ owner: '.aus3z' })).toBe(false);
        expect(isAdminFilter(undefined)).toBe(false);
    });

    test('have no real stock to rank by (it is a placeholder for unlimited)', () => {
        expect(getRealStock(adminTrade)).toBeUndefined();
        expect(getRealStock(playerTrade)).toBe(4);
    });
});

describe('collectShopSuggestions', () => {
    const trades = [
        makeTrade(vendor, 'ELYTRA'),
        makeTrade(vendor, 'END_ROD'),
        makeTrade(vendor, 'DRAGON_HEAD', 0),
        makeTrade(bank),
        makeTrade({ shopOwner: 'Nameless', location: '500.0, 64.0, 0.0' }),
    ];

    test('counts in-stock trades and distinct shop locations per owner', () => {
        const owner = collectShopSuggestions(trades).find(s => s.kind === 'owner' && s.label === '.aus3z');
        expect(owner).toEqual({ kind: 'owner', filter: { owner: '.aus3z' }, label: '.aus3z', detail: '2 shops · 3 trades', trades: 3 });
    });

    test('lists named shops with their owner; unnamed shops only through the owner', () => {
        const suggestions = collectShopSuggestions(trades);
        expect(suggestions.find(s => s.label === 'End Item Vendor')).toEqual({
            kind: 'shop',
            filter: { owner: '.aus3z', shop: 'End Item Vendor' },
            label: 'End Item Vendor',
            detail: 'by .aus3z · 2 trades',
            trades: 2,
        });
        expect(suggestions.filter(s => s.filter.owner === 'Nameless').map(s => s.kind)).toEqual(['owner']);
    });

    test('ranking keeps same-named shops of different owners apart', () => {
        const suggestions = collectShopSuggestions([
            makeTrade({ shopName: 'Currency conversion', shopOwner: 'Ann' }),
            makeTrade({ shopName: 'Currency conversion', shopOwner: 'Ben' }),
        ]);
        const ranked = rankShopSuggestions(suggestions, 'currency', 5);
        expect(ranked.map(s => s.detail)).toEqual(['by Ann · 1 trade', 'by Ben · 1 trade']);
    });
});

describe('rankShopSuggestions', () => {
    const suggestions = collectShopSuggestions([
        ...['Ann', 'Ben', 'Cy'].map((owner, index) => makeTrade({ shopName: 'Valuables', shopOwner: owner, location: at(index) })),
        makeTrade({ shopName: 'Valuables', shopOwner: 'Dee', location: at(3) }, 'DIAMOND'),
        makeTrade({ shopName: 'Valuables', shopOwner: 'Dee', location: at(3) }, 'GOLD_INGOT'),
        makeTrade({ shopName: 'Valuables and Services', shopOwner: 'Eve', location: at(4) }),
        makeTrade({ shopName: 'Dark Lantern', shopOwner: 'ValeriaShares', location: at(5) }),
        makeTrade({ shopOwner: 'Bluevalley', location: at(6) }),
    ]);

    test('a player comes before shops that match as well, even with a longer name', () => {
        expect(rankShopSuggestions(suggestions, 'val', 3)[0]).toMatchObject({ kind: 'owner', label: 'ValeriaShares' });
    });

    test('a shop name used by many owners is listed once, the busiest first, before repeats', () => {
        const ranked = rankShopSuggestions(suggestions, 'val', 5);
        expect(ranked.map(s => s.label)).toEqual(['ValeriaShares', 'Valuables', 'Valuables and Services', 'Bluevalley', 'Valuables']);
        expect(ranked[1]?.filter.owner).toBe('Dee');
    });

    test('a shop whose name starts with the text beats a player who only contains it', () => {
        expect(rankShopSuggestions(suggestions, 'valley', 3).map(s => s.label)).toEqual(['Bluevalley']);
        const ranked = rankShopSuggestions(suggestions, 'val', 3).map(s => s.label);
        expect(ranked).not.toContain('Bluevalley');
    });
});

describe('collectShopLocations', () => {
    test('one entry per location that has something in stock', () => {
        const locations = collectShopLocations([
            makeTrade(vendor, 'ELYTRA'),
            makeTrade(vendor, 'END_ROD'),
            makeTrade(bank, 'DIAMOND', 0),
        ]);
        expect(locations).toEqual([{ x: -1087, y: 65, z: -7251, world: 'World', shopName: 'End Item Vendor', shopOwner: '.aus3z' }]);
    });
});

describe('summarizeShopAt', () => {
    const trades = [makeTrade(vendor, 'ELYTRA'), makeTrade(vendor, 'END_ROD'), makeTrade(vendor, 'DRAGON_HEAD', 0), makeTrade(bank)];

    test('describes the shop at a location and how many trades its filter shows', () => {
        // Rows hand over whole-block coordinates
        expect(summarizeShopAt(trades, { x: -1087, y: 65, z: -7251, world: 'World' })).toEqual({
            shopName: 'End Item Vendor',
            shopOwner: '.aus3z',
            filter: { owner: '.aus3z', shop: 'End Item Vendor' },
            tradeCount: 2,
        });
    });

    test('has no filter when the owner is unknown, and nothing for an empty spot', () => {
        expect(summarizeShopAt([makeTrade({})], { x: 0, y: 64, z: 0, world: 'World' })?.filter).toBeUndefined();
        expect(summarizeShopAt(trades, { x: 1, y: 2, z: 3, world: 'World' })).toBeUndefined();
    });
});

describe('summarizeOwner', () => {
    test('counts the in-stock trades across all shops of a player, ignoring case', () => {
        const trades = [makeTrade(vendor, 'ELYTRA'), makeTrade(bank), makeTrade(bank, 'END_ROD', 0), makeTrade({ shopOwner: 'Other' })];
        expect(summarizeOwner(trades, '.AUS3Z')).toEqual({
            shopName: undefined,
            shopOwner: '.aus3z',
            filter: { owner: '.AUS3Z' },
            tradeCount: 2,
        });
    });

    test('a player without shops has no summary; one whose shops are sold out has zero trades', () => {
        expect(summarizeOwner([makeTrade(vendor)], 'Nobody')).toBeUndefined();
        expect(summarizeOwner([makeTrade(vendor, 'ELYTRA', 0)], '.aus3z')?.tradeCount).toBe(0);
    });
});

describe('shop filter in the URL', () => {
    test('round-trips owner and shop while keeping other parameters', () => {
        const href = buildShopFilterHref(`${BASE}?buy=elytra#top`, { owner: '.aus3z', shop: 'End Item Vendor' });
        const url = new URL(href);
        expect(url.searchParams.get('buy')).toBe('elytra');
        expect(url.hash).toBe('#top');
        expect(readShopFilter(url.search)).toEqual({ owner: '.aus3z', shop: 'End Item Vendor' });
    });

    test('removing the filter gives a clean URL; a shop without owner is ignored', () => {
        expect(buildShopFilterHref(`${BASE}?owner=a&shop=b`, undefined)).toBe(BASE);
        expect(readShopFilter('?shop=Orphan')).toBeUndefined();
        expect(readShopFilter('?owner=Larryy')).toEqual({ owner: 'Larryy' });
    });
});
