import { describe, expect, test } from 'vitest';

import {
    blocksPerTile,
    coarsenTile,
    DETAIL_LEVEL,
    detailToOverviewRatio,
    OVERVIEW_LEVEL,
    tileUrl,
} from './tile-layout.js';

describe('blocksPerTile', () => {
    test('detail level covers 512 blocks, overview 8192', () => {
        expect(blocksPerTile(DETAIL_LEVEL)).toBe(512);
        expect(blocksPerTile(OVERVIEW_LEVEL)).toBe(8192);
    });

    test('each coarser level doubles the coverage', () => {
        for (let level = 1; level <= DETAIL_LEVEL; level++) {
            expect(blocksPerTile(level - 1)).toBe(blocksPerTile(level) * 2);
        }
    });
});

describe('detailToOverviewRatio', () => {
    test('equals the number of detail tiles per overview tile', () => {
        expect(detailToOverviewRatio()).toBe(16);
    });
});

describe('tileUrl', () => {
    const baseUrl = 'https://map.example.com/maps';

    test('detail level maps to server zoom 8', () => {
        expect(tileUrl({ baseUrl, world: 'overworld', level: DETAIL_LEVEL, tileX: 3, tileZ: -2 }))
            .toBe('https://map.example.com/maps/tiles/minecraft_overworld/8/3_-2.png');
    });

    test('overview level maps to server zoom 4', () => {
        expect(tileUrl({ baseUrl, world: 'the_nether', level: OVERVIEW_LEVEL, tileX: 0, tileZ: 0 }))
            .toBe('https://map.example.com/maps/tiles/minecraft_the_nether/4/0_0.png');
    });
});

describe('coarsenTile', () => {
    test('rounds toward negative infinity for negative coordinates', () => {
        expect(coarsenTile(-1, -1, DETAIL_LEVEL, OVERVIEW_LEVEL)).toEqual({ tileX: -1, tileZ: -1 });
        expect(coarsenTile(-16, 15, DETAIL_LEVEL, OVERVIEW_LEVEL)).toEqual({ tileX: -1, tileZ: 0 });
    });

    test('same level is identity', () => {
        expect(coarsenTile(5, 7, DETAIL_LEVEL, DETAIL_LEVEL)).toEqual({ tileX: 5, tileZ: 7 });
    });
});
