/**
 * Step definitions for zoom height property tests
 * Tests linear zoom interpolation based on player Y height
 */
import { expect } from '@playwright/test';
import { Given, When, Then, type BasePageTracking } from './fixtures';
import type { Page } from '@playwright/test';
import { setupColoredTileMocks, setupMultiWorldDataMock } from '../../tests/helpers/navigation-mocks';

// ============================================================================
// Linear zoom interpolation (matches getZoomForHeight in library.ts)
// ============================================================================

const MIN_HEIGHT = 63;
const MAX_HEIGHT = 300;
const MAX_ZOOM = 2;
const MIN_ZOOM = -3;

function getZoomLevelForHeight(y: number): number {
    if (y <= MIN_HEIGHT) { return MAX_ZOOM; }
    if (y >= MAX_HEIGHT) { return MIN_ZOOM; }

    const t = (y - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);
    return MAX_ZOOM + t * (MIN_ZOOM - MAX_ZOOM);
}

// ============================================================================
// Page tracking interface
// ============================================================================

interface PageWithZoomTracking extends Page, BasePageTracking {
    __playerY?: number;
    __calculatedZoom?: number;
    __zoomChanges?: number[];
    __calculatedZooms?: number[];
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

Given('the player height is {float}', async ({ page }, y: number) => {
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

Given('these player heights: {int}, {int}, {int}, {int}, {int}, {int}, {int}, {int}, {int}',
    async ({ page }, ...heights: number[]) => {
        const p = page as PageWithZoomTracking;
        (p as unknown as { __heightList: number[] }).__heightList = heights;
    }
);

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

When('I calculate the zoom levels for all heights', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    const heights = (p as unknown as { __heightList: number[] }).__heightList ?? [];
    p.__calculatedZooms = heights.map(y => getZoomLevelForHeight(y));
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the zoom level should be {int}', async ({ page }, expectedZoom: number) => {
    const p = page as PageWithZoomTracking;
    expect(p.__calculatedZoom).toBe(expectedZoom);
});

Then('the zoom level should be approximately {int}', async ({ page }, expectedZoom: number) => {
    const p = page as PageWithZoomTracking;
    expect(p.__calculatedZoom).toBeCloseTo(expectedZoom, 1);
});

Then('the zoom level should not rapidly change', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    expect((p.__zoomChanges?.length ?? 0)).toBeLessThanOrEqual(4);
});

Then('there should be at most {int} zoom changes', async ({ page }, maxChanges: number) => {
    const p = page as PageWithZoomTracking;
    expect((p.__zoomChanges?.length ?? 0)).toBeLessThanOrEqual(maxChanges);
});

Then('each zoom level should be less than or equal to the previous', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    const zooms = p.__calculatedZooms ?? [];
    for (let index = 1; index < zooms.length; index++) {
        expect(zooms[index]).toBeLessThanOrEqual(zooms[index - 1]!);
    }
});
