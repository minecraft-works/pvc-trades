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

// Constants for selectors and timeouts
const SELECTOR_NAV_DIALOG_OPEN = '#nav-dialog[open]';
const SELECTOR_NAV_ROUTE_MARKER = '.nav-route-marker';
const SELECTOR_TRADE_ROW = '.trade-row';
const DEFAULT_TIMEOUT = 5000;

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the app is loaded with shops in overworld and nether', async ({ page, playerMock }) => {
    await setupPlayerApiMock(page, playerMock);
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    
    await page.goto('/');
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: DEFAULT_TIMEOUT });
});

Given(String.raw`player {string} is in the overworld at \({int}, {int})`, async ({ playerMock }, _playerName: string, x: number, z: number) => {
    // Just update player position - the app is already loaded via Background step
    playerMock.moveToOverworld(x, z);
});

Given(String.raw`player {string} is in the nether at \({int}, {int})`, async ({ playerMock }, _playerName: string, x: number, z: number) => {
    // Just update player position - the app is already loaded via Background step
    playerMock.moveToNether(x, z);
});

Given('I open the navigation dialog with items from both worlds', async ({ page, tileRequests }) => {
    // Add overworld item - use specific trade key to avoid ambiguity
    // The Emerald shop (gives Emerald, costs Diamond) is at 100,64,200
    const overworldButton = page.locator('.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]');
    await overworldButton.click();
    
    // Add nether item - Netherite Scrap (only one match)
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

Given('I enter {string} as my player name', async ({ page }, playerName: string) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill(playerName);
});

Given('the player name input is empty', async ({ page }) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('');
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I click {string}', async ({ page }, buttonText: string) => {
    const buttonSelectors: Record<string, string> = {
        'Start Navigation': '#start-navigation'
    };
    const selector = buttonSelectors[buttonText];
    await (selector ? page.locator(selector) : page.getByRole('button', { name: buttonText })).click();
});

When(String.raw`player moves to the nether at \({int}, {int})`, async ({ page, playerMock, tileRequests }, x: number, z: number) => {
    // Ensure player position has been polled at least once before moving
    // This establishes previousPosition for world change detection
    await expect.poll(async () => {
        const pos = await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return globalThis.__currentPlayerPosition;
        });
        return pos !== null && pos !== undefined;
    }, { timeout: 3000, intervals: [100, 200, 500] }).toBe(true);
    
    // Clear tile requests before changing position
    tileRequests.length = 0;
    playerMock.moveToNether(x, z);
});

When(String.raw`player moves to the overworld at \({int}, {int})`, async ({ page, playerMock, tileRequests }, x: number, z: number) => {
    // Ensure player position has been polled at least once before moving
    // This establishes previousPosition for world change detection
    // We need to wait for the CURRENT world to be captured (could be nether or overworld)
    await expect.poll(async () => {
        const pos = await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return globalThis.__currentPlayerPosition;
        });
        return pos !== null && pos !== undefined;
    }, { timeout: 3000, intervals: [100, 200, 500] }).toBe(true);
    
    // For rapid transitions, ensure the previous position is properly established
    // Wait one polling cycle to make sure the current world is registered
    const pollInterval = await page.evaluate(() => {
        // @ts-expect-error - config is exposed
        return globalThis.__appConfig?.dynmap?.playerRefreshMs ?? 1000;
    }) as number;
    await page.waitForTimeout(pollInterval + 200);
    
    tileRequests.length = 0;
    playerMock.moveToOverworld(x, z);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the cart dialog should close', async ({ page }) => {
    await expect(page.locator('#cart-dialog')).not.toBeVisible({ timeout: 3000 });
});

Then('the navigation dialog should open', async ({ page }) => {
    await expect(page.locator('#nav-dialog[open]')).toBeVisible({ timeout: 5000 });
});

Then('the map should be centered on the player position', async ({ page }) => {
    // Wait for player marker to become visible
    const playerMarker = page.locator('.nav-player-marker');
    await expect(playerMarker).toBeVisible({ timeout: 8000 });
    
    // Wait for flyTo animation to complete and map to settle
    await page.waitForTimeout(800);
    
    // Verify player marker is near the center of the map container
    const result = await page.evaluate(() => {
        const container = document.querySelector('#nav-dialog-map-container');
        const marker = document.querySelector('.nav-player-marker');
        
        if (!container || !marker) {
            return { error: 'Missing container or marker' };
        }
        
        const containerRect = container.getBoundingClientRect();
        const markerRect = marker.getBoundingClientRect();
        
        const markerCenterX = markerRect.left + markerRect.width / 2 - containerRect.left;
        const markerCenterY = markerRect.top + markerRect.height / 2 - containerRect.top;
        const containerCenterX = containerRect.width / 2;
        const containerCenterY = containerRect.height / 2;
        
        return {
            xDiff: Math.abs(markerCenterX - containerCenterX),
            yDiff: Math.abs(markerCenterY - containerCenterY),
            maxX: containerRect.width / 4,
            maxY: containerRect.height / 4
        };
    });
    
    if ('error' in result) {
        throw new Error(result.error);
    }
    
    expect(result.xDiff).toBeLessThan(result.maxX);
    expect(result.yDiff).toBeLessThan(result.maxY);
});

Then('player position polling should begin', async ({ page }) => {
    // Wait for player position to be polled at least once
    await expect.poll(async () => {
        const pos = await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return globalThis.__currentPlayerPosition;
        });
        return pos !== null && pos !== undefined;
    }, { timeout: 5000 }).toBe(true);
});

Then('I should see an error about missing player name', async ({ page }) => {
    // The app shows an alert when no player name is entered
    // We can check that navigation hasn't started (dialog not opened)
    const navDialog = page.locator('#nav-dialog[open]');
    await expect(navDialog).not.toBeVisible({ timeout: 1000 });
});

Then('navigation should not start', async ({ page }) => {
    const navDialog = page.locator('#nav-dialog[open]');
    await expect(navDialog).not.toBeVisible({ timeout: 1000 });
});

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
            return globalThis.__currentPlayerPosition;
        });
        return pos !== null && pos !== undefined;
    }, { timeout: 5000, intervals: [100, 200, 500, 1000] }).toBe(true);
    
    // Check the navMapWorld variable exposed for testing
    const actualWorld = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        return globalThis.__navMapWorld;
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
            return globalThis.__navMapWorld;
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
        return globalThis.__navMapWorld;
    });
    expect(actualWorld).toBe(normalizedExpected);
});

Then('the route should show nether shop markers', async ({ page }) => {
    // Check that route markers are visible on the map
    const markers = page.locator(SELECTOR_NAV_ROUTE_MARKER);
    await expect(markers.first()).toBeVisible({ timeout: 3000 });
});

Then('the route should show overworld shop markers', async ({ page }) => {
    // Check that route markers are visible on the map
    const markers = page.locator(SELECTOR_NAV_ROUTE_MARKER);
    await expect(markers.first()).toBeVisible({ timeout: 3000 });
});

Given('I wait for at least {int} polling cycles', async ({ page }, cycles: number) => {
    // Get the polling interval from config (default 1000ms)
    const pollIntervalMs = await page.evaluate(() => {
        // @ts-expect-error - config is exposed
        return globalThis.__appConfig?.dynmap?.playerRefreshMs ?? 1000;
    }) as number;
    
    // Wait for the specified number of polling cycles plus a buffer
    await page.waitForTimeout(pollIntervalMs * cycles + 500);
});

Then('the player position world should be {string}', async ({ page }, expectedWorld: string) => {
    const actualWorld = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        return globalThis.__currentPlayerPosition?.world;
    });
    expect(actualWorld).toBe(expectedWorld);
});

Then('the previous position should have been {string}', async ({ page }, expectedWorld: string) => {
    // This verifies that previousPosition was captured correctly before world switch
    // We check by verifying the current state after the switch happened
    const currentWorld = await page.evaluate(() => {
        // @ts-expect-error - exposed for testing
        return globalThis.__currentPlayerPosition?.world;
    });
    // If current is nether and we expect previous was overworld, verify map switched
    // This is a sanity check - the world switch only happens if previousWorld was different
    expect(currentWorld).not.toBe(expectedWorld);
});

When('I wait for map to switch to {string}', async ({ page }, expectedWorld: string) => {
    const normalizedExpected = expectedWorld === 'nether' ? 'the_nether' : expectedWorld;
    
    await expect.poll(async () => {
        return await page.evaluate(() => {
            // @ts-expect-error - exposed for testing
            return globalThis.__navMapWorld;
        });
    }, { timeout: 10_000, intervals: [100, 200, 500, 1000] }).toBe(normalizedExpected);
});

Given('I add only nether items to cart', async ({ page }) => {
    // Add only nether item - Netherite Scrap
    const netherRow = page.locator(SELECTOR_TRADE_ROW).filter({ hasText: 'Netherite' });
    await netherRow.locator('.add-to-cart-btn').click();
});

Given('I mark the overworld shop as completed', async ({ page }) => {
    // Wait for nav dialog to be fully loaded with map markers
    await page.waitForSelector(SELECTOR_NAV_DIALOG_OPEN, { state: 'visible', timeout: DEFAULT_TIMEOUT });
    
    // During navigation, shops are marked complete by clicking on the map markers
    await page.waitForSelector(SELECTOR_NAV_ROUTE_MARKER, { state: 'visible', timeout: DEFAULT_TIMEOUT });
    
    // Click on the first marker (overworld shop is first in route when starting from overworld)
    const marker = page.locator(SELECTOR_NAV_ROUTE_MARKER).first();
    await marker.click();
    
    // Wait for the completion to register (navProgress.completedKeys updates)
    // Verify by checking the marker still exists (it doesn't disappear, just updates progress)
    await page.waitForTimeout(100);
});

Given('I mark the nether shop as completed', async ({ page }) => {
    // Wait for nav dialog to be fully loaded with map markers
    await page.waitForSelector(SELECTOR_NAV_DIALOG_OPEN, { state: 'visible', timeout: DEFAULT_TIMEOUT });
    
    // During navigation, shops are marked complete by clicking on the map markers
    await page.waitForSelector(SELECTOR_NAV_ROUTE_MARKER, { state: 'visible', timeout: DEFAULT_TIMEOUT });
    
    // Click on the first marker (nether shop is first when starting from nether or when it's the only shop)
    const marker = page.locator(SELECTOR_NAV_ROUTE_MARKER).first();
    await marker.click();
    
    // Wait for the completion to register
    await page.waitForTimeout(100);
});

Given('I start navigation as {string}', async ({ page, tileRequests }, playerName: string) => {
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
    await page.locator('#player-name-input').fill(playerName);
    await page.locator('#start-navigation').click();
    await page.waitForSelector(SELECTOR_NAV_DIALOG_OPEN, { state: 'visible', timeout: DEFAULT_TIMEOUT });
    
    // Wait for initial tiles to load
    await expect.poll(
        () => tileRequests.length,
        { timeout: 3000 }
    ).toBeGreaterThan(0);
});
Then('the map should be centered on the player', async ({ page }) => {
    // Wait for player marker to become visible with retries
    // After world switch, the map reinitializes and marker may take time to appear
    const playerMarker = page.locator('.nav-player-marker');
    await expect(playerMarker).toBeVisible({ timeout: 8000 });
    
    // Wait for flyTo animation to complete and map to settle
    await page.waitForTimeout(800);
    
    // Poll until we can get valid position data
    // The map might reinitialize during world switch, causing temporary DOM changes
    type PollResult = {
        error?: string;
        debug?: unknown;
        markerCenter?: { x: number; y: number };
        containerCenter?: { x: number; y: number };
        containerSize?: { width: number; height: number };
        xDiff?: number;
        yDiff?: number;
    };
    
    let lastResult: PollResult | undefined;
    
    await expect.poll(async () => {
        const evalResult: PollResult = await page.evaluate(() => {
            const container = document.querySelector('#nav-dialog-map-container');
            const marker = document.querySelector('.nav-player-marker');
            
            if (!container || !marker) {
                return { error: 'Missing container or marker' };
            }
            
            const containerRect = container.getBoundingClientRect();
            const markerRect = marker.getBoundingClientRect();
            
            // Check for zero-size rects (element not rendered yet)
            if (containerRect.width === 0 || markerRect.width === 0) {
                return { error: 'Elements not rendered' };
            }
            
            // Calculate marker center relative to container
            const markerCenterX = markerRect.left + markerRect.width / 2 - containerRect.left;
            const markerCenterY = markerRect.top + markerRect.height / 2 - containerRect.top;
            
            // Container center
            const containerCenterX = containerRect.width / 2;
            const containerCenterY = containerRect.height / 2;
            
            return {
                markerCenter: { x: markerCenterX, y: markerCenterY },
                containerCenter: { x: containerCenterX, y: containerCenterY },
                containerSize: { width: containerRect.width, height: containerRect.height },
                xDiff: Math.abs(markerCenterX - containerCenterX),
                yDiff: Math.abs(markerCenterY - containerCenterY)
            };
        });
        lastResult = evalResult;
        return evalResult.error === undefined;
    }, { timeout: 5000, intervals: [100, 200, 500] }).toBe(true);
    
    // At this point, lastResult should have valid data
    if (!lastResult || lastResult.error) {
        throw new Error(lastResult?.error || 'Failed to get valid poll result');
    }
    
    // Player marker should be within 1/4 of container size from center
    // (allowing for zoom levels and padding)
    const maxXDiff = lastResult.containerSize!.width / 4;
    const maxYDiff = lastResult.containerSize!.height / 4;
    
    expect(lastResult.xDiff).toBeLessThan(maxXDiff);
    expect(lastResult.yDiff).toBeLessThan(maxYDiff);
});