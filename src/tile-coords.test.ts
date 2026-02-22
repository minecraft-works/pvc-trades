/**
 * Unit tests for shared tile coordinate utilities
 * 
 * @module tile-coords.test
 */

import { describe, expect,test } from 'vitest';

import {
    getBlocksPerTile,
    getTileBounds,
    getTileCoords,
    getTileCoordsAtZoom,
    getTileNeighborhood,
    isCoordInTile,
    parseLocation} from './tile-coords.js';

// ============================================================================
// getTileCoords (simple version for max zoom)
// ============================================================================

describe('getTileCoords', () => {
    test('returns tile 0,0 for coordinates within first tile', () => {
        expect(getTileCoords(0, 0)).toEqual({ tileX: 0, tileZ: 0 });
        expect(getTileCoords(100, 200)).toEqual({ tileX: 0, tileZ: 0 });
        expect(getTileCoords(511, 511)).toEqual({ tileX: 0, tileZ: 0 });
    });

    test('increments tile at boundary', () => {
        expect(getTileCoords(512, 512)).toEqual({ tileX: 1, tileZ: 1 });
        expect(getTileCoords(1024, 1536)).toEqual({ tileX: 2, tileZ: 3 });
    });

    test('handles negative coordinates', () => {
        expect(getTileCoords(-1, -1)).toEqual({ tileX: -1, tileZ: -1 });
        expect(getTileCoords(-69, 64)).toEqual({ tileX: -1, tileZ: 0 });
        expect(getTileCoords(-512, -512)).toEqual({ tileX: -1, tileZ: -1 });
        expect(getTileCoords(-513, -513)).toEqual({ tileX: -2, tileZ: -2 });
    });

    test('respects custom tile size', () => {
        expect(getTileCoords(256, 256, 256)).toEqual({ tileX: 1, tileZ: 1 });
        expect(getTileCoords(100, 100, 128)).toEqual({ tileX: 0, tileZ: 0 });
        expect(getTileCoords(128, 128, 128)).toEqual({ tileX: 1, tileZ: 1 });
    });

    test('handles exact boundary values', () => {
        // At boundary - should be in next tile
        expect(getTileCoords(512, 0)).toEqual({ tileX: 1, tileZ: 0 });
        expect(getTileCoords(0, 512)).toEqual({ tileX: 0, tileZ: 1 });
        
        // Just before boundary - still in current tile
        expect(getTileCoords(511.9, 0)).toEqual({ tileX: 0, tileZ: 0 });
    });
});

// ============================================================================
// getTileCoordsAtZoom (with zoom level)
// ============================================================================

describe('getTileCoordsAtZoom', () => {
    const TILE_SIZE = 512;
    const MAX_ZOOM = 8;

    test('zoom 8 (max): 512 blocks per tile', () => {
        const result = getTileCoordsAtZoom(600, -100, 8, MAX_ZOOM, TILE_SIZE);
        expect(result).toEqual({ tileX: 1, tileZ: -1, blocksPerTile: 512 });
    });

    test('zoom 4: 8192 blocks per tile', () => {
        // 8192 = 512 × 2^(8-4) = 512 × 16
        const result = getTileCoordsAtZoom(600, -100, 4, MAX_ZOOM, TILE_SIZE);
        expect(result).toEqual({ tileX: 0, tileZ: -1, blocksPerTile: 8192 });
    });

    test('zoom 0: 131072 blocks per tile', () => {
        // 131072 = 512 × 2^(8-0) = 512 × 256
        const result = getTileCoordsAtZoom(600, -100, 0, MAX_ZOOM, TILE_SIZE);
        expect(result).toEqual({ tileX: 0, tileZ: -1, blocksPerTile: 131_072 });
    });

    test('origin falls in tile 0,0 at all zoom levels', () => {
        for (let zoom = 0; zoom <= MAX_ZOOM; zoom++) {
            const result = getTileCoordsAtZoom(0, 0, zoom, MAX_ZOOM, TILE_SIZE);
            expect(result.tileX).toBe(0);
            expect(result.tileZ).toBe(0);
        }
    });

    test('coordinates near boundary behave correctly across zooms', () => {
        // At (8000, 8000): 
        // zoom 8: tile (15, 15) since 8000/512 = 15.6
        // zoom 4: tile (0, 0) since 8000/8192 = 0.98
        const z8 = getTileCoordsAtZoom(8000, 8000, 8, MAX_ZOOM, TILE_SIZE);
        expect(z8.tileX).toBe(15);
        expect(z8.tileZ).toBe(15);

        const z4 = getTileCoordsAtZoom(8000, 8000, 4, MAX_ZOOM, TILE_SIZE);
        expect(z4.tileX).toBe(0);
        expect(z4.tileZ).toBe(0);
    });

    test('matches getTileCoords at max zoom', () => {
        const testCases = [
            [0, 0], [100, 200], [512, 512], [-100, -100], [1000, -500]
        ];
        
        for (const [x, z] of testCases) {
            const simple = getTileCoords(x, z, TILE_SIZE);
            const atZoom = getTileCoordsAtZoom(x, z, MAX_ZOOM, MAX_ZOOM, TILE_SIZE);
            expect(atZoom.tileX).toBe(simple.tileX);
            expect(atZoom.tileZ).toBe(simple.tileZ);
        }
    });
});

// ============================================================================
// getBlocksPerTile
// ============================================================================

describe('getBlocksPerTile', () => {
    test('calculates correct blocks per tile at each zoom', () => {
        expect(getBlocksPerTile(8, 8, 512)).toBe(512);
        expect(getBlocksPerTile(7, 8, 512)).toBe(1024);
        expect(getBlocksPerTile(6, 8, 512)).toBe(2048);
        expect(getBlocksPerTile(5, 8, 512)).toBe(4096);
        expect(getBlocksPerTile(4, 8, 512)).toBe(8192);
        expect(getBlocksPerTile(0, 8, 512)).toBe(131_072);
    });

    test('scales proportionally with tile size', () => {
        expect(getBlocksPerTile(8, 8, 256)).toBe(256);
        expect(getBlocksPerTile(4, 8, 256)).toBe(4096);
    });
});

// ============================================================================
// parseLocation
// ============================================================================

describe('parseLocation', () => {
    test('parses valid coordinate string', () => {
        const result = parseLocation('100, 64, -200');
        expect(result).toEqual({ x: 100, y: 64, z: -200 });
    });

    test('parses floating point coordinates', () => {
        const result = parseLocation('100.5, 64.2, -200.8');
        expect(result).toEqual({ x: 100.5, y: 64.2, z: -200.8 });
    });

    test('handles missing values with zeros', () => {
        expect(parseLocation('100')).toEqual({ x: 100, y: 0, z: 0 });
        expect(parseLocation('100, 64')).toEqual({ x: 100, y: 64, z: 0 });
    });

    test('handles null and undefined', () => {
        expect(parseLocation(null)).toEqual({ x: 0, y: 0, z: 0 });
        expect(parseLocation()).toEqual({ x: 0, y: 0, z: 0 });
    });

    test('handles empty string', () => {
        expect(parseLocation('')).toEqual({ x: 0, y: 0, z: 0 });
    });

    test('handles non-string values', () => {
        // @ts-expect-error Testing runtime behavior with invalid input
        expect(parseLocation(123)).toEqual({ x: 0, y: 0, z: 0 });
        // @ts-expect-error Testing runtime behavior with invalid input
        expect(parseLocation({})).toEqual({ x: 0, y: 0, z: 0 });
    });

    test('handles NaN values', () => {
        expect(parseLocation('abc, def, ghi')).toEqual({ x: 0, y: 0, z: 0 });
    });
});

// ============================================================================
// getTileBounds
// ============================================================================

describe('getTileBounds', () => {
    test('calculates bounds for tile at origin', () => {
        const bounds = getTileBounds(0, 0, 512);
        expect(bounds).toEqual({ west: 0, east: 512, north: 0, south: 512 });
    });

    test('calculates bounds for positive tiles', () => {
        const bounds = getTileBounds(1, 2, 512);
        expect(bounds).toEqual({ west: 512, east: 1024, north: 1024, south: 1536 });
    });

    test('calculates bounds for negative tiles', () => {
        const bounds = getTileBounds(-1, -1, 512);
        expect(bounds).toEqual({ west: -512, east: 0, north: -512, south: 0 });
    });

    test('scales correctly with zoom 4 tile size', () => {
        const bounds = getTileBounds(0, 0, 8192);
        expect(bounds).toEqual({ west: 0, east: 8192, north: 0, south: 8192 });
    });
});

// ============================================================================
// isCoordInTile
// ============================================================================

describe('isCoordInTile', () => {
    test('returns true for coordinates inside tile', () => {
        expect(isCoordInTile(100, 200, 0, 0, 512)).toBe(true);
        expect(isCoordInTile(0, 0, 0, 0, 512)).toBe(true);
        expect(isCoordInTile(511, 511, 0, 0, 512)).toBe(true);
    });

    test('returns false for coordinates outside tile', () => {
        expect(isCoordInTile(512, 0, 0, 0, 512)).toBe(false);
        expect(isCoordInTile(0, 512, 0, 0, 512)).toBe(false);
        expect(isCoordInTile(-1, 0, 0, 0, 512)).toBe(false);
    });

    test('handles negative tiles correctly', () => {
        expect(isCoordInTile(-100, -200, -1, -1, 512)).toBe(true);
        expect(isCoordInTile(-512, -512, -1, -1, 512)).toBe(true); // lower-left corner (inclusive)
        expect(isCoordInTile(-513, -513, -1, -1, 512)).toBe(false); // outside tile -1,-1 (in tile -2,-2)
        expect(isCoordInTile(-1, -1, -1, -1, 512)).toBe(true);
    });
});

// ============================================================================
// getTileNeighborhood
// ============================================================================

describe('getTileNeighborhood', () => {
    test('returns 25 tiles in 5x5 grid', () => {
        const neighborhood = getTileNeighborhood(0, 0);
        expect(neighborhood).toHaveLength(25);
    });

    test('includes center tile', () => {
        const neighborhood = getTileNeighborhood(5, 10);
        const hasCenter = neighborhood.some(t => t.tileX === 5 && t.tileZ === 10);
        expect(hasCenter).toBe(true);
    });

    test('includes all corners', () => {
        const neighborhood = getTileNeighborhood(0, 0);
        const corners = [
            { tileX: -2, tileZ: -2 },
            { tileX: -2, tileZ: 2 },
            { tileX: 2, tileZ: -2 },
            { tileX: 2, tileZ: 2 }
        ];
        
        for (const corner of corners) {
            const found = neighborhood.some(t => t.tileX === corner.tileX && t.tileZ === corner.tileZ);
            expect(found).toBe(true);
        }
    });

    test('handles negative center coordinates', () => {
        const neighborhood = getTileNeighborhood(-10, -20);
        const hasCenter = neighborhood.some(t => t.tileX === -10 && t.tileZ === -20);
        expect(hasCenter).toBe(true);
        
        // Check range is -12 to -8 for X, -22 to -18 for Z
        const minX = Math.min(...neighborhood.map(t => t.tileX));
        const maxX = Math.max(...neighborhood.map(t => t.tileX));
        const minZ = Math.min(...neighborhood.map(t => t.tileZ));
        const maxZ = Math.max(...neighborhood.map(t => t.tileZ));
        
        expect(minX).toBe(-12);
        expect(maxX).toBe(-8);
        expect(minZ).toBe(-22);
        expect(maxZ).toBe(-18);
    });
});

// ============================================================================
// Cross-module consistency tests
// ============================================================================

describe('Cross-module consistency', () => {
    test('getTileCoordsAtZoom at max zoom matches getTileCoords', () => {
        const testCoords = [
            [0, 0], [512, 0], [0, 512], [-512, -512],
            [1000, 2000], [-1000, 2000], [50_000, -50_000]
        ];
        
        for (const [x, z] of testCoords) {
            const simple = getTileCoords(x, z, 512);
            const atZoom = getTileCoordsAtZoom(x, z, 8, 8, 512);
            
            expect(atZoom.tileX).toBe(simple.tileX);
            expect(atZoom.tileZ).toBe(simple.tileZ);
            expect(atZoom.blocksPerTile).toBe(512);
        }
    });

    test('tile bounds are consistent with coordinate calculation', () => {
        const testCoords = [
            [100, 200], [600, -100], [-300, 400], [8000, 8000]
        ];
        
        for (const [x, z] of testCoords) {
            const { tileX, tileZ } = getTileCoords(x, z, 512);
            const bounds = getTileBounds(tileX, tileZ, 512);
            
            // Coordinate should be within its tile's bounds
            expect(x).toBeGreaterThanOrEqual(bounds.west);
            expect(x).toBeLessThan(bounds.east);
            expect(z).toBeGreaterThanOrEqual(bounds.north);
            expect(z).toBeLessThan(bounds.south);
        }
    });

    test('isCoordInTile is consistent with getTileCoords', () => {
        const testCoords = [
            [100, 200], [600, -100], [-300, 400], [0, 0], [511, 511]
        ];
        
        for (const [x, z] of testCoords) {
            const { tileX, tileZ } = getTileCoords(x, z, 512);
            expect(isCoordInTile(x, z, tileX, tileZ, 512)).toBe(true);
            
            // Should NOT be in adjacent tiles
            expect(isCoordInTile(x, z, tileX + 1, tileZ, 512)).toBe(false);
            expect(isCoordInTile(x, z, tileX, tileZ + 1, 512)).toBe(false);
        }
    });
});
