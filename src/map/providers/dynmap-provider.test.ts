import { describe, expect, test } from 'vitest';

import { DynmapTileProvider } from './dynmap-provider.js';

describe('DynmapTileProvider', () => {
    const provider = new DynmapTileProvider('https://map.example.com');

    // ========================================================================
    // Identity
    // ========================================================================

    test('name is dynmap', () => {
        expect(provider.name).toBe('dynmap');
    });

    test('tileSize is 512', () => {
        expect(provider.tileSize).toBe(512);
    });

    // ========================================================================
    // Detail levels
    // ========================================================================

    test('detail level is zoom 8 with 512 blocks/tile', () => {
        expect(provider.detailLevel).toStrictEqual({
            id: 8,
            blocksPerTile: 512,
            label: 'zoom8'
        });
    });

    test('overview level is zoom 4 with 8192 blocks/tile', () => {
        expect(provider.overviewLevel).toStrictEqual({
            id: 4,
            blocksPerTile: 8192,
            label: 'zoom4'
        });
    });

    // ========================================================================
    // World ID mapping
    // ========================================================================

    describe('getSourceWorldId', () => {
        test('overworld → minecraft_overworld', () => {
            expect(provider.getSourceWorldId('overworld')).toBe('minecraft_overworld');
        });

        test('the_nether → minecraft_the_nether', () => {
            expect(provider.getSourceWorldId('the_nether')).toBe('minecraft_the_nether');
        });

        test('the_end → minecraft_the_end', () => {
            expect(provider.getSourceWorldId('the_end')).toBe('minecraft_the_end');
        });
    });

    // ========================================================================
    // URL generation
    // ========================================================================

    describe('getSourceTileUrl', () => {
        test('detail tile URL', () => {
            const url = provider.getSourceTileUrl('overworld', provider.detailLevel, 3, -2);
            expect(url).toBe('https://map.example.com/tiles/minecraft_overworld/8/3_-2.png');
        });

        test('overview tile URL', () => {
            const url = provider.getSourceTileUrl('the_nether', provider.overviewLevel, 0, 1);
            expect(url).toBe('https://map.example.com/tiles/minecraft_the_nether/4/0_1.png');
        });

        test('zero coordinates', () => {
            const url = provider.getSourceTileUrl('overworld', provider.detailLevel, 0, 0);
            expect(url).toBe('https://map.example.com/tiles/minecraft_overworld/8/0_0.png');
        });

        test('large coordinates', () => {
            const url = provider.getSourceTileUrl('overworld', provider.detailLevel, 123, -456);
            expect(url).toBe('https://map.example.com/tiles/minecraft_overworld/8/123_-456.png');
        });
    });

    // ========================================================================
    // Image processing (identity)
    // ========================================================================

    test('processImage returns blob unchanged', async () => {
        const blob = new Blob(['test'], { type: 'image/png' });
        const result = await provider.processImage(blob);
        expect(result.colorImage).toBe(blob);
        expect(result.heightmap).toBeUndefined();
    });
});
