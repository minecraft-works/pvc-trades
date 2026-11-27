import { describe, expect, test } from 'vitest';

import { setupTestStores } from '../test-fixtures.js';
import type { ItemValues, PriceEntry } from '../types.js';
import { countIndependentShops, getTrustedItemValue, hasEnoughIndependentData, median } from './statistics.js';

// String constants to avoid duplication
const COOKED_BEEF = 'cooked beef';
const COOKED_BEEF_TITLE = 'Cooked beef';
const DIAMOND_BLOCK = 'diamond block';
const DIAMOND_BLOCK_TITLE = 'Diamond Block';

// Mock fetch and load block conversions, core blocks and config before tests run
setupTestStores();

describe('cached statistics', () => {
    test('reflect prices appended after an earlier call', () => {
        const prices: PriceEntry[] = [{ price: 1, x: 0, y: 64, z: 0 }];
        expect(median(prices)).toBe(1);
        expect(countIndependentShops(prices)).toBe(1);

        prices.push({ price: 3, x: 1000, y: 64, z: 0 });

        expect(median(prices)).toBe(2);
        expect(countIndependentShops(prices)).toBe(2);
    });
});

describe('countIndependentShops', () => {
    test('counts distant shops as independent', () => {
        const prices = [
            { price: 1, x: 0, y: 64, z: 0 },
            { price: 1, x: 100, y: 64, z: 100 },
            { price: 1, x: -100, y: 64, z: -100 }
        ];
        expect(countIndependentShops(prices)).toBe(3);
    });

    test('clusters nearby shops', () => {
        const prices = [
            { price: 1, x: 0, y: 64, z: 0 },
            { price: 1, x: 5, y: 64, z: 5 },
            { price: 1, x: 100, y: 64, z: 100 }
        ];
        // First two are within 16 blocks, third is separate
        expect(countIndependentShops(prices)).toBe(2);
    });

    test('returns 0 for empty array', () => {
        expect(countIndependentShops([])).toBe(0);
    });

    test('counts one owner\'s distant shops as one source (any case)', () => {
        const prices = [
            { price: 1, x: 0, y: 64, z: 0, owner: 'Larryy' },
            { price: 1, x: 5000, y: 64, z: 0, owner: 'larryy' },
            { price: 1, x: -5000, y: 64, z: 0, owner: 'Other' }
        ];
        expect(countIndependentShops(prices)).toBe(2);
    });

    test('does not chain neighbours of an owner\'s shop to that owner\'s other shops', () => {
        // A mall: Alice and Bob trade side by side; Bob also has a shop far away
        const prices = [
            { price: 1, x: 0, y: 64, z: 0, owner: 'Alice' },
            { price: 1, x: 4, y: 64, z: 0, owner: 'Bob' },
            { price: 1, x: 3000, y: 64, z: 0, owner: 'Bob' }
        ];
        expect(countIndependentShops(prices)).toBe(2);
    });
});

describe('hasEnoughIndependentData', () => {
    test('returns true when enough independent shops', () => {
        const entry = {
            name: 'Test',
            buyPrices: [
                { price: 1, x: 0, y: 64, z: 0 },
                { price: 1, x: 100, y: 64, z: 100 },
                { price: 1, x: -100, y: 64, z: -100 }
            ],
            sellPrices: []
        };
        expect(hasEnoughIndependentData(entry)).toBe(true);
    });

    test('returns false when not enough independent shops', () => {
        const entry = {
            name: 'Test',
            buyPrices: [
                { price: 1, x: 0, y: 64, z: 0 },
                { price: 1, x: 5, y: 64, z: 5 }
            ],
            sellPrices: []
        };
        expect(hasEnoughIndependentData(entry)).toBe(false);
    });

    test('considers both buy and sell prices', () => {
        const entry = {
            name: 'Test',
            buyPrices: [{ price: 1, x: 0, y: 64, z: 0 }],
            sellPrices: [
                { price: 1, x: 100, y: 64, z: 100 },
                { price: 1, x: 200, y: 64, z: 200 },
                { price: 1, x: 300, y: 64, z: 300 }
            ]
        };
        expect(hasEnoughIndependentData(entry)).toBe(true);
    });
});

describe('getTrustedItemValue', () => {
    test('emerald always returns 1', () => {
        const values: ItemValues = new Map();
        expect(getTrustedItemValue('emerald', values)).toBe(1);
    });

    test('emerald block always returns 9', () => {
        const values: ItemValues = new Map();
        expect(getTrustedItemValue('emerald block', values)).toBe(9);
    });

    test('returns median for trusted item', () => {
        const values: ItemValues = new Map([['diamond', {
            name: 'Diamond',
            buyPrices: [
                { price: 10, x: 0, y: 0, z: 0 },
                { price: 12, x: 100, y: 0, z: 0 },
                { price: 11, x: 200, y: 0, z: 0 }
            ],
            sellPrices: []
        }]]);
        expect(getTrustedItemValue('diamond', values)).toBe(11);
    });

    test('non-core item from a single shop has no trusted value', () => {
        const values: ItemValues = new Map([[COOKED_BEEF, {
            name: COOKED_BEEF_TITLE,
            buyPrices: [{ price: 2, x: 0, y: 64, z: 0 }, { price: 3, x: 5, y: 64, z: 5 }],
            sellPrices: []
        }]]);
        // Both listings are within the cluster distance: one independent shop
        expect(getTrustedItemValue(COOKED_BEEF, values)).toBeUndefined();
        expect(getTrustedItemValue(COOKED_BEEF, values, { minItemShops: 1 })).toBe(2.5);
    });

    test('non-core item from two independent shops is trusted', () => {
        const values: ItemValues = new Map([[COOKED_BEEF, {
            name: COOKED_BEEF_TITLE,
            buyPrices: [{ price: 2, x: 0, y: 64, z: 0 }],
            sellPrices: [{ price: 1, x: 500, y: 64, z: 0 }]
        }]]);
        expect(getTrustedItemValue(COOKED_BEEF, values)).toBe(1.5);
    });
});

describe('getTrustedItemValue core block outliers', () => {
    test('ignores a core block side backed by too few independent shops', () => {
        const values: ItemValues = new Map([['diamond block', {
            name: 'Diamond Block',
            buyPrices: [{ price: 24, x: 0, y: 0, z: 0 }],
            sellPrices: [
                { price: 90, x: 0, y: 0, z: 0 },
                { price: 90, x: 100, y: 0, z: 0 },
                { price: 90, x: 200, y: 0, z: 0 }
            ]
        }]]);
        expect(getTrustedItemValue('Diamond Block', values)).toBe(90);
    });
});

describe('getTrustedItemValue - advanced cases', () => {
    test('uses average of buy and sell when both available', () => {
        const values: ItemValues = new Map([['diamond', {
            name: 'Diamond',
            buyPrices: [
                { price: 10, x: 0, y: 0, z: 0 },
                { price: 10, x: 100, y: 0, z: 0 },
                { price: 10, x: 200, y: 0, z: 0 }
            ],
            sellPrices: [
                { price: 8, x: 0, y: 0, z: 0 },
                { price: 8, x: 100, y: 0, z: 0 },
                { price: 8, x: 200, y: 0, z: 0 }
            ]
        }]]);
        expect(getTrustedItemValue('diamond', values)).toBe(9); // (10 + 8) / 2
    });

    test('uses sell price when buy unavailable', () => {
        const values: ItemValues = new Map([['coal', {
            name: 'Coal',
            buyPrices: [],
            sellPrices: [
                { price: 0.5, x: 0, y: 0, z: 0 },
                { price: 0.5, x: 100, y: 0, z: 0 },
                { price: 0.5, x: 200, y: 0, z: 0 }
            ]
        }]]);
        expect(getTrustedItemValue('coal', values)).toBe(0.5);
    });

    test('returns null for unknown item', () => {
        const values: ItemValues = new Map();
        expect(getTrustedItemValue('unknown item', values)).toBeUndefined();
    });

    test('falls back to block conversion for core block ingot', () => {
        const values: ItemValues = new Map([[DIAMOND_BLOCK, {
            name: DIAMOND_BLOCK_TITLE,
            buyPrices: [
                { price: 90, x: 0, y: 0, z: 0 },
                { price: 90, x: 100, y: 0, z: 0 },
                { price: 90, x: 200, y: 0, z: 0 }
            ],
            sellPrices: []
        }]]);
        // No direct diamond value, but has diamond block value
        // Diamond should get value from diamond block / 9
        expect(getTrustedItemValue('diamond', values)).toBe(10);
    });

    test('core block requires min independent shops', () => {
        const values: ItemValues = new Map([[DIAMOND_BLOCK, {
            name: DIAMOND_BLOCK_TITLE,
            buyPrices: [
                { price: 90, x: 0, y: 0, z: 0 },
                { price: 90, x: 5, y: 0, z: 0 } // Too close to first
            ],
            sellPrices: []
        }]]);
        // Only 2 nearby shops for a core block (diamond block)
        // Should not trust with only 2 clustered shops
        expect(getTrustedItemValue('diamond block', values, { minShops: 3 })).toBeUndefined();
    });
});

describe('median', () => {
    test('returns null for empty array', () => {
        expect(median([])).toBeUndefined();
    });

    test('returns single value', () => {
        expect(median([{ price: 5, x: 0, y: 0, z: 0 }])).toBe(5);
    });

    test('returns middle value for odd count', () => {
        expect(median([
            { price: 1, x: 0, y: 0, z: 0 },
            { price: 3, x: 0, y: 0, z: 0 },
            { price: 5, x: 0, y: 0, z: 0 }
        ])).toBe(3);
    });

    test('returns average of two middle values for even count', () => {
        expect(median([
            { price: 1, x: 0, y: 0, z: 0 },
            { price: 2, x: 0, y: 0, z: 0 },
            { price: 3, x: 0, y: 0, z: 0 },
            { price: 4, x: 0, y: 0, z: 0 }
        ])).toBe(2.5);
    });

    test('handles number array', () => {
        expect(median([1, 2, 3])).toBe(2);
    });
});
