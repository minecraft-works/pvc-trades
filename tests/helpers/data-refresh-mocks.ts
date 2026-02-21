/**
 * Dynamic data mocks for BDD data-refresh scenarios.
 * Provides controllable shop data that can change between fetches.
 * @module tests/helpers/data-refresh-mocks
 */

import type { Page, Route } from '@playwright/test';
import { mockConfigRoute } from './test-config.js';

/**
 * Shop recipe structure for mock data
 */
export interface MockRecipe {
    resultItem: { type: string; name: string; amount: number };
    item1: { type: string; name: string; amount: number };
    item2?: { type: string; name: string; amount: number };
    stock: number;
}

/**
 * Shop structure for mock data
 */
export interface MockShop {
    shopName: string;
    shopOwner: string;
    location: string;
    world: string;
    recipes: MockRecipe[];
}

/**
 * Dynamic data mock that can be updated between fetches
 */
export interface DynamicDataMock {
    /** Current shops in the mock */
    shops: MockShop[];
    /** Number of times data was fetched */
    fetchCount: number;
    /** Add a new shop */
    addShop(shop: MockShop): void;
    /** Add a new trade to an existing shop or create new shop */
    addTrade(itemName: string, itemType: string, costName: string, costType: string, costAmount: number): void;
    /** Clear all shops */
    clear(): void;
    /** Reset to initial state */
    reset(): void;
    /** Simulate a network error on next fetch */
    setNextFetchError(error: boolean): void;
    /** Increment fetch count (called internally by setupDynamicDataMock) */
    incrementFetchCount(): void;
    /** Check if next fetch should error (and reset flag) */
    shouldError(): boolean;
}

/**
 * Initial shops for dynamic mock - same as MULTI_WORLD_SHOP_DATA
 */
const INITIAL_DYNAMIC_SHOPS: MockShop[] = [
    {
        shopName: 'Overworld Shop',
        shopOwner: 'TestOwner',
        location: '100.0, 64.0, 200.0',
        world: 'World',
        recipes: [
            {
                resultItem: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                item1: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                stock: 10
            }
        ]
    },
    {
        shopName: 'Nether Shop',
        shopOwner: 'NetherOwner', 
        location: '-683.0, 80.0, -101.0',
        world: 'World_nether',
        recipes: [
            {
                resultItem: { type: 'NETHERITE_SCRAP', name: 'Netherite Scrap', amount: 1 },
                item1: { type: 'GOLD_INGOT', name: 'Gold Ingot', amount: 8 },
                stock: 5
            }
        ]
    },
    {
        shopName: 'Diamond Dealer',
        shopOwner: 'DiamondOwner',
        location: '300.0, 64.0, 400.0',
        world: 'World',
        recipes: [
            {
                resultItem: { type: 'DIAMOND', name: 'Diamond', amount: 5 },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 10 },
                stock: 20
            }
        ]
    },
    {
        shopName: 'Far Overworld Shop',
        shopOwner: 'FarOwner',
        location: '800.0, 64.0, 400.0',
        world: 'World',
        recipes: [
            {
                resultItem: { type: 'IRON_INGOT', name: 'Iron Ingot', amount: 16 },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                stock: 64
            }
        ]
    },
    {
        shopName: 'Nether Coords Shop',
        shopOwner: 'NetherCoordsOwner',
        location: '100.0, 64.0, 50.0',
        world: 'World_nether',
        recipes: [
            {
                resultItem: { type: 'BLAZE_ROD', name: 'Blaze Rod', amount: 2 },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 4 },
                stock: 30
            }
        ]
    }
];

/**
 * Creates a dynamic data mock for testing data refresh scenarios
 */
export function createDynamicDataMock(): DynamicDataMock {
    let shops: MockShop[] = structuredClone(INITIAL_DYNAMIC_SHOPS);
    let fetchCount = 0;
    let nextFetchError = false;
    let shopCounter = 100;

    return {
        get shops() { return shops; },
        get fetchCount() { return fetchCount; },
        
        addShop(shop: MockShop) {
            shops.push(shop);
        },
        
        addTrade(itemName: string, itemType: string, costName: string, costType: string, costAmount: number) {
            // Create a new shop with this trade
            shops.push({
                shopName: `New Shop ${shopCounter}`,
                shopOwner: 'NewOwner',
                location: `${shopCounter * 10}.0, 64.0, ${shopCounter * 10}.0`,
                world: 'World',
                recipes: [{
                    resultItem: { type: itemType, name: itemName, amount: 1 },
                    item1: { type: costType, name: costName, amount: costAmount },
                    stock: 10
                }]
            });
            shopCounter++;
        },
        
        clear() {
            shops = [];
        },
        
        reset() {
            shops = structuredClone(INITIAL_DYNAMIC_SHOPS);
            fetchCount = 0;
            nextFetchError = false;
            shopCounter = 100;
        },
        
        setNextFetchError(error: boolean) {
            nextFetchError = error;
        },
        
        incrementFetchCount() {
            fetchCount++;
        },
        
        shouldError(): boolean {
            if (nextFetchError) {
                nextFetchError = false;
                return true;
            }
            return false;
        }
    };
}

/**
 * Sets up dynamic data mock that intercepts both data.json and the Cloudflare Worker URL
 */
export async function setupDynamicDataMock(page: Page, mock: DynamicDataMock): Promise<void> {
    // Intercept both the old data.json path and the new Cloudflare Worker URL
    await page.route(/(data\.json|pvc-shops\.minecraft-works\.workers\.dev)/, async (route: Route) => {
        // Check if we should simulate an error
        if (mock.shouldError()) {
            await route.fulfill({
                status: 500,
                contentType: 'text/plain',
                body: 'Internal Server Error'
            });
            return;
        }
        
        // Increment fetch count
        mock.incrementFetchCount();
        
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: mock.shops })
        });
    });
}

/**
 * Sets up dynamic data mock with fast refresh interval for testing
 * Overrides config to use a shorter refresh interval and local data.json path
 */
export async function setupFastRefreshConfig(page: Page, refreshMs: number = 2000): Promise<void> {
    await mockConfigRoute(page, { dataRefreshMs: refreshMs });
}
