/**
 * Layout and behaviour of the matrix and map dialogs (Leaflet, player markers, backdrop).
 * Tests computed CSS and DOM rather than screenshots, to avoid false positives.
 */

import { expect, test } from './helpers/global-setup';
import { BASE_URL, type LeafletWindow,MOBILE_VIEWPORT, setupMockRoutes, showAllTrades, VIEWPORT, waitForAppReady, waitForShopMap } from './helpers/layout-fixtures';

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

    test('map dialog opens when pressing Enter on a focused trade row', async ({ page }) => {
        await page.locator('.trade-row').first().focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#map-dialog')).toBeVisible();
    });

    test('arrow keys move focus between trade rows', async ({ page }) => {
        const rows = page.locator('.trade-row');
        await rows.first().focus();
        await page.keyboard.press('ArrowDown');
        await expect(rows.nth(1)).toBeFocused();
        await page.keyboard.press('ArrowUp');
        await expect(rows.first()).toBeFocused();
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
        
        const text = await coords.textContent();
        expect(text).toMatch(/[A-Z][a-z]+: -?\d+, -?\d+, -?\d+/);
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

    test('dragging on the backdrop pans the map and keeps the dialog open', async ({ page }) => {
        await page.locator('.trade-row').first().locator('.distance').click();
        const dialog = page.locator('#map-dialog');
        await expect(dialog).toBeVisible();
        await waitForShopMap(page);
        const lng = () => page.evaluate(() => (globalThis as unknown as LeafletWindow).__leafletMap.getCenter().lng);
        const before = await lng();

        await page.mouse.move(10, 10);
        await page.mouse.down();
        await page.mouse.move(110, 60, { steps: 10 });
        await page.mouse.up();

        await expect(dialog).toBeVisible();
        await expect.poll(lng).toBeLessThan(before);
    });

    test('pinching around the map zooms it', async ({ page }) => {
        await page.locator('.trade-row').first().locator('.distance').click();
        await expect(page.locator('#map-dialog')).toBeVisible();
        await waitForShopMap(page);
        const zoom = () => page.evaluate(() => (globalThis as unknown as LeafletWindow).__leafletMap.getZoom());
        const before = await zoom();

        // Two fingers on the backdrop left of the map, moving apart
        const cdp = await page.context().newCDPSession(page);
        const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: readonly (readonly [number, number])[]) => cdp.send('Input.dispatchTouchEvent', {
            type, touchPoints: points.map(([x, y], id) => ({ x, y, id })),
        });
        await touch('touchStart', [[20, 300], [20, 340]]);
        for (let index = 1; index <= 10; index++) {
            await touch('touchMove', [[20, 300 - index * 10], [20, 340 + index * 10]]);
        }
        await touch('touchEnd', []);

        await expect(page.locator('#map-dialog')).toBeVisible();
        await expect.poll(zoom).toBeGreaterThan(before + 0.5);
    });
});
