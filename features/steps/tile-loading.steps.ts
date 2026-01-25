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
const TEST_PLAYER_NAME = 'TestPlayer';

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
    await page.route('**/pvc-players.minecraft-works.workers.dev**', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                players: [{
                    uuid: 'test-uuid-1234',
                    name: 'TestPlayer',
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
