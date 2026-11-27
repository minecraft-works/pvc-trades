/**
 * Unit tests for src/routing/navigation-helpers.ts
 */
import { describe, expect, test } from 'vitest';

import { createTrade } from '../test-fixtures.js';
import type { RouteStop, Trade } from '../types.js';
import { aggregateShoppingList, buildMarkerContent, buildStopTooltip, calculateTotalRouteDistance, getZoomForHeight } from './navigation-helpers.js';

// String constants to avoid duplication
const OVERWORLD = 'overworld';
const THE_NETHER = 'the_nether';

// ============================================================================
// Shopping & Navigation Helpers Tests
// ============================================================================

describe('aggregateShoppingList', () => {
    test('returns empty maps for empty cart', () => {
        const result = aggregateShoppingList([]);
        expect(result.costs.size).toBe(0);
        expect(result.gains.size).toBe(0);
    });

    test('aggregates single item correctly', () => {
        const trade = createTrade(1, 10, 'Diamond Sword', 1);
        const result = aggregateShoppingList([{ trade, quantity: 2 }]);
        
        expect(result.costs.get('Emerald')).toBe(20); // 10 * 2
        expect(result.gains.get('Diamond Sword')).toBe(2); // 1 * 2
    });

    test('aggregates multiple items with same cost', () => {
        const trade1 = createTrade(1, 5, 'Item A', 1);
        const trade2 = createTrade(1, 3, 'Item B', 1);
        const result = aggregateShoppingList([
            { trade: trade1, quantity: 1 },
            { trade: trade2, quantity: 1 }
        ]);
        
        expect(result.costs.get('Emerald')).toBe(8); // 5 + 3
        expect(result.gains.get('Item A')).toBe(1);
        expect(result.gains.get('Item B')).toBe(1);
    });

    test('handles items with item2 cost', () => {
        const trade: Trade = {
            ...createTrade(1, 5, 'Special Item', 1),
            item2: { type: 'DIAMOND', name: '', amount: 2 }
        };
        const result = aggregateShoppingList([{ trade, quantity: 3 }]);
        
        expect(result.costs.get('Emerald')).toBe(15); // 5 * 3
        expect(result.costs.get('Diamond')).toBe(6); // 2 * 3
    });

    test('aggregates gains for same result item', () => {
        const trade1 = createTrade(64, 1, 'Cobblestone', 10);
        const trade2 = createTrade(32, 1, 'Cobblestone', 5);
        const result = aggregateShoppingList([
            { trade: trade1, quantity: 2 },
            { trade: trade2, quantity: 1 }
        ]);
        
        expect(result.gains.get('Cobblestone')).toBe(160); // 64*2 + 32*1
    });
});

// Helper functions for route tests
const createRouteStop = (x: number, z: number, world = OVERWORLD): RouteStop => ({
    x, z, world,
    type: 'shop',
    y: 64,
    displayX: world === THE_NETHER ? x * 8 : x,
    displayZ: world === THE_NETHER ? z * 8 : z,
    isNether: world === THE_NETHER
});

const createStopWithCartItem = (name: string, quantity: number, isNether = false, x = 100, z = 200): RouteStop => ({
    x, z, isNether,
    type: 'shop',
    y: 64,
    world: isNether ? THE_NETHER : OVERWORLD,
    displayX: isNether ? x * 8 : x,
    displayZ: isNether ? z * 8 : z,
    cartItem: {
        quantity,
        trade: createTrade(1, 1, name, 1, isNether ? THE_NETHER : OVERWORLD),
    }
});

describe('calculateTotalRouteDistance', () => {
    test('returns 0 for empty route', () => {
        expect(calculateTotalRouteDistance([])).toBe(0);
    });

    test('calculates distance from origin to single stop', () => {
        const route = [createRouteStop(100, 0)];
        expect(calculateTotalRouteDistance(route)).toBe(100);
    });

    test('calculates distance through multiple stops', () => {
        const route = [
            createRouteStop(100, 0),
            createRouteStop(100, 100)
        ];
        // From (0,0) to (100,0) = 100, then (100,0) to (100,100) = 100
        expect(calculateTotalRouteDistance(route)).toBe(200);
    });

    test('uses custom start position', () => {
        const route = [createRouteStop(100, 100)];
        // From (50, 50) to (100, 100) = hypot(50, 50) ≈ 70.7
        const distance = calculateTotalRouteDistance(route, 50, 50, OVERWORLD);
        expect(distance).toBeCloseTo(70.71, 1);
    });

    test('handles cross-dimension travel', () => {
        const route = [createRouteStop(100, 100, THE_NETHER)];
        // From overworld (0,0) to nether (100,100) which is equivalent to (800,800) in overworld
        const distance = calculateTotalRouteDistance(route, 0, 0, OVERWORLD);
        expect(distance).toBeCloseTo(Math.hypot(800, 800), 0);
    });
});

describe('buildMarkerContent', () => {
    test('builds numbered marker for incomplete stop', () => {
        const html = buildMarkerContent(false, 1, false);
        expect(html).toBe('<div class="nav-marker">1</div>');
    });

    test('builds checkmark marker for completed stop', () => {
        const html = buildMarkerContent(true, 99, false);
        expect(html).toContain('✓');
        expect(html).toContain('nav-marker--completed');
        expect(html).not.toContain('99'); // Index ignored when completed
    });

    test('includes nether indicator for nether stops', () => {
        const html = buildMarkerContent(false, 2, true);
        expect(html).toContain('🔥');
        expect(html).toContain('nether-indicator');
        expect(html).toContain('2');
    });

    test('includes nether indicator on completed nether stop', () => {
        const html = buildMarkerContent(true, 1, true);
        expect(html).toContain('✓');
        expect(html).toContain('🔥');
    });
});

describe('buildStopTooltip', () => {
    test('shows item quantity and name', () => {
        const stop = createStopWithCartItem('Diamond Pickaxe', 3);
        const tooltip = buildStopTooltip(stop, false);
        expect(tooltip).toBe('3× Diamond Pickaxe');
    });

    test('prefixes with checkmark when completed', () => {
        const stop = createStopWithCartItem('Iron Sword', 1);
        const tooltip = buildStopTooltip(stop, true);
        expect(tooltip).toContain('✓');
        expect(tooltip).toContain('(completed)');
    });

    test('shows nether coordinates for nether stops', () => {
        const stop = createStopWithCartItem('Blaze Rod', 5, true, 50, 75);
        const tooltip = buildStopTooltip(stop, false);
        expect(tooltip).toContain('Nether: 50, 75');
        expect(tooltip).toContain('(OW: 400, 600)'); // 50*8, 75*8
    });

    test('shows "Stop" for stops without cart item', () => {
        const stop: RouteStop = {
            type: 'shop',
            x: 0, y: 64, z: 0,
            world: OVERWORLD,
            displayX: 0, displayZ: 0,
            isNether: false
        };
        const tooltip = buildStopTooltip(stop, false);
        expect(tooltip).toBe('Stop');
    });
});

// ============================================================================
// getZoomForHeight
// ============================================================================

describe('getZoomForHeight', () => {
    // Linear interpolation: Y=63 → zoom 2, Y=300 → zoom -3
    // slope = (−3 − 2) / (300 − 63) = −5 / 237

    test('returns max zoom at or below ground level (Y ≤ 63)', () => {
        expect(getZoomForHeight(-64)).toBe(2);
        expect(getZoomForHeight(0)).toBe(2);
        expect(getZoomForHeight(63)).toBe(2);
    });

    test('returns min zoom at or above max height (Y ≥ 300)', () => {
        expect(getZoomForHeight(300)).toBe(-3);
        expect(getZoomForHeight(320)).toBe(-3);
        expect(getZoomForHeight(500)).toBe(-3);
    });

    test('returns exact midpoint zoom at midpoint height', () => {
        const midY = (63 + 300) / 2; // 181.5
        const midZoom = (2 + -3) / 2; // -0.5
        expect(getZoomForHeight(midY)).toBeCloseTo(midZoom, 5);
    });

    test('interpolates linearly between boundaries', () => {
        // At Y=63: zoom = 2, at Y=300: zoom = -3
        // Quarter: Y = 63 + 0.25 * 237 = 122.25, zoom = 2 + 0.25 * (-5) = 0.75
        expect(getZoomForHeight(122.25)).toBeCloseTo(0.75, 5);
        // Three-quarters: Y = 63 + 0.75 * 237 = 240.75, zoom = 2 + 0.75 * (-5) = -1.75
        expect(getZoomForHeight(240.75)).toBeCloseTo(-1.75, 5);
    });

    test('is monotonically decreasing within range', () => {
        const heights = [63, 80, 100, 120, 150, 200, 250, 300];
        for (let index = 1; index < heights.length; index++) {
            const previousZoom = getZoomForHeight(heights[index - 1] ?? 0);
            const currentZoom = getZoomForHeight(heights[index] ?? 0);
            expect(currentZoom).toBeLessThanOrEqual(previousZoom);
        }
    });

    test('handles negative Y values (below bedrock)', () => {
        expect(getZoomForHeight(-64)).toBe(2);
        expect(getZoomForHeight(-1)).toBe(2);
    });
});
