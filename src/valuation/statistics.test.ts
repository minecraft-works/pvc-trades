import { describe, expect, test } from 'vitest';

import type { PriceEntry } from '../types.js';
import { countIndependentShops, median } from './statistics.js';

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
