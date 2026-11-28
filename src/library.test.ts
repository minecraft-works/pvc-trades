/**
 * Unit tests for src/lib.ts - pure logic functions
 * Run with: npm test
 */

import { describe, expect, test } from 'vitest';

import { applyMapping, enchantsMatch, filterTrade, formatTradeCost, formatTradeCostNames, getCostParts, getRegex, highlightSegments, matchesQuery, parseLocation, processTrade, sortResults } from './library.js';
import { aggregateShoppingList } from './routing/navigation-helpers.js';
import { bundleRecipe, createTrade, namedBoxRecipe, plainItem } from './test-fixtures.js';
import type { FilterResult, Item, MappingRule, Recipe, Shop, Trade } from './types.js';

// String constants to avoid duplication
const EMERALD = 'EMERALD';
const EMERALD_LOWER = 'emerald';
const ITEM = 'ITEM';
const OVERWORLD = 'overworld';
const THE_NETHER = 'the_nether';
const _THE_END = 'the_end'; // Prefixed with _ as it's only used in test literals
const DIAMOND = 'DIAMOND';
const MINECRAFT_OVERWORLD = 'minecraft:overworld';
const EMERALD_BLOCK = 'emerald block';
const DIAMOND_LOWER = 'diamond';
const COOKED_BEEF = 'cooked beef';
const COOKED_BEEF_TITLE = 'Cooked beef';
const VOTES_CERTIFICATE = '50 Votes Certificate';
const COOKED_BEEF_NO_SPACE = 'cookedbeef';
const LORE_GUNPOWDER = '- 64x GUNPOWDER';
const EMERALD_TITLE = 'Emerald';
const DIAMOND_BLOCK = 'diamond block';
const MINECRAFT_EFFICIENCY = 'minecraft:efficiency';
const COOKED_WILDCARD = 'cooked*';
const VOTE_DIAMOND_TYPE = 'Vote Diamond';
const DIAMOND_TITLE = 'Diamond';

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

describe('highlightSegments', () => {
    test('highlights matching text', () => {
        const regex = /diamond/i;
        expect(highlightSegments('Diamond block', regex)).toEqual([
            { text: 'Diamond', match: true },
            { text: ' block', match: false },
        ]);
    });

    test('keeps markup characters as plain text', () => {
        const regex = /test/i;
        expect(highlightSegments('<script>test</script>', regex)).toEqual([
            { text: '<script>', match: false },
            { text: 'test', match: true },
            { text: '</script>', match: false },
        ]);
    });

    test('matches the raw text, not HTML entities', () => {
        expect(highlightSegments('Bert & Ernie', /amp/i)).toEqual([{ text: 'Bert & Ernie', match: false }]);
        expect(highlightSegments('<<Sponsor Token>>', /lt/i)).toEqual([{ text: '<<Sponsor Token>>', match: false }]);
    });

    test('highlights special characters', () => {
        expect(highlightSegments('Bert & Ernie', /&/)).toEqual([
            { text: 'Bert ', match: false },
            { text: '&', match: true },
            { text: ' Ernie', match: false },
        ]);
    });

    test('highlights only the first match unless the regex is global', () => {
        expect(highlightSegments('ab ab', /ab/).filter(segment => segment.match)).toHaveLength(1);
        expect(highlightSegments('ab ab', /ab/g).filter(segment => segment.match)).toHaveLength(2);
    });
});

describe('filterTrade exact queries', () => {
    const emeraldBlockCost: Trade = { ...createTrade(1, 1, DIAMOND_TITLE, 5), item1: plainItem('EMERALD_BLOCK', 1), costText: EMERALD_BLOCK, costName: 'Emerald block' };
    const emeraldCost: Trade = createTrade(1, 9, DIAMOND_TITLE, 5);

    test('a quoted cost query matches the whole item name only', () => {
        expect(filterTrade(emeraldCost, '', '"emerald"')).toBeDefined();
        expect(filterTrade(emeraldBlockCost, '', '"emerald"')).toBeUndefined();
        expect(filterTrade(emeraldBlockCost, '', 'emerald')).toBeDefined();
    });

    test('a quoted result query matches the whole item name only', () => {
        const pickaxe = createTrade(1, 9, 'Diamond pickaxe', 5);
        expect(filterTrade(emeraldCost, '"diamond"', '')).toBeDefined();
        expect(filterTrade(pickaxe, '"diamond"', '')).toBeUndefined();
    });
});

describe('formatTradeCost', () => {
    test('single-item cost includes amount', () => {
        expect(formatTradeCost({ item1: plainItem(EMERALD, 64) })).toBe('64× Emerald');
    });

    test('two-item cost lists each item once with its own amount', () => {
        expect(formatTradeCost({ item1: plainItem('DIAMOND_BLOCK', 5), item2: plainItem('EMERALD_BLOCK', 3) }))
            .toBe('5× Diamond block + 3× Emerald block');
        expect(formatTradeCostNames({ item1: plainItem('DIAMOND_BLOCK', 5), item2: plainItem('EMERALD_BLOCK', 3) }))
            .toBe('Diamond block + Emerald block');
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

    test('distance normalizes nether coordinates to overworld blocks', () => {
        const nether = { ...createTradeWithCoords('Nether', 100, 0), world: 'World_nether' };
        const overworld = createTradeWithCoords('Overworld', 500, 0);
        const results: FilterResult[] = [
            { trade: nether, matchResult: true, matchCost: false, displayName: 'Nether', displayAmount: 1 },
            { trade: overworld, matchResult: true, matchCost: false, displayName: 'Overworld', displayAmount: 1 },
        ];
        // Nether (100, 0) is 800 overworld blocks away, farther than overworld (500, 0)
        const sorted = sortResults(results, 'distance', 'asc');
        expect(sorted.map(r => r.trade.resultName)).toEqual(['Overworld', 'Nether']);
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

    describe('facts from lore', () => {
        const shop: Shop = { location: '0, 0, 0', world: MINECRAFT_OVERWORLD, recipes: [] };
        const protection = processTrade({
            resultItem: {
                type: 'COAL_ORE',
                name: 'Standard Protection Block',
                amount: 1,
                lore: ['§7• §6Will protect 32x32 blocks.', '§8• §6Write §6§o/guide§6 for more informations.'],
            },
            item1: { type: EMERALD, name: '', amount: 1 },
            stock: 3
        }, shop, []);

        test('finds a protection block by its size', () => {
            expect(filterTrade(protection, '32x32', '')?.matchResult).toBe(true);
            expect(filterTrade(protection, '64x64', '')).toBeUndefined();
        });

        test('only matches lore text that states a fact, and not for exact names', () => {
            expect(filterTrade(protection, 'guide', '')).toBeUndefined();
            expect(filterTrade(protection, '"32x32"', '')).toBeUndefined();
        });
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

    test('keeps the shop name and owner, dropping blank ones', () => {
        const recipe: Recipe = {
            resultItem: { type: DIAMOND, name: '', amount: 1 },
            item1: { type: EMERALD, name: '', amount: 10 },
            stock: 5
        };
        const named = processTrade(recipe, { shopName: ' End Item Vendor ', shopOwner: '.aus3z', location: '0, 0, 0', world: MINECRAFT_OVERWORLD, recipes: [] }, []);
        expect(named.shopName).toBe('End Item Vendor');
        expect(named.shopOwner).toBe('.aus3z');

        const blank = processTrade(recipe, { shopName: '  ', location: '0, 0, 0', world: MINECRAFT_OVERWORLD, recipes: [] }, []);
        expect(blank.shopName).toBeUndefined();
        expect(blank.shopOwner).toBeUndefined();
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

    describe('seller-named shulker boxes', () => {
        const shop: Shop = { location: '0, 0, 0', world: MINECRAFT_OVERWORLD, recipes: [] };
        const mendingBooks = processTrade(namedBoxRecipe('mending', ['- 1x ENCHANTED_BOOK']), shop, []);

        test('keep the item name and carry the seller name as a label', () => {
            expect(mendingBooks.resultName).toBe('Enchanted book');
            expect(mendingBooks.resultLabel).toBe('mending');
        });

        test('can be found by their label, also with an exact query', () => {
            expect(filterTrade(mendingBooks, 'mending', '')).toBeDefined();
            expect(filterTrade(mendingBooks, '"mending"', '')).toBeDefined();
            expect(filterTrade(mendingBooks, 'silk touch', '')).toBeUndefined();
        });

        test('skip names that only repeat the contents or the box type', () => {
            expect(processTrade(namedBoxRecipe('Sand', [LORE_GUNPOWDER.replace('GUNPOWDER', 'SAND')]), shop, []).resultLabel).toBeUndefined();
            expect(processTrade(namedBoxRecipe('shulker box', [LORE_GUNPOWDER]), shop, []).resultLabel).toBeUndefined();
        });

        test('show their label in the cost column', () => {
            const paidWithBooks = { ...createTrade(1, 1, DIAMOND_TITLE, 1), item1: { type: 'SHULKER_BOX', name: 'silk touch', amount: 1, lore: ['- 1x ENCHANTED_BOOK'] } };
            expect(formatTradeCost(paidWithBooks)).toBe('1× Enchanted book “silk touch”');
            expect(filterTrade(paidWithBooks, '', '"silk touch"')).toBeDefined();
        });
    });

    describe('seller-named bundles', () => {
        const shop: Shop = { location: '0, 0, 0', world: MINECRAFT_OVERWORLD, recipes: [] };
        const cocaCola = processTrade(bundleRecipe('BLUE_BUNDLE', 'Coca-Cola'), shop, []);

        test('show as a bundle with the seller name as a label', () => {
            expect(cocaCola.resultName).toBe('Blue bundle');
            expect(cocaCola.resultLabel).toBe('Coca-Cola');
        });

        test('can be found as a bundle and by their name', () => {
            expect(filterTrade(cocaCola, 'bundle', '')).toBeDefined();
            expect(filterTrade(cocaCola, 'coca', '')).toBeDefined();
        });

        test('an unnamed bundle is just a bundle', () => {
            const plain = processTrade(bundleRecipe('BUNDLE', ''), shop, []);
            expect(plain.resultName).toBe('Bundle');
            expect(plain.resultLabel).toBeUndefined();
        });

        test('show their label in the cost column', () => {
            const paidWithArt = { ...createTrade(1, 1, DIAMOND_TITLE, 1), item1: { type: 'BUNDLE', name: 'Galaxy', amount: 1 } };
            expect(formatTradeCost(paidWithArt)).toBe('1× Bundle “Galaxy”');
            expect(filterTrade(paidWithArt, '', '"galaxy"')).toBeDefined();
        });
    });
});

describe('shulker box costs', () => {
    const cobbleShulker: Trade = {
        ...createTrade(3, 1, DIAMOND_TITLE, 41),
        item1: { type: 'SHULKER_BOX', name: '', amount: 1, lore: ['- 64x COBBLESTONE', '- 64x COBBLESTONE'] },
        costName: 'Shulker box',
        costText: 'shulker box cobblestone',
    };

    test('are shown as their contents', () => {
        expect(getCostParts(cobbleShulker)).toEqual([{ amount: 128, name: 'Cobblestone' }]);
        expect(formatTradeCost(cobbleShulker)).toBe('128× Cobblestone');
        const mixed = { ...cobbleShulker, item1: { ...cobbleShulker.item1, lore: ['- 64x COBBLESTONE', '- 10x SAND'] } };
        expect(formatTradeCostNames(mixed)).toBe('Shulker box (Cobblestone, Sand)');
    });

    test('can be found by their contents, also with an exact query', () => {
        expect(filterTrade(cobbleShulker, '', 'cobble')).toBeDefined();
        expect(filterTrade(cobbleShulker, '', '"cobblestone"')).toBeDefined();
        expect(filterTrade(cobbleShulker, '', '"stone"')).toBeUndefined();
    });

    test('add their contents to the shopping list totals', () => {
        const list = aggregateShoppingList([{ trade: cobbleShulker, quantity: 2 }]);
        expect(list.costs.get('Cobblestone')).toBe(256);
        expect(list.costs.has('Shulker box')).toBe(false);
    });
});
