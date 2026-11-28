/**
 * Shop data with admin shops (the server's spawn shops) next to player shops.
 *
 * The admin shops are made up, but shaped like the ones the shops Worker
 * appends: owner "Server Admins", items without a display name, lore and
 * enchant on custom items, a placeholder stock for "unlimited", shops a few
 * blocks apart at spawn and one in the Nether. Locally the app reads
 * public/data.json, which has no admin shops, so tests add them here (ADR-003).
 */
import type { Page } from '@playwright/test';

import { ADMIN_SHOP_OWNER } from '../../src/constants.js';
import { SHOPS_OR_DATA_ROUTE_REGEX } from './endpoints';
import { mockConfigRoute } from './test-config';

/** The stock admin shops report: a placeholder, their stock is unlimited */
export const ADMIN_PLACEHOLDER_STOCK = 93_313;

const NO_EXTRAS = { lore: [], enchant: {} };

/** Two player shops and three admin shops (5 trades: 2 player, 3 admin) */
export const ADMIN_SHOP_DATA = {
    data: [
        {
            shopName: 'Farm Stand',
            shopOwner: 'PlayerOne',
            location: '400.0, 64.0, 300.0',
            world: 'World',
            recipes: [{ resultItem: { type: 'WHEAT', name: 'Wheat', amount: 16 }, item1: { type: 'EMERALD', name: 'Emerald', amount: 2 }, stock: 12 }],
        },
        {
            shopName: 'Gem Corner',
            shopOwner: 'PlayerTwo',
            location: '-600.0, 70.0, 900.0',
            world: 'World',
            recipes: [{ resultItem: { type: 'DIAMOND', name: 'Diamond', amount: 1 }, item1: { type: 'EMERALD', name: 'Emerald', amount: 9 }, stock: 3 }],
        },
        {
            shopName: 'Spawn Farmer',
            shopOwner: ADMIN_SHOP_OWNER,
            location: '-170.0, 64.0, 130.0',
            world: 'World',
            recipes: [{
                resultItem: { type: 'CARROT', amount: 16, ...NO_EXTRAS },
                item1: { type: 'EMERALD', amount: 4, ...NO_EXTRAS },
                stock: ADMIN_PLACEHOLDER_STOCK,
            }],
        },
        {
            shopName: 'Certificate Clerk',
            shopOwner: ADMIN_SHOP_OWNER,
            location: '-168.0, 64.0, 131.0',
            world: 'World',
            recipes: [{
                resultItem: { type: 'PAPER', name: 'Spawn Voucher', amount: 8, lore: ['Trade it at spawn'], enchant: {} },
                item1: { type: 'EMERALD_BLOCK', amount: 2, ...NO_EXTRAS },
                item2: { type: 'BOOK', name: 'Playtime Token', amount: 1, lore: ['Given for time played'], enchant: { 'minecraft:efficiency': 1 } },
                stock: ADMIN_PLACEHOLDER_STOCK,
            }],
        },
        {
            shopName: 'Nether Gate Trader',
            shopOwner: ADMIN_SHOP_OWNER,
            location: '5.0, 70.0, 2.0',
            world: 'World_nether',
            recipes: [{
                resultItem: { type: 'BLAZE_ROD', amount: 2, ...NO_EXTRAS },
                item1: { type: 'GOLD_INGOT', amount: 6, ...NO_EXTRAS },
                stock: ADMIN_PLACEHOLDER_STOCK,
            }],
        },
    ],
};

/**
 * Serve {@link ADMIN_SHOP_DATA} as the shop data (data.json or the shops Worker).
 * @param page - Page to mock
 */
export async function setupAdminShopDataMock(page: Page): Promise<void> {
    await mockConfigRoute(page);
    await page.route(SHOPS_OR_DATA_ROUTE_REGEX, async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN_SHOP_DATA) });
    });
}
