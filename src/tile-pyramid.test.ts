import { describe, expect, test } from 'vitest';

import { DEFAULT_CONFIG } from './types.js';
import {
    blocksPerTile,
    canonicalTileUrl,
    coarsenTile,
    DEFAULT_PYRAMID,
    detailLevel,
    detailToOverviewRatio,
    isBlockInTile,
    isValidLevel,
    overviewLevel,
    tileBounds,
    tileFromBlock,
    tileNeighborhood,
    tilesInBlockRange
} from './tile-pyramid.js';
import type { TilePyramidConfig } from './types.js';

// ============================================================================
// Test pyramids
// ============================================================================

/** Custom pyramid for testing non-default values */
const CUSTOM_PYRAMID: TilePyramidConfig = {
    tileWidth: 512,
    tileHeight: 512,
    levels: 2,
    scaleFactor: 16,
    baseBlocksPerTile: 512,
    format: 'webp'
};

// ============================================================================
// blocksPerTile
// ============================================================================

describe('blocksPerTile', () => {
    test('detail level (highest) returns baseBlocksPerTile', () => {
        expect(blocksPerTile(2, DEFAULT_PYRAMID)).toBe(256);
    });

    test('mid level applies scaleFactor once', () => {
        expect(blocksPerTile(1, DEFAULT_PYRAMID)).toBe(1024);
    });

    test('overview level (0) applies scaleFactor^(levels-1)', () => {
        expect(blocksPerTile(0, DEFAULT_PYRAMID)).toBe(4096);
    });

    test('works with custom pyramid (2 levels, factor 16)', () => {
        // Level 1 (detail): 512
        expect(blocksPerTile(1, CUSTOM_PYRAMID)).toBe(512);
        // Level 0 (overview): 512 × 16 = 8192
        expect(blocksPerTile(0, CUSTOM_PYRAMID)).toBe(8192);
    });

    test('single-level pyramid has same value at level 0', () => {
        const single: TilePyramidConfig = { ...DEFAULT_PYRAMID, levels: 1 };
        expect(blocksPerTile(0, single)).toBe(256);
    });
});

// ============================================================================
// detailLevel / overviewLevel / detailToOverviewRatio
// ============================================================================

describe('detailLevel', () => {
    test('returns levels - 1 for default pyramid', () => {
        expect(detailLevel(DEFAULT_PYRAMID)).toBe(2);
    });

    test('returns 1 for 2-level pyramid', () => {
        expect(detailLevel(CUSTOM_PYRAMID)).toBe(1);
    });

    test('returns 0 for single-level pyramid', () => {
        const single: TilePyramidConfig = { ...DEFAULT_PYRAMID, levels: 1 };
        expect(detailLevel(single)).toBe(0);
    });
});

describe('overviewLevel', () => {
    test('always returns 0', () => {
        expect(overviewLevel()).toBe(0);
    });
});

describe('detailToOverviewRatio', () => {
    test('default pyramid: 4^2 = 16', () => {
        expect(detailToOverviewRatio(DEFAULT_PYRAMID)).toBe(16);
    });

    test('custom pyramid: 16^1 = 16', () => {
        expect(detailToOverviewRatio(CUSTOM_PYRAMID)).toBe(16);
    });

    test('single-level pyramid: ratio is 1', () => {
        const single: TilePyramidConfig = { ...DEFAULT_PYRAMID, levels: 1 };
        expect(detailToOverviewRatio(single)).toBe(1);
    });
});

// ============================================================================
// isValidLevel
// ============================================================================

describe('isValidLevel', () => {
    test('level 0 is valid', () => {
        expect(isValidLevel(0, DEFAULT_PYRAMID)).toBe(true);
    });

    test('level levels-1 is valid', () => {
        expect(isValidLevel(2, DEFAULT_PYRAMID)).toBe(true);
    });

    test('negative level is invalid', () => {
        expect(isValidLevel(-1, DEFAULT_PYRAMID)).toBe(false);
    });

    test('level >= levels is invalid', () => {
        expect(isValidLevel(3, DEFAULT_PYRAMID)).toBe(false);
    });

    test('non-integer level is invalid', () => {
        expect(isValidLevel(1.5, DEFAULT_PYRAMID)).toBe(false);
    });
});

// ============================================================================
// tileFromBlock
// ============================================================================

describe('tileFromBlock', () => {
    test('origin maps to tile (0, 0)', () => {
        expect(tileFromBlock(0, 0, 2, DEFAULT_PYRAMID)).toEqual({ tileX: 0, tileZ: 0 });
    });

    test('positive coords within first tile stay at (0, 0)', () => {
        expect(tileFromBlock(255, 255, 2, DEFAULT_PYRAMID)).toEqual({ tileX: 0, tileZ: 0 });
    });

    test('crossing tile boundary increments tile coord', () => {
        expect(tileFromBlock(256, 256, 2, DEFAULT_PYRAMID)).toEqual({ tileX: 1, tileZ: 1 });
    });

    test('negative coords map to negative tiles', () => {
        expect(tileFromBlock(-1, -1, 2, DEFAULT_PYRAMID)).toEqual({ tileX: -1, tileZ: -1 });
    });

    test('negative exactly at -256 maps to tile -1', () => {
        expect(tileFromBlock(-256, -256, 2, DEFAULT_PYRAMID)).toEqual({ tileX: -1, tileZ: -1 });
    });

    test('negative at -257 maps to tile -2', () => {
        expect(tileFromBlock(-257, -257, 2, DEFAULT_PYRAMID)).toEqual({ tileX: -2, tileZ: -2 });
    });

    test('overview level has larger tiles', () => {
        // 4096 blocks/tile at level 0
        expect(tileFromBlock(600, -100, 0, DEFAULT_PYRAMID)).toEqual({ tileX: 0, tileZ: -1 });
        expect(tileFromBlock(4096, 0, 0, DEFAULT_PYRAMID)).toEqual({ tileX: 1, tileZ: 0 });
    });

    test('works with custom pyramid at detail level', () => {
        // 512 blocks/tile at level 1
        expect(tileFromBlock(600, -100, 1, CUSTOM_PYRAMID)).toEqual({ tileX: 1, tileZ: -1 });
    });
});

// ============================================================================
// tileBounds
// ============================================================================

describe('tileBounds', () => {
    test('tile (0,0) at detail level', () => {
        expect(tileBounds(0, 0, 2, DEFAULT_PYRAMID)).toEqual({
            west: 0, east: 256, north: 0, south: 256
        });
    });

    test('tile (1, -1) at detail level', () => {
        expect(tileBounds(1, -1, 2, DEFAULT_PYRAMID)).toEqual({
            west: 256, east: 512, north: -256, south: 0
        });
    });

    test('tile (0,0) at overview level', () => {
        expect(tileBounds(0, 0, 0, DEFAULT_PYRAMID)).toEqual({
            west: 0, east: 4096, north: 0, south: 4096
        });
    });

    test('negative tile coordinates', () => {
        expect(tileBounds(-1, -1, 2, DEFAULT_PYRAMID)).toEqual({
            west: -256, east: 0, north: -256, south: 0
        });
    });
});

// ============================================================================
// isBlockInTile
// ============================================================================

describe('isBlockInTile', () => {
    test('origin is in tile (0,0)', () => {
        expect(isBlockInTile({ blockX: 0, blockZ: 0, tileX: 0, tileZ: 0, level: 2 }, DEFAULT_PYRAMID)).toBe(true);
    });

    test('block 255 is in tile 0 (inclusive west/north)', () => {
        expect(isBlockInTile({ blockX: 255, blockZ: 255, tileX: 0, tileZ: 0, level: 2 }, DEFAULT_PYRAMID)).toBe(true);
    });

    test('block 256 is NOT in tile 0 (exclusive east/south)', () => {
        expect(isBlockInTile({ blockX: 256, blockZ: 0, tileX: 0, tileZ: 0, level: 2 }, DEFAULT_PYRAMID)).toBe(false);
    });

    test('block 256 IS in tile 1', () => {
        expect(isBlockInTile({ blockX: 256, blockZ: 0, tileX: 1, tileZ: 0, level: 2 }, DEFAULT_PYRAMID)).toBe(true);
    });

    test('negative block in negative tile', () => {
        expect(isBlockInTile({ blockX: -100, blockZ: -50, tileX: -1, tileZ: -1, level: 2 }, DEFAULT_PYRAMID)).toBe(true);
    });
});

// ============================================================================
// coarsenTile
// ============================================================================

describe('coarsenTile', () => {
    test('detail to overview with default pyramid', () => {
        // ratio = 4096 / 256 = 16
        expect(coarsenTile(5, 7, 2, 0, DEFAULT_PYRAMID)).toEqual({ tileX: 0, tileZ: 0 });
    });

    test('detail tile (16, 16) maps to overview (1, 1)', () => {
        expect(coarsenTile(16, 16, 2, 0, DEFAULT_PYRAMID)).toEqual({ tileX: 1, tileZ: 1 });
    });

    test('negative detail tile to overview', () => {
        // -1 / 16 = -0.0625, floor = -1
        expect(coarsenTile(-1, -1, 2, 0, DEFAULT_PYRAMID)).toEqual({ tileX: -1, tileZ: -1 });
    });

    test('detail to mid level', () => {
        // ratio = 1024 / 256 = 4
        expect(coarsenTile(5, 7, 2, 1, DEFAULT_PYRAMID)).toEqual({ tileX: 1, tileZ: 1 });
    });

    test('same level returns same coordinates', () => {
        expect(coarsenTile(5, 7, 2, 2, DEFAULT_PYRAMID)).toEqual({ tileX: 5, tileZ: 7 });
    });
});

// ============================================================================
// canonicalTileUrl
// ============================================================================

describe('canonicalTileUrl', () => {
    test('generates default format URL', () => {
        expect(canonicalTileUrl({ world: 'overworld', level: 2, tileX: 3, tileZ: -2 }, DEFAULT_PYRAMID))
            .toBe('tiles/overworld/2/3/-2.png');
    });

    test('overview level URL', () => {
        expect(canonicalTileUrl({ world: 'the_nether', level: 0, tileX: 0, tileZ: 0 }, DEFAULT_PYRAMID))
            .toBe('tiles/the_nether/0/0/0.png');
    });

    test('respects custom format', () => {
        expect(canonicalTileUrl({ world: 'overworld', level: 1, tileX: 5, tileZ: 3 }, CUSTOM_PYRAMID))
            .toBe('tiles/overworld/1/5/3.webp');
    });

    test('custom baseUrl', () => {
        expect(canonicalTileUrl({ world: 'overworld', level: 2, tileX: 1, tileZ: 1, baseUrl: '/assets/tiles' }, DEFAULT_PYRAMID))
            .toBe('/assets/tiles/overworld/2/1/1.png');
    });

    test('negative coordinates in URL', () => {
        expect(canonicalTileUrl({ world: 'overworld', level: 2, tileX: -5, tileZ: -10 }, DEFAULT_PYRAMID))
            .toBe('tiles/overworld/2/-5/-10.png');
    });
});

// ============================================================================
// tileNeighborhood
// ============================================================================

describe('tileNeighborhood', () => {
    test('radius 0 returns 1 tile', () => {
        const tiles = tileNeighborhood(5, 3, 0);
        expect(tiles).toHaveLength(1);
        expect(tiles[0]).toEqual({ tileX: 5, tileZ: 3 });
    });

    test('radius 1 returns 9 tiles (3×3)', () => {
        expect(tileNeighborhood(0, 0, 1)).toHaveLength(9);
    });

    test('default radius 2 returns 25 tiles (5×5)', () => {
        expect(tileNeighborhood(0, 0)).toHaveLength(25);
    });

    test('includes center tile', () => {
        const tiles = tileNeighborhood(5, 3, 1);
        expect(tiles).toContainEqual({ tileX: 5, tileZ: 3 });
    });

    test('includes corner tiles', () => {
        const tiles = tileNeighborhood(5, 3, 1);
        expect(tiles).toContainEqual({ tileX: 4, tileZ: 2 });
        expect(tiles).toContainEqual({ tileX: 6, tileZ: 4 });
    });
});

// ============================================================================
// tilesInBlockRange
// ============================================================================

describe('tilesInBlockRange', () => {
    test('single tile range', () => {
        const tiles = tilesInBlockRange({ minBlockX: 0, maxBlockX: 100, minBlockZ: 0, maxBlockZ: 100, level: 2 }, DEFAULT_PYRAMID);
        expect(tiles).toHaveLength(1);
        expect(tiles[0]).toEqual({ tileX: 0, tileZ: 0 });
    });

    test('range spanning two tiles in each axis', () => {
        // 0..300 at 256 bpt spans tiles 0 and 1
        const tiles = tilesInBlockRange({ minBlockX: 0, maxBlockX: 300, minBlockZ: 0, maxBlockZ: 300, level: 2 }, DEFAULT_PYRAMID);
        expect(tiles).toHaveLength(4); // 2×2
    });

    test('negative range', () => {
        const tiles = tilesInBlockRange({ minBlockX: -500, maxBlockX: -1, minBlockZ: -500, maxBlockZ: -1, level: 2 }, DEFAULT_PYRAMID);
        // -500...-1 at 256 bpt: tiles -2 and -1 in each axis
        expect(tiles).toHaveLength(4);
        expect(tiles).toContainEqual({ tileX: -2, tileZ: -2 });
        expect(tiles).toContainEqual({ tileX: -1, tileZ: -1 });
    });

    test('overview level produces fewer tiles', () => {
        // 0..5000 at 4096 bpt spans tiles 0 and 1
        const tiles = tilesInBlockRange({ minBlockX: 0, maxBlockX: 5000, minBlockZ: 0, maxBlockZ: 5000, level: 0 }, DEFAULT_PYRAMID);
        expect(tiles).toHaveLength(4); // 2×2
    });

    test('exact single tile boundary', () => {
        // 0..255 at 256 bpt → just tile 0
        const tiles = tilesInBlockRange({ minBlockX: 0, maxBlockX: 255, minBlockZ: 0, maxBlockZ: 255, level: 2 }, DEFAULT_PYRAMID);
        expect(tiles).toHaveLength(1);
    });
});

// ============================================================================
// Cross-function consistency
// ============================================================================

describe('cross-function consistency', () => {
    test('tileFromBlock and tileBounds are inverses', () => {
        const blockX = 600;
        const blockZ = -100;
        const level = 2;

        const tile = tileFromBlock(blockX, blockZ, level, DEFAULT_PYRAMID);
        const bounds = tileBounds(tile.tileX, tile.tileZ, level, DEFAULT_PYRAMID);

        expect(blockX).toBeGreaterThanOrEqual(bounds.west);
        expect(blockX).toBeLessThan(bounds.east);
        expect(blockZ).toBeGreaterThanOrEqual(bounds.north);
        expect(blockZ).toBeLessThan(bounds.south);
    });

    test('isBlockInTile agrees with tileFromBlock', () => {
        const blockX = -350;
        const blockZ = 1000;
        const level = 1;

        const tile = tileFromBlock(blockX, blockZ, level, DEFAULT_PYRAMID);
        expect(isBlockInTile({ blockX, blockZ, level, tileX: tile.tileX, tileZ: tile.tileZ }, DEFAULT_PYRAMID)).toBe(true);
    });

    test('coarsenTile agrees with tileFromBlock at coarser level', () => {
        const blockX = 600;
        const blockZ = -100;

        const detailTile = tileFromBlock(blockX, blockZ, 2, DEFAULT_PYRAMID);
        const overviewTile = tileFromBlock(blockX, blockZ, 0, DEFAULT_PYRAMID);
        const coarsened = coarsenTile(detailTile.tileX, detailTile.tileZ, 2, 0, DEFAULT_PYRAMID);

        expect(coarsened).toEqual(overviewTile);
    });

    test('tilesInBlockRange contains tile for any block in range', () => {
        const tiles = tilesInBlockRange({ minBlockX: -100, maxBlockX: 400, minBlockZ: -50, maxBlockZ: 300, level: 2 }, DEFAULT_PYRAMID);
        
        // Check several blocks within range
        for (const blockX of [-100, 0, 200, 400]) {
            for (const blockZ of [-50, 0, 150, 300]) {
                const expected = tileFromBlock(blockX, blockZ, 2, DEFAULT_PYRAMID);
                expect(tiles).toContainEqual(expected);
            }
        }
    });

    test('URL for a specific tile round-trips through tileFromBlock', () => {
        const blockX = 1234;
        const blockZ = -5678;
        const level = 2;

        const tile = tileFromBlock(blockX, blockZ, level, DEFAULT_PYRAMID);
        const url = canonicalTileUrl({ level, world: 'overworld', tileX: tile.tileX, tileZ: tile.tileZ }, DEFAULT_PYRAMID);

        expect(url).toBe(`tiles/overworld/2/${String(tile.tileX)}/${String(tile.tileZ)}.png`);
    });
});

// ============================================================================
// Config consistency
// ============================================================================

describe('config.json / DEFAULT_PYRAMID format consistency', () => {
    test('DEFAULT_CONFIG.tilePyramid.format matches DEFAULT_PYRAMID.format', () => {
        // Catches drift between the two code-level defaults.
        // DEFAULT_CONFIG is what TILE_CONFIG.format falls back to at runtime;
        // DEFAULT_PYRAMID is what canonicalTileUrl uses in tests.
        expect(DEFAULT_PYRAMID.format).toBe(DEFAULT_CONFIG.tilePyramid.format);
    });
});
