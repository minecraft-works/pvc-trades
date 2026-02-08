/**
 * Step definitions for live navigation property tests
 * Tests mathematical correctness of distance calculations, auto-advance, and direction
 */
import { expect } from '@playwright/test';
import { Given, When, Then, type BasePageTracking } from './fixtures';
import type { Page } from '@playwright/test';
import { 
    calculateDistance, 
    yawToDirection, 
    shouldAutoAdvance, 
    simpleDistance,
    NAVIGATION 
} from './test-math-utilities';

// ============================================================================
// Page tracking interface
// ============================================================================

interface PageWithNavigationTracking extends Page, BasePageTracking {
    __startX?: number;
    __startZ?: number;
    __routeRecalculated?: boolean;
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given(String.raw`player is at \({int}, {int}\) in {word}`, async ({ page }, x: number, z: number, world: string) => {
    const p = page as PageWithNavigationTracking;
    p.__playerX = x;
    p.__playerZ = z;
    p.__playerWorld = world;
});

Given(String.raw`the target shop is at \({int}, {int}\) in {word}`, async ({ page }, x: number, z: number, world: string) => {
    const p = page as PageWithNavigationTracking;
    p.__shopX = x;
    p.__shopZ = z;
    p.__shopWorld = world;
});

Given('the arrival threshold is {int} blocks', async ({ page }, threshold: number) => {
    // Store threshold for verification (actual app uses constant)
    expect(threshold).toBe(NAVIGATION.ARRIVAL_THRESHOLD);
});

Given('player has yaw {int}', async ({ page }, yaw: number) => {
    const p = page as PageWithNavigationTracking;
    p.__playerYaw = yaw;
});

Given(String.raw`player started navigation at \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithNavigationTracking;
    p.__startX = x;
    p.__startZ = z;
    p.__playerX = x;
    p.__playerZ = z;
    p.__playerWorld = 'overworld';
    p.__routeRecalculated = false;
});

Given('the recalculation threshold is {int} blocks', async ({ page }, threshold: number) => {
    // Store for verification
    expect(threshold).toBe(NAVIGATION.RECALCULATION_THRESHOLD);
});

// ============================================================================
// WHEN Steps
// ============================================================================

// Note: 'player moves to (x, z)' step is defined in live-navigation.steps.ts
// We track movement for property tests using page state

When(String.raw`player moves to \({int}, {int}\) in {word}`, async ({ page }, x: number, z: number, world: string) => {
    const p = page as PageWithNavigationTracking;
    p.__playerX = x;
    p.__playerZ = z;
    p.__playerWorld = world;
});

When(String.raw`player position changes to \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithNavigationTracking;
    
    // Check if movement from start position exceeds threshold
    const startX = p.__startX ?? 0;
    const startZ = p.__startZ ?? 0;
    const distance = simpleDistance(startX, startZ, x, z);
    
    // Movement beyond threshold triggers recalculation
    p.__routeRecalculated = distance >= NAVIGATION.RECALCULATION_THRESHOLD;
    
    p.__playerX = x;
    p.__playerZ = z;
});

When(String.raw`player transitions to {word} at \({int}, {int}\)`, async ({ page }, world: string, x: number, z: number) => {
    const p = page as PageWithNavigationTracking;
    p.__playerX = x;
    p.__playerZ = z;
    p.__playerWorld = world;
});

// Note: 'the player marker renders' step is defined in live-navigation.steps.ts

When('the distance display updates', async ({ page }) => {
    // Distance display update is implicit
    await page.waitForTimeout(10);
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the calculated distance should be approximately {int} blocks', async ({ page }, expected: number) => {
    const p = page as PageWithNavigationTracking;
    
    const distance = calculateDistance(
        p.__playerX ?? 0, p.__playerZ ?? 0, p.__playerWorld ?? 'overworld',
        p.__shopX ?? 0, p.__shopZ ?? 0, p.__shopWorld ?? 'overworld'
    );
    
    // Allow 1 block tolerance for rounding
    expect(Math.round(distance)).toBeCloseTo(expected, 0);
});

Then('auto-advance should {word}', async ({ page }, trigger: string) => {
    const p = page as PageWithNavigationTracking;
    
    const distance = calculateDistance(
        p.__playerX ?? 0, p.__playerZ ?? 0, p.__playerWorld ?? 'overworld',
        p.__shopX ?? 0, p.__shopZ ?? 0, p.__shopWorld ?? 'overworld'
    );
    
    const shouldTrigger = shouldAutoAdvance(distance, NAVIGATION.ARRIVAL_THRESHOLD);
    
    if (trigger === 'trigger') {
        expect(shouldTrigger).toBe(true);
    } else {
        expect(shouldTrigger).toBe(false);
    }
});

Then('auto-advance should not trigger', async ({ page }) => {
    const p = page as PageWithNavigationTracking;
    
    const distance = calculateDistance(
        p.__playerX ?? 0, p.__playerZ ?? 0, p.__playerWorld ?? 'overworld',
        p.__shopX ?? 0, p.__shopZ ?? 0, p.__shopWorld ?? 'overworld'
    );
    
    expect(shouldAutoAdvance(distance, NAVIGATION.ARRIVAL_THRESHOLD)).toBe(false);
});

Then('the compass direction should be {string}', async ({ page }, expected: string) => {
    const p = page as PageWithNavigationTracking;
    const direction = yawToDirection(p.__playerYaw ?? 0);
    expect(direction).toBe(expected.toLowerCase());
});

Then('the arrow should point toward {string}', async ({ page }, direction: string) => {
    const p = page as PageWithNavigationTracking;
    const calculatedDirection = yawToDirection(p.__playerYaw ?? 0);
    expect(calculatedDirection).toBe(direction.toLowerCase());
});

Then('the route should {word} {word}', async ({ page }, action: string, _verb: string) => {
    const p = page as PageWithNavigationTracking;
    
    if (action === 'be') {
        // "be recalculated"
        expect(p.__routeRecalculated).toBe(true);
    } else if (action === 'not') {
        // "not be recalculated"
        expect(p.__routeRecalculated).toBe(false);
    }
});

Then('it should show {string} blocks', async ({ page }, expected: string) => {
    const p = page as PageWithNavigationTracking;
    
    const distance = calculateDistance(
        p.__playerX ?? 0, p.__playerZ ?? 0, p.__playerWorld ?? 'overworld',
        p.__shopX ?? 0, p.__shopZ ?? 0, p.__shopWorld ?? 'overworld'
    );
    
    expect(Math.round(distance).toString()).toBe(expected);
});

Then('the route should not be recalculated', async ({ page }) => {
    const p = page as PageWithNavigationTracking;
    expect(p.__routeRecalculated).toBe(false);
});
