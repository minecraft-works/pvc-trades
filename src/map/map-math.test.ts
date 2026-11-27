import { describe, expect, test } from 'vitest';

import { getMarkerScale, getPinchZoomDelta, measurePointers } from './map-math.js';

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
