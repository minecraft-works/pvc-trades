/**
 * Shared unit-test fixtures: trade/item builders and store setup.
 *
 * Test-only module: imported by `*.test.ts` files, never by application code.
 * Its name does not end in `.test.ts`, so Vitest does not collect it as a test file.
 *
 * @module test-fixtures
 */

import { beforeAll, vi } from 'vitest';

import { loadBaseItems, loadConfig, loadFixedRatios } from './stores/index.js';
import type { AppConfig, BlockConversions, Item, Recipe, Trade } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

const EMERALD = 'EMERALD';
const EMERALD_LOWER = 'emerald';
const EMERALD_TITLE = 'Emerald';
const ITEM = 'ITEM';
const OVERWORLD = 'overworld';
const EMERALD_BLOCK = 'emerald block';
const DIAMOND_LOWER = 'diamond';
const DIAMOND_BLOCK = 'diamond block';
const DIAMOND_BLOCK_TITLE = 'Diamond Block';
const GOLD_BLOCK = 'gold block';
const GOLD_INGOT = 'gold ingot';
const GOLD_BLOCK_TITLE = 'Gold Block';
const BLOCK_CONVERSIONS_JSON = 'block_conversions.json';
const CORE_CURRENCIES_JSON = 'core_currencies.json';
const CONFIG_JSON = 'config.json';

/**
 * Create an emerald-priced trade at the origin.
 * @param resultAmount - Items received per trade
 * @param costAmount - Emeralds paid per trade
 * @param resultName - Display name of the result item
 * @param stock - Number of trades in stock
 * @param world - World the shop is in
 * @returns The trade
 */
export const createTrade = (resultAmount: number, costAmount: number, resultName: string, stock: number, world = OVERWORLD): Trade => ({
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

/**
 * Create an unnamed item stack.
 * @param type - Item type, e.g. `EMERALD`
 * @param amount - Stack size
 * @returns The item
 */
export const plainItem = (type: string, amount: number): Item => ({ type, amount, name: '' });

/**
 * Create a recipe selling a named shulker box for 8 diamonds.
 * @param name - Custom name of the shulker box
 * @param lore - Lore lines of the shulker box
 * @returns The recipe
 */
export const namedBoxRecipe = (name: string, lore: readonly string[]): Readonly<Recipe> => ({
    resultItem: { type: 'SHULKER_BOX', amount: 1, name, lore },
    item1: { type: 'DIAMOND', name: '', amount: 8 },
    item2: undefined,
    stock: 2
});

const TEST_BLOCK_CONVERSIONS: Readonly<BlockConversions> = {
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

const TEST_CORE_BLOCKS: readonly string[] = [
    'Netherite Ingot',
    DIAMOND_BLOCK_TITLE,
    'Diamond',
    'Emerald Block',
    GOLD_BLOCK_TITLE,
    'Iron Block'
];

const TEST_CONFIG: Readonly<AppConfig> = {
    ...DEFAULT_CONFIG,
    dataUrl: 'https://test.example.com/data.json',
    squaremap: {
        ...DEFAULT_CONFIG.squaremap,
        baseUrl: 'https://test.example.com/maps'
    }
};

/**
 * Register `beforeAll` hooks that stub `fetch` with the test block conversions,
 * core blocks and config, then load them into the stores.
 * Call at the top level of a test file.
 */
export function setupTestStores(): void {
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
}
