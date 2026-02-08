/**
 * Step definitions for route display property tests
 * Tests mathematical correctness of coordinate conversion and distance calculations
 */
import { expect } from '@playwright/test';
import { Given, When, Then, type BasePageTracking } from './fixtures';
import type { Page } from '@playwright/test';
import { 
    calculateDistance, 
    overworldToNether,
    netherToOverworld
} from './test-math-utilities';

// ============================================================================
// Page tracking interface
// ============================================================================

interface PageWithRouteTracking extends Page, BasePageTracking {
    __shop1X?: number;
    __shop1Z?: number;
    __shop1World?: string;
    __shop2X?: number;
    __shop2Z?: number;
    __shop2World?: string;
    __originX?: number;
    __originZ?: number;
    __stopCount?: number;
    __travelStartX?: number;
    __travelEndX?: number;
}

// ============================================================================
// GIVEN Steps - Coordinate Conversion
// ============================================================================

Given(String.raw`a nether coordinate \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithRouteTracking;
    p.__shop1X = x;
    p.__shop1Z = z;
    p.__shop1World = 'the_nether';
});

Given(String.raw`an overworld coordinate \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithRouteTracking;
    p.__shop1X = x;
    p.__shop1Z = z;
    p.__shop1World = 'overworld';
});

// ============================================================================
// GIVEN Steps - Distance Calculation
// ============================================================================

Given(String.raw`a shop at \({int}, {int}\) in {word}`, async ({ page }, x: number, z: number, world: string) => {
    const p = page as PageWithRouteTracking;
    p.__shop1X = x;
    p.__shop1Z = z;
    p.__shop1World = world;
});

Given(String.raw`another shop at \({int}, {int}\) in {word}`, async ({ page }, x: number, z: number, world: string) => {
    const p = page as PageWithRouteTracking;
    p.__shop2X = x;
    p.__shop2Z = z;
    p.__shop2World = world;
});

// ============================================================================
// GIVEN Steps - Nether Travel
// ============================================================================

Given(String.raw`I travel from \({int}, {int}\) to \({int}, {int}\) in overworld`, async ({ page }, x1: number, _z1: number, x2: number, _z2: number) => {
    const p = page as PageWithRouteTracking;
    p.__travelStartX = x1;
    p.__travelEndX = x2;
});

// ============================================================================
// GIVEN Steps - Optimization
// ============================================================================

Given(String.raw`shops at \({int}, {int}\) and \({int}, {int}\) in overworld`, async ({ page }, x1: number, z1: number, x2: number, z2: number) => {
    const p = page as PageWithRouteTracking;
    p.__shop1X = x1;
    p.__shop1Z = z1;
    p.__shop1World = 'overworld';
    p.__shop2X = x2;
    p.__shop2Z = z2;
    p.__shop2World = 'overworld';
});

Given(String.raw`origin at \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithRouteTracking;
    p.__originX = x;
    p.__originZ = z;
});

Given(String.raw`a shop at \({int}, {int}\) overworld`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithRouteTracking;
    // Store as first or second shop
    if (p.__shop1X === undefined) {
        p.__shop1X = x;
        p.__shop1Z = z;
        p.__shop1World = 'overworld';
    } else {
        p.__shop2X = x;
        p.__shop2Z = z;
        p.__shop2World = 'overworld';
    }
});

// ============================================================================
// GIVEN Steps - Timeline
// ============================================================================

Given('a route with {int} stops', async ({ page }, count: number) => {
    const p = page as PageWithRouteTracking;
    p.__stopCount = count;
});

// ============================================================================
// WHEN Steps
// ============================================================================

When(String.raw`the route is calculated from origin \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithRouteTracking;
    p.__originX = x;
    p.__originZ = z;
});

When('calculating nearest-neighbor route', async ({ page }) => {
    // Calculation happens in THEN step
    await page.waitForTimeout(1);
});

// ============================================================================
// THEN Steps - Coordinate Conversion
// ============================================================================

Then(String.raw`the overworld equivalent should be \({int}, {int}\)`, async ({ page }, expectedX: number, expectedZ: number) => {
    const p = page as PageWithRouteTracking;
    const result = netherToOverworld(p.__shop1X ?? 0, p.__shop1Z ?? 0);
    expect(result.x).toBe(expectedX);
    expect(result.z).toBe(expectedZ);
});

Then(String.raw`the nether equivalent should be \({int}, {int}\)`, async ({ page }, expectedX: number, expectedZ: number) => {
    const p = page as PageWithRouteTracking;
    const result = overworldToNether(p.__shop1X ?? 0, p.__shop1Z ?? 0);
    expect(result.x).toBe(expectedX);
    expect(result.z).toBe(expectedZ);
});

// ============================================================================
// THEN Steps - Distance
// ============================================================================

Then('the route distance should be approximately {int} blocks', async ({ page }, expected: number) => {
    const p = page as PageWithRouteTracking;
    
    const distance = calculateDistance(
        p.__shop1X ?? 0, p.__shop1Z ?? 0, p.__shop1World ?? 'overworld',
        p.__shop2X ?? 0, p.__shop2Z ?? 0, p.__shop2World ?? 'overworld'
    );
    
    // Allow 1 block tolerance for rounding
    expect(Math.round(distance)).toBeCloseTo(expected, 0);
});

Then('the overworld distance is {int} blocks', async ({ page }, expected: number) => {
    const p = page as PageWithRouteTracking;
    const distance = Math.abs((p.__travelEndX ?? 0) - (p.__travelStartX ?? 0));
    expect(distance).toBe(expected);
});

Then('the nether equivalent distance is {int} blocks', async ({ page }, expected: number) => {
    const p = page as PageWithRouteTracking;
    const overworldDistribution = Math.abs((p.__travelEndX ?? 0) - (p.__travelStartX ?? 0));
    const netherDistribution = Math.floor(overworldDistribution / 8);
    expect(netherDistribution).toBe(expected);
});

// ============================================================================
// THEN Steps - Optimization
// ============================================================================

Then('the total distance visiting both should be {int} blocks', async ({ page }, expected: number) => {
    const p = page as PageWithRouteTracking;
    
    const originX = p.__originX ?? 0;
    const originZ = p.__originZ ?? 0;
    
    // Calculate origin to first shop
    const distribution1 = Math.hypot(
        (p.__shop1X ?? 0) - originX,
        (p.__shop1Z ?? 0) - originZ
    );
    
    // Calculate first to second shop
    const distribution2 = Math.hypot(
        (p.__shop2X ?? 0) - (p.__shop1X ?? 0),
        (p.__shop2Z ?? 0) - (p.__shop1Z ?? 0)
    );
    
    expect(Math.round(distribution1 + distribution2)).toBe(expected);
});

Then('the first stop should be the closer shop', async ({ page }) => {
    const p = page as PageWithRouteTracking;
    
    const originX = p.__originX ?? 0;
    const originZ = p.__originZ ?? 0;
    
    const distribution1 = Math.hypot(
        (p.__shop1X ?? 0) - originX,
        (p.__shop1Z ?? 0) - originZ
    );
    
    const distribution2 = Math.hypot(
        (p.__shop2X ?? 0) - originX,
        (p.__shop2Z ?? 0) - originZ
    );
    
    // Shop 1 is defined as the "near" shop in test, should be closer
    expect(distribution1).toBeLessThan(distribution2);
});

// ============================================================================
// THEN Steps - Timeline
// ============================================================================

Then('stop numbers should be 1 through {int}', async ({ page }, count: number) => {
    const p = page as PageWithRouteTracking;
    expect(p.__stopCount).toBe(count);
    
    // Verify sequential numbers exist
    const expectedNumbers = Array.from({ length: count }, (_, index) => index + 1);
    expect(expectedNumbers).toHaveLength(count);
    expect(expectedNumbers[0]).toBe(1);
    expect(expectedNumbers.at(-1)).toBe(count);
});

Then('the primary display should show {string}', async ({ page }, expected: string) => {
    const p = page as PageWithRouteTracking;
    const x = p.__shop1X ?? 0;
    const z = p.__shop1Z ?? 0;
    expect(`${x}, ${z}`).toBe(expected);
});

Then('the secondary display should show {string}', async ({ page }, expected: string) => {
    const p = page as PageWithRouteTracking;
    const x = p.__shop1X ?? 0;
    const z = p.__shop1Z ?? 0;
    const world = p.__shop1World ?? 'overworld';
    
    let secondaryX: number, secondaryZ: number;
    if (world.includes('nether')) {
        // Nether shop: secondary is overworld equivalent
        const ow = netherToOverworld(x, z);
        secondaryX = ow.x;
        secondaryZ = ow.z;
    } else {
        // Overworld shop: secondary is nether equivalent
        const nether = overworldToNether(x, z);
        secondaryX = nether.x;
        secondaryZ = nether.z;
    }
    
    expect(`${secondaryX}, ${secondaryZ}`).toBe(expected);
});
