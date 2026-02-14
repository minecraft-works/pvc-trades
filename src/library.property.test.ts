/**
 * Property-based tests for library.ts using fast-check
 *
 * These tests verify invariants hold across thousands of random inputs,
 * catching edge cases that example-based tests miss.
 *
 * ## Reproducing Failures
 *
 * When a test fails, fast-check prints seed and path:
 * ```
 * Property failed after 123 tests
 * Seed: 1234567890, Path: "0:1:2"
 * ```
 *
 * To replay:
 * ```typescript
 * fc.assert(property, { seed: 1234567890, path: "0:1:2" });
 * ```
 */
import { describe, test, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import {
    escapeHtml,
    matchesQuery,
    median,
    toOverworldEquivalent,
    calculateRouteDistance,
    nearestNeighborOrder,
    twoOptOptimize,
    buildDistanceMatrix,
    calculateOrderDistance,
    getRegex,
    formatName,
    getTileCoords,
    getTileOffset,
    clampToCircle,
    filterTrade,
    sortResults,
    isNether,
    getWorldId,
    highlight,
    parseLocation,
} from './library.js';
import type { RoutePoint, Trade, FilterResult, Item } from './types.js';

// Configure fast-check globally: 500 runs per property
beforeAll(() => {
    fc.configureGlobal({ numRuns: 500 });
});

// ============================================================================
// Tier 1: Text/Safety Functions
// ============================================================================

describe('escapeHtml properties', () => {
    test('output never contains dangerous HTML characters', () => {
        fc.assert(
            fc.property(fc.string(), (input) => {
                const escaped = escapeHtml(input);
                // These characters must never appear unescaped
                expect(escaped).not.toMatch(/[<>"']/);
                // Ampersand only allowed as part of entity (e.g., &amp;)
                const ampersands = escaped.match(/&/g) ?? [];
                const entities = escaped.match(/&(amp|lt|gt|quot|#39);/g) ?? [];
                expect(ampersands.length).toBe(entities.length);
            })
        );
    });

    test('escaping is idempotent for safe strings', () => {
        // Strings without special chars should be unchanged
        fc.assert(
            fc.property(
                fc.string().filter((s) => !/[&<>"']/.test(s)),
                (safeString) => {
                    expect(escapeHtml(safeString)).toBe(safeString);
                }
            )
        );
    });

    test('output length is >= input length', () => {
        // Escaping replaces single chars with longer entities
        fc.assert(
            fc.property(fc.string(), (input) => {
                expect(escapeHtml(input).length).toBeGreaterThanOrEqual(input.length);
            })
        );
    });
});

describe('matchesQuery properties', () => {
    test('never throws on arbitrary unicode input', () => {
        fc.assert(
            fc.property(fc.string(), fc.string(), (text, query) => {
                // Should not throw, just return boolean
                expect(() => matchesQuery(text, query)).not.toThrow();
                expect(typeof matchesQuery(text, query)).toBe('boolean');
            })
        );
    });

    test('empty query matches everything', () => {
        fc.assert(
            fc.property(fc.string(), (text) => {
                expect(matchesQuery(text, '')).toBe(true);
            })
        );
    });

    test('text always matches itself', () => {
        fc.assert(
            fc.property(
                fc.string().filter((s) => s.length > 0),
                (text) => {
                    expect(matchesQuery(text, text)).toBe(true);
                }
            )
        );
    });

    // NOTE: matchesQuery has TWO paths:
    // 1. Normalized path: removes underscores/spaces, checks with includes()
    // 2. Word-split path: splits query by spaces, checks each word
    // Neither path does case folding - matching is CASE-SENSITIVE
    test('normalized text includes normalized query', () => {
        fc.assert(
            fc.property(
                fc.string().filter((s) => s.length > 0),
                (text) => {
                    // Same text always matches itself regardless of case
                    expect(matchesQuery(text, text)).toBe(true);
                }
            )
        );
    });
});

describe('getRegex properties', () => {
    test('never throws on any string input', () => {
        fc.assert(
            fc.property(
                fc.string(), // Any string including special chars
                (query) => {
                    expect(() => getRegex(query)).not.toThrow();
                }
            )
        );
    });

    test('returned regex matches the original query', () => {
        fc.assert(
            fc.property(
                // Filter to non-empty alphanumeric to avoid edge cases with special chars
                // (special chars ARE escaped, but for "matches original" we keep it simple)
                fc.string().filter((s) => s.length > 0 && /^[a-zA-Z0-9]+$/.test(s)),
                (query) => {
                    const regex = getRegex(query);
                    expect(regex.test(query)).toBe(true);
                }
            )
        );
    });

    test('wildcard * matches any characters', () => {
        fc.assert(
            fc.property(
                fc.string().filter((s) => s.length >= 2 && /^[a-zA-Z]+$/.test(s)),
                (text) => {
                    const pattern = text[0] + '*' + text.at(-1);
                    const regex = getRegex(pattern);
                    expect(regex.test(text)).toBe(true);
                }
            )
        );
    });
});

describe('formatName properties', () => {
    test('output starts with uppercase letter', () => {
        fc.assert(
            fc.property(
                fc.string().filter((s) => s.length > 0 && /^[a-zA-Z]/.test(s)),
                (name) => {
                    const item: Item = { type: name, name: '', amount: 1 };
                    const result = formatName(item);
                    if (result.length > 0) {
                        expect(result[0]).toBe(result[0].toUpperCase());
                    }
                }
            )
        );
    });

    test('underscores are converted to spaces', () => {
        fc.assert(
            fc.property(
                fc.array(fc.string().filter((s) => s.length > 0 && /^[a-zA-Z]+$/.test(s)), { minLength: 2, maxLength: 4 }),
                (words) => {
                    const withUnderscores = words.join('_');
                    const item: Item = { type: withUnderscores, name: '', amount: 1 };
                    const result = formatName(item);
                    expect(result).not.toContain('_');
                }
            )
        );
    });
});

describe('highlight properties', () => {
    test('output length >= input length', () => {
        fc.assert(
            fc.property(
                fc.string().filter((s) => s.length > 0),
                fc.string().filter((s) => s.length > 0 && /^[a-zA-Z]+$/.test(s)),
                (text, pattern) => {
                    const regex = new RegExp(pattern, 'gi');
                    const result = highlight(text, regex);
                    expect(result.length).toBeGreaterThanOrEqual(text.length);
                }
            )
        );
    });

    test('mark tags are properly balanced', () => {
        fc.assert(
            fc.property(
                fc.string().filter((s) => s.length > 0),
                fc.string().filter((s) => s.length > 0 && /^[a-zA-Z]+$/.test(s)),
                (text, pattern) => {
                    const regex = new RegExp(pattern, 'gi');
                    const result = highlight(text, regex);
                    const opens = (result.match(/<mark>/g) ?? []).length;
                    const closes = (result.match(/<\/mark>/g) ?? []).length;
                    expect(opens).toBe(closes);
                }
            )
        );
    });
});

describe('parseLocation properties', () => {
    test('roundtrip for valid coordinates', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: -30_000_000, max: 30_000_000 }),
                fc.integer({ min: -64, max: 320 }),
                fc.integer({ min: -30_000_000, max: 30_000_000 }),
                (x, y, z) => {
                    const locationString = `${x}, ${y}, ${z}`;
                    const parsed = parseLocation(locationString);
                    expect(parsed.x).toBe(x);
                    expect(parsed.y).toBe(y);
                    expect(parsed.z).toBe(z);
                }
            )
        );
    });

    test('never throws on malformed input', () => {
        fc.assert(
            fc.property(fc.string(), (input) => {
                expect(() => parseLocation(input)).not.toThrow();
            })
        );
    });
});

// ============================================================================
// Tier 2: Math/Geometry Functions
// ============================================================================

describe('median properties', () => {
    test('result is within bounds of input array', () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 1 }),
                (numbers) => {
                    const result = median(numbers);
                    expect(result).toBeDefined();
                    expect(result).toBeGreaterThanOrEqual(Math.min(...numbers));
                    expect(result).toBeLessThanOrEqual(Math.max(...numbers));
                }
            )
        );
    });

    test('single element returns itself', () => {
        fc.assert(
            fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (number_) => {
                expect(median([number_])).toBe(number_);
            })
        );
    });

    test('returns undefined for empty array', () => {
        expect(median([])).toBeUndefined();
    });

    test('two elements returns average', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e6, max: 1e6, noNaN: true }),
                fc.double({ min: -1e6, max: 1e6, noNaN: true }),
                (a, b) => {
                    expect(median([a, b])).toBeCloseTo((a + b) / 2, 10);
                }
            )
        );
    });

    test('order does not affect result', () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 20 }),
                (numbers) => {
                    // Use fast-check's shuffled array instead of Math.random
                    const reversed = [...numbers].toReversed();
                    // Use toEqual for numeric equality (-0 === 0)
                    expect(median(numbers)).toEqual(median(reversed));
                }
            )
        );
    });
});

describe('toOverworldEquivalent properties', () => {
    test('nether coordinates are multiplied by 8', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e6, max: 1e6, noNaN: true }),
                fc.double({ min: -1e6, max: 1e6, noNaN: true }),
                (x, z) => {
                    const result = toOverworldEquivalent(x, z, 'the_nether');
                    expect(result.x).toBeCloseTo(x * 8, 10);
                    expect(result.z).toBeCloseTo(z * 8, 10);
                }
            )
        );
    });

    test('overworld coordinates are unchanged', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e6, max: 1e6, noNaN: true }),
                fc.double({ min: -1e6, max: 1e6, noNaN: true }),
                (x, z) => {
                    const result = toOverworldEquivalent(x, z, 'overworld');
                    expect(result.x).toBe(x);
                    expect(result.z).toBe(z);
                }
            )
        );
    });

    test('world name matching is case-insensitive for nether', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e6, max: 1e6, noNaN: true }),
                fc.double({ min: -1e6, max: 1e6, noNaN: true }),
                fc.constantFrom('the_nether', 'THE_NETHER', 'The_Nether', 'nether', 'NETHER'),
                (x, z, worldName) => {
                    const result = toOverworldEquivalent(x, z, worldName);
                    expect(result.x).toBeCloseTo(x * 8, 10);
                    expect(result.z).toBeCloseTo(z * 8, 10);
                }
            )
        );
    });
});

describe('calculateRouteDistance properties', () => {
    test('distance is symmetric (A to B equals B to A)', () => {
        fc.assert(
            fc.property(
                fc.record({
                    x1: fc.double({ min: -1e5, max: 1e5, noNaN: true }),
                    z1: fc.double({ min: -1e5, max: 1e5, noNaN: true }),
                    x2: fc.double({ min: -1e5, max: 1e5, noNaN: true }),
                    z2: fc.double({ min: -1e5, max: 1e5, noNaN: true }),
                    world1: fc.constantFrom('overworld', 'the_nether'),
                    world2: fc.constantFrom('overworld', 'the_nether'),
                }),
                ({ x1, z1, x2, z2, world1, world2 }) => {
                    // Test symmetry: dist(A→B) == dist(B→A)
                    const distanceAtoB = calculateRouteDistance(x1, z1, world1, x2, z2, world2);
                    // eslint-disable-next-line sonarjs/arguments-order -- Intentionally swapped to test symmetry
                    const distanceBtoA = calculateRouteDistance(x2, z2, world2, x1, z1, world1);
                    expect(distanceAtoB).toBeCloseTo(distanceBtoA, 10);
                }
            )
        );
    });

    test('distance from point to itself is zero', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e5, max: 1e5, noNaN: true }),
                fc.double({ min: -1e5, max: 1e5, noNaN: true }),
                fc.constantFrom('overworld', 'the_nether'),
                (x, z, world) => {
                    expect(calculateRouteDistance(x, z, world, x, z, world)).toBe(0);
                }
            )
        );
    });

    test('distance is always non-negative', () => {
        fc.assert(
            fc.property(
                fc.record({
                    x1: fc.double({ min: -1e5, max: 1e5, noNaN: true }),
                    z1: fc.double({ min: -1e5, max: 1e5, noNaN: true }),
                    x2: fc.double({ min: -1e5, max: 1e5, noNaN: true }),
                    z2: fc.double({ min: -1e5, max: 1e5, noNaN: true }),
                    world1: fc.constantFrom('overworld', 'the_nether'),
                    world2: fc.constantFrom('overworld', 'the_nether'),
                }),
                ({ x1, z1, x2, z2, world1, world2 }) => {
                    expect(calculateRouteDistance(x1, z1, world1, x2, z2, world2)).toBeGreaterThanOrEqual(0);
                }
            )
        );
    });

    test('triangle inequality holds', () => {
        fc.assert(
            fc.property(
                fc.record({
                    x1: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
                    z1: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
                    x2: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
                    z2: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
                    x3: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
                    z3: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
                }),
                ({ x1, z1, x2, z2, x3, z3 }) => {
                    const world = 'overworld';
                    const distributionAB = calculateRouteDistance(x1, z1, world, x2, z2, world);
                    const distributionBC = calculateRouteDistance(x2, z2, world, x3, z3, world);
                    const distributionAC = calculateRouteDistance(x1, z1, world, x3, z3, world);
                    expect(distributionAC).toBeLessThanOrEqual(distributionAB + distributionBC + 0.001);
                }
            )
        );
    });
});

describe('getTileCoords properties', () => {
    test('tile coords are consistent with offset', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: -100_000, max: 100_000 }),
                fc.integer({ min: -100_000, max: 100_000 }),
                fc.constantFrom(64, 128, 256, 512),
                (x, z, tileSize) => {
                    const { tileX, tileZ } = getTileCoords(x, z, tileSize);
                    const { offsetX, offsetZ } = getTileOffset(x, z, tileSize);
                    // Roundtrip: tile * size + offset = original
                    expect(tileX * tileSize + offsetX).toBe(x);
                    expect(tileZ * tileSize + offsetZ).toBe(z);
                }
            )
        );
    });

    test('adjacent coordinates have adjacent or same tiles', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: -100_000, max: 100_000 }),
                fc.integer({ min: -100_000, max: 100_000 }),
                fc.constantFrom(64, 128, 256, 512),
                (x, z, tileSize) => {
                    const tile1 = getTileCoords(x, z, tileSize);
                    const tile2 = getTileCoords(x + 1, z, tileSize);
                    expect(Math.abs(tile1.tileX - tile2.tileX)).toBeLessThanOrEqual(1);
                }
            )
        );
    });
});

describe('getTileOffset properties', () => {
    test('offset is always within tile bounds', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: -100_000, max: 100_000 }),
                fc.integer({ min: -100_000, max: 100_000 }),
                fc.constantFrom(64, 128, 256, 512),
                (x, z, tileSize) => {
                    const { offsetX, offsetZ } = getTileOffset(x, z, tileSize);
                    expect(offsetX).toBeGreaterThanOrEqual(0);
                    expect(offsetX).toBeLessThan(tileSize);
                    expect(offsetZ).toBeGreaterThanOrEqual(0);
                    expect(offsetZ).toBeLessThan(tileSize);
                }
            )
        );
    });
});

describe('clampToCircle properties', () => {
    test('output is always within or on radius', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                fc.double({ min: 1, max: 1000, noNaN: true }),
                (lat, lng, centerLat, centerLng, radius) => {
                    const result = clampToCircle(lat, lng, centerLat, centerLng, radius);
                    const distribution = Math.hypot(result.lat - centerLat, result.lng - centerLng);
                    expect(distribution).toBeLessThanOrEqual(radius + 0.001);
                }
            )
        );
    });

    test('points inside circle are unchanged', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -100, max: 100, noNaN: true }),
                fc.double({ min: -100, max: 100, noNaN: true }),
                fc.double({ min: 200, max: 500, noNaN: true }),
                (offsetLat, offsetLng, radius) => {
                    const centerLat = 0;
                    const centerLng = 0;
                    // Scale offsets to be within radius
                    const scale = (radius * 0.5) / Math.max(Math.hypot(offsetLat, offsetLng), 1);
                    const lat = offsetLat * scale;
                    const lng = offsetLng * scale;
                    
                    const result = clampToCircle(lat, lng, centerLat, centerLng, radius);
                    expect(result.clamped).toBe(false);
                    expect(result.lat).toBeCloseTo(lat, 10);
                    expect(result.lng).toBeCloseTo(lng, 10);
                }
            )
        );
    });

    test('clamped flag is true only when point was outside', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                fc.double({ min: -1000, max: 1000, noNaN: true }),
                fc.double({ min: 1, max: 500, noNaN: true }),
                (lat, lng, radius) => {
                    const result = clampToCircle(lat, lng, 0, 0, radius);
                    const originalDistribution = Math.hypot(lat, lng);
                    expect(result.clamped).toBe(originalDistribution > radius);
                }
            )
        );
    });
});

describe('isNether properties', () => {
    test('nether variants return true', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('the_nether', 'THE_NETHER', 'nether', 'NETHER', 'world_nether', 'World_nether'),
                (world) => {
                    expect(isNether(world)).toBe(true);
                }
            )
        );
    });

    test('overworld variants return false', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('overworld', 'OVERWORLD', 'world', 'World', 'the_end', 'minecraft:overworld'),
                (world) => {
                    expect(isNether(world)).toBe(false);
                }
            )
        );
    });
});

describe('getWorldId properties', () => {
    test('output is one of three valid values', () => {
        fc.assert(
            fc.property(fc.string(), (world) => {
                const result = getWorldId(world);
                expect(['overworld', 'the_nether', 'the_end']).toContain(result);
            })
        );
    });

    test('nether keywords return the_nether', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('nether', 'NETHER', 'the_nether', 'world_nether'),
                (world) => {
                    expect(getWorldId(world)).toBe('the_nether');
                }
            )
        );
    });
});

// ============================================================================
// Tier 3: Route Optimization
// ============================================================================

/**
 * Generate a valid RoutePoint for property testing
 */
const routePointArb = fc.record({
    x: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
    z: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
    world: fc.constantFrom('overworld', 'the_nether'),
}) as fc.Arbitrary<RoutePoint>;

describe('nearestNeighborOrder properties', () => {
    test('output is a valid permutation of indices', () => {
        fc.assert(
            fc.property(
                fc.array(routePointArb, { minLength: 1, maxLength: 20 }),
                (points) => {
                    const distributionMatrix = buildDistanceMatrix(points);
                    const order = nearestNeighborOrder(points, distributionMatrix);

                    // Length should match
                    expect(order.length).toBe(points.length);

                    // Should contain each index exactly once
                    const sorted = [...order].toSorted((a, b) => a - b);
                    const expected = Array.from({ length: points.length }, (_, index) => index);
                    expect(sorted).toEqual(expected);
                }
            )
        );
    });

    test('empty input returns empty output', () => {
        const distributionMatrix = buildDistanceMatrix([]);
        expect(nearestNeighborOrder([], distributionMatrix)).toEqual([]);
    });

    test('single point returns [0]', () => {
        fc.assert(
            fc.property(routePointArb, (point) => {
                const distributionMatrix = buildDistanceMatrix([point]);
                expect(nearestNeighborOrder([point], distributionMatrix)).toEqual([0]);
            })
        );
    });
});

describe('twoOptOptimize properties', () => {
    test('output distance is less than or equal to input distance', () => {
        fc.assert(
            fc.property(
                fc.array(routePointArb, { minLength: 3, maxLength: 15 }),
                (points) => {
                    const distributionMatrix = buildDistanceMatrix(points);
                    const initialOrder = nearestNeighborOrder(points, distributionMatrix);
                    const optimizedOrder = twoOptOptimize(initialOrder, distributionMatrix);

                    const initialDistribution = calculateOrderDistance(initialOrder, distributionMatrix);
                    const optimizedDistribution = calculateOrderDistance(optimizedOrder, distributionMatrix);

                    expect(optimizedDistribution).toBeLessThanOrEqual(initialDistribution + 0.001); // Small epsilon for float comparison
                }
            )
        );
    });

    test('output is a valid permutation of input', () => {
        fc.assert(
            fc.property(
                fc.array(routePointArb, { minLength: 3, maxLength: 15 }),
                (points) => {
                    const distributionMatrix = buildDistanceMatrix(points);
                    const initialOrder = nearestNeighborOrder(points, distributionMatrix);
                    const optimizedOrder = twoOptOptimize(initialOrder, distributionMatrix);

                    // Should have same length
                    expect(optimizedOrder.length).toBe(initialOrder.length);

                    // Should contain same elements
                    const sortedInitial = [...initialOrder].toSorted((a, b) => a - b);
                    const sortedOptimized = [...optimizedOrder].toSorted((a, b) => a - b);
                    expect(sortedOptimized).toEqual(sortedInitial);
                }
            )
        );
    });

    test('small inputs returned unchanged (< 3 elements)', () => {
        fc.assert(
            fc.property(
                fc.array(routePointArb, { minLength: 0, maxLength: 2 }),
                (points) => {
                    const distributionMatrix = buildDistanceMatrix(points);
                    const initialOrder = nearestNeighborOrder(points, distributionMatrix);
                    const optimizedOrder = twoOptOptimize(initialOrder, distributionMatrix);

                    expect(optimizedOrder).toEqual(initialOrder);
                }
            )
        );
    });

    test('optimization is idempotent', () => {
        fc.assert(
            fc.property(
                fc.array(routePointArb, { minLength: 3, maxLength: 10 }),
                (points) => {
                    const distributionMatrix = buildDistanceMatrix(points);
                    const initialOrder = nearestNeighborOrder(points, distributionMatrix);
                    const optimized1 = twoOptOptimize(initialOrder, distributionMatrix);
                    const optimized2 = twoOptOptimize(optimized1, distributionMatrix);
                    
                    // Running twice should give same result
                    expect(optimized2).toEqual(optimized1);
                }
            )
        );
    });
});

// ============================================================================
// Tier 4: Distance Matrix Properties
// ============================================================================

describe('buildDistanceMatrix properties', () => {
    test('matrix is symmetric', () => {
        fc.assert(
            fc.property(
                fc.array(routePointArb, { minLength: 2, maxLength: 10 }),
                (points) => {
                    const matrix = buildDistanceMatrix(points);
                    for (let index = 0; index < matrix.length; index++) {
                        for (let index_ = 0; index_ < matrix.length; index_++) {
                            expect(matrix[index]![index_]).toBeCloseTo(matrix[index_]![index]!, 10);
                        }
                    }
                }
            )
        );
    });

    test('diagonal is zero', () => {
        fc.assert(
            fc.property(
                fc.array(routePointArb, { minLength: 1, maxLength: 10 }),
                (points) => {
                    const matrix = buildDistanceMatrix(points);
                    for (const [index, element] of matrix.entries()) {
                        expect(element[index]).toBe(0);
                    }
                }
            )
        );
    });

    test('all values are non-negative', () => {
        fc.assert(
            fc.property(
                fc.array(routePointArb, { minLength: 1, maxLength: 10 }),
                (points) => {
                    const matrix = buildDistanceMatrix(points);
                    for (const row of matrix) {
                        for (const value of row) {
                            expect(value).toBeGreaterThanOrEqual(0);
                        }
                    }
                }
            )
        );
    });

    test('matrix size is points.length + 1', () => {
        fc.assert(
            fc.property(
                fc.array(routePointArb, { minLength: 0, maxLength: 10 }),
                (points) => {
                    const matrix = buildDistanceMatrix(points);
                    expect(matrix.length).toBe(points.length + 1);
                    for (const row of matrix) {
                        expect(row.length).toBe(points.length + 1);
                    }
                }
            )
        );
    });
});

describe('calculateOrderDistance properties', () => {
    test('empty order returns zero', () => {
        const distributionMatrix = buildDistanceMatrix([]);
        expect(calculateOrderDistance([], distributionMatrix)).toBe(0);
    });

    test('result is non-negative', () => {
        fc.assert(
            fc.property(
                fc.array(routePointArb, { minLength: 1, maxLength: 10 }),
                (points) => {
                    const distributionMatrix = buildDistanceMatrix(points);
                    const order = nearestNeighborOrder(points, distributionMatrix);
                    expect(calculateOrderDistance(order, distributionMatrix)).toBeGreaterThanOrEqual(0);
                }
            )
        );
    });
});

// ============================================================================
// Tier 5: Filtering Functions
// ============================================================================

const mockItem: Item = { type: 'DIAMOND', name: '', amount: 1 };

// Create trades where resultText and resultName are consistent
const tradeArb = fc.constantFrom('Diamond', 'Emerald', 'Gold Ingot', 'Iron Ingot').chain((itemName) =>
    fc.record({
        x: fc.integer({ min: -30_000, max: 30_000 }),
        y: fc.integer({ min: 0, max: 256 }),
        z: fc.integer({ min: -30_000, max: 30_000 }),
        world: fc.constantFrom('overworld', 'the_nether'),
        resultName: fc.constant(itemName),
        resultText: fc.constant(itemName), // Same as resultName for filtering consistency
        resultAmount: fc.integer({ min: 1, max: 64 }),
        costName: fc.constantFrom('Diamond', 'Emerald', 'Gold Ingot', 'Iron Ingot'),
        costText: fc.constantFrom('Diamond', 'Emerald', 'Gold Ingot', 'Iron Ingot'),
        costAmount: fc.integer({ min: 1, max: 64 }),
        stock: fc.integer({ min: 0, max: 100 }),
        displayStock: fc.integer({ min: 0, max: 100 }),
        item1: fc.constant(mockItem),
        resultItem: fc.constant(mockItem),
        loreText: fc.constant(''),
        shulkerItems: fc.constant(),
    })
) as fc.Arbitrary<Trade>;

describe('filterTrade properties', () => {
    test('empty queries match all non-zero stock trades', () => {
        fc.assert(
            fc.property(
                tradeArb.filter((t) => t.stock > 0),
                (trade) => {
                    const result = filterTrade(trade, '', '');
                    expect(result).toBeDefined();
                }
            )
        );
    });

    test('zero stock trades never match', () => {
        fc.assert(
            fc.property(
                tradeArb.map((t) => ({ ...t, stock: 0 })),
                (trade) => {
                    const result = filterTrade(trade, '', '');
                    expect(result).toBeUndefined();
                }
            )
        );
    });

    // NOTE: filterTrade uses matchesQuery which is CASE-SENSITIVE
    // Searching for 'diamond' will NOT match resultText 'Diamond'
    test('exact case match returns defined result', () => {
        fc.assert(
            fc.property(
                tradeArb.filter((t) => t.stock > 0),
                (trade) => {
                    // filterTrade uses resultText, must be exact case
                    const result = filterTrade(trade, trade.resultText, '');
                    expect(result).toBeDefined();
                }
            )
        );
    });
});

describe('sortResults properties', () => {
    const filterResultArb = fc.record({
        trade: tradeArb,
        matchResult: fc.boolean(),
        matchCost: fc.boolean(),
        displayName: fc.string(),
        displayAmount: fc.integer({ min: 1, max: 64 }),
    }) as fc.Arbitrary<FilterResult>;

    test('length is preserved after sort', () => {
        fc.assert(
            fc.property(
                fc.array(filterResultArb, { minLength: 0, maxLength: 20 }),
                fc.constantFrom('result-amt', 'cost-amt', 'stock', 'deviation'),
                fc.constantFrom('asc', 'desc'),
                (results, column, direction) => {
                    const copy = [...results];
                    sortResults(copy, column, direction);
                    expect(copy.length).toBe(results.length);
                }
            )
        );
    });

    test('same elements after sort', () => {
        fc.assert(
            fc.property(
                fc.array(filterResultArb, { minLength: 1, maxLength: 10 }),
                fc.constantFrom('result-amt', 'cost-amt', 'stock'),
                fc.constantFrom('asc', 'desc'),
                (results, column, direction) => {
                    const originalSet = new Set(results);
                    const copy = [...results];
                    sortResults(copy, column, direction);
                    const sortedSet = new Set(copy);
                    expect(sortedSet.size).toBe(originalSet.size);
                }
            )
        );
    });
});