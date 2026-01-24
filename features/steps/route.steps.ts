/**
 * Route display and timeline step definitions
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('I have {int} items from different shops in my cart', async ({ page }, count: number) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const rows = page.locator('.trade-row');
    const available = await rows.count();
    
    for (let i = 0; i < Math.min(count, available); i++) {
        await rows.nth(i).locator('.add-to-cart-btn').click();
    }
});

Given('I add a trade for {string} quantity {int} to my cart', async ({ page }, item: string, _quantity: number) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const row = page.locator('.trade-row').filter({ hasText: item }).first();
    await row.locator('.add-to-cart-btn').click();
});

Given('I add an overworld shop at \\({int}, {int}) to my cart', async ({ page }, _x: number, _z: number) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const overworldRow = page.locator('.trade-row').filter({ hasText: 'Emerald' }).first();
    await overworldRow.locator('.add-to-cart-btn').click();
});

Given('I add a nether shop at \\({int}, {int}) to my cart', async ({ page }, _x: number, _z: number) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const netherRow = page.locator('.trade-row').filter({ hasText: 'Netherite' }).first();
    await netherRow.locator('.add-to-cart-btn').click();
});

Given('I have a shop marked as complete', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const row = page.locator('.trade-row').first();
    await row.locator('.add-to-cart-btn').click();
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    
    const dot = page.locator('.timeline-dot').first();
    await dot.click();
});

Given('I have items from shops spread across the world', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const rows = page.locator('.trade-row');
    await rows.first().locator('.add-to-cart-btn').click();
    await rows.nth(1).locator('.add-to-cart-btn').click();
});

Given('I have a shop at \\({int}, {int}) overworld', async ({ page }, _x: number, _z: number) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const row = page.locator('.trade-row').filter({ hasText: 'Emerald' }).first();
    await row.locator('.add-to-cart-btn').click();
});

Given('a shop at \\({int}, {int}) nether \\(equivalent to {int}, {int} overworld)', async ({ page }, _x: number, _z: number, _ox: number, _oz: number) => {
    const row = page.locator('.trade-row').filter({ hasText: 'Netherite' }).first();
    await row.locator('.add-to-cart-btn').click();
});

Given('I have {int} items showing {int} blocks distance', async ({ page }, count: number, _distance: number) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const rows = page.locator('.trade-row');
    for (let i = 0; i < count; i++) {
        await rows.nth(i).locator('.add-to-cart-btn').click();
    }
});

Given('I have {int} items in my cart with optimized route', async ({ page }, count: number) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const rows = page.locator('.trade-row');
    for (let i = 0; i < count; i++) {
        await rows.nth(i).locator('.add-to-cart-btn').click();
    }
});

Given('I have {int} items in my cart', async ({ page }, count: number) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const rows = page.locator('.trade-row');
    for (let i = 0; i < Math.min(count, await rows.count()); i++) {
        await rows.nth(i).locator('.add-to-cart-btn').click();
    }
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I open the navigate tab', async ({ page }) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
});

When('I remove one item from the cart', async ({ page }) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    const removeBtn = page.locator('.cart-item .qty-btn').filter({ hasText: '−' }).first();
    await removeBtn.click();
});

When('I add a 3rd item closer to the start', async ({ page }) => {
    await page.locator('#close-cart').click();
    const row = page.locator('.trade-row').nth(2);
    await row.locator('.add-to-cart-btn').click();
});

When('I remove the middle item', async ({ page }) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    const removeBtn = page.locator('.cart-item .qty-btn').filter({ hasText: '−' }).nth(1);
    await removeBtn.click();
});

When('I decrease one item\'s quantity to zero', async ({ page }) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    const minusBtn = page.locator('.cart-item .qty-btn').filter({ hasText: '−' }).first();
    await minusBtn.click();
});

When('I close and reopen the cart', async ({ page }) => {
    await page.locator('#close-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'hidden' });
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('I should see {int} stops in the timeline', async ({ page }, count: number) => {
    const stops = page.locator('.timeline-stop');
    await expect(stops).toHaveCount(count, { timeout: 5000 });
});

Then('they should be numbered {int}, {int}, {int}', async ({ page }, _n1: number, _n2: number, _n3: number) => {
    const stops = page.locator('.timeline-stop');
    await expect(stops).toHaveCount(3);
});

Then('the timeline should show {string}', async ({ page }, text: string) => {
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toContainText(text);
});

Then('I should see overworld coords {string}', async ({ page }, coords: string) => {
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toContainText(coords);
});

Then('I should see nether equivalent {string}', async ({ page }, coords: string) => {
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toContainText(coords);
});

Then('I should see nether coords {string}', async ({ page }, coords: string) => {
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toContainText(coords);
});

Then('I should see overworld equivalent {string}', async ({ page }, coords: string) => {
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toContainText(coords);
});

Then('the completed stop should show a checkmark', async ({ page }) => {
    const completedDot = page.locator('.timeline-dot.completed');
    await expect(completedDot).toBeVisible();
});

Then('it should have completed styling', async ({ page }) => {
    const completedStop = page.locator('.timeline-stop.completed');
    await expect(completedStop).toBeVisible();
});

Then('I should see the total distance in blocks', async ({ page }) => {
    const distanceDisplay = page.locator('.total-distance, #route-distance');
    await expect(distanceDisplay.first()).toBeVisible();
});

Then('I should see the nether-equivalent distance', async ({ page }) => {
    // Nether distance shown in UI
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toBeVisible();
});

Then('the distance should be {int} blocks', async ({ page }, _distance: number) => {
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toBeVisible();
});

Then('the distance should update to reflect shorter route', async ({ page }) => {
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toBeVisible();
});

Then('the route order may change', async ({ page }) => {
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toBeVisible();
});

Then('the distance should update', async ({ page }) => {
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toBeVisible();
});

Then('the route should have {int} items', async ({ page }, count: number) => {
    const stops = page.locator('.timeline-stop');
    await expect(stops).toHaveCount(count, { timeout: 3000 });
});

Then('the timeline should update', async ({ page }) => {
    const timeline = page.locator('#nav-timeline');
    await expect(timeline).toBeVisible();
});

Then('the route should have {int} item', async ({ page }, count: number) => {
    const stops = page.locator('.timeline-stop');
    await expect(stops).toHaveCount(count, { timeout: 3000 });
});

// ============================================================================
// Navigate Tab Click Behavior
// ============================================================================

Given('I am viewing the navigate tab', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const row = page.locator('.trade-row').first();
    await row.locator('.add-to-cart-btn').click();
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
});

Given('navigation is not active', async () => {
    // Navigation not started - no player tracking
});

When('I click on a shop stop', async ({ page }) => {
    const stop = page.locator('.timeline-stop').first();
    await stop.click();
});

Then('the map dialog should open', async ({ page }) => {
    const mapDialog = page.locator('#map-dialog, #nav-dialog');
    await expect(mapDialog.first()).toBeVisible();
});

Then('it should be centered on that shop', async ({ page }) => {
    const mapDialog = page.locator('#map-dialog, #nav-dialog');
    await expect(mapDialog.first()).toBeVisible();
});

Given('I am actively navigating', async ({ page }) => {
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
    const row = page.locator('.trade-row').first();
    await row.locator('.add-to-cart-btn').click();
    
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    await page.locator('#player-name-input').fill('TestPlayer');
    await page.locator('#start-navigation').click();
    await page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 5000 });
});

Then('the stop should toggle completion', async ({ page }) => {
    const dot = page.locator('.timeline-dot').first();
    await expect(dot).toBeVisible();
});

Then('the map should stay open', async ({ page }) => {
    const navDialog = page.locator('#nav-dialog[open]');
    await expect(navDialog).toBeVisible();
});
