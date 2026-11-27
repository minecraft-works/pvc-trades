/**
 * Unit tests for src/routing/route-optimizer.ts
 */
import { describe, expect, test } from 'vitest';

import type { RoutePoint } from './route-optimizer.js';
import { buildDistanceMatrix, calculateOrderDistance, calculateRouteDistance, computeOptimalOrder, nearestNeighborOrder, toOverworldEquivalent, twoOptOptimize } from './route-optimizer.js';

// String constants to avoid duplication
const OVERWORLD = 'overworld';
const THE_NETHER = 'the_nether';

// ============================================================================
// Route Optimization Tests
// ============================================================================

describe('toOverworldEquivalent', () => {
    test('returns same coords for overworld', () => {
        const result = toOverworldEquivalent(100, 200, OVERWORLD);
        expect(result).toEqual({ x: 100, z: 200 });
    });

    test('multiplies coords by 8 for nether', () => {
        const result = toOverworldEquivalent(100, 200, THE_NETHER);
        expect(result).toEqual({ x: 800, z: 1600 });
    });

    test('handles nether case-insensitively', () => {
        expect(toOverworldEquivalent(10, 20, 'NETHER')).toEqual({ x: 80, z: 160 });
        expect(toOverworldEquivalent(10, 20, 'The_Nether')).toEqual({ x: 80, z: 160 });
    });

    test('handles negative coordinates for world conversion', () => {
        const result = toOverworldEquivalent(-50, -100, THE_NETHER);
        expect(result).toEqual({ x: -400, z: -800 });
    });
});

describe('calculateRouteDistance', () => {
    test('calculates distance between overworld points', () => {
        // Distance from (0,0) to (3,4) = 5
        const distribution = calculateRouteDistance(0, 0, OVERWORLD, 3, 4, OVERWORLD);
        expect(distribution).toBeCloseTo(5, 5);
    });

    test('calculates distance from overworld to nether using OW-equivalent', () => {
        // Nether point (10, 0) = OW-equivalent (80, 0)
        // Distance from origin = 80
        const distribution = calculateRouteDistance(0, 0, OVERWORLD, 10, 0, THE_NETHER);
        expect(distribution).toBeCloseTo(80, 5);
    });

    test('calculates distance between nether points using OW-equivalent', () => {
        // (0,0) nether = (0,0) OW-equiv
        // (10,0) nether = (80,0) OW-equiv
        // Distance = 80
        const distribution = calculateRouteDistance(0, 0, 'the_nether', 10, 0, 'the_nether');
        expect(distribution).toBeCloseTo(80, 5);
    });

    test('handles negative coordinates for route distance', () => {
        const distribution = calculateRouteDistance(-3, -4, 'overworld', 0, 0, 'overworld');
        expect(distribution).toBeCloseTo(5, 5);
    });
});

describe('buildDistanceMatrix', () => {
    test('returns 1x1 matrix for empty points', () => {
        const matrix = buildDistanceMatrix([]);
        expect(matrix).toEqual([[0]]);
    });

    test('builds correct matrix for single point', () => {
        const points: RoutePoint[] = [{ x: 3, z: 4, world: 'overworld' }];
        const matrix = buildDistanceMatrix(points);
        
        expect(matrix.length).toBe(2);
        expect(matrix[0]![0]).toBe(0); // Origin to itself
        expect(matrix[0]![1]).toBeCloseTo(5, 5); // Origin to point
        expect(matrix[1]![0]).toBeCloseTo(5, 5); // Point to origin
        expect(matrix[1]![1]).toBe(0); // Point to itself
    });

    test('builds symmetric matrix for multiple points', () => {
        const points: RoutePoint[] = [
            { x: 3, z: 0, world: 'overworld' },
            { x: 0, z: 4, world: 'overworld' }
        ];
        const matrix = buildDistanceMatrix(points);
        
        expect(matrix.length).toBe(3);
        // Check symmetry
        expect(matrix[0]![1]).toBe(matrix[1]![0]);
        expect(matrix[0]![2]).toBe(matrix[2]![0]);
        expect(matrix[1]![2]).toBe(matrix[2]![1]);
    });

    test('handles nether points correctly', () => {
        const points: RoutePoint[] = [{ x: 10, z: 0, world: 'the_nether' }];
        const matrix = buildDistanceMatrix(points);
        
        // Nether (10,0) = OW-equiv (80,0), distance from origin = 80
        expect(matrix[0]![1]).toBeCloseTo(80, 5);
    });

    test('uses custom origin when provided', () => {
        const points: RoutePoint[] = [{ x: 100, z: 0, world: 'overworld' }];
        const origin: RoutePoint = { x: 50, z: 0, world: 'overworld' };
        const matrix = buildDistanceMatrix(points, origin);
        
        // Distance from (50,0) to (100,0) = 50
        expect(matrix[0]![1]).toBeCloseTo(50, 5);
    });

    test('uses custom origin in nether', () => {
        const points: RoutePoint[] = [{ x: 100, z: 0, world: 'overworld' }];
        const origin: RoutePoint = { x: 10, z: 0, world: 'the_nether' };
        const matrix = buildDistanceMatrix(points, origin);
        
        // Origin nether (10,0) = OW-equiv (80,0)
        // Distance from (80,0) to (100,0) = 20
        expect(matrix[0]![1]).toBeCloseTo(20, 5);
    });

    test('custom origin affects distances between all points', () => {
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },  // 100 from (0,0), but 50 from (50,0)
            { x: 200, z: 0, world: 'overworld' }   // 200 from (0,0), but 150 from (50,0)
        ];
        const origin: RoutePoint = { x: 50, z: 0, world: 'overworld' };
        const matrix = buildDistanceMatrix(points, origin);
        
        // With origin at (50,0):
        // origin to point 0: |100-50| = 50
        // origin to point 1: |200-50| = 150
        // point 0 to point 1: |200-100| = 100 (unchanged by origin)
        expect(matrix[0]![1]).toBeCloseTo(50, 5);
        expect(matrix[0]![2]).toBeCloseTo(150, 5);
        expect(matrix[1]![2]).toBeCloseTo(100, 5);
    });
});

describe('nearestNeighborOrder', () => {
    test('returns empty array for empty points', () => {
        const matrix = buildDistanceMatrix([]);
        const order = nearestNeighborOrder([], matrix);
        expect(order).toEqual([]);
    });

    test('returns [0] for single point', () => {
        const points: RoutePoint[] = [{ x: 100, z: 100, world: 'overworld' }];
        const matrix = buildDistanceMatrix(points);
        const order = nearestNeighborOrder(points, matrix);
        expect(order).toEqual([0]);
    });

    test('visits nearest point first', () => {
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },  // 100 from origin
            { x: 10, z: 0, world: 'overworld' }    // 10 from origin (closest)
        ];
        const matrix = buildDistanceMatrix(points);
        const order = nearestNeighborOrder(points, matrix);
        
        expect(order[0]).toBe(1); // Index 1 is closest to origin
    });

    test('visits all points', () => {
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 50, z: 0, world: 'overworld' },
            { x: 200, z: 0, world: 'overworld' }
        ];
        const matrix = buildDistanceMatrix(points);
        const order = nearestNeighborOrder(points, matrix);
        
        expect(order.length).toBe(3);
        expect(order.toSorted((a, b) => a - b)).toEqual([0, 1, 2]);
    });

    test('follows greedy path', () => {
        // Points in a line: origin → 50 → 100 → 200
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },  // index 0
            { x: 50, z: 0, world: 'overworld' },   // index 1
            { x: 200, z: 0, world: 'overworld' }   // index 2
        ];
        const matrix = buildDistanceMatrix(points);
        const order = nearestNeighborOrder(points, matrix);
        
        // Should visit: 50 (closest to origin) → 100 → 200
        expect(order).toEqual([1, 0, 2]);
    });
});

describe('calculateOrderDistance', () => {
    test('returns 0 for empty order', () => {
        const matrix = buildDistanceMatrix([]);
        const distribution = calculateOrderDistance([], matrix);
        expect(distribution).toBe(0);
    });

    test('calculates distance for single point', () => {
        const points: RoutePoint[] = [{ x: 3, z: 4, world: 'overworld' }];
        const matrix = buildDistanceMatrix(points);
        const distribution = calculateOrderDistance([0], matrix);
        expect(distribution).toBeCloseTo(5, 5); // Origin to (3,4)
    });

    test('calculates total distance for multiple points', () => {
        // Points in a line at x=100, x=200
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 200, z: 0, world: 'overworld' }
        ];
        const matrix = buildDistanceMatrix(points);
        
        // Order [0, 1]: origin→100 + 100→200 = 100 + 100 = 200
        expect(calculateOrderDistance([0, 1], matrix)).toBeCloseTo(200, 5);
        
        // Order [1, 0]: origin→200 + 200→100 = 200 + 100 = 300
        expect(calculateOrderDistance([1, 0], matrix)).toBeCloseTo(300, 5);
    });
});

describe('twoOptOptimize', () => {
    test('returns copy for orders with less than 3 points', () => {
        const matrix = buildDistanceMatrix([{ x: 100, z: 0, world: 'overworld' }]);
        const order = [0];
        const result = twoOptOptimize(order, matrix);
        expect(result).toEqual([0]);
        expect(result).not.toBe(order); // Should be a copy
    });

    test('does not modify original order', () => {
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 200, z: 0, world: 'overworld' },
            { x: 300, z: 0, world: 'overworld' }
        ];
        const matrix = buildDistanceMatrix(points);
        const order = [0, 1, 2];
        const originalOrder = [...order];
        twoOptOptimize(order, matrix);
        expect(order).toEqual(originalOrder);
    });

    test('improves crossed path', () => {
        // Create a "crossed" configuration that 2-opt should fix
        // Points form a square: A(0,100), B(100,100), C(100,0), D(0,0) relative to some offset
        // If visited A→C→B→D, path crosses itself
        // Optimal is A→B→C→D or A→D→C→B
        const points: RoutePoint[] = [
            { x: 0, z: 100, world: 'overworld' },    // A - index 0
            { x: 100, z: 100, world: 'overworld' },  // B - index 1  
            { x: 100, z: 0, world: 'overworld' },    // C - index 2
            { x: 0, z: 0, world: 'overworld' }       // D - index 3 (but this is origin area)
        ];
        const matrix = buildDistanceMatrix(points);
        
        // Start with a suboptimal order
        const badOrder = [0, 2, 1, 3]; // A→C→B→D (crossed)
        const badDistribution = calculateOrderDistance(badOrder, matrix);
        
        const optimized = twoOptOptimize(badOrder, matrix);
        const optDistribution = calculateOrderDistance(optimized, matrix);
        
        // Optimized should be at least as good
        expect(optDistribution).toBeLessThanOrEqual(badDistribution);
    });

    test('returns same order if already optimal', () => {
        // Points in a straight line - already optimal
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 200, z: 0, world: 'overworld' },
            { x: 300, z: 0, world: 'overworld' }
        ];
        const matrix = buildDistanceMatrix(points);
        const order = [0, 1, 2]; // Already optimal: 0→100→200→300
        
        const optimized = twoOptOptimize(order, matrix);
        expect(optimized).toEqual([0, 1, 2]);
    });
});

describe('computeOptimalOrder', () => {
    test('returns empty array for empty points', () => {
        const order = computeOptimalOrder([]);
        expect(order).toEqual([]);
    });

    test('returns [0] for single point', () => {
        const points: RoutePoint[] = [{ x: 100, z: 100, world: 'overworld' }];
        const order = computeOptimalOrder(points);
        expect(order).toEqual([0]);
    });

    test('returns optimal order for simple case', () => {
        // Points in a line - should visit in distance order from origin
        const points: RoutePoint[] = [
            { x: 200, z: 0, world: 'overworld' },  // index 0, far
            { x: 100, z: 0, world: 'overworld' },  // index 1, medium
            { x: 50, z: 0, world: 'overworld' }    // index 2, close
        ];
        const order = computeOptimalOrder(points);
        
        // Optimal: 50 → 100 → 200 = indices [2, 1, 0]
        expect(order).toEqual([2, 1, 0]);
    });

    test('optimizes crossed path', () => {
        // Square configuration
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 100, z: 100, world: 'overworld' },
            { x: 0, z: 100, world: 'overworld' }
        ];
        
        const order = computeOptimalOrder(points);
        const matrix = buildDistanceMatrix(points);
        const totalDistribution = calculateOrderDistance(order, matrix);
        
        // Compare with worst possible order
        const worstOrder = [2, 0, 1]; // Zigzag
        const worstDistribution = calculateOrderDistance(worstOrder, matrix);
        
        expect(totalDistribution).toBeLessThanOrEqual(worstDistribution);
    });

    test('handles mixed overworld and nether points', () => {
        const points: RoutePoint[] = [
            { x: 800, z: 0, world: 'overworld' },   // 800 from origin
            { x: 100, z: 0, world: 'the_nether' }   // 800 from origin (OW-equiv)
        ];
        const order = computeOptimalOrder(points);
        
        // Both are same distance, order depends on implementation
        expect(order.length).toBe(2);
        expect(order.toSorted((a, b) => a - b)).toEqual([0, 1]);
    });

    test('visits all points exactly once', () => {
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 0, z: 100, world: 'overworld' },
            { x: -100, z: 0, world: 'overworld' },
            { x: 0, z: -100, world: 'overworld' },
            { x: 50, z: 50, world: 'overworld' }
        ];
        const order = computeOptimalOrder(points);
        
        expect(order.length).toBe(5);
        expect(order.toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    });

    test('uses custom origin for route calculation', () => {
        // With origin at (0,0): order should be [2, 1, 0] (50→100→200)
        // With origin at (200,0): order should be [0, 1, 2] (200→100→50)
        const points: RoutePoint[] = [
            { x: 200, z: 0, world: 'overworld' },  // index 0
            { x: 100, z: 0, world: 'overworld' },  // index 1
            { x: 50, z: 0, world: 'overworld' }    // index 2
        ];
        
        // From default origin (0,0) - closest is 50
        const orderFromOrigin = computeOptimalOrder(points);
        expect(orderFromOrigin[0]).toBe(2); // 50 is closest to origin
        
        // From custom origin (200,0) - closest is 200
        const customOrigin: RoutePoint = { x: 200, z: 0, world: 'overworld' };
        const orderFromCustom = computeOptimalOrder(points, customOrigin);
        expect(orderFromCustom[0]).toBe(0); // 200 is closest to (200,0)
    });

    test('uses custom origin in nether world', () => {
        // Origin in nether at (100,0) = OW-equiv (800,0)
        // Points are in overworld
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },  // 700 from origin
            { x: 750, z: 0, world: 'overworld' }   // 50 from origin
        ];
        const netherOrigin: RoutePoint = { x: 100, z: 0, world: 'the_nether' };
        const order = computeOptimalOrder(points, netherOrigin);
        
        // Point at 750 is closer to nether origin (50 blocks away)
        expect(order[0]).toBe(1); // 750 is closest
    });

    test('custom origin respects different worlds', () => {
        // Player in overworld at (0,0), shops mixed between worlds
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },  // 100 from player
            { x: 50, z: 0, world: 'the_nether' }   // 400 from player (OW-equiv)
        ];
        const playerOrigin: RoutePoint = { x: 0, z: 0, world: 'overworld' };
        const order = computeOptimalOrder(points, playerOrigin);
        
        // Overworld point (100,0) is closer than nether point (OW-equiv 400,0)
        expect(order[0]).toBe(0);
    });
});
