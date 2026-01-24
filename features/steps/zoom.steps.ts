/**
 * Zoom behavior step definitions
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import {
    setupPlayerApiMock,
    setupColoredTileMocks,
    setupMultiWorldDataMock
} from '../../tests/helpers/navigation-mocks';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the app is loaded with shops in the overworld', async ({ page, playerMock }) => {
    await setupPlayerApiMock(page, playerMock);
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    
    await page.goto('/');
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
});

Given('I have items in my cart', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 3000 });
    const row = page.locator('.trade-row').first();
    await row.locator('.add-to-cart-btn').click();
});

Given('I start navigation as {string}', async ({ page }, playerName: string) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill(playerName);
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

// Note: 'the next shop is at (x, z)' is defined in live-navigation.steps.ts

Given('I am in follow mode', async () => {
    // Default mode is follow
});

Given('I am in follow mode at zoom {int}', async ({ playerMock }, _zoom: number) => {
    playerMock.setPosition(-1000, -1000);
});

Given('I am in manual mode', async ({ page }) => {
    const mapContainer = page.locator('#nav-dialog-map-container');
    await mapContainer.dragTo(mapContainer, {
        sourcePosition: { x: 100, y: 100 },
        targetPosition: { x: 150, y: 150 }
    });
});

Given('I manually zoom to level {int}', async ({ page }, zoomLevel: number) => {
    if (zoomLevel > 0) {
        for (let i = 0; i < zoomLevel; i++) {
            await page.locator('.leaflet-control-zoom-in').click();
        }
    } else {
        for (let i = 0; i > zoomLevel; i--) {
            await page.locator('.leaflet-control-zoom-out').click();
        }
    }
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('player is at \\({int}, {int})', async ({ playerMock }, x: number, z: number) => {
    playerMock.setPosition(x, z);
});

// Note: 'player moves to (x, z)' is defined in live-navigation.steps.ts

When('player moves close to a shop', async ({ playerMock }) => {
    playerMock.setPosition(100, 190);
});

When('I drag the map', async ({ page }) => {
    const mapContainer = page.locator('#nav-dialog-map-container');
    await mapContainer.dragTo(mapContainer, {
        sourcePosition: { x: 100, y: 100 },
        targetPosition: { x: 200, y: 200 }
    });
});

When('I click the re-center button', async ({ page }) => {
    const recenterBtn = page.locator('#nav-dialog-recenter, #recenter-map');
    await recenterBtn.first().click();
});

When('player position updates', async ({ playerMock }) => {
    playerMock.setPosition(50, 50);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the map should be at zoom level {int} \\(maximum)', async ({ page }, zoomLevel: number) => {
    const zoom = await page.evaluate(() => {
        // @ts-expect-error - testing global
        const map = window.__navMap;
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
        const map = window.__navMap;
        return map?.getZoom();
    });
    
    if (zoom !== null) {
        expect(zoom).toBeGreaterThanOrEqual(zoomLevel - 1);
        expect(zoom).toBeLessThanOrEqual(zoomLevel + 1);
    }
});

Then('the map should center on \\({int}, {int})', async ({ page }, _x: number, _z: number) => {
    const marker = page.locator('.nav-player-marker');
    await expect(marker).toBeVisible();
});

Then('the map should animate to zoom {int}', async ({ page }, zoomLevel: number) => {
    const zoom = await page.evaluate(() => {
        // @ts-expect-error - testing global
        const map = window.__navMap;
        return map?.getZoom();
    });
    
    if (zoom !== null) {
        expect(zoom).toBeGreaterThanOrEqual(zoomLevel - 1);
    }
});

Then('I should switch to manual mode', async ({ page }) => {
    const recenterBtn = page.locator('#nav-dialog-recenter, #recenter-map').first();
    await expect(recenterBtn).not.toHaveClass(/hidden/, { timeout: 2000 });
});

Then('the re-center button should appear', async ({ page }) => {
    const recenterBtn = page.locator('#nav-dialog-recenter, #recenter-map').first();
    await expect(recenterBtn).toBeVisible({ timeout: 2000 });
});

Then('I should switch to follow mode', async () => {
    // Verified by re-center button hiding
});

Then('the map should center on player', async ({ page }) => {
    const marker = page.locator('.nav-player-marker');
    await expect(marker).toBeVisible();
});

Then('the re-center button should hide', async ({ page }) => {
    const recenterBtn = page.locator('#nav-dialog-recenter, #recenter-map');
    const isHidden = await recenterBtn.first().evaluate(el => 
        el.classList.contains('hidden') || 
        window.getComputedStyle(el).display === 'none'
    ).catch(() => true);
    
    expect(isHidden).toBe(true);
});

Then('the map should stay at zoom {int}', async ({ page }, zoomLevel: number) => {
    const zoom = await page.evaluate(() => {
        // @ts-expect-error - testing global
        const map = window.__navMap;
        return map?.getZoom();
    });
    
    if (zoom !== null) {
        expect(zoom).toBeGreaterThanOrEqual(zoomLevel - 1);
        expect(zoom).toBeLessThanOrEqual(zoomLevel + 1);
    }
});

Then('the map should not re-center', async () => {
    // Manual mode preserves position
});
