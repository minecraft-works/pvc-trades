import { describe, expect, test } from 'vitest';

import { BlueMapTileProvider, encodeCoordPath } from './bluemap-provider.js';

describe('BlueMapTileProvider', () => {
    const provider = new BlueMapTileProvider('https://map.example.com', 'world');

    // ========================================================================
    // Identity
    // ========================================================================

    test('name is bluemap', () => {
        expect(provider.name).toBe('bluemap');
    });

    test('tileSize is 500', () => {
        expect(provider.tileSize).toBe(500);
    });

    // ========================================================================
    // Detail levels
    // ========================================================================

    test('detail level is LOD 1 with 500 blocks/tile', () => {
        expect(provider.detailLevel).toStrictEqual({
            id: 1,
            blocksPerTile: 500,
            label: 'lod1'
        });
    });

    test('overview level is LOD 3 with 12500 blocks/tile', () => {
        expect(provider.overviewLevel).toStrictEqual({
            id: 3,
            blocksPerTile: 12_500,
            label: 'lod3'
        });
    });

    // ========================================================================
    // World ID mapping
    // ========================================================================

    describe('getSourceWorldId', () => {
        test('overworld maps to mapId', () => {
            expect(provider.getSourceWorldId('overworld')).toBe('world');
        });

        test('the_nether maps to mapId_nether', () => {
            expect(provider.getSourceWorldId('the_nether')).toBe('world_nether');
        });

        test('the_end maps to mapId_the_end', () => {
            expect(provider.getSourceWorldId('the_end')).toBe('world_the_end');
        });

        test('custom mapId is used', () => {
            const custom = new BlueMapTileProvider('https://x.com', 'earth');
            expect(custom.getSourceWorldId('overworld')).toBe('earth');
            expect(custom.getSourceWorldId('the_nether')).toBe('earth_nether');
        });

        test('unknown world passes through', () => {
            expect(provider.getSourceWorldId('custom_dimension')).toBe('custom_dimension');
        });
    });

    // ========================================================================
    // URL generation
    // ========================================================================

    describe('getSourceTileUrl', () => {
        test('simple coordinates', () => {
            const url = provider.getSourceTileUrl('overworld', provider.detailLevel, 5, -3);
            expect(url).toBe('https://map.example.com/maps/world/tiles/1/x5/z-3.png');
        });

        test('multi-digit coordinates with nesting', () => {
            const url = provider.getSourceTileUrl('overworld', provider.detailLevel, 12, -7);
            expect(url).toBe('https://map.example.com/maps/world/tiles/1/x1/2/z-7.png');
        });

        test('large coordinates', () => {
            const url = provider.getSourceTileUrl('overworld', provider.detailLevel, 123, 45);
            expect(url).toBe('https://map.example.com/maps/world/tiles/1/x1/2/3/z4/5.png');
        });

        test('zero coordinates', () => {
            const url = provider.getSourceTileUrl('overworld', provider.detailLevel, 0, 0);
            expect(url).toBe('https://map.example.com/maps/world/tiles/1/x0/z0.png');
        });

        test('overview level URL', () => {
            const url = provider.getSourceTileUrl('the_nether', provider.overviewLevel, 1, -2);
            expect(url).toBe('https://map.example.com/maps/world_nether/tiles/3/x1/z-2.png');
        });

        test('multi-digit negative coordinates', () => {
            const url = provider.getSourceTileUrl('overworld', provider.detailLevel, -73, -123);
            expect(url).toBe('https://map.example.com/maps/world/tiles/1/x-7/3/z-1/2/3.png');
        });
    });
});

// ============================================================================
// Coordinate path encoding
// ============================================================================

describe('encodeCoordPath', () => {
    test('zero', () => {
        expect(encodeCoordPath(0, 'x')).toBe('x0');
    });

    test('single positive digit', () => {
        expect(encodeCoordPath(5, 'z')).toBe('z5');
    });

    test('two digits — nested', () => {
        expect(encodeCoordPath(12, 'x')).toBe('x1/2');
    });

    test('three digits — nested', () => {
        expect(encodeCoordPath(123, 'x')).toBe('x1/2/3');
    });

    test('four digits — nested', () => {
        expect(encodeCoordPath(1234, 'z')).toBe('z1/2/3/4');
    });

    test('single negative digit', () => {
        expect(encodeCoordPath(-7, 'z')).toBe('z-7');
    });

    test('two-digit negative — nested after sign', () => {
        expect(encodeCoordPath(-73, 'z')).toBe('z-7/3');
    });

    test('three-digit negative — nested after sign', () => {
        expect(encodeCoordPath(-123, 'x')).toBe('x-1/2/3');
    });

    test('negative one', () => {
        expect(encodeCoordPath(-1, 'x')).toBe('x-1');
    });

    test('nine', () => {
        expect(encodeCoordPath(9, 'x')).toBe('x9');
    });

    test('ten — nested', () => {
        expect(encodeCoordPath(10, 'z')).toBe('z1/0');
    });
});
