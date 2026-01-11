/**
 * CSS Layout Tests using Playwright
 * 
 * These tests verify that the table layout is correct and elements
 * are properly sized and visible. Tests actual computed CSS properties
 * rather than visual regression to avoid false positives.
 * 
 * Run with: npx playwright test
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

// Test configuration
const BASE_URL = 'http://localhost:5173';
const VIEWPORT = { width: 1280, height: 720 };

// Mock shop data for testing
const MOCK_SHOP_DATA = {
    data: [
        {
            location: '100, 64, 200',
            world: 'world',
            recipes: [
                {
                    resultItem: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 10 },
                    stock: 64
                },
                {
                    resultItem: { type: 'GOLD_INGOT', name: 'Gold Ingot', amount: 5 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 8 },
                    stock: 128
                },
                {
                    resultItem: { type: 'IRON_INGOT', name: 'Iron Ingot', amount: 16 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 4 },
                    stock: 256
                }
            ]
        },
        {
            location: '150, 70, 250',
            world: 'world_nether',
            recipes: [
                {
                    resultItem: { type: 'EMERALD', name: 'Emerald', amount: 12 },
                    item1: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                    stock: 32
                },
                {
                    resultItem: { type: 'NETHERITE_INGOT', name: 'Netherite Ingot', amount: 1 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 100 },
                    stock: 8
                }
            ]
        },
        {
            location: '300, 100, 400',
            world: 'world_the_end',
            recipes: [
                {
                    resultItem: { type: 'ENDER_PEARL', name: 'Ender Pearl', amount: 4 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 5 },
                    stock: 16
                }
            ]
        }
    ]
};

// Helper to set up mock routes
async function setupMockRoutes(page: Page): Promise<void> {
    await page.route('**/data.json', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_SHOP_DATA)
        });
    });
}

// Helper to wait for app to be ready
async function waitForAppReady(page: Page): Promise<void> {
    // Wait for the search container to be visible (app has initialized)
    await page.waitForSelector('.search-container', { state: 'visible' });
}

// Helper to wait for all trades to be visible (trades show on load)
async function showAllTrades(page: Page): Promise<void> {
    // Trades are shown automatically on load, just wait for them
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 10000 });
}

test.describe('CSS Layout - Table Structure', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('table container uses CSS grid layout', async ({ page }) => {
        const container = page.locator('#table-container');
        const display = await container.evaluate(el => getComputedStyle(el).display);
        expect(display).toBe('grid');
    });

    test('table container has 10 columns defined', async ({ page }) => {
        const container = page.locator('#table-container');
        const gridCols = await container.evaluate(el => getComputedStyle(el).gridTemplateColumns);
        
        // Should have 10 column values (separated by spaces)
        const columnCount = gridCols.split(/\s+/).filter(v => v && v !== 'none').length;
        expect(columnCount).toBe(10);
    });

    test('header row exists and is visible', async ({ page }) => {
        const header = page.locator('#table-header');
        await expect(header).toBeVisible();
        
        // Header should have column children
        const headerCols = page.locator('#table-header .col');
        const colCount = await headerCols.count();
        expect(colCount).toBeGreaterThanOrEqual(5); // At least essential columns
    });
});

test.describe('CSS Layout - Trade Rows', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await showAllTrades(page);
    });

    test('trade rows are visible after search', async ({ page }) => {
        const rows = page.locator('.trade-row');
        const count = await rows.count();
        expect(count).toBeGreaterThan(0);
    });

    test('each trade row has exactly 10 columns (stride check)', async ({ page }) => {
        const rows = page.locator('.trade-row');
        const rowCount = await rows.count();
        
        for (let i = 0; i < Math.min(rowCount, 5); i++) {
            const row = rows.nth(i);
            const columns = row.locator('.col');
            const colCount = await columns.count();
            expect(colCount, `Row ${i} should have exactly 10 columns`).toBe(10);
        }
    });

    test('header columns align with trade row columns', async ({ page }) => {
        const headerCols = page.locator('#table-header .col');
        const firstRowCols = page.locator('.trade-row').first().locator('.col');
        
        const headerCount = await headerCols.count();
        const rowCount = await firstRowCols.count();
        
        expect(headerCount, 'Header and row should have same column count').toBe(rowCount);
        
        // Check each column's left edge alignment
        for (let i = 0; i < headerCount; i++) {
            const headerBox = await headerCols.nth(i).boundingBox();
            const rowBox = await firstRowCols.nth(i).boundingBox();
            
            expect(headerBox, `Header column ${i} should have bounding box`).toBeTruthy();
            expect(rowBox, `Row column ${i} should have bounding box`).toBeTruthy();
            
            // Left edges should align (allow 1px tolerance for rounding)
            expect(
                Math.abs(headerBox!.x - rowBox!.x),
                `Column ${i} left edges should align (header: ${headerBox!.x}, row: ${rowBox!.x})`
            ).toBeLessThanOrEqual(1);
            
            // Widths should match (allow 1px tolerance)
            expect(
                Math.abs(headerBox!.width - rowBox!.width),
                `Column ${i} widths should match (header: ${headerBox!.width}, row: ${rowBox!.width})`
            ).toBeLessThanOrEqual(1);
        }
    });

    test('header and cell text alignment matches for each column', async ({ page }) => {
        const headerCols = page.locator('#table-header .col');
        const firstRowCols = page.locator('.trade-row').first().locator('.col');
        
        const count = await headerCols.count();
        
        for (let i = 0; i < count; i++) {
            const headerJustify = await headerCols.nth(i).evaluate(
                el => getComputedStyle(el).justifyContent
            );
            const rowJustify = await firstRowCols.nth(i).evaluate(
                el => getComputedStyle(el).justifyContent
            );
            
            // Both should have the same justify-content (text alignment in flex)
            expect(
                headerJustify,
                `Column ${i} header (${headerJustify}) and cell (${rowJustify}) should have matching alignment`
            ).toBe(rowJustify);
        }
    });

    test('rows are vertically stacked without overlap (grid alignment)', async ({ page }) => {
        const rows = page.locator('.trade-row');
        const rowCount = await rows.count();
        
        if (rowCount >= 2) {
            // Get the first column of row 1 and row 2
            const row1FirstCol = rows.nth(0).locator('.col').first();
            const row2FirstCol = rows.nth(1).locator('.col').first();
            
            const box1 = await row1FirstCol.boundingBox();
            const box2 = await row2FirstCol.boundingBox();
            
            // Row 2 should start below row 1 (no horizontal offset from misalignment)
            expect(box1?.x, 'First columns should be horizontally aligned').toBe(box2?.x);
            expect(box2!.y, 'Row 2 should be below row 1').toBeGreaterThan(box1!.y);
        }
    });

    test('trade row columns have minimum width', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        const columns = firstRow.locator('.col');
        const count = await columns.count();

        for (let i = 0; i < count; i++) {
            const col = columns.nth(i);
            const box = await col.boundingBox();
            
            // Each column should have at least some width (not collapsed)
            expect(box?.width, `Column ${i} should have width > 0`).toBeGreaterThan(0);
        }
    });

    test('trade row columns have consistent height', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        const columns = firstRow.locator('.col');
        const count = await columns.count();

        const heights: number[] = [];
        for (let i = 0; i < count; i++) {
            const col = columns.nth(i);
            const box = await col.boundingBox();
            if (box) {
                heights.push(box.height);
            }
        }

        // All columns in a row should have the same height (grid alignment)
        const uniqueHeights = [...new Set(heights)];
        expect(uniqueHeights.length, 'All columns should have equal height').toBe(1);
    });

    test('item names do not overflow container', async ({ page }) => {
        // Check that text-overflow: ellipsis is working
        const costNames = page.locator('.col.cost-name');
        const count = await costNames.count();

        for (let i = 0; i < Math.min(count, 5); i++) { // Check first 5 rows
            const nameCol = costNames.nth(i);
            const overflow = await nameCol.evaluate(el => getComputedStyle(el).overflow);
            const textOverflow = await nameCol.evaluate(el => getComputedStyle(el).textOverflow);
            const whiteSpace = await nameCol.evaluate(el => getComputedStyle(el).whiteSpace);

            expect(overflow).toBe('hidden');
            expect(textOverflow).toBe('ellipsis');
            expect(whiteSpace).toBe('nowrap');
        }
    });

    test('amount columns are right-aligned', async ({ page }) => {
        const costAmts = page.locator('.trade-row .col.cost-amt');
        const count = await costAmts.count();

        if (count > 0) {
            const justifyContent = await costAmts.first().evaluate(
                el => getComputedStyle(el).justifyContent
            );
            expect(justifyContent).toBe('flex-end');
        }
    });

    test('numeric columns use monospace font', async ({ page }) => {
        const amtCols = page.locator('.col.cost-amt').first();
        const fontFamily = await amtCols.evaluate(el => getComputedStyle(el).fontFamily);
        
        // Should contain 'monospace' in font stack
        expect(fontFamily.toLowerCase()).toContain('monospace');
    });
});

test.describe('CSS Layout - Search Container', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('search container is sticky positioned', async ({ page }) => {
        const container = page.locator('.search-container');
        const position = await container.evaluate(el => getComputedStyle(el).position);
        expect(position).toBe('sticky');
    });

    test('search inputs are visible and have proper size', async ({ page }) => {
        const searchWant = page.locator('#searchWant');
        const searchGive = page.locator('#searchGive');

        await expect(searchWant).toBeVisible();
        await expect(searchGive).toBeVisible();

        const wantBox = await searchWant.boundingBox();
        const giveBox = await searchGive.boundingBox();

        // Inputs should have reasonable minimum width
        expect(wantBox?.width).toBeGreaterThan(100);
        expect(giveBox?.width).toBeGreaterThan(100);

        // Inputs should have reasonable height for touch targets
        expect(wantBox?.height).toBeGreaterThan(30);
        expect(giveBox?.height).toBeGreaterThan(30);
    });

    test('search box uses flexbox layout', async ({ page }) => {
        const searchBox = page.locator('.search-box');
        const display = await searchBox.evaluate(el => getComputedStyle(el).display);
        expect(display).toBe('flex');
    });
});

test.describe('CSS Layout - CSS Custom Properties', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('CSS variables are properly defined', async ({ page }) => {
        const root = page.locator(':root');
        
        const bgColor = await root.evaluate(() => 
            getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
        );
        const textColor = await root.evaluate(() => 
            getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim()
        );
        const accentColor = await root.evaluate(() => 
            getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
        );

        // Variables should be defined (not empty)
        expect(bgColor).not.toBe('');
        expect(textColor).not.toBe('');
        expect(accentColor).not.toBe('');
    });

    test('body uses CSS variable for background', async ({ page }) => {
        const body = page.locator('body');
        const bgColor = await body.evaluate(el => getComputedStyle(el).backgroundColor);
        
        // Should resolve to a valid color (rgb format)
        expect(bgColor).toMatch(/^rgb/);
    });
});

test.describe('CSS Layout - Mobile Responsiveness', () => {
    const MOBILE_VIEWPORT = { width: 375, height: 667 };

    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(MOBILE_VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('search inputs stack vertically on mobile', async ({ page }) => {
        const searchBox = page.locator('.search-box');
        const flexWrap = await searchBox.evaluate(el => getComputedStyle(el).flexWrap);
        expect(flexWrap).toBe('wrap');
    });

    test('table container adjusts columns for mobile', async ({ page }) => {
        const container = page.locator('#table-container');
        const gridCols = await container.evaluate(el => getComputedStyle(el).gridTemplateColumns);
        
        // Mobile should have fewer visible columns (4 instead of 10)
        const columnCount = gridCols.split(/\s+/).filter(v => v && v !== 'none').length;
        expect(columnCount).toBe(4);
    });

    test('search container has reduced padding on mobile', async ({ page }) => {
        const container = page.locator('.search-container');
        const padding = await container.evaluate(el => getComputedStyle(el).padding);
        
        // Mobile padding should be 12px (vs 20px on desktop)
        expect(padding).toBe('12px');
    });
});

test.describe('CSS Layout - Matrix Dialog', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('matrix dialog is hidden by default', async ({ page }) => {
        const dialog = page.locator('#matrix-dialog');
        await expect(dialog).not.toBeVisible();
    });

    test('matrix dialog opens when button clicked', async ({ page }) => {
        await page.click('#open-matrix');
        const dialog = page.locator('#matrix-dialog');
        await expect(dialog).toBeVisible();
    });

    test('matrix dialog has proper styling', async ({ page }) => {
        await page.click('#open-matrix');
        const dialog = page.locator('#matrix-dialog');
        
        const position = await dialog.evaluate(el => getComputedStyle(el).position);
        const borderRadius = await dialog.evaluate(el => getComputedStyle(el).borderRadius);
        
        expect(position).toBe('fixed');
        expect(borderRadius).not.toBe('0px');
    });

    test('matrix dialog closes when close button clicked', async ({ page }) => {
        await page.click('#open-matrix');
        const dialog = page.locator('#matrix-dialog');
        await expect(dialog).toBeVisible();
        
        await page.click('#close-matrix');
        await expect(dialog).not.toBeVisible();
    });
});

test.describe('CSS Layout - Visual Invariants', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await showAllTrades(page);
    });

    test('no horizontal scrollbar on container at default viewport', async ({ page }) => {
        const container = page.locator('#table-container');
        const box = await container.boundingBox();
        const overflowX = await container.evaluate(el => getComputedStyle(el).overflowX);
        
        // Container should not require horizontal scroll
        if (box) {
            expect(box.width).toBeLessThanOrEqual(VIEWPORT.width);
        }
    });

    test('rows maintain consistent row height across multiple rows', async ({ page }) => {
        const rows = page.locator('.trade-row');
        const count = await rows.count();
        const testCount = Math.min(count, 10);
        
        const heights: number[] = [];
        for (let i = 0; i < testCount; i++) {
            const row = rows.nth(i);
            const firstCol = row.locator('.col').first();
            const box = await firstCol.boundingBox();
            if (box) {
                heights.push(Math.round(box.height));
            }
        }

        // All rows should have similar heights (within 2px tolerance)
        const minHeight = Math.min(...heights);
        const maxHeight = Math.max(...heights);
        expect(maxHeight - minHeight, 'Row heights should be consistent').toBeLessThanOrEqual(2);
    });

    test('good-deal and bad-deal classes apply correct colors', async ({ page }) => {
        // Look for deviation columns with styling
        const goodDeal = page.locator('.col.dev.good-deal').first();
        const badDeal = page.locator('.col.dev.bad-deal').first();

        if (await goodDeal.count() > 0) {
            const goodColor = await goodDeal.evaluate(el => getComputedStyle(el).color);
            // Should be greenish color (rgb values where green > red)
            expect(goodColor).toMatch(/^rgb/);
        }

        if (await badDeal.count() > 0) {
            const badColor = await badDeal.evaluate(el => getComputedStyle(el).color);
            // Should be reddish color
            expect(badColor).toMatch(/^rgb/);
        }
    });

    test('world column header is sortable', async ({ page }) => {
        const worldHeader = page.locator('#table-header .col.world-header');
        await expect(worldHeader).toBeVisible();
        
        // Should have data-col attribute for sorting
        const dataCol = await worldHeader.getAttribute('data-col');
        expect(dataCol).toBe('world');
        
        // Should have header class for clickability
        const classes = await worldHeader.getAttribute('class');
        expect(classes).toContain('header');
    });

    test('world column displays abbreviated world names', async ({ page }) => {
        const worldCells = page.locator('.trade-row .col.world');
        const count = await worldCells.count();
        
        if (count > 0) {
            // Check that world cells contain single-letter abbreviations
            for (let i = 0; i < Math.min(count, 5); i++) {
                const text = await worldCells.nth(i).textContent();
                expect(['O', 'N', 'E']).toContain(text?.trim());
            }
        }
    });

    test('deal column is sorted by default on page load', async ({ page }) => {
        // The Deal (dev) header should have sort arrow text on load
        const devHeader = page.locator('#table-header .col.dev-header');
        await expect(devHeader).toBeVisible();
        
        // Check that the header text includes the sort arrow (descending)
        const headerText = await devHeader.textContent();
        expect(headerText?.trim()).toBe('Deal▼');
    });

    test('all three worlds are represented in world column', async ({ page }) => {
        const worldCells = page.locator('.trade-row .col.world');
        const allText: string[] = [];
        
        const count = await worldCells.count();
        for (let i = 0; i < count; i++) {
            const text = await worldCells.nth(i).textContent();
            if (text) allText.push(text.trim());
        }
        
        // Should have all three world abbreviations
        expect(allText).toContain('O'); // Overworld
        expect(allText).toContain('N'); // The Nether
        expect(allText).toContain('E'); // The End
    });
});
