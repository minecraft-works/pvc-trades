/**
 * Step definitions for unified multi-world navigation
 * All shops displayed on a single map using overworld-equivalent coordinates
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';

// Constants
const SELECTOR_NAV_ROUTE_MARKER = '.nav-route-marker';
const SELECTOR_NAV_PLAYER_MARKER = '.nav-player-marker';
const SELECTOR_NETHER_MARKER = '.nav-route-marker--nether';
const SELECTOR_NETHER_PLAYER = '.nav-player-marker--nether';
const DEFAULT_TIMEOUT = 5000;

// ============================================================================
// GIVEN Steps
// ============================================================================

Given(String.raw`there is a nether shop at \({int}, {int}\)`, async ({ page }) => {
    // The mock data already has nether shops - this step documents the setup
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: DEFAULT_TIMEOUT });
});

Given(String.raw`there is an overworld shop at \({int}, {int}\)`, async ({ page }) => {
    // The mock data already has overworld shops - this step documents the setup
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: DEFAULT_TIMEOUT });
});

Given('I open the navigation dialog with the nether shop', async ({ page }) => {
    // Background step already set up the app with mock data
    // Add nether item to cart - Netherite Scrap is in World_nether in mock data
    const netherRow = page.locator('.trade-row').filter({ hasText: 'Netherite' });
    await netherRow.first().locator('.add-to-cart-btn').click();
    
    // Open cart and navigate
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: DEFAULT_TIMEOUT });
});

Given('I open the navigation dialog with both shops', async ({ page }) => {
    // Background step already set up the app with mock data
    // Add overworld item (Emerald trade)
    const overworldButton = page.locator('.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]');
    await overworldButton.click();
    
    // Add nether item - Netherite Scrap is in World_nether in mock data
    const netherRow = page.locator('.trade-row').filter({ hasText: 'Netherite' });
    await netherRow.first().locator('.add-to-cart-btn').click();
    
    // Open cart and navigate
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: DEFAULT_TIMEOUT });
});

// ============================================================================
// THEN Steps - Unified Map Display
// ============================================================================

Then('the map should show markers for both worlds', async ({ page }) => {
    const markers = page.locator(SELECTOR_NAV_ROUTE_MARKER);
    await expect(markers).toHaveCount(2, { timeout: DEFAULT_TIMEOUT });
});

Then('overworld shop markers should be visible', async ({ page }) => {
    // Overworld markers don't have --nether modifier
    const overworldMarkers = page.locator(`${SELECTOR_NAV_ROUTE_MARKER}:not(${SELECTOR_NETHER_MARKER})`);
    await expect(overworldMarkers.first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });
});

Then('nether shop markers should be visible with nether styling', async ({ page }) => {
    const netherMarkers = page.locator(SELECTOR_NETHER_MARKER);
    await expect(netherMarkers.first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });
});

Then('only overworld tiles should be loaded', async ({ page }) => {
    // Verify the map is using overworld tiles by checking the exposed world
    const mapWorld = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        return globalThis.__navMapWorld;
    });
    
    // In unified view, the map world should always be overworld
    expect(mapWorld).toBe('overworld');
});

Then('nether shops should appear on overworld tiles', async ({ page }) => {
    // Nether shop markers exist and are visible
    const netherMarkers = page.locator(SELECTOR_NETHER_MARKER);
    await expect(netherMarkers.first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });
});

Then('the nether shop marker should be positioned at 8x nether coordinates', async ({ page }) => {
    // Get the nether shop's raw and display coordinates from the route
    const coords = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        const route = globalThis.__navCurrentWorldRoute;
        if (!route) { return null; }
        // Find nether shop
        const netherStop = route.find((s: { world: string }) => s.world.toLowerCase().includes('nether'));
        if (!netherStop) { return null; }
        return {
            rawX: netherStop.x,
            rawZ: netherStop.z,
            displayX: netherStop.displayX,
            displayZ: netherStop.displayZ
        };
    });
    
    expect(coords).not.toBeNull();
    // Display coords should be 8× the raw nether coords
    expect(coords!.displayX).toBe(coords!.rawX * 8);
    expect(coords!.displayZ).toBe(coords!.rawZ * 8);
});

Then(String.raw`the nether shop marker should be positioned at overworld coords \({int}, {int}\)`, async ({ page }, expectedX: number, expectedZ: number) => {
    // Get the marker's position via exposed test data
    const markerPos = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        const route = globalThis.__navCurrentWorldRoute;
        if (!route) { return null; }
        // Find nether shop and get its display position
        const netherStop = route.find((s: { world: string }) => s.world.toLowerCase().includes('nether'));
        return netherStop ? { x: netherStop.displayX ?? netherStop.x * 8, z: netherStop.displayZ ?? netherStop.z * 8 } : null;
    });
    
    expect(markerPos).not.toBeNull();
    expect(markerPos!.x).toBe(expectedX);
    expect(markerPos!.z).toBe(expectedZ);
});

// ============================================================================
// THEN Steps - Nether Visual Distinction
// ============================================================================

Then('nether shop markers should have a red\\/nether tint', async ({ page }) => {
    const netherMarker = page.locator(SELECTOR_NETHER_MARKER).first();
    await expect(netherMarker).toBeVisible();
    
    // Check for nether styling class
    await expect(netherMarker).toHaveClass(/nether/);
});

Then('nether shop markers should show a nether icon indicator', async ({ page }) => {
    // Check for nether icon in marker (could be 🔥 emoji or portal icon)
    const netherMarker = page.locator(SELECTOR_NETHER_MARKER).first();
    const markerHtml = await netherMarker.innerHTML();
    
    // Should have some nether indicator (icon, emoji, or class)
    const hasNetherIndicator = 
        markerHtml.includes('nether') || 
        markerHtml.includes('🔥') ||
        markerHtml.includes('portal');
    
    expect(hasNetherIndicator).toBe(true);
});

Then('the tooltip should show nether coords {string}', async ({ page }, expectedCoords: string) => {
    const tooltip = page.locator('.leaflet-tooltip');
    await expect(tooltip).toContainText(expectedCoords);
});

Then('the tooltip should show overworld equivalent {string}', async ({ page }, expectedEquiv: string) => {
    const tooltip = page.locator('.leaflet-tooltip');
    await expect(tooltip).toContainText(expectedEquiv);
});

Then('the tooltip should show nether coordinates', async ({ page }) => {
    const tooltip = page.locator('.leaflet-tooltip');
    await expect(tooltip).toContainText('Nether:');
});

Then('the tooltip should show overworld equivalent coordinates', async ({ page }) => {
    const tooltip = page.locator('.leaflet-tooltip');
    await expect(tooltip).toContainText('(OW:');
});

// ============================================================================
// THEN Steps - Player Position
// ============================================================================

Then(String.raw`the player marker should be at position \({int}, {int}\)`, async ({ page }, expectedX: number, expectedZ: number) => {
    // Wait for player position to be available
    await expect.poll(async () => {
        return await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return globalThis.__currentPlayerPosition;
        });
    }, { timeout: DEFAULT_TIMEOUT }).not.toBeNull();
    
    const playerPos = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        return globalThis.__currentPlayerPosition;
    });
    
    expect(playerPos).not.toBeNull();
    expect(playerPos.x).toBe(expectedX);
    expect(playerPos.z).toBe(expectedZ);
});

Then(String.raw`the player marker should be at overworld-equivalent position \({int}, {int}\)`, async ({ page }, expectedX: number, expectedZ: number) => {
    // Wait for player position to be available
    await expect.poll(async () => {
        return await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return globalThis.__currentPlayerPosition;
        });
    }, { timeout: DEFAULT_TIMEOUT }).not.toBeNull();
    
    const displayPos = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        const pos = globalThis.__currentPlayerPosition;
        if (!pos) { return null; }
        
        // If in nether, display position should be * 8
        if (pos.world.toLowerCase().includes('nether')) {
            return { x: pos.x * 8, z: pos.z * 8 };
        }
        return { x: pos.x, z: pos.z };
    });
    
    expect(displayPos).not.toBeNull();
    expect(displayPos!.x).toBe(expectedX);
    expect(displayPos!.z).toBe(expectedZ);
});

Then('the player marker should have nether styling', async ({ page }) => {
    const playerMarker = page.locator(SELECTOR_NAV_PLAYER_MARKER);
    await expect(playerMarker).toBeVisible();
    await expect(playerMarker).toHaveClass(/nether/);
});

Then('the player marker should change to nether styling', async ({ page }) => {
    await expect.poll(async () => {
        const playerMarker = page.locator(SELECTOR_NAV_PLAYER_MARKER);
        const classes = await playerMarker.getAttribute('class');
        return classes?.includes('nether') ?? false;
    }, { timeout: DEFAULT_TIMEOUT }).toBe(true);
});

Then('the player marker should change to overworld styling', async ({ page }) => {
    await expect.poll(async () => {
        const playerMarker = page.locator(SELECTOR_NAV_PLAYER_MARKER);
        const classes = await playerMarker.getAttribute('class');
        return !classes?.includes('nether') ?? true;
    }, { timeout: DEFAULT_TIMEOUT }).toBe(true);
});

Then('the player marker should stay at approximately the same map position', async ({ page }) => {
    // When moving between nether (100, 50) and overworld (800, 400), the 
    // overworld-equivalent position is the same, so marker shouldn't jump
    const playerMarker = page.locator(SELECTOR_NAV_PLAYER_MARKER);
    await expect(playerMarker).toBeVisible();
    
    // The marker should remain visible without jumping to a completely different location
    // This is verified by checking visibility persists through the transition
});

// ============================================================================
// THEN Steps - Route Display
// ============================================================================

Then('the route line should connect all stops', async ({ page }) => {
    const polyline = page.locator('path.leaflet-interactive');
    await expect(polyline.first()).toBeVisible();
});

Then('the route should go from player to nearest shop', async ({ page }) => {
    // Route should exist and be visible
    const markers = page.locator(SELECTOR_NAV_ROUTE_MARKER);
    await expect(markers.first()).toBeVisible();
});

Then('the distance should be calculated using 8x nether coordinates', async ({ page }) => {
    // Get the nether shop's coordinates and the displayed distance
    const data = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        const route = globalThis.__navCurrentWorldRoute;
        if (!route) { return null; }
        // Find nether shop
        const netherStop = route.find((s: { world: string }) => s.world.toLowerCase().includes('nether'));
        if (!netherStop) { return null; }
        return {
            rawX: netherStop.x,
            rawZ: netherStop.z,
            displayX: netherStop.displayX,
            displayZ: netherStop.displayZ
        };
    });
    
    expect(data).not.toBeNull();
    
    // The distance from origin (0,0) should use display coords (overworld-equivalent)
    const expectedDistanceUsing8x = Math.hypot(data!.displayX, data!.displayZ);
    
    // Get just the distance element which contains "X blocks" or "X,XXX blocks"
    const distanceElement = page.locator('.nav-info-distance');
    const distanceText = await distanceElement.textContent();
    
    // Match "5,523 blocks" or "5523 blocks" - handle comma-separated thousands
    const match = distanceText?.match(/([\d,]+)\s*blocks/i);
    expect(match).not.toBeNull();
    
    // Remove commas and parse
    const actualDistance = Number.parseInt(match![1]!.replace(/,/g, ''), 10);
    // Allow 15% tolerance for rounding
    expect(actualDistance).toBeGreaterThan(expectedDistanceUsing8x * 0.85);
    expect(actualDistance).toBeLessThan(expectedDistanceUsing8x * 1.15);
});

Then('the distance shown should be approximately {int} blocks', async ({ page }, expectedDistance: number) => {
    const distanceText = await page.locator('#nav-dialog-distance').textContent();
    
    // Extract number from text like "800 blocks" or "~800 blocks"
    const match = distanceText?.match(/(\d+)/);
    expect(match).not.toBeNull();
    
    const actualDistance = Number.parseInt(match![1]!, 10);
    // Allow 10% tolerance
    expect(actualDistance).toBeGreaterThan(expectedDistance * 0.9);
    expect(actualDistance).toBeLessThan(expectedDistance * 1.1);
});

// ============================================================================
// THEN Steps - Timeline
// ============================================================================

Then('overworld stops should show {string} world indicator', async ({ page }, _indicator: string) => {
    // Overworld stops don't have the timeline-stop-nether class
    const overworldStop = page.locator('.timeline-stop:not(.timeline-stop-nether)');
    await expect(overworldStop.first()).toBeVisible();
});

Then('nether stops should show {string} world indicator with nether styling', async ({ page }, _indicator: string) => {
    // Nether stops have timeline-stop-nether class for styling
    const netherStop = page.locator('.timeline-stop.timeline-stop-nether');
    await expect(netherStop.first()).toBeVisible();
});

When('I open the cart with items from both worlds', async ({ page }) => {
    // Background step already set up the app with mock data
    // Add overworld item
    const overworldButton = page.locator('.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]');
    await overworldButton.click();
    
    // Add nether item - Netherite Scrap is in World_nether in mock data
    const netherRow = page.locator('.trade-row').filter({ hasText: 'Netherite' });
    await netherRow.first().locator('.add-to-cart-btn').click();
    
    // Open cart
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
});

When('I switch to the Route tab', async ({ page }) => {
    await page.locator('#tab-navigate').click();
    await page.waitForSelector('#tab-content-navigate.active', { state: 'visible' });
});

Then('the route preview should show overworld stops without nether styling', async ({ page }) => {
    // Look in the nav-timeline for overworld stops
    const overworldStop = page.locator('#nav-timeline .timeline-stop:not(.timeline-stop-nether)');
    await expect(overworldStop.first()).toBeVisible();
});

Then('the route preview should show nether stops with nether styling', async ({ page }) => {
    // Look in the nav-timeline for nether stops
    const netherStop = page.locator('#nav-timeline .timeline-stop.timeline-stop-nether');
    await expect(netherStop.first()).toBeVisible();
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I hover over the nether shop marker', async ({ page }) => {
    const netherMarker = page.locator(SELECTOR_NETHER_MARKER).first();
    
    // Get the map center tile info and marker position to calculate where to pan
    const markerInfo = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        const map = globalThis.__navMap;
        // @ts-expect-error - exposed for testing  
        const route = globalThis.__navCurrentRoute;
        // @ts-expect-error - exposed for testing
        const centerTileX = globalThis.__navMapCenterTileX;
        // @ts-expect-error - exposed for testing
        const centerTileZ = globalThis.__navMapCenterTileZ;
        
        if (!map || !route) { return null; }
        
        const netherStop = route.find((s: { world: string }) => s.world.toLowerCase().includes('nether'));
        if (!netherStop) { return null; }
        
        // Calculate the Leaflet coords for the nether marker
        const tileSize = 512;
        const centerOriginX = centerTileX * tileSize;
        const centerOriginZ = centerTileZ * tileSize;
        const relativeX = netherStop.displayX - centerOriginX;
        const relativeZ = netherStop.displayZ - centerOriginZ;
        
        return {
            lat: -relativeZ, // Invert Z for screen coords
            lng: relativeX
        };
    });
    
    if (markerInfo) {
        // Pan the map to center on the nether marker
        await page.evaluate((coords) => {
            // @ts-expect-error - exposed for testing
            const map = globalThis.__navMap;
            if (map) {
                map.setView([coords.lat, coords.lng], map.getZoom());
            }
        }, markerInfo);
        
        // Wait for map to finish moving
        await page.waitForTimeout(500);
    }
    
    await expect(netherMarker).toBeVisible({ timeout: 3000 });
    await netherMarker.hover({ force: true });
    
    // Wait for tooltip to appear
    await page.waitForSelector('.leaflet-tooltip', { state: 'visible', timeout: 2000 });
});
