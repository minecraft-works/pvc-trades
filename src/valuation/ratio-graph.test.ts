/**
 * Unit tests for src/valuation/ratio-graph.ts
 */
import { describe, expect, test } from 'vitest';

import { setupTestStores } from '../test-fixtures.js';
import type { ItemValues } from '../types.js';
import { buildExchangeMatrix, buildRatioGraph, getRatio } from './ratio-graph.js';

// String constants to avoid duplication
const GOLD_INGOT = 'gold ingot';
const GOLD_BLOCK_TITLE = 'Gold Block';
const DIAMOND_BLOCK_TITLE = 'Diamond Block';

// Mock fetch and load block conversions, core blocks and config before tests run
setupTestStores();

describe('buildRatioGraph and getRatio', () => {
    test('builds ratio graph from item values', () => {
        const values: ItemValues = new Map([['diamond', {
            name: 'Diamond',
            buyPrices: [
                { price: 10, x: 0, y: 0, z: 0 },
                { price: 10, x: 100, y: 0, z: 0 },
                { price: 10, x: 200, y: 0, z: 0 }
            ],
            sellPrices: []
        }], [GOLD_INGOT, {
            name: 'Gold Ingot',
            buyPrices: [
                { price: 2, x: 0, y: 0, z: 0 },
                { price: 2, x: 100, y: 0, z: 0 },
                { price: 2, x: 200, y: 0, z: 0 }
            ],
            sellPrices: []
        }]]);

        const graph = buildRatioGraph(values);

        // Diamond block = 9 diamonds = 90 emeralds
        // Gold block = 9 gold ingots = 18 emeralds
        const ratio = getRatio(graph, DIAMOND_BLOCK_TITLE, GOLD_BLOCK_TITLE);
        expect(ratio).toBeCloseTo(5); // 90/18 = 5
    });

    test('returns null for unknown ratio', () => {
        const values: ItemValues = new Map();
        const graph = buildRatioGraph(values);
        expect(getRatio(graph, 'Unknown', 'Item')).toBeUndefined();
    });

    test('preserves direct block price over ingot-derived value', () => {
        // Diamond Block has direct trades at 90 emeralds ((100+80)/2)
        // Diamond ingot trades at 10 emeralds → derived block = 90 (coincidence)
        // Gold Ingot at 2 emeralds → Gold Block derived = 18
        // The key: Diamond Block uses its direct price (90), not ingot×9
        const values: ItemValues = new Map([
            ['diamond block', {
                name: 'Diamond Block',
                buyPrices: [
                    { price: 100, x: 0, y: 0, z: 0 },
                    { price: 100, x: 100, y: 0, z: 0 },
                    { price: 100, x: 200, y: 0, z: 0 }
                ],
                sellPrices: [
                    { price: 80, x: 0, y: 0, z: 0 },
                    { price: 80, x: 100, y: 0, z: 0 },
                    { price: 80, x: 200, y: 0, z: 0 }
                ]
            }],
            ['diamond', {
                name: 'Diamond',
                buyPrices: [
                    { price: 5, x: 0, y: 0, z: 0 },
                    { price: 5, x: 100, y: 0, z: 0 },
                    { price: 5, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }],
            ['gold ingot', {
                name: 'Gold Ingot',
                buyPrices: [
                    { price: 2, x: 0, y: 0, z: 0 },
                    { price: 2, x: 100, y: 0, z: 0 },
                    { price: 2, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }]
        ]);

        const graph = buildRatioGraph(values);
        // Diamond Block = 90 (direct), Gold Block = 9×2 = 18 (derived)
        // Without the fix, Diamond Block would be 9×5 = 45, ratio = 45/18 = 2.5
        // With the fix, Diamond Block = 90, ratio = 90/18 = 5
        const ratio = getRatio(graph, DIAMOND_BLOCK_TITLE, GOLD_BLOCK_TITLE);
        expect(ratio).toBeCloseTo(5); // 90/18 = 5
    });

    test('falls back to ingot-derived value when no direct block trades', () => {
        // Only "diamond" has trades, not "diamond block"
        // So diamond block value should come from ingot × 9
        const values: ItemValues = new Map([
            ['diamond', {
                name: 'Diamond',
                buyPrices: [
                    { price: 10, x: 0, y: 0, z: 0 },
                    { price: 10, x: 100, y: 0, z: 0 },
                    { price: 10, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }],
            ['gold ingot', {
                name: 'Gold Ingot',
                buyPrices: [
                    { price: 2, x: 0, y: 0, z: 0 },
                    { price: 2, x: 100, y: 0, z: 0 },
                    { price: 2, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }]
        ]);

        const graph = buildRatioGraph(values);
        // Diamond block = 9 × 10 = 90, Gold block = 9 × 2 = 18
        const ratio = getRatio(graph, DIAMOND_BLOCK_TITLE, GOLD_BLOCK_TITLE);
        expect(ratio).toBeCloseTo(5); // 90/18
    });
});

const makeShops = (price: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({ price, x: index * 100, y: 0, z: 0 }));

describe('buildExchangeMatrix', () => {
    test('returns ratios between core blocks using buy prices', () => {
        const values: ItemValues = new Map([
            ['diamond block', {
                name: 'Diamond Block',
                buyPrices: [
                    { price: 90, x: 0, y: 0, z: 0 },
                    { price: 90, x: 100, y: 0, z: 0 },
                    { price: 90, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }],
            ['iron block', {
                name: 'Iron Block',
                buyPrices: [
                    { price: 9, x: 0, y: 0, z: 0 },
                    { price: 9, x: 100, y: 0, z: 0 },
                    { price: 9, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }]
        ]);

        const matrix = buildExchangeMatrix(values, 'buy');
        expect(matrix.labels).toContain('Diamond Block');
        expect(matrix.labels).toContain('Iron Block');

        const diamondIndex = matrix.labels.indexOf('Diamond Block');
        const ironIndex = matrix.labels.indexOf('Iron Block');
        // 1 Diamond Block = 10 Iron Blocks (90/9)
        expect(matrix.ratios[diamondIndex]![ironIndex]).toBe(10);
        // 1 Iron Block = 0.1 Diamond Blocks (9/90)
        expect(matrix.ratios[ironIndex]![diamondIndex]).toBe(0.1);
    });

    test('diagonal is always 1', () => {
        const values: ItemValues = new Map([
            ['gold block', {
                name: 'Gold Block',
                buyPrices: [
                    { price: 36, x: 0, y: 0, z: 0 },
                    { price: 36, x: 100, y: 0, z: 0 },
                    { price: 36, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }]
        ]);

        const matrix = buildExchangeMatrix(values, 'buy');
        for (const [index, row] of matrix.ratios.entries()) {
            expect(row[index]).toBe(1);
        }
    });

    test('returns empty matrix when no core blocks have data', () => {
        const values: ItemValues = new Map([
            ['wheat', {
                name: 'Wheat',
                buyPrices: [{ price: 1, x: 0, y: 0, z: 0 }],
                sellPrices: []
            }]
        ]);

        const matrix = buildExchangeMatrix(values, 'buy');
        // Only emerald (always value 1) and blocks derivable from it should appear
        const nonDerived = matrix.labels.filter(
            label => label !== 'Emerald' && label !== 'Emerald Block'
        );
        expect(nonDerived).toHaveLength(0);
    });

    test('uses sell prices when side is sell', () => {
        const values: ItemValues = new Map([
            ['diamond block', {
                name: 'Diamond Block',
                buyPrices: [
                    { price: 100, x: 0, y: 0, z: 0 },
                    { price: 100, x: 100, y: 0, z: 0 },
                    { price: 100, x: 200, y: 0, z: 0 }
                ],
                sellPrices: [
                    { price: 80, x: 0, y: 0, z: 0 },
                    { price: 80, x: 100, y: 0, z: 0 },
                    { price: 80, x: 200, y: 0, z: 0 }
                ]
            }],
            ['gold block', {
                name: 'Gold Block',
                buyPrices: [
                    { price: 40, x: 0, y: 0, z: 0 },
                    { price: 40, x: 100, y: 0, z: 0 },
                    { price: 40, x: 200, y: 0, z: 0 }
                ],
                sellPrices: [
                    { price: 20, x: 0, y: 0, z: 0 },
                    { price: 20, x: 100, y: 0, z: 0 },
                    { price: 20, x: 200, y: 0, z: 0 }
                ]
            }]
        ]);

        const buyMatrix = buildExchangeMatrix(values, 'buy');
        const sellMatrix = buildExchangeMatrix(values, 'sell');

        const diamondBuyIndex = buyMatrix.labels.indexOf('Diamond Block');
        const goldBuyIndex = buyMatrix.labels.indexOf('Gold Block');
        // Buy: 1 Diamond Block = 100/40 = 2.5 Gold Blocks
        expect(buyMatrix.ratios[diamondBuyIndex]![goldBuyIndex]).toBe(2.5);

        const diamondSellIndex = sellMatrix.labels.indexOf('Diamond Block');
        const goldSellIndex = sellMatrix.labels.indexOf('Gold Block');
        // Sell: 1 Diamond Block = 80/20 = 4 Gold Blocks
        expect(sellMatrix.ratios[diamondSellIndex]![goldSellIndex]).toBe(4);
    });

    test('ignores a core block whose own side has too few independent shops', () => {
        // One outlier buy shop must not override the diamond-derived value, even
        // though the sell side has plenty of independent shops.
        const values: ItemValues = new Map([
            ['diamond block', {
                name: 'Diamond Block',
                buyPrices: [{ price: 24, x: 0, y: 0, z: 0 }],
                sellPrices: [
                    { price: 90, x: 0, y: 0, z: 0 },
                    { price: 90, x: 100, y: 0, z: 0 },
                    { price: 90, x: 200, y: 0, z: 0 }
                ]
            }],
            ['diamond', {
                name: 'Diamond',
                buyPrices: [
                    { price: 10, x: 0, y: 0, z: 0 },
                    { price: 10, x: 100, y: 0, z: 0 },
                    { price: 10, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }],
            ['iron block', {
                name: 'Iron Block',
                buyPrices: [
                    { price: 9, x: 0, y: 0, z: 0 },
                    { price: 9, x: 100, y: 0, z: 0 },
                    { price: 9, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }]
        ]);

        const matrix = buildExchangeMatrix(values, 'buy');
        const diamondBlockIndex = matrix.labels.indexOf('Diamond Block');
        const ironBlockIndex = matrix.labels.indexOf('Iron Block');
        // Diamond Block = diamond × 9 = 90, not the outlier 24
        expect(matrix.ratios[diamondBlockIndex]![ironBlockIndex]).toBe(10);
    });

    test('defers to the base item when it is much better backed than the block', () => {
        // Diamond Block has 3 junk buy prices, Diamond has 6 independent shops.
        const values: ItemValues = new Map([
            ['diamond block', { name: 'Diamond Block', buyPrices: makeShops(24, 3), sellPrices: [] }],
            ['diamond', { name: 'Diamond', buyPrices: makeShops(10, 6), sellPrices: [] }],
            ['iron block', { name: 'Iron Block', buyPrices: makeShops(9, 3), sellPrices: [] }]
        ]);

        const matrix = buildExchangeMatrix(values, 'buy');
        const diamondBlockIndex = matrix.labels.indexOf('Diamond Block');
        const ironBlockIndex = matrix.labels.indexOf('Iron Block');
        // Diamond Block = diamond × 9 = 90, not its own 24
        expect(matrix.ratios[diamondBlockIndex]![ironBlockIndex]).toBe(10);
    });

    test('derives block values from base item via block conversions', () => {
        // Only "diamond" has data, "diamond block" should be derived (diamond × 9)
        const values: ItemValues = new Map([
            ['diamond', {
                name: 'Diamond',
                buyPrices: [
                    { price: 10, x: 0, y: 0, z: 0 },
                    { price: 10, x: 100, y: 0, z: 0 },
                    { price: 10, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }],
            ['iron block', {
                name: 'Iron Block',
                buyPrices: [
                    { price: 9, x: 0, y: 0, z: 0 },
                    { price: 9, x: 100, y: 0, z: 0 },
                    { price: 9, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }]
        ]);

        const matrix = buildExchangeMatrix(values, 'buy');
        // Diamond Block should be derived as diamond × 9 = 90
        expect(matrix.labels).toContain('Diamond Block');

        const diamondBlockIndex = matrix.labels.indexOf('Diamond Block');
        const ironBlockIndex = matrix.labels.indexOf('Iron Block');
        // 1 Diamond Block (90) = 10 Iron Blocks (9)
        expect(matrix.ratios[diamondBlockIndex]![ironBlockIndex]).toBe(10);
    });

    test('derives ingot values from block via reverse block conversions', () => {
        // Only "netherite block" has data, "netherite ingot" should be derived (block / 9)
        const values: ItemValues = new Map([
            ['netherite block', {
                name: 'Netherite Block',
                buyPrices: [
                    { price: 900, x: 0, y: 0, z: 0 },
                    { price: 900, x: 100, y: 0, z: 0 },
                    { price: 900, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }],
            ['diamond block', {
                name: 'Diamond Block',
                buyPrices: [
                    { price: 90, x: 0, y: 0, z: 0 },
                    { price: 90, x: 100, y: 0, z: 0 },
                    { price: 90, x: 200, y: 0, z: 0 }
                ],
                sellPrices: []
            }]
        ]);

        const matrix = buildExchangeMatrix(values, 'buy');
        // Netherite Ingot should be derived as netherite block / 9 = 100
        expect(matrix.labels).toContain('Netherite Ingot');

        const netheriteIngotIndex = matrix.labels.indexOf('Netherite Ingot');
        const diamondBlockIndex = matrix.labels.indexOf('Diamond Block');
        // 1 Netherite Ingot (100) = 100/90 Diamond Blocks
        expect(matrix.ratios[netheriteIngotIndex]![diamondBlockIndex]).toBeCloseTo(100 / 90);
    });
});
