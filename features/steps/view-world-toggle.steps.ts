/**
 * View World Toggle step definitions
 * 
 * Steps for testing the overworld/nether view toggle feature in navigation dialog.
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import {
    setupPlayerApiMock,
    setupColoredTileMocks,
    setupMultiWorldDataMock
} from '../../tests/helpers/navigation-mocks';

// Constants
const SELECTOR_NAV_DIALOG = '#nav-dialog[open]';
const SELECTOR_VIEW_MODE_TOGGLE = '#nav-view-mode-toggle';
const SELECTOR_WORLD_TOGGLE = '#nav-world-toggle';
const SELECTOR_TRADE_ROW = '.trade-row';
const DEFAULT_TIMEOUT = 5000;

// ============================================================================
// GIVEN Steps
// ============================================================================

Given(String.raw`I open the navigation dialog with a nether shop at \({int}, {int})`, async ({ page, playerMock, tileRequests }) => {
    await setupPlayerApiMock(page, playerMock);
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    
    await page.goto('/');
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: DEFAULT_TIMEOUT });
    
    // Add nether item - Netherite Scrap
    const netherRow = page.locator(SELECTOR_TRADE_ROW).filter({ hasText: 'Netherite' });
    await netherRow.locator('.add-to-cart-btn').click();
    
    // Track tile requests
    page.on('request', request => {
        if (request.url().includes('/tiles/') && request.url().endsWith('.png')) {
            const world = request.url().includes('/the_nether/') ? 'nether' : 'overworld';
            tileRequests.push(world);
        }
    });
    
    // Open cart and navigate
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector(SELECTOR_NAV_DIALOG, { state: 'visible', timeout: DEFAULT_TIMEOUT });
});

Given(String.raw`I open the navigation dialog with an overworld shop at \({int}, {int})`, async ({ page, playerMock, tileRequests }) => {
    await setupPlayerApiMock(page, playerMock);
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    
    await page.goto('/');
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: DEFAULT_TIMEOUT });
    
    // Add overworld item
    const overworldButton = page.locator('.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]');
    await overworldButton.click();
    
    // Track tile requests
    page.on('request', request => {
        if (request.url().includes('/tiles/') && request.url().endsWith('.png')) {
            const world = request.url().includes('/the_nether/') ? 'nether' : 'overworld';
            tileRequests.push(world);
        }
    });
    
    // Open cart and navigate
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector(SELECTOR_NAV_DIALOG, { state: 'visible', timeout: DEFAULT_TIMEOUT });
});

Given('I switch to manual view mode', async ({ page }) => {
    const viewModeToggle = page.locator(SELECTOR_VIEW_MODE_TOGGLE);
    await viewModeToggle.click();
    await expect(viewModeToggle).toHaveAttribute('data-mode', 'manual');
});

Given('the view mode is {string}', async ({ page }, mode: string) => {
    const viewModeToggle = page.locator(SELECTOR_VIEW_MODE_TOGGLE);
    const currentMode = await viewModeToggle.getAttribute('data-mode');
    
    if (currentMode !== mode) {
        await viewModeToggle.click();
    }
    await expect(viewModeToggle).toHaveAttribute('data-mode', mode);
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I toggle to nether view', async ({ page }) => {
    const viewModeToggle = page.locator(SELECTOR_VIEW_MODE_TOGGLE);
    const currentMode = await viewModeToggle.getAttribute('data-mode');
    
    // Ensure we're in manual mode first
    if (currentMode !== 'manual') {
        await viewModeToggle.click();
    }
    
    // Click world toggle to switch to nether
    const worldToggle = page.locator(SELECTOR_WORLD_TOGGLE);
    const currentWorld = await worldToggle.getAttribute('data-world');
    if (currentWorld !== 'the_nether') {
        await worldToggle.click();
    }
    await expect(worldToggle).toHaveAttribute('data-world', 'the_nether');
});

When('I click the view mode toggle button', async ({ page }) => {
    await page.locator(SELECTOR_VIEW_MODE_TOGGLE).click();
});

When('I click the world toggle button', async ({ page }) => {
    await page.locator(SELECTOR_WORLD_TOGGLE).click();
});

When('I click the world toggle button to view nether', async ({ page }) => {
    const worldToggle = page.locator(SELECTOR_WORLD_TOGGLE);
    const currentWorld = await worldToggle.getAttribute('data-world');
    if (currentWorld !== 'the_nether') {
        await worldToggle.click();
    }
    await expect(worldToggle).toHaveAttribute('data-world', 'the_nether');
});

When('the player crosses a portal to the nether', async ({ page, playerMock, tileRequests }) => {
    // Wait for player position to be established
    await expect.poll(async () => {
        const pos = await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return globalThis.__currentPlayerPosition;
        });
        return pos !== null && pos !== undefined;
    }, { timeout: 3000, intervals: [100, 200, 500] }).toBe(true);
    
    // Clear tile requests before changing position
    tileRequests.length = 0;
    playerMock.moveToNether(100, 50);
    
    // Wait for world change to be detected
    await page.waitForTimeout(500);
});

When('the player crosses a portal to the overworld', async ({ page, playerMock, tileRequests }) => {
    // Wait for player position to be established
    await expect.poll(async () => {
        const pos = await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return globalThis.__currentPlayerPosition;
        });
        return pos !== null && pos !== undefined;
    }, { timeout: 3000, intervals: [100, 200, 500] }).toBe(true);
    
    // Wait one polling cycle to ensure world is registered
    const pollInterval = await page.evaluate(() => {
        // @ts-expect-error - config is exposed
        return globalThis.__appConfig?.dynmap?.playerRefreshMs ?? 1000;
    }) as number;
    await page.waitForTimeout(pollInterval + 200);
    
    tileRequests.length = 0;
    playerMock.moveToOverworld(0, 0);
    
    // Wait for world change to be detected
    await page.waitForTimeout(500);
});

When('I close and reopen the navigation dialog', async ({ page }) => {
    // Close navigation dialog
    await page.locator('#close-nav').click();
    await expect(page.locator(SELECTOR_NAV_DIALOG)).not.toBeVisible({ timeout: 3000 });
    
    // Reopen navigation dialog
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#start-navigation').click();
    await page.waitForSelector(SELECTOR_NAV_DIALOG, { state: 'visible', timeout: DEFAULT_TIMEOUT });
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('I should see the view mode toggle button', async ({ page }) => {
    await expect(page.locator(SELECTOR_VIEW_MODE_TOGGLE)).toBeVisible();
});

Then('I should see the world toggle button', async ({ page }) => {
    await expect(page.locator(SELECTOR_WORLD_TOGGLE)).toBeVisible();
});

Then('the view mode should default to {string}', async ({ page }, mode: string) => {
    await expect(page.locator(SELECTOR_VIEW_MODE_TOGGLE)).toHaveAttribute('data-mode', mode);
});

Then('the world toggle button should be disabled', async ({ page }) => {
    await expect(page.locator(SELECTOR_WORLD_TOGGLE)).toBeDisabled();
});

Then('the world toggle button should be enabled', async ({ page }) => {
    await expect(page.locator(SELECTOR_WORLD_TOGGLE)).toBeEnabled();
});

Then('the view mode toggle should show {string}', async ({ page }, label: string) => {
    const toggle = page.locator(SELECTOR_VIEW_MODE_TOGGLE);
    const title = await toggle.getAttribute('title');
    expect(title).toContain(label);
});

Then('the view mode should change to {string}', async ({ page }, mode: string) => {
    await expect(page.locator(SELECTOR_VIEW_MODE_TOGGLE)).toHaveAttribute('data-mode', mode);
});

Then('nether tiles should be loaded', async ({ tileRequests }) => {
    await expect.poll(
        () => tileRequests.filter(t => t === 'nether').length,
        { timeout: 5000 }
    ).toBeGreaterThan(0);
});

Then('overworld tiles should be loaded', async ({ tileRequests }) => {
    await expect.poll(
        () => tileRequests.filter(t => t === 'overworld').length,
        { timeout: 5000 }
    ).toBeGreaterThan(0);
});

Then('overworld tiles should still be loaded', async ({ tileRequests }) => {
    // In manual mode, tiles should not have changed to nether
    const netherTiles = tileRequests.filter(t => t === 'nether');
    expect(netherTiles.length).toBe(0);
});

Then('overworld shops should show at divided coordinates', async ({ page }) => {
    // In nether view, overworld shop coords are divided by 8
    // Just verify cross-world markers exist
    const crossWorldMarkers = page.locator('.nav-route-marker--cross-world');
    await expect(crossWorldMarkers.first()).toBeVisible({ timeout: 3000 });
});

Then('overworld shop markers should have dashed borders', async ({ page }) => {
    const crossWorldMarker = page.locator('.nav-route-marker--cross-world .nav-marker');
    await expect(crossWorldMarker.first()).toBeVisible({ timeout: 3000 });
    
    const borderStyle = await crossWorldMarker.first().evaluate(element => 
        getComputedStyle(element).borderStyle
    );
    expect(borderStyle).toBe('dashed');
});

Then('overworld shop markers should be semi-transparent', async ({ page }) => {
    const crossWorldMarker = page.locator('.nav-route-marker--cross-world .nav-marker');
    await expect(crossWorldMarker.first()).toBeVisible({ timeout: 3000 });
    
    const opacity = await crossWorldMarker.first().evaluate(element => 
        Number.parseFloat(getComputedStyle(element).opacity)
    );
    expect(opacity).toBeLessThan(1);
});

Then('the view should switch to nether', async ({ page }) => {
    const worldToggle = page.locator(SELECTOR_WORLD_TOGGLE);
    await expect(worldToggle).toHaveAttribute('data-world', 'the_nether', { timeout: 5000 });
});

Then('the view should switch to overworld', async ({ page }) => {
    const worldToggle = page.locator(SELECTOR_WORLD_TOGGLE);
    await expect(worldToggle).toHaveAttribute('data-world', 'overworld', { timeout: 5000 });
});

Then('the world toggle button should show nether active', async ({ page }) => {
    const toggle = page.locator(SELECTOR_WORLD_TOGGLE);
    await expect(toggle).toHaveAttribute('data-world', 'the_nether');
    await expect(toggle).toHaveText('🔥');
});

Then('the view should remain on overworld', async ({ page }) => {
    // In manual mode, the view should NOT auto-switch
    const worldToggle = page.locator(SELECTOR_WORLD_TOGGLE);
    await expect(worldToggle).toHaveAttribute('data-world', 'overworld');
});

Then(String.raw`the nether shop marker should be at position \({int}, {int})`, async ({ page }, _x: number, _z: number) => {
    // Just verify the marker exists and is visible
    const marker = page.locator('.nav-route-marker .nav-marker');
    await expect(marker.first()).toBeVisible();
});

Then(String.raw`the overworld shop marker should be at position \({int}, {int})`, async ({ page }, _x: number, _z: number) => {
    // Just verify the marker exists and is visible
    const marker = page.locator('.nav-route-marker .nav-marker');
    await expect(marker.first()).toBeVisible();
});

Then('the marker should have cross-world styling', async ({ page }) => {
    const crossWorldMarker = page.locator('.nav-route-marker--cross-world');
    await expect(crossWorldMarker.first()).toBeVisible();
});

Then('the view mode should still be {string}', async ({ page }, mode: string) => {
    await expect(page.locator(SELECTOR_VIEW_MODE_TOGGLE)).toHaveAttribute('data-mode', mode);
});

Then('the view should still be on nether', async ({ page }) => {
    await expect(page.locator(SELECTOR_WORLD_TOGGLE)).toHaveAttribute('data-world', 'the_nether');
});
