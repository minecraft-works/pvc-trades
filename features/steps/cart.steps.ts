/**
 * Cart management step definitions
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';

// Constants for selectors and text
const EMERALD_TEXT = 'Emerald';
const DIAMOND_TEXT = 'Diamond';
const OPEN_CART_SELECTOR = '#open-cart';
const CLOSE_CART_SELECTOR = '#close-cart';
const CART_DIALOG_SELECTOR = '#cart-dialog';
const ADD_TO_CART_BTN_SELECTOR = '.add-to-cart-btn';
const EMERALD_DIAMOND_TRADE_SELECTOR = '.add-to-cart-btn[data-trade-key*="Emerald,Diamond"]';
const QTY_BTN_SELECTOR = '.cart-item .qty-btn';
const TRADE_ROW_SELECTOR = '.trade-row';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('I add a trade requiring {int} emeralds to the cart', async ({ page }, _amount: number) => {
    const row = page.locator(TRADE_ROW_SELECTOR).filter({ hasText: EMERALD_TEXT }).first();
    await row.locator(ADD_TO_CART_BTN_SELECTOR).click();
});

Given('I add another trade requiring {int} emeralds to the cart', async ({ page }, _amount: number) => {
    const rows = page.locator(TRADE_ROW_SELECTOR).filter({ hasText: EMERALD_TEXT });
    const count = await rows.count();
    await (count > 1 ? rows.nth(1).locator(ADD_TO_CART_BTN_SELECTOR).click() : rows.first().locator(ADD_TO_CART_BTN_SELECTOR).click());
});

Given('I add a trade giving {int} diamonds to the cart', async ({ page }, _amount: number) => {
    const row = page.locator(TRADE_ROW_SELECTOR).filter({ hasText: DIAMOND_TEXT }).first();
    await row.locator(ADD_TO_CART_BTN_SELECTOR).click();
});

Given('I add another trade giving {int} diamonds to the cart', async ({ page }, _amount: number) => {
    const rows = page.locator(TRADE_ROW_SELECTOR).filter({ hasText: DIAMOND_TEXT });
    const count = await rows.count();
    await (count > 1 ? rows.nth(1).locator(ADD_TO_CART_BTN_SELECTOR).click() : rows.first().locator(ADD_TO_CART_BTN_SELECTOR).click());
});

Given('I add a trade requiring {int} emeralds and giving {int} diamond', async ({ page }, _costAmount: number, _resultAmount: number) => {
    const row = page.locator(TRADE_ROW_SELECTOR).filter({ hasText: EMERALD_TEXT }).filter({ hasText: DIAMOND_TEXT }).first();
    await row.locator(ADD_TO_CART_BTN_SELECTOR).click();
});

Given('I add a trade to the cart', async ({ page }) => {
    // Find the specific trade that gives Emerald and costs Diamond (Overworld Shop at 100,64,200)
    // data-trade-key format: x,y,z,world,resultItem,costItem
    const addButton = page.locator(EMERALD_DIAMOND_TRADE_SELECTOR);
    await addButton.click();
});

Given('I have items in the cart', async ({ page }) => {
    const rows = page.locator(TRADE_ROW_SELECTOR);
    const count = await rows.count();
    
    for (let index = 0; index < Math.min(2, count); index++) {
        await rows.nth(index).locator(ADD_TO_CART_BTN_SELECTOR).click();
    }
});

Given('some items are marked as completed', async ({ page }) => {
    await page.locator(OPEN_CART_SELECTOR).click();
    await page.waitForSelector(CART_DIALOG_SELECTOR, { state: 'visible' });
    await page.locator('#tab-navigate').click();
    
    const dot = page.locator('.timeline-dot').first();
    await dot.click();
    
    await page.locator(CLOSE_CART_SELECTOR).click();
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I open the cart dialog', async ({ page }) => {
    await page.locator(OPEN_CART_SELECTOR).click();
    await page.waitForSelector(CART_DIALOG_SELECTOR, { state: 'visible' });
});

When('I increase the quantity to {int}', async ({ page }, quantity: number) => {
    await page.locator(OPEN_CART_SELECTOR).click();
    await page.waitForSelector(CART_DIALOG_SELECTOR, { state: 'visible' });
    
    const plusButton = page.locator(QTY_BTN_SELECTOR).filter({ hasText: '+' }).first();
    
    for (let index = 1; index < quantity; index++) {
        await plusButton.click();
    }
    
    await page.locator(CLOSE_CART_SELECTOR).click();
    await page.waitForSelector(CART_DIALOG_SELECTOR, { state: 'hidden' });
});

When('I click the add button for a trade', async ({ page }) => {
    // Use the same specific trade that gives Emerald and costs Diamond
    const addButton = page.locator(EMERALD_DIAMOND_TRADE_SELECTOR);
    await addButton.click();
});

When('I remove the trade from the cart', async ({ page }) => {
    await page.locator(OPEN_CART_SELECTOR).click();
    await page.waitForSelector(CART_DIALOG_SELECTOR, { state: 'visible' });
    
    const removeButton = page.locator(QTY_BTN_SELECTOR).filter({ hasText: '−' }).first();
    await removeButton.click();
    
    await page.locator(CLOSE_CART_SELECTOR).click();
});

When('I decrease the quantity to zero', async ({ page }) => {
    const minusButton = page.locator(QTY_BTN_SELECTOR).filter({ hasText: '−' }).first();
    await minusButton.click();
});

When('I close the cart dialog', async ({ page }) => {
    await page.locator(CLOSE_CART_SELECTOR).click();
    await page.waitForSelector(CART_DIALOG_SELECTOR, { state: 'hidden' });
});

When('I click clear cart', async ({ page }) => {
    await page.locator(OPEN_CART_SELECTOR).click();
    await page.waitForSelector(CART_DIALOG_SELECTOR, { state: 'visible' });
    await page.locator('#tab-cart').click();
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
    const button = page.locator(EMERALD_DIAMOND_TRADE_SELECTOR);
    
    await (style === 'in-cart' ? expect(button).toHaveClass(/in-cart/) : expect(button).not.toHaveClass(/in-cart/));
});

Then('the button icon should change to a checkmark', async ({ page }) => {
    // Check the same specific button that was clicked (Emerald,Diamond trade)
    const button = page.locator(EMERALD_DIAMOND_TRADE_SELECTOR);
    await expect(button).toHaveClass(/in-cart/);
});

Then('the add button should show default styling', async ({ page }) => {
    // Check the same specific button (Emerald,Diamond trade)
    const button = page.locator(EMERALD_DIAMOND_TRADE_SELECTOR);
    await expect(button).not.toHaveClass(/in-cart/);
});

Then('the cart badge should be hidden', async ({ page }) => {
    const badge = page.locator('#cart-badge');
    await expect(badge).toHaveClass(/hidden/);
});

Then('reopening the cart should show empty message', async ({ page }) => {
    await page.locator(OPEN_CART_SELECTOR).click();
    await page.waitForSelector(CART_DIALOG_SELECTOR, { state: 'visible' });
    
    const emptyMessage = page.locator('.cart-empty');
    await expect(emptyMessage).toBeVisible();
});

Then('all items should be removed', async ({ page }) => {
    const badge = page.locator('#cart-badge');
    await expect(badge).toHaveClass(/hidden/, { timeout: 2000 });
    
    const cartDialog = page.locator(CART_DIALOG_SELECTOR);
    if (!await cartDialog.isVisible()) {
        await page.locator(OPEN_CART_SELECTOR).click();
        await page.waitForSelector(CART_DIALOG_SELECTOR, { state: 'visible' });
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

Then('the cart dialog should be closed', async ({ page }) => {
    const cartDialog = page.locator(CART_DIALOG_SELECTOR);
    await expect(cartDialog).not.toBeVisible();
});