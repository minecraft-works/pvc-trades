/**
 * Tile and map mocks for BDD navigation scenarios.
 * Provides colored tile generation, shop data, and map color sampling.
 * @module tests/helpers/tile-map-mocks
 */

import type { Page, Route } from '@playwright/test';

import { BLUE_PIXEL_PNG, RED_PIXEL_PNG } from './png-utilities.js';
import { mockConfigRoute, TILE_ROUTE_PATTERN } from './test-config.js';

/**
 * Sets up colored tile mocks based on world in URL
 * - Overworld tiles: Blue
 * - Nether tiles: Red
 * @param page
 */
export async function setupColoredTileMocks(page: Page): Promise<void> {
    await page.route(TILE_ROUTE_PATTERN, async (route: Route) => {
        const url = route.request().url();
        const isNether = url.includes('/the_nether/');
        
        await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: isNether ? RED_PIXEL_PNG : BLUE_PIXEL_PNG
        });
    });

    // Mock the manifest with entries for common tile coordinates
    // This ensures tiles will be loaded by the app
    await page.route('**/tiles/manifest.json', async (route: Route) => {
        const manifestEntries: { world: string; tileX: number; tileZ: number; blocksPerTile: number }[] = [];
        
        // Generate manifest entries for a range of tiles around 0,0 and nether shop location
        const worlds = ['overworld', 'the_nether'];
        const blocksPerTileOptions = [256, 4096]; // detail level 2 and overview level 0
        
        for (const world of worlds) {
            for (const blocksPerTile of blocksPerTileOptions) {
                // Cover tiles around origin and common test locations
                for (let tx = -10; tx <= 10; tx++) {
                    for (let tz = -10; tz <= 10; tz++) {
                        manifestEntries.push({ world, tileX: tx, tileZ: tz, blocksPerTile });
                    }
                }
            }
        }
        
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(manifestEntries)
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
 * Sample a pixel color from the navigation map canvas
 * Leaflet renders to a container with multiple image overlays
 * Note: Leaflet uses blob URLs, so we can't filter by original URL path
 * @param page
 */
export async function sampleMapColor(page: Page): Promise<RGB | null> {
    // Wait for the map container to be visible
    const container = page.locator('#nav-dialog-map-container');
    await container.waitFor({ state: 'visible', timeout: 5000 });

    // Sample color from the center of any loaded tile image
    return await page.evaluate(() => {
        const container = document.querySelector('#nav-dialog-map-container');
        if (!container) {
            console.log('[sampleMapColor] No container found');
            return null; // eslint-disable-line unicorn/no-null -- browser context
        }

        // Find any image overlay in the Leaflet pane
        const images = container.querySelectorAll('.leaflet-image-layer');
        console.log(`[sampleMapColor] Found ${images.length} image layers`);
        
        if (images.length === 0) {
            return null; // eslint-disable-line unicorn/no-null -- browser context
        }
        
        // Find a loaded image
        for (const img of images) {
            if (!img.complete || img.naturalWidth === 0) {
                continue;
            }
            
            // Create canvas to sample the image
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const context = canvas.getContext('2d');
            if (!context) {
                continue;
            }

            try {
                context.drawImage(img, 0, 0, 1, 1);
                const pixel = context.getImageData(0, 0, 1, 1).data;
                console.log(`[sampleMapColor] Sampled pixel: R=${pixel[0]}, G=${pixel[1]}, B=${pixel[2]}`);
                return { r: pixel[0], g: pixel[1], b: pixel[2] };
            } catch (error) {
                console.log('[sampleMapColor] Error sampling image:', error);
                // CORS or other error, try next image
                continue;
            }
        }
        
        console.log('[sampleMapColor] No valid image found to sample');
        return null; // eslint-disable-line unicorn/no-null -- browser context
    });
}

/**
 * Check if the map is showing overworld (blue-ish color)
 * @param color
 */
export function isBlueColor(color: RGB | null): boolean {
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
export function isRedColor(color: RGB | null): boolean {
    if (!color) {
        return false;
    }
    // Red has high R, low B
    return color.r > 200 && color.b < 100;
}

/**
 * Wait for map to show a specific world color
 * Since Leaflet uses blob URLs, we can't filter by world URL
 * Instead, we just sample the color and check if it matches expectations
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
        // Don't filter by world since blob URLs don't preserve the original path
        const color = await sampleMapColor(page);
        if (checkColor(color)) {
            return true;
        }
        await page.waitForTimeout(200);
    }
    
    return false;
}
