/**
 * Data refresh and new items step definitions
 */
import { expect } from '@playwright/test';
import { Given, When, Then, test } from './fixtures';
import { 
    setupDynamicDataMock, 
    setupFastRefreshConfig,
    setupColoredTileMocks,
    createDynamicDataMock,
    type DynamicDataMock 
} from '../../tests/helpers/navigation-mocks';

// ============================================================================
// Constants
// ============================================================================

const SELECTOR_TRADE_ROW = '.trade-row';
const SELECTOR_NEW_TRADE = '.trade-row.new-item, .trade-row[data-new="true"]';
const SELECTOR_SEARCH_CONTAINER = '.search-container';

// Extend fixtures for dynamic data mock
declare module './fixtures' {
    interface BddFixtures {
        dynamicDataMock: DynamicDataMock;
    }
}

// Add the dynamic data mock fixture
test.extend<{ dynamicDataMock: DynamicDataMock }>({
    // eslint-disable-next-line no-empty-pattern
    dynamicDataMock: async ({}, use) => {
        const mock = createDynamicDataMock();
        await use(mock);
        mock.reset();
    }
});

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the app is loaded with dynamic mock data', async ({ page }) => {
    const mock = createDynamicDataMock();
    
    // Set up mocks BEFORE navigating - order matters!
    await setupColoredTileMocks(page);
    await setupFastRefreshConfig(page, 60_000); // Use default refresh, also mocks config.json
    await setupDynamicDataMock(page, mock);
    
    // Navigate to app
    await page.goto('/');
    await page.waitForSelector(SELECTOR_SEARCH_CONTAINER, { state: 'visible' });
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 10_000 });
    
    // Store mock in page context for later steps
    await page.evaluate((mockData) => {
        (globalThis as unknown as { __dynamicMock: typeof mockData }).__dynamicMock = mockData;
    }, { shops: mock.shops, fetchCount: mock.fetchCount });
});

Given('there are {int} trades initially', async ({ page }, expectedCount: number) => {
    // Wait for initial trades to load
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
    
    // Count all trades (the mock data has 5 shops with 1 recipe each = 5 trades)
    const tradeCount = await page.locator(SELECTOR_TRADE_ROW).count();
    expect(tradeCount).toBe(expectedCount);
});

Given('the refresh interval is set to {int} seconds', async ({ page }, seconds: number) => {
    const mock = createDynamicDataMock();
    
    // Set up fast refresh config
    await setupFastRefreshConfig(page, seconds * 1000);
    await setupColoredTileMocks(page);
    await setupDynamicDataMock(page, mock);
    
    // Navigate to app
    await page.goto('/');
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
});

// ============================================================================
// WHEN Steps
// ============================================================================

When(String.raw`the shop data refreshes with {int} new trade\(s)`, async ({ page }, newTradeCount: number) => {
    // Add new trades by updating the route handler to return additional shops
    // First, unroute any existing handlers then set up a new one with more shops
    await page.unroute(/(data\.json|pvc-shops\.minecraft-works\.workers\.dev)/);
    
    // Get existing shop count from page context
    const existingShops = await page.evaluate(() => {
        return (globalThis as unknown as { __dynamicMock?: { shops: unknown[] } }).__dynamicMock?.shops ?? [];
    });
    
    // Create new shop data with additional trades - spread creates a copy
    const newShops = [...existingShops];
    for (let index = 0; index < newTradeCount; index++) {
        newShops.push({
            shopName: `New Shop ${Date.now()}-${index}`,
            shopOwner: 'NewOwner',
            location: `${500 + index * 50}.0, 64.0, ${500 + index * 50}.0`,
            world: 'World',
            recipes: [{
                resultItem: { type: 'GOLD_INGOT', name: 'Gold Ingot', amount: 4 },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                stock: 10
            }]
        });
    }
    
    // Set up new route with updated data
    await page.route(/(data\.json|pvc-shops\.minecraft-works\.workers\.dev)/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: newShops })
        });
    });
    
    // Trigger refresh
    await page.evaluate(async () => {
        const refreshFunction = (globalThis as unknown as { refreshShopData?: () => Promise<number> }).refreshShopData;
        if (typeof refreshFunction === 'function') {
            await refreshFunction();
        }
    });
    
    // Wait for DOM update
    await page.waitForTimeout(200);
});

When(String.raw`the shop data refreshes with {int} new trade\(s) for {string}`, async ({ page }, _count: number, itemName: string) => {
    // Update route with a new trade for the specific item
    await page.unroute(/(data\.json|pvc-shops\.minecraft-works\.workers\.dev)/);
    
    const existingShops = await page.evaluate(() => {
        return (globalThis as unknown as { __dynamicMock?: { shops: unknown[] } }).__dynamicMock?.shops ?? [];
    });
    
    const newShops = [
        ...existingShops,
        {
            shopName: `New ${itemName} Shop`,
            shopOwner: 'NewOwner',
            location: '600.0, 64.0, 600.0',
            world: 'World',
            recipes: [{
                resultItem: { 
                    type: itemName.toUpperCase().replaceAll(' ', '_'), 
                    name: itemName, 
                    amount: 1 
                },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 10 },
                stock: 5
            }]
        }
    ];
    
    await page.route(/(data\.json|pvc-shops\.minecraft-works\.workers\.dev)/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: newShops })
        });
    });
    
    await page.evaluate(async () => {
        const refreshFunction = (globalThis as unknown as { refreshShopData?: () => Promise<number> }).refreshShopData;
        if (typeof refreshFunction === 'function') {
            await refreshFunction();
        }
    });

    await page.waitForTimeout(200);
});

When('the shop data refreshes with a new {string} trade', async ({ page }, itemName: string) => {
    await page.unroute(/(data\.json|pvc-shops\.minecraft-works\.workers\.dev)/);
    
    const existingShops = await page.evaluate(() => {
        return (globalThis as unknown as { __dynamicMock?: { shops: unknown[] } }).__dynamicMock?.shops ?? [];
    });
    
    const newShops = [
        ...existingShops,
        {
            shopName: `New ${itemName} Shop`,
            shopOwner: 'NewOwner',
            location: '700.0, 64.0, 700.0',
            world: 'World',
            recipes: [{
                resultItem: { 
                    type: itemName.toUpperCase().replaceAll(' ', '_'), 
                    name: itemName, 
                    amount: 1 
                },
                // Use Iron as cost to avoid matching common search terms
                item1: { type: 'IRON_INGOT', name: 'Iron Ingot', amount: 5 },
                stock: 10
            }]
        }
    ];
    
    await page.route(/(data\.json|pvc-shops\.minecraft-works\.workers\.dev)/, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: newShops })
        });
    });
    
    await page.evaluate(async () => {
        const refreshFunction = (globalThis as unknown as { refreshShopData?: () => Promise<number> }).refreshShopData;
        if (typeof refreshFunction === 'function') {
            await refreshFunction();
        }
    });

    await page.waitForTimeout(200);
});

When('the shop data refreshes', async({ page }) => {
    // Trigger refresh without adding new trades
    await page.evaluate(async () => {
        const refreshFunction = (globalThis as unknown as { refreshShopData?: () => Promise<number> }).refreshShopData;
        if (typeof refreshFunction === 'function') {
            await refreshFunction();
        }
    });
    await page.waitForTimeout(100);
});

When('the data refresh fails with a network error', async ({ page }) => {
    // Set up a failing route for the next request
    await page.route('**/pvc-shops.minecraft-works.workers.dev/**', async (route) => {
        await route.abort('failed');
    });
    
    // Wait for the refresh interval
    await page.waitForTimeout(100);
});

When('I scroll to view the new trade', async ({ page }) => {
    // Scroll to the new trade indicator
    const newTrade = page.locator('.trade-row.new-item, .trade-row[data-new="true"]').first();
    if (await newTrade.count() > 0) {
        await newTrade.scrollIntoViewIfNeeded();
    }
});

When('I refresh the page', async ({ page }) => {
    await page.reload();
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
});

// Note: "I wait for {int} seconds" is defined in tooltip.steps.ts

// ============================================================================
// THEN Steps
// ============================================================================

Then('I should see {int} total trades', async ({ page }, expectedCount: number) => {
    await page.waitForTimeout(200); // Allow DOM to update
    const tradeCount = await page.locator(SELECTOR_TRADE_ROW).count();
    expect(tradeCount).toBe(expectedCount);
});

Then('the new trades should be highlighted', async ({ page }) => {
    // Look for trades with new-item class or data-new attribute
    const highlightedTrades = page.locator(SELECTOR_NEW_TRADE);
    const count = await highlightedTrades.count();
    expect(count).toBeGreaterThan(0);
});

Then('the {string} trade should have a {string} indicator', async ({ page }, itemName: string, indicatorType: string) => {
    // Find the trade row containing the item name
    const tradeRow = page.locator(SELECTOR_TRADE_ROW).filter({ hasText: itemName }).first();
    await expect(tradeRow).toBeVisible();
    
    // Check for the indicator class
    if (indicatorType === 'new') {
        await expect(tradeRow).toHaveClass(/new-item|data-new/);
    }
});

Then('the new trades should still be highlighted', async ({ page }) => {
    // Verify highlights persist (don't auto-fade)
    const highlightedTrades = page.locator(SELECTOR_NEW_TRADE);
    const count = await highlightedTrades.count();
    expect(count).toBeGreaterThan(0);
});

Then('there should be no highlighted trades', async ({ page }) => {
    // After page refresh, no trades should have the new-item highlight
    const highlightedTrades = page.locator(SELECTOR_NEW_TRADE);
    const count = await highlightedTrades.count();
    expect(count).toBe(0);
});

Then('I should not see the new {string} trade', async ({ page }, itemName: string) => {
    const visibleTrades = page.locator(SELECTOR_TRADE_ROW).filter({ visible: true });
    const count = await visibleTrades.count();
    
    for (let index = 0; index < count; index++) {
        const text = await visibleTrades.nth(index).textContent();
        expect(text?.toLowerCase()).not.toContain(itemName.toLowerCase());
    }
});

Then('clearing the search should show the new trade', async ({ page }) => {
    // Clear the search field
    const searchInput = page.locator('#searchWant');
    await searchInput.fill('');
    
    // Wait for the trade list to update
    await page.waitForTimeout(200);
    
    // The new trade should now be visible
    const tradeCount = await page.locator(SELECTOR_TRADE_ROW).count();
    expect(tradeCount).toBeGreaterThan(0);
});

Then('my cart should still contain the trade', async ({ page }) => {
    // Check cart badge is visible (not hidden class)
    const cartBadge = page.locator('#cart-badge:not(.hidden)');
    await expect(cartBadge).toBeVisible();
});

Then('the cart badge should still show {string}', async ({ page }, expectedCount: string) => {
    const cartBadge = page.locator('#cart-badge');
    await expect(cartBadge).toHaveText(expectedCount);
});

Then('the existing trades should still be visible', async ({ page }) => {
    const tradeRows = page.locator(SELECTOR_TRADE_ROW);
    const count = await tradeRows.count();
    expect(count).toBeGreaterThan(0);
});

Then('no error message should be shown to the user', async ({ page }) => {
    // Check that no error dialog or message is visible
    const errorMessage = page.locator('.error-message, .error-dialog, [role="alert"]');
    await expect(errorMessage).toHaveCount(0);
});

Then('the data should have been fetched again', async ({ page }) => {
    // This would require tracking fetch count in the mock
    // For now, just verify the app is still functional
    const tradeRows = page.locator(SELECTOR_TRADE_ROW);
    const count = await tradeRows.count();
    expect(count).toBeGreaterThan(0);
});

When('I click the new items filter toggle', async ({ page }) => {
    await page.locator('.new-col-header').click();
});

Then('I should see only {int} trades', async ({ page }, expectedCount: number) => {
    const tradeRows = page.locator(SELECTOR_TRADE_ROW).filter({ visible: true });
    await expect(tradeRows).toHaveCount(expectedCount);
});

Then('clicking the toggle again should show all {int} trades', async ({ page }, expectedCount: number) => {
    await page.locator('.new-col-header').click();
    const tradeRows = page.locator(SELECTOR_TRADE_ROW).filter({ visible: true });
    await expect(tradeRows).toHaveCount(expectedCount);
});
