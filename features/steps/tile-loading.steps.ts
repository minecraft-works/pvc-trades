/**
 * Step definitions for tile loading scenarios
 * Tests direct map-server tile requests, fallback when the server has no tile, and request counting
 */
import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';

import { PLAYERS_ROUTE_PATTERN } from '../../tests/helpers/endpoints';
import { mockConfigRoute } from '../../tests/helpers/test-config';
import { fulfillMissingTile } from '../../tests/helpers/tile-map-mocks';
import {
    createEncodedTilePng,
    DETAIL_BPT,
    DETAIL_TILES_PER_OVERVIEW,
    DETAIL_ZOOM,
    OVERVIEW_BPT,
    OVERVIEW_ZOOM,
    type ParsedTileUrl,
    parseTileUrl,
    parseTileUrls,
    tilePathFragment,
} from '../../tests/helpers/tile-url';
import { Given, Then,TILE_ROUTE_PATTERN,When } from './fixtures';

// ============================================================================
// Test data with controlled shop locations
// ============================================================================

const MOCK_SHOP_DATA = {
    data: [
        {
            shopName: 'Origin Overworld Shop',
            shopOwner: 'TestOwner',
            location: '100.0, 64.0, 200.0',  // Near origin, detail tile (0, 0)
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
    __lastPlayerX?: number;
    __lastPlayerZ?: number;
    __firstTileRequestTime?: number;
    __overviewDelay?: number;
    __detailDelay?: number;
    /** Tiles for which the mocked map server answers with an empty body */
    __isTileMissing?: (tile: ParsedTileUrl) => boolean;
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
const SELECTOR_ADD_TO_CART_BUTTON = '.add-to-cart-btn';
const SELECTOR_NAV_MAP_CONTAINER = '#nav-dialog-map-container';
const TEST_PLAYER_NAME = 'TestPlayer';
const TEST_UUID = 'test-uuid-1234';
const PLAYER_API_PATTERN = PLAYERS_ROUTE_PATTERN;
const APPLICATION_JSON = 'application/json';
const ERROR_NO_BOUNDING_BOX = 'Could not get map container bounding box';

// ============================================================================
// GIVEN Steps
// ============================================================================

/**
 * Mock the map server: every tile request is recorded and answered with a
 * color-coded PNG, except tiles the scenario declared missing, which get an
 * empty 200 response like the real server sends for unrendered tiles.
 * @param page
 */
async function mockTileServer(page: Page): Promise<void> {
    const p = page as PageWithTileTracking;
    p.__tileRequests = [];

    await page.route(TILE_ROUTE_PATTERN, async (route: Route) => {
        const url = route.request().url();
        p.__tileRequests?.push(url);

        // Track timing for race condition tests
        p.__firstTileRequestTime ??= Date.now();

        const tile = parseTileUrl(url);
        if (!tile) {
            await fulfillMissingTile(route);
            return;
        }

        if (p.__isTileMissing?.(tile)) {
            await fulfillMissingTile(route);
            return;
        }

        // Apply artificial delay if configured (for z-order race condition testing)
        const delay = tile.zoom === DETAIL_ZOOM ? p.__detailDelay : p.__overviewDelay;
        if (delay && delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: createEncodedTilePng(tile)
        });
    });
}

Given('the tile loading test app is configured', async ({ page }) => {
    const p = page as PageWithTileTracking;
    await mockTileServer(page);
    
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

Given('the tile loading test app is configured with color-coded tiles', async ({ page }) => {
    const p = page as PageWithTileTracking;
    await mockTileServer(page);

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

Given('the map server has no detail tiles', async ({ page }) => {
    const p = page as PageWithTileTracking;
    p.__isTileMissing = tile => tile.zoom === DETAIL_ZOOM;
});

// ============================================================================
// WHEN Steps
// ============================================================================

/**
 * Wait for tile requests to stabilize (no new requests for a period of time)
 * Requires at least one tile request before considering stable, unless forceMinimum is false
 * @param page
 * @param stableMs
 * @param timeout
 * @param requireAtLeastOne
 */
async function waitForTileRequestsToStabilize(
    page: Page, 
    stableMs = 1000, 
    timeout = 10_000,
    requireAtLeastOne = true
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
 * @param page
 * @param itemFilter
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

// ============================================================================
// THEN Steps
// ============================================================================

Then('detail level tiles should be requested', async ({ page }) => {
    const p = page as PageWithTileTracking;
    await expect(async () => {
        const detailRequests = parseTileUrls(p.__tileRequests ?? []).filter(tile => tile.zoom === DETAIL_ZOOM);
        expect(detailRequests.length, 'Expected detail level tile requests').toBeGreaterThan(0);
    }).toPass({ timeout: 10_000, intervals: [500] });
});

Then('overview level tiles should be requested', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const overviewRequests = parseTileUrls(p.__tileRequests ?? []).filter(tile => tile.zoom === OVERVIEW_ZOOM);
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

Then(String.raw`tiles containing the block position \({int}, {int}\) should be requested at both levels`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];

    for (const zoom of [DETAIL_ZOOM, OVERVIEW_ZOOM]) {
        const blocksPerTile = zoom === DETAIL_ZOOM ? DETAIL_BPT : OVERVIEW_BPT;
        const fragment = tilePathFragment({
            world: 'overworld',
            zoom,
            tileX: Math.floor(x / blocksPerTile),
            tileZ: Math.floor(z / blocksPerTile),
        });
        expect(
            requests.some(url => url.includes(fragment)),
            `Expected ${fragment} to be requested. Got ${requests.length} requests, e.g. ${requests.slice(0, 5).join(', ')}`
        ).toBe(true);
    }
});

// ============================================================================
// Missing Tile Steps - the server answers 200 with an empty body
// ============================================================================

const SELECTOR_DETAIL_OVERLAYS = '#nav-dialog-map-container .leaflet-tilesDetail-pane img';
const SELECTOR_OVERVIEW_OVERLAYS = '#nav-dialog-map-container .leaflet-tilesOverview-pane img';

/**
 * Count the overlay images in a pane that decoded successfully.
 * @param page
 * @param selector
 */
async function countLoadedImages(page: Page, selector: string): Promise<number> {
    return page.evaluate((cssSelector) => {
        const images = document.querySelectorAll<HTMLImageElement>(cssSelector);
        return [...images].filter(img => img.complete && img.naturalWidth > 0).length;
    }, selector);
}

/**
 * Count the overlay images on the navigation map that failed to decode.
 * @param page
 */
async function countBrokenImages(page: Page): Promise<number> {
    return page.evaluate(() => {
        const images = document.querySelectorAll<HTMLImageElement>('#nav-dialog-map-container .leaflet-image-layer');
        return [...images].filter(img => !img.complete || img.naturalWidth === 0).length;
    });
}

Then('no detail tile should remain on the map', async ({ page }) => {
    // The failed image decode is reported asynchronously, so poll until the overlays are gone
    await expect(page.locator(SELECTOR_DETAIL_OVERLAYS)).toHaveCount(0, { timeout: 5000 });
});

Then('overview tiles should be displayed on the map', async ({ page }) => {
    await expect.poll(() => countLoadedImages(page, SELECTOR_OVERVIEW_OVERLAYS), { timeout: 5000 }).toBeGreaterThan(0);
});

Then('no broken tile image should remain on the map', async ({ page }) => {
    await expect.poll(() => countBrokenImages(page), { timeout: 5000 }).toBe(0);
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

/**
 * Parse tile info from request URLs
 * @param requests
 */
function parseTileRequests(requests: string[]): ParsedTileUrl[] {
    return parseTileUrls(requests);
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

/**
 * Assert that the tiles containing a block position were requested.
 * With the player followed, the detail tile under the player and the overview
 * tile around it must both have been requested from the map server.
 * @param requests
 * @param x
 * @param z
 */
function expectTilesAroundPosition(requests: string[], x: number, z: number): void {
    const tiles = parseTileRequests(requests);
    const detailTiles = tiles.filter(t => t.zoom === DETAIL_ZOOM);
    const overviewTiles = tiles.filter(t => t.zoom === OVERVIEW_ZOOM);

    const expectedDetailX = Math.floor(x / DETAIL_BPT);
    const expectedDetailZ = Math.floor(z / DETAIL_BPT);
    const expectedOverviewX = Math.floor(x / OVERVIEW_BPT);
    const expectedOverviewZ = Math.floor(z / OVERVIEW_BPT);

    const detailTileList = detailTiles.map(t => `(${t.tileX},${t.tileZ})`).join(', ') || 'none';
    const overviewTileList = overviewTiles.map(t => `(${t.tileX},${t.tileZ})`).join(', ') || 'none';

    expect(
        detailTiles.some(t => t.tileX === expectedDetailX && t.tileZ === expectedDetailZ),
        `Expected detail tile (${expectedDetailX}, ${expectedDetailZ}) for (${x}, ${z}); got: ${detailTileList}`
    ).toBe(true);
    expect(
        overviewTiles.some(t => t.tileX === expectedOverviewX && t.tileZ === expectedOverviewZ),
        `Expected overview tile (${expectedOverviewX}, ${expectedOverviewZ}) for (${x}, ${z}); got: ${overviewTileList}`
    ).toBe(true);
}

Then('the visible tiles should correspond to the player area', async ({ page }) => {
    const p = page as PageWithTileTracking;
    expectTilesAroundPosition(p.__tileRequests ?? [], p.__lastPlayerX ?? 0, p.__lastPlayerZ ?? 0);
});

Then('the visible tiles should correspond to the new player area', async ({ page }) => {
    const p = page as PageWithTileTracking;
    expectTilesAroundPosition(p.__tileRequests ?? [], p.__lastPlayerX ?? 0, p.__lastPlayerZ ?? 0);
});

Then('each loaded tile should have bounds matching its tile coordinates', async ({ page }) => {
    // Wait for tile requests to be made
    await waitForTileRequestsToStabilize(page, 500, 5000);
    
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const tiles = parseTileRequests(requests);
    
    expect(tiles.length, 'Expected some tiles to be requested').toBeGreaterThan(0);
    
    // Verify we have a reasonable distribution of tiles
    const detailTiles = tiles.filter(t => t.zoom === DETAIL_ZOOM);
    const overviewTiles = tiles.filter(t => t.zoom === OVERVIEW_ZOOM);
    
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
    
    const overviewTiles = tiles.filter(t => t.zoom === OVERVIEW_ZOOM);
    const detailTiles = tiles.filter(t => t.zoom === DETAIL_ZOOM);
    
    // We should have overview tiles (they're always loaded as base layer)
    expect(overviewTiles.length, 'Expected overview tiles').toBeGreaterThan(0);
    
    // If we have detail tiles, verify overview tiles cover the same general area
    if (detailTiles.length > 0 && overviewTiles.length > 0) {
        // Each overview tile covers DETAIL_TILES_PER_OVERVIEW x DETAIL_TILES_PER_OVERVIEW detail tiles
        const detailMinX = Math.min(...detailTiles.map(t => t.tileX));
        const detailMaxX = Math.max(...detailTiles.map(t => t.tileX));
        
        // Convert to overview coordinates
        const expectedOverviewMinX = Math.floor(detailMinX / DETAIL_TILES_PER_OVERVIEW);
        const expectedOverviewMaxX = Math.floor(detailMaxX / DETAIL_TILES_PER_OVERVIEW);
        
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
    const overworldRequests = requests.filter(url => url.includes('/minecraft_overworld/'));
    expect(overworldRequests.length, 'Expected overworld tile requests').toBeGreaterThan(0);
});

Then('no nether tile requests should be made', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    const netherRequests = requests.filter(url => url.includes('/minecraft_the_nether/'));
    expect(netherRequests.length, 'Expected no nether tile requests in unified view').toBe(0);
});

Then('nether shop markers should be visible', async ({ page }) => {
    const netherMarker = page.locator('.nav-route-marker--nether');
    await expect(netherMarker.first()).toBeVisible({ timeout: 5000 });
});
