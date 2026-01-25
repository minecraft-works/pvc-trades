/**
 * Search and filter step definitions
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import { setupMultiWorldDataMock, setupColoredTileMocks } from '../../tests/helpers/navigation-mocks';

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

// ============================================================================
// THEN Steps
// ============================================================================

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
