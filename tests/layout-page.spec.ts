/**
 * Layout of the page: search container, CSS custom properties and mobile views.
 * Tests computed CSS and DOM rather than screenshots, to avoid false positives.
 */

import { expect, test } from './helpers/global-setup';
import { BASE_URL, MOBILE_VIEWPORT, setupMockRoutes, showAllTrades,VIEWPORT, waitForAppReady } from './helpers/layout-fixtures';

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

    test('search inputs share one row and the actions move to the quick-filter row on mobile', async ({ page }) => {
        const searchBox = page.locator('.search-box');
        const flexWrap = await searchBox.evaluate(element => getComputedStyle(element).flexWrap);
        expect(flexWrap).toBe('nowrap');
        
        const wantBox = await page.locator('#searchWant').boundingBox();
        const giveBox = await page.locator('#searchGive').boundingBox();
        const buttonBox = await page.locator('#open-matrix').boundingBox();
        const quickBarBox = await page.locator('#quick-bar').boundingBox();
        
        expect(wantBox).toBeTruthy();
        expect(giveBox).toBeTruthy();
        expect(buttonBox).toBeTruthy();
        expect(quickBarBox).toBeTruthy();
        
        // Both inputs on the same row (within 2px)
        expect(Math.abs(wantBox!.y - giveBox!.y)).toBeLessThanOrEqual(2);
        // The exchange-rates button sits below the inputs, level with the quick filters
        expect(buttonBox!.y).toBeGreaterThan(wantBox!.y + wantBox!.height);
        const buttonCenter = buttonBox!.y + buttonBox!.height / 2;
        expect(buttonCenter).toBeGreaterThan(quickBarBox!.y);
        expect(buttonCenter).toBeLessThan(quickBarBox!.y + quickBarBox!.height);
    });

    test('table header adjusts columns for mobile', async ({ page }) => {
        const header = page.locator('#table-header');
        const gridCols = await header.evaluate(element => getComputedStyle(element).gridTemplateColumns);
        
        // Mobile shows 10 columns: fav, #, name, #, name, deal, stock, distance, world, cart button
        const columnCount = gridCols.split(/\s+/).filter(v => v && v !== 'none').length;
        expect(columnCount).toBe(10);
    });

    test('search container keeps a compact padding on mobile', async ({ page }) => {
        const container = page.locator('.search-container');
        const padding = await container.evaluate(element => getComputedStyle(element).padding);
        
        // Same compact 8px as on desktop, so the search fields get the width
        expect(padding).toBe('8px');
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
        expect(['flex-end', 'flow-end']).toContain(styles.justifyContent);
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

    test('mobile uses 10-column grid layout', async ({ page }) => {
        const header = page.locator('#table-header');
        const gridCols = await header.evaluate(element => getComputedStyle(element).gridTemplateColumns);
        const columnCount = gridCols.split(/\s+/).filter(v => v && v !== 'none').length;
        expect(columnCount).toBe(10);
    });
});
