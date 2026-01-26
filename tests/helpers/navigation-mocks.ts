/**
 * Test helpers for multi-world navigation scenarios
 * Provides mocks for player API and colored tile generation
 */

import type { Page, Route } from '@playwright/test';
import { deflateSync } from 'node:zlib';

/**
 * Create a 1x1 PNG with a specific color
 * PNG format: 8-byte header + IHDR + IDAT + IEND
 */
function createColoredPng(r: number, g: number, b: number): Buffer {
    // Minimal 1x1 PNG with specified RGB color
    // This is a valid PNG file structure
    const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    // IHDR chunk: width=1, height=1, bit depth=8, color type=2 (RGB)
    const ihdrData = Buffer.from([
        0x00, 0x00, 0x00, 0x01, // width
        0x00, 0x00, 0x00, 0x01, // height
        0x08, // bit depth
        0x02, // color type (RGB)
        0x00, // compression
        0x00, // filter
        0x00  // interlace
    ]);
    const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
    const ihdr = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x0D]), // length
        Buffer.from('IHDR'),
        ihdrData,
        ihdrCrc
    ]);
    
    // IDAT chunk: compressed image data
    // For 1x1 RGB: filter byte (0) + R + G + B, then deflate compressed
    const rawData = Buffer.from([0x00, r, g, b]); // filter byte + RGB
    const compressed = deflateSync(rawData);
    const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
    const idat = Buffer.concat([
        Buffer.alloc(4),
        Buffer.from('IDAT'),
        compressed,
        idatCrc
    ]);
    idat.writeUInt32BE(compressed.length, 0);
    
    // IEND chunk
    const iendCrc = crc32(Buffer.from('IEND'));
    const iend = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x00]), // length
        Buffer.from('IEND'),
        iendCrc
    ]);
    
    return Buffer.concat([header, ihdr, idat, iend]);
}

// CRC32 lookup table
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xED_B8_83_20 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
}

function crc32(data: Buffer): Buffer {
    let crc = 0xFF_FF_FF_FF;
    for (const datum of data) {
        crc = crcTable[(crc ^ datum!) & 0xFF]! ^ (crc >>> 8);
    }
    crc = crc ^ 0xFF_FF_FF_FF;
    const result = Buffer.alloc(4);
    result.writeUInt32BE(crc >>> 0, 0);
    return result;
}

// Blue (RGB: 0, 100, 255) for overworld
const BLUE_PIXEL_PNG = createColoredPng(0, 100, 255);
// Red (RGB: 255, 50, 50) for nether  
const RED_PIXEL_PNG = createColoredPng(255, 50, 50);

export interface PlayerState {
    uuid: string;
    name: string;
    foreign: boolean;
    position: {
        x: number;
        y: number;
        z: number;
    };
    rotation?: {
        pitch: number;
        yaw: number;
        roll: number;
    };
    world?: string;
}

export interface PlayerMock {
    /** Current player state */
    state: PlayerState;
    /** Update player position/world */
    setPosition(x: number, z: number, world?: string): void;
    /** Move player to nether */
    moveToNether(x?: number, z?: number): void;
    /** Move player to overworld */
    moveToOverworld(x?: number, z?: number): void;
}

/**
 * Creates a controllable player mock
 */
export function createPlayerMock(initialWorld: string = 'World'): PlayerMock {
    const state: PlayerState = {
        uuid: 'test-uuid-1234',
        name: 'TestPlayer',
        foreign: initialWorld === 'World_nether' || initialWorld.toLowerCase().includes('nether'),
        position: {
            x: 0,
            y: 64,
            z: 0
        },
        rotation: {
            pitch: 0,
            yaw: 0,
            roll: 0
        },
        world: initialWorld
    };

    return {
        state,
        setPosition(x: number, z: number, world?: string) {
            state.position.x = x;
            state.position.z = z;
            if (world) {
                state.world = world;
                state.foreign = world === 'World_nether' || world.toLowerCase().includes('nether');
            }
        },
        moveToNether(x = -100, z = -12) {
            state.position.x = x;
            state.position.z = z;
            state.world = 'World_nether';
            state.foreign = true;
        },
        moveToOverworld(x = 0, z = 0) {
            state.position.x = x;
            state.position.z = z;
            state.world = 'World';
            state.foreign = false;
        }
    };
}

/**
 * Multi-player mock for testing multiple players on map
 */
export interface MultiPlayerMock {
    /** All player states */
    players: PlayerState[];
    /** Add a player */
    addPlayer(name: string, x: number, z: number, world: string): void;
    /** Clear all players */
    clear(): void;
    /** Get player by name */
    getPlayer(name: string): PlayerState | undefined;
}

/**
 * Creates a multi-player mock for testing player markers
 */
export function createMultiPlayerMock(): MultiPlayerMock {
    const players: PlayerState[] = [];
    let nextId = 1;

    return {
        players,
        addPlayer(name: string, x: number, z: number, world: string) {
            const isNether = world === 'World_nether' || world.toLowerCase().includes('nether');
            players.push({
                uuid: `test-uuid-${nextId++}`,
                name,
                foreign: isNether,
                position: { x, y: 64, z },
                rotation: { pitch: 0, yaw: 0, roll: 0 },
                world: isNether ? 'World_nether' : 'World'
            });
        },
        clear() {
            players.length = 0;
        },
        getPlayer(name: string) {
            return players.find(p => p.name === name);
        }
    };
}

/**
 * Sets up player API mock that returns the current player state
 */
export async function setupPlayerApiMock(page: Page, playerMock: PlayerMock): Promise<void> {
    await page.route('**/pvc-players.minecraft-works.workers.dev**', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                players: [playerMock.state]
            })
        });
    });
}

/**
 * Sets up player API mock that returns multiple players
 */
export async function setupMultiPlayerApiMock(page: Page, multiPlayerMock: MultiPlayerMock): Promise<void> {
    await page.route('**/pvc-players.minecraft-works.workers.dev**', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                players: multiPlayerMock.players
            })
        });
    });
}

/**
 * Sets up colored tile mocks based on world in URL
 * - Overworld tiles: Blue
 * - Nether tiles: Red
 */
export async function setupColoredTileMocks(page: Page): Promise<void> {
    await page.route('**/tiles/**/*.png', async (route: Route) => {
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
        const manifestEntries: Array<{ world: string; tileX: number; tileZ: number; blocksPerTile: number }> = [];
        
        // Generate manifest entries for a range of tiles around 0,0 and nether shop location
        const worlds = ['overworld', 'the_nether'];
        const blocksPerTileOptions = [512, 8192]; // zoom 8 and zoom 4
        
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
        }
    ]
};

/**
 * Sets up data.json mock with multi-world shops
 * Also mocks config.json to use local data.json path for reliable test interception
 */
export async function setupMultiWorldDataMock(page: Page): Promise<void> {
    // Mock config.json to use local data.json path (avoids cross-origin interception issues)
    await page.route('**/config.json', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                dataUrl: 'data.json',
                dataRefreshMs: 60_000,
                dynmap: {
                    baseUrl: 'https://web.peacefulvanilla.club/maps',
                    tileSize: 128,
                    defaultZoom: 4,
                    maxZoomLevel: 7,
                    playerRefreshMs: 1000
                },
                analysis: {
                    shopClusterDistance: 16,
                    maxTransitiveIterations: 10,
                    minIndependentShops: 3
                }
            })
        });
    });
    
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
 */
export async function sampleMapColor(page: Page): Promise<RGB | null> {
    // Wait for the map container to be visible
    const container = page.locator('#nav-dialog-map-container');
    await container.waitFor({ state: 'visible', timeout: 5000 });

    // Sample color from the center of any loaded tile image
    const color = await page.evaluate(() => {
        const container = document.querySelector('#nav-dialog-map-container');
        if (!container) {
            console.log('[sampleMapColor] No container found');
            return null; // eslint-disable-line unicorn/no-null -- browser context
        }

        // Find any image overlay in the Leaflet pane
        const images = container.querySelectorAll('.leaflet-image-layer') as NodeListOf<HTMLImageElement>;
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

    return color;
}

/**
 * Check if the map is showing overworld (blue-ish color)
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
 */
export async function waitForMapWorld(
    page: Page, 
    expectedWorld: 'overworld' | 'nether',
    timeout: number = 10_000
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

// ============================================================================
// Dynamic Data Mock for Refresh Testing
// ============================================================================

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
    await page.route('**/config.json', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                dataUrl: 'data.json',
                dataRefreshMs: refreshMs,
                dynmap: {
                    baseUrl: 'https://web.peacefulvanilla.club/maps',
                    tileSize: 128,
                    defaultZoom: 4,
                    maxZoomLevel: 7,
                    playerRefreshMs: 1000
                },
                analysis: {
                    shopClusterDistance: 16,
                    maxTransitiveIterations: 10,
                    minIndependentShops: 3
                }
            })
        });
    });
}
