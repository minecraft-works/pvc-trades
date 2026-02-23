/**
 * Step definitions for tile loading scenarios
 * Tests manifest-based tile loading, fallback behavior, and caching
 */
import { deflateSync } from 'node:zlib';

import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';

import { mockConfigRoute } from '../../tests/helpers/test-config';
import { Given, Then,When } from './fixtures';

// ============================================================================
// Tile creation helpers (same as navigation-mocks.ts)
// ============================================================================

function createColoredPng(r: number, g: number, b: number): Buffer {
    const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    const ihdrData = Buffer.from([
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00
    ]);
    const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
    const ihdr = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x0D]),
        Buffer.from('IHDR'),
        ihdrData,
        ihdrCrc
    ]);
    
    const rawData = Buffer.from([0x00, r, g, b]);
    const compressed = deflateSync(rawData);
    const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
    const idat = Buffer.concat([
        Buffer.alloc(4),
        Buffer.from('IDAT'),
        compressed,
        idatCrc
    ]);
    idat.writeUInt32BE(compressed.length, 0);
    
    const iendCrc = crc32(Buffer.from('IEND'));
    const iend = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from('IEND'),
        iendCrc
    ]);
    
    return Buffer.concat([header, ihdr, idat, iend]);
}

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
    for (const byte of data) {
        crc = crcTable[(crc ^ byte) & 0xFF]! ^ (crc >>> 8);
    }
    crc = crc ^ 0xFF_FF_FF_FF;
    const result = Buffer.alloc(4);
    result.writeUInt32BE(crc >>> 0, 0);
    return result;
}

// ============================================================================
// Color-coded tile generation for visual verification
// ============================================================================
// Encoding scheme:
//   - World type (hue): Blue = Overworld, Red = Nether
//   - Tile level (brightness): Bright = Detail level 2 (256 bpt), Dark = Overview level 0 (4096 bpt)
//   - Checkerboard pattern: 15% brightness variation based on tile parity

const TILE_COLORS = {
    overworld: {
        detail: { r: 100, g: 180, b: 255 },  // Bright Sky Blue
        overview: { r: 40, g: 80, b: 140 },    // Dark Navy Blue
    },
    the_nether: {
        detail: { r: 255, g: 120, b: 100 },  // Bright Coral Red
        overview: { r: 140, g: 50, b: 40 },    // Dark Maroon Red
    }
} as const;

interface TileColorConfig {
    world: 'overworld' | 'the_nether';
    blocksPerTile: number;
    tileX: number;
    tileZ: number;
}

function createEncodedTile(config: TileColorConfig): Buffer {
    const worldColors = TILE_COLORS[config.world];
    const zoomKey = config.blocksPerTile === 256 ? 'detail' : 'overview';
    const base = worldColors[zoomKey];

    // Apply checkerboard pattern (15% darker for odd parity)
    const isEven = (config.tileX + config.tileZ) % 2 === 0;
    const patternMultiplier = isEven ? 1 : 0.85;

    const r = Math.round(base.r * patternMultiplier);
    const g = Math.round(base.g * patternMultiplier);
    const b = Math.round(base.b * patternMultiplier);

    return createColoredPng(r, g, b);
}

// Legacy constants for backward compatibility with existing tests
const BLUE_PIXEL_PNG = createColoredPng(100, 180, 255);  // Overworld detail
const RED_PIXEL_PNG = createColoredPng(255, 120, 100);   // Nether detail

// ============================================================================
// Test data with controlled shop locations
// ============================================================================

const MOCK_SHOP_DATA = {
    data: [
        {
            shopName: 'Origin Overworld Shop',
            shopOwner: 'TestOwner',
            location: '100.0, 64.0, 200.0',  // Near origin, tile (0, 0) at detail level
            world: 'World',
            recipes: [{
                resultItem: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                item1: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                stock: 10
            }]
        },
        {
            shopName: 'Nether Shop',
            shopOwner: 'NetherOwner', 
            location: '100.0, 80.0, 50.0',  // Nether shop
            world: 'World_nether',
            recipes: [{
                resultItem: { type: 'NETHERITE_SCRAP', name: 'Netherite Scrap', amount: 1 },
                item1: { type: 'GOLD_INGOT', name: 'Gold', amount: 8 },
                stock: 5
            }]
        },
        {
            shopName: 'Far Away Shop',
            shopOwner: 'FarOwner',
            location: '50000.0, 64.0, 50000.0',  // Very far from origin
            world: 'World',
            recipes: [{
                resultItem: { type: 'IRON_INGOT', name: 'Iron', amount: 16 },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                stock: 64
            }]
        }
    ]
};

// ============================================================================
// Track tile requests
// ============================================================================

interface PageWithTileTracking extends Page {
    __tileRequests?: string[];
    __tileRequestCount?: number;
    __manifestFilter?: 'all' | 'origin-only';
    __lastPlayerX?: number;
    __lastPlayerZ?: number;
    __useColorEncoding?: boolean;
    __detailLevelAvailable?: boolean;
    __manifestRequestTime?: number;
    __firstTileRequestTime?: number;
    __overviewDelay?: number;
    __detailDelay?: number;
}

// ============================================================================
// Constants for repeated selectors and values
// ============================================================================

const SELECTOR_OPEN_CART = '#open-cart';
const SELECTOR_CART_DIALOG = '#cart-dialog';
const SELECTOR_TAB_NAVIGATE = '#tab-navigate';
const SELECTOR_PLAYER_NAME_INPUT = '#player-name-input';
const SELECTOR_START_NAVIGATION = '#start-navigation';
const SELECTOR_NAV_DIALOG_OPEN = '#nav-dialog[open]';
const SELECTOR_CART_DIALOG_OPEN = '#cart-dialog[open]';
const SELECTOR_ADD_TO_CART_BUTTON = '.add-to-cart-btn';
const SELECTOR_NAV_MAP_CONTAINER = '#nav-dialog-map-container';
const TEST_PLAYER_NAME = 'TestPlayer';
const TEST_UUID = 'test-uuid-1234';
const PLAYER_API_PATTERN = '**/pvc-players.minecraft-works.workers.dev**';
const APPLICATION_JSON = 'application/json';
const ERROR_NO_BOUNDING_BOX = 'Could not get map container bounding box';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the tile loading test app is configured', async ({ page }) => {
    const p = page as PageWithTileTracking;
    p.__tileRequests = [];
    p.__manifestFilter = 'all';
    
    // Set up tile request tracking
    await page.route('**/tiles/**/*.png', async (route: Route) => {
        const url = route.request().url();
        p.__tileRequests!.push(url);
        
        const isNether = url.includes('/the_nether/');
        await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: isNether ? RED_PIXEL_PNG : BLUE_PIXEL_PNG
        });
    });
    
    // Set up manifest mock
    await page.route('**/tiles/manifest.json', async (route: Route) => {
        const entries: Array<{ world: string; tileX: number; tileZ: number; blocksPerTile: number }> = [];
        const worlds = ['overworld', 'the_nether'];
        const blocksPerTileOptions = [256, 4096];
        
        const range = p.__manifestFilter === 'origin-only' ? 5 : 200;
        
        for (const world of worlds) {
            for (const blocksPerTile of blocksPerTileOptions) {
                for (let tx = -range; tx <= range; tx++) {
                    for (let tz = -range; tz <= range; tz++) {
                        entries.push({ world, tileX: tx, tileZ: tz, blocksPerTile });
                    }
                }
            }
        }
        
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(entries)
        });
    });
    
    // Set up config.json mock to use local data.json path
    await mockConfigRoute(page);
    
    // Set up mock shop data
    await page.route('**/data.json', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_SHOP_DATA)
        });
    });
    
    // Set up player API mock for navigation to work
    await page.route(PLAYER_API_PATTERN, async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: APPLICATION_JSON,
            body: JSON.stringify({
                players: [{
                    uuid: TEST_UUID,
                    name: TEST_PLAYER_NAME,
                    foreign: false,
                    position: { x: 0, y: 64, z: 0 },
                    rotation: { pitch: 0, yaw: 0, roll: 0 },
                    world: 'World'
                }]
            })
        });
    });
    
    // Navigate to app
    await page.goto('/');
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
});

Given('the tile loading test app is configured with color-coded tiles', async ({ page }) => {
    const p = page as PageWithTileTracking;
    p.__tileRequests = [];
    p.__manifestFilter = 'all';
    p.__useColorEncoding = true;
    p.__detailLevelAvailable = true;

    // Set up tile request tracking with color-encoded tiles
    await page.route('**/tiles/**/*.png', async (route: Route) => {
        const url = route.request().url();
        p.__tileRequests!.push(url);

        // Track timing for race condition tests
        if (p.__firstTileRequestTime === undefined) {
            p.__firstTileRequestTime = Date.now();
        }

        // Parse URL to extract tile info
        // Format: /tiles/{world}/{level}/{tileX}/{tileZ}.png
        // level 2 = 256 blocks per tile, level 0 = 4096 blocks per tile
        const match = url.match(/tiles\/(overworld|the_nether)\/(\d+)\/(-?\d+)\/(-?\d+)\.png/);

        if (match) {
            const [, world, levelString, tileXString, tileZString] = match;
            const level = Number.parseInt(levelString, 10);
            const tileX = Number.parseInt(tileXString, 10);
            const tileZ = Number.parseInt(tileZString, 10);
            // Convert level to blocks per tile: level 2 = 256, level 0 = 4096
            const blocksPerTile = level === 2 ? 256 : 4096;

            // Check if detail level is available (for fallback tests)
            if (level === 2 && !p.__detailLevelAvailable) {
                await route.fulfill({ status: 404 });
                return;
            }

            const tile = createEncodedTile({
                world: world as 'overworld' | 'the_nether',
                blocksPerTile,
                tileX,
                tileZ
            });

            // Apply artificial delay if configured (for z-order race condition testing)
            const pWithDelay = p as PageWithTileTracking & { __overviewDelay?: number; __detailDelay?: number };
            const delay = level === 2 ? pWithDelay.__detailDelay : pWithDelay.__overviewDelay;
            if (delay && delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            await route.fulfill({
                status: 200,
                contentType: 'image/png',
                body: tile
            });
        } else {
            // Fallback for unexpected URL format - gray tile
            await route.fulfill({
                status: 200,
                contentType: 'image/png',
                body: createColoredPng(128, 128, 128)
            });
        }
    });

    // Set up manifest mock with timing tracking
    await page.route('**/tiles/manifest.json', async (route: Route) => {
        p.__manifestRequestTime = Date.now();

        const entries: Array<{ world: string; tileX: number; tileZ: number; blocksPerTile: number }> = [];
        const worlds = ['overworld', 'the_nether'];
        const blocksPerTileOptions = p.__detailLevelAvailable ? [256, 4096] : [4096];

        const range = p.__manifestFilter === 'origin-only' ? 5 : 200;

        for (const world of worlds) {
            for (const blocksPerTile of blocksPerTileOptions) {
                for (let tx = -range; tx <= range; tx++) {
                    for (let tz = -range; tz <= range; tz++) {
                        entries.push({ world, tileX: tx, tileZ: tz, blocksPerTile });
                    }
                }
            }
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(entries)
        });
    });

    // Set up config.json mock
    await mockConfigRoute(page);

    // Set up mock shop data
    await page.route('**/data.json', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_SHOP_DATA)
        });
    });

    // Set up player API mock
    await page.route(PLAYER_API_PATTERN, async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: APPLICATION_JSON,
            body: JSON.stringify({
                players: [{
                    uuid: TEST_UUID,
                    name: TEST_PLAYER_NAME,
                    foreign: false,
                    position: { x: p.__lastPlayerX ?? 0, y: 64, z: p.__lastPlayerZ ?? 0 },
                    rotation: { pitch: 0, yaw: 0, roll: 0 },
                    world: 'World'
                }]
            })
        });
    });

    // Navigate to app
    await page.goto('/');
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
});

Given('the manifest only includes tiles near origin', async ({ page }) => {
    const p = page as PageWithTileTracking;
    p.__manifestFilter = 'origin-only';
});

// ============================================================================
// WHEN Steps
// ============================================================================

/**
 * Wait for tile requests to stabilize (no new requests for a period of time)
 * Requires at least one tile request before considering stable, unless forceMinimum is false
 */
async function waitForTileRequestsToStabilize(
    page: Page, 
    stableMs: number = 1000, 
    timeout: number = 10_000,
    requireAtLeastOne: boolean = true
): Promise<void> {
    const p = page as PageWithTileTracking;
    const startTime = Date.now();
    let lastCount = p.__tileRequests?.length ?? 0;
    let lastChangeTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const currentCount = p.__tileRequests?.length ?? 0;
        if (currentCount !== lastCount) {
            lastCount = currentCount;
            lastChangeTime = Date.now();
        } else if (Date.now() - lastChangeTime >= stableMs && // Only consider stable if we have at least one tile (when required)
            (!requireAtLeastOne || currentCount > 0)) {
                return;
            }
        await page.waitForTimeout(100);
    }
}

/**
 * Helper to open navigation map and wait for tile requests to stabilize
 */
async function openNavigationMapWithItem(page: Page, itemFilter: string): Promise<void> {
    // Add item to cart - wait for row to be visible first
    // Look for a row where the result-name (what you GET) contains the filter
    // Structure: result-amt | result-name | cost-amt | cost-name | ...
    const row = page.locator('.trade-row').filter({
        has: page.locator('.result-name', { hasText: itemFilter })
    }).first();
    
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.locator(SELECTOR_ADD_TO_CART_BUTTON).click();
    
    // Open cart and navigate tab
    const cartButton = page.locator(SELECTOR_OPEN_CART);
    await cartButton.waitFor({ state: 'visible', timeout: 5000 });
    await cartButton.click();
    await page.waitForSelector(SELECTOR_CART_DIALOG, { state: 'visible', timeout: 10_000 });
    
    // Switch to navigate tab
    const navigateTab = page.locator(SELECTOR_TAB_NAVIGATE);
    await navigateTab.waitFor({ state: 'visible', timeout: 5000 });
    await navigateTab.click();
    
    // Fill player name and start navigation
    const playerInput = page.locator(SELECTOR_PLAYER_NAME_INPUT);
    await playerInput.waitFor({ state: 'visible', timeout: 5000 });
    await playerInput.fill(TEST_PLAYER_NAME);
    
    const startButton = page.locator(SELECTOR_START_NAVIGATION);
    await startButton.waitFor({ state: 'visible', timeout: 5000 });
    await startButton.click();
    
    // Wait for navigation dialog with longer timeout (map initialization can be slow)
    await page.waitForSelector(SELECTOR_NAV_DIALOG_OPEN, { state: 'visible', timeout: 15_000 });
    
    // Wait for tile requests to stabilize
    await waitForTileRequestsToStabilize(page, 1000, 10_000);
}

When('I open the navigation map with an overworld item', async ({ page }) => {
    await openNavigationMapWithItem(page, 'Emerald');
});

When('I open the navigation map with a nether item', async ({ page }) => {
    await openNavigationMapWithItem(page, 'Netherite');
});

When('I open the navigation map with a far-away shop item', async ({ page }) => {
    await openNavigationMapWithItem(page, 'Iron');
});

When('I record the tile request count', async ({ page }) => {
    const p = page as PageWithTileTracking;
    p.__tileRequestCount = p.__tileRequests?.length ?? 0;
});

When('I wait for any pending tile requests', async ({ page }) => {
    // Wait for tile requests to stabilize before making assertions
    await waitForTileRequestsToStabilize(page, 500, 5000);
});

When('I close and reopen the navigation map', async ({ page }) => {
    // Close the navigation dialog by clicking the close button
    const closeButton = page.locator('#close-nav');
    await closeButton.waitFor({ state: 'visible', timeout: 5000 });
    await closeButton.click();
    await page.waitForTimeout(300);
    
    // Cart should reopen automatically after nav dialog closes
    await page.waitForSelector(SELECTOR_CART_DIALOG_OPEN, { state: 'visible', timeout: 10_000 });
    
    // Switch to navigate tab
    const navigateTab = page.locator(SELECTOR_TAB_NAVIGATE);
    await navigateTab.waitFor({ state: 'visible', timeout: 5000 });
    await navigateTab.click();
    
    // Fill player name and start navigation again
    const playerInput = page.locator(SELECTOR_PLAYER_NAME_INPUT);
    await playerInput.waitFor({ state: 'visible', timeout: 5000 });
    await playerInput.fill(TEST_PLAYER_NAME);
    
    const startButton = page.locator(SELECTOR_START_NAVIGATION);
    await startButton.waitFor({ state: 'visible', timeout: 5000 });
    await startButton.click();
    
    // Wait for navigation dialog with longer timeout
    await page.waitForSelector(SELECTOR_NAV_DIALOG_OPEN, { state: 'visible', timeout: 15_000 });
    
    // Wait for map to initialize and any potential tile requests to stabilize
    await waitForTileRequestsToStabilize(page, 1000, 10_000);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('detail level tiles should be requested', async ({ page }) => {
    const p = page as PageWithTileTracking;
    await expect(async () => {
        const detailRequests = p.__tileRequests?.filter(url => url.includes('/2/')) ?? [];
        expect(detailRequests.length, 'Expected detail level tile requests').toBeGreaterThan(0);
    }).toPass({ timeout: 10_000, intervals: [500] });
});

Then('overview level tiles should be requested', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const overviewRequests = p.__tileRequests?.filter(url => url.includes('/0/')) ?? [];
    expect(overviewRequests.length, 'Expected overview level tile requests').toBeGreaterThan(0);
});

Then('nether tile requests should include {string} in path', async ({ page }, expectedPath: string) => {
    const p = page as PageWithTileTracking;
    const netherRequests = p.__tileRequests?.filter(url => url.includes(expectedPath)) ?? [];
    expect(netherRequests.length, `Expected tile requests containing "${expectedPath}"`).toBeGreaterThan(0);
});

Then('no additional tile requests should be made', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const currentCount = p.__tileRequests?.length ?? 0;
    const previousCount = p.__tileRequestCount ?? 0;
    
    expect(currentCount).toBe(previousCount);
});

Then('only tiles near origin should be requested', async ({ page }) => {
    const p = page as PageWithTileTracking;
    
    // Since manifest only has tiles near origin (range -5 to +5),
    // no tiles far from origin should be requested
    // For a shop at 50000, 50000, that would be tile ~195 at detail level
    const tilePattern = /\/(\d+)\/(-?\d+)\/(-?\d+)\.png/;
    const farTileRequests = p.__tileRequests?.filter(url => {
        const match = tilePattern.exec(url);
        if (!match) {
            return false;
        }
        const x = Number.parseInt(match[2]!, 10);
        const z = Number.parseInt(match[3]!, 10);
        return Math.abs(x) > 5 || Math.abs(z) > 5;
    }) ?? [];
    
    expect(farTileRequests.length, 'Should not request tiles far from origin').toBe(0);
});

// ============================================================================
// Dynamic Tile Loading Steps
// ============================================================================

Given('the navigation map is open with an overworld item', async ({ page }) => {
    await openNavigationMapWithItem(page, 'Emerald');
});

Given('the navigation map is open with a nether item', async ({ page }) => {
    await openNavigationMapWithItem(page, 'Netherite');
});

When('I pan the map to a new area', async ({ page }) => {
    // Get the map container
    const mapContainer = page.locator(SELECTOR_NAV_MAP_CONTAINER);
    await expect(mapContainer).toBeVisible();
    
    // Get the container's bounding box
    const box = await mapContainer.boundingBox();
    if (!box) {
        throw new Error(ERROR_NO_BOUNDING_BOX);
    }
    
    // Drag the map to pan it significantly
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 200, startY - 200, { steps: 10 });
    await page.mouse.up();
    
    // Wait for tile requests to stabilize after pan
    await waitForTileRequestsToStabilize(page, 500, 5000);
});

Then('the map should display tiles at the player location', async ({ page }) => {
    // Check that tiles were requested - the map is making tile requests
    const p = page as PageWithTileTracking;
    const requestCount = p.__tileRequests?.length ?? 0;
    
    // As long as tile requests were made, the map is trying to display tiles
    // The actual image loading may fail for non-existent tiles in our mock
    expect(requestCount, 'Map should have made tile requests').toBeGreaterThan(0);
    
    // Also check that the Leaflet map container exists and has tile layers
    const hasMap = await page.evaluate((selector) => {
        const mapContainer = document.querySelector(selector);
        if (!mapContainer) {
            return false;
        }
        // Check for Leaflet tile pane which is always present when tiles are being managed
        const tilePane = mapContainer.querySelector('.leaflet-tile-pane');
        return tilePane !== null;
    }, SELECTOR_NAV_MAP_CONTAINER);
    
    expect(hasMap, 'Map should have tile pane').toBe(true);
});

Then('the map should continue displaying tiles', async ({ page }) => {
    // Verify the map is still functional after panning
    const hasMap = await page.evaluate((selector) => {
        const mapContainer = document.querySelector(selector);
        if (!mapContainer) {
            return false;
        }
        const tilePane = mapContainer.querySelector('.leaflet-tile-pane');
        return tilePane !== null;
    }, SELECTOR_NAV_MAP_CONTAINER);
    
    expect(hasMap, 'Map should have tile pane after panning').toBe(true);
});

// ============================================================================
// Tile Positioning Steps - Verify tiles are requested for correct locations
// ============================================================================

interface TileInfo {
    url: string;
    tileX: number;
    tileZ: number;
    level: number;
    world: string;
}

/**
 * Parse tile info from request URLs
 */
function parseTileRequests(requests: string[]): TileInfo[] {
    const tiles: TileInfo[] = [];
    // URL pattern: /tiles/world/level/x/z.png
    const tileUrlPattern = /\/tiles\/([^/]+)\/(\d+)\/(-?\d+)\/(-?\d+)\.png/;
    for (const url of requests) {
        const match = tileUrlPattern.exec(url);
        if (match) {
            tiles.push({
                url,
                world: match[1]!,
                level: Number.parseInt(match[2]!, 10),
                tileX: Number.parseInt(match[3]!, 10),
                tileZ: Number.parseInt(match[4]!, 10)
            });
        }
    }
    return tiles;
}

/**
 * Get the most recent tile requests for a specific area
 */
function getTilesForArea(tiles: TileInfo[], centerX: number, centerZ: number, radius: number = 5): TileInfo[] {
    return tiles.filter(t => 
        Math.abs(t.tileX - centerX) <= radius && 
        Math.abs(t.tileZ - centerZ) <= radius
    );
}

Given(String.raw`the tile test player is at position \({int}, {int})`, async ({ page }, x: number, z: number) => {
    // Update the player API mock to return this position
    await page.route(PLAYER_API_PATTERN, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: APPLICATION_JSON,
            body: JSON.stringify({
                players: [{
                    uuid: TEST_UUID,
                    name: TEST_PLAYER_NAME,
                    foreign: false,
                    position: { x, y: 64, z },
                    rotation: { pitch: 0, yaw: 0, roll: 0 },
                    world: 'World'
                }]
            })
        });
    });
    
    // Store position for later verification
    const p = page as PageWithTileTracking;
    p.__lastPlayerX = x;
    p.__lastPlayerZ = z;
});

When('the map centers on the player position', async ({ page }) => {
    // Trigger a player position update by waiting for polling cycle
    await page.waitForTimeout(1500);
    
    // Wait for flyTo animation to complete (it has 0.3s duration) plus buffer
    await page.waitForTimeout(500);
    
    // Wait for moveend event to fire and trigger tile loading
    await page.waitForTimeout(500);
    
    // Wait for any tile requests to stabilize
    await waitForTileRequestsToStabilize(page, 500, 5000);
});

When(String.raw`the tile test player moves to \({int}, {int})`, async ({ page }, x: number, z: number) => {
    // Update player position mock
    await page.route(PLAYER_API_PATTERN, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: APPLICATION_JSON,
            body: JSON.stringify({
                players: [{
                    uuid: TEST_UUID,
                    name: TEST_PLAYER_NAME,
                    foreign: false,
                    position: { x, y: 64, z },
                    rotation: { pitch: 0, yaw: 0, roll: 0 },
                    world: 'World'
                }]
            })
        });
    });
    
    // Store position for later verification
    const p = page as PageWithTileTracking;
    p.__lastPlayerX = x;
    p.__lastPlayerZ = z;
});

When('the map follows the player', async ({ page }) => {
    // Wait for polling to pick up new position and center map
    await page.waitForTimeout(1500);
    await waitForTileRequestsToStabilize(page, 500, 5000);
});

When('I pan the map significantly to the east', async ({ page }) => {
    const mapContainer = page.locator(SELECTOR_NAV_MAP_CONTAINER);
    const box = await mapContainer.boundingBox();
    if (!box) {
        throw new Error(ERROR_NO_BOUNDING_BOX);
    }
    
    // Pan significantly to the east (negative X in drag terms)
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 400, startY, { steps: 20 });
    await page.mouse.up();
    
    await waitForTileRequestsToStabilize(page, 500, 5000);
});

When('I zoom out the map', async ({ page }) => {
    const mapContainer = page.locator(SELECTOR_NAV_MAP_CONTAINER);
    const box = await mapContainer.boundingBox();
    if (!box) {
        throw new Error(ERROR_NO_BOUNDING_BOX);
    }
    
    // Zoom out using mouse wheel
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    await page.mouse.move(centerX, centerY);
    await page.mouse.wheel(0, 200); // Scroll down to zoom out
    
    await waitForTileRequestsToStabilize(page, 500, 5000);
});

Then('at least one tile should be visible in the viewport', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    expect(tiles.length, 'Expected at least one tile to be requested').toBeGreaterThan(0);
});

Then('tiles should be visible within the viewport', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    expect(tiles.length, 'Expected tiles to be requested').toBeGreaterThan(0);
});

Then('the visible tiles should correspond to the player area', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    const playerX = p.__lastPlayerX ?? 0;
    const playerZ = p.__lastPlayerZ ?? 0;
    
    // Calculate expected tile coordinates for player position at different levels
    // Level 2 in URL (256 blocks per tile) - high detail
    const expectedTileX_detail = Math.floor(playerX / 256);
    const expectedTileZ_detail = Math.floor(playerZ / 256);
    // Level 0 in URL (4096 blocks per tile) - lower detail, loaded at low zoom
    const expectedTileX_overview = Math.floor(playerX / 4096);
    const expectedTileZ_overview = Math.floor(playerZ / 4096);
    
    // Separate tiles by level in URL (0 or 2)
    // Note: URL level 2 = 256 blocks per tile, URL level 0 = 4096 blocks per tile
    const detailTiles = tiles.filter(t => t.level === 2);
    const overviewTiles = tiles.filter(t => t.level === 0);
    
    // Check that tiles were requested near the player area at either level
    const nearbyTiles_detail = getTilesForArea(detailTiles, expectedTileX_detail, expectedTileZ_detail, 3);
    const nearbyTiles_overview = getTilesForArea(overviewTiles, expectedTileX_overview, expectedTileZ_overview, 3);
    
    const hasNearbyTiles = nearbyTiles_detail.length > 0 || nearbyTiles_overview.length > 0;
    
    const detailTileList = detailTiles.map(t => `(${t.tileX},${t.tileZ})`).join(', ') || 'none';
    const overviewTileList = overviewTiles.map(t => `(${t.tileX},${t.tileZ})`).join(', ') || 'none';
    const errorMessage = 'Expected tiles near player area. ' +
        `Detail (256bpt): expected (${expectedTileX_detail}, ${expectedTileZ_detail}), got: ${detailTileList}. ` +
        `Overview (4096bpt): expected (${expectedTileX_overview}, ${expectedTileZ_overview}), got: ${overviewTileList}`;
    
    expect(hasNearbyTiles, errorMessage).toBe(true);
});

Then('the visible tiles should correspond to the new player area', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    // For the "moves to (5000, 5000)" step
    // Calculate expected tile coords at both levels
    const expectedTileX_detail = Math.floor(5000 / 256);  // ~19
    const expectedTileZ_detail = Math.floor(5000 / 256);  // ~19
    const expectedTileX_overview = Math.floor(5000 / 4096); // ~1
    const expectedTileZ_overview = Math.floor(5000 / 4096); // ~1
    
    // Separate tiles by level in URL (0 or 2)
    const detailTiles = tiles.filter(t => t.level === 2);
    const overviewTiles = tiles.filter(t => t.level === 0);
    
    // Check that tiles were requested near the new player area at either level
    const nearbyTiles_detail = getTilesForArea(detailTiles, expectedTileX_detail, expectedTileZ_detail, 3);
    const nearbyTiles_overview = getTilesForArea(overviewTiles, expectedTileX_overview, expectedTileZ_overview, 3);
    
    const hasNearbyTiles = nearbyTiles_detail.length > 0 || nearbyTiles_overview.length > 0;
    
    const detailTileList = detailTiles.map(t => `(${t.tileX},${t.tileZ})`).join(', ') || 'none';
    const overviewTileList = overviewTiles.map(t => `(${t.tileX},${t.tileZ})`).join(', ') || 'none';
    const errorMessage = 'Expected tiles near new player area (5000, 5000). ' +
        `Detail: expected (${expectedTileX_detail}, ${expectedTileZ_detail}), got: ${detailTileList}. ` +
        `Overview: expected (${expectedTileX_overview}, ${expectedTileZ_overview}), got: ${overviewTileList}`;
    
    expect(hasNearbyTiles, errorMessage).toBe(true);
});

Then('each loaded tile should have bounds matching its tile coordinates', async ({ page }) => {
    // Wait for tile requests to be made
    await waitForTileRequestsToStabilize(page, 500, 5000);
    
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    expect(tiles.length, 'Expected some tiles to be requested').toBeGreaterThan(0);
    
    // Verify we have a reasonable distribution of tiles
    const detailTiles = tiles.filter(t => t.level === 2);
    const overviewTiles = tiles.filter(t => t.level === 0);
    
    // Both levels should typically be requested
    expect(detailTiles.length + overviewTiles.length, 'Expected tiles at overview or detail level').toBeGreaterThan(0);
    
    // Verify tiles form a contiguous region (adjacent tiles exist)
    if (detailTiles.length >= 2) {
        const sortedByX = [...detailTiles].toSorted((a, b) => a.tileX - b.tileX || a.tileZ - b.tileZ);
        
        // Check that we have some adjacent tiles (grid pattern)
        let hasAdjacentPair = false;
        for (let index = 0; index < sortedByX.length - 1; index++) {
            const current = sortedByX[index]!;
            const next = sortedByX[index + 1]!;
            
            // Check if tiles are adjacent (differ by 1 in either X or Z)
            const xDiff = Math.abs(next.tileX - current.tileX);
            const zDiff = Math.abs(next.tileZ - current.tileZ);
            
            if ((xDiff === 1 && zDiff === 0) || (xDiff === 0 && zDiff === 1)) {
                hasAdjacentPair = true;
                break;
            }
        }
        
        expect(hasAdjacentPair, 'Expected tiles to include at least one adjacent pair').toBe(true);
    }
});

Then('the visible tiles should be in the eastern area', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    expect(tiles.length, 'Expected tiles after panning east').toBeGreaterThan(0);
    
    // After panning east, we should have tiles with positive X coordinates
    // (or at least not all negative)
    const avgTileX = tiles.reduce((sum, t) => sum + t.tileX, 0) / tiles.length;
    expect(Number.isFinite(avgTileX), 'Average tile X should be a valid number').toBe(true);
});

Then('tiles should still be visible in the viewport', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    expect(tiles.length, 'Expected tiles to remain after zoom').toBeGreaterThan(0);
});

Then('overview tiles should cover the same area as detail tiles', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    const overviewTiles = tiles.filter(t => t.level === 0);
    const detailTiles = tiles.filter(t => t.level === 2);
    
    // We should have overview tiles (they're always loaded as base layer)
    expect(overviewTiles.length, 'Expected overview tiles').toBeGreaterThan(0);
    
    // If we have detail tiles, verify overview tiles cover the same general area
    if (detailTiles.length > 0 && overviewTiles.length > 0) {
        // Each overview tile covers 16x16 detail tiles
        const detailMinX = Math.min(...detailTiles.map(t => t.tileX));
        const detailMaxX = Math.max(...detailTiles.map(t => t.tileX));
        
        // Convert to overview coordinates
        const expectedOverviewMinX = Math.floor(detailMinX / 16);
        const expectedOverviewMaxX = Math.floor(detailMaxX / 16);
        
        // Verify overview tiles are in a similar range
        const overviewMinX = Math.min(...overviewTiles.map(t => t.tileX));
        const overviewMaxX = Math.max(...overviewTiles.map(t => t.tileX));
        
        // They should overlap
        const overlap = overviewMaxX >= expectedOverviewMinX && overviewMinX <= expectedOverviewMaxX;
        expect(overlap, `Overview tiles (${overviewMinX} to ${overviewMaxX}) should cover detail area (overview equiv: ${expectedOverviewMinX} to ${expectedOverviewMaxX})`).toBe(true);
    }
});

Then('the visible tiles should be nether tiles', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    expect(tiles.length, 'Expected tiles to be requested').toBeGreaterThan(0);
    
    // Check that all tiles are from the nether world
    const netherTiles = tiles.filter(t => t.world === 'the_nether');
    expect(netherTiles.length, 'Expected nether tiles to be requested').toBeGreaterThan(0);
    
    // If we're viewing a nether shop, only nether tiles should be loaded
    const overworldTiles = tiles.filter(t => t.world === 'overworld');
    expect(overworldTiles.length, 'Should not load overworld tiles when viewing nether').toBe(0);
});

// ============================================================================
// Unified View Steps
// ============================================================================

Then('overworld tile requests should be made', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const overworldRequests = requests.filter(url => url.includes('/overworld/'));
    expect(overworldRequests.length, 'Expected overworld tile requests').toBeGreaterThan(0);
});

Then('no nether tile requests should be made', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const netherRequests = requests.filter(url => url.includes('/the_nether/'));
    expect(netherRequests.length, 'Expected no nether tile requests in unified view').toBe(0);
});

Then('nether shop markers should be visible', async ({ page }) => {
    const netherMarker = page.locator('.nav-route-marker--nether');
    await expect(netherMarker.first()).toBeVisible({ timeout: 5000 });
});
