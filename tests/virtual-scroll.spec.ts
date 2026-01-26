/**
 * Virtual Scrolling Tests using Playwright
 * 
 * These tests verify that the virtual scroller is working correctly:
 * - Only visible rows are rendered in the DOM
 * - Scrolling renders new rows dynamically
 * - Search updates the virtual scroller correctly
 * - Layout and alignment remain correct with virtual scrolling
 * 
 * Run with: npx playwright test virtual-scroll.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

// Test configuration
const BASE_URL = 'http://localhost:5173';
const VIEWPORT = { width: 1280, height: 720 };

// Generate a large mock dataset to test virtualization
function generateLargeMockData(count: number) {
    const shops = [];
    for (let index = 0; index < count; index++) {
        // Determine world type based on index
        let worldType = 'world';
        if (index % 3 === 0) {
            worldType = 'world_nether';
        } else if (index % 3 === 1) {
            worldType = 'world_the_end';
        }

        shops.push({
            location: `${index * 10}.0, 69.0, ${index * 5}.0`,
            world: worldType,
            recipes: [
                {
                    resultItem: { type: 'DIAMOND', name: 'Diamond', amount: (index % 10) + 1 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: ((index % 20) + 1) * 2 },
                    stock: (index % 100) + 1
                }
            ]
        });
    }
    return { data: shops };
}

// 500 trades should be enough to test virtualization
const LARGE_MOCK_DATA = generateLargeMockData(500);

// Helper to set up mock routes with large dataset
async function setupLargeMockRoutes(page: Page): Promise<void> {
    // Mock config.json to prevent fetching from Cloudflare Worker
    await page.route('**/config.json', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                dataUrl: 'data.json',
                dataRefreshMs: 60_000, // Must be > 0 to pass Zod validation
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

    await page.route('**/data.json', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(LARGE_MOCK_DATA)
        });
    });
}

// Helper to wait for app to be ready
async function waitForAppReady(page: Page): Promise<void> {
    await page.waitForSelector('.search-container', { state: 'visible' });
    // Wait for trades to render
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 10_000 });
}

test.describe('Virtual Scrolling - DOM Efficiency', () => {
    test.beforeEach(async ({ page }) => {
        await setupLargeMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('renders fewer rows than total data count (virtualization active)', async ({ page }) => {
        const rows = page.locator('.trade-row');
        const renderedCount = await rows.count();
        
        // With 500 items and a 720px viewport, should render far fewer rows
        // Typically around 20-50 visible rows depending on row height
        expect(renderedCount, 'Should render fewer rows than total data').toBeLessThan(500);
        expect(renderedCount, 'Should render at least some rows').toBeGreaterThan(5);
    });

    test('results container has padding for virtual scroll space', async ({ page }) => {
        const results = page.locator('#results');
        
        // Virtual scroller adds padding-top and padding-bottom to simulate scroll space
        const paddingBottom = await results.evaluate(element => {
            const style = getComputedStyle(element);
            return Number.parseInt(style.paddingBottom, 10);
        });
        
        // With 500 items, there should be significant padding for off-screen items
        expect(paddingBottom, 'Should have padding-bottom for virtual scroll space').toBeGreaterThan(0);
    });

    test('scrolling down renders new rows', async ({ page }) => {
        // Get initial first row's data
        const getFirstRowData = async () => {
            const firstRow = page.locator('.trade-row').first();
            return {
                x: await firstRow.getAttribute('data-x'),
                y: await firstRow.getAttribute('data-y'),
                z: await firstRow.getAttribute('data-z')
            };
        };

        const initialData = await getFirstRowData();

        // Scroll down significantly
        await page.evaluate(() => {
            window.scrollBy(0, 2000);
        });

        // Wait for virtual scroller to update
        await page.waitForTimeout(200);

        // First visible row should now be different
        const afterScrollData = await getFirstRowData();
        
        // At least one coordinate should be different (we scrolled to different rows)
        const isDifferent = 
            initialData.x !== afterScrollData.x ||
            initialData.y !== afterScrollData.y ||
            initialData.z !== afterScrollData.z;
        
        expect(isDifferent, 'First visible row should change after scrolling').toBe(true);
    });

    test('scrolling back up restores previous rows', async ({ page }) => {
        // Get initial first row's data
        const getFirstRowData = async () => {
            const firstRow = page.locator('.trade-row').first();
            return await firstRow.getAttribute('data-x');
        };

        const initialX = await getFirstRowData();

        // Scroll down
        await page.evaluate(() => window.scrollBy(0, 2000));
        await page.waitForTimeout(200);

        // Scroll back up
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);

        // First row should be back to original
        const afterScrollBackX = await getFirstRowData();
        expect(afterScrollBackX, 'First row should be restored after scrolling back').toBe(initialX);
    });

    test('row count stays reasonable during scroll', async ({ page }) => {
        const getRowCount = () => page.locator('.trade-row').count();

        const initialCount = await getRowCount();

        // Scroll to middle
        await page.evaluate(() => window.scrollBy(0, 5000));
        await page.waitForTimeout(200);
        const middleCount = await getRowCount();

        // Scroll to near bottom
        await page.evaluate(() => window.scrollBy(0, 10_000));
        await page.waitForTimeout(200);
        const bottomCount = await getRowCount();

        // Row count should stay within a reasonable range (not grow unbounded)
        const maxExpected = 100; // Virtual scroller should never render more than ~100 rows
        
        expect(initialCount, 'Initial row count should be reasonable').toBeLessThan(maxExpected);
        expect(middleCount, 'Middle scroll row count should be reasonable').toBeLessThan(maxExpected);
        expect(bottomCount, 'Bottom scroll row count should be reasonable').toBeLessThan(maxExpected);
    });
});

test.describe('Virtual Scrolling - Search Integration', () => {
    test.beforeEach(async ({ page }) => {
        await setupLargeMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('search filters virtual scroller results', async ({ page }) => {
        // Search for specific term that won't match all
        await page.fill('#searchWant', 'diamond');
        await page.waitForTimeout(100); // Debounce

        const filteredCount = await page.locator('.trade-row').count();
        
        // All our mock data has Diamond, so count should be similar
        // but let's verify search works
        expect(filteredCount).toBeGreaterThan(0);
    });

    test('clearing search restores virtual scroller', async ({ page }) => {
        // Search for something
        await page.fill('#searchWant', 'diamond');
        await page.waitForTimeout(100);

        // Clear search
        await page.fill('#searchWant', '');
        await page.waitForTimeout(100);

        // Should still have results and virtual scrolling should work
        const count = await page.locator('.trade-row').count();
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThan(500); // Still virtualized
    });

    test('search with no results shows empty message', async ({ page }) => {
        // Search for something that doesn't exist
        await page.fill('#searchWant', 'xyznonexistent123');
        await page.waitForTimeout(100);

        // Should show no results message
        const noResults = page.locator('.no-results');
        await expect(noResults).toBeVisible();
        
        // Should have no trade rows
        const rowCount = await page.locator('.trade-row').count();
        expect(rowCount).toBe(0);
    });

    test('search after scroll works correctly', async ({ page }) => {
        // Scroll down first
        await page.evaluate(() => window.scrollBy(0, 2000));
        await page.waitForTimeout(200);

        // Now search - virtual scroller should update with filtered results
        await page.fill('#searchWant', 'diamond');
        await page.waitForTimeout(100);

        // Rows should be visible (all our mock data has Diamond)
        const rowCount = await page.locator('.trade-row').count();
        expect(rowCount).toBeGreaterThan(0);
    });
});

test.describe('Virtual Scrolling - Layout Integrity', () => {
    test.beforeEach(async ({ page }) => {
        await setupLargeMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('header columns align with virtual scrolled rows', async ({ page }) => {
        // Scroll down to ensure we're viewing virtualized rows
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(200);

        // Header has 10 cols (desktop + mobile distance), row has 9
        // Only visible columns should align
        const headerCols = page.locator('#table-header .col:not(.mobile-only)');
        const firstRowCols = page.locator('.trade-row').first().locator('.col, .add-to-cart-btn');

        const headerCount = await headerCols.count();
        const rowColCount = await firstRowCols.count();

        // On desktop, header has 9 visible cols (desktop-only shown, mobile-only hidden)
        expect(headerCount, 'Header should have 9 visible columns on desktop').toBe(9);
        expect(rowColCount, 'Row should have 9 columns').toBe(9);

        // Check alignment of visible columns
        for (let index = 0; index < headerCount; index++) {
            const headerCol = headerCols.nth(index);
            const rowCol = firstRowCols.nth(index);

            const headerDisplay = await headerCol.evaluate(element => getComputedStyle(element).display);
            if (headerDisplay === 'none') { continue; }

            const headerBox = await headerCol.boundingBox();
            const rowBox = await rowCol.boundingBox();

            if (headerBox && rowBox) {
                // Left edges should align (allow 2px tolerance)
                expect(
                    Math.abs(headerBox.x - rowBox.x),
                    `Column ${index} should align after scroll`
                ).toBeLessThanOrEqual(2);
            }
        }
    });

    test('row grid template matches header grid template', async ({ page }) => {
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(200);

        const header = page.locator('#table-header');
        const firstRow = page.locator('.trade-row').first();

        const headerGrid = await header.evaluate(element => getComputedStyle(element).gridTemplateColumns);
        const rowGrid = await firstRow.evaluate(element => getComputedStyle(element).gridTemplateColumns);

        // Both should have the same column definition
        expect(headerGrid).toBe(rowGrid);
    });

    test('trade rows maintain consistent height during scroll', async ({ page }) => {
        const measureRowHeights = async () => {
            const rows = page.locator('.trade-row');
            const count = await rows.count();
            const heights: number[] = [];
            
            for (let index = 0; index < Math.min(count, 5); index++) {
                const box = await rows.nth(index).boundingBox();
                if (box) {heights.push(box.height);}
            }
            return heights;
        };

        const initialHeights = await measureRowHeights();

        // Scroll down
        await page.evaluate(() => window.scrollBy(0, 2000));
        await page.waitForTimeout(200);

        const scrolledHeights = await measureRowHeights();

        // Heights should be consistent
        const allHeights = [...initialHeights, ...scrolledHeights];
        const minHeight = Math.min(...allHeights);
        const maxHeight = Math.max(...allHeights);

        expect(
            maxHeight - minHeight,
            'Row heights should be consistent across scroll positions'
        ).toBeLessThanOrEqual(2);
    });

    test('click handlers work on virtual scrolled rows', async ({ page }) => {
        // Scroll down to get different rows
        await page.evaluate(() => window.scrollBy(0, 1500));
        await page.waitForTimeout(200);

        // Click on a trade row
        const row = page.locator('.trade-row').first();
        await row.click();

        // Map dialog should open
        const mapDialog = page.locator('#map-dialog');
        await expect(mapDialog).toBeVisible();

        // Close dialog
        await page.keyboard.press('Escape');
    });
});

test.describe('Virtual Scrolling - Performance', () => {
    test('initial render completes quickly with large dataset', async ({ page }) => {
        await setupLargeMockRoutes(page);
        await page.setViewportSize(VIEWPORT);

        const startTime = Date.now();
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        const endTime = Date.now();

        const loadTime = endTime - startTime;
        
        // Should load within 5 seconds even with 500 items
        expect(loadTime, 'Initial render should be fast').toBeLessThan(5000);
    });

    test('scroll events are handled efficiently', async ({ page }) => {
        await setupLargeMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);

        // Perform rapid scrolling
        const startTime = Date.now();
        
        for (let index = 0; index < 10; index++) {
            await page.evaluate(() => window.scrollBy(0, 500));
            await page.waitForTimeout(50);
        }
        
        const endTime = Date.now();
        const scrollTime = endTime - startTime;

        // Rapid scrolling should not cause significant lag
        // 10 scrolls with 50ms delays = 500ms minimum, allow up to 2s
        expect(scrollTime, 'Scrolling should be smooth').toBeLessThan(2000);

        // Should still have reasonable row count after rapid scroll
        const rowCount = await page.locator('.trade-row').count();
        expect(rowCount).toBeLessThan(100);
    });
});

test.describe('Virtual Scrolling - CSS Properties', () => {
    test.beforeEach(async ({ page }) => {
        await setupLargeMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('#results container is block display for virtual scroller', async ({ page }) => {
        const results = page.locator('#results');
        const display = await results.evaluate(element => getComputedStyle(element).display);
        expect(display).toBe('block');
    });

    test('#table-container is simple block without grid', async ({ page }) => {
        const container = page.locator('#table-container');
        const display = await container.evaluate(element => getComputedStyle(element).display);
        // Should be block, not grid (grid moved to header and rows individually)
        expect(display).toBe('block');
    });

    test('#table-header has its own grid layout', async ({ page }) => {
        const header = page.locator('#table-header');
        const display = await header.evaluate(element => getComputedStyle(element).display);
        expect(display).toBe('grid');
    });

    test('trade rows have grid layout', async ({ page }) => {
        const row = page.locator('.trade-row').first();
        const display = await row.evaluate(element => getComputedStyle(element).display);
        expect(display).toBe('grid');
    });

    test('body does not have overflow hidden (allows window scroll)', async ({ page }) => {
        const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
        // Should allow scrolling (visible or auto, not hidden)
        expect(overflow).not.toBe('hidden');
    });
});
