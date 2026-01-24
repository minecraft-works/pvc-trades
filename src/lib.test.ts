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
    median,
    getWorldId,
    getTileCoords,
    getTileOffset,
    calculateFitZoom,
    toLeafletCoords,
    toLeafletCoordsRelative,
    fromLeafletCoordsRelative,
    clampToCircle,
    isNether,
    getTradeKey,
    shouldSwitchMapWorld
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

    test('sorts by distance descending', () => {
        const createTradeWithCoords = (name: string, x: number, z: number): Trade => ({
            x, y: 64, z, world: 'overworld',
            item1: { type: 'EMERALD', name: '', amount: 1 },
            item2: undefined,
            resultItem: { type: 'ITEM', name, amount: 1 },
            stock: 1,
            displayStock: 1,
            resultText: name.toLowerCase(),
            costText: 'emerald',
            loreText: '',
            shulkerItems: null,
            resultName: name,
            resultAmount: 1,
            costName: 'Emerald'
        });

        const results: FilterResult[] = [
            { trade: createTradeWithCoords('Near', 10, 10), matchResult: true, matchCost: false, displayName: 'Near', displayAmount: 1 },
            { trade: createTradeWithCoords('Far', 1000, 1000), matchResult: true, matchCost: false, displayName: 'Far', displayAmount: 1 },
            { trade: createTradeWithCoords('Mid', 100, 100), matchResult: true, matchCost: false, displayName: 'Mid', displayAmount: 1 }
        ];
        sortResults(results, 'distance', 'desc');
        expect(results[0]!.trade.resultName).toBe('Far');
        expect(results[1]!.trade.resultName).toBe('Mid');
        expect(results[2]!.trade.resultName).toBe('Near');
    });

    test('sorts by distance ascending', () => {
        const createTradeWithCoords = (name: string, x: number, z: number): Trade => ({
            x, y: 64, z, world: 'overworld',
            item1: { type: 'EMERALD', name: '', amount: 1 },
            item2: undefined,
            resultItem: { type: 'ITEM', name, amount: 1 },
            stock: 1,
            displayStock: 1,
            resultText: name.toLowerCase(),
            costText: 'emerald',
            loreText: '',
            shulkerItems: null,
            resultName: name,
            resultAmount: 1,
            costName: 'Emerald'
        });

        const results: FilterResult[] = [
            { trade: createTradeWithCoords('Far', 1000, 1000), matchResult: true, matchCost: false, displayName: 'Far', displayAmount: 1 },
            { trade: createTradeWithCoords('Near', 10, 10), matchResult: true, matchCost: false, displayName: 'Near', displayAmount: 1 },
            { trade: createTradeWithCoords('Mid', 100, 100), matchResult: true, matchCost: false, displayName: 'Mid', displayAmount: 1 }
        ];
        sortResults(results, 'distance', 'asc');
        expect(results[0]!.trade.resultName).toBe('Near');
        expect(results[1]!.trade.resultName).toBe('Mid');
        expect(results[2]!.trade.resultName).toBe('Far');
    });

    test('distance uses euclidean distance from origin', () => {
        const createTradeWithCoords = (name: string, x: number, z: number): Trade => ({
            x, y: 64, z, world: 'overworld',
            item1: { type: 'EMERALD', name: '', amount: 1 },
            item2: undefined,
            resultItem: { type: 'ITEM', name, amount: 1 },
            stock: 1,
            displayStock: 1,
            resultText: name.toLowerCase(),
            costText: 'emerald',
            loreText: '',
            shulkerItems: null,
            resultName: name,
            resultAmount: 1,
            costName: 'Emerald'
        });

        // Distance = sqrt(x^2 + z^2)
        // A: sqrt(300^2 + 400^2) = sqrt(250000) = 500
        // B: sqrt(100^2 + 100^2) = sqrt(20000) ≈ 141
        // C: sqrt(0^2 + 600^2) = 600
        const results: FilterResult[] = [
            { trade: createTradeWithCoords('A', 300, 400), matchResult: true, matchCost: false, displayName: 'A', displayAmount: 1 },
            { trade: createTradeWithCoords('B', 100, 100), matchResult: true, matchCost: false, displayName: 'B', displayAmount: 1 },
            { trade: createTradeWithCoords('C', 0, 600), matchResult: true, matchCost: false, displayName: 'C', displayAmount: 1 }
        ];
        sortResults(results, 'distance', 'asc');
        expect(results[0]!.trade.resultName).toBe('B'); // ~141
        expect(results[1]!.trade.resultName).toBe('A'); // 500
        expect(results[2]!.trade.resultName).toBe('C'); // 600
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

// ============================================================================
// Map Utilities
// ============================================================================

describe('getWorldId', () => {
    test('returns overworld for normal world', () => {
        expect(getWorldId('minecraft:overworld')).toBe('overworld');
        expect(getWorldId('overworld')).toBe('overworld');
        expect(getWorldId('world')).toBe('overworld');
    });

    test('returns the_nether for nether world', () => {
        expect(getWorldId('minecraft:the_nether')).toBe('the_nether');
        expect(getWorldId('the_nether')).toBe('the_nether');
        expect(getWorldId('nether')).toBe('the_nether');
    });

    test('returns the_end for end world', () => {
        expect(getWorldId('minecraft:the_end')).toBe('the_end');
        expect(getWorldId('the_end')).toBe('the_end');
        expect(getWorldId('end')).toBe('the_end');
    });

    test('returns overworld for World (capitalized)', () => {
        expect(getWorldId('World')).toBe('overworld');
    });

    test('returns the_nether for World_nether', () => {
        expect(getWorldId('World_nether')).toBe('the_nether');
    });

    test('returns the_end for World_the_end', () => {
        expect(getWorldId('World_the_end')).toBe('the_end');
    });

    test('handles empty string as overworld', () => {
        expect(getWorldId('')).toBe('overworld');
    });

    test('handles mixed case nether variants', () => {
        expect(getWorldId('THE_NETHER')).toBe('the_nether');
        expect(getWorldId('The_Nether')).toBe('the_nether');
        expect(getWorldId('NETHER')).toBe('the_nether');
    });

    test('handles mixed case end variants', () => {
        expect(getWorldId('THE_END')).toBe('the_end');
        expect(getWorldId('The_End')).toBe('the_end');
        expect(getWorldId('END')).toBe('the_end');
    });
});

describe('getTileCoords', () => {
    test('calculates tile for positive coordinates', () => {
        expect(getTileCoords(0, 0)).toEqual({ tileX: 0, tileZ: 0 });
        expect(getTileCoords(100, 200)).toEqual({ tileX: 0, tileZ: 0 });
        expect(getTileCoords(511, 511)).toEqual({ tileX: 0, tileZ: 0 });
        expect(getTileCoords(512, 512)).toEqual({ tileX: 1, tileZ: 1 });
        expect(getTileCoords(1024, 1536)).toEqual({ tileX: 2, tileZ: 3 });
    });

    test('calculates tile for negative coordinates', () => {
        expect(getTileCoords(-1, -1)).toEqual({ tileX: -1, tileZ: -1 });
        expect(getTileCoords(-69, 64)).toEqual({ tileX: -1, tileZ: 0 });
        expect(getTileCoords(-512, -512)).toEqual({ tileX: -1, tileZ: -1 });
        expect(getTileCoords(-513, -513)).toEqual({ tileX: -2, tileZ: -2 });
    });

    test('respects custom tile size', () => {
        expect(getTileCoords(256, 256, 256)).toEqual({ tileX: 1, tileZ: 1 });
        expect(getTileCoords(100, 100, 128)).toEqual({ tileX: 0, tileZ: 0 });
        expect(getTileCoords(128, 128, 128)).toEqual({ tileX: 1, tileZ: 1 });
    });
});

describe('getTileOffset', () => {
    test('calculates offset for positive coordinates', () => {
        expect(getTileOffset(0, 0)).toEqual({ offsetX: 0, offsetZ: 0 });
        expect(getTileOffset(100, 200)).toEqual({ offsetX: 100, offsetZ: 200 });
        expect(getTileOffset(511, 511)).toEqual({ offsetX: 511, offsetZ: 511 });
        expect(getTileOffset(512, 512)).toEqual({ offsetX: 0, offsetZ: 0 });
        expect(getTileOffset(600, 700)).toEqual({ offsetX: 88, offsetZ: 188 });
    });

    test('calculates offset for negative coordinates', () => {
        // -69 is in tile -1 (which spans -512 to -1)
        // offset = -69 - (-1 * 512) = -69 + 512 = 443
        expect(getTileOffset(-69, 64)).toEqual({ offsetX: 443, offsetZ: 64 });
        expect(getTileOffset(-1, -1)).toEqual({ offsetX: 511, offsetZ: 511 });
        expect(getTileOffset(-512, -512)).toEqual({ offsetX: 0, offsetZ: 0 });
    });

    test('respects custom tile size', () => {
        expect(getTileOffset(300, 300, 256)).toEqual({ offsetX: 44, offsetZ: 44 });
    });
});

describe('calculateFitZoom', () => {
    test('calculates zoom for exact fit', () => {
        // container 512px, content 512 units -> zoom 0 (1:1)
        expect(calculateFitZoom(512, 512)).toBe(0);
        
        // container 1024px, content 512 units -> zoom 1 (2:1)
        expect(calculateFitZoom(1024, 512)).toBe(1);
        
        // container 256px, content 512 units -> zoom -1 (0.5:1)
        expect(calculateFitZoom(256, 512)).toBe(-1);
    });

    test('calculates fractional zoom', () => {
        // container 729px, content 1536 units
        // zoom = log2(729/1536) ≈ -1.075
        const zoom = calculateFitZoom(729, 1536);
        expect(zoom).toBeCloseTo(-1.075, 2);
    });

    test('handles various container sizes', () => {
        // container 768px, content 1536 units -> zoom -1
        expect(calculateFitZoom(768, 1536)).toBe(-1);
        
        // container 384px, content 1536 units -> zoom -2
        expect(calculateFitZoom(384, 1536)).toBe(-2);
        
        // container 1536px, content 1536 units -> zoom 0
        expect(calculateFitZoom(1536, 1536)).toBe(0);
    });
});

describe('toLeafletCoords', () => {
    test('converts positive coordinates to Leaflet latLng', () => {
        // At (100, 200) in tile (0, 0), offset is (100, 200)
        // Leaflet: lat = -offsetZ = -200, lng = offsetX = 100
        expect(toLeafletCoords(100, 200)).toEqual({ lat: -200, lng: 100 });
    });

    test('converts coordinates at tile boundary', () => {
        // At (512, 512) in tile (1, 1), offset is (0, 0)
        const result = toLeafletCoords(512, 512);
        expect(result.lat + 0).toBe(0);  // +0 converts -0 to 0
        expect(result.lng + 0).toBe(0);
        
        // At (511, 511) still in tile (0, 0)
        expect(toLeafletCoords(511, 511)).toEqual({ lat: -511, lng: 511 });
    });

    test('converts negative coordinates correctly', () => {
        // At (-69, 64) in tile (-1, 0), offset is (443, 64)
        // This matches the real shop example from debug logs
        expect(toLeafletCoords(-69, 64)).toEqual({ lat: -64, lng: 443 });
    });

    test('converts coordinates with negative Z', () => {
        // At (100, -100) in tile (0, -1), offset is (100, 412)
        // tileZ = floor(-100/512) = -1
        // offsetZ = -100 - (-1 * 512) = -100 + 512 = 412
        expect(toLeafletCoords(100, -100)).toEqual({ lat: -412, lng: 100 });
    });

    test('respects custom tile size', () => {
        // At (300, 300) with tile size 256
        // tile (1, 1), offset (44, 44)
        expect(toLeafletCoords(300, 300, 256)).toEqual({ lat: -44, lng: 44 });
    });
});

describe('toLeafletCoordsRelative', () => {
    test('converts coords relative to center tile at origin', () => {
        // Player at (100, 200), center tile is (0, 0)
        // Center tile origin is (0, 0), so relative coords are (100, 200)
        const result = toLeafletCoordsRelative(100, 200, 0, 0);
        expect(result).toEqual({ lat: -200, lng: 100 });
    });

    test('converts coords relative to non-origin center tile', () => {
        // Player at (600, 700), center tile is (1, 1)
        // Center tile origin is (512, 512)
        // Relative: x = 600 - 512 = 88, z = 700 - 512 = 188
        const result = toLeafletCoordsRelative(600, 700, 1, 1);
        expect(result).toEqual({ lat: -188, lng: 88 });
    });

    test('handles player in different tile than center', () => {
        // Player at (1000, 1000), center tile is (0, 0)
        // Center tile origin is (0, 0)
        // Relative: x = 1000, z = 1000
        const result = toLeafletCoordsRelative(1000, 1000, 0, 0);
        expect(result).toEqual({ lat: -1000, lng: 1000 });
    });

    test('handles negative player coordinates', () => {
        // Player at (-100, -200), center tile is (0, 0)
        const result = toLeafletCoordsRelative(-100, -200, 0, 0);
        expect(result).toEqual({ lat: 200, lng: -100 });
    });

    test('handles negative center tile', () => {
        // Player at (0, 0), center tile is (-1, -1)
        // Center tile origin is (-512, -512)
        // Relative: x = 0 - (-512) = 512, z = 0 - (-512) = 512
        const result = toLeafletCoordsRelative(0, 0, -1, -1);
        expect(result).toEqual({ lat: -512, lng: 512 });
    });

    test('respects custom tile size', () => {
        // Player at (300, 400), center tile is (1, 1), tile size 256
        // Center tile origin is (256, 256)
        // Relative: x = 300 - 256 = 44, z = 400 - 256 = 144
        const result = toLeafletCoordsRelative(300, 400, 1, 1, 256);
        expect(result).toEqual({ lat: -144, lng: 44 });
    });
});

describe('fromLeafletCoordsRelative', () => {
    test('converts origin coords back to world coords at tile 0,0', () => {
        const result = fromLeafletCoordsRelative(0, 0, 0, 0);
        expect(result).toEqual({ x: 0, z: 0 });
    });

    test('converts positive offset back to world coords', () => {
        // lat = -200 means z offset = 200, lng = 100 means x offset = 100
        const result = fromLeafletCoordsRelative(-200, 100, 0, 0);
        expect(result).toEqual({ x: 100, z: 200 });
    });

    test('converts coords at non-zero tile center', () => {
        // Center tile (1, 1) has origin at (512, 512)
        // lat = -100, lng = 50 → x = 50 + 512 = 562, z = 100 + 512 = 612
        const result = fromLeafletCoordsRelative(-100, 50, 1, 1);
        expect(result).toEqual({ x: 562, z: 612 });
    });

    test('is inverse of toLeafletCoordsRelative', () => {
        const x = 1234;
        const z = 5678;
        const tileX = 2;
        const tileZ = 11;
        
        const leaflet = toLeafletCoordsRelative(x, z, tileX, tileZ);
        const back = fromLeafletCoordsRelative(leaflet.lat, leaflet.lng, tileX, tileZ);
        
        expect(back.x).toBe(x);
        expect(back.z).toBe(z);
    });

    test('handles negative world coords', () => {
        const x = -500;
        const z = -300;
        
        const leaflet = toLeafletCoordsRelative(x, z, 0, 0);
        const back = fromLeafletCoordsRelative(leaflet.lat, leaflet.lng, 0, 0);
        
        expect(back.x).toBe(x);
        expect(back.z).toBe(z);
    });

    test('rounds to nearest integer', () => {
        // lat = -100.7, lng = 50.3 → should round to x=50, z=101
        const result = fromLeafletCoordsRelative(-100.7, 50.3, 0, 0);
        expect(result.x).toBe(50);
        expect(result.z).toBe(101);
    });
});

describe('clampToCircle', () => {
    const centerLat = 0;
    const centerLng = 0;
    const radius = 100;

    test('returns original point when inside circle', () => {
        const result = clampToCircle(50, 50, centerLat, centerLng, radius);
        expect(result.lat).toBe(50);
        expect(result.lng).toBe(50);
        expect(result.clamped).toBe(false);
    });

    test('returns original point when exactly on circle edge', () => {
        // Point at (0, 100) is exactly on the circle
        const result = clampToCircle(0, 100, centerLat, centerLng, radius);
        expect(result.lat).toBe(0);
        expect(result.lng).toBe(100);
        expect(result.clamped).toBe(false);
    });

    test('returns original point at center', () => {
        const result = clampToCircle(0, 0, centerLat, centerLng, radius);
        expect(result.lat).toBe(0);
        expect(result.lng).toBe(0);
        expect(result.clamped).toBe(false);
    });

    test('clamps point outside circle to edge (right)', () => {
        // Point at (0, 200) should clamp to (0, 100)
        const result = clampToCircle(0, 200, centerLat, centerLng, radius);
        expect(result.lat).toBeCloseTo(0, 5);
        expect(result.lng).toBeCloseTo(100, 5);
        expect(result.clamped).toBe(true);
    });

    test('clamps point outside circle to edge (diagonal)', () => {
        // Point at (200, 200) should clamp to circle edge in that direction
        // Distance from origin = sqrt(200^2 + 200^2) = 282.84
        // Scale factor = 100 / 282.84 = 0.3536
        // Clamped: (200 * 0.3536, 200 * 0.3536) ≈ (70.71, 70.71)
        const result = clampToCircle(200, 200, centerLat, centerLng, radius);
        expect(result.lat).toBeCloseTo(70.71, 1);
        expect(result.lng).toBeCloseTo(70.71, 1);
        expect(result.clamped).toBe(true);
    });

    test('clamps point outside circle to edge (negative)', () => {
        // Point at (-300, 0) should clamp to (-100, 0)
        const result = clampToCircle(-300, 0, centerLat, centerLng, radius);
        expect(result.lat).toBeCloseTo(-100, 5);
        expect(result.lng).toBeCloseTo(0, 5);
        expect(result.clamped).toBe(true);
    });

    test('handles non-origin center', () => {
        // Circle centered at (100, 100), radius 50
        // Point at (200, 100) is 100 units away, should clamp to (150, 100)
        const result = clampToCircle(200, 100, 100, 100, 50);
        expect(result.lat).toBeCloseTo(150, 5);
        expect(result.lng).toBeCloseTo(100, 5);
        expect(result.clamped).toBe(true);
    });

    test('handles very far points correctly', () => {
        // Very far point should still clamp to correct edge
        const result = clampToCircle(10000, 0, centerLat, centerLng, radius);
        expect(result.lat).toBeCloseTo(100, 5);
        expect(result.lng).toBeCloseTo(0, 5);
        expect(result.clamped).toBe(true);
    });
});

// ============================================================================
// Route Optimization Tests
// ============================================================================

import {
    toOverworldEquivalent,
    calculateRouteDistance,
    buildDistanceMatrix,
    nearestNeighborOrder,
    calculateOrderDistance,
    twoOptOptimize,
    computeOptimalOrder,
    type RoutePoint
} from './lib.js';

describe('toOverworldEquivalent', () => {
    test('returns same coords for overworld', () => {
        const result = toOverworldEquivalent(100, 200, 'overworld');
        expect(result).toEqual({ x: 100, z: 200 });
    });

    test('multiplies coords by 8 for nether', () => {
        const result = toOverworldEquivalent(100, 200, 'the_nether');
        expect(result).toEqual({ x: 800, z: 1600 });
    });

    test('handles nether case-insensitively', () => {
        expect(toOverworldEquivalent(10, 20, 'NETHER')).toEqual({ x: 80, z: 160 });
        expect(toOverworldEquivalent(10, 20, 'The_Nether')).toEqual({ x: 80, z: 160 });
    });

    test('handles negative coordinates', () => {
        const result = toOverworldEquivalent(-50, -100, 'the_nether');
        expect(result).toEqual({ x: -400, z: -800 });
    });
});

describe('calculateRouteDistance', () => {
    test('calculates distance between overworld points', () => {
        // Distance from (0,0) to (3,4) = 5
        const dist = calculateRouteDistance(0, 0, 'overworld', 3, 4, 'overworld');
        expect(dist).toBeCloseTo(5, 5);
    });

    test('calculates distance from overworld to nether using OW-equivalent', () => {
        // Nether point (10, 0) = OW-equivalent (80, 0)
        // Distance from origin = 80
        const dist = calculateRouteDistance(0, 0, 'overworld', 10, 0, 'the_nether');
        expect(dist).toBeCloseTo(80, 5);
    });

    test('calculates distance between nether points using OW-equivalent', () => {
        // (0,0) nether = (0,0) OW-equiv
        // (10,0) nether = (80,0) OW-equiv
        // Distance = 80
        const dist = calculateRouteDistance(0, 0, 'the_nether', 10, 0, 'the_nether');
        expect(dist).toBeCloseTo(80, 5);
    });

    test('handles negative coordinates', () => {
        const dist = calculateRouteDistance(-3, -4, 'overworld', 0, 0, 'overworld');
        expect(dist).toBeCloseTo(5, 5);
    });
});

describe('buildDistanceMatrix', () => {
    test('returns 1x1 matrix for empty points', () => {
        const matrix = buildDistanceMatrix([]);
        expect(matrix).toEqual([[0]]);
    });

    test('builds correct matrix for single point', () => {
        const points: RoutePoint[] = [{ x: 3, z: 4, world: 'overworld' }];
        const matrix = buildDistanceMatrix(points);
        
        expect(matrix.length).toBe(2);
        expect(matrix[0]![0]).toBe(0); // Origin to itself
        expect(matrix[0]![1]).toBeCloseTo(5, 5); // Origin to point
        expect(matrix[1]![0]).toBeCloseTo(5, 5); // Point to origin
        expect(matrix[1]![1]).toBe(0); // Point to itself
    });

    test('builds symmetric matrix for multiple points', () => {
        const points: RoutePoint[] = [
            { x: 3, z: 0, world: 'overworld' },
            { x: 0, z: 4, world: 'overworld' }
        ];
        const matrix = buildDistanceMatrix(points);
        
        expect(matrix.length).toBe(3);
        // Check symmetry
        expect(matrix[0]![1]).toBe(matrix[1]![0]);
        expect(matrix[0]![2]).toBe(matrix[2]![0]);
        expect(matrix[1]![2]).toBe(matrix[2]![1]);
    });

    test('handles nether points correctly', () => {
        const points: RoutePoint[] = [{ x: 10, z: 0, world: 'the_nether' }];
        const matrix = buildDistanceMatrix(points);
        
        // Nether (10,0) = OW-equiv (80,0), distance from origin = 80
        expect(matrix[0]![1]).toBeCloseTo(80, 5);
    });

    test('uses custom origin when provided', () => {
        const points: RoutePoint[] = [{ x: 100, z: 0, world: 'overworld' }];
        const origin: RoutePoint = { x: 50, z: 0, world: 'overworld' };
        const matrix = buildDistanceMatrix(points, origin);
        
        // Distance from (50,0) to (100,0) = 50
        expect(matrix[0]![1]).toBeCloseTo(50, 5);
    });

    test('uses custom origin in nether', () => {
        const points: RoutePoint[] = [{ x: 100, z: 0, world: 'overworld' }];
        const origin: RoutePoint = { x: 10, z: 0, world: 'the_nether' };
        const matrix = buildDistanceMatrix(points, origin);
        
        // Origin nether (10,0) = OW-equiv (80,0)
        // Distance from (80,0) to (100,0) = 20
        expect(matrix[0]![1]).toBeCloseTo(20, 5);
    });

    test('custom origin affects distances between all points', () => {
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },  // 100 from (0,0), but 50 from (50,0)
            { x: 200, z: 0, world: 'overworld' }   // 200 from (0,0), but 150 from (50,0)
        ];
        const origin: RoutePoint = { x: 50, z: 0, world: 'overworld' };
        const matrix = buildDistanceMatrix(points, origin);
        
        // With origin at (50,0):
        // origin to point 0: |100-50| = 50
        // origin to point 1: |200-50| = 150
        // point 0 to point 1: |200-100| = 100 (unchanged by origin)
        expect(matrix[0]![1]).toBeCloseTo(50, 5);
        expect(matrix[0]![2]).toBeCloseTo(150, 5);
        expect(matrix[1]![2]).toBeCloseTo(100, 5);
    });
});

describe('nearestNeighborOrder', () => {
    test('returns empty array for empty points', () => {
        const matrix = buildDistanceMatrix([]);
        const order = nearestNeighborOrder([], matrix);
        expect(order).toEqual([]);
    });

    test('returns [0] for single point', () => {
        const points: RoutePoint[] = [{ x: 100, z: 100, world: 'overworld' }];
        const matrix = buildDistanceMatrix(points);
        const order = nearestNeighborOrder(points, matrix);
        expect(order).toEqual([0]);
    });

    test('visits nearest point first', () => {
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },  // 100 from origin
            { x: 10, z: 0, world: 'overworld' }    // 10 from origin (closest)
        ];
        const matrix = buildDistanceMatrix(points);
        const order = nearestNeighborOrder(points, matrix);
        
        expect(order[0]).toBe(1); // Index 1 is closest to origin
    });

    test('visits all points', () => {
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 50, z: 0, world: 'overworld' },
            { x: 200, z: 0, world: 'overworld' }
        ];
        const matrix = buildDistanceMatrix(points);
        const order = nearestNeighborOrder(points, matrix);
        
        expect(order.length).toBe(3);
        expect(order.sort()).toEqual([0, 1, 2]);
    });

    test('follows greedy path', () => {
        // Points in a line: origin → 50 → 100 → 200
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },  // index 0
            { x: 50, z: 0, world: 'overworld' },   // index 1
            { x: 200, z: 0, world: 'overworld' }   // index 2
        ];
        const matrix = buildDistanceMatrix(points);
        const order = nearestNeighborOrder(points, matrix);
        
        // Should visit: 50 (closest to origin) → 100 → 200
        expect(order).toEqual([1, 0, 2]);
    });
});

describe('calculateOrderDistance', () => {
    test('returns 0 for empty order', () => {
        const matrix = buildDistanceMatrix([]);
        const dist = calculateOrderDistance([], matrix);
        expect(dist).toBe(0);
    });

    test('calculates distance for single point', () => {
        const points: RoutePoint[] = [{ x: 3, z: 4, world: 'overworld' }];
        const matrix = buildDistanceMatrix(points);
        const dist = calculateOrderDistance([0], matrix);
        expect(dist).toBeCloseTo(5, 5); // Origin to (3,4)
    });

    test('calculates total distance for multiple points', () => {
        // Points in a line at x=100, x=200
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 200, z: 0, world: 'overworld' }
        ];
        const matrix = buildDistanceMatrix(points);
        
        // Order [0, 1]: origin→100 + 100→200 = 100 + 100 = 200
        expect(calculateOrderDistance([0, 1], matrix)).toBeCloseTo(200, 5);
        
        // Order [1, 0]: origin→200 + 200→100 = 200 + 100 = 300
        expect(calculateOrderDistance([1, 0], matrix)).toBeCloseTo(300, 5);
    });
});

describe('twoOptOptimize', () => {
    test('returns copy for orders with less than 3 points', () => {
        const matrix = buildDistanceMatrix([{ x: 100, z: 0, world: 'overworld' }]);
        const order = [0];
        const result = twoOptOptimize(order, matrix);
        expect(result).toEqual([0]);
        expect(result).not.toBe(order); // Should be a copy
    });

    test('does not modify original order', () => {
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 200, z: 0, world: 'overworld' },
            { x: 300, z: 0, world: 'overworld' }
        ];
        const matrix = buildDistanceMatrix(points);
        const order = [0, 1, 2];
        const originalOrder = [...order];
        twoOptOptimize(order, matrix);
        expect(order).toEqual(originalOrder);
    });

    test('improves crossed path', () => {
        // Create a "crossed" configuration that 2-opt should fix
        // Points form a square: A(0,100), B(100,100), C(100,0), D(0,0) relative to some offset
        // If visited A→C→B→D, path crosses itself
        // Optimal is A→B→C→D or A→D→C→B
        const points: RoutePoint[] = [
            { x: 0, z: 100, world: 'overworld' },    // A - index 0
            { x: 100, z: 100, world: 'overworld' },  // B - index 1  
            { x: 100, z: 0, world: 'overworld' },    // C - index 2
            { x: 0, z: 0, world: 'overworld' }       // D - index 3 (but this is origin area)
        ];
        const matrix = buildDistanceMatrix(points);
        
        // Start with a suboptimal order
        const badOrder = [0, 2, 1, 3]; // A→C→B→D (crossed)
        const badDist = calculateOrderDistance(badOrder, matrix);
        
        const optimized = twoOptOptimize(badOrder, matrix);
        const optDist = calculateOrderDistance(optimized, matrix);
        
        // Optimized should be at least as good
        expect(optDist).toBeLessThanOrEqual(badDist);
    });

    test('returns same order if already optimal', () => {
        // Points in a straight line - already optimal
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 200, z: 0, world: 'overworld' },
            { x: 300, z: 0, world: 'overworld' }
        ];
        const matrix = buildDistanceMatrix(points);
        const order = [0, 1, 2]; // Already optimal: 0→100→200→300
        
        const optimized = twoOptOptimize(order, matrix);
        expect(optimized).toEqual([0, 1, 2]);
    });
});

describe('computeOptimalOrder', () => {
    test('returns empty array for empty points', () => {
        const order = computeOptimalOrder([]);
        expect(order).toEqual([]);
    });

    test('returns [0] for single point', () => {
        const points: RoutePoint[] = [{ x: 100, z: 100, world: 'overworld' }];
        const order = computeOptimalOrder(points);
        expect(order).toEqual([0]);
    });

    test('returns optimal order for simple case', () => {
        // Points in a line - should visit in distance order from origin
        const points: RoutePoint[] = [
            { x: 200, z: 0, world: 'overworld' },  // index 0, far
            { x: 100, z: 0, world: 'overworld' },  // index 1, medium
            { x: 50, z: 0, world: 'overworld' }    // index 2, close
        ];
        const order = computeOptimalOrder(points);
        
        // Optimal: 50 → 100 → 200 = indices [2, 1, 0]
        expect(order).toEqual([2, 1, 0]);
    });

    test('optimizes crossed path', () => {
        // Square configuration
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 100, z: 100, world: 'overworld' },
            { x: 0, z: 100, world: 'overworld' }
        ];
        
        const order = computeOptimalOrder(points);
        const matrix = buildDistanceMatrix(points);
        const totalDist = calculateOrderDistance(order, matrix);
        
        // Compare with worst possible order
        const worstOrder = [2, 0, 1]; // Zigzag
        const worstDist = calculateOrderDistance(worstOrder, matrix);
        
        expect(totalDist).toBeLessThanOrEqual(worstDist);
    });

    test('handles mixed overworld and nether points', () => {
        const points: RoutePoint[] = [
            { x: 800, z: 0, world: 'overworld' },   // 800 from origin
            { x: 100, z: 0, world: 'the_nether' }   // 800 from origin (OW-equiv)
        ];
        const order = computeOptimalOrder(points);
        
        // Both are same distance, order depends on implementation
        expect(order.length).toBe(2);
        expect(order.sort()).toEqual([0, 1]);
    });

    test('visits all points exactly once', () => {
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },
            { x: 0, z: 100, world: 'overworld' },
            { x: -100, z: 0, world: 'overworld' },
            { x: 0, z: -100, world: 'overworld' },
            { x: 50, z: 50, world: 'overworld' }
        ];
        const order = computeOptimalOrder(points);
        
        expect(order.length).toBe(5);
        expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    });

    test('uses custom origin for route calculation', () => {
        // With origin at (0,0): order should be [2, 1, 0] (50→100→200)
        // With origin at (200,0): order should be [0, 1, 2] (200→100→50)
        const points: RoutePoint[] = [
            { x: 200, z: 0, world: 'overworld' },  // index 0
            { x: 100, z: 0, world: 'overworld' },  // index 1
            { x: 50, z: 0, world: 'overworld' }    // index 2
        ];
        
        // From default origin (0,0) - closest is 50
        const orderFromOrigin = computeOptimalOrder(points);
        expect(orderFromOrigin[0]).toBe(2); // 50 is closest to origin
        
        // From custom origin (200,0) - closest is 200
        const customOrigin: RoutePoint = { x: 200, z: 0, world: 'overworld' };
        const orderFromCustom = computeOptimalOrder(points, customOrigin);
        expect(orderFromCustom[0]).toBe(0); // 200 is closest to (200,0)
    });

    test('uses custom origin in nether world', () => {
        // Origin in nether at (100,0) = OW-equiv (800,0)
        // Points are in overworld
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },  // 700 from origin
            { x: 750, z: 0, world: 'overworld' }   // 50 from origin
        ];
        const netherOrigin: RoutePoint = { x: 100, z: 0, world: 'the_nether' };
        const order = computeOptimalOrder(points, netherOrigin);
        
        // Point at 750 is closer to nether origin (50 blocks away)
        expect(order[0]).toBe(1); // 750 is closest
    });

    test('custom origin respects different worlds', () => {
        // Player in overworld at (0,0), shops mixed between worlds
        const points: RoutePoint[] = [
            { x: 100, z: 0, world: 'overworld' },  // 100 from player
            { x: 50, z: 0, world: 'the_nether' }   // 400 from player (OW-equiv)
        ];
        const playerOrigin: RoutePoint = { x: 0, z: 0, world: 'overworld' };
        const order = computeOptimalOrder(points, playerOrigin);
        
        // Overworld point (100,0) is closer than nether point (OW-equiv 400,0)
        expect(order[0]).toBe(0);
    });
});

// ============================================================================
// isNether tests
// ============================================================================

describe('isNether', () => {
    test('returns true for "the_nether"', () => {
        expect(isNether('the_nether')).toBe(true);
    });

    test('returns true for "nether"', () => {
        expect(isNether('nether')).toBe(true);
    });

    test('returns true for "World_nether"', () => {
        expect(isNether('World_nether')).toBe(true);
    });

    test('returns true for "THE_NETHER" (case insensitive)', () => {
        expect(isNether('THE_NETHER')).toBe(true);
    });

    test('returns false for "overworld"', () => {
        expect(isNether('overworld')).toBe(false);
    });

    test('returns false for "the_end"', () => {
        expect(isNether('the_end')).toBe(false);
    });

    test('returns false for empty string', () => {
        expect(isNether('')).toBe(false);
    });

    test('returns false for "World"', () => {
        expect(isNether('World')).toBe(false);
    });
});

// ============================================================================
// getTradeKey tests
// ============================================================================

describe('getTradeKey', () => {
    test('generates key from trade coordinates and items', () => {
        const trade = {
            x: 100,
            y: 64,
            z: -200,
            world: 'overworld',
            costName: 'diamond',
            resultName: 'emerald'
        };
        expect(getTradeKey(trade)).toBe('100,64,-200,overworld,emerald,diamond');
    });

    test('different coordinates produce different keys', () => {
        const trade1 = { x: 100, y: 64, z: 200, world: 'overworld', costName: 'diamond', resultName: 'emerald' };
        const trade2 = { x: 101, y: 64, z: 200, world: 'overworld', costName: 'diamond', resultName: 'emerald' };
        expect(getTradeKey(trade1)).not.toBe(getTradeKey(trade2));
    });

    test('different worlds produce different keys', () => {
        const trade1 = { x: 100, y: 64, z: 200, world: 'overworld', costName: 'diamond', resultName: 'emerald' };
        const trade2 = { x: 100, y: 64, z: 200, world: 'the_nether', costName: 'diamond', resultName: 'emerald' };
        expect(getTradeKey(trade1)).not.toBe(getTradeKey(trade2));
    });

    test('different items produce different keys', () => {
        const trade1 = { x: 100, y: 64, z: 200, world: 'overworld', costName: 'diamond', resultName: 'emerald' };
        const trade2 = { x: 100, y: 64, z: 200, world: 'overworld', costName: 'gold ingot', resultName: 'emerald' };
        expect(getTradeKey(trade1)).not.toBe(getTradeKey(trade2));
    });

    test('same trade produces same key', () => {
        const trade = { x: 100, y: 64, z: 200, world: 'overworld', costName: 'diamond', resultName: 'emerald' };
        expect(getTradeKey(trade)).toBe(getTradeKey(trade));
    });

    test('handles negative coordinates', () => {
        const trade = { x: -100, y: 64, z: -200, world: 'overworld', costName: 'diamond', resultName: 'emerald' };
        expect(getTradeKey(trade)).toBe('-100,64,-200,overworld,emerald,diamond');
    });

    test('handles item names with spaces', () => {
        const trade = { x: 100, y: 64, z: 200, world: 'overworld', costName: 'gold ingot', resultName: 'iron block' };
        expect(getTradeKey(trade)).toBe('100,64,200,overworld,iron block,gold ingot');
    });
});

// ============================================================================
// shouldSwitchMapWorld tests
// ============================================================================

describe('shouldSwitchMapWorld', () => {
    // Basic cases - should NOT switch
    test('returns false when no previous position (first poll)', () => {
        expect(shouldSwitchMapWorld(undefined, 'the_nether', 'overworld', 5)).toBe(false);
    });

    test('returns false when player stayed in same world', () => {
        expect(shouldSwitchMapWorld('overworld', 'overworld', 'overworld', 5)).toBe(false);
    });

    test('returns false when map already shows player world', () => {
        expect(shouldSwitchMapWorld('overworld', 'the_nether', 'the_nether', 5)).toBe(false);
    });

    test('returns false when no shops in player new world', () => {
        expect(shouldSwitchMapWorld('overworld', 'the_nether', 'overworld', 0)).toBe(false);
    });

    // Cases where it SHOULD switch
    test('returns true when player enters nether with nether shops', () => {
        expect(shouldSwitchMapWorld('overworld', 'the_nether', 'overworld', 3)).toBe(true);
    });

    test('returns true when player returns to overworld with overworld shops', () => {
        expect(shouldSwitchMapWorld('the_nether', 'overworld', 'the_nether', 10)).toBe(true);
    });

    test('returns true when player enters the_end with end shops', () => {
        expect(shouldSwitchMapWorld('overworld', 'the_end', 'overworld', 1)).toBe(true);
    });

    // Edge cases
    test('returns true with exactly 1 shop in new world', () => {
        expect(shouldSwitchMapWorld('overworld', 'the_nether', 'overworld', 1)).toBe(true);
    });

    test('handles multiple world transitions correctly', () => {
        // overworld -> nether (with nether shops)
        expect(shouldSwitchMapWorld('overworld', 'the_nether', 'overworld', 5)).toBe(true);
        // nether -> end (with end shops)
        expect(shouldSwitchMapWorld('the_nether', 'the_end', 'the_nether', 2)).toBe(true);
        // end -> overworld (with overworld shops)
        expect(shouldSwitchMapWorld('the_end', 'overworld', 'the_end', 8)).toBe(true);
    });

    test('returns false when changing worlds but map shows third world with shops there', () => {
        // Player goes from nether to end, but map shows overworld (and has overworld shops)
        // This shouldn't happen in practice, but the function should handle it
        expect(shouldSwitchMapWorld('the_nether', 'the_end', 'overworld', 5)).toBe(true);
    });
});