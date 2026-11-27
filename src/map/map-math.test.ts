import { describe, expect, test } from 'vitest';

import { getMarkerScale } from './map-math.js';

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
