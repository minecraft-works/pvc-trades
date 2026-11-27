/**
 * Unit tests for src/search/deviation.ts
 */
import { describe, expect, test } from 'vitest';

import { createTrade, plainItem, setupTestStores } from '../test-fixtures.js';
import type { Trade, TradeInput } from '../types.js';
import { toValuationInput } from '../valuation/item-identity.js';
import { calculateItemValues, calculatePairPrices } from '../valuation/item-values.js';
import { createDeviationCalculator } from './deviation.js';

// String constants to avoid duplication
const EMERALD = 'EMERALD';
const EMERALD_LOWER = 'emerald';
const COOKED_BEEF_TITLE = 'Cooked beef';

// Mock fetch and load block conversions, core blocks and config before tests run
setupTestStores();

// Helper: one cooked beef sold for `costAmount` of `costType` at (x, 64, 0)
const beefTrade = (costType: string, costAmount: number, x: number): Trade => ({
    ...createTrade(1, costAmount, COOKED_BEEF_TITLE, 1),
    x,
    y: 64,
    resultItem: plainItem('COOKED_BEEF', 1),
    item1: plainItem(costType, costAmount),
});

// Helper: deviation calculator built from the given trades, as the data loader does
const calculatorFor = (trades: readonly Trade[]) => {
    const inputs: TradeInput[] = [];
    for (const trade of trades) {
        const input = toValuationInput(trade);
        if (input) { inputs.push(input); }
    }
    return createDeviationCalculator(calculateItemValues(inputs, EMERALD_LOWER), calculatePairPrices(inputs));
};

describe('deviation calculator', () => {
    test('compares with other listings in the same currency first', () => {
        const cheap = beefTrade('GOLD_INGOT', 1, 0);
        const expensive = beefTrade('GOLD_INGOT', 3, 1000);
        const getDeviation = calculatorFor([cheap, expensive]);
        // Median gold price is 2 per beef
        expect(getDeviation(cheap)).toMatchObject({ percent: -50, basis: 'same-currency' });
        expect(getDeviation(expensive)).toMatchObject({ percent: 50, basis: 'same-currency' });
    });

    test('gives no deviation without trusted data on either basis', () => {
        const getDeviation = calculatorFor([beefTrade(EMERALD, 2, 0), beefTrade(EMERALD, 2, 1000)]);
        // Gold has no trusted value and no other gold-priced beef exists
        expect(getDeviation(beefTrade('GOLD_INGOT', 1, 2000))).toBeUndefined();
    });

    test('values a mixed shulker cost by its contents in emeralds', () => {
        const getDeviation = calculatorFor([beefTrade(EMERALD, 2, 0), beefTrade(EMERALD, 2, 1000)]);
        const shulkerTrade: Trade = {
            ...beefTrade(EMERALD, 1, 2000),
            resultItem: { type: 'COOKED_BEEF', name: '', amount: 64 },
            resultAmount: 64,
            item1: { type: 'SHULKER_BOX', name: '', amount: 1, lore: ['- 28x EMERALD', '- 4x EMERALD_BLOCK'] },
        };
        // 28 + 4×9 = 64 emeralds for 64 beef worth 128 emeralds
        expect(getDeviation(shulkerTrade)).toMatchObject({ percent: -50, basis: 'emerald' });
    });
});
