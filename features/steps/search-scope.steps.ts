/**
 * Step definitions for the search field menus and the scope pills
 */
import { expect } from '@playwright/test';

import { Then, When } from './fixtures';

When('I turn on the {string} filter in the Buying menu', async ({ page }, label: string) => {
    await page.locator('#searchWant').click();
    const row = page.locator('#searchWant-suggestions .search-suggestion-toggle', { hasText: label });
    await row.click();
    await expect(row).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
});

When('I remove the {string} pill', async ({ page }, label: string) => {
    await page.locator('#scope-pills .scope-pill', { hasText: label }).locator('.scope-pill-clear').click();
});

When('I open {string} in the Buying menu', async ({ page }, label: string) => {
    await page.locator('#searchWant').click();
    await page.locator('#searchWant-suggestions .search-suggestion-submenu', { hasText: label }).click();
});

Then('the menu should list the owner {string}', async ({ page }, owner: string) => {
    await expect(page.locator('#searchWant-suggestions .search-suggestion-action', { hasText: owner }).first()).toBeVisible();
});

When('I choose {string} in the menu', async ({ page }, label: string) => {
    await page.locator('#searchWant-suggestions .search-suggestion-action', { hasText: label }).first().click();
});
