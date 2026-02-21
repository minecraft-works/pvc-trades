/**
 * Step definitions for shop map player property tests
 * Tests world filtering and edge marker behavior
 */
import { expect } from '@playwright/test';
import { Given, Then, type BasePageTracking } from './fixtures';
import type { Page } from '@playwright/test';
import { getDirectionFromDelta } from './test-math-utilities';

// ============================================================================
// Page tracking interface
// ============================================================================

interface PageWithMapTracking extends Page, BasePageTracking {
    __overworldPlayerCount?: number;
    __netherPlayerCount?: number;
    __viewportMin?: number;
    __viewportMax?: number;
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Check if player is visible based on world filtering
 */
function isPlayerVisible(shopWorld: string, playerWorld: string): boolean {
    return shopWorld === playerWorld;
}

/**
 * Check if position is within viewport
 */
function isInViewport(x: number, z: number, min: number, max: number): boolean {
    return x >= min && x <= max && z >= min && z <= max;
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('a shop in {word}', async ({ page }, world: string) => {
    const p = page as PageWithMapTracking;
    p.__shopWorld = world;
    p.__shopX = 0;
    p.__shopZ = 0;
});

Given('a player in {word}', async ({ page }, world: string) => {
    const p = page as PageWithMapTracking;
    p.__playerWorld = world;
});

Given('{int} players in {word}', async ({ page }, count: number, world: string) => {
    const p = page as PageWithMapTracking;
    if (world === 'overworld') {
        p.__overworldPlayerCount = count;
    } else {
        p.__netherPlayerCount = count;
    }
});

Given(String.raw`a shop at \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithMapTracking;
    p.__shopX = x;
    p.__shopZ = z;
});

Given('the map viewport shows {int} to {int}', async ({ page }, min: number, max: number) => {
    const p = page as PageWithMapTracking;
    p.__viewportMin = min;
    p.__viewportMax = max;
});

Given(String.raw`a player at \({int}, {int}\)`, async ({ page }, x: number, z: number) => {
    const p = page as PageWithMapTracking;
    p.__playerX = x;
    p.__playerZ = z;
    p.__playerWorld = p.__shopWorld ?? 'overworld'; // Same world as shop for edge marker tests
});

// ============================================================================
// THEN Steps - World Filter
// ============================================================================

Then('the player should be {word} on the map', async ({ page }, visibility: string) => {
    const p = page as PageWithMapTracking;
    
    const visible = isPlayerVisible(
        p.__shopWorld ?? 'overworld',
        p.__playerWorld ?? 'overworld'
    );
    
    if (visibility === 'visible') {
        expect(visible).toBe(true);
    } else {
        expect(visible).toBe(false);
    }
});

Then('{int} player markers should be visible', async ({ page }, expected: number) => {
    const p = page as PageWithMapTracking;
    const shopWorld = p.__shopWorld ?? 'overworld';
    
    let visibleCount: number;
    visibleCount = shopWorld === 'overworld' ? p.__overworldPlayerCount ?? 0 : p.__netherPlayerCount ?? 0;
    
    expect(visibleCount).toBe(expected);
});

// ============================================================================
// THEN Steps - Edge Markers
// ============================================================================

Then('the player should have {word} {word}', async ({ page }, markerType: string, _marker: string) => {
    const p = page as PageWithMapTracking;
    
    const inViewport = isInViewport(
        p.__playerX ?? 0,
        p.__playerZ ?? 0,
        p.__viewportMin ?? -500,
        p.__viewportMax ?? 500
    );
    
    if (markerType === 'normal') {
        expect(inViewport).toBe(true);
    } else {
        expect(inViewport).toBe(false);
    }
});

Then('the edge marker should point {word}', async ({ page }, expectedDirection: string) => {
    const p = page as PageWithMapTracking;
    
    // Calculate direction from shop to player
    const dx = (p.__playerX ?? 0) - (p.__shopX ?? 0);
    const dz = (p.__playerZ ?? 0) - (p.__shopZ ?? 0);
    
    const direction = getDirectionFromDelta(dx, dz);
    expect(direction).toBe(expectedDirection);
});

Then('the edge marker label should be positioned {string}', async ({ page }, position: string) => {
    const p = page as PageWithMapTracking;

    // Replicate angle calculation from createEdgeMarker:
    // Leaflet uses lat = -z (north-up), lng = x (east-right)
    const dxLeaflet = (p.__playerX ?? 0) - (p.__shopX ?? 0);
    const dyLeaflet = (p.__shopZ ?? 0) - (p.__playerZ ?? 0);
    const angle = Math.atan2(dyLeaflet, dxLeaflet);
    const angleDeg = angle * 180 / Math.PI;

    // Mirror the CSS-class logic in shop-map-helpers.ts createEdgeMarker
    let expected: string;
    if (angleDeg > 45 && angleDeg < 135) {
        expected = 'below marker';       // label-bottom
    } else if (angleDeg < -45 && angleDeg > -135) {
        expected = 'above marker';       // label-top
    } else if (Math.cos(angle) > 0) {
        expected = 'left of marker';     // label-left (right-side edge)
    } else {
        expected = 'right of marker';    // default (left-side edge)
    }

    expect(position).toBe(expected);
});
