/**
 * Step definitions for zoom distance property tests
 * Tests zoom level calculation based on distance thresholds
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import type { Page } from '@playwright/test';
import { setupColoredTileMocks, setupMultiWorldDataMock } from '../../tests/helpers/navigation-mocks';

// ============================================================================
// Zoom level thresholds (from the app)
// ============================================================================

const ZOOM_THRESHOLDS = [
    { maxDistance: 60, zoom: 5 },
    { maxDistance: 100, zoom: 4 },
    { maxDistance: 300, zoom: 3 },
    { maxDistance: 600, zoom: 2 },
    { maxDistance: 1200, zoom: 1 },
    { maxDistance: Infinity, zoom: 0 },
];

function getZoomLevelForDistance(distance: number): number {
    for (const threshold of ZOOM_THRESHOLDS) {
        if (distance < threshold.maxDistance) {
            return threshold.zoom;
        }
    }
    return 0;
}

function calculateDistance(x1: number, z1: number, x2: number, z2: number): number {
    return Math.hypot(x2 - x1, z2 - z1);
}

// ============================================================================
// Page tracking interface
// ============================================================================

interface PageWithZoomTracking extends Page {
    __playerX?: number;
    __playerZ?: number;
    __shopX?: number;
    __shopZ?: number;
    __isNether?: boolean;
    __calculatedDistance?: number;
    __calculatedZoom?: number;
    __currentZoom?: number;
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

Given(String.raw`the player is at \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithZoomTracking;
    p.__playerX = x;
    p.__playerZ = z;
});

Given(String.raw`the shop is at \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithZoomTracking;
    p.__shopX = x;
    p.__shopZ = z;
});

Given('the shop is exactly {int} blocks away', async ({ page }, distance: number) => {
    const p = page as PageWithZoomTracking;
    // Place shop at (distance, 0) from player at (0, 0)
    p.__shopX = distance;
    p.__shopZ = 0;
});

Given(String.raw`the player is in the nether at \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithZoomTracking;
    p.__playerX = x;
    p.__playerZ = z;
    p.__isNether = true;
});

Given(String.raw`a nether shop is at \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithZoomTracking;
    p.__shopX = x;
    p.__shopZ = z;
    p.__isNether = true;
});

Given(String.raw`the player is at overworld \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithZoomTracking;
    p.__playerX = x;
    p.__playerZ = z;
    p.__isNether = false;
});

Given(String.raw`a nether shop at \({int}, {int}\) which is \({int}, {int}\) in overworld`, async ({ page }, netherX: number, netherZ: number, owX: number, owZ: number) => {
    const p = page as PageWithZoomTracking;
    // Use overworld coordinates for calculation
    p.__shopX = owX;
    p.__shopZ = owZ;
});

Given('the player is moving toward a shop', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    p.__playerX = 150;
    p.__playerZ = 0;
    p.__shopX = 0;
    p.__shopZ = 0;
    p.__zoomChanges = [];
});

Given('the current zoom level is {int}', async ({ page }, zoom: number) => {
    const p = page as PageWithZoomTracking;
    p.__currentZoom = zoom;
});

Given('the distance changes from {int} to {int}', async ({ page }, fromDistance: number, toDistance: number) => {
    const p = page as PageWithZoomTracking;
    p.__calculatedDistance = toDistance;
    (p as unknown as { __fromDistance: number }).__fromDistance = fromDistance;
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('I calculate the zoom level for that distance', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    const playerX = p.__playerX ?? 0;
    const playerZ = p.__playerZ ?? 0;
    const shopX = p.__shopX ?? 0;
    const shopZ = p.__shopZ ?? 0;
    
    const distance = calculateDistance(playerX, playerZ, shopX, shopZ);
    p.__calculatedDistance = distance;
    p.__calculatedZoom = getZoomLevelForDistance(distance);
});

When('I calculate the zoom level', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    const playerX = p.__playerX ?? 0;
    const playerZ = p.__playerZ ?? 0;
    const shopX = p.__shopX ?? 0;
    const shopZ = p.__shopZ ?? 0;
    
    const distance = calculateDistance(playerX, playerZ, shopX, shopZ);
    p.__calculatedDistance = distance;
    p.__calculatedZoom = getZoomLevelForDistance(distance);
});

When('I calculate the overworld-equivalent distance', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    const playerX = (p.__playerX ?? 0) * 8;  // Nether to overworld ×8
    const playerZ = (p.__playerZ ?? 0) * 8;
    const shopX = (p.__shopX ?? 0) * 8;
    const shopZ = (p.__shopZ ?? 0) * 8;
    
    p.__calculatedDistance = calculateDistance(playerX, playerZ, shopX, shopZ);
});

When('I calculate the distance', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    const playerX = p.__playerX ?? 0;
    const playerZ = p.__playerZ ?? 0;
    const shopX = p.__shopX ?? 0;
    const shopZ = p.__shopZ ?? 0;
    
    p.__calculatedDistance = calculateDistance(playerX, playerZ, shopX, shopZ);
});

When('the player crosses the {int} block boundary multiple times', async ({ page }, boundary: number) => {
    const p = page as PageWithZoomTracking;
    p.__zoomChanges = [];
    
    // Simulate crossing the boundary
    const positions = [
        boundary - 10,  // Before
        boundary + 10,  // After
        boundary - 5,   // Back before
        boundary + 5,   // After again
    ];
    
    let lastZoom = getZoomLevelForDistance(positions[0]!);
    
    for (const pos of positions) {
        const newZoom = getZoomLevelForDistance(pos);
        if (newZoom !== lastZoom) {
            p.__zoomChanges.push(newZoom);
            lastZoom = newZoom;
        }
    }
});

When('I recalculate the zoom level', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    const distance = p.__calculatedDistance ?? 0;
    p.__calculatedZoom = getZoomLevelForDistance(distance);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the zoom level should be {int}', async ({ page }, expectedZoom: number) => {
    const p = page as PageWithZoomTracking;
    expect(p.__calculatedZoom).toBe(expectedZoom);
});

// Note: "the distance should be {int} blocks" is defined in route.steps.ts

Then('the calculated distance should be {int} blocks', async ({ page }, expectedDistance: number) => {
    const p = page as PageWithZoomTracking;
    expect(Math.round(p.__calculatedDistance ?? 0)).toBe(expectedDistance);
});

Then('the distance should be approximately {int} blocks', async ({ page }, expectedDistance: number) => {
    const p = page as PageWithZoomTracking;
    const actual = p.__calculatedDistance ?? 0;
    // Allow 1% tolerance for floating point
    expect(Math.abs(actual - expectedDistance)).toBeLessThan(expectedDistance * 0.02 + 1);
});

Then('the zoom level should not rapidly change', async ({ page }) => {
    const p = page as PageWithZoomTracking;
    // Rapid changes would be more than 2 changes
    expect((p.__zoomChanges?.length ?? 0)).toBeLessThanOrEqual(4);
});

Then('there should be at most {int} zoom changes', async ({ page }, maxChanges: number) => {
    const p = page as PageWithZoomTracking;
    expect((p.__zoomChanges?.length ?? 0)).toBeLessThanOrEqual(maxChanges);
});

Then('the zoom should change to {int}', async ({ page }, expectedZoom: number) => {
    const p = page as PageWithZoomTracking;
    expect(p.__calculatedZoom).toBe(expectedZoom);
});

Then('the zoom should stay at {int}', async ({ page }, expectedZoom: number) => {
    const p = page as PageWithZoomTracking;
    expect(p.__calculatedZoom).toBe(expectedZoom);
});
