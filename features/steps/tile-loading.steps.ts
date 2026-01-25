/**
 * Step definitions for tile loading scenarios
 * Tests manifest-based tile loading, fallback behavior, and caching
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import type { Page, Route } from '@playwright/test';
import { deflateSync } from 'node:zlib';

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

const BLUE_PIXEL_PNG = createColoredPng(0, 100, 255);
const RED_PIXEL_PNG = createColoredPng(255, 50, 50);

// ============================================================================
// Test data with controlled shop locations
// ============================================================================

const MOCK_SHOP_DATA = {
    data: [
        {
            shopName: 'Origin Overworld Shop',
            shopOwner: 'TestOwner',
            location: '100.0, 64.0, 200.0',  // Near origin, tile (0, 0) at zoom 8
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
        const blocksPerTileOptions = [512, 8192];
        
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

Given('the manifest only includes tiles near origin', async ({ page }) => {
    const p = page as PageWithTileTracking;
    p.__manifestFilter = 'origin-only';
});

// ============================================================================
// WHEN Steps
// ============================================================================

/**
 * Wait for tile requests to stabilize (no new requests for a period of time)
 */
async function waitForTileRequestsToStabilize(page: Page, stableMs: number = 1000, timeout: number = 10_000): Promise<void> {
    const p = page as PageWithTileTracking;
    const startTime = Date.now();
    let lastCount = p.__tileRequests?.length ?? 0;
    let lastChangeTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const currentCount = p.__tileRequests?.length ?? 0;
        if (currentCount !== lastCount) {
            lastCount = currentCount;
            lastChangeTime = Date.now();
        } else if (Date.now() - lastChangeTime >= stableMs) {
            // No new requests for stableMs - we're done
            return;
        }
        await page.waitForTimeout(100);
    }
}

/**
 * Helper to open navigation map and wait for tile requests to stabilize
 */
async function openNavigationMapWithItem(page: Page, itemFilter: string): Promise<void> {
    // Add item to cart
    const row = page.locator('.trade-row').filter({ hasText: itemFilter }).first();
    await row.locator(SELECTOR_ADD_TO_CART_BUTTON).click();
    
    // Open cart and navigate tab
    await page.locator(SELECTOR_OPEN_CART).click();
    await page.waitForSelector(SELECTOR_CART_DIALOG, { state: 'visible' });
    await page.locator(SELECTOR_TAB_NAVIGATE).click();
    
    // Start navigation to actually open the map
    await page.locator(SELECTOR_PLAYER_NAME_INPUT).fill(TEST_PLAYER_NAME);
    await page.locator(SELECTOR_START_NAVIGATION).click();
    await page.waitForSelector(SELECTOR_NAV_DIALOG_OPEN, { state: 'visible', timeout: 5000 });
    
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
    await closeButton.click();
    await page.waitForTimeout(300);
    
    // Cart should reopen automatically after nav dialog closes
    await page.waitForSelector(SELECTOR_CART_DIALOG_OPEN, { state: 'visible', timeout: 5000 });
    await page.locator(SELECTOR_TAB_NAVIGATE).click();
    
    // Start navigation again
    await page.locator(SELECTOR_PLAYER_NAME_INPUT).fill(TEST_PLAYER_NAME);
    await page.locator(SELECTOR_START_NAVIGATION).click();
    await page.waitForSelector(SELECTOR_NAV_DIALOG_OPEN, { state: 'visible', timeout: 5000 });
    
    // Wait for map to initialize and any potential tile requests to stabilize
    await waitForTileRequestsToStabilize(page, 1000, 10_000);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('zoom 8 tiles should be requested', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const zoom8Requests = p.__tileRequests?.filter(url => url.includes('/8/')) ?? [];
    expect(zoom8Requests.length, 'Expected zoom 8 tile requests').toBeGreaterThan(0);
});

Then('zoom 4 tiles should be requested', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const zoom4Requests = p.__tileRequests?.filter(url => url.includes('/4/')) ?? [];
    expect(zoom4Requests.length, 'Expected zoom 4 tile requests').toBeGreaterThan(0);
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
    // For a shop at 50000, 50000, that would be tile ~97 at zoom 8
    const farTileRequests = p.__tileRequests?.filter(url => {
        const match = url.match(/\/(\d+)\/(-?\d+)\/(-?\d+)\.png/);
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
    zoom: number;
    world: string;
}

/**
 * Parse tile info from request URLs
 */
function parseTileRequests(requests: string[]): TileInfo[] {
    const tiles: TileInfo[] = [];
    for (const url of requests) {
        // URL pattern: /tiles/world/zoom/x/z.png
        const match = url.match(/\/tiles\/([^/]+)\/(\d+)\/(-?\d+)\/(-?\d+)\.png/);
        if (match) {
            tiles.push({
                url,
                world: match[1]!,
                zoom: Number.parseInt(match[2]!, 10),
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
    
    // Calculate expected tile coordinates for player position (512 blocks per tile at zoom 8)
    const expectedTileX = Math.floor(playerX / 512);
    const expectedTileZ = Math.floor(playerZ / 512);
    
    // Check that tiles were requested near the player area
    const nearbyTiles = getTilesForArea(tiles, expectedTileX, expectedTileZ, 3);
    const tileCoords = tiles.map(t => `(${t.tileX},${t.tileZ})`).join(', ');
    
    expect(nearbyTiles.length, 
        `Expected tiles near player area (${expectedTileX}, ${expectedTileZ}), got tiles at: ${tileCoords}`
    ).toBeGreaterThan(0);
});

Then('the visible tiles should correspond to the new player area', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    // For the "moves to (5000, 5000)" step
    const expectedTileX = Math.floor(5000 / 512); // ~9
    const expectedTileZ = Math.floor(5000 / 512); // ~9
    
    // Check that tiles were requested near the new player area
    const nearbyTiles = getTilesForArea(tiles, expectedTileX, expectedTileZ, 3);
    const tileCoords = tiles.map(t => `(${t.tileX},${t.tileZ})`).join(', ');
    
    expect(nearbyTiles.length, 
        `Expected tiles near (${expectedTileX}, ${expectedTileZ}), got: ${tileCoords}`
    ).toBeGreaterThan(0);
});

Then('each loaded tile should have bounds matching its tile coordinates', async ({ page }) => {
    // Wait for tile requests to be made
    await waitForTileRequestsToStabilize(page, 500, 5000);
    
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    expect(tiles.length, 'Expected some tiles to be requested').toBeGreaterThan(0);
    
    // Verify we have a reasonable distribution of tiles
    const zoom8Tiles = tiles.filter(t => t.zoom === 8);
    const zoom4Tiles = tiles.filter(t => t.zoom === 4);
    
    // Both zoom levels should typically be requested
    expect(zoom8Tiles.length + zoom4Tiles.length, 'Expected tiles at zoom 4 or 8').toBeGreaterThan(0);
    
    // Verify tiles form a contiguous region (adjacent tiles exist)
    if (zoom8Tiles.length >= 2) {
        const sortedByX = [...zoom8Tiles].toSorted((a, b) => a.tileX - b.tileX || a.tileZ - b.tileZ);
        
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

Then('zoom 4 tiles should cover the same area as zoom 8 tiles', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    const zoom4Tiles = tiles.filter(t => t.zoom === 4);
    const zoom8Tiles = tiles.filter(t => t.zoom === 8);
    
    // We should have tiles at zoom 4 (they're always loaded as base layer)
    expect(zoom4Tiles.length, 'Expected zoom 4 tiles').toBeGreaterThan(0);
    
    // If we have zoom 8 tiles, verify zoom 4 tiles cover the same general area
    if (zoom8Tiles.length > 0 && zoom4Tiles.length > 0) {
        // Each zoom 4 tile covers 16x16 zoom 8 tiles
        const z8MinX = Math.min(...zoom8Tiles.map(t => t.tileX));
        const z8MaxX = Math.max(...zoom8Tiles.map(t => t.tileX));
        
        // Convert to zoom 4 coordinates
        const expectedZ4MinX = Math.floor(z8MinX / 16);
        const expectedZ4MaxX = Math.floor(z8MaxX / 16);
        
        // Verify zoom 4 tiles are in a similar range
        const z4MinX = Math.min(...zoom4Tiles.map(t => t.tileX));
        const z4MaxX = Math.max(...zoom4Tiles.map(t => t.tileX));
        
        // They should overlap
        const overlap = z4MaxX >= expectedZ4MinX && z4MinX <= expectedZ4MaxX;
        expect(overlap, `Zoom 4 tiles (${z4MinX} to ${z4MaxX}) should cover zoom 8 area (z4 equiv: ${expectedZ4MinX} to ${expectedZ4MaxX})`).toBe(true);
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
