/**
 * Unit tests for src/lib.ts - pure logic functions
 * Run with: npm test
 */

import { describe, test, expect, beforeAll, vi } from 'vitest';
import {
    matchesQuery,
    enchantsMatch,
    formatName,
    applyMapping,
    getRegex,
    parseShulkerContents,
    highlight,
    escapeHtml,
    parseLocation,
    processTrade,
    filterTrade,
    sortResults,
    calculateItemValues,
    countIndependentShops,
    hasEnoughIndependentData,
    getTrustedItemValue,
    buildRatioGraph,
    getRatio,
    loadFixedRatios,
    loadBaseItems,
    loadConfig,
    getConfig,
    median
} from './lib.js';
import type { Item, MappingRule, Trade, FilterResult, TradeInput, ItemValues, AppConfig, BlockConversions, Recipe, Shop } from './types.js';

// Test fixtures
const TEST_BLOCK_CONVERSIONS: BlockConversions = {
    'emerald block': { base: 'emerald', multiplier: 9 },
    'diamond block': { base: 'diamond', multiplier: 9 },
    'gold block': { base: 'gold ingot', multiplier: 9 },
    'iron block': { base: 'iron ingot', multiplier: 9 },
    'netherite block': { base: 'netherite ingot', multiplier: 9 },
    'coal block': { base: 'coal', multiplier: 9 },
    'lapis block': { base: 'lapis lazuli', multiplier: 9 },
    'redstone block': { base: 'redstone', multiplier: 9 },
    'copper block': { base: 'copper ingot', multiplier: 9 }
};

const TEST_CORE_BLOCKS = [
    'Netherite Block',
    'Diamond Block',
    'Emerald Block',
    'Gold Block',
    'Iron Block'
];

const TEST_CONFIG: AppConfig = {
    dataUrl: 'https://test.example.com/data.json',
    dynmap: {
        baseUrl: 'https://test.example.com/maps',
        tileSize: 128,
        defaultZoom: 4,
        maxZoomLevel: 7,
        playerRefreshMs: 1000
    },
    analysis: {
        shopClusterDistance: 16,
        maxTransitiveIterations: 10,
        minIndependentShops: 3
    }
};

// Mock fetch globally for all tests
beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
        if (url === 'block_conversions.json') {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(TEST_BLOCK_CONVERSIONS)
            });
        }
        if (url === 'core_currencies.json') {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(TEST_CORE_BLOCKS)
            });
        }
        if (url === 'config.json') {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(TEST_CONFIG)
            });
        }
        return Promise.resolve({ ok: false });
    }));
});

// Load the data before tests run
beforeAll(async () => {
    await loadFixedRatios();
    await loadBaseItems();
    await loadConfig();
});

describe('matchesQuery', () => {
    test('exact match', () => {
        expect(matchesQuery('diamond', 'diamond')).toBe(true);
    });

    test('partial match', () => {
        expect(matchesQuery('diamond block', 'diamond')).toBe(true);
    });

    test('no-space query matches spaced text', () => {
        expect(matchesQuery('vote diamond', 'votediamond')).toBe(true);
    });

    test('words in any order', () => {
        expect(matchesQuery('vote diamond', 'diamond vote')).toBe(true);
    });

    test('no match returns false', () => {
        expect(matchesQuery('diamond', 'emerald')).toBe(false);
    });

    test('underscore in query matches space in text', () => {
        expect(matchesQuery('cooked beef', 'cooked_beef')).toBe(true);
    });

    test('underscore in text matches space in query', () => {
        expect(matchesQuery('cooked_beef', 'cooked beef')).toBe(true);
    });

    test('no separator matches text with space', () => {
        expect(matchesQuery('cooked beef', 'cookedbeef')).toBe(true);
    });
});

describe('enchantsMatch', () => {
    test('exact enchant match', () => {
        expect(enchantsMatch({ 'minecraft:efficiency': 1 }, { 'minecraft:efficiency': 1 })).toBe(true);
    });

    test('enchant level mismatch', () => {
        expect(enchantsMatch({ 'minecraft:efficiency': 2 }, { 'minecraft:efficiency': 1 })).toBe(false);
    });

    test('undefined item enchants', () => {
        expect(enchantsMatch(undefined, { 'minecraft:efficiency': 1 })).toBe(false);
    });

    test('undefined rule enchants', () => {
        expect(enchantsMatch({ 'minecraft:efficiency': 1 }, undefined)).toBe(false);
    });

    test('multiple enchants all match', () => {
        const item = { 'minecraft:efficiency': 1, 'minecraft:mending': 1 };
        const rule = { 'minecraft:efficiency': 1, 'minecraft:mending': 1 };
        expect(enchantsMatch(item, rule)).toBe(true);
    });

    test('multiple enchants one mismatch', () => {
        const item = { 'minecraft:efficiency': 1, 'minecraft:mending': 1 };
        const rule = { 'minecraft:efficiency': 1, 'minecraft:mending': 2 };
        expect(enchantsMatch(item, rule)).toBe(false);
    });

    test('item has extra enchants beyond rule', () => {
        const item = { 'minecraft:efficiency': 1, 'minecraft:mending': 1, 'minecraft:unbreaking': 3 };
        const rule = { 'minecraft:efficiency': 1, 'minecraft:mending': 1 };
        expect(enchantsMatch(item, rule)).toBe(true);
    });

    test('item missing enchant from rule', () => {
        const item = { 'minecraft:efficiency': 1 };
        const rule = { 'minecraft:efficiency': 1, 'minecraft:mending': 1 };
        expect(enchantsMatch(item, rule)).toBe(false);
    });
});

describe('formatName', () => {
    test('uses item name if present', () => {
        expect(formatName({ type: 'DIAMOND', name: 'Vote Diamond', amount: 1 })).toBe('Vote diamond');
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

describe('applyMapping', () => {
    test('maps vote diamond correctly', () => {
        const rules: MappingRule[] = [{ item: 'DIAMOND', originalName: '50 Votes Certificate', enchant: { 'minecraft:efficiency': 1 }, customName: 'VOTE_DIAMOND' }];
        const item: Item = { type: 'DIAMOND', name: '50 Votes Certificate', amount: 1, enchant: { 'minecraft:efficiency': 1 } };
        applyMapping(item, rules);
        expect(item.type).toBe('VOTE_DIAMOND');
        expect(item.name).toBe('');
    });

    test('does not map without matching enchant', () => {
        const rules: MappingRule[] = [{ item: 'DIAMOND', originalName: '50 Votes Certificate', enchant: { 'minecraft:efficiency': 1 }, customName: 'VOTE_DIAMOND' }];
        const item: Item = { type: 'DIAMOND', name: '50 Votes Certificate', amount: 1, enchant: {} };
        applyMapping(item, rules);
        expect(item.type).toBe('DIAMOND');
    });

    test('does not map without matching name', () => {
        const rules: MappingRule[] = [{ item: 'DIAMOND', originalName: '50 Votes Certificate', enchant: { 'minecraft:efficiency': 1 }, customName: 'VOTE_DIAMOND' }];
        const item: Item = { type: 'DIAMOND', name: 'Other Name', amount: 1, enchant: { 'minecraft:efficiency': 1 } };
        applyMapping(item, rules);
        expect(item.type).toBe('DIAMOND');
    });

    test('handles undefined item', () => {
        expect(() => applyMapping(undefined, [])).not.toThrow();
    });

    test('handles minecraft: prefix in type', () => {
        const rules: MappingRule[] = [{ item: 'DIAMOND', originalName: 'Test', customName: 'TEST_ITEM' }];
        const item: Item = { type: 'minecraft:diamond', name: 'Test', amount: 1, enchant: {} };
        applyMapping(item, rules);
        expect(item.type).toBe('TEST_ITEM');
    });
});

describe('getRegex', () => {
    test('basic pattern', () => {
        const regex = getRegex('diamond');
        expect(regex.test('Diamond')).toBe(true);
        expect(regex.test('emerald')).toBe(false);
    });

    test('wildcard pattern', () => {
        const regex = getRegex('dia*');
        expect(regex.test('diamond')).toBe(true);
        expect(regex.test('diamond block')).toBe(true);
    });

    test('matches text with space when query has no space', () => {
        const regex = getRegex('cookedbeef');
        expect(regex.test('Cooked beef')).toBe(true);
    });

    test('matches text with underscore when query has no separator', () => {
        const regex = getRegex('cookedbeef');
        expect(regex.test('cooked_beef')).toBe(true);
    });

    test('wildcard does not break flexible matching', () => {
        const regex = getRegex('cooked*');
        expect(regex.test('Cooked beef')).toBe(true);
        expect(regex.test('Cooked cod')).toBe(true);
    });

    test('handles special chars in query gracefully', () => {
        const regex = getRegex('test');
        expect(() => regex.test('test')).not.toThrow();
    });
});

describe('parseShulkerContents', () => {
    test('parses single item type', () => {
        const lore = ['- 64x GUNPOWDER', '- 64x GUNPOWDER', '- 64x GUNPOWDER'];
        const result = parseShulkerContents(lore);
        expect(result.defaultName).toBe('Gunpowder');
        expect(result.defaultTotal).toBe(192);
    });

    test('parses mixed items and returns most common', () => {
        const lore = ['- 64x COOKED_COD', '- 10x COOKED_BEEF'];
        const result = parseShulkerContents(lore);
        expect(result.defaultName).toBe('Cooked cod');
        expect(result.defaultTotal).toBe(64);
    });

    test('includes minority items for search', () => {
        const lore = ['- 64x COOKED_COD', '- 10x COOKED_BEEF'];
        const result = parseShulkerContents(lore);
        const beef = result.items.find(i => i.key === 'cooked_beef');
        expect(beef?.name).toBe('Cooked beef');
        expect(beef?.total).toBe(10);
    });

    test('handles empty lore', () => {
        const result = parseShulkerContents([]);
        expect(result.defaultName).toBe('Shulker box');
        expect(result.items.length).toBe(0);
    });

    test('sums up multiple stacks', () => {
        const lore = ['- 64x DIAMOND', '- 64x DIAMOND', '- 32x DIAMOND'];
        const result = parseShulkerContents(lore);
        expect(result.defaultTotal).toBe(160);
    });
});

describe('highlight', () => {
    test('highlights matching text', () => {
        const regex = /diamond/i;
        expect(highlight('Diamond block', regex)).toBe('<mark>Diamond</mark> block');
    });

    test('escapes HTML in text', () => {
        const regex = /test/i;
        expect(highlight('<script>test</script>', regex)).toBe('&lt;script&gt;<mark>test</mark>&lt;/script&gt;');
    });
});

describe('escapeHtml', () => {
    test('escapes angle brackets', () => {
        expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    test('escapes ampersand', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    test('escapes quotes', () => {
        expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    test('escapes single quotes', () => {
        expect(escapeHtml("it's")).toBe('it&#39;s');
    });
});

describe('parseLocation', () => {
    test('parses comma-separated coordinates', () => {
        const result = parseLocation('100, 64, -200');
        expect(result.x).toBe(100);
        expect(result.y).toBe(64);
        expect(result.z).toBe(-200);
    });

    test('handles floats', () => {
        const result = parseLocation('100.5, 64.2, -200.8');
        expect(result.x).toBeCloseTo(100.5);
        expect(result.y).toBeCloseTo(64.2);
        expect(result.z).toBeCloseTo(-200.8);
    });

    test('handles missing values', () => {
        const result = parseLocation('100');
        expect(result.x).toBe(100);
        expect(result.y).toBe(0);
        expect(result.z).toBe(0);
    });
});

describe('config loading', () => {
    test('getConfig returns config', () => {
        const config = getConfig();
        expect(config.dynmap.baseUrl).toBe('https://test.example.com/maps');
    });

    test('config has analysis settings', () => {
        const config = getConfig();
        expect(config.analysis.shopClusterDistance).toBe(16);
        expect(config.analysis.maxTransitiveIterations).toBe(10);
        expect(config.analysis.minIndependentShops).toBe(3);
    });
});

describe('sortResults', () => {
    const createTrade = (resultAmount: number, costAmount: number, resultName: string, stock: number, world = 'overworld'): Trade => ({
        x: 0, y: 0, z: 0, world,
        item1: { type: 'EMERALD', name: '', amount: costAmount },
        item2: undefined,
        resultItem: { type: 'ITEM', name: resultName, amount: resultAmount },
        stock,
        displayStock: stock * resultAmount,
        resultText: resultName.toLowerCase(),
        costText: 'emerald',
        loreText: '',
        shulkerItems: null,
        resultName,
        resultAmount,
        costName: 'Emerald'
    });

    test('sorts by result-amt descending', () => {
        const results: FilterResult[] = [
            { trade: createTrade(10, 1, 'A', 1), matchResult: true, matchCost: false, displayName: 'A', displayAmount: 10 },
            { trade: createTrade(50, 1, 'B', 1), matchResult: true, matchCost: false, displayName: 'B', displayAmount: 50 },
            { trade: createTrade(25, 1, 'C', 1), matchResult: true, matchCost: false, displayName: 'C', displayAmount: 25 }
        ];
        sortResults(results, 'result-amt', 'desc');
        expect(results[0]!.trade.resultName).toBe('B');
        expect(results[1]!.trade.resultName).toBe('C');
        expect(results[2]!.trade.resultName).toBe('A');
    });

    test('sorts by result-name ascending', () => {
        const results: FilterResult[] = [
            { trade: createTrade(1, 1, 'Zebra', 1), matchResult: true, matchCost: false, displayName: 'Zebra', displayAmount: 1 },
            { trade: createTrade(1, 1, 'Apple', 1), matchResult: true, matchCost: false, displayName: 'Apple', displayAmount: 1 },
            { trade: createTrade(1, 1, 'Mango', 1), matchResult: true, matchCost: false, displayName: 'Mango', displayAmount: 1 }
        ];
        sortResults(results, 'result-name', 'asc');
        expect(results[0]!.trade.resultName).toBe('Apple');
        expect(results[1]!.trade.resultName).toBe('Mango');
        expect(results[2]!.trade.resultName).toBe('Zebra');
    });

    test('sorts by world ascending', () => {
        const results: FilterResult[] = [
            { trade: createTrade(1, 1, 'A', 1, 'the_nether'), matchResult: true, matchCost: false, displayName: 'A', displayAmount: 1 },
            { trade: createTrade(1, 1, 'B', 1, 'overworld'), matchResult: true, matchCost: false, displayName: 'B', displayAmount: 1 },
            { trade: createTrade(1, 1, 'C', 1, 'the_end'), matchResult: true, matchCost: false, displayName: 'C', displayAmount: 1 }
        ];
        sortResults(results, 'world', 'asc');
        expect(results[0]!.trade.world).toBe('overworld');
        expect(results[1]!.trade.world).toBe('the_end');
        expect(results[2]!.trade.world).toBe('the_nether');
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
        const values: ItemValues = new Map();
        values.set('diamond', {
            name: 'Diamond',
            buyPrices: [
                { price: 10, x: 0, y: 0, z: 0 },
                { price: 12, x: 100, y: 0, z: 0 },
                { price: 11, x: 200, y: 0, z: 0 }
            ],
            sellPrices: []
        });
        expect(getTrustedItemValue('diamond', values)).toBe(11);
    });
});

describe('calculateItemValues', () => {
    test('calculates buy prices from emerald trades', () => {
        const trades: TradeInput[] = [
            { costName: 'Emerald', costAmount: 10, resultName: 'Diamond', resultAmount: 1, x: 0, y: 0, z: 0 }
        ];
        const values = calculateItemValues(trades, 'emerald');
        const diamond = values.get('diamond');
        expect(diamond).toBeDefined();
        expect(diamond!.buyPrices[0]!.price).toBe(10);
    });

    test('calculates sell prices', () => {
        const trades: TradeInput[] = [
            { costName: 'Iron ingot', costAmount: 10, resultName: 'Emerald', resultAmount: 1, x: 0, y: 0, z: 0 }
        ];
        const values = calculateItemValues(trades, 'emerald');
        const iron = values.get('iron ingot');
        expect(iron).toBeDefined();
        expect(iron!.sellPrices[0]!.price).toBe(0.1);
    });

    test('handles emerald block as 9 emeralds', () => {
        const trades: TradeInput[] = [
            { costName: 'Emerald block', costAmount: 1, resultName: 'Diamond', resultAmount: 9, x: 0, y: 0, z: 0 }
        ];
        const values = calculateItemValues(trades, 'emerald');
        const diamond = values.get('diamond');
        expect(diamond!.buyPrices[0]!.price).toBe(1); // 9 emeralds / 9 diamonds = 1
    });
});

describe('buildRatioGraph and getRatio', () => {
    test('builds ratio graph from item values', () => {
        const values: ItemValues = new Map();
        values.set('diamond', {
            name: 'Diamond',
            buyPrices: [
                { price: 10, x: 0, y: 0, z: 0 },
                { price: 10, x: 100, y: 0, z: 0 },
                { price: 10, x: 200, y: 0, z: 0 }
            ],
            sellPrices: []
        });
        values.set('gold ingot', {
            name: 'Gold Ingot',
            buyPrices: [
                { price: 2, x: 0, y: 0, z: 0 },
                { price: 2, x: 100, y: 0, z: 0 },
                { price: 2, x: 200, y: 0, z: 0 }
            ],
            sellPrices: []
        });

        const graph = buildRatioGraph(values);

        // Diamond block = 9 diamonds = 90 emeralds
        // Gold block = 9 gold ingots = 18 emeralds
        const ratio = getRatio(graph, 'Diamond Block', 'Gold Block');
        expect(ratio).toBeCloseTo(5); // 90/18 = 5
    });

    test('returns null for unknown ratio', () => {
        const values: ItemValues = new Map();
        const graph = buildRatioGraph(values);
        expect(getRatio(graph, 'Unknown', 'Item')).toBeNull();
    });
});

describe('getTrustedItemValue - advanced cases', () => {
    test('uses average of buy and sell when both available', () => {
        const values: ItemValues = new Map();
        values.set('diamond', {
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
        });
        expect(getTrustedItemValue('diamond', values)).toBe(9); // (10 + 8) / 2
    });

    test('uses sell price when buy unavailable', () => {
        const values: ItemValues = new Map();
        values.set('coal', {
            name: 'Coal',
            buyPrices: [],
            sellPrices: [
                { price: 0.5, x: 0, y: 0, z: 0 },
                { price: 0.5, x: 100, y: 0, z: 0 },
                { price: 0.5, x: 200, y: 0, z: 0 }
            ]
        });
        expect(getTrustedItemValue('coal', values)).toBe(0.5);
    });

    test('returns null for unknown item', () => {
        const values: ItemValues = new Map();
        expect(getTrustedItemValue('unknown item', values)).toBeNull();
    });

    test('falls back to block conversion for core block ingot', () => {
        const values: ItemValues = new Map();
        // No direct diamond value, but has diamond block value
        values.set('diamond block', {
            name: 'Diamond Block',
            buyPrices: [
                { price: 90, x: 0, y: 0, z: 0 },
                { price: 90, x: 100, y: 0, z: 0 },
                { price: 90, x: 200, y: 0, z: 0 }
            ],
            sellPrices: []
        });
        // Diamond should get value from diamond block / 9
        expect(getTrustedItemValue('diamond', values)).toBe(10);
    });

    test('core block requires min independent shops', () => {
        const values: ItemValues = new Map();
        // Only 2 nearby shops for a core block (diamond block)
        values.set('diamond block', {
            name: 'Diamond Block',
            buyPrices: [
                { price: 90, x: 0, y: 0, z: 0 },
                { price: 90, x: 5, y: 0, z: 0 } // Too close to first
            ],
            sellPrices: []
        });
        // Should not trust with only 2 clustered shops
        expect(getTrustedItemValue('diamond block', values, { minShops: 3 })).toBeNull();
    });
});

describe('median', () => {
    test('returns null for empty array', () => {
        expect(median([])).toBeNull();
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

describe('filterTrade', () => {
    const trade = {
        stock: 10,
        resultText: 'diamond',
        costText: 'emerald',
        resultName: 'Diamond',
        resultAmount: 1,
        shulkerItems: null
    } as unknown as Trade;

    test('returns null when out of stock', () => {
        const result = filterTrade({ ...trade, stock: 0 }, 'diamond', '');
        expect(result).toBeNull();
    });

    test('matches by result text', () => {
        const result = filterTrade(trade, 'diamond', '');
        expect(result).not.toBeNull();
        expect(result?.matchResult).toBe(true);
    });

    test('matches by cost text', () => {
        const result = filterTrade(trade, '', 'emerald');
        expect(result).not.toBeNull();
        expect(result?.matchCost).toBe(true);
    });

    test('returns null for no match', () => {
        const result = filterTrade(trade, 'iron', '');
        expect(result).toBeNull();
    });

    test('matches shulker contents', () => {
        const shulkerTrade = {
            ...trade,
            resultText: 'shulker box',
            shulkerItems: [{ key: 'cooked_beef', name: 'Cooked beef', total: 64 }]
        } as unknown as Trade;
        const result = filterTrade(shulkerTrade, 'cooked_beef', '');
        expect(result).not.toBeNull();
        expect(result?.displayName).toBe('Cooked beef');
        expect(result?.displayAmount).toBe(64);
    });

    test('returns match when no queries provided', () => {
        const result = filterTrade(trade, '', '');
        expect(result).not.toBeNull();
        expect(result?.matchResult).toBeFalsy();
        expect(result?.matchCost).toBeFalsy();
    });
});

describe('processTrade', () => {
    test('processes basic trade', () => {
        const recipe: Recipe = {
            resultItem: { type: 'DIAMOND', name: '', amount: 1 },
            item1: { type: 'EMERALD', name: '', amount: 10 },
            item2: undefined,
            stock: 5
        };
        const shop: Shop = { location: '100, 64, -200', world: 'minecraft:overworld', recipes: [] };
        const trade = processTrade(recipe, shop, []);
        expect(trade.resultName).toBe('Diamond');
        expect(trade.costName).toBe('Emerald');
        expect(trade.displayStock).toBe(5);
        expect(trade.x).toBe(100);
    });

    test('applies mapping rules', () => {
        const recipe: Recipe = {
            resultItem: { type: 'DIAMOND', name: 'Vote Diamond', amount: 1 },
            item1: { type: 'EMERALD', name: '', amount: 5 },
            item2: undefined,
            stock: 1
        };
        const shop: Shop = { location: '0, 0, 0', world: 'minecraft:overworld', recipes: [] };
        const rules: MappingRule[] = [
            { item: 'DIAMOND', originalName: 'Vote Diamond', customName: 'VOTE_DIAMOND' }
        ];
        const trade = processTrade(recipe, shop, rules);
        expect(trade.resultItem.type).toBe('VOTE_DIAMOND');
    });

    test('processes shulker trade', () => {
        const recipe: Recipe = {
            resultItem: {
                type: 'WHITE_SHULKER_BOX',
                name: '',
                amount: 1,
                lore: ['- 64x GUNPOWDER', '- 64x GUNPOWDER']
            },
            item1: { type: 'EMERALD_BLOCK', name: '', amount: 1 },
            item2: undefined,
            stock: 3
        };
        const shop: Shop = { location: '0, 0, 0', world: 'minecraft:overworld', recipes: [] };
        const trade = processTrade(recipe, shop, []);
        expect(trade.resultName).toBe('Gunpowder');
        expect(trade.resultAmount).toBe(128);
        expect(trade.displayStock).toBe(384);
    });
});
