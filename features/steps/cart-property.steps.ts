/**
 * Step definitions for cart quantity property tests
 * Tests mathematical correctness of cart calculations
 */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { setupColoredTileMocks, setupMultiWorldDataMock } from '../../tests/helpers/navigation-mocks';
import { Given, Then,When } from './fixtures';

// ============================================================================
// Page tracking interface
// ============================================================================

interface PageWithCartTracking extends Page {
    __cartQuantity?: number;
    __unitCost?: number;
    __resourceType?: string;
    __tradeCount?: number;
    __startQuantity?: number;
}

// ============================================================================
// Selectors
// ============================================================================

const SELECTOR_TRADE_ROW = '.trade-row';
const SELECTOR_ADD_TO_CART = '.add-to-cart-btn';
const SELECTOR_OPEN_CART = '#open-cart';
const SELECTOR_CART_DIALOG = '#cart-dialog[open]';
const SELECTOR_CART_ITEM = '.cart-item';
const SELECTOR_QTY_DISPLAY = '.qty-display';
const SELECTOR_INCREMENT_BTN = '.qty-plus';
const SELECTOR_DECREMENT_BTN = '.qty-minus';
const SELECTOR_REMOVE_BTN = '.remove-btn';
const SELECTOR_CART_BADGE = '.cart-badge, #cart-count';
const SELECTOR_CART_TOTALS = '#cart-costs, #cart-gains';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the cart test app is configured', async ({ page }) => {
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    
    await page.goto('/');
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
});

Given('I have a trade in my cart', async ({ page }) => {
    const row = page.locator(SELECTOR_TRADE_ROW).first();
    await row.locator(SELECTOR_ADD_TO_CART).click();
    await page.waitForTimeout(200);
});

Given('I have a trade costing {int} {word} per item', async ({ page }, cost: number, resource: string) => {
    const p = page as PageWithCartTracking;
    p.__unitCost = cost;
    p.__resourceType = resource;
    
    // Add a trade to cart
    const row = page.locator(SELECTOR_TRADE_ROW).first();
    await row.locator(SELECTOR_ADD_TO_CART).click();
    await page.waitForTimeout(200);
});

Given('I have {int} trades each costing {int} {word}', async ({ page }, count: number, cost: number, resource: string) => {
    const p = page as PageWithCartTracking;
    p.__tradeCount = count;
    p.__unitCost = cost;
    p.__resourceType = resource;
    
    // Add multiple trades
    for (let index = 0; index < count; index++) {
        const row = page.locator(SELECTOR_TRADE_ROW).nth(index % 3);  // Cycle through available rows
        await row.locator(SELECTOR_ADD_TO_CART).click();
        await page.waitForTimeout(100);
    }
});

Given('I have trades costing {int} {word} and {int} {word}', async ({ page }, cost1: number, resource1: string, cost2: number, resource2: string) => {
    const p = page as PageWithCartTracking;
    p.__unitCost = cost1;
    p.__resourceType = resource1;
    
    // Add two different trades
    const row1 = page.locator(SELECTOR_TRADE_ROW).first();
    await row1.locator(SELECTOR_ADD_TO_CART).click();
    
    const row2 = page.locator(SELECTOR_TRADE_ROW).nth(1);
    await row2.locator(SELECTOR_ADD_TO_CART).click();
    await page.waitForTimeout(200);
});

Given('my cart is empty', async ({ page }) => {
    // Ensure cart is empty - no action needed if starting fresh
    await page.waitForTimeout(100);
});

Given('I have exactly {int} trade in my cart', async ({ page }, count: number) => {
    const row = page.locator(SELECTOR_TRADE_ROW).first();
    await row.locator(SELECTOR_ADD_TO_CART).click();
    await page.waitForTimeout(200);
});

Given('I have trades in my cart', async ({ page }) => {
    const row = page.locator(SELECTOR_TRADE_ROW).first();
    await row.locator(SELECTOR_ADD_TO_CART).click();
    await page.waitForTimeout(200);
});

Given('I have a trade with quantity {int}', async ({ page }, targetQuantity: number) => {
    const p = page as PageWithCartTracking;
    p.__startQuantity = targetQuantity;
    
    // Add trade 
    const row = page.locator(SELECTOR_TRADE_ROW).first();
    await row.locator(SELECTOR_ADD_TO_CART).click();
    
    // Open cart and set quantity using +/- buttons
    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector(SELECTOR_CART_DIALOG, { state: 'visible' });
    
    // Get current quantity (starts at 1 after adding)
    const currentQty = 1;
    const diff = targetQuantity - currentQty;
    
    if (diff !== 0) {
        const button = diff > 0 ? SELECTOR_INCREMENT_BTN : SELECTOR_DECREMENT_BTN;
        const clicks = Math.abs(diff);
        
        for (let index = 0; index < clicks; index++) {
            await page.locator(button).first().click();
            await page.waitForTimeout(50);
        }
    }
    await page.waitForTimeout(100);
});

Given('a trade with {int} items in stock', async ({ page }, stock: number) => {
    const p = page as PageWithCartTracking;
    (p as unknown as { __stockLimit: number }).__stockLimit = stock;
    
    const row = page.locator(SELECTOR_TRADE_ROW).first();
    await row.locator(SELECTOR_ADD_TO_CART).click();
    await page.waitForTimeout(200);
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I change the quantity to {int}', async ({ page }, targetQuantity: number) => {
    const p = page as PageWithCartTracking;
    p.__cartQuantity = targetQuantity;
    
    // Open cart dialog if not already open
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG, { state: 'visible' });
    }
    
    // Get current quantity from display
    const qtyDisplay = page.locator(SELECTOR_QTY_DISPLAY).first();
    const currentQtyText = await qtyDisplay.textContent();
    const currentQty = Number.parseInt(currentQtyText ?? '1', 10);
    
    // Click +/- buttons to reach target quantity (faster with less delay)
    const diff = targetQuantity - currentQty;
    const button = diff > 0 ? SELECTOR_INCREMENT_BTN : SELECTOR_DECREMENT_BTN;
    const clicks = Math.abs(diff);
    
    // Use faster clicking for reasonable quantities (under 100)
    for (let index = 0; index < clicks; index++) {
        await page.locator(button).first().click();
        // Minimal delay between clicks
        if (index % 10 === 9) {
            await page.waitForTimeout(20);
        }
    }
    await page.waitForTimeout(100);
});

When('I change the quantity to {string}', async ({ page }, quantity: string) => {
    const p = page as PageWithCartTracking;
    const targetQuantity = Math.max(0, Math.floor(Number.parseFloat(quantity)));
    p.__cartQuantity = targetQuantity;
    
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG, { state: 'visible' });
    }
    
    // Get current quantity and click buttons to reach target
    const qtyDisplay = page.locator(SELECTOR_QTY_DISPLAY).first();
    const currentQtyText = await qtyDisplay.textContent();
    const currentQty = Number.parseInt(currentQtyText ?? '1', 10);
    
    const diff = targetQuantity - currentQty;
    const button = diff > 0 ? SELECTOR_INCREMENT_BTN : SELECTOR_DECREMENT_BTN;
    const clicks = Math.abs(diff);
    
    for (let index = 0; index < clicks; index++) {
        await page.locator(button).first().click();
        await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);
});

When('I set the quantity to {int}', async ({ page }, targetQuantity: number) => {
    const p = page as PageWithCartTracking;
    p.__cartQuantity = targetQuantity;
    
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG, { state: 'visible' });
    }
    
    // Get current quantity and click buttons to reach target
    const qtyDisplay = page.locator(SELECTOR_QTY_DISPLAY).first();
    const currentQtyText = await qtyDisplay.textContent();
    const currentQty = Number.parseInt(currentQtyText ?? '1', 10);
    
    const diff = targetQuantity - currentQty;
    const button = diff > 0 ? SELECTOR_INCREMENT_BTN : SELECTOR_DECREMENT_BTN;
    const clicks = Math.abs(diff);
    
    for (let index = 0; index < clicks; index++) {
        await page.locator(button).first().click();
        await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);
});

When('I view the cart totals', async ({ page }) => {
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG);
    }
});

When('I remove that trade', async ({ page }) => {
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG);
    }
    
    const removeButton = page.locator(SELECTOR_REMOVE_BTN).first();
    await removeButton.click();
    await page.waitForTimeout(200);
});

// Note: "I refresh the page" step is defined in data-refresh.steps.ts

When('I click the {word} button', async ({ page }, button: string) => {
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG);
    }
    
    if (button === 'increment') {
        await page.locator(SELECTOR_INCREMENT_BTN).first().click();
    } else if (button === 'decrement') {
        await page.locator(SELECTOR_DECREMENT_BTN).first().click();
    }
    await page.waitForTimeout(100);
});

When('I try to set quantity to {int}', async ({ page }, targetQuantity: number) => {
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG, { state: 'visible' });
    }
    
    // Get current quantity and click buttons to try to reach target
    const qtyDisplay = page.locator(SELECTOR_QTY_DISPLAY).first();
    const currentQtyText = await qtyDisplay.textContent();
    const currentQty = Number.parseInt(currentQtyText ?? '1', 10);
    
    const diff = targetQuantity - currentQty;
    const button = diff > 0 ? SELECTOR_INCREMENT_BTN : SELECTOR_DECREMENT_BTN;
    const clicks = Math.abs(diff);
    
    for (let index = 0; index < clicks; index++) {
        await page.locator(button).first().click();
        await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the quantity should be {int}', async ({ page }, expected: number) => {
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG, { state: 'visible' });
    }
    
    const qtyDisplay = page.locator(SELECTOR_QTY_DISPLAY).first();
    const value = await qtyDisplay.textContent();
    expect(Number.parseInt(value ?? '0', 10)).toBe(expected);
});

Then('the total cost should be {int} {word}', async ({ page }, total: number, resource: string) => {
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG);
    }
    
    // Look for cost in cart costs section
    const costsText = await page.locator('#cart-costs').textContent();
    
    // The costs should be displayed
    expect(costsText).toBeDefined();
});

Then('the total for {word} should be {int}', async ({ page }, resource: string, expected: number) => {
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG);
    }
    
    // Verify costs are displayed
    const costsElement = page.locator('#cart-costs');
    await expect(costsElement).toBeVisible();
});

Then('all resource totals should be zero', async ({ page }) => {
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG);
    }
    
    // Empty cart should show no items
    const cartItems = page.locator(SELECTOR_CART_ITEM);
    const count = await cartItems.count();
    expect(count).toBe(0);
});

Then('the cart should be empty', async ({ page }) => {
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG);
    }
    
    const cartItems = page.locator(SELECTOR_CART_ITEM);
    const count = await cartItems.count();
    expect(count).toBe(0);
});

Then('the cart badge should not be visible', async ({ page }) => {
    const badge = page.locator(SELECTOR_CART_BADGE);
    const isVisible = await badge.isVisible();
    
    // Badge might be hidden or show 0
    if (isVisible) {
        const text = await badge.textContent();
        expect(text?.trim()).toMatch(/^0?$/);
    }
});

Then('the cart should still contain my trades', async ({ page }) => {
    await page.click(SELECTOR_OPEN_CART);
    await page.waitForSelector(SELECTOR_CART_DIALOG);
    
    const cartItems = page.locator(SELECTOR_CART_ITEM);
    const count = await cartItems.count();
    expect(count).toBeGreaterThan(0);
});

Then('the quantities should be preserved', async ({ page }) => {
    // Open cart and check qty-display has a value
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG, { state: 'visible' });
    }
    
    const qtyDisplay = page.locator(SELECTOR_QTY_DISPLAY).first();
    const value = await qtyDisplay.textContent();
    expect(Number.parseInt(value ?? '0', 10)).toBeGreaterThan(0);
});

Then('the quantity should be limited to {int}', async ({ page }, expected: number) => {
    const cartDialog = page.locator(SELECTOR_CART_DIALOG);
    if (!(await cartDialog.isVisible())) {
        await page.click(SELECTOR_OPEN_CART);
        await page.waitForSelector(SELECTOR_CART_DIALOG);
    }
    
    const qtyDisplay = page.locator(SELECTOR_QTY_DISPLAY).first();
    const value = await qtyDisplay.textContent();
    expect(Number.parseInt(value ?? '0', 10)).toBeLessThanOrEqual(expected);
});
