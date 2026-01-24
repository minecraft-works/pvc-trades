/**
 * Multi-world navigation step definitions
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

Given('the app is loaded with shops in overworld and nether', async ({ page, playerMock }) => {
    await setupPlayerApiMock(page, playerMock);
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    
    await page.goto('/');
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
});

Given('player {string} is in the overworld at \\({int}, {int})', async ({ page, playerMock }, _playerName: string, x: number, z: number) => {
    playerMock.moveToOverworld(x, z);
    await page.goto('/');
    await page.waitForSelector('.search-container', { state: 'visible' });
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
});

Given('player {string} is in the nether at \\({int}, {int})', async ({ page, playerMock }, _playerName: string, x: number, z: number) => {
    playerMock.moveToNether(x, z);
    await page.goto('/');
    await page.waitForSelector('.search-container', { state: 'visible' });
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
});

Given('I open the navigation dialog with items from both worlds', async ({ page, tileRequests }) => {
    // Add overworld item
    const overworldRow = page.locator('.trade-row').filter({ hasText: 'Emerald' });
    await overworldRow.locator('.add-to-cart-btn').click();
    
    // Add nether item
    const netherRow = page.locator('.trade-row').filter({ hasText: 'Netherite' });
    await netherRow.locator('.add-to-cart-btn').click();
    
    // Track tile requests
    page.on('request', req => {
        if (req.url().includes('/tiles/') && req.url().endsWith('.png')) {
            const world = req.url().includes('/the_nether/') ? 'nether' : 'overworld';
            tileRequests.push(world);
        }
    });
    
    // Open cart and navigate
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
    
    // Wait for initial tiles to load
    await expect.poll(
        () => tileRequests.length,
        { timeout: 3000 }
    ).toBeGreaterThan(0);
});

Given('navigation shows {string} the {string}', async ({ page }, action: string, world: string) => {
    const dialogDistance = page.locator('#nav-dialog-distance');
    await expect(dialogDistance).toBeVisible();
    const text = await dialogDistance.textContent();
    expect(text).toContain(action);
    expect(text).toContain(world);
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('player moves to the nether at \\({int}, {int})', async ({ playerMock, tileRequests }, x: number, z: number) => {
    // Clear tile requests before changing position
    tileRequests.length = 0;
    playerMock.moveToNether(x, z);
});

When('player moves to the overworld at \\({int}, {int})', async ({ playerMock, tileRequests }, x: number, z: number) => {
    tileRequests.length = 0;
    playerMock.moveToOverworld(x, z);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('overworld tiles should be requested first', async ({ tileRequests }) => {
    expect(tileRequests.length).toBeGreaterThan(0);
    expect(tileRequests[0]).toBe('overworld');
});

Then('nether tiles should be requested first', async ({ tileRequests }) => {
    expect(tileRequests.length).toBeGreaterThan(0);
    expect(tileRequests[0]).toBe('nether');
});

Then('nether tiles should be requested', async ({ tileRequests }) => {
    await expect.poll(
        () => tileRequests.filter(t => t === 'nether').length,
        { timeout: 5000, intervals: [100, 200, 500, 1000] }
    ).toBeGreaterThan(0);
});

Then('overworld tiles should be requested', async ({ tileRequests }) => {
    await expect.poll(
        () => tileRequests.filter(t => t === 'overworld').length,
        { timeout: 5000, intervals: [100, 200, 500, 1000] }
    ).toBeGreaterThan(0);
});
