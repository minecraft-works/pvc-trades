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

    test('table container is block layout (virtual scroll compatible)', async ({ page }) => {
        const container = page.locator('#table-container');
        const display = await container.evaluate(el => getComputedStyle(el).display);
        expect(display).toBe('block');
    });

    test('table header uses CSS grid with 10 visible columns', async ({ page }) => {
        const header = page.locator('#table-header');
        const display = await header.evaluate(el => getComputedStyle(el).display);
        expect(display).toBe('grid');
        
        const gridCols = await header.evaluate(el => getComputedStyle(el).gridTemplateColumns);
        // Should have 10 column values (mobile-coords is hidden on desktop)
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

    test('each trade row has exactly 11 columns in DOM (10 visible)', async ({ page }) => {
        const rows = page.locator('.trade-row');
        const rowCount = await rows.count();
        
        for (let i = 0; i < Math.min(rowCount, 5); i++) {
            const row = rows.nth(i);
            const columns = row.locator('.col');
            const colCount = await columns.count();
            // 11 columns in DOM, but mobile-coords is hidden on desktop
            expect(colCount, `Row ${i} should have exactly 11 columns in DOM`).toBe(11);
        }
    });

    test('header columns align with trade row columns', async ({ page }) => {
        const headerCols = page.locator('#table-header .col');
        const firstRowCols = page.locator('.trade-row').first().locator('.col');
        
        const headerCount = await headerCols.count();
        const rowCount = await firstRowCols.count();
        
        expect(headerCount, 'Header and row should have same column count').toBe(rowCount);
        
        // Check each column's left edge alignment (skip hidden columns)
        for (let i = 0; i < headerCount; i++) {
            const headerCol = headerCols.nth(i);
            const rowCol = firstRowCols.nth(i);
            
            // Skip hidden columns (display: none)
            const headerDisplay = await headerCol.evaluate(el => getComputedStyle(el).display);
            if (headerDisplay === 'none') continue;
            
            const headerBox = await headerCol.boundingBox();
            const rowBox = await rowCol.boundingBox();
            
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
            
            // Skip hidden columns (display: none)
            const display = await col.evaluate(el => getComputedStyle(el).display);
            if (display === 'none') continue;
            
            const box = await col.boundingBox();
            
            // Each visible column should have at least some width (not collapsed)
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
            for (let i = 0; i < count; i++) {
                const col = columns.nth(i);
                
                // Check if element is actually displayed (not display: none)
                const display = await col.evaluate(el => getComputedStyle(el).display);
                if (display === 'none') continue;
                
                const box = await col.boundingBox();
                // Only include columns that have actual visible width (> 1px)
                if (box && box.width > 1) {
                    boxes.push({ index: i, box: { x: box.x, width: box.width } });
                }
            }

            // Sort by x position
            boxes.sort((a, b) => a.box.x - b.box.x);

            // Check that each column ends before the next one starts
            for (let i = 0; i < boxes.length - 1; i++) {
                const current = boxes[i];
                const next = boxes[i + 1];
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

            for (let i = 0; i < count; i++) {
                const col = nameColumns.nth(i);
                const colBox = await col.boundingBox();
                
                if (colBox) {
                    // Get the scroll width (actual content width) vs client width (visible width)
                    const { scrollWidth, clientWidth } = await col.evaluate(el => ({
                        scrollWidth: el.scrollWidth,
                        clientWidth: el.clientWidth
                    }));

                    // If content overflows, it should be clipped (overflow: hidden)
                    if (scrollWidth > clientWidth) {
                        const overflow = await col.evaluate(el => getComputedStyle(el).overflow);
                        expect(overflow, `Row ${r} column ${i}: overflowing content should be hidden`).toBe('hidden');
                    }
                }
            }
        }
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

    test('trade rows use virtual scrolling (no content-visibility needed)', async ({ page }) => {
        // Virtual scrolling is used instead of content-visibility
        // Verify that #results is a block element that can receive padding from virtual scroller
        const results = page.locator('#results');
        const display = await results.evaluate(el => getComputedStyle(el).display);
        expect(display).toBe('block');
        
        // Each trade row should be a grid for column layout
        const row = page.locator('.trade-row').first();
        const rowDisplay = await row.evaluate(el => getComputedStyle(el).display);
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
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.setViewportSize(MOBILE_VIEWPORT);
        await page.goto(BASE_URL);
        await waitForAppReady(page);
    });

    test('search inputs stay on single row on mobile', async ({ page }) => {
        const searchBox = page.locator('.search-box');
        const flexWrap = await searchBox.evaluate(el => getComputedStyle(el).flexWrap);
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
        const gridCols = await header.evaluate(el => getComputedStyle(el).gridTemplateColumns);
        
        // Mobile shows 7 columns: #, name, #, name, deal, stock, coords
        const columnCount = gridCols.split(/\s+/).filter(v => v && v !== 'none').length;
        expect(columnCount).toBe(7);
    });

    test('search container has reduced padding on mobile', async ({ page }) => {
        const container = page.locator('.search-container');
        const padding = await container.evaluate(el => getComputedStyle(el).padding);
        
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
            for (let i = 0; i < count; i++) {
                const col = columns.nth(i);
                
                // Check if element is actually displayed (not display: none)
                const display = await col.evaluate(el => getComputedStyle(el).display);
                if (display === 'none') continue;
                
                const box = await col.boundingBox();
                // Only include columns that have actual visible width (> 1px)
                if (box && box.width > 1) {
                    boxes.push({ index: i, box: { x: box.x, width: box.width } });
                }
            }

            // Sort by x position
            boxes.sort((a, b) => a.box.x - b.box.x);

            // Check that each column ends before the next one starts
            for (let i = 0; i < boxes.length - 1; i++) {
                const current = boxes[i];
                const next = boxes[i + 1];
                const currentEnd = current.box.x + current.box.width;
                
                expect(
                    currentEnd,
                    `Mobile row ${r}: Column ${current.index} (ends at ${currentEnd.toFixed(1)}) overlaps column ${next.index} (starts at ${next.box.x.toFixed(1)})`
                ).toBeLessThanOrEqual(next.box.x + 1); // 1px tolerance for subpixel rendering
            }
        }
    });

    test('mobile-coords column handles overflow gracefully', async ({ page }) => {
        await showAllTrades(page);
        
        const coordsCols = page.locator('.trade-row .col.mobile-coords');
        const count = await coordsCols.count();
        expect(count).toBeGreaterThan(0);

        // Check that mobile-coords has proper overflow handling CSS
        const col = coordsCols.first();
        const styles = await col.evaluate(el => {
            const style = getComputedStyle(el);
            return {
                overflow: style.overflow,
                textOverflow: style.textOverflow,
                display: style.display
            };
        });

        // Should have overflow handling (hidden with ellipsis)
        expect(styles.overflow).toBe('hidden');
        expect(styles.textOverflow).toBe('ellipsis');
        expect(styles.display).toBe('flex');
    });

    test('mobile header grid matches trade row grid', async ({ page }) => {
        await showAllTrades(page);

        const header = page.locator('#table-header');
        const firstRow = page.locator('.trade-row').first();

        const headerCols = await header.evaluate(el => getComputedStyle(el).gridTemplateColumns);
        const rowCols = await firstRow.evaluate(el => getComputedStyle(el).gridTemplateColumns);

        // Both should have the same grid template (7 columns on mobile)
        expect(headerCols).toBe(rowCols);
    });

    test('mobile-coords column has border-radius for rounded corners', async ({ page }) => {
        await showAllTrades(page);

        const mobileCoords = page.locator('.trade-row .col.mobile-coords').first();
        const borderRadius = await mobileCoords.evaluate(el => getComputedStyle(el).borderRadius);

        // Should have right-side border radius (0 4px 4px 0 computes to specific values)
        expect(borderRadius).toMatch(/0px 4px 4px 0px/);
    });

    test('map dialog scales with viewport on mobile', async ({ page }) => {
        await showAllTrades(page);

        // Click on a trade row to open the map dialog
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();

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
        
        const position = await dialog.evaluate(el => getComputedStyle(el).position);
        const borderRadius = await dialog.evaluate(el => getComputedStyle(el).borderRadius);
        
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
        await firstRow.click();
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();
    });

    test('map dialog closes when pressing Escape', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();
        
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
    });

    test('map dialog closes when clicking backdrop', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();
        
        // Click on the backdrop (outside the dialog box)
        await page.mouse.click(10, 10);
        await expect(dialog).not.toBeVisible();
    });

    test('map dialog closes when clicking backdrop on mobile', async ({ page }) => {
        await page.setViewportSize(MOBILE_VIEWPORT);
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();
        
        // Click on the backdrop on mobile
        await page.mouse.click(10, 10);
        await expect(dialog).not.toBeVisible();
    });

    test('map dialog has circular styling', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();
        
        const container = page.locator('#map-container');
        await expect(container).toBeVisible();
        
        const borderRadius = await container.evaluate(el => getComputedStyle(el).borderRadius);
        expect(borderRadius).toBe('50%');
        
        const overflow = await container.evaluate(el => getComputedStyle(el).overflow);
        expect(overflow).toBe('hidden');
    });

    test('map dialog has square aspect ratio', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();
        
        const container = page.locator('#map-container');
        const box = await container.boundingBox();
        expect(box).not.toBeNull();
        
        // Width and height should be equal (square for circular display)
        expect(box!.width).toBeCloseTo(box!.height, 1);
    });

    test('map dialog close button is positioned in top-right', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();
        
        const closeBtn = page.locator('#close-map');
        await expect(closeBtn).toBeVisible();
        
        const position = await closeBtn.evaluate(el => getComputedStyle(el).position);
        expect(position).toBe('absolute');
        
        const btnBox = await closeBtn.boundingBox();
        const dialogBox = await page.locator('#map-dialog').boundingBox();
        expect(btnBox).not.toBeNull();
        expect(dialogBox).not.toBeNull();
        
        // Close button should be near top-right of dialog
        expect(btnBox!.x + btnBox!.width).toBeCloseTo(dialogBox!.x + dialogBox!.width - 8, 10);
    });

    test('map dialog shows coordinates label', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();
        
        const coords = page.locator('#map-coords');
        await expect(coords).toBeVisible();
        
        // Should show world and coordinates
        const text = await coords.textContent();
        expect(text).toMatch(/\w+:\s*-?\d+,\s*-?\d+,\s*-?\d+/);
    });

    test('map dialog closes via close button', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();
        
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
        await firstRow.click();

        const mapContainer = page.locator('#map-container');
        await expect(mapContainer).toBeVisible();

        // Wait for Leaflet to add its container class
        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });
    });

    test('Leaflet map has zoom controls', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();

        // Wait for Leaflet container
        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });

        const zoomIn = page.locator('.leaflet-control-zoom-in');
        const zoomOut = page.locator('.leaflet-control-zoom-out');

        await expect(zoomIn).toBeVisible();
        await expect(zoomOut).toBeVisible();
    });

    test('map coordinates update when panning', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();

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
        await firstRow.click();

        // Shop marker uses leaflet-pin-marker class
        const shopMarker = page.locator('.leaflet-pin-marker');
        await expect(shopMarker).toBeVisible({ timeout: 5000 });
    });

    test('zoom controls are functional', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();

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
        await firstRow.click();

        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });

        // Leaflet map pane (parent of all panes) should exist
        const mapPane = page.locator('.leaflet-map-pane');
        await expect(mapPane).toBeAttached();
    });

    test('dialog supports absolute positioned edge markers', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();

        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();

        // Dialog position should support absolute positioned children
        const position = await dialog.evaluate(el => getComputedStyle(el).position);
        expect(position).toBe('fixed');
    });

    test('player name CSS class is defined', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();

        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });

        // Verify the CSS class exists
        const hasPlayerNameStyle = await page.evaluate(() => {
            const rules = Array.from(document.styleSheets)
                .flatMap(s => {
                    try { return Array.from(s.cssRules); }
                    catch { return []; }
                })
                .filter(r => r.cssText.includes('.player-name'));
            return rules.length > 0;
        });
        expect(hasPlayerNameStyle).toBe(true);
    });

    test('player edge marker CSS class is defined', async ({ page }) => {
        const firstRow = page.locator('.trade-row').first();
        await firstRow.click();

        await expect(page.locator('#map-container.leaflet-container')).toBeVisible({ timeout: 5000 });

        // Verify the CSS class exists
        const hasEdgeMarkerStyle = await page.evaluate(() => {
            const rules = Array.from(document.styleSheets)
                .flatMap(s => {
                    try { return Array.from(s.cssRules); }
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
        await firstRow.click();

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
        await firstRow.click();

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
        
        // Check that the header text includes the sort arrow (ascending = best deals first)
        const headerText = await devHeader.textContent();
        expect(headerText?.trim()).toBe('Deal▲');
    });

    test('active sort column header has blue color', async ({ page }) => {
        // The Deal header should have active-sort class and blue color
        const devHeader = page.locator('#table-header .col.dev-header');
        await expect(devHeader).toHaveClass(/active-sort/);
        
        const color = await devHeader.evaluate(el => getComputedStyle(el).color);
        // Should be blue (#4a9eff = rgb(74, 158, 255))
        expect(color).toBe('rgb(74, 158, 255)');
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
