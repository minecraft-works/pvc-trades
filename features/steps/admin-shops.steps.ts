/**
 * Step definitions for the admin shops (the server's own spawn shops)
 */
import { expect } from '@playwright/test';

import { setupAdminShopDataMock } from '../../tests/helpers/admin-shop-mocks';
import { setupColoredTileMocks } from '../../tests/helpers/navigation-mocks';
import { Given, Then, When } from './fixtures';

const SELECTOR_TRADE_ROW = '.trade-row';
const WANT_MENU = '#searchWant-suggestions';

Given('the app is loaded with player and admin shops', async ({ page }) => {
    await setupColoredTileMocks(page);
    await setupAdminShopDataMock(page);
    await page.goto('./');
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
});

Given('the app is opened at {string} with player and admin shops', async ({ page }, query: string) => {
    await setupColoredTileMocks(page);
    await setupAdminShopDataMock(page);
    await page.goto(`./${query}`);
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
});

When('I pick {string} in the Buying menu', async ({ page }, label: string) => {
    await page.locator('#searchWant').click();
    const row = page.locator(`${WANT_MENU} .search-suggestion-action`, { hasText: label });
    await row.click();
    // Picked in place: the menu stays open with the row marked
    await expect(row).toHaveClass(/is-current/);
    await page.keyboard.press('Escape');
});

Then('every trade should show unlimited stock', async ({ page }) => {
    const stocks = page.locator(`${SELECTOR_TRADE_ROW} .stock`);
    await expect(stocks.first()).toBeVisible();
    for (const stock of await stocks.all()) {
        await expect(stock).toHaveText('∞');
        await expect(stock).toHaveAttribute('title', 'Admin shop: unlimited stock');
    }
});

Then('the Buying menu should not offer {string}', async ({ page }, label: string) => {
    await page.locator('#searchWant').click();
    await expect(page.locator(WANT_MENU)).toBeVisible();
    const rows = page.locator(`${WANT_MENU} [role="option"]`).filter({ hasText: new RegExp(`^${label}`) });
    await expect(rows).toHaveCount(0);
    await page.keyboard.press('Escape');
});
