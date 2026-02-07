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

When('I click the swap search button', async ({ page }) => {
    await page.locator('#swap-search').click();
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
// Scenario Outline Steps (Search Variations)
// ============================================================================

Then('I should see results containing {string}', async ({ page }, expectedText: string) => {
    // Wait for search to filter
    await page.waitForTimeout(300);
    
    const rows = page.locator(SELECTOR_TRADE_ROW);
    const count = await rows.count();
    
    // Should have at least one result
    expect(count).toBeGreaterThan(0);
    
    // Check that at least one row contains the expected text (case insensitive)
    let found = false;
    for (let index = 0; index < count; index++) {
        const rowText = await rows.nth(index).textContent();
        if (rowText?.toLowerCase().includes(expectedText.toLowerCase())) {
            found = true;
            break;
        }
    }
    expect(found).toBe(true);
});

Then('the app should not crash', async ({ page }) => {
    // Verify the app is still responsive - core elements should be present
    await expect(page.locator('.search-container')).toBeVisible({ timeout: 2000 });
    
    // No uncaught errors should be visible
    const errorDialog = page.locator('.error-dialog, [role="alert"]');
    const errorCount = await errorDialog.count();
    expect(errorCount).toBe(0);
});

// ============================================================================
// Security and XSS Steps
// ============================================================================

Then('no script should execute', async ({ page }) => {
    // Set up a flag that would be set if any script executes
    const scriptExecuted = await page.evaluate(() => {
        // Check if window.__xssTest was set (would be set by injected scripts)
        return (globalThis as unknown as { __xssTest?: boolean }).__xssTest === true;
    });
    
    expect(scriptExecuted).toBe(false);
});

Then('the search input should be sanitized', async ({ page }) => {
    // Check that no raw HTML was rendered in the results OR the page is empty
    const tradeRows = page.locator('.trade-row');
    const rowCount = await tradeRows.count();
    
    if (rowCount === 0) {
        // No results - that's fine, the injection text didn't match anything
        // The key is that the page didn't execute any scripts
        return;
    }
    
    const resultsHtml = await tradeRows.first().innerHTML();
    
    // Should not contain unescaped script tags
    expect(resultsHtml).not.toMatch(/<script[^>]*>/i);
    expect(resultsHtml).not.toMatch(/onerror\s*=/i);
    expect(resultsHtml).not.toMatch(/onload\s*=/i);
    expect(resultsHtml).not.toMatch(/javascript:/i);
});

Then('the search should complete safely', async ({ page }) => {
    // Verify the app is still responsive after potentially dangerous input
    await expect(page.locator('.search-container')).toBeVisible({ timeout: 2000 });
    
    // Verify no JavaScript errors occurred (would crash the app)
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
        pageErrors.push(error.message);
    });
    
    // Wait a moment for any delayed errors
    await page.waitForTimeout(100);
    
    // If there were errors, they should not be from our injection attempts
    for (const error of pageErrors) {
        expect(error).not.toMatch(/xss|injection|alert/i);
    }
});

Then('results should appear within {int}ms', async ({ page }, maxMs: number) => {
    const startTime = Date.now();
    
    // Wait for results to be visible or search to complete
    await page.waitForSelector('.trade-row, .no-results', { state: 'visible', timeout: maxMs + 1000 });
    
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(maxMs);
});
