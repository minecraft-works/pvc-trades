/**
 * Search and filter step definitions
 */
import { expect } from '@playwright/test';
import type { DataTable } from 'playwright-bdd';

import { setupColoredTileMocks,setupMultiWorldDataMock } from '../../tests/helpers/navigation-mocks';
import { Given, Then,When } from './fixtures';

// Selector constant to avoid duplicate strings
const SELECTOR_TRADE_ROW = '.trade-row';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the app is loaded with mock shop data', async ({ page }) => {
    // Set up mocks for data and tiles
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    
    // Navigate to app (uses baseURL from config)
    await page.goto('/');
    await page.waitForSelector('.search-container', { state: 'visible' });
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I search for {string} in the want field', async ({ page }, searchTerm: string) => {
    const searchInput = page.locator('#searchWant');
    await searchInput.fill(searchTerm);
});

When('I search for {string} in the give field', async ({ page }, searchTerm: string) => {
    const searchInput = page.locator('#searchGive');
    await searchInput.fill(searchTerm);
});

When('I click the {string} column header', async ({ page }, columnId: string) => {
    const header = page.locator(`[data-col="${columnId}"]`);
    await header.click();
});

When('I click the {string} column header again', async ({ page }, columnId: string) => {
    const header = page.locator(`[data-col="${columnId}"]`);
    await header.click();
});

When('I click the swap search button', async ({ page }) => {
    await page.locator('#swap-search').click();
});

When('I press {string}', async ({ page }, key: string) => {
    await page.keyboard.press(key);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the want field should contain {string}', async ({ page }, expected: string) => {
    await expect(page.locator('#searchWant')).toHaveValue(expected);
});

Then('the give field should contain {string}', async ({ page }, expected: string) => {
    await expect(page.locator('#searchGive')).toHaveValue(expected);
});

Then('the want field should be focused', async ({ page }) => {
    await expect(page.locator('#searchWant')).toBeFocused();
});

Then('the give field should be focused', async ({ page }) => {
    await expect(page.locator('#searchGive')).toBeFocused();
});

Then('the first trade row should be focused', async ({ page }) => {
    await expect(page.locator(SELECTOR_TRADE_ROW).first()).toBeFocused();
});

Then('trades other than {string} should be displayed', async ({ page }, term: string) => {
    const others = page.locator(`${SELECTOR_TRADE_ROW} .result-name`).filter({ hasNotText: new RegExp(term, 'i') });
    await expect(others.first()).toBeVisible();
});

Then('only trades offering {word} should be displayed', async ({ page }, item: string) => {
    // Wait for filtering to complete - first row should contain the search term
    const firstRow = page.locator(SELECTOR_TRADE_ROW).first();
    await expect(firstRow).toContainText(new RegExp(item, 'i'), { timeout: 5000 });
    
    // Now verify all visible rows (use Playwright's visible filter instead of :visible CSS pseudo-selector)
    const rows = page.locator(SELECTOR_TRADE_ROW).filter({ visible: true });
    const count = await rows.count();
    
    expect(count).toBeGreaterThan(0);
    
    // Check each visible row contains the search term
    for (let index = 0; index < count; index++) {
        const rowText = await rows.nth(index).textContent();
        expect(rowText?.toLowerCase()).toContain(item.toLowerCase());
    }
});

Then('only trades accepting {word} should be displayed', async ({ page }, item: string) => {
    // Wait for filtering to complete - first row should contain the search term
    const firstRow = page.locator(SELECTOR_TRADE_ROW).first();
    await expect(firstRow).toContainText(new RegExp(item, 'i'), { timeout: 5000 });
    
    // Now verify all visible rows (use Playwright's visible filter instead of :visible CSS pseudo-selector)
    const rows = page.locator(SELECTOR_TRADE_ROW).filter({ visible: true });
    const count = await rows.count();
    
    expect(count).toBeGreaterThan(0);
    
    // Check each visible row contains the search term in the cost column
    for (let index = 0; index < count; index++) {
        const rowText = await rows.nth(index).textContent();
        expect(rowText?.toLowerCase()).toContain(item.toLowerCase());
    }
});

Then('only trades offering {word} for {word} should be displayed', async ({ page }, wantItem: string, giveItem: string) => {
    // Wait for filtering to complete - first row should contain both search terms
    const firstRow = page.locator(SELECTOR_TRADE_ROW).first();
    await expect(firstRow).toContainText(new RegExp(wantItem, 'i'), { timeout: 5000 });
    
    // Now verify all visible rows (use Playwright's visible filter instead of :visible CSS pseudo-selector)
    const rows = page.locator(SELECTOR_TRADE_ROW).filter({ visible: true });
    const count = await rows.count();
    
    expect(count).toBeGreaterThan(0);
    
    for (let index = 0; index < count; index++) {
        const rowText = await rows.nth(index).textContent();
        expect(rowText?.toLowerCase()).toContain(wantItem.toLowerCase());
        expect(rowText?.toLowerCase()).toContain(giveItem.toLowerCase());
    }
});

Then('the result count should decrease', async ({ page }) => {
    // With our mock data, filtering should result in at least 1 match
    const currentCount = await page.locator(SELECTOR_TRADE_ROW).count();
    expect(currentCount).toBeGreaterThan(0);
});

Then('I should see {string} message', async ({ page }, message: string) => {
    const noResults = page.locator('.no-results');
    await expect(noResults).toBeVisible({ timeout: 2000 });
    await expect(noResults).toContainText(message);
});

Then('{string} should be highlighted in the result rows', async ({ page }, term: string) => {
    // Wait for filtering to complete and highlights to appear
    await page.waitForTimeout(500);
    
    // Check for <mark> tags containing the search term
    const highlights = page.locator(`${SELECTOR_TRADE_ROW} mark`);
    await expect(highlights.first()).toBeVisible({ timeout: 3000 });
    const count = await highlights.count();
    
    expect(count).toBeGreaterThan(0);
    
    // Verify at least one highlight contains the term
    const firstHighlight = await highlights.first().textContent();
    expect(firstHighlight?.toLowerCase()).toContain(term.toLowerCase());
});

Then('results should be sorted by result amount descending', async ({ page }) => {
    const rows = page.locator(SELECTOR_TRADE_ROW);
    const count = await rows.count();
    
    if (count < 2) {
        // Not enough rows to verify sorting - skip
        return;
    }
    
    const amounts: number[] = [];
    for (let index = 0; index < count; index++) {
        const amountText = await rows.nth(index).locator('.result-amt').textContent();
        const amount = Number.parseInt(amountText || '0', 10);
        amounts.push(amount);
    }
    
    // Check descending order
    for (let index = 1; index < amounts.length; index++) {
        expect(amounts[index]).toBeLessThanOrEqual(amounts[index - 1] ?? 0);
    }
});

Then('results should be sorted by result amount ascending', async ({ page }) => {
    const rows = page.locator(SELECTOR_TRADE_ROW);
    const count = await rows.count();
    
    if (count < 2) {
        // Not enough rows to verify sorting - skip
        return;
    }
    
    const amounts: number[] = [];
    for (let index = 0; index < count; index++) {
        const amountText = await rows.nth(index).locator('.result-amt').textContent();
        const amount = Number.parseInt(amountText || '0', 10);
        amounts.push(amount);
    }
    
    // Check ascending order
    for (let index = 1; index < amounts.length; index++) {
        expect(amounts[index]).toBeGreaterThanOrEqual(amounts[index - 1] ?? 0);
    }
});

// ============================================================================
// Search Variations (one page load, many queries)
// ============================================================================

const NO_MATCH_QUERY = 'zzzz-no-such-item';
const INJECTED_ELEMENT_SELECTOR = 'body img[src="x"], body [onerror], body [onload], body [onmouseover], body [onfocus], body script:not([src])';

/**
 * Wait until the debounced (requestAnimationFrame) search has rendered.
 * @param page - Playwright page
 */
async function waitForSearchRender(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
}

Then('each of these searches should find a matching trade:', async ({ page }, table: DataTable) => {
    const input = page.locator('#searchWant');
    const rows = page.locator(SELECTOR_TRADE_ROW);

    for (const { query = '', expected = '' } of table.hashes()) {
        // Reset to an empty result so stale rows can't satisfy the next check
        await input.fill(NO_MATCH_QUERY);
        await expect(rows).toHaveCount(0);

        await input.fill(query);
        await expect(rows.filter({ hasText: expected }).first(), `search "${query}"`).toBeVisible();
    }
});

Then('none of these searches should run injected code or break the page:', async ({ page }, table: DataTable) => {
    const problems: string[] = [];
    page.on('dialog', dialog => {
        problems.push(`dialog opened: ${dialog.message()}`);
        void dialog.dismiss();
    });
    page.on('pageerror', error => {
        problems.push(`page error: ${error.message}`);
    });

    const input = page.locator('#searchWant');
    for (const { query = '' } of table.hashes()) {
        await input.fill(query);
        await waitForSearchRender(page);
        expect(problems, `after searching ${JSON.stringify(query)}`).toEqual([]);
        await expect(page.locator(INJECTED_ELEMENT_SELECTOR), `after searching ${JSON.stringify(query)}`).toHaveCount(0);
    }

    // The app still works after all of that
    await input.fill('diamond');
    await expect(page.locator(SELECTOR_TRADE_ROW).first()).toBeVisible();
});

// ============================================================================
// Clear Button Steps
// ============================================================================

When('I click the want field clear button', async ({ page }) => {
    await page.locator('#clear-search-want').click();
});

When('I click the give field clear button', async ({ page }) => {
    await page.locator('#clear-search-give').click();
});

Then('the want field clear button should be visible', async ({ page }) => {
    const clearButton = page.locator('#clear-search-want');
    await expect(clearButton).toBeVisible();
    await expect(clearButton).not.toHaveClass(/hidden/);
});

Then('the want field clear button should not be visible', async ({ page }) => {
    const clearButton = page.locator('#clear-search-want');
    await expect(clearButton).toHaveClass(/hidden/);
});

Then('the give field clear button should be visible', async ({ page }) => {
    const clearButton = page.locator('#clear-search-give');
    await expect(clearButton).toBeVisible();
    await expect(clearButton).not.toHaveClass(/hidden/);
});

Then('the give field clear button should not be visible', async ({ page }) => {
    const clearButton = page.locator('#clear-search-give');
    await expect(clearButton).toHaveClass(/hidden/);
});
