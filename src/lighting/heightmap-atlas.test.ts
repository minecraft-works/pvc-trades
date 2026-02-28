import { describe, expect, test } from 'vitest';

import type { TilePyramidConfig } from '../types.js';
import { dequantizeHeightmap, manifestKey, parseManifestHeightmaps } from './heightmap-atlas.js';

// Default pyramid config matching production defaults
const TEST_PYRAMID: Readonly<TilePyramidConfig> = {
    tileWidth: 256,
    tileHeight: 256,
    levels: 3,
    scaleFactor: 4,
    baseBlocksPerTile: 256,
    format: 'jpeg',
};

describe('dequantizeHeightmap', () => {
    test('returns flat array for zero range', () => {
        // 2×2 image, RGBA data (16 bytes)
        const rgba = new Uint8ClampedArray([
            128, 128, 128, 255,
            64, 64, 64, 255,
            200, 200, 200, 255,
            0, 0, 0, 255,
        ]);
        const result = dequantizeHeightmap(rgba, 2, 2, 50, 50);
        expect(result).toHaveLength(4);
        for (const value of result) {
            expect(value).toBe(50);
        }
    });

    test('maps 0→min and 255→max', () => {
        const rgba = new Uint8ClampedArray([
            0, 0, 0, 255,   // pixel 0: gray=0 → min
            255, 255, 255, 255, // pixel 1: gray=255 → max
        ]);
        const result = dequantizeHeightmap(rgba, 2, 1, 10, 110);
        expect(result[0]).toBeCloseTo(10);
        expect(result[1]).toBeCloseTo(110);
    });

    test('linearly interpolates mid values', () => {
        const rgba = new Uint8ClampedArray([
            // gray=128, approximately midpoint
            128, 128, 128, 255,
        ]);
        const result = dequantizeHeightmap(rgba, 1, 1, 0, 100);
        // 0 + (128/255) * 100 ≈ 50.196
        expect(result[0]).toBeCloseTo(50.196, 2);
    });

    test('reads only R channel of RGBA', () => {
        const rgba = new Uint8ClampedArray([
            100, 200, 50, 128,  // R=100, G=200, B=50, A=128
        ]);
        const result = dequantizeHeightmap(rgba, 1, 1, 0, 255);
        // Should use R=100, not G or B
        expect(result[0]).toBeCloseTo(100, 0);
    });

    test('returns Float32Array', () => {
        const rgba = new Uint8ClampedArray([0, 0, 0, 255]);
        const result = dequantizeHeightmap(rgba, 1, 1, 0, 100);
        expect(result).toBeInstanceOf(Float32Array);
    });

    test('handles large images', () => {
        const size = 256;
        const pixelCount = size * size;
        const rgba = new Uint8ClampedArray(pixelCount * 4);
        // Fill with gradient
        for (let index = 0; index < pixelCount; index++) {
            const gray = Math.round((index / (pixelCount - 1)) * 255);
            rgba[index * 4] = gray;
            rgba[index * 4 + 1] = gray;
            rgba[index * 4 + 2] = gray;
            rgba[index * 4 + 3] = 255;
        }
        const result = dequantizeHeightmap(rgba, size, size, 0, 256);
        expect(result).toHaveLength(pixelCount);
        expect(result[0]).toBeCloseTo(0);
        expect(result[pixelCount - 1]).toBeCloseTo(256);
    });
});

describe('manifestKey', () => {
    test('formats key with slash separators', () => {
        expect(manifestKey('overworld', 256, 3, -5)).toBe('overworld/256/3/-5');
    });

    test('handles nether world name', () => {
        expect(manifestKey('the_nether', 256, 0, 0)).toBe('the_nether/256/0/0');
    });

    test('handles large coordinates', () => {
        expect(manifestKey('overworld', 1024, -100, 200)).toBe('overworld/1024/-100/200');
    });
});

describe('parseManifestHeightmaps', () => {
    // Detail level for TEST_PYRAMID: levels-1 = 2
    // blocksPerTile at level 2: 256 * 4^(3-1-2) = 256 * 4^0 = 256
    const DETAIL_BPT = 256;

    test('extracts entries with heightmap metadata', () => {
        const entries = [
            { world: 'overworld', tileX: 1, tileZ: 2, blocksPerTile: DETAIL_BPT, heightmap: { min: 10, max: 200 } },
        ];
        const result = parseManifestHeightmaps(entries, TEST_PYRAMID);
        expect(result.size).toBe(1);

        const meta = result.get('overworld/256/1/2');
        expect(meta).toBeDefined();
        expect(meta?.min).toBe(10);
        expect(meta?.max).toBe(200);
        expect(meta?.tileX).toBe(1);
        expect(meta?.tileZ).toBe(2);
    });

    test('skips entries without heightmap', () => {
        const entries = [
            { world: 'overworld', tileX: 1, tileZ: 2, blocksPerTile: DETAIL_BPT },
        ];
        const result = parseManifestHeightmaps(entries, TEST_PYRAMID);
        expect(result.size).toBe(0);
    });

    test('skips entries with wrong blocksPerTile', () => {
        const entries = [
            { world: 'overworld', tileX: 0, tileZ: 0, blocksPerTile: 1024, heightmap: { min: 0, max: 100 } },
        ];
        const result = parseManifestHeightmaps(entries, TEST_PYRAMID);
        expect(result.size).toBe(0);
    });

    test('handles multiple entries', () => {
        const entries = [
            { world: 'overworld', tileX: 0, tileZ: 0, blocksPerTile: DETAIL_BPT, heightmap: { min: 0, max: 100 } },
            { world: 'overworld', tileX: 1, tileZ: 0, blocksPerTile: DETAIL_BPT, heightmap: { min: 20, max: 80 } },
            { world: 'overworld', tileX: 0, tileZ: 1, blocksPerTile: DETAIL_BPT }, // no heightmap
            { world: 'the_nether', tileX: 0, tileZ: 0, blocksPerTile: DETAIL_BPT, heightmap: { min: 5, max: 120 } },
        ];
        const result = parseManifestHeightmaps(entries, TEST_PYRAMID);
        expect(result.size).toBe(3);
        expect(result.has('overworld/256/0/0')).toBe(true);
        expect(result.has('overworld/256/1/0')).toBe(true);
        expect(result.has('the_nether/256/0/0')).toBe(true);
    });

    test('returns empty map for empty input', () => {
        const result = parseManifestHeightmaps([], TEST_PYRAMID);
        expect(result.size).toBe(0);
    });
});
