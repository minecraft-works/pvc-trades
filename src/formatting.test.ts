/**
 * Unit tests for src/formatting.ts
 */
import { describe, expect, test } from 'vitest';

import { formatName } from './formatting.js';

// String constants to avoid duplication
const DIAMOND = 'DIAMOND';
const VOTE_DIAMOND_TYPE = 'Vote Diamond';

describe('formatName', () => {
    test('uses item name if present', () => {
        expect(formatName({ type: DIAMOND, name: VOTE_DIAMOND_TYPE, amount: 1 })).toBe('Vote diamond');
    });

    test('uses type if no name', () => {
        expect(formatName({ type: 'DIAMOND_BLOCK', name: '', amount: 1 })).toBe('Diamond block');
    });

    test('replaces underscores with spaces', () => {
        expect(formatName({ type: 'EMERALD_BLOCK', name: '', amount: 1 })).toBe('Emerald block');
    });

    test('handles empty name and type', () => {
        expect(formatName({ type: '', name: '', amount: 1 })).toBe('');
    });
});
