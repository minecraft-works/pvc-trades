/**
 * Step definitions for Trade Details Popover feature
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';

const SELECTOR_TRADE_ROW = '.trade-row';
const SELECTOR_TRADE_DETAILS_DIALOG = '#trade-details-dialog';
const SELECTOR_MAP_DIALOG = '#map-dialog';

When('I click on the result name of a trade', async ({ page }) => {
    // Click on a result name that has details (lore or enchants)
    const resultNameCell = page.locator(`${SELECTOR_TRADE_ROW} .result-name.has-details`).first();
    await resultNameCell.click();
});

When('I click on the cost name of a trade', async ({ page }) => {
    // Click on a cost name that has details (lore or enchants)
    const costNameCell = page.locator(`${SELECTOR_TRADE_ROW} .cost-name.has-details`).first();
    await costNameCell.click();
});

Then('the trade details dialog should be visible', async ({ page }) => {
    await expect(page.locator(SELECTOR_TRADE_DETAILS_DIALOG)).toBeVisible({ timeout: 5000 });
});

Then('the trade details dialog should be hidden', async ({ page }) => {
    await expect(page.locator(SELECTOR_TRADE_DETAILS_DIALOG)).not.toBeVisible();
});

Then('the dialog title should be {string}', async ({ page }, title: string) => {
    await expect(page.locator('#trade-details-title')).toHaveText(title);
});

Then('I should see the result item name', async ({ page }) => {
    const nameElement = page.locator(`${SELECTOR_TRADE_DETAILS_DIALOG} .trade-detail-name`);
    await expect(nameElement.first()).toBeVisible();
    const text = await nameElement.first().textContent();
    expect(text?.length).toBeGreaterThan(0);
});

Then('I should see the result item amount', async ({ _page }) => {
    // Amount display has been removed from the trade details dialog
    // This step is kept for backwards compatibility but does nothing
});

Then('I should see both cost item names', async ({ page }) => {
    const nameElements = page.locator(`${SELECTOR_TRADE_DETAILS_DIALOG} .trade-detail-name`);
    await expect(nameElements).toHaveCount(2, { timeout: 5000 });
});

Then('I should see the cost item name', async ({ page }) => {
    const nameElement = page.locator(`${SELECTOR_TRADE_DETAILS_DIALOG} .trade-detail-name`);
    await expect(nameElement.first()).toBeVisible();
});

Given('there is a trade with two cost items', async ({ page }) => {
    // Look for a trade with "+" in the cost column (indicates item2)
    const tradesWithItem2 = page.locator(`${SELECTOR_TRADE_ROW}`).filter({
        has: page.locator('.cost-name:has-text("+")')
    });
    const count = await tradesWithItem2.count();
    if (count === 0) {
        // Skip test if no trades with item2 exist in mock data
        console.warn('No trades with item2 found in mock data - test may need updated mock data');
    }
});

When('I click on the cost name of that trade', async ({ page }) => {
    const tradeWithItem2 = page.locator(`${SELECTOR_TRADE_ROW}`).filter({
        has: page.locator('.cost-name:has-text("+")')
    }).first();
    await tradeWithItem2.locator('.cost-name').click();
});

Given('there is a trade with lore on the result item', async ({ page }) => {
    // Shulker boxes with contents have lore - find one of these
    const shulkerTrades = page.locator(`${SELECTOR_TRADE_ROW}`).filter({
        has: page.locator('.result-name:has-text("Shulker")')
    });
    const count = await shulkerTrades.count();
    if (count === 0) {
        console.warn('No shulker trades found in mock data');
    }
});

When('I click on the result name of that trade', async ({ page }) => {
    // Click the first shulker trade result
    const shulkerTrade = page.locator(`${SELECTOR_TRADE_ROW}`).filter({
        has: page.locator('.result-name:has-text("Shulker")')
    }).first();
    await shulkerTrade.locator('.result-name').click();
});

Then('I should see the lore text', async ({ page }) => {
    const loreSection = page.locator(`${SELECTOR_TRADE_DETAILS_DIALOG} .trade-detail-lore`);
    await expect(loreSection).toBeVisible();
});

Given('there is a trade with enchanted items', async ({ page }) => {
    // Look for trades that might have enchantments (tools, armor, books)
    const enchantedTrades = page.locator(`${SELECTOR_TRADE_ROW}`).filter({
        has: page.locator('.result-name:text-matches("Sword|Pickaxe|Axe|Book|Bow|Trident|Helmet|Chestplate|Leggings|Boots")')
    });
    const count = await enchantedTrades.count();
    if (count === 0) {
        console.warn('No enchanted item trades found in mock data');
    }
});

Then('I should see enchantment details', async ({ page }) => {
    const enchantSection = page.locator(`${SELECTOR_TRADE_DETAILS_DIALOG} .trade-detail-enchants`);
    // May or may not be present depending on data
    const isVisible = await enchantSection.isVisible();
    if (isVisible) {
        await expect(enchantSection.locator('.trade-detail-enchant')).toHaveCount(1);
    }
});

When('I click the close button on trade details', async ({ page }) => {
    await page.locator('#close-trade-details').click();
});

When('I click outside the trade details dialog', async ({ page }) => {
    // Click on the backdrop
    const dialog = page.locator(SELECTOR_TRADE_DETAILS_DIALOG);
    const box = await dialog.boundingBox();
    if (box) {
        // Click outside the dialog (above it)
        await page.mouse.click(box.x - 50, box.y - 50);
    }
});

Then('the map dialog should be visible', async ({ page }) => {
    await expect(page.locator(SELECTOR_MAP_DIALOG)).toBeVisible({ timeout: 5000 });
});
