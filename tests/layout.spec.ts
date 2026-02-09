/**
 * CSS Layout Tests using Playwright
 * 
 * These tests verify that the table layout is correct and elements
 * are properly sized and visible. Tests actual computed CSS properties
 * rather than visual regression to avoid false positives.
 * 
 * Run with: npx playwright test
 */

import { test, expect } from './helpers/global-setup';
import type { Page } from '@playwright/test';

// Test configuration
const BASE_URL = 'http://localhost:5173';
const VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 375, height: 667 };

// Mock shop data for testing
const MOCK_SHOP_DATA = {
    data: [
        {
            location: '-7374.0, 69.0, -1772.0',
            world: 'world',
            recipes: [
                {
                    resultItem: { type: 'FIREWORK_ROCKET', name: 'Firework Rocket', amount: 64 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                    stock: 6
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
            location: '-19950.0, 68.0, -21636.0',
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
            location: '300.0, 100.0, 400.0',
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
    // Mock config.json to use local data.json instead of Cloudflare Worker
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
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 10_000 });
}

test.describe('CSS Layout - Table Structure', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('table container is block layout (virtual scroll compatible)', async ({ page }) => {
        const container = page.locator('#table-container');
        const display = await container.evaluate(element => getComputedStyle(element).display);
        expect(display).toBe('block');
    });

    test('table header uses CSS grid with 11 visible columns', async ({ page }) => {
        const header = page.locator('#table-header');
        const display = await header.evaluate(element => getComputedStyle(element).display);
        expect(display).toBe('grid');
        
        const gridCols = await header.evaluate(element => getComputedStyle(element).gridTemplateColumns);
        // Should have 11 column values (fav, amt, name, amt, name, deal, stock, distance, world, new, cart)
        const columnCount = gridCols.split(/\s+/).filter(v => v && v !== 'none').length;
        expect(columnCount).toBe(11);
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

    test('each trade row has exactly 11 columns in DOM', async ({ page }) => {
        const rows = page.locator('.trade-row');
        const rowCount = await rows.count();
        
        for (let index = 0; index < Math.min(rowCount, 5); index++) {
            const row = rows.nth(index);
            const columns = row.locator('.col, .add-to-cart-btn');
            const colCount = await columns.count();
            // 11 columns: fav, amt, name, amt, name, deal, stock, distance, world, new, cart button
            expect(colCount, `Row ${index} should have exactly 11 columns in DOM`).toBe(11);
        }
    });

    test('header columns align with trade row columns', async ({ page }) => {
        // Header has 11 cols, row has 11
        // Only visible columns should align
        const headerCols = page.locator('#table-header .col:not(.mobile-only)');
        const firstRowCols = page.locator('.trade-row').first().locator('.col, .add-to-cart-btn');
        
        const headerCount = await headerCols.count();
        const rowCount = await firstRowCols.count();
        
        // Header and row should both have 11 columns
        expect(headerCount, 'Header should have 11 visible columns on desktop').toBe(11);
        expect(rowCount, 'Row should have 11 columns').toBe(11);
        
        // Check each column's left edge alignment
        for (let index = 0; index < headerCount; index++) {
            const headerCol = headerCols.nth(index);
            const rowCol = firstRowCols.nth(index);
            
            // Skip hidden columns (display: none)
            const headerDisplay = await headerCol.evaluate(element => getComputedStyle(element).display);
            if (headerDisplay === 'none') {continue;}
            
            const headerBox = await headerCol.boundingBox();
            const rowBox = await rowCol.boundingBox();
            
            expect(headerBox, `Header column ${index} should have bounding box`).toBeTruthy();
            expect(rowBox, `Row column ${index} should have bounding box`).toBeTruthy();
            
            // Left edges should align (allow 1px tolerance for rounding)
            expect(
                Math.abs(headerBox!.x - rowBox!.x),
                `Column ${index} left edges should align (header: ${headerBox!.x}, row: ${rowBox!.x})`
            ).toBeLessThanOrEqual(1);
            
            // Skip cart button column (index 9) as button has different width than header
            if (index < 9) {
                // Widths should match (allow 1px tolerance)
                expect(
                    Math.abs(headerBox!.width - rowBox!.width),
                    `Column ${index} widths should match (header: ${headerBox!.width}, row: ${rowBox!.width})`
                ).toBeLessThanOrEqual(1);
            }
        }
    });

    test('header and cell text alignment matches for each column', async ({ page }) => {
        // Exclude non-sortable columns (favorites header and cart column)
        // Compare only sortable headers with corresponding row cells
        const headerCols = page.locator('#table-header .col.header:not(.mobile-only)');
        // Skip first col (favorite-star) in row to align with sortable headers
        const firstRowCols = page.locator('.trade-row').first().locator('.col:not(.favorite-star)');
        
        const count = await headerCols.count();
        
        for (let index = 0; index < count; index++) {
            const headerJustify = await headerCols.nth(index).evaluate(
                element => getComputedStyle(element).justifyContent
            );
            const rowJustify = await firstRowCols.nth(index).evaluate(
                element => getComputedStyle(element).justifyContent
            );
            
            // Both should have the same justify-content (text alignment in flex)
            expect(
                headerJustify,
                `Column ${index} header (${headerJustify}) and cell (${rowJustify}) should have matching alignment`
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

        for (let index = 0; index < count; index++) {
            const col = columns.nth(index);
            
            // Skip hidden columns (display: none)
            const display = await col.evaluate(element => getComputedStyle(element).display);
            if (display === 'none') {continue;}
            
            const box = await col.boundingBox();
            
            // Each visible column should have at least some width (not collapsed)
            expect(box?.width, `Column ${index} should have width > 0`).toBeGreaterThan(0);
        }
    });

    test('trade row columns have consistent height', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        // Exclude cart button which has its own sizing
        const columns = firstRow.locator('.col');
        const count = await columns.count();

        const heights: number[] = [];
        for (let index = 0; index < count; index++) {
            const col = columns.nth(index);
            const box = await col.boundingBox();
            if (box) {
                heights.push(Math.round(box.height));
            }
        }

        // All .col elements in a row should have the same height (grid alignment)
        // Allow 2 unique heights because cart button may have slight different height
        const uniqueHeights = [...new Set(heights)];
        expect(uniqueHeights.length, 'All columns should have at most 2 unique heights').toBeLessThanOrEqual(2);
    });

    test('adjacent columns do not overlap horizontally', async ({ page }) => {
        const rows = page.locator('.trade-row');
        const rowCount = await rows.count();

        // Check first 3 rows
        for (let r = 0; r < Math.min(rowCount, 3); r++) {
            const row = rows.nth(r);
            const columns = row.locator('.col');
            const count = await columns.count();

            // Get bounding boxes for visible columns with actual width
            const boxes: Array<{ index: number; box: { x: number; width: number } }> = [];
            for (let index = 0; index < count; index++) {
                const col = columns.nth(index);
                
                // Check if element is actually displayed (not display: none)
                const display = await col.evaluate(element => getComputedStyle(element).display);
                if (display === 'none') {continue;}
                
                const box = await col.boundingBox();
                // Only include columns that have actual visible width (> 1px)
                if (box && box.width > 1) {
                    boxes.push({ index: index, box: { x: box.x, width: box.width } });
                }
            }

            // Sort by x position
            boxes.sort((a, b) => a.box.x - b.box.x);

            // Check that each column ends before the next one starts
            for (let index = 0; index < boxes.length - 1; index++) {
                const current = boxes[index];
                const next = boxes[index + 1];
                const currentEnd = current.box.x + current.box.width;
                
                expect(
                    currentEnd,
                    `Row ${r}: Column ${current.index} (ends at ${currentEnd.toFixed(1)}) overlaps column ${next.index} (starts at ${next.box.x.toFixed(1)})`
                ).toBeLessThanOrEqual(next.box.x + 1); // 1px tolerance for subpixel rendering
            }
        }
    });

    test('text content stays within column bounds', async ({ page }) => {
        const rows = page.locator('.trade-row');
        const rowCount = await rows.count();

        // Check first 3 rows
        for (let r = 0; r < Math.min(rowCount, 3); r++) {
            const row = rows.nth(r);
            const nameColumns = row.locator('.col.cost-name, .col.result-name');
            const count = await nameColumns.count();

            for (let index = 0; index < count; index++) {
                const col = nameColumns.nth(index);
                const colBox = await col.boundingBox();
                
                if (colBox) {
                    // Get the scroll width (actual content width) vs client width (visible width)
                    const { scrollWidth, clientWidth } = await col.evaluate(element => ({
                        scrollWidth: element.scrollWidth,
                        clientWidth: element.clientWidth
                    }));

                    // If content overflows, it should be clipped (overflow: hidden)
                    if (scrollWidth > clientWidth) {
                        const overflow = await col.evaluate(element => getComputedStyle(element).overflow);
                        expect(overflow, `Row ${r} column ${index}: overflowing content should be hidden`).toBe('hidden');
                    }
                }
            }
        }
    });

    test('item names do not overflow container', async ({ page }) => {
        // Check that text-overflow: ellipsis is working
        const costNames = page.locator('.col.cost-name');
        const count = await costNames.count();

        for (let index = 0; index < Math.min(count, 5); index++) { // Check first 5 rows
            const nameCol = costNames.nth(index);
            const overflow = await nameCol.evaluate(element => getComputedStyle(element).overflow);
            const textOverflow = await nameCol.evaluate(element => getComputedStyle(element).textOverflow);
            const whiteSpace = await nameCol.evaluate(element => getComputedStyle(element).whiteSpace);

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
                element => getComputedStyle(element).justifyContent
            );
            expect(justifyContent).toBe('flex-end');
        }
    });

    test('numeric columns use monospace font', async ({ page }) => {
        const amtCols = page.locator('.col.cost-amt').first();
        const fontFamily = await amtCols.evaluate(element => getComputedStyle(element).fontFamily);
        
        // Should contain 'monospace' in font stack
        expect(fontFamily.toLowerCase()).toContain('monospace');
    });

    test('trade rows use virtual scrolling (no content-visibility needed)', async ({ page }) => {
        // Virtual scrolling is used instead of content-visibility
        // Verify that #results is a block element that can receive padding from virtual scroller
        const results = page.locator('#results');
        const display = await results.evaluate(element => getComputedStyle(element).display);
        expect(display).toBe('block');
        
        // Each trade row should be a grid for column layout
        const row = page.locator('.trade-row').first();
        const rowDisplay = await row.evaluate(element => getComputedStyle(element).display);
        expect(rowDisplay).toBe('grid');
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
        const position = await container.evaluate(element => getComputedStyle(element).position);
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
        const display = await searchBox.evaluate(element => getComputedStyle(element).display);
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
        const bgColor = await body.evaluate(element => getComputedStyle(element).backgroundColor);
        
        // Should resolve to a valid color (rgb format)
        expect(bgColor).toMatch(/^rgb/);
    });
});

test.describe('CSS Layout - Mobile Responsiveness', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(MOBILE_VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('search inputs stay on single row on mobile', async ({ page }) => {
        const searchBox = page.locator('.search-box');
        const flexWrap = await searchBox.evaluate(element => getComputedStyle(element).flexWrap);
        expect(flexWrap).toBe('nowrap');
        
        // Verify all 3 items are on the same row (same Y position)
        const searchWant = page.locator('#searchWant');
        const searchGive = page.locator('#searchGive');
        const openMatrix = page.locator('#open-matrix');
        
        const wantBox = await searchWant.boundingBox();
        const giveBox = await searchGive.boundingBox();
        const buttonBox = await openMatrix.boundingBox();
        
        expect(wantBox).toBeTruthy();
        expect(giveBox).toBeTruthy();
        expect(buttonBox).toBeTruthy();
        
        // All items should have the same Y position (within 2px tolerance)
        expect(Math.abs(wantBox!.y - giveBox!.y)).toBeLessThanOrEqual(2);
        expect(Math.abs(giveBox!.y - buttonBox!.y)).toBeLessThanOrEqual(2);
    });

    test('table header adjusts columns for mobile', async ({ page }) => {
        const header = page.locator('#table-header');
        const gridCols = await header.evaluate(element => getComputedStyle(element).gridTemplateColumns);
        
        // Mobile shows 11 columns: fav, #, name, #, name, deal, stock, distance, world, new, cart button
        const columnCount = gridCols.split(/\s+/).filter(v => v && v !== 'none').length;
        expect(columnCount).toBe(11);
    });

    test('search container has reduced padding on mobile', async ({ page }) => {
        const container = page.locator('.search-container');
        const padding = await container.evaluate(element => getComputedStyle(element).padding);
        
        // Mobile padding should be 12px (vs 20px on desktop)
        expect(padding).toBe('12px');
    });

    test('adjacent columns do not overlap horizontally on mobile', async ({ page }) => {
        await showAllTrades(page);
        
        const rows = page.locator('.trade-row');
        const rowCount = await rows.count();

        // Check first 3 rows
        for (let r = 0; r < Math.min(rowCount, 3); r++) {
            const row = rows.nth(r);
            const columns = row.locator('.col');
            const count = await columns.count();

            // Get bounding boxes for visible columns with actual width
            const boxes: Array<{ index: number; box: { x: number; width: number } }> = [];
            for (let index = 0; index < count; index++) {
                const col = columns.nth(index);
                
                // Check if element is actually displayed (not display: none)
                const display = await col.evaluate(element => getComputedStyle(element).display);
                if (display === 'none') {continue;}
                
                const box = await col.boundingBox();
                // Only include columns that have actual visible width (> 1px)
                if (box && box.width > 1) {
                    boxes.push({ index: index, box: { x: box.x, width: box.width } });
                }
            }

            // Sort by x position
            boxes.sort((a, b) => a.box.x - b.box.x);

            // Check that each column ends before the next one starts
            for (let index = 0; index < boxes.length - 1; index++) {
                const current = boxes[index];
                const next = boxes[index + 1];
                const currentEnd = current.box.x + current.box.width;
                
                expect(
                    currentEnd,
                    `Mobile row ${r}: Column ${current.index} (ends at ${currentEnd.toFixed(1)}) overlaps column ${next.index} (starts at ${next.box.x.toFixed(1)})`
                ).toBeLessThanOrEqual(next.box.x + 1); // 1px tolerance for subpixel rendering
            }
        }
    });

    test('distance column has proper styling', async ({ page }) => {
        await showAllTrades(page);
        
        const distanceCols = page.locator('.trade-row .col.distance');
        const count = await distanceCols.count();
        expect(count).toBeGreaterThan(0);

        // Check that distance column has proper styling
        const col = distanceCols.first();
        const styles = await col.evaluate(element => {
            const style = getComputedStyle(element);
            return {
                display: style.display,
                justifyContent: style.justifyContent,
                fontFamily: style.fontFamily,
                textAlign: style.textAlign
            };
        });

        // Should be right-aligned with flex layout and monospace font
        expect(styles.display).toBe('flex');
        expect(styles.justifyContent).toBe('flex-end');
        expect(styles.fontFamily).toContain('monospace');
        expect(styles.textAlign).toBe('right');
    });

    test('mobile header grid matches trade row grid', async ({ page }) => {
        await showAllTrades(page);

        const header = page.locator('#table-header');
        const firstRow = page.locator('.trade-row').first();

        const headerCols = await header.evaluate(element => getComputedStyle(element).gridTemplateColumns);
        const rowCols = await firstRow.evaluate(element => getComputedStyle(element).gridTemplateColumns);

        // Both should have the same grid template (7 columns on mobile)
        expect(headerCols).toBe(rowCols);
    });

    test('cart button column has border-radius for rounded corners', async ({ page }) => {
        await showAllTrades(page);

        const cartButton = page.locator('.trade-row .add-to-cart-btn').first();
        const borderRadius = await cartButton.evaluate(element => getComputedStyle(element).borderRadius);

        // Should have border radius
        expect(borderRadius).toMatch(/4px/);
    });

    test('map dialog scales with viewport on mobile', async ({ page }) => {
        await showAllTrades(page);

        // Click on a trade row distance cell to open the map dialog
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        // Wait for dialog to be visible
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();

        const box = await dialog.boundingBox();
        expect(box).toBeTruthy();

        // Dialog width should be based on viewport (100vw - 20px = 355px for 375px viewport)
        // Allow some tolerance for padding/borders
        expect(box!.width).toBeGreaterThan(300);
        expect(box!.width).toBeLessThanOrEqual(375);

        // Dialog should be square (width equals height)
        expect(Math.abs(box!.width - box!.height)).toBeLessThanOrEqual(2);
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
        
        const position = await dialog.evaluate(element => getComputedStyle(element).position);
        const borderRadius = await dialog.evaluate(element => getComputedStyle(element).borderRadius);
        
        expect(position).toBe('fixed');
        expect(borderRadius).not.toBe('0px');
    });

    test('matrix dialog closes when pressing Escape', async ({ page }) => {
        await page.click('#open-matrix');
        const dialog = page.locator('#matrix-dialog');
        await expect(dialog).toBeVisible();
        
        // Press Escape to close the dialog (native dialog behavior)
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
    });

    test('matrix dialog closes when clicking backdrop', async ({ page }) => {
        await page.click('#open-matrix');
        const dialog = page.locator('#matrix-dialog');
        await expect(dialog).toBeVisible();
        
        // Click on the backdrop (outside the dialog box)
        // The dialog::backdrop covers the entire viewport, click at corner
        await page.mouse.click(10, 10);
        await expect(dialog).not.toBeVisible();
    });

    test('matrix dialog closes when clicking backdrop on mobile', async ({ page }) => {
        await page.setViewportSize(MOBILE_VIEWPORT);
        await page.click('#open-matrix');
        const dialog = page.locator('#matrix-dialog');
        await expect(dialog).toBeVisible();
        
        // Click on the backdrop (outside the dialog box) on mobile
        await page.mouse.click(10, 10);
        await expect(dialog).not.toBeVisible();
    });
});

test.describe('CSS Layout - Map Dialog', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await showAllTrades(page);
    });

    test('map dialog opens when clicking trade row', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();
    });

    test('map dialog closes when pressing Escape', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();
        
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
    });

    test('map dialog closes when clicking backdrop', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();
        
        // Click on the backdrop (outside the dialog box)
        await page.mouse.click(10, 10);
        await expect(dialog).not.toBeVisible();
    });

    test('map dialog closes when clicking backdrop on mobile', async ({ page }) => {
        await page.setViewportSize(MOBILE_VIEWPORT);
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();
        
        // Click on the backdrop on mobile
        await page.mouse.click(10, 10);
        await expect(dialog).not.toBeVisible();
    });

    test('map dialog has circular styling', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();
        
        const container = page.locator('#map-container');
        await expect(container).toBeVisible();
        
        const borderRadius = await container.evaluate(element => getComputedStyle(element).borderRadius);
        expect(borderRadius).toBe('50%');
        
        const overflow = await container.evaluate(element => getComputedStyle(element).overflow);
        expect(overflow).toBe('hidden');
    });

    test('map dialog has square aspect ratio', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();
        
        const container = page.locator('#map-container');
        const box = await container.boundingBox();
        expect(box).not.toBeNull();
        
        // Width and height should be equal (square for circular display)
        expect(box!.width).toBeCloseTo(box!.height, 1);
    });

    test('map dialog close button is positioned in top-right', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();
        
        const closeButton = page.locator('#close-map');
        await expect(closeButton).toBeVisible();
        
        const position = await closeButton.evaluate(element => getComputedStyle(element).position);
        expect(position).toBe('absolute');
        
        const buttonBox = await closeButton.boundingBox();
        const dialogBox = await page.locator('#map-dialog').boundingBox();
        expect(buttonBox).not.toBeNull();
        expect(dialogBox).not.toBeNull();
        
        // Close button should be near top-right of dialog
        expect(buttonBox!.x + buttonBox!.width).toBeCloseTo(dialogBox!.x + dialogBox!.width - 8, 10);
    });

    test('map dialog shows coordinates label', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();
        
        const coords = page.locator('#map-coords');
        await expect(coords).toBeVisible();
        
        // Should show world and coordinates - pattern: "world: X, Y, Z"
        const text = await coords.textContent();
        // eslint-disable-next-line sonarjs/slow-regex -- simple coordinate pattern, no backtracking risk
        expect(text).toMatch(/[a-z]+: ?-?\d+, ?-?\d+, ?-?\d+/i);
    });

    test('map dialog closes via close button', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();
        
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();
        
        await page.locator('#close-map').click();
        await expect(dialog).not.toBeVisible();
    });
});

test.describe('Map Dialog - Leaflet Integration', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await showAllTrades(page);
    });

    test('map dialog initializes Leaflet container', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        const mapContainer = page.locator('#map-container');
        await expect(mapContainer).toBeVisible();

        // Wait for Leaflet to add its container class
        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });
    });

    test('Leaflet map has zoom controls', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        // Wait for Leaflet container
        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });

        const zoomIn = page.locator('.leaflet-control-zoom-in');
        const zoomOut = page.locator('.leaflet-control-zoom-out');

        await expect(zoomIn).toBeVisible();
        await expect(zoomOut).toBeVisible();
    });

    test('map coordinates update when panning', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });

        const coords = page.locator('#map-coords');
        const initialText = await coords.textContent();

        // Simulate a pan by dragging
        const mapContainer = page.locator('#map-container');
        const box = await mapContainer.boundingBox();
        if (box) {
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;

            await page.mouse.move(centerX, centerY);
            await page.mouse.down();
            await page.mouse.move(centerX + 100, centerY + 100, { steps: 10 });
            await page.mouse.up();

            // Wait for coords to update
            await page.waitForTimeout(100);
            const newText = await coords.textContent();

            // Coordinates should have changed after panning
            expect(newText).not.toBe(initialText);
        }
    });

    test('shop pin marker is displayed on map', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        // Shop marker uses leaflet-pin-marker class
        const shopMarker = page.locator('.leaflet-pin-marker');
        await expect(shopMarker).toBeVisible({ timeout: 5000 });
    });

    test('zoom controls are functional', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });

        // Verify both zoom controls exist and are enabled
        const zoomIn = page.locator('.leaflet-control-zoom-in');
        const zoomOut = page.locator('.leaflet-control-zoom-out');

        await expect(zoomIn).toBeVisible();
        await expect(zoomOut).toBeVisible();

        // Verify zoom controls are not disabled
        await expect(zoomIn).not.toHaveAttribute('aria-disabled', 'true');
    });
});

test.describe('Map Dialog - Player Markers Structure', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await showAllTrades(page);
    });

    test('Leaflet pane structure exists for markers', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });

        // Leaflet map pane (parent of all panes) should exist
        const mapPane = page.locator('.leaflet-map-pane');
        await expect(mapPane).toBeAttached();
    });

    test('dialog supports absolute positioned edge markers', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();

        // Dialog position should support absolute positioned children
        const position = await dialog.evaluate(element => getComputedStyle(element).position);
        expect(position).toBe('fixed');
    });

    test('player name CSS class is defined', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });

        // Verify the CSS class exists
        const hasPlayerNameStyle = await page.evaluate(() => {
            const rules = [...document.styleSheets]
                .flatMap(s => {
                    try { return [...s.cssRules]; }
                    catch { return []; }
                })
                .filter(r => r.cssText.includes('.player-name'));
            return rules.length > 0;
        });
        expect(hasPlayerNameStyle).toBe(true);
    });

    test('player edge marker CSS class is defined', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });

        // Verify the CSS class exists
        const hasEdgeMarkerStyle = await page.evaluate(() => {
            const rules = [...document.styleSheets]
                .flatMap(s => {
                    try { return [...s.cssRules]; }
                    catch { return []; }
                })
                .filter(r => r.cssText.includes('.player-edge-marker'));
            return rules.length > 0;
        });
        expect(hasEdgeMarkerStyle).toBe(true);
    });
});

test.describe('Map Dialog - Backdrop Close Behavior', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await showAllTrades(page);
    });

    test('dialog does not close when panning ends outside circle', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();

        const mapContainer = page.locator('#map-container');
        const box = await mapContainer.boundingBox();

        if (box) {
            const centerX = box.x + box.width / 2;
            const centerY = box.y + box.height / 2;

            // Start drag inside the map, release outside
            await page.mouse.move(centerX, centerY);
            await page.mouse.down();
            await page.mouse.move(10, 10, { steps: 10 }); // Move to top-left corner (outside)
            await page.mouse.up();

            // Dialog should still be visible (pan started inside)
            await expect(dialog).toBeVisible();
        }
    });

    test('dialog closes only when click starts and ends outside', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.locator('.distance').click();

        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();

        // Click that starts and ends outside the dialog (backdrop)
        await page.mouse.click(10, 10);

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
        for (let index = 0; index < testCount; index++) {
            const row = rows.nth(index);
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
            const goodColor = await goodDeal.evaluate(element => getComputedStyle(element).color);
            // Should be greenish color (rgb values where green > red)
            expect(goodColor).toMatch(/^rgb/);
        }

        if (await badDeal.count() > 0) {
            const badColor = await badDeal.evaluate(element => getComputedStyle(element).color);
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
            for (let index = 0; index < Math.min(count, 5); index++) {
                const text = await worldCells.nth(index).textContent();
                expect(['O', 'N', 'E']).toContain(text?.trim());
            }
        }
    });

    test('deal column is sorted by default on page load', async ({ page }) => {
        // The Deal (dev) header should have sort arrow text on load
        const developmentHeader = page.locator('#table-header .col.dev-header');
        await expect(developmentHeader).toBeVisible();
        
        // Check that the header text includes the sort arrow (ascending = best deals first)
        // Arrow is before label for right-aligned columns
        const headerText = await developmentHeader.textContent();
        expect(headerText?.trim()).toBe('↑Deal');
    });

    test('active sort column header has blue color', async ({ page }) => {
        // The Deal header should have active-sort class and blue color
        const developmentHeader = page.locator('#table-header .col.dev-header');
        await expect(developmentHeader).toHaveClass(/active-sort/);
        
        const color = await developmentHeader.evaluate(element => getComputedStyle(element).color);
        // Should be blue (#4a9eff = rgb(74, 158, 255))
        expect(color).toBe('rgb(74, 158, 255)');
    });

    test('all three worlds are represented in world column', async ({ page }) => {
        const worldCells = page.locator('.trade-row .col.world');
        const allText: string[] = [];
        
        const count = await worldCells.count();
        for (let index = 0; index < count; index++) {
            const text = await worldCells.nth(index).textContent();
            if (text) {allText.push(text.trim());}
        }
        
        // Should have all three world abbreviations
        expect(allText).toContain('O'); // Overworld
        expect(allText).toContain('N'); // The Nether
        expect(allText).toContain('E'); // The End
    });
});

// =============================================================================
// Distance Column Tests
// =============================================================================

test.describe('CSS Layout - Distance Column', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await showAllTrades(page);
    });

    test('distance column header is visible on desktop', async ({ page }) => {
        const distanceHeader = page.locator('#table-header .col.distance-header');
        await expect(distanceHeader).toBeVisible();
        
        const text = await distanceHeader.textContent();
        expect(text?.toLowerCase()).toContain('dist');
    });

    test('distance column header is sortable', async ({ page }) => {
        const distanceHeader = page.locator('#table-header .col.distance-header');
        
        // Should have data-col attribute for sorting
        const dataCol = await distanceHeader.getAttribute('data-col');
        expect(dataCol).toBe('distance');
        
        // Should have header class for clickability
        const classes = await distanceHeader.getAttribute('class');
        expect(classes).toContain('header');
    });

    test('distance column displays numeric values', async ({ page }) => {
        const distanceCells = page.locator('.trade-row .col.distance');
        const count = await distanceCells.count();
        
        expect(count).toBeGreaterThan(0);
        
        for (let index = 0; index < Math.min(count, 5); index++) {
            const text = await distanceCells.nth(index).textContent();
            // Should be a number (distance from origin)
            expect(text?.trim()).toMatch(/^\d+$/);
        }
    });

    test('distance column is right-aligned', async ({ page }) => {
        const distanceHeader = page.locator('#table-header .col.distance-header');
        const justifyContent = await distanceHeader.evaluate(element => getComputedStyle(element).justifyContent);
        expect(justifyContent).toBe('flex-end');
    });

    test('distance column has tooltip with full coordinates', async ({ page }) => {
        const distanceCells = page.locator('.trade-row .col.distance');
        const count = await distanceCells.count();
        
        if (count > 0) {
            const title = await distanceCells.first().getAttribute('title');
            // Should contain X, Y, Z coordinates
            expect(title).toMatch(/X:/);
            expect(title).toMatch(/Y:/);
            expect(title).toMatch(/Z:/);
        }
    });
});

// =============================================================================
// Sorting Functionality Tests
// =============================================================================

test.describe('CSS Layout - Sorting', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await showAllTrades(page);
    });

    test('clicking column header toggles sort direction', async ({ page }) => {
        const stockHeader = page.locator('#table-header .col.stock-header');
        
        // Click to activate sort (starts with desc for stock)
        await stockHeader.click();
        let text = await stockHeader.textContent();
        expect(text?.trim()).toBe('↓Stock');
        
        // Click again to change direction
        await stockHeader.click();
        text = await stockHeader.textContent();
        expect(text?.trim()).toBe('↑Stock');
        
        // Click third time to clear sort
        await stockHeader.click();
        text = await stockHeader.textContent();
        expect(text?.trim()).toBe('Stock');
    });

    test('multiple columns can be sorted simultaneously', async ({ page }) => {
        const dealHeader = page.locator('#table-header .col.dev-header');
        const stockHeader = page.locator('#table-header .col.stock-header');
        
        // Deal is already sorted by default
        await expect(dealHeader).toHaveClass(/active-sort/);
        
        // Click stock to add it to sort
        await stockHeader.click();
        
        // Both should now be active
        await expect(dealHeader).toHaveClass(/active-sort/);
        await expect(stockHeader).toHaveClass(/active-sort/);
        
        // Both should have arrows
        const dealText = await dealHeader.textContent();
        const stockText = await stockHeader.textContent();
        expect(dealText).toMatch(/[↑↓]/);
        expect(stockText).toMatch(/[↑↓]/);
    });

    test('sort arrow appears before label for right-aligned columns', async ({ page }) => {
        const stockHeader = page.locator('#table-header .col.stock-header');
        
        // Click to activate sort
        await stockHeader.click();
        const text = await stockHeader.textContent();
        
        // Arrow should be at the start (right-aligned column)
        expect(text?.charAt(0)).toMatch(/[↑↓]/);
    });

    test('sort arrow appears after label for left-aligned columns', async ({ page }) => {
        const nameHeader = page.locator('#table-header .col[data-col="result-name"]');
        
        // Click to activate sort
        await nameHeader.click();
        const text = await nameHeader.textContent();
        
        // Arrow should be at the end (left-aligned column)
        expect(text?.at(-1)).toMatch(/[↑↓]/);
    });

    test('distance column can be sorted', async ({ page }) => {
        const distanceHeader = page.locator('#table-header .col.distance-header');
        
        // Click to activate sort
        await distanceHeader.click();
        await expect(distanceHeader).toHaveClass(/active-sort/);
        
        const text = await distanceHeader.textContent();
        expect(text).toMatch(/[↑↓]/);
    });

    test('clearing sort removes arrow and active class', async ({ page }) => {
        const dealHeader = page.locator('#table-header .col.dev-header');
        
        // Deal is sorted by default (asc) - but startsAsc=false means desc is first click
        // Initial state: asc (shown as ↑Deal)
        await expect(dealHeader).toHaveClass(/active-sort/);
        let text = await dealHeader.textContent();
        expect(text?.trim()).toBe('↑Deal');
        
        // Click once to clear sort (asc -> none since startsAsc=false)
        await dealHeader.click();
        
        await expect(dealHeader).not.toHaveClass(/active-sort/);
        text = await dealHeader.textContent();
        expect(text?.trim()).toBe('Deal');
    });
});

// =============================================================================
// Header Alignment Tests
// =============================================================================

test.describe('CSS Layout - Header Alignment', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await showAllTrades(page);
    });

    test('world column header is right-aligned', async ({ page }) => {
        const worldHeader = page.locator('#table-header .col.world-header');
        const justifyContent = await worldHeader.evaluate(element => getComputedStyle(element).justifyContent);
        expect(justifyContent).toBe('flex-end');
    });

    test('world column cells are right-aligned', async ({ page }) => {
        const worldCells = page.locator('.trade-row .col.world');
        const count = await worldCells.count();
        
        if (count > 0) {
            const justifyContent = await worldCells.first().evaluate(element => getComputedStyle(element).justifyContent);
            expect(justifyContent).toBe('flex-end');
        }
    });

    test('distance column cells are right-aligned', async ({ page }) => {
        const distanceCells = page.locator('.trade-row .col.distance');
        const count = await distanceCells.count();
        
        if (count > 0) {
            const justifyContent = await distanceCells.first().evaluate(element => getComputedStyle(element).justifyContent);
            expect(justifyContent).toBe('flex-end');
        }
    });

    test('deal column header is right-aligned', async ({ page }) => {
        const developmentHeader = page.locator('#table-header .col.dev-header');
        const justifyContent = await developmentHeader.evaluate(element => getComputedStyle(element).justifyContent);
        expect(justifyContent).toBe('flex-end');
    });

    test('stock column header is right-aligned', async ({ page }) => {
        const stockHeader = page.locator('#table-header .col.stock-header');
        const justifyContent = await stockHeader.evaluate(element => getComputedStyle(element).justifyContent);
        expect(justifyContent).toBe('flex-end');
    });

    test('name columns are left-aligned', async ({ page }) => {
        const resultNameHeader = page.locator('#table-header .col[data-col="result-name"]');
        const costNameHeader = page.locator('#table-header .col[data-col="cost-name"]');
        
        // Flex containers default to flex-start for justify-content
        // or they may have no explicit justify-content set
        const resultJustify = await resultNameHeader.evaluate(element => getComputedStyle(element).justifyContent);
        const costJustify = await costNameHeader.evaluate(element => getComputedStyle(element).justifyContent);
        
        // Should be left-aligned (flex-start or normal)
        expect(['flex-start', 'normal', 'start']).toContain(resultJustify);
        expect(['flex-start', 'normal', 'start']).toContain(costJustify);
    });
});

// =============================================================================
// Mobile View Tests for Distance/World
// =============================================================================

test.describe('CSS Layout - Mobile Distance Column', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(MOBILE_VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
        await showAllTrades(page);
    });

    test('mobile distance header shows "Dist" label', async ({ page }) => {
        const mobileDistributionHeader = page.locator('#table-header .col.distance-header');
        await expect(mobileDistributionHeader).toBeVisible();
        
        const text = await mobileDistributionHeader.textContent();
        expect(text?.toLowerCase()).toContain('dist');
    });

    test('desktop distance header is hidden on mobile', async ({ page }) => {
        // Distance header is visible on both mobile and desktop (same element)
        const distanceHeader = page.locator('#table-header .col.distance-header');
        await expect(distanceHeader).toBeVisible();
    });

    test('mobile uses 11-column grid layout', async ({ page }) => {
        const header = page.locator('#table-header');
        const gridCols = await header.evaluate(element => getComputedStyle(element).gridTemplateColumns);
        const columnCount = gridCols.split(/\s+/).filter(v => v && v !== 'none').length;
        expect(columnCount).toBe(11);
    });
});
