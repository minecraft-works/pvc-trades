import { describe, expect, test } from 'vitest';

import { processTrade } from '../library.js';
import { createTrade, namedBoxRecipe } from '../test-fixtures.js';
import type { Shop, Trade } from '../types.js';
import { calculateFitZoom, clampToCircle, fromLeafletCoordsRelative, getMarkerScale, getPinchZoomDelta, getTileOffset, getTradeKey, getWorldId, isNether, measurePointers, shouldSwitchMapWorld, toLeafletCoords, toLeafletCoordsRelative } from './map-math.js';

// String constants to avoid duplication
const EMERALD_LOWER = 'emerald';
const OVERWORLD = 'overworld';
const THE_NETHER = 'the_nether';
const MINECRAFT_OVERWORLD = 'minecraft:overworld';
const DIAMOND_LOWER = 'diamond';
const GOLD_INGOT = 'gold ingot';
const DIAMOND_TITLE = 'Diamond';

describe('getMarkerScale', () => {
    test('grows gently with zoom, far less than the map itself', () => {
        expect(getMarkerScale(0)).toBe(1);
        expect(getMarkerScale(2)).toBeCloseTo(Math.SQRT2);
        expect(getMarkerScale(-1)).toBeLessThan(1);
    });

    test('stays within limits so markers remain visible and never cover the map', () => {
        expect(getMarkerScale(-8)).toBe(0.7);
        expect(getMarkerScale(6)).toBe(1.6);
    });
});

describe('measurePointers', () => {
    test('one pointer is its own centre, without spread', () => {
        expect(measurePointers([{ x: 4, y: 7 }])).toEqual({ center: { x: 4, y: 7 }, spread: 0 });
    });

    test('two pointers: midpoint and half their distance', () => {
        expect(measurePointers([{ x: 0, y: 0 }, { x: 6, y: 8 }])).toEqual({ center: { x: 3, y: 4 }, spread: 5 });
    });
});

describe('getPinchZoomDelta', () => {
    test('fingers twice as far apart zoom in one level, half as far zoom out one', () => {
        expect(getPinchZoomDelta(50, 100)).toBe(1);
        expect(getPinchZoomDelta(100, 50)).toBe(-1);
    });

    test('no zoom when a spread is too small to measure', () => {
        expect(getPinchZoomDelta(0, 80)).toBe(0);
        expect(getPinchZoomDelta(80, 0.5)).toBe(0);
    });
});

// Helper: 3 diamonds sold for one shulker box filled with `content`
const diamondsForShulkerOf = (content: string): Trade => ({
    ...createTrade(3, 1, DIAMOND_TITLE, 41),
    item1: { type: 'SHULKER_BOX', name: '', amount: 1, lore: [`- 64x ${content}`] },
    costName: 'Shulker box',
});

// ============================================================================
// Map Utilities
// ============================================================================

describe('getWorldId', () => {
    test('returns overworld for normal world', () => {
        expect(getWorldId('minecraft:overworld')).toBe(OVERWORLD);
        expect(getWorldId(OVERWORLD)).toBe(OVERWORLD);
        expect(getWorldId('world')).toBe(OVERWORLD);
    });

    test('returns the_nether for nether world', () => {
        expect(getWorldId('minecraft:the_nether')).toBe('the_nether');
        expect(getWorldId('the_nether')).toBe('the_nether');
        expect(getWorldId('nether')).toBe('the_nether');
    });

    test('returns the_end for end world', () => {
        expect(getWorldId('minecraft:the_end')).toBe('the_end');
        expect(getWorldId('the_end')).toBe('the_end');
        expect(getWorldId('end')).toBe('the_end');
    });

    test('returns overworld for World (capitalized)', () => {
        expect(getWorldId('World')).toBe(OVERWORLD);
    });

    test('returns the_nether for World_nether', () => {
        expect(getWorldId('World_nether')).toBe('the_nether');
    });

    test('returns the_end for World_the_end', () => {
        expect(getWorldId('World_the_end')).toBe('the_end');
    });

    test('handles empty string as overworld', () => {
        expect(getWorldId('')).toBe(OVERWORLD);
    });

    test('handles mixed case nether variants', () => {
        expect(getWorldId('THE_NETHER')).toBe('the_nether');
        expect(getWorldId('The_Nether')).toBe('the_nether');
        expect(getWorldId('NETHER')).toBe('the_nether');
    });

    test('handles mixed case end variants', () => {
        expect(getWorldId('THE_END')).toBe('the_end');
        expect(getWorldId('The_End')).toBe('the_end');
        expect(getWorldId('END')).toBe('the_end');
    });
});

describe('getTileOffset', () => {
    test('calculates offset for positive coordinates', () => {
        expect(getTileOffset(0, 0)).toEqual({ offsetX: 0, offsetZ: 0 });
        expect(getTileOffset(100, 200)).toEqual({ offsetX: 100, offsetZ: 200 });
        expect(getTileOffset(511, 511)).toEqual({ offsetX: 511, offsetZ: 511 });
        expect(getTileOffset(512, 512)).toEqual({ offsetX: 0, offsetZ: 0 });
        expect(getTileOffset(600, 700)).toEqual({ offsetX: 88, offsetZ: 188 });
    });

    test('calculates offset for negative coordinates', () => {
        // -69 is in tile -1 (which spans -512 to -1)
        // offset = -69 - (-1 * 512) = -69 + 512 = 443
        expect(getTileOffset(-69, 64)).toEqual({ offsetX: 443, offsetZ: 64 });
        expect(getTileOffset(-1, -1)).toEqual({ offsetX: 511, offsetZ: 511 });
        expect(getTileOffset(-512, -512)).toEqual({ offsetX: 0, offsetZ: 0 });
    });

    test('respects custom tile size for offset calculation', () => {
        expect(getTileOffset(300, 300, 256)).toEqual({ offsetX: 44, offsetZ: 44 });
    });
});

describe('calculateFitZoom', () => {
    test('calculates zoom for exact fit', () => {
        // container 512px, content 512 units -> zoom 0 (1:1)
        expect(calculateFitZoom(512, 512)).toBe(0);
        
        // container 1024px, content 512 units -> zoom 1 (2:1)
        expect(calculateFitZoom(1024, 512)).toBe(1);
        
        // container 256px, content 512 units -> zoom -1 (0.5:1)
        expect(calculateFitZoom(256, 512)).toBe(-1);
    });

    test('calculates fractional zoom', () => {
        // container 729px, content 1536 units
        // zoom = log2(729/1536) ≈ -1.075
        const zoom = calculateFitZoom(729, 1536);
        expect(zoom).toBeCloseTo(-1.075, 2);
    });

    test('handles various container sizes', () => {
        // container 768px, content 1536 units -> zoom -1
        expect(calculateFitZoom(768, 1536)).toBe(-1);
        
        // container 384px, content 1536 units -> zoom -2
        expect(calculateFitZoom(384, 1536)).toBe(-2);
        
        // container 1536px, content 1536 units -> zoom 0
        expect(calculateFitZoom(1536, 1536)).toBe(0);
    });
});

describe('toLeafletCoords', () => {
    test('converts positive coordinates to Leaflet latLng', () => {
        // At (100, 200) in tile (0, 0), offset is (100, 200)
        // Leaflet: lat = -offsetZ = -200, lng = offsetX = 100
        expect(toLeafletCoords(100, 200)).toEqual({ lat: -200, lng: 100 });
    });

    test('converts coordinates at tile boundary', () => {
        // At (512, 512) in tile (1, 1), offset is (0, 0)
        const result = toLeafletCoords(512, 512);
        expect(result.lat + 0).toBe(0);  // +0 converts -0 to 0
        expect(result.lng + 0).toBe(0);
        
        // At (511, 511) still in tile (0, 0)
        expect(toLeafletCoords(511, 511)).toEqual({ lat: -511, lng: 511 });
    });

    test('converts negative coordinates correctly', () => {
        // At (-69, 64) in tile (-1, 0), offset is (443, 64)
        // This matches the real shop example from debug logs
        expect(toLeafletCoords(-69, 64)).toEqual({ lat: -64, lng: 443 });
    });

    test('converts coordinates with negative Z', () => {
        // At (100, -100) in tile (0, -1), offset is (100, 412)
        // tileZ = floor(-100/512) = -1
        // offsetZ = -100 - (-1 * 512) = -100 + 512 = 412
        expect(toLeafletCoords(100, -100)).toEqual({ lat: -412, lng: 100 });
    });

    test('respects custom tile size for leaflet conversion', () => {
        // At (300, 300) with tile size 256
        // tile (1, 1), offset (44, 44)
        expect(toLeafletCoords(300, 300, 256)).toEqual({ lat: -44, lng: 44 });
    });
});

describe('toLeafletCoordsRelative', () => {
    test('converts coords relative to center tile at origin', () => {
        // Player at (100, 200), center tile is (0, 0)
        // Center tile origin is (0, 0), so relative coords are (100, 200)
        const result = toLeafletCoordsRelative(100, 200, 0, 0);
        expect(result).toEqual({ lat: -200, lng: 100 });
    });

    test('converts coords relative to non-origin center tile', () => {
        // Player at (600, 700), center tile is (1, 1)
        // Center tile origin is (512, 512)
        // Relative: x = 600 - 512 = 88, z = 700 - 512 = 188
        const result = toLeafletCoordsRelative(600, 700, 1, 1);
        expect(result).toEqual({ lat: -188, lng: 88 });
    });

    test('handles player in different tile than center', () => {
        // Player at (1000, 1000), center tile is (0, 0)
        // Center tile origin is (0, 0)
        // Relative: x = 1000, z = 1000
        const result = toLeafletCoordsRelative(1000, 1000, 0, 0);
        expect(result).toEqual({ lat: -1000, lng: 1000 });
    });

    test('handles negative player coordinates', () => {
        // Player at (-100, -200), center tile is (0, 0)
        const result = toLeafletCoordsRelative(-100, -200, 0, 0);
        expect(result).toEqual({ lat: 200, lng: -100 });
    });

    test('handles negative center tile', () => {
        // Player at (0, 0), center tile is (-1, -1)
        // Center tile origin is (-512, -512)
        // Relative: x = 0 - (-512) = 512, z = 0 - (-512) = 512
        const result = toLeafletCoordsRelative(0, 0, -1, -1);
        expect(result).toEqual({ lat: -512, lng: 512 });
    });

    test('respects custom tile size for relative conversion', () => {
        // Player at (300, 400), center tile is (1, 1), tile size 256
        // Center tile origin is (256, 256)
        // Relative: x = 300 - 256 = 44, z = 400 - 256 = 144
        const result = toLeafletCoordsRelative(300, 400, 1, 1, 256);
        expect(result).toEqual({ lat: -144, lng: 44 });
    });
});

describe('fromLeafletCoordsRelative', () => {
    test('converts origin coords back to world coords at tile 0,0', () => {
        const result = fromLeafletCoordsRelative(0, 0, 0, 0);
        expect(result).toEqual({ x: 0, z: 0 });
    });

    test('converts positive offset back to world coords', () => {
        // lat = -200 means z offset = 200, lng = 100 means x offset = 100
        const result = fromLeafletCoordsRelative(-200, 100, 0, 0);
        expect(result).toEqual({ x: 100, z: 200 });
    });

    test('converts coords at non-zero tile center', () => {
        // Center tile (1, 1) has origin at (512, 512)
        // lat = -100, lng = 50 → x = 50 + 512 = 562, z = 100 + 512 = 612
        const result = fromLeafletCoordsRelative(-100, 50, 1, 1);
        expect(result).toEqual({ x: 562, z: 612 });
    });

    test('is inverse of toLeafletCoordsRelative', () => {
        const x = 1234;
        const z = 5678;
        const tileX = 2;
        const tileZ = 11;
        
        const leaflet = toLeafletCoordsRelative(x, z, tileX, tileZ);
        const back = fromLeafletCoordsRelative(leaflet.lat, leaflet.lng, tileX, tileZ);
        
        expect(back.x).toBe(x);
        expect(back.z).toBe(z);
    });

    test('handles negative world coords', () => {
        const x = -500;
        const z = -300;
        
        const leaflet = toLeafletCoordsRelative(x, z, 0, 0);
        const back = fromLeafletCoordsRelative(leaflet.lat, leaflet.lng, 0, 0);
        
        expect(back.x).toBe(x);
        expect(back.z).toBe(z);
    });

    test('rounds to nearest integer', () => {
        // lat = -100.7, lng = 50.3 → should round to x=50, z=101
        const result = fromLeafletCoordsRelative(-100.7, 50.3, 0, 0);
        expect(result.x).toBe(50);
        expect(result.z).toBe(101);
    });
});

describe('clampToCircle', () => {
    const centerLat = 0;
    const centerLng = 0;
    const radius = 100;

    test('returns original point when inside circle', () => {
        const result = clampToCircle(50, 50, centerLat, centerLng, radius);
        expect(result.lat).toBe(50);
        expect(result.lng).toBe(50);
        expect(result.clamped).toBe(false);
    });

    test('returns original point when exactly on circle edge', () => {
        // Point at (0, 100) is exactly on the circle
        const result = clampToCircle(0, 100, centerLat, centerLng, radius);
        expect(result.lat).toBe(0);
        expect(result.lng).toBe(100);
        expect(result.clamped).toBe(false);
    });

    test('returns original point at center', () => {
        const result = clampToCircle(0, 0, centerLat, centerLng, radius);
        expect(result.lat).toBe(0);
        expect(result.lng).toBe(0);
        expect(result.clamped).toBe(false);
    });

    test('clamps point outside circle to edge (right)', () => {
        // Point at (0, 200) should clamp to (0, 100)
        const result = clampToCircle(0, 200, centerLat, centerLng, radius);
        expect(result.lat).toBeCloseTo(0, 5);
        expect(result.lng).toBeCloseTo(100, 5);
        expect(result.clamped).toBe(true);
    });

    test('clamps point outside circle to edge (diagonal)', () => {
        // Point at (200, 200) should clamp to circle edge in that direction
        // Distance from origin = sqrt(200^2 + 200^2) = 282.84
        // Scale factor = 100 / 282.84 = 0.3536
        // Clamped: (200 * 0.3536, 200 * 0.3536) ≈ (70.71, 70.71)
        const result = clampToCircle(200, 200, centerLat, centerLng, radius);
        expect(result.lat).toBeCloseTo(70.71, 1);
        expect(result.lng).toBeCloseTo(70.71, 1);
        expect(result.clamped).toBe(true);
    });

    test('clamps point outside circle to edge (negative)', () => {
        // Point at (-300, 0) should clamp to (-100, 0)
        const result = clampToCircle(-300, 0, centerLat, centerLng, radius);
        expect(result.lat).toBeCloseTo(-100, 5);
        expect(result.lng).toBeCloseTo(0, 5);
        expect(result.clamped).toBe(true);
    });

    test('handles non-origin center', () => {
        // Circle centered at (100, 100), radius 50
        // Point at (200, 100) is 100 units away, should clamp to (150, 100)
        const result = clampToCircle(200, 100, 100, 100, 50);
        expect(result.lat).toBeCloseTo(150, 5);
        expect(result.lng).toBeCloseTo(100, 5);
        expect(result.clamped).toBe(true);
    });

    test('handles very far points correctly', () => {
        // Very far point should still clamp to correct edge
        const result = clampToCircle(10_000, 0, centerLat, centerLng, radius);
        expect(result.lat).toBeCloseTo(100, 5);
        expect(result.lng).toBeCloseTo(0, 5);
        expect(result.clamped).toBe(true);
    });
});

// ============================================================================
// isNether tests
// ============================================================================

describe('isNether', () => {
    test('returns true for "the_nether"', () => {
        expect(isNether('the_nether')).toBe(true);
    });

    test('returns true for "nether"', () => {
        expect(isNether('nether')).toBe(true);
    });

    test('returns true for "World_nether"', () => {
        expect(isNether('World_nether')).toBe(true);
    });

    test('returns true for "THE_NETHER" (case insensitive)', () => {
        expect(isNether('THE_NETHER')).toBe(true);
    });

    test('returns false for "overworld"', () => {
        expect(isNether('overworld')).toBe(false);
    });

    test('returns false for "the_end"', () => {
        expect(isNether('the_end')).toBe(false);
    });

    test('returns false for empty string', () => {
        expect(isNether('')).toBe(false);
    });

    test('returns false for "World"', () => {
        expect(isNether('World')).toBe(false);
    });
});

// ============================================================================
// getTradeKey tests
// ============================================================================

describe('getTradeKey', () => {
    test('generates key from trade coordinates and items', () => {
        const trade = {
            x: 100,
            y: 64,
            z: -200,
            world: OVERWORLD,
            costName: DIAMOND_LOWER,
            resultName: EMERALD_LOWER
        };
        expect(getTradeKey(trade)).toBe('100,64,-200,overworld,emerald,diamond');
    });

    test('different coordinates produce different keys', () => {
        const trade1 = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        const trade2 = { x: 101, y: 64, z: 200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        expect(getTradeKey(trade1)).not.toBe(getTradeKey(trade2));
    });

    test('different worlds produce different keys', () => {
        const trade1 = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        const trade2 = { x: 100, y: 64, z: 200, world: THE_NETHER, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        expect(getTradeKey(trade1)).not.toBe(getTradeKey(trade2));
    });

    test('different items produce different keys', () => {
        const trade1 = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        const trade2 = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: GOLD_INGOT, resultName: EMERALD_LOWER };
        expect(getTradeKey(trade1)).not.toBe(getTradeKey(trade2));
    });

    test('same trade produces same key', () => {
        const trade = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        expect(getTradeKey(trade)).toBe(getTradeKey(trade));
    });

    test('handles negative coordinates for trade key', () => {
        const trade = { x: -100, y: 64, z: -200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        expect(getTradeKey(trade)).toBe('-100,64,-200,overworld,emerald,diamond');
    });

    test('handles item names with spaces', () => {
        const trade = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: GOLD_INGOT, resultName: 'iron block' };
        expect(getTradeKey(trade)).toBe(`100,64,200,overworld,iron block,${GOLD_INGOT}`);
    });

    test('trades at one shop that differ only in shulker contents get different keys', () => {
        const keys = ['COBBLESTONE', 'STONE', 'SAND'].map(content => getTradeKey(diamondsForShulkerOf(content)));
        expect(new Set(keys).size).toBe(3);
        // Readable prefix is kept for selectors and debugging
        expect(keys[0]).toMatch(/^0,0,0,overworld,Diamond,Shulker box\|3:1#/);
    });

    test('trades at one shop that differ only in amounts get different keys', () => {
        expect(getTradeKey(createTrade(1, 5, DIAMOND_TITLE, 5))).not.toBe(getTradeKey(createTrade(2, 9, DIAMOND_TITLE, 5)));
        expect(getTradeKey(createTrade(1, 5, DIAMOND_TITLE, 5))).toBe(getTradeKey(createTrade(1, 5, DIAMOND_TITLE, 99)));
    });

    test('identical shulker boxes the seller named differently get different keys', () => {
        const shop: Shop = { location: '0, 0, 0', world: MINECRAFT_OVERWORLD, recipes: [] };
        const books = ['mending', 'silk touch', 'sweeping edge iii'].map(name => processTrade(namedBoxRecipe(name, ['- 1x ENCHANTED_BOOK']), shop, []));
        expect(new Set(books.map(getTradeKey)).size).toBe(3);
    });
});

// ============================================================================
// shouldSwitchMapWorld tests
// ============================================================================

describe('shouldSwitchMapWorld', () => {
    // Basic cases - should NOT switch
    test('returns false when no previous position (first poll)', () => {
        expect(shouldSwitchMapWorld(undefined, 'the_nether', 'overworld', 5)).toBe(false);
    });

    test('returns false when player stayed in same world', () => {
        expect(shouldSwitchMapWorld('overworld', 'overworld', 'overworld', 5)).toBe(false);
    });

    test('returns false when map already shows player world', () => {
        expect(shouldSwitchMapWorld('overworld', 'the_nether', 'the_nether', 5)).toBe(false);
    });

    test('returns false when no shops in player new world', () => {
        expect(shouldSwitchMapWorld('overworld', 'the_nether', 'overworld', 0)).toBe(false);
    });

    // Cases where it SHOULD switch
    test('returns true when player enters nether with nether shops', () => {
        expect(shouldSwitchMapWorld('overworld', 'the_nether', 'overworld', 3)).toBe(true);
    });

    test('returns true when player returns to overworld with overworld shops', () => {
        expect(shouldSwitchMapWorld('the_nether', 'overworld', 'the_nether', 10)).toBe(true);
    });

    test('returns true when player enters the_end with end shops', () => {
        expect(shouldSwitchMapWorld('overworld', 'the_end', 'overworld', 1)).toBe(true);
    });

    // Edge cases
    test('returns true with exactly 1 shop in new world', () => {
        expect(shouldSwitchMapWorld('overworld', 'the_nether', 'overworld', 1)).toBe(true);
    });

    test('handles multiple world transitions correctly', () => {
        // overworld -> nether (with nether shops)
        expect(shouldSwitchMapWorld('overworld', 'the_nether', 'overworld', 5)).toBe(true);
        // nether -> end (with end shops)
        expect(shouldSwitchMapWorld('the_nether', 'the_end', 'the_nether', 2)).toBe(true);
        // end -> overworld (with overworld shops)
        expect(shouldSwitchMapWorld('the_end', 'overworld', 'the_end', 8)).toBe(true);
    });

    test('returns false when changing worlds but map shows third world with shops there', () => {
        // Player goes from nether to end, but map shows overworld (and has overworld shops)
        // This shouldn't happen in practice, but the function should handle it
        expect(shouldSwitchMapWorld('the_nether', 'the_end', 'overworld', 5)).toBe(true);
    });
});
