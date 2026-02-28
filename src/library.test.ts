/**
 * Unit tests for src/lib.ts - pure logic functions
 * Run with: npm test
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, describe, expect, test, vi } from 'vitest';

import {
    applyMapping,
    buildExchangeMatrix,
    buildRatioGraph,
    calculateFitZoom,
    calculateItemValues,
    clampToCircle,
    computeDashboardData,
    countIndependentShops,
    enchantsMatch,
    escapeHtml,
    filterTrade,
    formatName,
    formatRelativeTime,
    fromLeafletCoordsRelative,
    getConfig,
    getRatio,
    getRegex,
    getTileCoords,
    getTileOffset,
    getTradeKey,
    getTrustedItemValue,
    getWorldId,
    getZoomForHeight,
    hasEnoughIndependentData,
    highlight,
    isNether,
    loadBaseItems,
    loadConfig,
    loadFixedRatios,
    matchesQuery,
    median,
    parseLocation,
    parseShulkerContents,
    processTrade,
    shouldSwitchMapWorld,
    sortResults,
    toLeafletCoords,
    toLeafletCoordsRelative} from './library.js';
import type { AppConfig, BlockConversions, FavoriteItem,FilterResult, Item, ItemValues, MappingRule, Recipe, Shop, Trade, TradeInput, TradeSnapshot } from './types.js';
import { AppConfigSchema, DEFAULT_CONFIG } from './types.js';

// String constants to avoid duplication
const EMERALD = 'EMERALD';
const EMERALD_LOWER = 'emerald';
const ITEM = 'ITEM';
const OVERWORLD = 'overworld';
const THE_NETHER = 'the_nether';
const _THE_END = 'the_end'; // Prefixed with _ as it's only used in test literals
const DIAMOND = 'DIAMOND';
const MINECRAFT_OVERWORLD = 'minecraft:overworld';
const BLOCK_CONVERSIONS_JSON = 'block_conversions.json';
const CORE_CURRENCIES_JSON = 'core_currencies.json';
const CONFIG_JSON = 'config.json';
const TEST_DATA_URL = 'https://test.example.com/data.json';
const EMERALD_BLOCK = 'emerald block';
const DIAMOND_LOWER = 'diamond';
const COOKED_BEEF = 'cooked beef';
const COOKED_BEEF_TITLE = 'Cooked beef';
const VOTES_CERTIFICATE = '50 Votes Certificate';
const COOKED_BEEF_NO_SPACE = 'cookedbeef';
const LORE_GUNPOWDER = '- 64x GUNPOWDER';
const EMERALD_TITLE = 'Emerald';
const DIAMOND_BLOCK = 'diamond block';
const GOLD_BLOCK = 'gold block';
const GOLD_INGOT = 'gold ingot';
const GOLD_BLOCK_TITLE = 'Gold Block';
const DIAMOND_BLOCK_TITLE = 'Diamond Block';
const TEST_MAPS_URL = 'https://test.example.com/maps';
const MINECRAFT_EFFICIENCY = 'minecraft:efficiency';
const COOKED_WILDCARD = 'cooked*';
const VOTE_DIAMOND_TYPE = 'Vote Diamond';
const DIAMOND_TITLE = 'Diamond';

// Helper function to create a trade for tests
const createTrade = (resultAmount: number, costAmount: number, resultName: string, stock: number, world = OVERWORLD): Trade => ({
    world,
    stock,
    resultName,
    resultAmount,
    x: 0, y: 0, z: 0,
    item1: { type: EMERALD, name: '', amount: costAmount },
    item2: undefined,
    resultItem: { type: ITEM, name: resultName, amount: resultAmount },
    displayStock: stock * resultAmount,
    resultText: resultName.toLowerCase(),
    costText: EMERALD_LOWER,
    loreText: '',
    shulkerItems: undefined,
    costName: EMERALD_TITLE
});

// Helper function to create a trade with specific coordinates for tests
const createTradeWithCoords = (name: string, x: number, z: number): Trade => ({
    x, z,
    y: 64, world: OVERWORLD,
    item1: { type: EMERALD, name: '', amount: 1 },
    item2: undefined,
    resultItem: { name, type: ITEM, amount: 1 },
    stock: 1,
    displayStock: 1,
    resultText: name.toLowerCase(),
    costText: EMERALD_LOWER,
    loreText: '',
    shulkerItems: undefined,
    resultName: name,
    resultAmount: 1,
    costName: EMERALD_TITLE
});

// Test fixtures
const TEST_BLOCK_CONVERSIONS: BlockConversions = {
    [EMERALD_BLOCK]: { base: EMERALD_LOWER, multiplier: 9 },
    [DIAMOND_BLOCK]: { base: DIAMOND_LOWER, multiplier: 9 },
    [GOLD_BLOCK]: { base: GOLD_INGOT, multiplier: 9 },
    'iron block': { base: 'iron ingot', multiplier: 9 },
    'netherite block': { base: 'netherite ingot', multiplier: 9 },
    'coal block': { base: 'coal', multiplier: 9 },
    'lapis block': { base: 'lapis lazuli', multiplier: 9 },
    'redstone block': { base: 'redstone', multiplier: 9 },
    'copper block': { base: 'copper ingot', multiplier: 9 }
};

const TEST_CORE_BLOCKS = [
    'Netherite Ingot',
    DIAMOND_BLOCK_TITLE,
    'Diamond',
    'Emerald Block',
    GOLD_BLOCK_TITLE,
    'Iron Block'
];

const TEST_CONFIG: AppConfig = {
    ...DEFAULT_CONFIG,
    dataUrl: TEST_DATA_URL,
    dynmap: {
        ...DEFAULT_CONFIG.dynmap,
        baseUrl: TEST_MAPS_URL
    }
};

// Mock fetch globally for all tests
beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
        if (url === BLOCK_CONVERSIONS_JSON) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(TEST_BLOCK_CONVERSIONS)
            });
        }
        if (url === CORE_CURRENCIES_JSON) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(TEST_CORE_BLOCKS)
            });
        }
        if (url === CONFIG_JSON) {
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
        expect(matchesQuery(DIAMOND_LOWER, DIAMOND_LOWER)).toBe(true);
    });

    test('partial match', () => {
        expect(matchesQuery(DIAMOND_BLOCK, DIAMOND_LOWER)).toBe(true);
    });

    test('no-space query matches spaced text', () => {
        expect(matchesQuery('vote diamond', 'votediamond')).toBe(true);
    });

    test('words in any order', () => {
        expect(matchesQuery('vote diamond', 'diamond vote')).toBe(true);
    });

    test('no match returns false', () => {
        expect(matchesQuery(DIAMOND_LOWER, EMERALD_LOWER)).toBe(false);
    });

    test('underscore in query matches space in text', () => {
        expect(matchesQuery(COOKED_BEEF, 'cooked_beef')).toBe(true);
    });

    test('underscore in text matches space in query', () => {
        expect(matchesQuery('cooked_beef', COOKED_BEEF)).toBe(true);
    });

    test('no separator matches text with space', () => {
        expect(matchesQuery(COOKED_BEEF, COOKED_BEEF_NO_SPACE)).toBe(true);
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
        expect(enchantsMatch({ 'minecraft:efficiency': 1 })).toBe(false);
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

describe('applyMapping', () => {
    test('maps vote diamond correctly', () => {
        const rules: MappingRule[] = [{ item: DIAMOND, originalName: VOTES_CERTIFICATE, enchant: { [MINECRAFT_EFFICIENCY]: 1 }, customName: 'VOTE_DIAMOND' }];
        const item: Item = { type: DIAMOND, name: VOTES_CERTIFICATE, amount: 1, enchant: { [MINECRAFT_EFFICIENCY]: 1 } };
        const result = applyMapping(item, rules);
        expect(result?.type).toBe('VOTE_DIAMOND');
        expect(result?.name).toBe('');
    });

    test('does not map without matching enchant', () => {
        const rules: MappingRule[] = [{ item: DIAMOND, originalName: VOTES_CERTIFICATE, enchant: { [MINECRAFT_EFFICIENCY]: 1 }, customName: 'VOTE_DIAMOND' }];
        const item: Item = { type: DIAMOND, name: VOTES_CERTIFICATE, amount: 1, enchant: {} };
        const result = applyMapping(item, rules);
        expect(result?.type).toBe(DIAMOND);
    });

    test('does not map without matching name', () => {
        const rules: MappingRule[] = [{ item: DIAMOND, originalName: VOTES_CERTIFICATE, enchant: { [MINECRAFT_EFFICIENCY]: 1 }, customName: 'VOTE_DIAMOND' }];
        const item: Item = { type: DIAMOND, name: 'Other Name', amount: 1, enchant: { [MINECRAFT_EFFICIENCY]: 1 } };
        const result = applyMapping(item, rules);
        expect(result?.type).toBe(DIAMOND);
    });

    test('handles undefined item', () => {
        expect(applyMapping(undefined, [])).toBeUndefined();
    });

    test('handles minecraft: prefix in type', () => {
        const rules: MappingRule[] = [{ item: 'DIAMOND', originalName: 'Test', customName: 'TEST_ITEM' }];
        const item: Item = { type: 'minecraft:diamond', name: 'Test', amount: 1, enchant: {} };
        const result = applyMapping(item, rules);
        expect(result?.type).toBe('TEST_ITEM');
    });
});

describe('getRegex', () => {
    test('basic pattern', () => {
        const regex = getRegex(DIAMOND_LOWER);
        expect(regex.test('Diamond')).toBe(true);
        expect(regex.test(EMERALD_LOWER)).toBe(false);
    });

    test('wildcard pattern', () => {
        const regex = getRegex('dia*');
        expect(regex.test(DIAMOND_LOWER)).toBe(true);
        expect(regex.test(DIAMOND_BLOCK)).toBe(true);
    });

    test('matches text with space when query has no space', () => {
        const regex = getRegex(COOKED_BEEF_NO_SPACE);
        expect(regex.test(COOKED_BEEF_TITLE)).toBe(true);
    });

    test('matches text with underscore when query has no separator', () => {
        const regex = getRegex(COOKED_BEEF_NO_SPACE);
        expect(regex.test('cooked_beef')).toBe(true);
    });

    test('wildcard does not break flexible matching', () => {
        const regex = getRegex(COOKED_WILDCARD);
        expect(regex.test(COOKED_BEEF_TITLE)).toBe(true);
        expect(regex.test('Cooked cod')).toBe(true);
    });

    test('handles regex special chars without throwing', () => {
        // These all contain regex special characters that would throw if not escaped
        const specialPatterns = ['[test]', '(foo)', 'a+b', 'c?d', 'x.y', 'a|b', 'a{2}', '^start', 'end$', String.raw`back\slash`];
        for (const pattern of specialPatterns) {
            expect(() => getRegex(pattern)).not.toThrow();
        }
    });

    test('matches text containing special regex chars', () => {
        expect(getRegex('[Diamond]').test('[Diamond]')).toBe(true);
        expect(getRegex('foo(bar)').test('foo(bar)')).toBe(true);
        expect(getRegex('a+b').test('a+b')).toBe(true);
        expect(getRegex('item.name').test('item.name')).toBe(true);
    });

    test('special chars work with flexible spacing', () => {
        expect(getRegex('[test]').test('[_test_]')).toBe(true);
        expect(getRegex('(foo)').test('( foo )')).toBe(true);
    });

    test('special chars work with wildcards', () => {
        expect(getRegex('[*]').test('[anything]')).toBe(true);
        expect(getRegex('(*test)').test('(my test)')).toBe(true);
    });
});

describe('parseShulkerContents', () => {
    test('parses single item type', () => {
        const lore = [LORE_GUNPOWDER, LORE_GUNPOWDER, LORE_GUNPOWDER];
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
        const beef = result.items.find(index => index.key === 'cooked_beef');
        expect(beef?.name).toBe(COOKED_BEEF_TITLE);
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

describe('config.json file validation', () => {
    test('dataUrl points to remote API, not a local file', async () => {
        const raw = await readFile(path.resolve(__dirname, '..', CONFIG_JSON), 'utf8');
        const json: unknown = JSON.parse(raw);
        const result = AppConfigSchema.safeParse(json);
        expect(result.success).toBe(true);
        if (!result.success) { return; }
        expect(result.data.dataUrl).toMatch(/^https?:\/\//);
        expect(result.data.dataUrl).not.toMatch(/^\.[\\/]/);
    });
});

describe('sortResults', () => {
    test('sorts by result-amt descending', () => {
        const results: FilterResult[] = [
            { trade: createTrade(10, 1, 'A', 1), matchResult: true, matchCost: false, displayName: 'A', displayAmount: 10 },
            { trade: createTrade(50, 1, 'B', 1), matchResult: true, matchCost: false, displayName: 'B', displayAmount: 50 },
            { trade: createTrade(25, 1, 'C', 1), matchResult: true, matchCost: false, displayName: 'C', displayAmount: 25 }
        ];
        const sorted0 = sortResults(results, 'result-amt', 'desc');
        expect(sorted0[0]!.trade.resultName).toBe('B');
        expect(sorted0[1]!.trade.resultName).toBe('C');
        expect(sorted0[2]!.trade.resultName).toBe('A');
    });

    test('sorts by result-name ascending', () => {
        const results: FilterResult[] = [
            { trade: createTrade(1, 1, 'Zebra', 1), matchResult: true, matchCost: false, displayName: 'Zebra', displayAmount: 1 },
            { trade: createTrade(1, 1, 'Apple', 1), matchResult: true, matchCost: false, displayName: 'Apple', displayAmount: 1 },
            { trade: createTrade(1, 1, 'Mango', 1), matchResult: true, matchCost: false, displayName: 'Mango', displayAmount: 1 }
        ];
        const sorted1 = sortResults(results, 'result-name', 'asc');
        expect(sorted1[0]!.trade.resultName).toBe('Apple');
        expect(sorted1[1]!.trade.resultName).toBe('Mango');
        expect(sorted1[2]!.trade.resultName).toBe('Zebra');
    });

    test('sorts by world ascending', () => {
        const results: FilterResult[] = [
            { trade: createTrade(1, 1, 'A', 1, THE_NETHER), matchResult: true, matchCost: false, displayName: 'A', displayAmount: 1 },
            { trade: createTrade(1, 1, 'B', 1, OVERWORLD), matchResult: true, matchCost: false, displayName: 'B', displayAmount: 1 },
            { trade: createTrade(1, 1, 'C', 1, 'the_end'), matchResult: true, matchCost: false, displayName: 'C', displayAmount: 1 }
        ];
        const sorted2 = sortResults(results, 'world', 'asc');
        expect(sorted2[0]!.trade.world).toBe(OVERWORLD);
        expect(sorted2[1]!.trade.world).toBe('the_end');
        expect(sorted2[2]!.trade.world).toBe(THE_NETHER);
    });

    test('sorts by distance descending', () => {
        const results: FilterResult[] = [
            { trade: createTradeWithCoords('Near', 10, 10), matchResult: true, matchCost: false, displayName: 'Near', displayAmount: 1 },
            { trade: createTradeWithCoords('Far', 1000, 1000), matchResult: true, matchCost: false, displayName: 'Far', displayAmount: 1 },
            { trade: createTradeWithCoords('Mid', 100, 100), matchResult: true, matchCost: false, displayName: 'Mid', displayAmount: 1 }
        ];
        const sorted3 = sortResults(results, 'distance', 'desc');
        expect(sorted3[0]!.trade.resultName).toBe('Far');
        expect(sorted3[1]!.trade.resultName).toBe('Mid');
        expect(sorted3[2]!.trade.resultName).toBe('Near');
    });

    test('sorts by distance ascending', () => {
        const results: FilterResult[] = [
            { trade: createTradeWithCoords('Far', 1000, 1000), matchResult: true, matchCost: false, displayName: 'Far', displayAmount: 1 },
            { trade: createTradeWithCoords('Near', 10, 10), matchResult: true, matchCost: false, displayName: 'Near', displayAmount: 1 },
            { trade: createTradeWithCoords('Mid', 100, 100), matchResult: true, matchCost: false, displayName: 'Mid', displayAmount: 1 }
        ];
        const sorted4 = sortResults(results, 'distance', 'asc');
        expect(sorted4[0]!.trade.resultName).toBe('Near');
        expect(sorted4[1]!.trade.resultName).toBe('Mid');
        expect(sorted4[2]!.trade.resultName).toBe('Far');
    });

    test('distance uses euclidean distance from origin', () => {
        // Distance = sqrt(x^2 + z^2)
        // A: sqrt(300^2 + 400^2) = sqrt(250000) = 500
        // B: sqrt(100^2 + 100^2) = sqrt(20000) ≈ 141
        // C: sqrt(0^2 + 600^2) = 600
        const results: FilterResult[] = [
            { trade: createTradeWithCoords('A', 300, 400), matchResult: true, matchCost: false, displayName: 'A', displayAmount: 1 },
            { trade: createTradeWithCoords('B', 100, 100), matchResult: true, matchCost: false, displayName: 'B', displayAmount: 1 },
            { trade: createTradeWithCoords('C', 0, 600), matchResult: true, matchCost: false, displayName: 'C', displayAmount: 1 }
        ];
        const sorted5 = sortResults(results, 'distance', 'asc');
        expect(sorted5[0]!.trade.resultName).toBe('B'); // ~141
        expect(sorted5[1]!.trade.resultName).toBe('A'); // 500
        expect(sorted5[2]!.trade.resultName).toBe('C'); // 600
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
});

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
});

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

describe('filterTrade', () => {
    const trade = {
        stock: 10,
        resultText: 'diamond',
        costText: EMERALD_LOWER,
        resultName: 'Diamond',
        resultAmount: 1,
        shulkerItems: undefined
    } as unknown as Trade;

    test('returns null when out of stock', () => {
        const result = filterTrade({ ...trade, stock: 0 }, 'diamond', '');
        expect(result).toBeUndefined();
    });

    test('matches by result text', () => {
        const result = filterTrade(trade, 'diamond', '');
        expect(result).not.toBeUndefined();
        expect(result?.matchResult).toBe(true);
    });

    test('matches by cost text', () => {
        const result = filterTrade(trade, '', 'emerald');
        expect(result).not.toBeUndefined();
        expect(result?.matchCost).toBe(true);
    });

    test('returns null for no match', () => {
        const result = filterTrade(trade, 'iron', '');
        expect(result).toBeUndefined();
    });

    test('matches shulker contents', () => {
        const shulkerTrade = {
            ...trade,
            resultText: 'shulker box',
            shulkerItems: [{ key: 'cooked_beef', name: COOKED_BEEF_TITLE, total: 64 }]
        } as unknown as Trade;
        const result = filterTrade(shulkerTrade, 'cooked_beef', '');
        expect(result).not.toBeUndefined();
        expect(result?.displayName).toBe(COOKED_BEEF_TITLE);
        expect(result?.displayAmount).toBe(64);
    });

    test('returns match when no queries provided', () => {
        const result = filterTrade(trade, '', '');
        expect(result).not.toBeUndefined();
        expect(result?.matchResult).toBeFalsy();
        expect(result?.matchCost).toBeFalsy();
    });
});

describe('processTrade', () => {
    test('processes basic trade', () => {
        const recipe: Recipe = {
            resultItem: { type: DIAMOND, name: '', amount: 1 },
            item1: { type: EMERALD, name: '', amount: 10 },
            item2: undefined,
            stock: 5
        };
        const shop: Shop = { location: '100, 64, -200', world: MINECRAFT_OVERWORLD, recipes: [] };
        const trade = processTrade(recipe, shop, []);
        expect(trade.resultName).toBe(DIAMOND_TITLE);
        expect(trade.costName).toBe(EMERALD_TITLE);
        expect(trade.displayStock).toBe(5);
        expect(trade.x).toBe(100);
    });

    test('applies mapping rules', () => {
        const recipe: Recipe = {
            resultItem: { type: DIAMOND, name: VOTE_DIAMOND_TYPE, amount: 1 },
            item1: { type: EMERALD, name: '', amount: 5 },
            item2: undefined,
            stock: 1
        };
        const shop: Shop = { location: '0, 0, 0', world: MINECRAFT_OVERWORLD, recipes: [] };
        const rules: MappingRule[] = [
            { item: DIAMOND, originalName: 'Vote Diamond', customName: 'VOTE_DIAMOND' }
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
                lore: [LORE_GUNPOWDER, LORE_GUNPOWDER]
            },
            item1: { type: 'EMERALD_BLOCK', name: '', amount: 1 },
            item2: undefined,
            stock: 3
        };
        const shop: Shop = { location: '0, 0, 0', world: MINECRAFT_OVERWORLD, recipes: [] };
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
        expect(getWorldId('minecraft:overworld')).toBe(OVERWORLD);
        expect(getWorldId(OVERWORLD)).toBe(OVERWORLD);
        expect(getWorldId('world')).toBe(OVERWORLD);
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
        expect(getWorldId('World')).toBe(OVERWORLD);
    });

    test('returns the_nether for World_nether', () => {
        expect(getWorldId('World_nether')).toBe('the_nether');
    });

    test('returns the_end for World_the_end', () => {
        expect(getWorldId('World_the_end')).toBe('the_end');
    });

    test('handles empty string as overworld', () => {
        expect(getWorldId('')).toBe(OVERWORLD);
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

    test('respects custom tile size for coords calculation', () => {
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

    test('respects custom tile size for offset calculation', () => {
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

    test('respects custom tile size for leaflet conversion', () => {
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

    test('respects custom tile size for relative conversion', () => {
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
        const result = clampToCircle(10_000, 0, centerLat, centerLng, radius);
        expect(result.lat).toBeCloseTo(100, 5);
        expect(result.lng).toBeCloseTo(0, 5);
        expect(result.clamped).toBe(true);
    });
});

// ============================================================================
// Route Optimization Tests
// ============================================================================

import {
    buildDistanceMatrix,
    calculateOrderDistance,
    calculateRouteDistance,
    computeOptimalOrder,
    nearestNeighborOrder,
    type RoutePoint,
    toOverworldEquivalent,
    twoOptOptimize} from './library.js';

describe('toOverworldEquivalent', () => {
    test('returns same coords for overworld', () => {
        const result = toOverworldEquivalent(100, 200, OVERWORLD);
        expect(result).toEqual({ x: 100, z: 200 });
    });

    test('multiplies coords by 8 for nether', () => {
        const result = toOverworldEquivalent(100, 200, THE_NETHER);
        expect(result).toEqual({ x: 800, z: 1600 });
    });

    test('handles nether case-insensitively', () => {
        expect(toOverworldEquivalent(10, 20, 'NETHER')).toEqual({ x: 80, z: 160 });
        expect(toOverworldEquivalent(10, 20, 'The_Nether')).toEqual({ x: 80, z: 160 });
    });

    test('handles negative coordinates for world conversion', () => {
        const result = toOverworldEquivalent(-50, -100, THE_NETHER);
        expect(result).toEqual({ x: -400, z: -800 });
    });
});

describe('calculateRouteDistance', () => {
    test('calculates distance between overworld points', () => {
        // Distance from (0,0) to (3,4) = 5
        const distribution = calculateRouteDistance(0, 0, OVERWORLD, 3, 4, OVERWORLD);
        expect(distribution).toBeCloseTo(5, 5);
    });

    test('calculates distance from overworld to nether using OW-equivalent', () => {
        // Nether point (10, 0) = OW-equivalent (80, 0)
        // Distance from origin = 80
        const distribution = calculateRouteDistance(0, 0, OVERWORLD, 10, 0, THE_NETHER);
        expect(distribution).toBeCloseTo(80, 5);
    });

    test('calculates distance between nether points using OW-equivalent', () => {
        // (0,0) nether = (0,0) OW-equiv
        // (10,0) nether = (80,0) OW-equiv
        // Distance = 80
        const distribution = calculateRouteDistance(0, 0, 'the_nether', 10, 0, 'the_nether');
        expect(distribution).toBeCloseTo(80, 5);
    });

    test('handles negative coordinates for route distance', () => {
        const distribution = calculateRouteDistance(-3, -4, 'overworld', 0, 0, 'overworld');
        expect(distribution).toBeCloseTo(5, 5);
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
        expect(order.toSorted((a, b) => a - b)).toEqual([0, 1, 2]);
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
        const distribution = calculateOrderDistance([], matrix);
        expect(distribution).toBe(0);
    });

    test('calculates distance for single point', () => {
        const points: RoutePoint[] = [{ x: 3, z: 4, world: 'overworld' }];
        const matrix = buildDistanceMatrix(points);
        const distribution = calculateOrderDistance([0], matrix);
        expect(distribution).toBeCloseTo(5, 5); // Origin to (3,4)
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
        const badDistribution = calculateOrderDistance(badOrder, matrix);
        
        const optimized = twoOptOptimize(badOrder, matrix);
        const optDistribution = calculateOrderDistance(optimized, matrix);
        
        // Optimized should be at least as good
        expect(optDistribution).toBeLessThanOrEqual(badDistribution);
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
        const totalDistribution = calculateOrderDistance(order, matrix);
        
        // Compare with worst possible order
        const worstOrder = [2, 0, 1]; // Zigzag
        const worstDistribution = calculateOrderDistance(worstOrder, matrix);
        
        expect(totalDistribution).toBeLessThanOrEqual(worstDistribution);
    });

    test('handles mixed overworld and nether points', () => {
        const points: RoutePoint[] = [
            { x: 800, z: 0, world: 'overworld' },   // 800 from origin
            { x: 100, z: 0, world: 'the_nether' }   // 800 from origin (OW-equiv)
        ];
        const order = computeOptimalOrder(points);
        
        // Both are same distance, order depends on implementation
        expect(order.length).toBe(2);
        expect(order.toSorted((a, b) => a - b)).toEqual([0, 1]);
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
        expect(order.toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
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
            world: OVERWORLD,
            costName: DIAMOND_LOWER,
            resultName: EMERALD_LOWER
        };
        expect(getTradeKey(trade)).toBe('100,64,-200,overworld,emerald,diamond');
    });

    test('different coordinates produce different keys', () => {
        const trade1 = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        const trade2 = { x: 101, y: 64, z: 200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        expect(getTradeKey(trade1)).not.toBe(getTradeKey(trade2));
    });

    test('different worlds produce different keys', () => {
        const trade1 = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        const trade2 = { x: 100, y: 64, z: 200, world: THE_NETHER, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        expect(getTradeKey(trade1)).not.toBe(getTradeKey(trade2));
    });

    test('different items produce different keys', () => {
        const trade1 = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        const trade2 = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: GOLD_INGOT, resultName: EMERALD_LOWER };
        expect(getTradeKey(trade1)).not.toBe(getTradeKey(trade2));
    });

    test('same trade produces same key', () => {
        const trade = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        expect(getTradeKey(trade)).toBe(getTradeKey(trade));
    });

    test('handles negative coordinates for trade key', () => {
        const trade = { x: -100, y: 64, z: -200, world: OVERWORLD, costName: DIAMOND_LOWER, resultName: EMERALD_LOWER };
        expect(getTradeKey(trade)).toBe('-100,64,-200,overworld,emerald,diamond');
    });

    test('handles item names with spaces', () => {
        const trade = { x: 100, y: 64, z: 200, world: OVERWORLD, costName: GOLD_INGOT, resultName: 'iron block' };
        expect(getTradeKey(trade)).toBe(`100,64,200,overworld,iron block,${GOLD_INGOT}`);
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

// ============================================================================
// Shopping & Navigation Helpers Tests
// ============================================================================

import { 
    aggregateShoppingList, 
    buildMarkerContent, 
    buildStopTooltip, 
    calculateTotalRouteDistance} from './library.js';
import type { RouteStop } from './types.js';

describe('aggregateShoppingList', () => {
    test('returns empty maps for empty cart', () => {
        const result = aggregateShoppingList([]);
        expect(result.costs.size).toBe(0);
        expect(result.gains.size).toBe(0);
    });

    test('aggregates single item correctly', () => {
        const trade = createTrade(1, 10, 'Diamond Sword', 1);
        const result = aggregateShoppingList([{ trade, quantity: 2 }]);
        
        expect(result.costs.get('Emerald')).toBe(20); // 10 * 2
        expect(result.gains.get('Diamond Sword')).toBe(2); // 1 * 2
    });

    test('aggregates multiple items with same cost', () => {
        const trade1 = createTrade(1, 5, 'Item A', 1);
        const trade2 = createTrade(1, 3, 'Item B', 1);
        const result = aggregateShoppingList([
            { trade: trade1, quantity: 1 },
            { trade: trade2, quantity: 1 }
        ]);
        
        expect(result.costs.get('Emerald')).toBe(8); // 5 + 3
        expect(result.gains.get('Item A')).toBe(1);
        expect(result.gains.get('Item B')).toBe(1);
    });

    test('handles items with item2 cost', () => {
        const trade: Trade = {
            ...createTrade(1, 5, 'Special Item', 1),
            item2: { type: 'DIAMOND', name: '', amount: 2 }
        };
        const result = aggregateShoppingList([{ trade, quantity: 3 }]);
        
        expect(result.costs.get('Emerald')).toBe(15); // 5 * 3
        expect(result.costs.get('Diamond')).toBe(6); // 2 * 3
    });

    test('aggregates gains for same result item', () => {
        const trade1 = createTrade(64, 1, 'Cobblestone', 10);
        const trade2 = createTrade(32, 1, 'Cobblestone', 5);
        const result = aggregateShoppingList([
            { trade: trade1, quantity: 2 },
            { trade: trade2, quantity: 1 }
        ]);
        
        expect(result.gains.get('Cobblestone')).toBe(160); // 64*2 + 32*1
    });
});

// Helper functions for route tests
const createRouteStop = (x: number, z: number, world = OVERWORLD): RouteStop => ({
    x, z, world,
    type: 'shop',
    y: 64,
    displayX: world === THE_NETHER ? x * 8 : x,
    displayZ: world === THE_NETHER ? z * 8 : z,
    isNether: world === THE_NETHER
});

const createStopWithCartItem = (name: string, quantity: number, isNether = false, x = 100, z = 200): RouteStop => ({
    x, z, isNether,
    type: 'shop',
    y: 64,
    world: isNether ? THE_NETHER : OVERWORLD,
    displayX: isNether ? x * 8 : x,
    displayZ: isNether ? z * 8 : z,
    cartItem: {
        quantity,
        trade: createTrade(1, 1, name, 1, isNether ? THE_NETHER : OVERWORLD),
    }
});

describe('calculateTotalRouteDistance', () => {
    test('returns 0 for empty route', () => {
        expect(calculateTotalRouteDistance([])).toBe(0);
    });

    test('calculates distance from origin to single stop', () => {
        const route = [createRouteStop(100, 0)];
        expect(calculateTotalRouteDistance(route)).toBe(100);
    });

    test('calculates distance through multiple stops', () => {
        const route = [
            createRouteStop(100, 0),
            createRouteStop(100, 100)
        ];
        // From (0,0) to (100,0) = 100, then (100,0) to (100,100) = 100
        expect(calculateTotalRouteDistance(route)).toBe(200);
    });

    test('uses custom start position', () => {
        const route = [createRouteStop(100, 100)];
        // From (50, 50) to (100, 100) = hypot(50, 50) ≈ 70.7
        const distance = calculateTotalRouteDistance(route, 50, 50, OVERWORLD);
        expect(distance).toBeCloseTo(70.71, 1);
    });

    test('handles cross-dimension travel', () => {
        const route = [createRouteStop(100, 100, THE_NETHER)];
        // From overworld (0,0) to nether (100,100) which is equivalent to (800,800) in overworld
        const distance = calculateTotalRouteDistance(route, 0, 0, OVERWORLD);
        expect(distance).toBeCloseTo(Math.hypot(800, 800), 0);
    });
});

describe('buildMarkerContent', () => {
    test('builds numbered marker for incomplete stop', () => {
        const html = buildMarkerContent(false, 1, false);
        expect(html).toBe('<div class="nav-marker">1</div>');
    });

    test('builds checkmark marker for completed stop', () => {
        const html = buildMarkerContent(true, 99, false);
        expect(html).toContain('✓');
        expect(html).toContain('nav-marker--completed');
        expect(html).not.toContain('99'); // Index ignored when completed
    });

    test('includes nether indicator for nether stops', () => {
        const html = buildMarkerContent(false, 2, true);
        expect(html).toContain('🔥');
        expect(html).toContain('nether-indicator');
        expect(html).toContain('2');
    });

    test('includes nether indicator on completed nether stop', () => {
        const html = buildMarkerContent(true, 1, true);
        expect(html).toContain('✓');
        expect(html).toContain('🔥');
    });
});

describe('buildStopTooltip', () => {
    test('shows item quantity and name', () => {
        const stop = createStopWithCartItem('Diamond Pickaxe', 3);
        const tooltip = buildStopTooltip(stop, false);
        expect(tooltip).toBe('3× Diamond Pickaxe');
    });

    test('prefixes with checkmark when completed', () => {
        const stop = createStopWithCartItem('Iron Sword', 1);
        const tooltip = buildStopTooltip(stop, true);
        expect(tooltip).toContain('✓');
        expect(tooltip).toContain('(completed)');
    });

    test('shows nether coordinates for nether stops', () => {
        const stop = createStopWithCartItem('Blaze Rod', 5, true, 50, 75);
        const tooltip = buildStopTooltip(stop, false);
        expect(tooltip).toContain('Nether: 50, 75');
        expect(tooltip).toContain('(OW: 400, 600)'); // 50*8, 75*8
    });

    test('shows "Stop" for stops without cart item', () => {
        const stop: RouteStop = {
            type: 'shop',
            x: 0, y: 64, z: 0,
            world: OVERWORLD,
            displayX: 0, displayZ: 0,
            isNether: false
        };
        const tooltip = buildStopTooltip(stop, false);
        expect(tooltip).toBe('Stop');
    });
});

// ============================================================================
// getZoomForHeight
// ============================================================================

describe('getZoomForHeight', () => {
    // Linear interpolation: Y=63 → zoom 2, Y=300 → zoom -3
    // slope = (−3 − 2) / (300 − 63) = −5 / 237

    test('returns max zoom at or below ground level (Y ≤ 63)', () => {
        expect(getZoomForHeight(-64)).toBe(2);
        expect(getZoomForHeight(0)).toBe(2);
        expect(getZoomForHeight(63)).toBe(2);
    });

    test('returns min zoom at or above max height (Y ≥ 300)', () => {
        expect(getZoomForHeight(300)).toBe(-3);
        expect(getZoomForHeight(320)).toBe(-3);
        expect(getZoomForHeight(500)).toBe(-3);
    });

    test('returns exact midpoint zoom at midpoint height', () => {
        const midY = (63 + 300) / 2; // 181.5
        const midZoom = (2 + -3) / 2; // -0.5
        expect(getZoomForHeight(midY)).toBeCloseTo(midZoom, 5);
    });

    test('interpolates linearly between boundaries', () => {
        // At Y=63: zoom = 2, at Y=300: zoom = -3
        // Quarter: Y = 63 + 0.25 * 237 = 122.25, zoom = 2 + 0.25 * (-5) = 0.75
        expect(getZoomForHeight(122.25)).toBeCloseTo(0.75, 5);
        // Three-quarters: Y = 63 + 0.75 * 237 = 240.75, zoom = 2 + 0.75 * (-5) = -1.75
        expect(getZoomForHeight(240.75)).toBeCloseTo(-1.75, 5);
    });

    test('is monotonically decreasing within range', () => {
        const heights = [63, 80, 100, 120, 150, 200, 250, 300];
        for (let index = 1; index < heights.length; index++) {
            const previousZoom = getZoomForHeight(heights[index - 1] ?? 0);
            const currentZoom = getZoomForHeight(heights[index] ?? 0);
            expect(currentZoom).toBeLessThanOrEqual(previousZoom);
        }
    });

    test('handles negative Y values (below bedrock)', () => {
        expect(getZoomForHeight(-64)).toBe(2);
        expect(getZoomForHeight(-1)).toBe(2);
    });
});

// ============================================================================
// formatRelativeTime
// ============================================================================

describe('formatRelativeTime', () => {
    const NOW = 1_000_000_000;

    test('returns "just now" for less than 1 minute', () => {
        expect(formatRelativeTime(NOW - 30_000, NOW)).toBe('just now');
        expect(formatRelativeTime(NOW - 59_999, NOW)).toBe('just now');
    });

    test('returns minutes for less than 1 hour', () => {
        expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1m ago');
        expect(formatRelativeTime(NOW - 1_800_000, NOW)).toBe('30m ago');
        expect(formatRelativeTime(NOW - 3_599_999, NOW)).toBe('59m ago');
    });

    test('returns hours for less than 1 day', () => {
        expect(formatRelativeTime(NOW - 3_600_000, NOW)).toBe('1h ago');
        expect(formatRelativeTime(NOW - 43_200_000, NOW)).toBe('12h ago');
        expect(formatRelativeTime(NOW - 86_399_999, NOW)).toBe('23h ago');
    });

    test('returns days for 24+ hours', () => {
        expect(formatRelativeTime(NOW - 86_400_000, NOW)).toBe('1d ago');
        expect(formatRelativeTime(NOW - 172_800_000, NOW)).toBe('2d ago');
    });
});

// ============================================================================
// computeDashboardData
// ============================================================================

/**
 * Minimal trade factory for dashboard tests
 * @param overrides - Property overrides to merge into the default trade object
 * @returns A Trade object with default values merged with any provided overrides
 */
function makeDashboardTrade(overrides: Partial<Trade> = {}): Trade {
    return {
        shopName: 'TestShop',
        shopOwner: 'Owner',
        x: 100,
        y: 64,
        z: 200,
        world: 'world',
        resultName: 'Diamond',
        resultAmount: 1,
        costName: 'Emerald',
        costAmount: 2,
        stock: 10,
        displayStock: 10,
        ...overrides,
    } as Trade;
}

/**
 * Deviation calculator returning a fixed percent
 * @param percent - The fixed deviation percent to always return
 * @returns A deviation calculator function that always returns the given percent
 */
function fixedPercent(percent: number) {
    return () => ({ percent });
}

/**
 * Deviation calculator selecting percent by x-coordinate
 * @param x1Percent - Percent returned for trades at x=100
 * @param otherPercent - Percent returned for all other trades
 * @returns A deviation calculator function that branches on the trade's x coordinate
 */
function percentByX(x1Percent: number, otherPercent: number) {
    return (t: Trade) => t.x === 100 ? { percent: x1Percent } : { percent: otherPercent };
}

/**
 * Deviation calculator that returns undefined
 * @returns Always undefined, simulating a trade with no computable deviation
 */
function noDeviationResult(): undefined {
    return undefined;
}

/**
 * Returns deviation based on trade x-coord: x=100 gets first percent, others get second
 * @param atX100 - Deviation percent for trades at x=100
 * @param other - Deviation percent for all other trades
 * @returns A deviation calculator function that branches on trade x coordinate
 */
function deviationByCoord(atX100: number, other: number) {
    return (t: Trade) => t.x === 100 ? { percent: atX100 } : { percent: other };
}

describe('computeDashboardData', () => {
    const BASE_SNAPSHOT: TradeSnapshot = {
        timestamp: Date.now() - 3_600_000,
        trades: {},
    };

    test('returns empty data when no previous snapshot', () => {
        const trades = [makeDashboardTrade()];
        const result = computeDashboardData(trades, fixedPercent(0), undefined, []);

        expect(result.newTradeKeys).toHaveLength(0);
        expect(result.priceDrops).toHaveLength(0);
        expect(result.watchlistHits).toHaveLength(0);
        expect(result.lastVisit).toBeUndefined();
    });

    test('detects new trades not in previous snapshot', () => {
        const trades = [makeDashboardTrade()];
        const result = computeDashboardData(trades, fixedPercent(0), BASE_SNAPSHOT, []);

        expect(result.newTradeKeys).toHaveLength(1);
    });

    test('does not flag existing trades as new', () => {
        const trade = makeDashboardTrade();
        const key = getTradeKey(trade);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: { [key]: { deviationPercent: 10, stock: 5 } },
        };
        const result = computeDashboardData([trade], fixedPercent(5), snapshot, []);

        expect(result.newTradeKeys).toHaveLength(0);
    });

    test('detects price drops meeting threshold', () => {
        const trade = makeDashboardTrade();
        const key = getTradeKey(trade);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: { [key]: { deviationPercent: 20, stock: 10 } },
        };
        // Deviation dropped from 20% to 5% — improvement of 15pp (≥5pp threshold)
        const result = computeDashboardData([trade], fixedPercent(5), snapshot, []);

        expect(result.priceDrops).toHaveLength(1);
        expect(result.priceDrops[0].oldDeviation).toBe(20);
        expect(result.priceDrops[0].newDeviation).toBe(5);
    });

    test('ignores price changes below threshold', () => {
        const trade = makeDashboardTrade();
        const key = getTradeKey(trade);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: { [key]: { deviationPercent: 10, stock: 10 } },
        };
        // Only 3pp improvement — below 5pp threshold
        const result = computeDashboardData([trade], fixedPercent(7), snapshot, []);

        expect(result.priceDrops).toHaveLength(0);
    });

    test('detects watchlist hits for favorited items', () => {
        const trade = makeDashboardTrade({ resultName: 'Diamond' });
        const favorites: FavoriteItem[] = [
            { itemName: 'diamond', maxDeviation: 10 },
        ];
        const result = computeDashboardData([trade], fixedPercent(-5), BASE_SNAPSHOT, favorites);

        expect(result.watchlistHits).toHaveLength(1);
        expect(result.watchlistHits[0].itemName).toBe('Diamond');
        expect(result.watchlistHits[0].currentDeviation).toBe(-5);
    });

    test('excludes watchlist items exceeding maxDeviation', () => {
        const trade = makeDashboardTrade({ resultName: 'Diamond' });
        const favorites: FavoriteItem[] = [
            { itemName: 'diamond', maxDeviation: -10 },
        ];
        // Current deviation is 5%, maxDeviation is -10% — does not meet threshold
        const result = computeDashboardData([trade], fixedPercent(5), BASE_SNAPSHOT, favorites);

        expect(result.watchlistHits).toHaveLength(0);
    });

    test('includes lastVisit from previous snapshot', () => {
        const result = computeDashboardData([], noDeviationResult, BASE_SNAPSHOT, []);
        expect(result.lastVisit).toBe(BASE_SNAPSHOT.timestamp);
    });

    test('keeps best deal per favorite item', () => {
        const trade1 = makeDashboardTrade({ resultName: 'Diamond', x: 100, costAmount: 2 });
        const trade2 = makeDashboardTrade({ resultName: 'Diamond', x: 200, costAmount: 1 });
        const favorites: FavoriteItem[] = [
            { itemName: 'diamond', maxDeviation: undefined },
        ];

        const result = computeDashboardData([trade1, trade2], percentByX(10, -5), BASE_SNAPSHOT, favorites);

        expect(result.watchlistHits).toHaveLength(1);
        expect(result.watchlistHits[0].currentDeviation).toBe(-5);
    });

    test('sorts price drops by improvement magnitude', () => {
        const trade1 = makeDashboardTrade({ resultName: 'Diamond', x: 100 });
        const trade2 = makeDashboardTrade({ resultName: 'Iron ingot', x: 200 });
        const key1 = getTradeKey(trade1);
        const key2 = getTradeKey(trade2);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: {
                [key1]: { deviationPercent: 30, stock: 10 },
                [key2]: { deviationPercent: 50, stock: 10 },
            },
        };

        const result = computeDashboardData([trade1, trade2], percentByX(20, 10), snapshot, []);

        expect(result.priceDrops).toHaveLength(2);
        // trade2 improved more: 50→10 (40pp) vs trade1: 30→20 (10pp)
        expect(result.priceDrops[0].itemName).toBe('Iron ingot');
        expect(result.priceDrops[1].itemName).toBe('Diamond');
    });

    test('excludes price drops when a better deal already exists for the same item', () => {
        // Two trades for the same item at different shops
        const tradeA = makeDashboardTrade({ resultName: 'Potato', x: 100 });
        const tradeB = makeDashboardTrade({ resultName: 'Potato', x: 200, shopName: 'OtherShop' });
        const keyA = getTradeKey(tradeA);
        const keyB = getTradeKey(tradeB);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: {
                [keyA]: { deviationPercent: -40, stock: 10 },  // Already -40%
                [keyB]: { deviationPercent: 0, stock: 10 },    // Was 0%
            },
        };

        // tradeA stays at -40%, tradeB drops to -20%
        const result = computeDashboardData([tradeA, tradeB], deviationByCoord(-40, -20), snapshot, []);

        // tradeB improved by 20pp, but tradeA at -40% is still the better deal
        // so tradeB's drop should NOT appear — it's not the global best
        expect(result.priceDrops).toHaveLength(0);
    });

    test('includes price drop when it becomes the new global best for the item', () => {
        const tradeA = makeDashboardTrade({ resultName: 'Potato', x: 100 });
        const tradeB = makeDashboardTrade({ resultName: 'Potato', x: 200, shopName: 'OtherShop' });
        const keyA = getTradeKey(tradeA);
        const keyB = getTradeKey(tradeB);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: {
                [keyA]: { deviationPercent: -30, stock: 10 },
                [keyB]: { deviationPercent: 0, stock: 10 },
            },
        };
        // tradeA stays at -30%, tradeB drops to -50% (new global best)
        const result = computeDashboardData([tradeA, tradeB], deviationByCoord(-30, -50), snapshot, []);

        expect(result.priceDrops).toHaveLength(1);
        expect(result.priceDrops[0].newDeviation).toBe(-50);
        expect(result.priceDrops[0].oldDeviation).toBe(0);
    });

    test('excludes out-of-stock trades from price drops', () => {
        const trade = makeDashboardTrade({ stock: 0, displayStock: 0 });
        const key = getTradeKey(trade);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: { [key]: { deviationPercent: -50, stock: 10 } },
        };
        // Trade improved from -50% to -80%, but stock is 0 — should be excluded
        const result = computeDashboardData([trade], fixedPercent(-80), snapshot, []);

        expect(result.priceDrops).toHaveLength(0);
    });

    test('excludes out-of-stock trades from new trade detection', () => {
        const trade = makeDashboardTrade({ stock: 0, displayStock: 0 });
        const result = computeDashboardData([trade], fixedPercent(0), BASE_SNAPSHOT, []);

        expect(result.newTradeKeys).toHaveLength(0);
    });

    test('excludes out-of-stock trades from watchlist hits', () => {
        const trade = makeDashboardTrade({ resultName: 'Diamond', stock: 0, displayStock: 0 });
        const favorites: FavoriteItem[] = [
            { itemName: 'diamond', maxDeviation: 10 },
        ];
        const result = computeDashboardData([trade], fixedPercent(-5), BASE_SNAPSHOT, favorites);

        expect(result.watchlistHits).toHaveLength(0);
    });
});
