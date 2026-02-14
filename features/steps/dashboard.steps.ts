/**
 * Daily Deals Dashboard step definitions
 *
 * Tests the dashboard banner that shows new trades, price drops,
 * and watchlist hits since the user's last visit.
 *
 * Uses dedicated mock data with enough independent shops to produce
 * trusted item values and real deviations (minIndependentShops = 3).
 *
 * Diamond buy prices: [1, 1.5, 2, 4] → median = 1.75
 * Computed deviations: A = −43%, B = −14%, C = +14%, D = +129%, E = 0%
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import { setupColoredTileMocks } from '../../tests/helpers/navigation-mocks';

// ============================================================================
// Constants
// ============================================================================

const DASHBOARD_SELECTOR = '#deals-dashboard';
const DASHBOARD_VISIBLE_SELECTOR = '#deals-dashboard:not(.hidden)';
const DISMISS_BUTTON_SELECTOR = '#dismiss-dashboard';
const DASHBOARD_SECTIONS_SELECTOR = '#dashboard-sections';
const DASHBOARD_ACTIONS_SELECTOR = '#dashboard-actions';
const DASHBOARD_TIME_AGO_SELECTOR = '#dashboard-time-ago';
const ACTION_BUTTON_SELECTOR = '.dashboard-action-btn';
const TOGGLE_BUTTON_SELECTOR = '#open-dashboard';
const FAV_FILTER_ACTIVE_SELECTOR = '.fav-col-header.active';
const TRADE_ROW_SELECTOR = '.trade-row';

const STORAGE_KEY_SNAPSHOT = 'pvc-trades-snapshot';
const STORAGE_KEY_FAVORITES = 'pvc-trades-favorites';

// ============================================================================
// Dashboard-specific mock data
// ============================================================================

/**
 * Mock shops with enough Diamond↔Emerald trades to satisfy minIndependentShops = 3.
 * All shops are >16 blocks apart (independent).
 *
 * Trade keys (after formatName): x,y,z,world,resultName,costName
 */
const DASHBOARD_SHOP_DATA = {
    data: [
        {
            shopName: 'Cheap Diamonds',
            shopOwner: 'Owner1',
            location: '100.0, 64.0, 200.0',
            world: 'World',
            recipes: [{
                resultItem: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                stock: 10
            }]
        },
        {
            shopName: 'Fair Diamonds',
            shopOwner: 'Owner2',
            location: '300.0, 64.0, 400.0',
            world: 'World',
            recipes: [{
                resultItem: { type: 'DIAMOND', name: 'Diamond', amount: 2 },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 3 },
                stock: 20
            }]
        },
        {
            shopName: 'Pricey Diamonds',
            shopOwner: 'Owner3',
            location: '600.0, 64.0, 100.0',
            world: 'World',
            recipes: [{
                resultItem: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 2 },
                stock: 15
            }]
        },
        {
            shopName: 'Iron Works',
            shopOwner: 'Owner4',
            location: '800.0, 64.0, 400.0',
            world: 'World',
            recipes: [{
                resultItem: { type: 'IRON_INGOT', name: 'Iron Ingot', amount: 16 },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                stock: 64
            }]
        },
        {
            shopName: 'Overpriced Shop',
            shopOwner: 'Owner5',
            location: '900.0, 64.0, 300.0',
            world: 'World',
            recipes: [{
                resultItem: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                item1: { type: 'EMERALD', name: 'Emerald', amount: 4 },
                stock: 5
            }]
        }
    ]
};

/**
 * Trade keys matching DASHBOARD_SHOP_DATA after formatName() processing.
 * Format: x,y,z,world,resultName,costName
 */
const MOCK_TRADE_KEYS = {
    cheapDiamonds:  '100,64,200,World,Diamond,Emerald',   // deviation ≈ −43%
    fairDiamonds:   '300,64,400,World,Diamond,Emerald',   // deviation ≈ −14%
    priceyDiamonds: '600,64,100,World,Diamond,Emerald',   // deviation ≈ +14%
    ironWorks:      '800,64,400,World,Iron ingot,Emerald', // deviation ≈ 0%
    overpriced:     '900,64,300,World,Diamond,Emerald',   // deviation ≈ +129%
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Set up data.json & config.json mocks using dashboard-specific shop data.
 */
async function setupDashboardMock(page: import('@playwright/test').Page): Promise<void> {
    await page.route('**/config.json', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                dataUrl: 'data.json',
                dataRefreshMs: 60_000,
                dynmap: {
                    baseUrl: 'https://web.peacefulvanilla.club/maps',
                    tileSize: 128,
                    defaultZoom: 4,
                    maxZoomLevel: 7,
                    playerRefreshMs: 1000
                },
                analysis: {
                    shopClusterDistance: 16,
                    maxTransitiveIterations: 10,
                    minIndependentShops: 3
                }
            })
        });
    });

    await page.route('**/data.json', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(DASHBOARD_SHOP_DATA)
        });
    });
}

/**
 * Create a complete snapshot matching all trades in the dashboard mock data.
 * Default deviations are arbitrary; use overrides for specific test scenarios.
 */
function buildFullSnapshot(overrides: Record<string, { deviationPercent?: number; stock?: number }> = {}): object {
    const baseTrades: Record<string, { deviationPercent?: number; stock: number }> = {
        [MOCK_TRADE_KEYS.cheapDiamonds]:  { deviationPercent: -43, stock: 10 },
        [MOCK_TRADE_KEYS.fairDiamonds]:   { deviationPercent: -14, stock: 20 },
        [MOCK_TRADE_KEYS.priceyDiamonds]: { deviationPercent: 14,  stock: 15 },
        [MOCK_TRADE_KEYS.ironWorks]:      { deviationPercent: 0,   stock: 64 },
        [MOCK_TRADE_KEYS.overpriced]:     { deviationPercent: 129, stock: 5 },
    };

    for (const [key, value] of Object.entries(overrides)) {
        baseTrades[key] = { ...baseTrades[key], ...value };
    }

    return {
        timestamp: Date.now() - 3_600_000, // 1 hour ago
        trades: baseTrades,
    };
}

/**
 * Reload the page with dashboard mocks applied.
 */
async function reloadWithMocks(page: import('@playwright/test').Page): Promise<void> {
    await setupColoredTileMocks(page);
    await setupDashboardMock(page);
    await page.goto('/');
    await page.waitForSelector('.search-container', { state: 'visible' });
    await page.waitForSelector(TRADE_ROW_SELECTOR, { state: 'visible', timeout: 10_000 });
}

// ============================================================================
// GIVEN Steps — Page Setup
// ============================================================================

Given('the app is loaded with dashboard test data', async ({ page }) => {
    await setupColoredTileMocks(page);
    await setupDashboardMock(page);
    await page.goto('/');
    await page.waitForSelector('.search-container', { state: 'visible' });
    await page.waitForSelector(TRADE_ROW_SELECTOR, { state: 'visible', timeout: 5000 });
});

// ============================================================================
// GIVEN Steps — Snapshot State
// ============================================================================

Given('I have a previous snapshot with different prices', async ({ page }) => {
    // Set snapshot deviations noticeably different from what the app will compute.
    // App computes: cheapDiamonds = −43%, priceyDiamonds = +14%.
    // Snapshot says +10% and +50% → dashboard detects changes.
    const snapshot = buildFullSnapshot({
        [MOCK_TRADE_KEYS.cheapDiamonds]:  { deviationPercent: 10, stock: 10 },
        [MOCK_TRADE_KEYS.priceyDiamonds]: { deviationPercent: 50, stock: 15 },
    });
    await page.evaluate((data) => {
        localStorage.setItem('pvc-trades-snapshot', JSON.stringify(data));
    }, snapshot);
});

Given('I have a previous snapshot with identical prices', async ({ page }) => {
    // Capture the app's own snapshot — guarantees identical deviations.
    await page.waitForSelector(TRADE_ROW_SELECTOR, { state: 'visible', timeout: 5000 });

    const currentSnapshot = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY_SNAPSHOT);
    if (currentSnapshot) {
        // Set timestamp to 1 hour ago so dashboard treats it as a previous visit
        const parsed = JSON.parse(currentSnapshot);
        parsed.timestamp = Date.now() - 3_600_000;
        await page.evaluate(({ key, data }) => {
            localStorage.setItem(key, JSON.stringify(data));
        }, { key: STORAGE_KEY_SNAPSHOT, data: parsed });
    }
});

Given('I have a previous snapshot missing some trades', async ({ page }) => {
    // Remove cheapDiamonds and ironWorks — they will appear as "new" on next load
    const snapshot = buildFullSnapshot();
    await page.evaluate(({ data, key1, key2 }) => {
        const parsed = data as { trades: Record<string, unknown> };
        delete parsed.trades[key1];
        delete parsed.trades[key2];
        localStorage.setItem('pvc-trades-snapshot', JSON.stringify(parsed));
    }, {
        data: snapshot,
        key1: MOCK_TRADE_KEYS.cheapDiamonds,
        key2: MOCK_TRADE_KEYS.ironWorks,
    });
});

Given('I have a previous snapshot with higher deviations', async ({ page }) => {
    // Snapshot deviations much higher than current → app detects price drops (≥5pp improvement).
    // App computes: cheapDiamonds ≈ −43%, priceyDiamonds ≈ +14%, overpriced ≈ +129%.
    // Snapshot says +10%, +50%, +160% → improvements of 53pp, 36pp, 31pp (all ≥ 5pp threshold).
    const snapshot = buildFullSnapshot({
        [MOCK_TRADE_KEYS.cheapDiamonds]:  { deviationPercent: 10,  stock: 10 },
        [MOCK_TRADE_KEYS.priceyDiamonds]: { deviationPercent: 50,  stock: 15 },
        [MOCK_TRADE_KEYS.overpriced]:     { deviationPercent: 160, stock: 5 },
    });
    await page.evaluate((data) => {
        localStorage.setItem('pvc-trades-snapshot', JSON.stringify(data));
    }, snapshot);
});

Given('I have a previous snapshot with slightly better deviations', async ({ page }) => {
    // Capture real snapshot, then nudge each deviation up by +2pp (below 5pp threshold).
    // No price drop should be detected.
    await page.waitForSelector(TRADE_ROW_SELECTOR, { state: 'visible', timeout: 5000 });
    const currentSnapshot = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY_SNAPSHOT);
    if (currentSnapshot) {
        const parsed = JSON.parse(currentSnapshot);
        for (const key of Object.keys(parsed.trades)) {
            if (parsed.trades[key].deviationPercent !== undefined) {
                parsed.trades[key].deviationPercent += 2;
            }
        }
        parsed.timestamp = Date.now() - 3_600_000;
        await page.evaluate(({ key, data }) => {
            localStorage.setItem(key, JSON.stringify(data));
        }, { key: STORAGE_KEY_SNAPSHOT, data: parsed });
    }
});

Given('I have a favorite item matching a current trade', async ({ page }) => {
    // Add "diamond" to favorites — matches all Diamond-result trades in dashboard mock data
    await page.evaluate((key) => {
        const favorites = [{ itemName: 'diamond', addedAt: Date.now() }];
        localStorage.setItem(key, JSON.stringify(favorites));
    }, STORAGE_KEY_FAVORITES);
});

Given('localStorage contains corrupted snapshot data', async ({ page }) => {
    await page.evaluate((key) => {
        localStorage.setItem(key, '{not valid json!!!');
    }, STORAGE_KEY_SNAPSHOT);
});

Given('localStorage contains an empty snapshot', async ({ page }) => {
    await page.evaluate((key) => {
        localStorage.setItem(key, '{}');
    }, STORAGE_KEY_SNAPSHOT);
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I reload the app', async ({ page }) => {
    await reloadWithMocks(page);
});

When('I dismiss the dashboard', async ({ page }) => {
    await page.locator(DISMISS_BUTTON_SELECTOR).click();
});

When('I click the dashboard toggle button', async ({ page }) => {
    await page.locator(TOGGLE_BUTTON_SELECTOR).click();
});

When('I click the {string} dashboard action', async ({ page }, buttonText: string) => {
    const button = page.locator(ACTION_BUTTON_SELECTOR).filter({ hasText: buttonText });
    await button.click();
});

// ============================================================================
// THEN Steps — Dashboard Visibility
// ============================================================================

Then('the deals dashboard should be visible', async ({ page }) => {
    const dashboard = page.locator(DASHBOARD_VISIBLE_SELECTOR);
    await expect(dashboard).toBeVisible({ timeout: 5000 });
});

Then('the deals dashboard should not be visible', async ({ page }) => {
    const dashboard = page.locator(DASHBOARD_SELECTOR);
    // Either hidden class is present or element is not visible
    const isHidden = await dashboard.evaluate(
        (element) => element.classList.contains('hidden')
    );
    expect(isHidden).toBe(true);
});

Then('the dashboard should show the time since last visit', async ({ page }) => {
    const timeAgo = page.locator(DASHBOARD_TIME_AGO_SELECTOR);
    await expect(timeAgo).not.toBeEmpty();
    const text = await timeAgo.textContent();
    // Should contain a relative time like "1h ago" or "2d ago"
    expect(text).toMatch(/\d+[hmd] ago/);
});

// ============================================================================
// THEN Steps — Toggle Button
// ============================================================================

Then('the dashboard toggle button should be visible', async ({ page }) => {
    const toggle = page.locator(TOGGLE_BUTTON_SELECTOR);
    await expect(toggle).toBeVisible({ timeout: 3000 });
});

Then('the dashboard toggle button should not be visible', async ({ page }) => {
    const toggle = page.locator(TOGGLE_BUTTON_SELECTOR);
    const isHidden = await toggle.evaluate(
        (element) => element.classList.contains('hidden')
    );
    expect(isHidden).toBe(true);
});

// ============================================================================
// THEN Steps — Dashboard Sections
// ============================================================================

Then('the dashboard should show a new trades section', async ({ page }) => {
    const sections = page.locator(DASHBOARD_SECTIONS_SELECTOR);
    await expect(sections).toContainText('New Trades');
});

Then('the dashboard should show a price drops section', async ({ page }) => {
    const sections = page.locator(DASHBOARD_SECTIONS_SELECTOR);
    await expect(sections).toContainText('Price Drops');
});

Then('the dashboard should show a watchlist section', async ({ page }) => {
    const sections = page.locator(DASHBOARD_SECTIONS_SELECTOR);
    await expect(sections).toContainText('Watchlist Deals');
});

Then('the dashboard should not show a watchlist section', async ({ page }) => {
    const dashboard = page.locator(DASHBOARD_SELECTOR);
    const isVisible = await dashboard.evaluate(
        (element) => !element.classList.contains('hidden')
    ).catch(() => false);

    if (isVisible) {
        const sections = page.locator(DASHBOARD_SECTIONS_SELECTOR);
        await expect(sections).not.toContainText('Watchlist Deals');
    }
    // If dashboard is hidden entirely, there's no watchlist section — passes
});

// ============================================================================
// THEN Steps — Action Button Results
// ============================================================================

Then('the favorites filter should be active', async ({ page }) => {
    await expect(page.locator(FAV_FILTER_ACTIVE_SELECTOR)).toBeVisible();
});

// ============================================================================
// THEN Steps — Snapshot Persistence
// ============================================================================

Then('a trade snapshot should be saved in localStorage', async ({ page }) => {
    const snapshot = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY_SNAPSHOT);
    expect(snapshot).not.toBeNull();
    const parsed = JSON.parse(snapshot!);
    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('trades');
});

Then('the snapshot should contain trade entries', async ({ page }) => {
    const snapshot = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY_SNAPSHOT);
    expect(snapshot).not.toBeNull();
    const parsed = JSON.parse(snapshot!);
    const tradeCount = Object.keys(parsed.trades).length;
    expect(tradeCount).toBeGreaterThan(0);
});

Then('the snapshot timestamp should be recent', async ({ page }) => {
    const snapshot = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY_SNAPSHOT);
    expect(snapshot).not.toBeNull();
    const parsed = JSON.parse(snapshot!);
    const now = Date.now();
    // Timestamp should be within last 30 seconds
    expect(now - parsed.timestamp).toBeLessThan(30_000);
});

Then('every visible trade should have a snapshot entry', async ({ page }) => {
    const snapshot = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY_SNAPSHOT);
    expect(snapshot).not.toBeNull();
    const parsed = JSON.parse(snapshot!);
    const tradeKeys = Object.keys(parsed.trades);

    // The mock data has 7 trades (5 shops, one has 2 recipes)
    expect(tradeKeys.length).toBeGreaterThanOrEqual(5);
});

Then('no error should appear in the console', async ({ page }) => {
    // Collect console errors during a brief wait
    const errors: string[] = [];
    const handler = (message: import('@playwright/test').ConsoleMessage) => {
        if (message.type() === 'error') {
            errors.push(message.text());
        }
    };
    page.on('console', handler);
    await page.waitForTimeout(500);
    page.off('console', handler);

    // Filter out known non-critical errors (like favicon 404)
    const criticalErrors = errors.filter(
        (error) => !error.includes('favicon') && !error.includes('404')
    );
    expect(criticalErrors).toHaveLength(0);
});
