/**
 * Cart management step definitions
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('I add a trade requiring {int} emeralds to the cart', async ({ page }, _amount: number) => {
    const row = page.locator('.trade-row').filter({ hasText: 'Emerald' }).first();
    await row.locator('.add-to-cart-btn').click();
});

Given('I add another trade requiring {int} emeralds to the cart', async ({ page }, _amount: number) => {
    const rows = page.locator('.trade-row').filter({ hasText: 'Emerald' });
    const count = await rows.count();
    if (count > 1) {
        await rows.nth(1).locator('.add-to-cart-btn').click();
    } else {
        await rows.first().locator('.add-to-cart-btn').click();
    }
});

Given('I add a trade giving {int} diamonds to the cart', async ({ page }, _amount: number) => {
    const row = page.locator('.trade-row').filter({ hasText: 'Diamond' }).first();
    await row.locator('.add-to-cart-btn').click();
});

Given('I add another trade giving {int} diamonds to the cart', async ({ page }, _amount: number) => {
    const rows = page.locator('.trade-row').filter({ hasText: 'Diamond' });
    const count = await rows.count();
    if (count > 1) {
        await rows.nth(1).locator('.add-to-cart-btn').click();
    } else {
        await rows.first().locator('.add-to-cart-btn').click();
    }
});

Given('I add a trade requiring {int} emeralds and giving {int} diamond', async ({ page }, _costAmount: number, _resultAmount: number) => {
    const row = page.locator('.trade-row').filter({ hasText: 'Emerald' }).filter({ hasText: 'Diamond' }).first();
    await row.locator('.add-to-cart-btn').click();
});

Given('I add a trade to the cart', async ({ page }) => {
    // Find the specific trade that gives Emerald and costs Diamond (Overworld Shop at 100,64,200)
    // data-trade-key format: x,y,z,world,resultItem,costItem
    const addBtn = page.locator('.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]');
    await addBtn.click();
});

Given('I have items in the cart', async ({ page }) => {
    const rows = page.locator('.trade-row');
    const count = await rows.count();
    
    for (let i = 0; i < Math.min(2, count); i++) {
        await rows.nth(i).locator('.add-to-cart-btn').click();
    }
});

Given('some items are marked as completed', async ({ page }) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#tab-navigate').click();
    
    const dot = page.locator('.timeline-dot').first();
    await dot.click();
    
    await page.locator('#close-cart').click();
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I open the cart dialog', async ({ page }) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
});

When('I increase the quantity to {int}', async ({ page }, quantity: number) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    
    const plusBtn = page.locator('.cart-item .qty-btn').filter({ hasText: '+' }).first();
    
    for (let i = 1; i < quantity; i++) {
        await plusBtn.click();
    }
    
    await page.locator('#close-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'hidden' });
});

When('I click the add button for a trade', async ({ page }) => {
    // Use the same specific trade that gives Emerald and costs Diamond
    const addBtn = page.locator('.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]');
    await addBtn.click();
});

When('I remove the trade from the cart', async ({ page }) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    
    const removeBtn = page.locator('.cart-item .qty-btn').filter({ hasText: '−' }).first();
    await removeBtn.click();
    
    await page.locator('#close-cart').click();
});

When('I decrease the quantity to zero', async ({ page }) => {
    const minusBtn = page.locator('.cart-item .qty-btn').filter({ hasText: '−' }).first();
    await minusBtn.click();
});

When('I close the cart dialog', async ({ page }) => {
    await page.locator('#close-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'hidden' });
});

When('I click clear cart', async ({ page }) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    await page.locator('#clear-cart').click();
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('I should see total costs showing {string}', async ({ page }, expectedText: string) => {
    const costsContainer = page.locator('#cart-costs');
    await expect(costsContainer).toBeVisible();
    await expect(costsContainer).toContainText(expectedText);
});

Then('I should see total gains showing {string}', async ({ page }, expectedText: string) => {
    const gainsContainer = page.locator('#cart-gains');
    await expect(gainsContainer).toBeVisible();
    await expect(gainsContainer).toContainText(expectedText);
});

Then('the button should show {string} styling', async ({ page }, style: string) => {
    // Check the same specific button that was clicked (Emerald,Diamond trade)
    const btn = page.locator('.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]');
    
    if (style === 'in-cart') {
        await expect(btn).toHaveClass(/in-cart/);
    } else {
        await expect(btn).not.toHaveClass(/in-cart/);
    }
});

Then('the button icon should change to a checkmark', async ({ page }) => {
    // Check the same specific button that was clicked (Emerald,Diamond trade)
    const btn = page.locator('.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]');
    await expect(btn).toHaveClass(/in-cart/);
});

Then('the add button should show default styling', async ({ page }) => {
    // Check the same specific button (Emerald,Diamond trade)
    const btn = page.locator('.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]');
    await expect(btn).not.toHaveClass(/in-cart/);
});

Then('the cart badge should be hidden', async ({ page }) => {
    const badge = page.locator('#cart-badge');
    await expect(badge).toHaveClass(/hidden/);
});

Then('reopening the cart should show empty message', async ({ page }) => {
    await page.locator('#open-cart').click();
    await page.waitForSelector('#cart-dialog', { state: 'visible' });
    
    const emptyMessage = page.locator('.cart-empty');
    await expect(emptyMessage).toBeVisible();
});

Then('all items should be removed', async ({ page }) => {
    const badge = page.locator('#cart-badge');
    await expect(badge).toHaveClass(/hidden/, { timeout: 2000 });
    
    const cartDialog = page.locator('#cart-dialog');
    if (!await cartDialog.isVisible()) {
        await page.locator('#open-cart').click();
        await page.waitForSelector('#cart-dialog', { state: 'visible' });
    }
    
    await page.locator('#tab-cart').click();
    
    const emptyMessage = page.locator('#cart-items .cart-empty');
    await expect(emptyMessage).toBeVisible({ timeout: 2000 });
});

Then('navigation progress should be reset', async ({ page }) => {
    await page.locator('#tab-navigate').click();
    
    const emptyMessage = page.locator('#nav-timeline .cart-empty');
    await expect(emptyMessage).toBeVisible();
});
