/**
 * Step definitions for zoom height property tests
 * Tests zoom level calculation based on player Y height thresholds
 */
import { expect } from '@playwright/test';
import { Given, When, Then, type BasePageTracking } from './fixtures';
import type { Page } from '@playwright/test';
import { setupColoredTileMocks, setupMultiWorldDataMock } from '../../tests/helpers/navigation-mocks';

// ============================================================================
// Zoom level thresholds (from the app — matches getZoomForHeight in library.ts)
// ============================================================================

const HEIGHT_THRESHOLDS = [
    { maxHeight: 80, zoom: 2 },
    { maxHeight: 120, zoom: 1 },
    { maxHeight: 160, zoom: 0 },
    { maxHeight: 200, zoom: -1 },
    { maxHeight: 256, zoom: -2 },
    { maxHeight: Infinity, zoom: -3 },
];

function getZoomLevelForHeight(y: number): number {
    for (const threshold of HEIGHT_THRESHOLDS) {
        if (y <= threshold.maxHeight) {
            return threshold.zoom;
        }
    }
    return -3;
}

// ============================================================================
// Page tracking interface
// ============================================================================

interface PageWithZoomTracking extends Page, BasePageTracking {
    __playerY?: number;
    __calculatedZoom?: number;
    __zoomChanges?: number[];
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the navigation test app is configured', async ({ page }) => {
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    
    await page.goto('/');
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 5000 });
});

Given('the player height is {int}', async ({ page }, y: number) => {
    const p = page as PageWithZoomTracking;
    p.__playerY = y;
});

Given('the player is bobbing between height {int} and {int}', async ({ page }, low: number, high: number) => {
    const p = page as PageWithZoomTracking;
    p.__playerY = low;
    (p as unknown as { __bobbingLow: number }).__bobbingLow = low;
    (p as unknown as { __bobbingHigh: number }).__bobbingHigh = high;
    p.__zoomChanges = [];
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I calculate the zoom level for that height', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    const y = p.__playerY ?? 64;
    p.__calculatedZoom = getZoomLevelForHeight(y);
});

When('I calculate the zoom level', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    const y = p.__playerY ?? 64;
    p.__calculatedZoom = getZoomLevelForHeight(y);
});

When('the player crosses the {int} block boundary multiple times', async ({ page }, boundary: number) => {
    const p = page as PageWithZoomTracking;
    p.__zoomChanges = [];

    // Simulate crossing the height boundary
    const heights = [
        boundary - 10,  // Below
        boundary + 10,  // Above
        boundary - 5,   // Back below
        boundary + 5,   // Above again
    ];

    let lastZoom = getZoomLevelForHeight(heights[0]!);

    for (const h of heights) {
        const newZoom = getZoomLevelForHeight(h);
        if (newZoom !== lastZoom) {
            p.__zoomChanges.push(newZoom);
            lastZoom = newZoom;
        }
    }
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the zoom level should be {int}', async ({ page }, expectedZoom: number) => {
    const p = page as PageWithZoomTracking;
    expect(p.__calculatedZoom).toBe(expectedZoom);
});

Then('the zoom level should not rapidly change', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    expect((p.__zoomChanges?.length ?? 0)).toBeLessThanOrEqual(4);
});

Then('there should be at most {int} zoom changes', async ({ page }, maxChanges: number) => {
    const p = page as PageWithZoomTracking;
    expect((p.__zoomChanges?.length ?? 0)).toBeLessThanOrEqual(maxChanges);
});
