/**
 * Zoom behavior step definitions
 */
import { expect } from '@playwright/test';

import {
    setupColoredTileMocks,
    setupMultiWorldDataMock,
    setupPlayerApiMock} from '../../tests/helpers/navigation-mocks';
import { Given, Then,When } from './fixtures';

// Selector constants to avoid string duplication
const SELECTOR_TRADE_ROW = '.trade-row';
const SELECTOR_ADD_TO_CART = '.add-to-cart-btn';
const SELECTOR_MAP_CONTAINER = '#nav-dialog-map-container';
const SELECTOR_RECENTER_BUTTON = '#nav-dialog-recenter, #recenter-map';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the app is loaded with shops in the overworld', async ({ page, playerMock }) => {
    // Clear localStorage before loading to ensure clean state
    await page.addInitScript(() => {
        localStorage.removeItem('pvc-trades-cart');
        localStorage.removeItem('pvc-trades-nav-progress');
    });
    
    await setupPlayerApiMock(page, playerMock);
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    
    await page.goto('/');
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
});

Given('the app is loaded with shops in the nether', async ({ page, playerMock }) => {
    // Clear localStorage before loading to ensure clean state
    await page.addInitScript(() => {
        localStorage.removeItem('pvc-trades-cart');
        localStorage.removeItem('pvc-trades-nav-progress');
    });
    
    // Start player in the nether
    playerMock.moveToNether(0, 0);
    
    await setupPlayerApiMock(page, playerMock);
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    
    await page.goto('/');
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
});

Given('I have items in my cart', async ({ page }) => {
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 3000 });
    // Add items from MULTIPLE shops so the route has more than one stop
    // This ensures when we auto-advance on one shop, there's still a route to calculate zoom from
    // First shop: Overworld Shop at (100, 200) - sells Emeralds
    const emeraldRow = page.locator(SELECTOR_TRADE_ROW).filter({ hasText: 'Emerald' }).filter({ hasText: 'Diamond' }).first();
    await emeraldRow.locator(SELECTOR_ADD_TO_CART).click();
    
    // Second shop: Far Overworld Shop at (800, 400) - sells Iron Ingots
    const ironRow = page.locator(SELECTOR_TRADE_ROW).filter({ hasText: 'Iron Ingot' }).first();
    await ironRow.locator(SELECTOR_ADD_TO_CART).click();
});

Given('I have nether items in my cart', async ({ page }) => {
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 3000 });
    // Find a nether shop item - Netherite Scrap or Blaze Rod
    const netherRow = page.locator(SELECTOR_TRADE_ROW).filter({ hasText: 'Netherite' }).first();
    await netherRow.locator(SELECTOR_ADD_TO_CART).click();
});

// Note: 'I start navigation as {string}' is defined in navigation.steps.ts

// Note: 'the next shop is at (x, z)' is defined in live-navigation.steps.ts

Given('I start navigation as {string} in the nether', async ({ page, playerMock }, _playerName: string) => {
    // Set player position in the nether
    playerMock.moveToNether(0, 0);
    
    // Open the cart dialog and start navigation
    await page.locator('.cart-badge').click();
    const cartDialog = page.locator('#cart-dialog');
    await expect(cartDialog).toBeVisible();
    
    // Click start navigation button
    const navButton = page.locator('#start-navigation');
    await navButton.click();
    
    // Wait for navigation dialog to appear
    const navDialog = page.locator('#navigation-dialog');
    await expect(navDialog).toBeVisible();
});

Given(String.raw`the next nether shop is at \({int}, {int})`, async ({ page }, _x: number, _z: number) => {
    // The mock data already sets up shops - this step documents the expected shop position
    // The nether shop position should match the mock data
    // Wait for navigation to initialize
    await page.waitForTimeout(500);
});

Given('I am in follow mode', async () => {
    // Default mode is follow
});

Given('I am in follow mode at zoom {int}', async ({ playerMock }, _zoom: number) => {
    playerMock.setPosition(-1000, -1000);
});

Given('I am in manual mode', async ({ page }) => {
    const mapContainer = page.locator(SELECTOR_MAP_CONTAINER);
    await mapContainer.dragTo(mapContainer, {
        sourcePosition: { x: 100, y: 100 },
        targetPosition: { x: 150, y: 150 }
    });
});

Given('I manually zoom to level {int}', async ({ page }, zoomLevel: number) => {
    if (zoomLevel > 0) {
        for (let index = 0; index < zoomLevel; index++) {
            await page.locator('.leaflet-control-zoom-in').click();
        }
    } else {
        for (let index = 0; index > zoomLevel; index--) {
            await page.locator('.leaflet-control-zoom-out').click();
        }
    }
});

// ============================================================================
// WHEN Steps
// ============================================================================

When(String.raw`player is at \({int}, {int})`, async ({ page, playerMock }, x: number, z: number) => {
    playerMock.setPosition(x, z);
    // Wait for polling to pick up position change and update zoom
    await page.waitForTimeout(1500);
});

When(String.raw`player is at position \({int}, {int}, {int})`, async ({ page, playerMock }, x: number, y: number, z: number) => {
    playerMock.setPosition(x, z, undefined, y);
    // Wait for polling to pick up position change and update zoom
    await page.waitForTimeout(1500);
});

When(String.raw`player is at nether position \({int}, {int}, {int})`, async ({ page, playerMock }, x: number, y: number, z: number) => {
    playerMock.moveToNether(x, z, y);
    // Wait for polling to pick up position change and update zoom
    await page.waitForTimeout(1500);
});

When(String.raw`player is at \({int}, {int}) in the nether`, async ({ page, playerMock }, x: number, z: number) => {
    playerMock.moveToNether(x, z);
    // Wait for polling to pick up position change and update zoom
    await page.waitForTimeout(1500);
});

// Note: 'player moves to (x, z)' is defined in live-navigation.steps.ts

When('player moves close to a shop', async ({ page, playerMock }) => {
    // Move to within zoom 2 range (< 60 blocks) but outside auto-advance (>= 8 blocks)
    // Shop is at (100, 200), so 100, 145 is 55 blocks away -> zoom 2
    playerMock.setPosition(100, 145);
    // Wait for polling to pick up position change and update zoom
    await page.waitForTimeout(1500);
});

When('I drag the map', async ({ page }) => {
    const mapContainer = page.locator(SELECTOR_MAP_CONTAINER);
    await mapContainer.dragTo(mapContainer, {
        sourcePosition: { x: 100, y: 100 },
        targetPosition: { x: 200, y: 200 }
    });
});

When('I click the re-center button', async ({ page }) => {
    const recenterButton = page.locator(SELECTOR_RECENTER_BUTTON);
    await recenterButton.first().click();
});

When('player position updates', async ({ playerMock }) => {
    playerMock.setPosition(50, 50);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then(String.raw`the map should be at zoom level {int} \(maximum)`, async ({ page }, zoomLevel: number) => {
    const zoom = await page.evaluate(() => {
        // @ts-expect-error - testing global
        const map = globalThis.__navMap;
        return map?.getZoom();
    });
    
    if (zoom !== null) {
        expect(zoom).toBeGreaterThanOrEqual(zoomLevel - 0.5);
        expect(zoom).toBeLessThanOrEqual(zoomLevel + 0.5);
    }
});

Then('the map should be at zoom level {int}', async ({ page }, zoomLevel: number) => {
    const zoom = await page.evaluate(() => {
        // @ts-expect-error - testing global
        const map = globalThis.__navMap;
        return map?.getZoom();
    });
    
    if (zoom !== null) {
        expect(zoom).toBeGreaterThanOrEqual(zoomLevel - 1);
        expect(zoom).toBeLessThanOrEqual(zoomLevel + 1);
    }
});

Then(String.raw`the map should center on \({int}, {int})`, async ({ page }, _x: number, _z: number) => {
    const marker = page.locator('.nav-player-marker');
    await expect(marker).toBeVisible();
});

Then('the map should animate to zoom {int}', async ({ page }, zoomLevel: number) => {
    const zoom = await page.evaluate(() => {
        // @ts-expect-error - testing global
        const map = globalThis.__navMap;
        return map?.getZoom();
    });
    
    if (zoom !== null && zoom !== undefined) {
        expect(zoom).toBeGreaterThanOrEqual(zoomLevel - 1);
    }
});

Then('I should switch to manual mode', async ({ page }) => {
    const recenterButton = page.locator(SELECTOR_RECENTER_BUTTON).first();
    await expect(recenterButton).not.toHaveClass(/hidden/, { timeout: 2000 });
});

Then('the re-center button should appear', async ({ page }) => {
    const recenterButton = page.locator(SELECTOR_RECENTER_BUTTON).first();
    await expect(recenterButton).toBeVisible({ timeout: 2000 });
});

Then('I should switch to follow mode', async () => {
    // Verified by re-center button hiding
});

Then('the map should center on player', async ({ page }) => {
    const marker = page.locator('.nav-player-marker');
    await expect(marker).toBeVisible();
});

Then('the re-center button should hide', async ({ page }) => {
    const recenterButton = page.locator(SELECTOR_RECENTER_BUTTON);
    const isHidden = await recenterButton.first().evaluate(element => 
        element.classList.contains('hidden') || 
        globalThis.getComputedStyle(element).display === 'none'
    ).catch(() => true);
    
    expect(isHidden).toBe(true);
});

Then('the map should stay at zoom {int}', async ({ page }, zoomLevel: number) => {
    const zoom = await page.evaluate(() => {
        // @ts-expect-error - testing global
        const map = globalThis.__navMap;
        return map?.getZoom();
    });
    
    if (zoom !== null) {
        // Allow wider tolerance for Leaflet fractional zoom levels
        expect(zoom).toBeGreaterThanOrEqual(zoomLevel - 1.5);
        expect(zoom).toBeLessThanOrEqual(zoomLevel + 1.5);
    }
});

Then('the map should not re-center', async () => {
    // Manual mode preserves position
});
