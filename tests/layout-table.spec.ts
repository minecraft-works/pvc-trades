/**
 * Layout of the trade table: structure, rows, sorting, distance column and header alignment.
 * Tests computed CSS and DOM rather than screenshots, to avoid false positives.
 */

import { expect, test } from './helpers/global-setup';
import { BASE_URL, beefForEmeralds,setupMockRoutes, showAllTrades, VIEWPORT, waitForAppReady } from './helpers/layout-fixtures';

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

    test('table header uses CSS grid with 10 visible columns', async ({ page }) => {
        const header = page.locator('#table-header');
        const display = await header.evaluate(element => getComputedStyle(element).display);
        expect(display).toBe('grid');
        
        const gridCols = await header.evaluate(element => getComputedStyle(element).gridTemplateColumns);
        // Should have 10 column values (fav, amt, name, amt, name, deal, stock, distance, world, cart)
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

    test('each trade row has exactly 10 columns in DOM', async ({ page }) => {
        const rows = page.locator('.trade-row');
        const rowCount = await rows.count();
        
        for (let index = 0; index < Math.min(rowCount, 5); index++) {
            const row = rows.nth(index);
            const columns = row.locator('.col, .add-to-cart-btn');
            const colCount = await columns.count();
            // 10 columns: fav, amt, name, amt, name, deal, stock, distance, world, cart button
            expect(colCount, `Row ${index} should have exactly 10 columns in DOM`).toBe(10);
        }
    });

    test('header columns align with trade row columns', async ({ page }) => {
        // Header has 10 cols, row has 10
        // Only visible columns should align
        const headerCols = page.locator('#table-header .col:not(.mobile-only)');
        const firstRowCols = page.locator('.trade-row').first().locator('.col, .add-to-cart-btn');
        
        const headerCount = await headerCols.count();
        const rowCount = await firstRowCols.count();
        
        // Header and row should both have 10 columns
        expect(headerCount, 'Header should have 10 visible columns on desktop').toBe(10);
        expect(rowCount, 'Row should have 10 columns').toBe(10);
        
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
            const boxes: { index: number; box: { x: number; width: number } }[] = [];
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
                if (current === undefined || next === undefined) {
                    throw new Error(`Missing column box at index ${index}`);
                }
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
            expect(['flex-end', 'flow-end']).toContain(justifyContent);
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
        expect(['flex-end', 'flow-end']).toContain(justifyContent);
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

    test('nether shop distance is shown in overworld blocks', async ({ page }) => {
        const netherRow = page.locator('.trade-row[data-world="world_nether"]').first();
        const distance = Number(await netherRow.locator('.col.distance').textContent());
        // Nether (-19950, -21636) × 8 → overworld (-159600, -173088)
        expect(distance).toBe(Math.round(Math.hypot(-19_950 * 8, -21_636 * 8)));
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

    test('most recently clicked column becomes the primary sort key', async ({ page }) => {
        await page.locator('#table-header .col.stock-header').click();
        await expect(page.locator('#table-header .col.dev-header')).toHaveClass(/active-sort/);

        const stockTexts = await page.locator('.trade-row .col.stock').allTextContents();
        const stocks = stockTexts.map(Number);
        expect(stocks).toEqual(stocks.toSorted((a, b) => b - a));
    });

    test('trades without a deal value stay last when sorting deal descending', async ({ page }) => {
        const potion = { resultItem: { type: 'POTION', name: '', amount: 1 }, item1: { type: 'EMERALD', name: '', amount: 1 }, stock: 5 };
        await page.route('**/data.json', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [
                { location: '0.0, 64.0, 0.0', world: 'world', recipes: [potion, beefForEmeralds(2)] },
                { location: '1000.0, 64.0, 0.0', world: 'world', recipes: [beefForEmeralds(4)] },
            ] })
        }));
        await page.reload();
        await showAllTrades(page);

        const dealHeader = page.locator('#table-header .col.dev-header');
        await dealHeader.click(); // asc → none
        await dealHeader.click(); // none → desc
        await expect(dealHeader).toHaveText('↓Deal');

        await expect(page.locator('.trade-row .col.dev')).toHaveText(['+33%', '−33%', '—']);
    });

    test('sort arrow appears before label for right-aligned columns', async ({ page }) => {
        const stockHeader = page.locator('#table-header .col.stock-header');
        
        // Click to activate sort
        await stockHeader.click();
        const text = await stockHeader.textContent();
        
        // Arrow should be at the start (right-aligned column)
        expect(text?.charAt(0)).toMatch(/[↑↓]/);
    });

    test('sortable headers work from the keyboard and expose aria-sort', async ({ page }) => {
        const stockHeader = page.locator('#table-header .col.stock-header');
        await stockHeader.focus();
        await page.keyboard.press('Enter');

        await expect(stockHeader).toHaveClass(/active-sort/);
        await expect(stockHeader).toHaveAttribute('aria-sort', 'descending');
        // Only the primary sort column carries aria-sort
        await expect(page.locator('#table-header .col.dev-header')).not.toHaveAttribute('aria-sort', /.+/);

        await page.keyboard.press(' ');
        await expect(stockHeader).toHaveAttribute('aria-sort', 'ascending');
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
        expect(['flex-end', 'flow-end']).toContain(justifyContent);
    });

    test('world column cells are right-aligned', async ({ page }) => {
        const worldCells = page.locator('.trade-row .col.world');
        const count = await worldCells.count();
        
        if (count > 0) {
            const justifyContent = await worldCells.first().evaluate(element => getComputedStyle(element).justifyContent);
            expect(['flex-end', 'flow-end']).toContain(justifyContent);
        }
    });

    test('distance column cells are right-aligned', async ({ page }) => {
        const distanceCells = page.locator('.trade-row .col.distance');
        const count = await distanceCells.count();
        
        if (count > 0) {
            const justifyContent = await distanceCells.first().evaluate(element => getComputedStyle(element).justifyContent);
            expect(['flex-end', 'flow-end']).toContain(justifyContent);
        }
    });

    test('deal column header is right-aligned', async ({ page }) => {
        const developmentHeader = page.locator('#table-header .col.dev-header');
        const justifyContent = await developmentHeader.evaluate(element => getComputedStyle(element).justifyContent);
        expect(['flex-end', 'flow-end']).toContain(justifyContent);
    });

    test('stock column header is right-aligned', async ({ page }) => {
        const stockHeader = page.locator('#table-header .col.stock-header');
        const justifyContent = await stockHeader.evaluate(element => getComputedStyle(element).justifyContent);
        expect(['flex-end', 'flow-end']).toContain(justifyContent);
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
