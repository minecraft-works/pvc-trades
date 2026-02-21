import { describe, test, expect } from 'vitest';
import {
    estimateLabelWidth,
    getLabelRect,
    rectsOverlap,
    positionToCssClass,
    resolvePlayerLabelPositions
} from './shop-map-helpers.js';
import type { LabelRect } from './shop-map-helpers.js';

// ============================================================================
// estimateLabelWidth
// ============================================================================

describe('estimateLabelWidth', () => {
    test('short name returns char-based width', () => {
        // 3 chars × 6px + 8px padding = 26
        expect(estimateLabelWidth('Bob')).toBe(26);
    });

    test('caps at 80px for long names', () => {
        expect(estimateLabelWidth('ThisIsAVeryLongPlayerName')).toBe(80);
    });

    test('empty name returns padding only', () => {
        expect(estimateLabelWidth('')).toBe(8);
    });

    test('boundary name just under cap', () => {
        // 12 chars × 6 + 8 = 80, exactly at cap
        expect(estimateLabelWidth('TwelveChars!')).toBe(80);
    });
});

// ============================================================================
// getLabelRect
// ============================================================================

describe('getLabelRect', () => {
    const labelWidth = 40;
    const markerX = 100;
    const markerY = 100;

    test('right position places label to the right of marker', () => {
        const rect = getLabelRect(markerX, markerY, labelWidth, 'right');
        expect(rect.x).toBe(116); // 100 + 16 offset
        expect(rect.width).toBe(40);
        expect(rect.height).toBe(14);
    });

    test('left position places label to the left of marker', () => {
        const rect = getLabelRect(markerX, markerY, labelWidth, 'left');
        expect(rect.x).toBe(44); // 100 - 16 - 40
        expect(rect.width).toBe(40);
    });

    test('top position centres label above marker', () => {
        const rect = getLabelRect(markerX, markerY, labelWidth, 'top');
        expect(rect.x).toBe(80); // 100 - 40/2
        expect(rect.y).toBe(76); // 100 - 6 (radius) - 4 - 14 (height)
    });

    test('bottom position centres label below marker', () => {
        const rect = getLabelRect(markerX, markerY, labelWidth, 'bottom');
        expect(rect.x).toBe(80); // 100 - 40/2
        expect(rect.y).toBe(110); // 100 + 6 (radius) + 4
    });

    test('label height is always 14px', () => {
        for (const pos of ['right', 'left', 'top', 'bottom'] as const) {
            expect(getLabelRect(50, 50, 30, pos).height).toBe(14);
        }
    });
});

// ============================================================================
// rectsOverlap
// ============================================================================

describe('rectsOverlap', () => {
    test('identical rects overlap', () => {
        const rect: LabelRect = { x: 0, y: 0, width: 10, height: 10 };
        expect(rectsOverlap(rect, rect)).toBe(true);
    });

    test('non-overlapping rects return false', () => {
        const a: LabelRect = { x: 0, y: 0, width: 10, height: 10 };
        const b: LabelRect = { x: 20, y: 20, width: 10, height: 10 };
        expect(rectsOverlap(a, b)).toBe(false);
    });

    test('touching edges do not overlap (exclusive boundaries)', () => {
        const a: LabelRect = { x: 0, y: 0, width: 10, height: 10 };
        const b: LabelRect = { x: 10, y: 0, width: 10, height: 10 };
        expect(rectsOverlap(a, b)).toBe(false);
    });

    test('partial overlap returns true', () => {
        const a: LabelRect = { x: 0, y: 0, width: 10, height: 10 };
        const b: LabelRect = { x: 5, y: 5, width: 10, height: 10 };
        expect(rectsOverlap(a, b)).toBe(true);
    });

    test('one rect inside another', () => {
        const outer: LabelRect = { x: 0, y: 0, width: 100, height: 100 };
        const inner: LabelRect = { x: 25, y: 25, width: 10, height: 10 };
        expect(rectsOverlap(outer, inner)).toBe(true);
    });
});

// ============================================================================
// positionToCssClass
// ============================================================================

describe('positionToCssClass', () => {
    test('right returns empty string (default CSS)', () => {
        expect(positionToCssClass('right')).toBe('');
    });

    test('left returns label-left', () => {
        expect(positionToCssClass('left')).toBe('label-left');
    });

    test('top returns label-top', () => {
        expect(positionToCssClass('top')).toBe('label-top');
    });

    test('bottom returns label-bottom', () => {
        expect(positionToCssClass('bottom')).toBe('label-bottom');
    });
});

// ============================================================================
// resolvePlayerLabelPositions
// ============================================================================

describe('resolvePlayerLabelPositions', () => {
    test('single marker defaults to right', () => {
        const result = resolvePlayerLabelPositions([
            { name: 'Alice', screenX: 100, screenY: 100 }
        ]);
        expect(result).toHaveLength(1);
        expect(result[0]?.cssClass).toBe('');
        expect(result[0]?.name).toBe('Alice');
    });

    test('two distant markers both get right', () => {
        const result = resolvePlayerLabelPositions([
            { name: 'Alice', screenX: 100, screenY: 100 },
            { name: 'Bob', screenX: 100, screenY: 300 }
        ]);
        expect(result[0]?.cssClass).toBe('');
        expect(result[1]?.cssClass).toBe('');
    });

    test('two stacked markers: second gets left', () => {
        // Same position → right labels overlap, second should get 'left'
        const result = resolvePlayerLabelPositions([
            { name: 'Alice', screenX: 100, screenY: 100 },
            { name: 'Bob', screenX: 100, screenY: 100 }
        ]);
        expect(result[0]?.cssClass).toBe('');          // right (default)
        expect(result[1]?.cssClass).toBe('label-left'); // avoids right
    });

    test('first marker in array has priority', () => {
        // The navigating player should be passed first by the caller
        const result = resolvePlayerLabelPositions([
            { name: 'Navigator', screenX: 100, screenY: 100 },
            { name: 'Other', screenX: 100, screenY: 100 }
        ]);
        expect(result[0]?.cssClass).toBe('');
        expect(result[1]?.cssClass).toBe('label-left');
    });

    test('three stacked markers use different positions', () => {
        const result = resolvePlayerLabelPositions([
            { name: 'A', screenX: 100, screenY: 100 },
            { name: 'B', screenX: 100, screenY: 100 },
            { name: 'C', screenX: 100, screenY: 100 }
        ]);
        const classes = result.map(l => l.cssClass);
        // right, left, then top or bottom
        expect(classes[0]).toBe('');
        expect(classes[1]).toBe('label-left');
        expect(classes[2]).toBe('label-top');
    });

    test('four stacked markers exhaust positions, fifth falls back to right', () => {
        const markers = ['A', 'B', 'C', 'D', 'E'].map(name => ({
            name, screenX: 100, screenY: 100
        }));
        const result = resolvePlayerLabelPositions(markers);
        // Four unique positions used, fifth falls back to right
        expect(result).toHaveLength(5);
        expect(result[4]?.cssClass).toBe(''); // fallback to right
    });

    test('empty input returns empty output', () => {
        const result = resolvePlayerLabelPositions([]);
        expect(result).toHaveLength(0);
    });

    test('each result includes the player name', () => {
        const result = resolvePlayerLabelPositions([
            { name: 'Alice', screenX: 50, screenY: 50 },
            { name: 'Bob', screenX: 200, screenY: 200 }
        ]);
        expect(result[0]?.name).toBe('Alice');
        expect(result[1]?.name).toBe('Bob');
    });

    test('each result includes a bounding rect', () => {
        const result = resolvePlayerLabelPositions([
            { name: 'Alice', screenX: 100, screenY: 100 }
        ]);
        const rect = result[0]?.rect;
        expect(rect).toBeDefined();
        expect(rect!.width).toBeGreaterThan(0);
        expect(rect!.height).toBeGreaterThan(0);
    });
});
