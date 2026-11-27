import { describe, expect, test } from 'vitest';

import { getVisibleRange } from './virtual-list.js';

const base = { viewportHeight: 640, rowHeight: 32, count: 1000, overscan: 10 };

describe('getVisibleRange', () => {
    test('list below the viewport top renders from the first row', () => {
        expect(getVisibleRange({ ...base, offset: -200 })).toEqual({ start: 0, end: 24 });
    });

    test('scrolled into the list renders the visible rows plus overscan', () => {
        expect(getVisibleRange({ ...base, offset: 3200 })).toEqual({ start: 90, end: 130 });
    });

    test('stops at the end of the list', () => {
        expect(getVisibleRange({ ...base, offset: 31_900 })).toEqual({ start: 986, end: 1000 });
    });

    test('scrolled past a list that shrank renders nothing', () => {
        expect(getVisibleRange({ ...base, count: 5, offset: 3200 })).toEqual({ start: 5, end: 5 });
    });
});
