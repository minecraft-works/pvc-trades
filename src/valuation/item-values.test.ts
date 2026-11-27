/**
 * Unit tests for src/valuation/item-values.ts
 */
import { describe, expect, test } from 'vitest';

import { setupTestStores } from '../test-fixtures.js';
import type { TradeInput } from '../types.js';
import { calculateItemValues } from './item-values.js';
import { getTrustedItemValue } from './statistics.js';

// String constants to avoid duplication
const EMERALD_LOWER = 'emerald';
const DIAMOND_LOWER = 'diamond';
const EMERALD_TITLE = 'Emerald';
const DIAMOND_BLOCK_TITLE = 'Diamond Block';
const DIAMOND_TITLE = 'Diamond';

// Mock fetch and load block conversions, core blocks and config before tests run
setupTestStores();

describe('calculateItemValues', () => {
    test('calculates buy prices from emerald trades', () => {
        const trades: TradeInput[] = [
            { costName: EMERALD_TITLE, costAmount: 10, item1Name: EMERALD_TITLE, resultName: DIAMOND_TITLE, resultAmount: 1, x: 0, y: 0, z: 0 }
        ];
        const values = calculateItemValues(trades, EMERALD_LOWER);
        const diamond = values.get(DIAMOND_LOWER);
        expect(diamond).toBeDefined();
        expect(diamond!.buyPrices[0]!.price).toBe(10);
    });

    test('calculates sell prices', () => {
        const trades: TradeInput[] = [
            { costName: 'Iron ingot', costAmount: 10, item1Name: 'Iron ingot', resultName: EMERALD_TITLE, resultAmount: 1, x: 0, y: 0, z: 0 }
        ];
        const values = calculateItemValues(trades, EMERALD_LOWER);
        const iron = values.get('iron ingot');
        expect(iron).toBeDefined();
        expect(iron!.sellPrices[0]!.price).toBe(0.1);
    });

    test('handles emerald block as 9 emeralds', () => {
        const trades: TradeInput[] = [
            { costName: 'Emerald block', costAmount: 1, item1Name: 'Emerald block', resultName: DIAMOND_TITLE, resultAmount: 9, x: 0, y: 0, z: 0 }
        ];
        const values = calculateItemValues(trades, EMERALD_LOWER);
        const diamond = values.get(DIAMOND_LOWER);
        expect(diamond!.buyPrices[0]!.price).toBe(1); // 9 emeralds / 9 diamonds = 1
    });

    test('collects multiple transitive prices for core blocks', () => {
        // Regression: transitive derivation must collect all trades in one iteration
        // so core blocks can accumulate enough independent shops to pass trust filters.
        // Diamond Block is valued via direct emerald trades at 3 independent shops.
        // Netherite Ingot is ONLY priced in Diamond Block (no direct emerald trades).
        // All 4 Netherite trades should contribute values, not just the first one.
        const trades: TradeInput[] = [
            // Phase 1: Diamond Block gets emerald value (3 independent shops)
            { costName: EMERALD_TITLE, costAmount: 90, item1Name: EMERALD_TITLE, resultName: DIAMOND_BLOCK_TITLE, resultAmount: 1, x: 0, y: 0, z: 0 },
            { costName: EMERALD_TITLE, costAmount: 90, item1Name: EMERALD_TITLE, resultName: DIAMOND_BLOCK_TITLE, resultAmount: 1, x: 100, y: 0, z: 0 },
            { costName: EMERALD_TITLE, costAmount: 90, item1Name: EMERALD_TITLE, resultName: DIAMOND_BLOCK_TITLE, resultAmount: 1, x: 200, y: 0, z: 0 },
            // Phase 2: Netherite Ingot priced in Diamond Block at 4 independent shops
            { costName: DIAMOND_BLOCK_TITLE, costAmount: 10, item1Name: DIAMOND_BLOCK_TITLE, resultName: 'Netherite Ingot', resultAmount: 1, x: 300, y: 0, z: 0 },
            { costName: DIAMOND_BLOCK_TITLE, costAmount: 10, item1Name: DIAMOND_BLOCK_TITLE, resultName: 'Netherite Ingot', resultAmount: 1, x: 400, y: 0, z: 0 },
            { costName: DIAMOND_BLOCK_TITLE, costAmount: 10, item1Name: DIAMOND_BLOCK_TITLE, resultName: 'Netherite Ingot', resultAmount: 1, x: 500, y: 0, z: 0 },
            { costName: DIAMOND_BLOCK_TITLE, costAmount: 10, item1Name: DIAMOND_BLOCK_TITLE, resultName: 'Netherite Ingot', resultAmount: 1, x: 600, y: 0, z: 0 },
        ];
        const values = calculateItemValues(trades, EMERALD_LOWER);
        const netherite = values.get('netherite ingot');
        expect(netherite).toBeDefined();
        // All 4 trades should contribute, not just the first one
        expect(netherite!.buyPrices).toHaveLength(4);
        // Each: 10 Diamond Blocks × 90 emeralds / 1 = 900 emeralds
        for (const price of netherite!.buyPrices) {
            expect(price.price).toBe(900);
        }
        // Trusted value should be available since 4 shops > 3 minimum
        const trusted = getTrustedItemValue('Netherite Ingot', values);
        expect(trusted).toBe(900);
    });

    test('derives buy prices for an item that already has sell data', () => {
        // Regression: an item with only a sell price must still gain buy prices
        // from trades paying with a known item.
        const trades: TradeInput[] = [
            { costName: EMERALD_TITLE, costAmount: 90, item1Name: EMERALD_TITLE, resultName: DIAMOND_BLOCK_TITLE, resultAmount: 1, x: 0, y: 0, z: 0 },
            { costName: EMERALD_TITLE, costAmount: 90, item1Name: EMERALD_TITLE, resultName: DIAMOND_BLOCK_TITLE, resultAmount: 1, x: 100, y: 0, z: 0 },
            { costName: EMERALD_TITLE, costAmount: 90, item1Name: EMERALD_TITLE, resultName: DIAMOND_BLOCK_TITLE, resultAmount: 1, x: 200, y: 0, z: 0 },
            // Netherite Ingot sold for emeralds: sell-only entry
            { costName: 'Netherite Ingot', costAmount: 1, item1Name: 'Netherite Ingot', resultName: EMERALD_TITLE, resultAmount: 500, x: 50, y: 0, z: 0 },
            { costName: DIAMOND_BLOCK_TITLE, costAmount: 10, item1Name: DIAMOND_BLOCK_TITLE, resultName: 'Netherite Ingot', resultAmount: 1, x: 300, y: 0, z: 0 },
        ];
        const values = calculateItemValues(trades, EMERALD_LOWER);
        const netherite = values.get('netherite ingot');
        expect(netherite!.buyPrices.map(p => p.price)).toEqual([900]);
    });

    test('derives sell prices from trades once an item has only a stray sell price', () => {
        // Regression: a single direct sell must not stop other trades paying out a
        // known item from contributing sell prices (each trade contributes once).
        const trades: TradeInput[] = [
            { costName: EMERALD_TITLE, costAmount: 90, item1Name: EMERALD_TITLE, resultName: DIAMOND_BLOCK_TITLE, resultAmount: 1, x: 0, y: 0, z: 0 },
            { costName: EMERALD_TITLE, costAmount: 90, item1Name: EMERALD_TITLE, resultName: DIAMOND_BLOCK_TITLE, resultAmount: 1, x: 100, y: 0, z: 0 },
            { costName: EMERALD_TITLE, costAmount: 90, item1Name: EMERALD_TITLE, resultName: DIAMOND_BLOCK_TITLE, resultAmount: 1, x: 200, y: 0, z: 0 },
            { costName: 'Netherite Ingot', costAmount: 1, item1Name: 'Netherite Ingot', resultName: EMERALD_TITLE, resultAmount: 500, x: 50, y: 0, z: 0 },
            { costName: 'Netherite Ingot', costAmount: 1, item1Name: 'Netherite Ingot', resultName: DIAMOND_BLOCK_TITLE, resultAmount: 8, x: 300, y: 0, z: 0 },
            { costName: 'Netherite Ingot', costAmount: 1, item1Name: 'Netherite Ingot', resultName: DIAMOND_BLOCK_TITLE, resultAmount: 8, x: 400, y: 0, z: 0 },
        ];
        const values = calculateItemValues(trades, EMERALD_LOWER);
        const netherite = values.get('netherite ingot');
        // 1 direct sell + 2 derived (8 × 90 = 720), each trade counted once
        expect(netherite!.sellPrices.map(p => p.price).toSorted((a, b) => a - b)).toEqual([500, 720, 720]);
        // The derived trades must not also create circular buy prices for Diamond Block
        expect(values.get('diamond block')!.buyPrices).toHaveLength(3);
    });
});
