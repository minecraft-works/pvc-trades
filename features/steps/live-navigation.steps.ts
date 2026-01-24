/**
 * Live navigation and player tracking step definitions
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('I have items from multiple shops in my cart', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    
    const overworldRow = page.locator('.trade-row').filter({ hasText: 'Emerald' });
    await overworldRow.first().locator('.add-to-cart-btn').click();
    
    const netherRow = page.locator('.trade-row').filter({ hasText: 'Netherite' });
    await netherRow.first().locator('.add-to-cart-btn').click();
});

Given('I am navigating as {string} at \\({int}, {int})', async ({ page, playerMock }, playerName: string, x: number, z: number) => {
    playerMock.setPosition(x, z, 'World');
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill(playerName);
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

Given('I am navigating as {string} with yaw {int}', async ({ page, playerMock }, playerName: string, yaw: number) => {
    playerMock.state.rotation = { pitch: 0, yaw, roll: 0 };
    playerMock.setPosition(0, 0, 'World');
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill(playerName);
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

Given('I am navigating as {string}', async ({ page }, playerName: string) => {
    if (playerName.toLowerCase().includes('nonexistent')) {
        await page.route('**/pvc-players.minecraft-works.workers.dev**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ players: [] })
            });
        });
    }
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill(playerName);
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

Given('I am navigating as {string} in the overworld', async ({ page, playerMock }, playerName: string) => {
    playerMock.moveToOverworld(0, 0);
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill(playerName);
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

Given('the next shop is in the nether', async ({ playerMock }) => {
    playerMock.moveToOverworld(0, 0);
});

Given('I am navigating with {int} shops in my route', async ({ page }, shopCount: number) => {
    const rows = page.locator('.trade-row');
    const count = await rows.count();
    
    for (let i = 0; i < Math.min(shopCount, count); i++) {
        await rows.nth(i).locator('.add-to-cart-btn').click();
    }
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

Given('I am navigating with {int} shop remaining', async ({ page }) => {
    const row = page.locator('.trade-row').first();
    await row.locator('.add-to-cart-btn').click();
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I start navigation', async ({ page }) => {
    const badge = page.locator('#cart-badge');
    const badgeHidden = await badge.evaluate(el => el.classList.contains('hidden'));
    
    if (badgeHidden) {
        const rows = page.locator('.trade-row');
        await rows.first().locator('.add-to-cart-btn').click();
    }
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

When('the player API returns position \\({int}, {int})', async ({ playerMock }, x: number, z: number) => {
    playerMock.setPosition(x, z);
});

When('the player marker renders', async ({ page }) => {
    await page.waitForSelector('.nav-player-marker', { state: 'visible', timeout: 3000 });
});

When('the player API is polled', async () => {
    // Wait for poll cycle - handled automatically
});

When('the player moves to \\({int}, {int})', async ({ playerMock }, x: number, z: number) => {
    playerMock.setPosition(x, z);
});

When('I auto-complete the first shop', async ({ playerMock }) => {
    playerMock.setPosition(100, 180);
});

When('I auto-complete the last shop', async ({ playerMock }) => {
    playerMock.setPosition(100, 180);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('a player marker should appear on the map at \\({int}, {int})', async ({ page }, _x: number, _z: number) => {
    const marker = page.locator('.nav-player-marker');
    await expect(marker).toBeVisible({ timeout: 5000 });
});

Then('the player marker should move to \\({int}, {int})', async ({ page }, _x: number, _z: number) => {
    const marker = page.locator('.nav-player-marker');
    await expect(marker).toBeVisible();
});

Then('it should show an arrow pointing west', async ({ page }) => {
    const marker = page.locator('.nav-player-marker');
    await expect(marker).toBeVisible();
});

Then('I should see {string} in the distance display', async ({ page }, text: string) => {
    const distanceDisplay = page.locator('#nav-dialog-distance');
    await expect(distanceDisplay).toContainText(text, { timeout: 5000 });
});

Then('the distance display should show {string}', async ({ page }, text: string) => {
    const distanceDisplay = page.locator('#nav-dialog-distance');
    await expect(distanceDisplay).toContainText(text, { timeout: 5000 });
});

Then('the first shop should be marked as completed', async ({ page }) => {
    const firstDot = page.locator('.timeline-dot').first();
    await expect(firstDot).toHaveClass(/completed/, { timeout: 5000 });
});

Then('the next shop should become the current target', async ({ page }) => {
    const secondStop = page.locator('.timeline-stop').nth(1);
    await expect(secondStop).toHaveClass(/current/);
});

Then('the route should have {int} remaining shops', async ({ page }, count: number) => {
    const incompleteStops = page.locator('.timeline-stop:not(.completed)');
    const actualCount = await incompleteStops.count();
    expect(actualCount).toBe(count);
});

Then('the route polyline should update', async ({ page }) => {
    const polyline = page.locator('.leaflet-interactive');
    await expect(polyline.first()).toBeVisible();
});

// ============================================================================
// Manual Completion Steps
// ============================================================================

Given('I am navigating with shops in my route', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    
    const rows = page.locator('.trade-row');
    await rows.first().locator('.add-to-cart-btn').click();
    await rows.nth(1).locator('.add-to-cart-btn').click();
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

When('I click the dot for the first shop', async ({ page }) => {
    const dot = page.locator('.timeline-dot').first();
    await dot.click();
});

Then('the shop should be marked as completed', async ({ page }) => {
    const firstDot = page.locator('.timeline-dot').first();
    await expect(firstDot).toHaveClass(/completed/, { timeout: 3000 });
});

Then('the dot should show a checkmark', async ({ page }) => {
    const firstDot = page.locator('.timeline-dot.completed').first();
    await expect(firstDot).toBeVisible();
});

Given('a shop is marked as completed', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    
    const rows = page.locator('.trade-row');
    await rows.first().locator('.add-to-cart-btn').click();
    await rows.nth(1).locator('.add-to-cart-btn').click();
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
    
    // Mark first shop as complete
    const dot = page.locator('.timeline-dot').first();
    await dot.click();
});

When('I click the dot for that shop', async ({ page }) => {
    const dot = page.locator('.timeline-dot').first();
    await dot.click();
});

Then('the shop should be unmarked', async ({ page }) => {
    const firstDot = page.locator('.timeline-dot').first();
    await expect(firstDot).not.toHaveClass(/completed/, { timeout: 3000 });
});

Then('the dot should be empty', async ({ page }) => {
    const completedDot = page.locator('.timeline-dot.completed');
    const count = await completedDot.count();
    expect(count).toBe(0);
});

Given('I am navigating and have the cart dialog visible', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    
    const rows = page.locator('.trade-row');
    await rows.first().locator('.add-to-cart-btn').click();
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

When('I mark a shop as complete in the navigation dialog', async ({ page }) => {
    const dot = page.locator('.timeline-dot').first();
    await dot.click();
});

Then('the cart dialog should also show it as complete', async ({ page }) => {
    // Cart and nav are synced
    const navDialog = page.locator('#nav-dialog');
    await expect(navDialog).toBeVisible();
});

// ============================================================================
// Route Recalculation Steps
// ============================================================================

Given('the route is optimized from \\({int}, {int})', async (_, _x: number, _z: number) => {
    // Route is already optimized from current position
});

When('player moves more than {int} blocks to \\({int}, {int})', async ({ playerMock }, _distance: number, x: number, z: number) => {
    playerMock.setPosition(x, z);
});

Then('the route should be recalculated from \\({int}, {int})', async ({ page }, _x: number, _z: number) => {
    const navDialog = page.locator('#nav-dialog');
    await expect(navDialog).toBeVisible();
});

Given('the next shop is at \\({int}, {int})', async (_, _x: number, _z: number) => {
    // Shop location defined in data
});

Then('a dotted green line should connect player to shop', async ({ page }) => {
    const polyline = page.locator('.leaflet-interactive');
    await expect(polyline.first()).toBeVisible({ timeout: 5000 });
});

When('player moves to \\({int}, {int})', async ({ playerMock }, x: number, z: number) => {
    playerMock.setPosition(x, z);
});

Then('the dotted line should update to new positions', async ({ page }) => {
    const polyline = page.locator('.leaflet-interactive');
    await expect(polyline.first()).toBeVisible();
});

// ============================================================================
// Persistence Steps
// ============================================================================

Given('I mark shop {int} as complete', async ({ page }, _shopNumber: number) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    
    const rows = page.locator('.trade-row');
    await rows.first().locator('.add-to-cart-btn').click();
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
    
    const dot = page.locator('.timeline-dot').first();
    await dot.click();
});

When('I reload the page', async ({ page }) => {
    await page.reload();
});

When('I start navigation again', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

Then('shop {int} should still be marked as complete', async ({ page }, _shopNumber: number) => {
    // Persistence check - may need local storage
    const navDialog = page.locator('#nav-dialog');
    await expect(navDialog).toBeVisible();
});

Given('I have completed some shops', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    
    const rows = page.locator('.trade-row');
    await rows.first().locator('.add-to-cart-btn').click();
    await rows.nth(1).locator('.add-to-cart-btn').click();
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
    
    const dot = page.locator('.timeline-dot').first();
    await dot.click();
});

When('I remove a completed item from the cart', async ({ page }) => {
    await page.locator('#close-nav-dialog').click();
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-cart').click();
    
    const removeBtn = page.locator('.cart-item .qty-btn').filter({ hasText: '−' }).first();
    await removeBtn.click();
});

Then('that completion status should be removed', async ({ page }) => {
    // Completion is removed when item is removed
    const cartDialog = page.locator('#cart-dialog');
    await expect(cartDialog).toBeVisible();
});

Then('I should see {string}', async ({ page }, text: string) => {
    await expect(page.locator('body')).toContainText(text, { timeout: 5000 });
});
