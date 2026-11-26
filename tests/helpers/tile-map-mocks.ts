/**
 * Tile and map mocks for BDD navigation scenarios.
 * Provides colored tile generation, shop data, and map color sampling.
 * @module tests/helpers/tile-map-mocks
 */

import type { Page, Route } from '@playwright/test';

import { BLUE_PIXEL_PNG, RED_PIXEL_PNG } from './png-utilities.js';
import { mockConfigRoute, TILE_ROUTE_PATTERN } from './test-config.js';
import { tileWorldLabel } from './tile-url.js';

/** Colour of the plain overworld mock tile (see {@link BLUE_PIXEL_PNG}) */
const OVERWORLD_MOCK_COLOR = { r: 0, g: 100, b: 255 };

/** Colour of the plain nether mock tile (see {@link RED_PIXEL_PNG}) */
const NETHER_MOCK_COLOR = { r: 255, g: 50, b: 50 };

/**
 * Answer a tile request the way the map server does for tiles it has not
 * rendered: HTTP 200 with an empty body, which the browser cannot decode.
 * @param route
 */
export async function fulfillMissingTile(route: Route): Promise<void> {
    await route.fulfill({ status: 200, contentType: 'image/png', body: '' });
}

/**
 * Sets up colored tile mocks based on world in URL
 * - Overworld tiles: Blue
 * - Nether tiles: Red
 *
 * Mocks the map server for every tile, so no availability list is needed.
 * @param page
 */
export async function setupColoredTileMocks(page: Page): Promise<void> {
    await page.route(TILE_ROUTE_PATTERN, async (route: Route) => {
        const isNether = tileWorldLabel(route.request().url()) === 'nether';

        await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: isNether ? RED_PIXEL_PNG : BLUE_PIXEL_PNG
        });
    });
}

/**
 * Mock data with shops in both overworld and nether
 * Includes multiple shops for testing route display, timeline, and coordinate display
 */
export const MULTI_WORLD_SHOP_DATA = {
    data: [
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
        },
        {
            shopName: 'Enchanted Items Shop',
            shopOwner: 'EnchantOwner',
            location: '50.0, 64.0, 50.0',
            world: 'World',
            recipes: [
                {
                    resultItem: { 
                        type: 'DIAMOND_SWORD', 
                        name: 'Diamond Sword', 
                        amount: 1,
                        enchant: { sharpness: 5, unbreaking: 3 }
                    },
                    item1: { type: 'DIAMOND', name: 'Diamond', amount: 10 },
                    stock: 5
                },
                {
                    resultItem: { 
                        type: 'SHULKER_BOX', 
                        name: '', 
                        amount: 1,
                        lore: ['- 64x DIAMOND', '- 64x DIAMOND', '- 64x EMERALD']
                    },
                    item1: { 
                        type: 'DIAMOND', 
                        name: 'Diamond', 
                        amount: 5,
                        enchant: { fortune: 3 }
                    },
                    item2: { type: 'EMERALD', name: 'Emerald', amount: 2 },
                    stock: 3
                }
            ]
        }
    ]
};

/**
 * Sets up data.json mock with multi-world shops
 * Also mocks config.json to use local data.json path for reliable test interception
 * @param page
 */
export async function setupMultiWorldDataMock(page: Page): Promise<void> {
    await mockConfigRoute(page);
    
    // Intercept data.json requests with mock data
    await page.route('**/data.json', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MULTI_WORLD_SHOP_DATA)
        });
    });
}

/**
 * RGB color type
 */
export interface RGB {
    r: number;
    g: number;
    b: number;
}

/**
 * Get the colour of a tile that is actually displayed on the navigation map.
 *
 * Tiles come from another origin than the app, so their pixels cannot be read
 * back through a canvas. Instead the decoded overlay images are located in the
 * DOM and the colour is that of the mock tile served for their URL.
 * @param page
 */
export async function sampleMapColor(page: Page): Promise<RGB | undefined> {
    const container = page.locator('#nav-dialog-map-container');
    await container.waitFor({ state: 'visible', timeout: 5000 });

    const loadedSources = await page.evaluate(() => {
        const images = document.querySelectorAll<HTMLImageElement>('#nav-dialog-map-container .leaflet-image-layer');
        return [...images]
            .filter(img => img.complete && img.naturalWidth > 0)
            .map(img => img.src);
    });

    const source = loadedSources[0];
    if (source === undefined) { return undefined; }
    return tileWorldLabel(source) === 'nether' ? NETHER_MOCK_COLOR : OVERWORLD_MOCK_COLOR;
}

/**
 * Check if the map is showing overworld (blue-ish color)
 * @param color
 */
export function isBlueColor(color: RGB | undefined): boolean {
    if (!color) {
        return false;
    }
    // Blue has high B, low R
    return color.b > 200 && color.r < 100;
}

/**
 * Check if the map is showing nether (red-ish color)
 * @param color
 */
export function isRedColor(color: RGB | undefined): boolean {
    if (!color) {
        return false;
    }
    // Red has high R, low B
    return color.r > 200 && color.b < 100;
}

/**
 * Wait for map to show a specific world color
 * @param page
 * @param expectedWorld
 * @param timeout
 */
export async function waitForMapWorld(
    page: Page, 
    expectedWorld: 'overworld' | 'nether',
    timeout = 10_000
): Promise<boolean> {
    const checkColor = expectedWorld === 'overworld' ? isBlueColor : isRedColor;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const color = await sampleMapColor(page);
        if (checkColor(color)) {
            return true;
        }
        await page.waitForTimeout(200);
    }
    
    return false;
}
