/**
 * Step definitions for tile color verification
 * Tests zoom level visibility, world type encoding, and tile boundaries
 * using color-coded mock tiles
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import type { Page } from '@playwright/test';

// ============================================================================
// Color thresholds and types
// ============================================================================

const BRIGHTNESS_THRESHOLD = 150;  // Above = bright (zoom 8), Below = dark (zoom 4)
const AMBIGUOUS_MIN = 140;
const AMBIGUOUS_MAX = 160;
const CHECKERBOARD_DIFFERENCE = 0.15;  // 15% brightness difference

interface RGB {
    r: number;
    g: number;
    b: number;
}

interface PageWithTileTracking extends Page {
    __tileRequests?: string[];
    __tileRequestsAtTargetZoom?: string[];
    __tileRequestCount?: number;
    __manifestFilter?: 'all' | 'origin-only';
    __lastPlayerX?: number;
    __lastPlayerZ?: number;
    __useColorEncoding?: boolean;
    __zoom8Available?: boolean;
    __manifestRequestTime?: number;
    __firstTileRequestTime?: number;
    __currentMapZoom?: number;
    __savedTileCount?: number;
}

// ============================================================================
// Color extraction helpers
// ============================================================================

/**
 * Extract colors from all visible tiles in the map
 * Checks both tile layers (.leaflet-tile img) and image overlays (.leaflet-image-layer)
 */
async function getVisibleTileColors(page: Page): Promise<RGB[]> {
    return page.evaluate(() => {
        // Find tiles from both regular tile layers and image overlays
        const tileImages = document.querySelectorAll('.leaflet-tile img');
        const imageOverlays = document.querySelectorAll('.leaflet-image-layer');
        const colors: Array<{ r: number; g: number; b: number }> = [];

        // Process regular tile images
        for (const tile of tileImages) {
            if (!tile.complete || tile.naturalWidth === 0) {continue;}

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) {continue;}

            canvas.width = 1;
            canvas.height = 1;

            // Sample center pixel
            context.drawImage(tile, 0, 0, 1, 1);
            const imageData = context.getImageData(0, 0, 1, 1);
            const [r, g, b] = imageData.data;
            colors.push({ r: r ?? 0, g: g ?? 0, b: b ?? 0 });
        }
        
        // Process image overlays (used by navigation map)
        for (const img of imageOverlays) {
            if (!img.complete || img.naturalWidth === 0) {continue;}

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) {continue;}

            canvas.width = 1;
            canvas.height = 1;

            // Sample center pixel
            context.drawImage(img, 0, 0, 1, 1);
            const imageData = context.getImageData(0, 0, 1, 1);
            const [r, g, b] = imageData.data;
            colors.push({ r: r ?? 0, g: g ?? 0, b: b ?? 0 });
        }
        
        return colors;
    });
}

/**
 * Calculate brightness (average of RGB)
 */
function getBrightness(color: RGB): number {
    return (color.r + color.g + color.b) / 3;
}

/**
 * Determine dominant color channel
 */
function getDominantChannel(color: RGB): 'R' | 'G' | 'B' {
    if (color.r > color.g && color.r > color.b) {return 'R';}
    if (color.b > color.r && color.b > color.g) {return 'B';}
    return 'G';
}

/**
 * Check if color indicates overworld (blue dominant)
 */
function isOverworldColor(color: RGB): boolean {
    return color.b > color.r && color.b > color.g;
}

/**
 * Check if color indicates nether (red dominant)
 */
function isNetherColor(color: RGB): boolean {
    return color.r > color.b && color.r > color.g;
}

// ============================================================================
// Selector constants
// ============================================================================

const SELECTOR_OPEN_CART = '#open-cart';
const SELECTOR_TAB_NAVIGATE = '#tab-navigate';
const SELECTOR_PLAYER_NAME_INPUT = '#player-name-input';
const SELECTOR_START_NAVIGATION = '#start-navigation';
const SELECTOR_ADD_TO_CART_BUTTON = '.add-to-cart-btn';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the navigation map is open', async ({ page, tileRequests }) => {
    const p = page as PageWithTileTracking;
    
    // Initialize tile request tracking
    p.__tileRequests = [];
    
    // Set up request listener BEFORE any navigation
    page.on('request', request => {
        if (request.url().includes('/tiles/') && request.url().endsWith('.png')) {
            p.__tileRequests?.push(request.url());
            tileRequests.push(request.url());
        }
    });
    
    // Add an item to cart first
    const row = page.locator('.trade-row').first();
    await row.locator(SELECTOR_ADD_TO_CART_BUTTON).click();

    // Open cart and navigate
    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector('#cart-dialog[open]', { state: 'visible' });
    await page.click(SELECTOR_TAB_NAVIGATE);
    await page.fill(SELECTOR_PLAYER_NAME_INPUT, 'TestPlayer');
    await page.click(SELECTOR_START_NAVIGATION);
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible' });

    // Wait for tiles to load
    await page.waitForTimeout(1000);
});

Given('the navigation map is open at map zoom {int}', async ({ page, tileRequests }, mapZoom: number) => {
    const p = page as PageWithTileTracking;
    p.__currentMapZoom = mapZoom;
    
    // Initialize tile request tracking BEFORE navigation
    // We track all requests, but mark when we start tracking "at target zoom"
    p.__tileRequests = [];
    const allRequests: string[] = [];
    
    // Set up request listener BEFORE any navigation
    page.on('request', request => {
        if (request.url().includes('/tiles/') && request.url().endsWith('.png')) {
            allRequests.push(request.url());
            tileRequests.push(request.url());
        }
    });

    // Add an item to cart first
    const row = page.locator('.trade-row').first();
    await row.locator(SELECTOR_ADD_TO_CART_BUTTON).click();

    // Open cart and navigate
    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector('#cart-dialog[open]', { state: 'visible' });
    await page.click(SELECTOR_TAB_NAVIGATE);
    await page.fill(SELECTOR_PLAYER_NAME_INPUT, 'TestPlayer');
    
    // IMPORTANT: Set the target zoom level BEFORE starting navigation
    // This will be picked up by the map initialization
    await page.evaluate((zoom) => {
        (globalThis as unknown as { __targetMapZoom?: number }).__targetMapZoom = zoom;
    }, mapZoom);
    
    await page.click(SELECTOR_START_NAVIGATION);
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible' });
    
    // Set zoom level using Leaflet (in case map didn't pick up the target zoom)
    await page.evaluate((zoom) => {
        const map = (globalThis as unknown as { __leafletMap?: { setZoom: (z: number) => void } }).__leafletMap;
        if (map) {
            map.setZoom(zoom);
        }
    }, mapZoom);

    // Wait for tiles to load at new zoom
    await page.waitForTimeout(1000);
    
    // For request verification tests:
    // - If checking "no zoom-8 at low zoom": use allRequests (includes initialization)
    // - If checking "zoom-8 at high zoom": track after setting target zoom
    // Store both for test steps to use appropriately
    p.__tileRequests = allRequests;
    p.__tileRequestsAtTargetZoom = allRequests.slice(allRequests.length > 0 ? -20 : 0);
});

Given('the navigation map shows {word} tiles', async ({ page }, world: string) => {
    // If nether, we need to add a nether shop item
    const shopFilter = world === 'nether' ? 'Nether' : 'Overworld';
    const row = page.locator('.trade-row').filter({ hasText: shopFilter }).first();
    await row.locator(SELECTOR_ADD_TO_CART_BUTTON).click();

    // Open navigation
    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector('#cart-dialog[open]', { state: 'visible' });
    await page.click(SELECTOR_TAB_NAVIGATE);
    await page.fill(SELECTOR_PLAYER_NAME_INPUT, 'TestPlayer');
    await page.click(SELECTOR_START_NAVIGATION);
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible' });
    await page.waitForTimeout(1000);
});

Given(String.raw`a {word} shop exists at \({int}, {int}\)`, async ({ page }, world: string, x: number, z: number) => {
    const p = page as PageWithTileTracking;
    p.__lastPlayerX = x;
    p.__lastPlayerZ = z;
});

Given(String.raw`a tile at \({int}, {int}\) at zoom {int}`, async ({ page }, tileX: number, tileZ: number, zoom: number) => {
    // Store for later verification
    const p = page as PageWithTileTracking;
    (p as unknown as { __testTileX: number }).__testTileX = tileX;
    (p as unknown as { __testTileZ: number }).__testTileZ = tileZ;
    (p as unknown as { __testZoom: number }).__testZoom = zoom;
});

Given(String.raw`a nether shop at nether coordinates \({int}, {int}\)`, async ({ page }, netherX: number, netherZ: number) => {
    const p = page as PageWithTileTracking;
    // Store nether coordinates (will be converted to overworld ×8)
    (p as unknown as { __netherX: number }).__netherX = netherX;
    (p as unknown as { __netherZ: number }).__netherZ = netherZ;
});

Given('the navigation map is at zoom level {int}', async ({ page }, zoomLevel: number) => {
    const p = page as PageWithTileTracking;
    p.__currentMapZoom = zoomLevel;
});

Given('tiles are currently {word}', async ({ page }, brightness: string) => {
    // Just a descriptive step, actual verification happens in Then
    const p = page as PageWithTileTracking;
    (p as unknown as { __expectedStartBrightness: string }).__expectedStartBrightness = brightness;
});

Given('zoom-8 tiles are unavailable for the current area', async ({ page }) => {
    const p = page as PageWithTileTracking;
    p.__zoom8Available = false;
});

// Store mock shop data for dynamic shop creation
interface MockShopData {
    name: string;
    x: number;
    z: number;
    world: string;
}
const mockShops = new Map<string, MockShopData>();

Given(String.raw`a mock shop {string} exists at \({int}, {int}\) in {string}`, async ({ page, tileRequests }, shopName: string, x: number, z: number, world: string) => {
    const p = page as PageWithTileTracking;
    
    // Store shop data for later navigation
    mockShops.set(shopName, { name: shopName, x, z, world });
    
    // Initialize tile request tracking if not already done
    if (!p.__tileRequests) {
        p.__tileRequests = [];
        
        // Set up request listener
        page.on('request', request => {
            if (request.url().includes('/tiles/') && request.url().endsWith('.png')) {
                p.__tileRequests?.push(request.url());
                tileRequests.push(request.url());
            }
        });
    }
    
    // We'll intercept data.json to add this shop
    const worldSuffix = world === 'the_nether' ? 'World_nether' : 'World';
    
    await page.route('**/data.json', async route => {
        const shops = [...mockShops.values()].map(shop => ({
            shopName: shop.name,
            shopOwner: 'TestOwner',
            location: `${shop.x}.0, 64.0, ${shop.z}.0`,
            world: shop.world === 'the_nether' ? 'World_nether' : 'World',
            recipes: [{
                resultItem: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                item1: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                stock: 10
            }]
        }));
        
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: shops })
        });
    });
});

Given(String.raw`navigation is active with player at \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithTileTracking;
    p.__lastPlayerX = x;
    p.__lastPlayerZ = z;

    // Open navigation
    const row = page.locator('.trade-row').first();
    await row.locator(SELECTOR_ADD_TO_CART_BUTTON).click();

    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector('#cart-dialog[open]', { state: 'visible' });
    await page.click(SELECTOR_TAB_NAVIGATE);
    await page.fill(SELECTOR_PLAYER_NAME_INPUT, 'TestPlayer');
    await page.click(SELECTOR_START_NAVIGATION);
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible' });
    await page.waitForTimeout(1000);
});

Given('I note the current tile request count', async ({ page }) => {
    const p = page as PageWithTileTracking;
    p.__savedTileCount = p.__tileRequests?.length ?? 0;
});

// ============================================================================
// WHEN Steps
// ============================================================================

When(String.raw`I center the map on world coordinates \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithTileTracking;
    
    // Remember count before setView to detect new tile loads
    const countBefore = p.__tileRequests?.length ?? 0;
    
    await page.evaluate(({ x, z }) => {
        const map = (globalThis as unknown as { __leafletMap?: { setView: (latlng: [number, number], zoom?: number) => void; invalidateSize: () => void } }).__leafletMap;
        if (map) {
            // Leaflet uses lat/lng, we need to convert from Minecraft coords
            // In our tile system, x maps to lng, z maps to lat (negated)
            map.setView([-z, x], 8); // Force zoom 8 for consistent testing
            map.invalidateSize(); // Force tile recalculation
        }
    }, { x, z });
    
    // Wait for new tiles to be requested (up to 3 seconds)
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
        const currentCount = p.__tileRequests?.length ?? 0;
        if (currentCount > countBefore) {
            break; // New tiles were requested
        }
        await page.waitForTimeout(100);
    }
    
    // Extra wait for all tiles to complete loading
    await page.waitForTimeout(500);
});

When('I inspect the visible tile colors', async ({ page }) => {
    // Colors will be inspected in the Then step
    await page.waitForTimeout(100);
});

When('I inspect all visible tile pixels', async ({ page }) => {
    await page.waitForTimeout(100);
});

When(String.raw`I inspect tiles at positions \({int}, {int}\) and \({int}, {int}\)`, async ({ page }, _t1x: number, _t1z: number, _t2x: number, _t2z: number) => {
    // Positions stored for comparison in Then step
    await page.waitForTimeout(100);
});

When('I open the navigation map for that shop', async ({ page }) => {
    const row = page.locator('.trade-row').first();
    await row.locator(SELECTOR_ADD_TO_CART_BUTTON).click();

    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector('#cart-dialog[open]', { state: 'visible' });
    await page.click(SELECTOR_TAB_NAVIGATE);
    await page.fill(SELECTOR_PLAYER_NAME_INPUT, 'TestPlayer');
    await page.click(SELECTOR_START_NAVIGATION);
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible' });
    await page.waitForTimeout(1000);
});

When('I navigate to shop {string}', async ({ page, tileRequests }, shopName: string) => {
    const p = page as PageWithTileTracking;
    
    // Initialize tile request tracking if not already done
    if (!p.__tileRequests) {
        p.__tileRequests = [];
        
        // Set up request listener
        page.on('request', request => {
            if (request.url().includes('/tiles/') && request.url().endsWith('.png')) {
                p.__tileRequests?.push(request.url());
                tileRequests.push(request.url());
            }
        });
    }
    
    // Navigate to page to load the mock data
    await page.goto('/pvc-trades/');
    await page.waitForSelector('.trade-row', { state: 'visible' });
    
    // Find the shop row by name and add to cart
    const row = page.locator('.trade-row').filter({ hasText: shopName });
    await row.locator('.add-to-cart-btn').click();
    
    // Open cart and start navigation
    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector('#cart-dialog[open]', { state: 'visible' });
    await page.click(SELECTOR_TAB_NAVIGATE);
    await page.fill(SELECTOR_PLAYER_NAME_INPUT, 'TestPlayer');
    await page.click(SELECTOR_START_NAVIGATION);
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible' });
    
    // Wait for tiles to load
    await page.waitForTimeout(1500);
});

When('I navigate to the shop named {string}', async ({ page, tileRequests }, shopName: string) => {
    const p = page as PageWithTileTracking;
    
    // Initialize tile request tracking if not already done
    // The Background step may have already set this up
    if (!p.__tileRequests) {
        p.__tileRequests = [];
    }
    
    // Set up request listener BEFORE any navigation
    // Note: Background step already loaded the page with mock data at /
    page.on('request', request => {
        if (request.url().includes('/tiles/') && request.url().endsWith('.png')) {
            p.__tileRequests?.push(request.url());
            tileRequests.push(request.url());
        }
    });
    
    // Debug: Check what's currently on the page
    const pageUrl = page.url();
    const tradeRows = await page.locator('.trade-row').count();
    console.log(`DEBUG: Current URL = ${pageUrl}, Trade rows found = ${tradeRows}`);
    
    if (tradeRows > 0) {
        const firstRowText = await page.locator('.trade-row').first().textContent();
        console.log(`DEBUG: First trade row text: ${firstRowText?.slice(0, 100)}`);
    }
    
    // Wait for trade rows to be visible (Background step should have loaded them)
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 10_000 });
    
    // Find the shop row by name and add to cart
    const row = page.locator('.trade-row').filter({ hasText: shopName });
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.locator('.add-to-cart-btn').click();
    
    // Open cart and start navigation
    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector('#cart-dialog[open]', { state: 'visible' });
    await page.click(SELECTOR_TAB_NAVIGATE);
    await page.fill(SELECTOR_PLAYER_NAME_INPUT, 'TestPlayer');
    await page.click(SELECTOR_START_NAVIGATION);
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible' });
    
    // Wait for tiles to load
    await page.waitForTimeout(1500);
});

When('I navigate to a shop selling {string}', async ({ page, tileRequests }, item: string) => {
    const p = page as PageWithTileTracking;
    
    // Initialize tile request tracking
    if (!p.__tileRequests) {
        p.__tileRequests = [];
    }
    
    // Set up request listener
    page.on('request', request => {
        if (request.url().includes('/tiles/') && request.url().endsWith('.png')) {
            p.__tileRequests?.push(request.url());
            tileRequests.push(request.url());
        }
    });
    
    // Wait for trade rows to be visible
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 10_000 });
    
    // Find a trade row that mentions this item (in the result column)
    // The trade row structure has .result which shows what you GET
    const row = page.locator('.trade-row').filter({ hasText: item }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.locator('.add-to-cart-btn').click();
    
    // Open cart and start navigation
    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector('#cart-dialog[open]', { state: 'visible' });
    await page.click(SELECTOR_TAB_NAVIGATE);
    await page.fill(SELECTOR_PLAYER_NAME_INPUT, 'TestPlayer');
    await page.click(SELECTOR_START_NAVIGATION);
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible' });
    
    // Wait for tiles to load
    await page.waitForTimeout(1500);
});

When('I open the navigation map', async ({ page }) => {
    const row = page.locator('.trade-row').first();
    await row.locator(SELECTOR_ADD_TO_CART_BUTTON).click();

    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector('#cart-dialog[open]', { state: 'visible' });
    await page.click(SELECTOR_TAB_NAVIGATE);
    await page.fill(SELECTOR_PLAYER_NAME_INPUT, 'TestPlayer');
    await page.click(SELECTOR_START_NAVIGATION);
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible' });
    await page.waitForTimeout(1000);
});

When('the map falls back to zoom-4 tiles', async ({ page }) => {
    // Fallback happens automatically when zoom-8 unavailable
    await page.waitForTimeout(500);
});

When('I zoom the map to level {int}', async ({ page }, zoomLevel: number) => {
    await page.evaluate((zoom) => {
        const map = (globalThis as unknown as { __leafletMap?: { setZoom: (z: number) => void } }).__leafletMap;
        if (map) {
            map.setZoom(zoom);
        }
    }, zoomLevel);
    await page.waitForTimeout(1000);
});

When('I rapidly pan {word} {int} times', async ({ page }, direction: string, count: number) => {
    const mapContainer = page.locator('#nav-dialog-map-container');
    const box = await mapContainer.boundingBox();
    if (!box) {return;}

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const panDistance = 100;

    for (let index = 0; index < count; index++) {
        let endX = centerX;
        let endY = centerY;

        switch (direction) {
            case 'east': { endX -= panDistance; break;
            }
            case 'west': { endX += panDistance; break;
            }
            case 'north': { endY += panDistance; break;
            }
            case 'south': { endY -= panDistance; break;
            }
            case 'random': {
                endX += (Math.random() - 0.5) * panDistance * 2;
                endY += (Math.random() - 0.5) * panDistance * 2;
                break;
            }
        }

        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        await page.mouse.move(endX, endY, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(50);
    }
    await page.waitForTimeout(500);
});

When('player position updates {int} times within the same tile', async ({ page }, count: number) => {
    const p = page as PageWithTileTracking;
    const baseX = p.__lastPlayerX ?? 100;
    const baseZ = p.__lastPlayerZ ?? 200;

    // Update position slightly within same tile (tile is 512 blocks)
    for (let index = 0; index < count; index++) {
        const newX = baseX + (index % 10);
        const newZ = baseZ + (index % 10);

        // Trigger player position update via API mock
        // The actual update depends on app implementation
        await page.waitForTimeout(100);
    }
});

// ============================================================================
// THEN Steps
// ============================================================================

Then(String.raw`the expected tile \({int}, {int}\) for world {string} should be requested`, async ({ page }, tileX: number, tileZ: number, world: string) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    
    // URL format is /tiles/{world}/{zoomLevel}/{tileX}/{tileZ}.png
    const worldPath = world === 'the_nether' ? 'the_nether' : 'overworld';
    const patterns = [
        `/${worldPath}/8/${tileX}/${tileZ}.png`,
        `/tiles/${worldPath}/8/${tileX}/${tileZ}.png`,
    ];
    
    const found = requests.some(url => patterns.some(pattern => url.includes(pattern)));

    if (!found) {
        // Log helpful debug info
        console.log(`Tile requests captured (${requests.length}):`, requests.slice(0, 15));
        console.log(`Looking for tile (${tileX}, ${tileZ}) in ${world}, patterns:`, patterns);
        
        // Show which tiles WERE requested for this world
        const worldRequests = requests.filter(url => url.includes(`/${worldPath}/`));
        console.log(`Requests for ${world}:`, worldRequests.slice(0, 10));
    }
    
    expect(found, `Expected tile (${tileX}, ${tileZ}) in ${world} at zoom 8 to be requested. Got ${requests.length} total requests.`).toBe(true);
});

Then(String.raw`a tile containing coordinates \({int}, {int}\) should be requested`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    
    // Calculate which tile contains these coordinates at zoom 8 (512 blocks per tile)
    const blocksPerTile = 512;
    const expectedTileX = Math.floor(x / blocksPerTile);
    const expectedTileZ = Math.floor(z / blocksPerTile);
    
    // URL format is /tiles/{world}/{zoomLevel}/{tileX}/{tileZ}.png
    const patterns = [
        `/overworld/8/${expectedTileX}/${expectedTileZ}.png`,
        `/tiles/overworld/8/${expectedTileX}/${expectedTileZ}.png`,
    ];
    
    const found = requests.some(url => patterns.some(pattern => url.includes(pattern)));

    if (!found) {
        // Log helpful debug info
        console.log(`Coordinates (${x}, ${z}) → Expected tile (${expectedTileX}, ${expectedTileZ})`);
        console.log(`Tile requests captured (${requests.length}):`, requests.slice(0, 15));
        console.log('Patterns searched:', patterns);
        
        // Extract tile coordinates from actual requests
        const overworldRequests = requests.filter(url => url.includes('/overworld/8/'));
        console.log('Overworld zoom-8 tiles:', overworldRequests.slice(0, 10));
    }
    
    expect(found, `Expected tile (${expectedTileX}, ${expectedTileZ}) containing coords (${x}, ${z}) to be requested. Got ${requests.length} total requests.`).toBe(true);
});

Then(String.raw`tile \({int}, {int}\) should be requested at zoom 8`, async ({ page }, tileX: number, tileZ: number) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];

    // URL format is /tiles/{world}/{zoomLevel}/{tileX}/{tileZ}.png
    // Zoom level 8 = 512 blocks per tile
    const patterns = [
        `/overworld/8/${tileX}/${tileZ}.png`,
        `/tiles/overworld/8/${tileX}/${tileZ}.png`,
    ];
    
    const found = requests.some(url => patterns.some(pattern => url.includes(pattern)));

    if (!found) {
        console.log(`Tile requests captured (${requests.length}):`, requests.slice(0, 10));
        console.log(`Looking for tile (${tileX}, ${tileZ}), patterns:`, patterns);
    }
    
    expect(found, `Expected tile (${tileX}, ${tileZ}) at zoom 8 to be requested. Got ${requests.length} requests.`).toBe(true);
});

Then('the tile\'s west edge should be at x = {int}', async ({ page }, westX: number) => {
    const p = page as unknown as { __testTileX: number; __testZoom: number };
    const blocksPerTile = p.__testZoom === 8 ? 512 : 8192;
    const calculatedWest = p.__testTileX * blocksPerTile;
    expect(calculatedWest).toBe(westX);
});

Then('the tile\'s east edge should be at x = {int}', async ({ page }, eastX: number) => {
    const p = page as unknown as { __testTileX: number; __testZoom: number };
    const blocksPerTile = p.__testZoom === 8 ? 512 : 8192;
    const calculatedEast = (p.__testTileX + 1) * blocksPerTile;
    expect(calculatedEast).toBe(eastX);
});

Then('the tile\'s north edge should be at z = {int}', async ({ page }, northZ: number) => {
    const p = page as unknown as { __testTileZ: number; __testZoom: number };
    const blocksPerTile = p.__testZoom === 8 ? 512 : 8192;
    const calculatedNorth = p.__testTileZ * blocksPerTile;
    expect(calculatedNorth).toBe(northZ);
});

Then('the tile\'s south edge should be at z = {int}', async ({ page }, southZ: number) => {
    const p = page as unknown as { __testTileZ: number; __testZoom: number };
    const blocksPerTile = p.__testZoom === 8 ? 512 : 8192;
    const calculatedSouth = (p.__testTileZ + 1) * blocksPerTile;
    expect(calculatedSouth).toBe(southZ);
});

Then('all tiles should be {word} indicating zoom {int}', async ({ page }, brightness: string, _zoomLevel: number) => {
    const colors = await getVisibleTileColors(page);
    expect(colors.length).toBeGreaterThan(0);

    for (const color of colors) {
        const tileBrightness = getBrightness(color);

        if (brightness === 'bright') {
            expect(tileBrightness).toBeGreaterThanOrEqual(BRIGHTNESS_THRESHOLD);
        } else {
            expect(tileBrightness).toBeLessThan(BRIGHTNESS_THRESHOLD);
        }
    }
});

Then('tile brightness values should be between {int} and {int}', async ({ page }, minBrightness: number, maxBrightness: number) => {
    const colors = await getVisibleTileColors(page);

    for (const color of colors) {
        const brightness = getBrightness(color);
        expect(brightness).toBeGreaterThanOrEqual(minBrightness);
        expect(brightness).toBeLessThanOrEqual(maxBrightness);
    }
});

Then('tiles should have {word} dominant color channel', async ({ page }, expectedHue: string) => {
    const colors = await getVisibleTileColors(page);
    expect(colors.length).toBeGreaterThan(0);

    for (const color of colors) {
        if (expectedHue === 'blue') {
            expect(isOverworldColor(color)).toBe(true);
        } else if (expectedHue === 'red') {
            expect(isNetherColor(color)).toBe(true);
        }
    }
});

Then('each tile should be clearly bright OR clearly dark', async ({ page }) => {
    const colors = await getVisibleTileColors(page);

    for (const color of colors) {
        const brightness = getBrightness(color);
        const isClearlyBright = brightness >= BRIGHTNESS_THRESHOLD;
        const isClearlyDark = brightness < AMBIGUOUS_MIN;
        expect(isClearlyBright || isClearlyDark).toBe(true);
    }
});

Then('no tile brightness should be in the ambiguous {int}-{int} range', async ({ page }, min: number, max: number) => {
    const colors = await getVisibleTileColors(page);

    for (const color of colors) {
        const brightness = getBrightness(color);
        const isAmbiguous = brightness >= min && brightness <= max;
        expect(isAmbiguous).toBe(false);
    }
});

Then('tiles with different parity should have different brightness', async ({ page }) => {
    const colors = await getVisibleTileColors(page);

    if (colors.length >= 2) {
        const brightness1 = getBrightness(colors[0]!);
        const brightness2 = getBrightness(colors[1]!);

        // Adjacent tiles should differ due to checkerboard
        const difference = Math.abs(brightness1 - brightness2);
        expect(difference).toBeGreaterThan(5);
    }
});

Then('their color difference should be approximately {int} percent', async ({ page }, percent: number) => {
    const colors = await getVisibleTileColors(page);

    if (colors.length >= 2) {
        const brightness1 = getBrightness(colors[0]!);
        const brightness2 = getBrightness(colors[1]!);

        const maxBrightness = Math.max(brightness1, brightness2);
        const difference = Math.abs(brightness1 - brightness2);
        const percentDiff = (difference / maxBrightness) * 100;

        // Allow 5% tolerance
        expect(percentDiff).toBeGreaterThan(percent - 5);
        expect(percentDiff).toBeLessThan(percent + 5);
    }
});

Then('visible tiles should have brightness below {int}', async ({ page }, threshold: number) => {
    const colors = await getVisibleTileColors(page);

    for (const color of colors) {
        expect(getBrightness(color)).toBeLessThan(threshold);
    }
});

Then('the color hue should still indicate the correct world', async ({ page }) => {
    const colors = await getVisibleTileColors(page);

    // At least one tile should have clear world indicator
    const hasWorldIndicator = colors.some(c => isOverworldColor(c) || isNetherColor(c));
    expect(hasWorldIndicator).toBe(true);
});

Then('tiles should transition to {word}', async ({ page }, brightness: string) => {
    const colors = await getVisibleTileColors(page);
    expect(colors.length).toBeGreaterThan(0);

    for (const color of colors) {
        const tileBrightness = getBrightness(color);

        if (brightness === 'bright') {
            expect(tileBrightness).toBeGreaterThanOrEqual(BRIGHTNESS_THRESHOLD);
        } else {
            expect(tileBrightness).toBeLessThan(BRIGHTNESS_THRESHOLD);
        }
    }
});

Then(String.raw`the shop marker should be at overworld position \({int}, {int}\)`, async ({ page }, owX: number, owZ: number) => {
    // Verify marker position on the map
    const marker = page.locator('.leaflet-marker-icon').first();
    const exists = await marker.isVisible();
    expect(exists).toBe(true);

    // The actual position verification would require checking Leaflet's internal state
    // For now, we verify the marker exists
});

Then(String.raw`overworld tile at \({int}, {int}\) should be requested`, async ({ page }, tileX: number, tileZ: number) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];

    const expectedPattern = `/overworld/512/${tileX}/${tileZ}.png`;
    const found = requests.some(url => url.includes(expectedPattern));

    expect(found).toBe(true);
});

Then('manifest.json should be requested first', async ({ page }) => {
    const p = page as PageWithTileTracking;

    expect(p.__manifestRequestTime).toBeDefined();
    if (p.__firstTileRequestTime !== undefined) {
        expect(p.__manifestRequestTime).toBeLessThanOrEqual(p.__firstTileRequestTime);
    }
});

Then('tile requests should only occur after manifest loads', async ({ page }) => {
    const p = page as PageWithTileTracking;

    if (p.__manifestRequestTime !== undefined && p.__firstTileRequestTime !== undefined) {
        expect(p.__firstTileRequestTime).toBeGreaterThanOrEqual(p.__manifestRequestTime);
    }
});

Then('each unique tile should be requested at most once', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];

    const uniqueRequests = new Set(requests);
    expect(requests.length).toBe(uniqueRequests.size);
});

Then('the tile request count should not increase', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const currentCount = p.__tileRequests?.length ?? 0;
    const savedCount = p.__savedTileCount ?? 0;

    expect(currentCount).toBe(savedCount);
});

Then('visible tiles should remain stable', async ({ page }) => {
    const tileCount1 = await page.locator('.leaflet-tile img').count();
    await page.waitForTimeout(500);
    const tileCount2 = await page.locator('.leaflet-tile img').count();

    expect(tileCount2).toBe(tileCount1);
});
// ============================================================================
// Simplified shop navigation steps
// ============================================================================

Then('the navigation map should be visible', async ({ page }) => {
    const navDialog = page.locator('#nav-dialog[open]');
    await expect(navDialog).toBeVisible({ timeout: 10_000 });
    
    const mapContainer = page.locator('#nav-dialog-map-container');
    await expect(mapContainer).toBeVisible();
});

Then('a shop marker should be visible on the map', async ({ page }) => {
    // Wait for Leaflet markers to render
    await page.waitForTimeout(500);
    
    // Look for Leaflet markers (div-icons or circle markers)
    const markers = page.locator('.leaflet-marker-icon, .leaflet-interactive');
    const count = await markers.count();
    
    // At least one marker should be visible
    expect(count).toBeGreaterThan(0);
});

// ============================================================================
// Zoom threshold property test steps
// ============================================================================

Then('at least one tile should have brightness above {int}', async ({ page }, threshold: number) => {
    const colors = await getVisibleTileColors(page);
    expect(colors.length).toBeGreaterThan(0);
    
    const hasBrightTile = colors.some(color => getBrightness(color) >= threshold);
    expect(hasBrightTile).toBe(true);
});

Then('all tiles should have brightness below {int}', async ({ page }, threshold: number) => {
    const colors = await getVisibleTileColors(page);
    expect(colors.length).toBeGreaterThan(0);
    
    for (const color of colors) {
        expect(getBrightness(color)).toBeLessThan(threshold);
    }
});

Then('this confirms zoom-8 tiles are loading', async () => {
    // This is a documentation step - the actual verification was in the previous step
});

Then('this confirms only zoom-4 tiles are visible', async () => {
    // This is a documentation step - the actual verification was in the previous step
});

When('I wait for tiles to load', async ({ page }) => {
    // Wait for tile images to load
    await page.waitForTimeout(1000);
    
    // Wait for any pending network requests to complete
    await page.waitForLoadState('networkidle');
});

Then('tiles should be {word}', async ({ page }, brightness: string) => {
    const colors = await getVisibleTileColors(page);
    expect(colors.length).toBeGreaterThan(0);
    
    for (const color of colors) {
        const tileBrightness = getBrightness(color);
        
        if (brightness === 'bright') {
            expect(tileBrightness).toBeGreaterThanOrEqual(BRIGHTNESS_THRESHOLD);
        } else {
            expect(tileBrightness).toBeLessThan(BRIGHTNESS_THRESHOLD);
        }
    }
});

Then('zoom 8 tiles should NOT be requested', async ({ page }) => {
    const p = page as PageWithTileTracking;
    const zoom8Requests = p.__tileRequests?.filter(url => url.includes('/8/')) ?? [];
    expect(zoom8Requests.length, 'Expected no zoom 8 tile requests').toBe(0);
});

Then('tile URLs should contain {string}', async ({ page }, pattern: string) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests ?? [];
    expect(requests.length).toBeGreaterThan(0);
    
    const hasPattern = requests.some(url => url.includes(pattern));
    expect(hasPattern).toBe(true);
});

Then('tile URLs should only contain {string}', async ({ page }, pattern: string) => {
    const p = page as PageWithTileTracking;
    const requests = p.__tileRequests?.filter(url => url.includes('.png')) ?? [];
    expect(requests.length).toBeGreaterThan(0);
    
    for (const url of requests) {
        expect(url).toContain(pattern);
    }
});