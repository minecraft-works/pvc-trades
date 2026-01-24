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

Given('player {string} is in the overworld at \\({int}, {int})', async ({ playerMock }, _playerName: string, x: number, z: number) => {
    // Just update player position - the app is already loaded via Background step
    playerMock.moveToOverworld(x, z);
});

Given('player {string} is in the nether at \\({int}, {int})', async ({ playerMock }, _playerName: string, x: number, z: number) => {
    // Just update player position - the app is already loaded via Background step
    playerMock.moveToNether(x, z);
});

Given('I open the navigation dialog with items from both worlds', async ({ page, tileRequests }) => {
    // Add overworld item - use specific trade key to avoid ambiguity
    // The Emerald shop (gives Emerald, costs Diamond) is at 100,64,200
    const overworldBtn = page.locator('.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]');
    await overworldBtn.click();
    
    // Add nether item - Netherite Scrap (only one match)
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

When('player moves to the nether at \\({int}, {int})', async ({ page, playerMock, tileRequests }, x: number, z: number) => {
    // Ensure player position has been polled at least once before moving
    // This establishes previousPosition for world change detection
    await expect.poll(async () => {
        const pos = await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return window.__currentPlayerPosition;
        });
        return pos !== null && pos !== undefined;
    }, { timeout: 3000, intervals: [100, 200, 500] }).toBe(true);
    
    // Clear tile requests before changing position
    tileRequests.length = 0;
    playerMock.moveToNether(x, z);
});

When('player moves to the overworld at \\({int}, {int})', async ({ page, playerMock, tileRequests }, x: number, z: number) => {
    // Ensure player position has been polled at least once before moving
    // This establishes previousPosition for world change detection
    await expect.poll(async () => {
        const pos = await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return window.__currentPlayerPosition;
        });
        return pos !== null && pos !== undefined;
    }, { timeout: 3000, intervals: [100, 200, 500] }).toBe(true);
    
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

Then('the map should be showing {string} world', async ({ page }, expectedWorld: string) => {
    // Normalize world names: "nether" matches "the_nether", "overworld" matches "overworld"
    const normalizedExpected = expectedWorld === 'nether' ? 'the_nether' : expectedWorld;
    
    // Wait for player position to be polled (sets __currentPlayerPosition)
    // This ensures the polling loop has run at least once, establishing previousPosition
    // Note: We just wait for the position to exist, NOT for it to match the map world
    await expect.poll(async () => {
        const pos = await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return window.__currentPlayerPosition;
        });
        return pos !== null && pos !== undefined;
    }, { timeout: 5000, intervals: [100, 200, 500, 1000] }).toBe(true);
    
    // Check the navMapWorld variable exposed for testing
    const actualWorld = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        return window.__navMapWorld;
    });
    expect(actualWorld).toBe(normalizedExpected);
});

Then('no nether tiles should be loaded on the map', async ({ tileRequests }) => {
    // Verify at least some tiles were loaded (catch "nothing loaded" bug)
    expect(tileRequests.length).toBeGreaterThan(0);
    // Check that no nether tiles were requested
    const netherTiles = tileRequests.filter(t => t === 'nether');
    expect(netherTiles.length).toBe(0);
});

Then('no overworld tiles should be loaded on the map', async ({ tileRequests }) => {
    // Verify at least some tiles were loaded (catch "nothing loaded" bug)
    expect(tileRequests.length).toBeGreaterThan(0);
    // Check that no overworld tiles were requested
    const overworldTiles = tileRequests.filter(t => t === 'overworld');
    expect(overworldTiles.length).toBe(0);
});

Then('nether tiles should have been loaded', async ({ tileRequests }) => {
    const netherTiles = tileRequests.filter(t => t === 'nether');
    expect(netherTiles.length).toBeGreaterThan(0);
});

Then('overworld tiles should have been loaded', async ({ tileRequests }) => {
    const overworldTiles = tileRequests.filter(t => t === 'overworld');
    expect(overworldTiles.length).toBeGreaterThan(0);
});

Then('no new overworld tiles should be loaded', async ({ tileRequests }) => {
    // tileRequests is cleared before player moves, so check it's still empty for overworld
    const overworldTiles = tileRequests.filter(t => t === 'overworld');
    expect(overworldTiles.length).toBe(0);
});

Then('no new nether tiles should be loaded', async ({ tileRequests }) => {
    // tileRequests is cleared before player moves, so check it's still empty for nether
    const netherTiles = tileRequests.filter(t => t === 'nether');
    expect(netherTiles.length).toBe(0);
});

Then('the map should switch to {string} world', async ({ page }, expectedWorld: string) => {
    // Normalize world names: "nether" matches "the_nether", "overworld" matches "overworld"
    const normalizedExpected = expectedWorld === 'nether' ? 'the_nether' : expectedWorld;
    
    // Wait for map world to change
    await expect.poll(async () => {
        return await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return window.__navMapWorld;
        });
    }, { timeout: 5000, intervals: [100, 200, 500, 1000] }).toBe(normalizedExpected);
});

Then('the map should stay on {string} world', async ({ page }, expectedWorld: string) => {
    // Normalize world names: "nether" matches "the_nether", "overworld" matches "overworld"
    const normalizedExpected = expectedWorld === 'nether' ? 'the_nether' : expectedWorld;
    
    // Wait a moment to ensure no world switch happens
    await page.waitForTimeout(1000);
    
    const actualWorld = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        return window.__navMapWorld;
    });
    expect(actualWorld).toBe(normalizedExpected);
});

Then('the route should show nether shop markers', async ({ page }) => {
    // Check that route markers are visible on the map
    const markers = page.locator('.nav-route-marker');
    await expect(markers.first()).toBeVisible({ timeout: 3000 });
});

Then('the route should show overworld shop markers', async ({ page }) => {
    // Check that route markers are visible on the map
    const markers = page.locator('.nav-route-marker');
    await expect(markers.first()).toBeVisible({ timeout: 3000 });
});

Given('I add only nether items to cart', async ({ page }) => {
    // Add only nether item - Netherite Scrap
    const netherRow = page.locator('.trade-row').filter({ hasText: 'Netherite' });
    await netherRow.locator('.add-to-cart-btn').click();
});

Given('I start navigation as {string}', async ({ page, tileRequests }, playerName: string) => {
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
    await page.locator('#player-name-input').fill(playerName);
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
    
    // Wait for initial tiles to load
    await expect.poll(
        () => tileRequests.length,
        { timeout: 3000 }
    ).toBeGreaterThan(0);
});
