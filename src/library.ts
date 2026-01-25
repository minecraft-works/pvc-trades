/**
 * Pure logic functions - no DOM dependencies
 * These can be imported and unit tested directly
 */

import {
    type AppConfig,
    type BlockConversions,
    type Item,
    type MappingRule,
    type Recipe,
    type Shop,
    type Trade,
    type FilterResult,
    type SortColumn,
    type SortDirection,
    type Coordinates,
    type PriceEntry,
    type ItemValueEntry,
    type ItemValues,
    type RatioGraph,
    type ShulkerItem,
    type ShulkerParseResult,
    type NormalizeResult,
    type TrustedValueOptions,
    type TradeInput,
    AppConfigSchema,
    BlockConversionsSchema,
    DEFAULT_CONFIG
} from './types.js';

// ============================================================================
// Configuration Store
// ============================================================================

class ConfigStore {
    private config: AppConfig = DEFAULT_CONFIG;
    private loaded = false;

    get(): AppConfig {
        return this.config;
    }

    isLoaded(): boolean {
        return this.loaded;
    }

    async load(): Promise<AppConfig> {
        try {
            const response = await fetch('config.json');
            if (!response.ok) {
                console.warn('Failed to load config, using defaults');
                return this.config;
            }
            const data: unknown = await response.json();
            const parsed = AppConfigSchema.safeParse(data);
            if (parsed.success) {
                this.config = parsed.data;
            } else {
                console.warn('Invalid config format, using defaults:', parsed.error);
            }
            this.loaded = true;
            return this.config;
        } catch (error) {
            console.warn('Error loading config, using defaults:', error);
            this.loaded = true;
            return this.config;
        }
    }

    // For testing purposes
    _setConfig(config: AppConfig): void {
        this.config = config;
        this.loaded = true;
    }
}

export const configStore = new ConfigStore();

// Convenience exports (delegate to store)

/**
 * Get the current application configuration.
 * Returns default config if not yet loaded.
 * 
 * @returns The current AppConfig object
 * 
 * @example
 * const config = getConfig();
 * console.log(config.dynmap.baseUrl);
 */
export function getConfig(): AppConfig {
    return configStore.get();
}

/**
 * Load application configuration from config.json.
 * Falls back to default config on error.
 * 
 * @returns Promise resolving to the loaded AppConfig
 * 
 * @example
 * await loadConfig();
 * const config = getConfig();
 */
export async function loadConfig(): Promise<AppConfig> {
    return configStore.load();
}

// ============================================================================
// Core Blocks Store
// ============================================================================

class CoreBlocksStore {
    private blocks: string[] = [];

    get(): string[] {
        return this.blocks;
    }

    async load(): Promise<string[]> {
        try {
            const response = await fetch('core_currencies.json');
            if (!response.ok) {
                console.warn('Failed to load base items, using defaults');
                return this.blocks;
            }
            const data: unknown = await response.json();
            if (Array.isArray(data) && data.every(item => typeof item === 'string')) {
                this.blocks = data;
            }
            return this.blocks;
        } catch (error) {
            console.warn('Error loading base items:', error);
            return this.blocks;
        }
    }

    // For testing purposes
    _setBlocks(blocks: string[]): void {
        this.blocks = blocks;
    }
}

export const coreBlocksStore = new CoreBlocksStore();

/**
 * Get the list of core currency blocks used for ratio calculations.
 * 
 * @returns Array of block names (e.g., ['Emerald Block', 'Diamond Block'])
 * 
 * @example
 * const coreBlocks = getCoreBlocks();
 * const isCoreBlock = coreBlocks.includes('Diamond Block');
 */
export function getCoreBlocks(): string[] {
    return coreBlocksStore.get();
}

/**
 * Load core currency blocks from core_currencies.json.
 * 
 * @returns Promise resolving to array of block names
 * 
 * @example
 * await loadBaseItems();
 * const blocks = getCoreBlocks();
 */
export async function loadBaseItems(): Promise<string[]> {
    return coreBlocksStore.load();
}

// ============================================================================
// Block Conversions Store
// ============================================================================

class BlockConversionsStore {
    private conversions: BlockConversions = {};

    get(): BlockConversions {
        return this.conversions;
    }

    async load(): Promise<BlockConversions> {
        try {
            const response = await fetch('block_conversions.json');
            if (!response.ok) {
                console.warn('Failed to load fixed ratios, using defaults');
                return this.conversions;
            }
            const data: unknown = await response.json();
            const parsed = BlockConversionsSchema.safeParse(data);
            if (parsed.success) {
                this.conversions = parsed.data;
            } else {
                console.warn('Invalid block conversions format:', parsed.error);
            }
            return this.conversions;
        } catch (error) {
            console.warn('Error loading block conversions:', error);
            return this.conversions;
        }
    }

    // For testing purposes
    _setConversions(conversions: BlockConversions): void {
        this.conversions = conversions;
    }
}

export const blockConversionsStore = new BlockConversionsStore();

/**
 * Load block-to-ingot conversion ratios from block_conversions.json.
 * Used for calculating block values from ingot values (e.g., Diamond Block = 9 Diamonds).
 * 
 * @returns Promise resolving to BlockConversions map
 * 
 * @example
 * await loadFixedRatios();
 * // Now blockConversionsStore contains { 'diamond block': { base: 'diamond', multiplier: 9 } }
 */
export async function loadFixedRatios(): Promise<BlockConversions> {
    return blockConversionsStore.load();
}

// ============================================================================
// Query Matching Functions
// ============================================================================

const normalizeCache = new Map<string, string>();

function normalize(s: string): string {
    const cached = normalizeCache.get(s);
    if (cached !== undefined) { return cached; }
    const result = s.replaceAll('_', ' ').replaceAll(' ', '');
    normalizeCache.set(s, result);
    return result;
}

/**
 * Check if text matches a search query with flexible matching.
 * Handles underscores, spaces, and word-order variations.
 * 
 * @param text - The text to search in
 * @param query - The search query
 * @returns true if text matches query
 * 
 * @example
 * matchesQuery('Diamond Pickaxe', 'diamond')     // true
 * matchesQuery('cooked_beef', 'cookedbeef')      // true
 * matchesQuery('Golden Apple', 'apple golden')  // true
 */
export function matchesQuery(text: string, query: string): boolean {
    const textNorm = normalize(text);
    const queryNorm = normalize(query);
    if (textNorm.includes(queryNorm)) { return true; }

    const words = query.replaceAll('_', ' ').split(/\s+/).filter(Boolean);
    return words.every(word => text.includes(word));
}

/**
 * Check if item enchantments match the required enchantments from a mapping rule.
 * Item may have extra enchants, but must have all required ones at correct levels.
 * 
 * @param itemEnchants - Enchantments on the item
 * @param ruleEnchants - Required enchantments from mapping rule
 * @returns true if all required enchants match
 * 
 * @example
 * enchantsMatch({ efficiency: 5, unbreaking: 3 }, { efficiency: 5 }) // true
 * enchantsMatch({ efficiency: 4 }, { efficiency: 5 })                // false
 */
export function enchantsMatch(
    itemEnchants: Record<string, number> | undefined,
    ruleEnchants: Record<string, number> | undefined
): boolean {
    if (!itemEnchants || !ruleEnchants) { return false; }
    for (const [key, value] of Object.entries(ruleEnchants)) {
        if (itemEnchants[key] !== value) { return false; }
    }
    return true;
}

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Format an item name for display (title case).
 * Uses item.name if present, otherwise formats item.type.
 * 
 * @param item - The item to format
 * @returns Formatted display name
 * 
 * @example
 * formatName({ type: 'DIAMOND_PICKAXE', name: '', amount: 1 }) // 'Diamond pickaxe'
 * formatName({ type: 'ITEM', name: 'Vote Diamond', amount: 1 }) // 'Vote diamond'
 */
export function formatName(item: Item): string {
    const text = item.name || item.type.replaceAll('_', ' ');
    if (!text) { return ''; }
    const lower = text.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Apply custom mapping rules to transform item types.
 * Used for special items like vote certificates or custom enchants.
 * Mutates the item in place.
 * 
 * @param item - The item to transform (mutated)
 * @param mappingRules - Array of mapping rules to check
 * 
 * @example
 * const item = { type: 'PAPER', name: '50 Votes Certificate', amount: 1 };
 * applyMapping(item, mappingRules);
 * // item.type might now be 'Vote Certificate'
 */
export function applyMapping(item: Item | undefined, mappingRules: MappingRule[]): void {
    if (!item) { return; }
    const type = item.type.replace('minecraft:', '').toUpperCase();

    for (const rule of mappingRules) {
        if (rule.item !== type) { continue; }
        if (rule.originalName && item.name !== rule.originalName) { continue; }
        if (rule.enchant && !enchantsMatch(item.enchant, rule.enchant)) { continue; }

        item.type = rule.customName;
        item.name = '';
        return;
    }
}

/**
 * Create a flexible regex from a search pattern.
 * Supports wildcards (*) and flexible spacing (underscores, spaces, no separator).
 * 
 * @param pattern - Search pattern with optional wildcards
 * @returns RegExp for matching
 * 
 * @example
 * getRegex('diamond*').test('Diamond Pickaxe')  // true
 * getRegex('cooked').test('cooked_beef')        // true
 */
export function getRegex(pattern: string): RegExp {
    const withPlaceholder = pattern.replaceAll('*', '\u0000');
    const escaped = withPlaceholder.replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`);
    const chars = [...escaped];
    const flexible = chars.join('[_ ]*');
    return new RegExp(flexible.replaceAll('\u0000', '.*'), 'i');
}

// ============================================================================
// Shulker Box Parsing
// ============================================================================

/**
 * Parse shulker box lore to extract contained items and quantities.
 * 
 * @param lore - Array of lore lines from shulker box item
 * @returns Parsed result with items array and default display values
 * 
 * @example
 * parseShulkerContents(['- 64x DIAMOND', '- 32x GOLD_INGOT'])
 * // { items: [{key: 'diamond', name: 'Diamond', total: 64}, ...], defaultName: 'Diamond', defaultTotal: 64 }
 */
export function parseShulkerContents(lore: string[]): ShulkerParseResult {
    const counts: Record<string, number> = {};
    const shulkerRegex = /-\s*(\d+)x\s+(.+)/i;
    for (const line of lore) {
        const match = shulkerRegex.exec(line);
        if (match && match[1] && match[2]) {
            const amt = Number.parseInt(match[1], 10);
            const item = match[2].trim();
            counts[item] = (counts[item] || 0) + amt;
        }
    }

    const items: ShulkerItem[] = Object.entries(counts).map(([key, total]) => {
        const formatted = key.replaceAll('_', ' ').toLowerCase();
        return {
            key: key.toLowerCase(),
            name: formatted.charAt(0).toUpperCase() + formatted.slice(1),
            total
        };
    });

    items.sort((a, b) => b.total - a.total);

    if (items.length === 0) {
        return { items: [], defaultName: 'Shulker box', defaultTotal: 1 };
    }

    const firstItem = items[0]!;
    return { items, defaultName: firstItem.name, defaultTotal: firstItem.total };
}

// ============================================================================
// HTML Utilities
// ============================================================================

const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

/**
 * Escape special HTML characters to prevent XSS.
 * 
 * @param text - Raw text to escape
 * @returns HTML-safe string
 * 
 * @example
 * escapeHtml('<script>alert(1)</script>') // '&lt;script&gt;alert(1)&lt;/script&gt;'
 */
export function escapeHtml(text: string): string {
    return text.replaceAll(/[&<>"']/g, c => HTML_ESCAPE_MAP[c] ?? c);
}

/**
 * Highlight matching text with <mark> tags.
 * Text is HTML-escaped before highlighting.
 * 
 * @param text - Text to highlight in
 * @param regex - Pattern to match and highlight
 * @returns HTML string with matches wrapped in <mark>
 * 
 * @example
 * highlight('Diamond Pickaxe', /diamond/i) // '<mark>Diamond</mark> Pickaxe'
 */
export function highlight(text: string, regex: RegExp): string {
    const escaped = escapeHtml(text);
    return escaped.replace(regex, m => `<mark>${m}</mark>`);
}

// ============================================================================
// Location & Distance Functions
// ============================================================================

/**
 * Parse a location string into coordinates.
 * 
 * @param location - Comma-separated coordinate string "x, y, z"
 * @returns Coordinates object with x, y, z
 * 
 * @example
 * parseLocation('100, 64, -200') // { x: 100, y: 64, z: -200 }
 */
export function parseLocation(location: string): Coordinates {
    const coords = location.split(', ');
    return {
        x: Number.parseFloat(coords[0] ?? '0') || 0,
        y: Number.parseFloat(coords[1] ?? '0') || 0,
        z: Number.parseFloat(coords[2] ?? '0') || 0
    };
}

// ============================================================================
// Trade Processing
// ============================================================================

/**
 * Process a raw shop recipe into a normalized Trade object.
 * Applies mapping rules and handles shulker box contents.
 * 
 * @param recipe - Raw recipe from shop data
 * @param shop - Shop containing the recipe (for location/world)
 * @param mappingRules - Custom item mapping rules
 * @returns Normalized Trade object
 * 
 * @example
 * const trade = processTrade(recipe, shop, mappingRules);
 * console.log(trade.resultName, trade.costName, trade.x, trade.z);
 */
export function processTrade(recipe: Recipe, shop: Shop, mappingRules: MappingRule[]): Trade {
    const { x, y, z } = parseLocation(shop.location);
    const world = shop.world.replace('minecraft:', '');

    applyMapping(recipe.resultItem, mappingRules);
    applyMapping(recipe.item1, mappingRules);
    if (recipe.item2) { applyMapping(recipe.item2, mappingRules); }

    const lore = recipe.resultItem.lore || [];
    let resultName: string;
    let resultAmount: number;
    let loreText = '';
    let isShulker = false;
    let shulkerItems: ShulkerItem[] | undefined = undefined;

    if (lore.length > 0 && recipe.resultItem.type.includes('SHULKER')) {
        const parsed = parseShulkerContents(lore);
        resultName = parsed.defaultName;
        resultAmount = parsed.defaultTotal;
        shulkerItems = parsed.items;
        loreText = lore.join(' ').toLowerCase();
        isShulker = true;
    } else {
        resultName = formatName(recipe.resultItem);
        resultAmount = recipe.resultItem.amount;
    }

    const costName = formatName(recipe.item1) + (recipe.item2 ? ' ' + formatName(recipe.item2) : '');
    const displayStock = isShulker ? recipe.stock * resultAmount : recipe.stock;

    return {
        x, y, z, world,
        item1: recipe.item1,
        item2: recipe.item2,
        resultItem: recipe.resultItem,
        stock: recipe.stock,
        displayStock,
        resultText: resultName.toLowerCase(),
        costText: costName.toLowerCase(),
        loreText,
        shulkerItems,
        resultName,
        resultAmount,
        costName
    };
}

// ============================================================================
// Trade Filtering
// ============================================================================

interface ShulkerMatchResult {
    matched: boolean;
    name: string;
    amount: number;
}

function findMatchingShulkerItem(
    shulkerItems: ShulkerItem[] | undefined,
    query: string
): ShulkerMatchResult | undefined {
    if (!shulkerItems) { return undefined; }
    const matched = shulkerItems.find(item =>
        matchesQuery(item.key, query) || matchesQuery(item.name.toLowerCase(), query)
    );
    if (matched) {
        return { matched: true, name: matched.name, amount: matched.total };
    }
    return undefined;
}

function checkWantQueryMatch(
    trade: Trade,
    wantQuery: string
): { matchResult: boolean; displayName: string; displayAmount: number } {
    if (!wantQuery) {
        return { matchResult: true, displayName: trade.resultName, displayAmount: trade.resultAmount };
    }
    if (matchesQuery(trade.resultText, wantQuery)) {
        return { matchResult: true, displayName: trade.resultName, displayAmount: trade.resultAmount };
    }
    const shulkerMatch = findMatchingShulkerItem(trade.shulkerItems, wantQuery);
    if (shulkerMatch) {
        return { matchResult: true, displayName: shulkerMatch.name, displayAmount: shulkerMatch.amount };
    }
    return { matchResult: false, displayName: trade.resultName, displayAmount: trade.resultAmount };
}

/**
 * Filter a trade based on "want" (result) and "give" (cost) queries.
 * Returns undefined if trade doesn't match or has zero stock.
 * 
 * @param trade - Trade to filter
 * @param wantQuery - Filter for items you want to receive (empty = any)
 * @param giveQuery - Filter for items you give away (empty = any)
 * @returns FilterResult if matches, undefined otherwise
 * 
 * @example
 * const result = filterTrade(trade, 'diamond', 'emerald');
 * if (result) console.log(result.displayName, result.displayAmount);
 */
export function filterTrade(trade: Trade, wantQuery: string, giveQuery: string): FilterResult | undefined {
    if (trade.stock === 0) { return undefined; }

    const { matchResult, displayName, displayAmount } = checkWantQueryMatch(trade, wantQuery);
    const matchCost = giveQuery ? matchesQuery(trade.costText, giveQuery) : true;

    if (wantQuery && !matchResult) { return undefined; }
    if (giveQuery && !matchCost) { return undefined; }

    return {
        trade,
        matchResult: Boolean(wantQuery && matchResult),
        matchCost: Boolean(giveQuery && matchCost),
        displayName,
        displayAmount
    };
}

// ============================================================================
// Sorting
// ============================================================================

/**
 * Sort filter results by a specified column and direction.
 * Mutates and returns the array.
 * 
 * @param results - Array of filter results to sort
 * @param column - Column to sort by ('result-amt', 'cost-name', 'stock', etc.)
 * @param direction - 'asc' or 'desc'
 * @returns The sorted array (same reference)
 * 
 * @example
 * sortResults(results, 'result-amt', 'desc'); // Sort by amount descending
 */
export function sortResults(
    results: FilterResult[],
    column: SortColumn,
    direction: SortDirection
): FilterResult[] {
    const sortDirection = direction === 'asc' ? 1 : -1;

    results.sort((a, b) => {
        const tradeA = a.trade;
        const tradeB = b.trade;
        let valueA: number;
        let valueB: number;

        switch (column) {
            case 'cost-amt': {
                valueA = tradeA.item1.amount + (tradeA.item2?.amount || 0);
                valueB = tradeB.item1.amount + (tradeB.item2?.amount || 0);
                break;
            }
            case 'cost-name': {
                return sortDirection * tradeA.costName.localeCompare(tradeB.costName);
            }
            case 'result-amt': {
                valueA = tradeA.resultAmount;
                valueB = tradeB.resultAmount;
                break;
            }
            case 'result-name': {
                return sortDirection * tradeA.resultName.localeCompare(tradeB.resultName);
            }
            case 'stock': {
                valueA = tradeA.displayStock;
                valueB = tradeB.displayStock;
                break;
            }
            case 'world': {
                return sortDirection * tradeA.world.localeCompare(tradeB.world);
            }
            case 'distance': {
                valueA = Math.hypot(tradeA.x, tradeA.z);
                valueB = Math.hypot(tradeB.x, tradeB.z);
                break;
            }
            default: {
                return 0;
            }
        }
        return sortDirection * (valueA - valueB);
    });

    return results;
}

// ============================================================================
// Ratio Graph
// ============================================================================

function addRatioToGraph(graph: RatioGraph, from: string, to: string, ratio: number): void {
    if (!Number.isFinite(ratio) || ratio <= 0) { return; }
    const key = `${from.toLowerCase()}->${to.toLowerCase()}`;
    const reverseKey = `${to.toLowerCase()}->${from.toLowerCase()}`;

    if (!graph.has(key)) {
        graph.set(key, ratio);
        graph.set(reverseKey, 1 / ratio);
    }
}

function buildEmeraldValuesFromTrades(itemValues: ItemValues): Map<string, number> {
    const emeraldValues = new Map<string, number>();

    for (const [key, entry] of itemValues.entries()) {
        const medianBuy = median(entry.buyPrices);
        const medianSell = median(entry.sellPrices);
        const value = medianBuy !== undefined && medianSell !== undefined
            ? (medianBuy + medianSell) / 2
            : medianBuy ?? medianSell;
        if (value !== undefined) {
            emeraldValues.set(key, value);
        }
    }

    emeraldValues.set('emerald', 1);
    return emeraldValues;
}

function addBlockConversionValues(
    emeraldValues: Map<string, number>,
    blockConversions: BlockConversions
): void {
    for (const [blockName, { base, multiplier }] of Object.entries(blockConversions)) {
        const baseValue = emeraldValues.get(base.toLowerCase());
        if (baseValue !== undefined) {
            emeraldValues.set(blockName.toLowerCase(), baseValue * multiplier);
        }
    }
}

function calculateCoreBlockRatios(
    graph: RatioGraph,
    coreBlocksLower: string[],
    emeraldValues: Map<string, number>
): void {
    for (const blockA of coreBlocksLower) {
        const valueA = emeraldValues.get(blockA);
        if (valueA === undefined) { continue; }

        for (const blockB of coreBlocksLower) {
            if (blockA === blockB) { continue; }
            const valueB = emeraldValues.get(blockB);
            if (valueB === undefined) { continue; }

            addRatioToGraph(graph, blockA, blockB, valueA / valueB);
        }
    }
}

/**
 * Build a ratio graph for the core blocks
 * Combines: fixed ratios (block↔ingot), shop trades, and transitive deductions
 * Returns: Map of "itemA->itemB" => ratio (1 itemA = ratio itemB)
 */
export function buildRatioGraph(itemValues: ItemValues): RatioGraph {
    const graph: RatioGraph = new Map();
    const coreBlocks = coreBlocksStore.get();
    const blockConversions = blockConversionsStore.get();
    const coreBlocksLower = coreBlocks.map(b => b.toLowerCase());

    const emeraldValues = buildEmeraldValuesFromTrades(itemValues);
    addBlockConversionValues(emeraldValues, blockConversions);
    calculateCoreBlockRatios(graph, coreBlocksLower, emeraldValues);

    return graph;
}

/**
 * Get the ratio between two items from the ratio graph
 * Returns undefined if no path exists
 */
export function getRatio(graph: RatioGraph, from: string, to: string): number | undefined {
    const key = `${from.toLowerCase()}->${to.toLowerCase()}`;
    return graph.get(key);
}

// ============================================================================
// Item Value Calculation
// ============================================================================

function normalizeToBaseCurrency(
    itemName: string,
    amount: number,
    baseCurrency: string
): NormalizeResult {
    const blockConversions = blockConversionsStore.get();
    const itemNorm = itemName.toLowerCase();
    const baseNorm = baseCurrency.toLowerCase();

    // Direct match
    if (itemNorm === baseNorm) {
        return { matches: true, amount };
    }

    // Check if item is a block version of base currency
    const blockInfo = blockConversions[itemNorm];
    if (blockInfo && blockInfo.base.toLowerCase() === baseNorm) {
        return { matches: true, amount: amount * blockInfo.multiplier };
    }

    // Check if base is a block and item is its single version
    const baseBlockInfo = blockConversions[baseNorm];
    if (baseBlockInfo && baseBlockInfo.base.toLowerCase() === itemNorm) {
        return { matches: true, amount: amount / baseBlockInfo.multiplier };
    }

    return { matches: false, amount };
}

// eslint-disable-next-line max-params
function addValue(
    values: ItemValues,
    item: string,
    price: number,
    type: 'buy' | 'sell',
    x: number,
    y: number,
    z: number
): void {
    const key = item.toLowerCase();
    if (!values.has(key)) {
        values.set(key, { name: item, buyPrices: [], sellPrices: [] });
    }
    const entry = values.get(key)!;
    const priceObject: PriceEntry = { price, x, y, z };
    if (type === 'buy') {
        entry.buyPrices.push(priceObject);
    } else {
        entry.sellPrices.push(priceObject);
    }
}

function processDirectTrade(
    trade: TradeInput,
    baseCurrency: string,
    values: ItemValues
): void {
    const costAsBase = normalizeToBaseCurrency(trade.costName, trade.costAmount, baseCurrency);
    const resultAsBase = normalizeToBaseCurrency(trade.resultName, trade.resultAmount, baseCurrency);

    if (costAsBase.matches === resultAsBase.matches) { return; }

    if (costAsBase.matches) {
        const pricePerItem = costAsBase.amount / trade.resultAmount;
        addValue(values, trade.resultName, pricePerItem, 'buy', trade.x, trade.y, trade.z);
    } else if (resultAsBase.matches) {
        const pricePerItem = resultAsBase.amount / trade.costAmount;
        addValue(values, trade.costName, pricePerItem, 'sell', trade.x, trade.y, trade.z);
    }
}

function deriveTransitiveValue(
    trade: TradeInput,
    baseCurrency: string,
    values: ItemValues
): boolean {
    const costKey = trade.costName.toLowerCase();
    const resultKey = trade.resultName.toLowerCase();

    const costIsBase = normalizeToBaseCurrency(trade.costName, 1, baseCurrency).matches;
    const resultIsBase = normalizeToBaseCurrency(trade.resultName, 1, baseCurrency).matches;
    if (costIsBase || resultIsBase) { return false; }

    const costEntry = values.get(costKey);
    const resultEntry = values.get(resultKey);
    let changed = false;

    if (costEntry && !resultEntry) {
        const costValue = getTrustedItemValue(trade.costName, values);
        if (costValue !== undefined) {
            const pricePerResult = (trade.costAmount * costValue) / trade.resultAmount;
            addValue(values, trade.resultName, pricePerResult, 'buy', trade.x, trade.y, trade.z);
            changed = true;
        }
    }

    if (resultEntry && !costEntry) {
        const resultValue = getTrustedItemValue(trade.resultName, values);
        if (resultValue !== undefined) {
            const pricePerCost = (trade.resultAmount * resultValue) / trade.costAmount;
            addValue(values, trade.costName, pricePerCost, 'sell', trade.x, trade.y, trade.z);
            changed = true;
        }
    }

    return changed;
}

/**
 * Calculate item values in emeralds using trades and transitive derivation.
 * Iteratively expands knowledge by using known values as intermediaries.
 * 
 * @param trades - Array of processed trades
 * @param baseCurrency - Base currency name (usually 'Emerald')
 * @returns Map of item names to value entries with buy/sell prices
 * 
 * @example
 * const values = calculateItemValues(trades, 'Emerald');
 * const diamondValue = getTrustedItemValue('Diamond', values);
 */
export function calculateItemValues(trades: TradeInput[], baseCurrency: string): ItemValues {
    const config = configStore.get();
    const values: ItemValues = new Map();

    // Phase 1: Direct trades with base currency
    for (const trade of trades) {
        if (trade.item2) { continue; }
        processDirectTrade(trade, baseCurrency, values);
    }

    // Phase 2: Extend using known item values as intermediaries
    let changed = true;
    let iterations = 0;

    while (changed && iterations < config.analysis.maxTransitiveIterations) {
        changed = false;
        iterations++;

        for (const trade of trades) {
            if (trade.item2) { continue; }
            if (deriveTransitiveValue(trade, baseCurrency, values)) {
                changed = true;
            }
        }
    }

    return values;
}

// ============================================================================
// Statistical Functions
// ============================================================================

/**
 * Calculate median of price values.
 * Handles both PriceEntry objects and raw numbers.
 * 
 * @param array - Array of price entries or numbers
 * @returns Median value, or undefined for empty array
 * 
 * @example
 * median([10, 20, 30])           // 20
 * median([{price: 10}, {price: 20}]) // 15
 * median([])                     // undefined
 */
export function median(array: PriceEntry[] | number[]): number | undefined {
    if (array.length === 0) { return undefined; }
    const prices = array.map(p => typeof p === 'object' ? p.price : p);
    const sorted = prices.toSorted((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) {
        return sorted[mid]!;
    }
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Count independent shops (shops > shopClusterDistance blocks apart).
 * Prevents a single mega-shop from dominating price calculations.
 * 
 * @param priceArray - Array of prices with coordinates
 * @returns Number of independent shop clusters
 * 
 * @example
 * // Two shops 100 blocks apart = 2 independent shops
 * countIndependentShops([{price: 10, x: 0, y: 64, z: 0}, {price: 12, x: 100, y: 64, z: 0}]) // 2
 */
export function countIndependentShops(priceArray: PriceEntry[]): number {
    const config = configStore.get();
    if (priceArray.length === 0) { return 0; }

    const locations = priceArray.map(p => ({ x: p.x, y: p.y, z: p.z }));

    if (locations.length === 0) { return priceArray.length; }

    const clusters: Coordinates[] = [];
    for (const loc of locations) {
        let foundCluster = false;
        for (const cluster of clusters) {
            const distribution = Math.hypot(loc.x - cluster.x, loc.y - cluster.y, loc.z - cluster.z);
            if (distribution <= config.analysis.shopClusterDistance) {
                foundCluster = true;
                break;
            }
        }
        if (!foundCluster) {
            clusters.push(loc);
        }
    }
    return clusters.length;
}

/**
 * Check if an item has enough independent shops for its data to be trusted.
 * For core blocks, requires >= minShops to prevent single-source manipulation.
 * 
 * @param entry - Item value entry with buy/sell prices
 * @param minShops - Minimum required independent shops (default from config)
 * @returns true if enough independent data exists
 * 
 * @example
 * if (hasEnoughIndependentData(entry, 3)) {
 *     // Safe to use market price
 * } else {
 *     // Fall back to crafting value
 * }
 */
export function hasEnoughIndependentData(entry: ItemValueEntry, minShops?: number): boolean {
    const config = configStore.get();
    const threshold = minShops ?? config.analysis.minIndependentShops;
    const buyIndependent = countIndependentShops(entry.buyPrices);
    const sellIndependent = countIndependentShops(entry.sellPrices);
    return Math.max(buyIndependent, sellIndependent) >= threshold;
}

function getMedianValue(
    buyPrices: PriceEntry[],
    sellPrices: PriceEntry[]
): number | undefined {
    const buy = median(buyPrices);
    const sell = median(sellPrices);
    if (buy !== undefined && sell !== undefined) { return (buy + sell) / 2; }
    return buy ?? sell;
}

function getDirectTradeValue(
    entry: ItemValueEntry | undefined,
    isCoreBlock: boolean,
    minShops: number
): number | undefined {
    if (!entry) { return undefined; }
    if (isCoreBlock && !hasEnoughIndependentData(entry, minShops)) { return undefined; }
    return getMedianValue(entry.buyPrices, entry.sellPrices);
}

function getBlockConversionValue(
    itemKey: string,
    itemValues: ItemValues,
    blockConversions: BlockConversions,
    isCoreBlock: boolean,
    minShops: number
): number | undefined {
    const blockInfo = blockConversions[itemKey];
    if (!blockInfo) { return undefined; }

    const baseEntry = itemValues.get(blockInfo.base.toLowerCase());
    if (!baseEntry) { return undefined; }
    if (isCoreBlock && !hasEnoughIndependentData(baseEntry, minShops)) { return undefined; }

    const baseValue = getMedianValue(baseEntry.buyPrices, baseEntry.sellPrices);
    if (baseValue === undefined) { return undefined; }
    return baseValue * blockInfo.multiplier;
}

function getReverseConversionValue(
    itemKey: string,
    itemValues: ItemValues,
    blockConversions: BlockConversions,
    isCoreBlock: boolean,
    minShops: number
): number | undefined {
    for (const [blockKey, conversion] of Object.entries(blockConversions)) {
        if (conversion.base.toLowerCase() !== itemKey) { continue; }

        const blockEntry = itemValues.get(blockKey);
        if (!blockEntry) { continue; }
        if (isCoreBlock && !hasEnoughIndependentData(blockEntry, minShops)) { continue; }

        const blockValue = getMedianValue(blockEntry.buyPrices, blockEntry.sellPrices);
        if (blockValue !== undefined) {
            return blockValue / conversion.multiplier;
        }
    }
    return undefined;
}

/**
 * Get trusted emerald value for an item.
 * For core blocks, requires >= minShops independent shops.
 * Falls back to block conversions (e.g., Diamond Block = 9 × Diamond value).
 * 
 * @param itemName - Item name to look up
 * @param itemValues - Map of item values from calculateItemValues
 * @param options - Optional settings like minShops threshold
 * @returns Emerald value per item, or undefined if untrusted
 * 
 * @example
 * const value = getTrustedItemValue('Diamond', itemValues);
 * if (value) console.log(`1 Diamond = ${value} Emeralds`);
 */
export function getTrustedItemValue(
    itemName: string,
    itemValues: ItemValues,
    options: TrustedValueOptions = {}
): number | undefined {
    const { minShops = 3 } = options;
    const blockConversions = blockConversionsStore.get();
    const coreBlocks = coreBlocksStore.get();
    const itemKey = itemName.toLowerCase();

    // Emerald is always 1
    if (itemKey === 'emerald') { return 1; }
    if (itemKey === 'emerald block') { return 9; }

    const coreBlocksLower = coreBlocks.map(b => b.toLowerCase());
    const isCoreBlock = coreBlocksLower.includes(itemKey);

    // Try direct value from trades
    const directValue = getDirectTradeValue(itemValues.get(itemKey), isCoreBlock, minShops);
    if (directValue !== undefined) { return directValue; }

    // Try block conversion (block = ingot × multiplier)
    const conversionValue = getBlockConversionValue(itemKey, itemValues, blockConversions, isCoreBlock, minShops);
    if (conversionValue !== undefined) { return conversionValue; }

    // Try reverse conversion (ingot from block)
    return getReverseConversionValue(itemKey, itemValues, blockConversions, isCoreBlock, minShops);
}

// ============================================================================
// Map Utilities
// ============================================================================

/**
 * Check if a world name represents the Nether dimension.
 * 
 * @param world - World name (e.g., 'world_nether', 'minecraft:the_nether')
 * @returns true if world is the Nether
 * 
 * @example
 * isNether('world_nether')        // true
 * isNether('minecraft:the_nether') // true
 * isNether('world')               // false
 */
export function isNether(world: string): boolean {
    return world.toLowerCase().includes('nether');
}

/**
 * Generate a unique key for a trade based on coordinates and items.
 * Used for cart persistence and navigation progress tracking.
 * 
 * @param trade - Trade with location and item info
 * @returns Unique string key
 * 
 * @example
 * getTradeKey(trade) // '100,64,-200,overworld,Diamond,Emerald'
 */
export function getTradeKey(trade: { x: number; y: number; z: number; world: string; costName: string; resultName: string }): string {
    return `${trade.x},${trade.y},${trade.z},${trade.world},${trade.resultName},${trade.costName}`;
}

/**
 * Get world ID for tile URLs from world name.
 * Normalizes various Minecraft world name formats to tile path names.
 * 
 * @param world - World name in any format
 * @returns Normalized world ID ('overworld', 'the_nether', or 'the_end')
 * 
 * @example
 * getWorldId('world')              // 'overworld'
 * getWorldId('minecraft:the_nether') // 'the_nether'
 * getWorldId('world_the_end')      // 'the_end'
 */
export function getWorldId(world: string): string {
    const lower = world.toLowerCase();
    if (lower.includes('nether')) {
        return 'the_nether';
    }
    if (lower.includes('end')) {
        return 'the_end';
    }
    return 'overworld';
}

/**
 * Determine if the navigation map should switch to a different world.
 * 
 * @param previousWorld - The world the player was in before (normalized)
 * @param currentWorld - The world the player is now in (normalized)
 * @param currentMapWorld - The world the map is currently showing (normalized)
 * @param shopsInCurrentWorld - Number of uncompleted shops in the player's current world
 * @returns true if the map should switch to show the player's current world
 */
export function shouldSwitchMapWorld(
    previousWorld: string | undefined,
    currentWorld: string,
    currentMapWorld: string,
    shopsInCurrentWorld: number
): boolean {
    // No previous position - can't determine if world changed
    if (!previousWorld) {
        return false;
    }
    
    // Player didn't change worlds
    if (previousWorld === currentWorld) {
        return false;
    }
    
    // Map is already showing the player's current world
    if (currentWorld === currentMapWorld) {
        return false;
    }
    
    // Player changed worlds AND map is showing different world AND there are shops in player's world
    return shopsInCurrentWorld > 0;
}

/**
 * Calculate which tile contains the given Minecraft coordinates.
 * 
 * @param x - Minecraft X coordinate
 * @param z - Minecraft Z coordinate
 * @param tileSize - Size of tiles in blocks (default 512)
 * @returns Tile coordinates { tileX, tileZ }
 * 
 * @example
 * getTileCoords(600, -100) // { tileX: 1, tileZ: -1 }
 */
export function getTileCoords(x: number, z: number, tileSize: number = 512): { tileX: number; tileZ: number } {
    return {
        tileX: Math.floor(x / tileSize),
        tileZ: Math.floor(z / tileSize)
    };
}

/**
 * Calculate offset within a tile (0 to tileSize-1).
 * 
 * @param x - Minecraft X coordinate
 * @param z - Minecraft Z coordinate
 * @param tileSize - Size of tiles in blocks (default 512)
 * @returns Offset within tile { offsetX, offsetZ }
 * 
 * @example
 * getTileOffset(600, -100, 512) // { offsetX: 88, offsetZ: 412 }
 */
export function getTileOffset(x: number, z: number, tileSize: number = 512): { offsetX: number; offsetZ: number } {
    const { tileX, tileZ } = getTileCoords(x, z, tileSize);
    return {
        offsetX: x - tileX * tileSize,
        offsetZ: z - tileZ * tileSize
    };
}

/**
 * Calculate Leaflet zoom level needed to fit content in a container.
 * Uses CRS.Simple formula: pixels = units × 2^zoom
 * 
 * @param containerSize - Container size in pixels
 * @param contentSize - Content size in coordinate units
 * @returns Zoom level (can be fractional)
 * 
 * @example
 * calculateFitZoom(800, 512) // ~0.64 (content slightly smaller than container)
 */
export function calculateFitZoom(containerSize: number, contentSize: number): number {
    return Math.log2(containerSize / contentSize);
}

/**
 * Convert Minecraft coordinates to Leaflet CRS.Simple latLng.
 * In CRS.Simple, lat = -z (inverted), lng = x.
 * 
 * @param x - Minecraft X coordinate
 * @param z - Minecraft Z coordinate
 * @param tileSize - Tile size for offset calculation
 * @returns Leaflet-compatible { lat, lng }
 * 
 * @example
 * toLeafletCoords(100, 200) // { lat: -200 % 512, lng: 100 % 512 }
 */
export function toLeafletCoords(
    x: number,
    z: number,
    tileSize: number = 512
): { lat: number; lng: number } {
    const { offsetX, offsetZ } = getTileOffset(x, z, tileSize);
    return {
        lat: -offsetZ,  // Invert Z for screen coords (negative = down)
        lng: offsetX
    };
}

/**
 * Convert Minecraft world coordinates to Leaflet coords relative to a center tile.
 * Used for placing markers (like players) relative to a shop's tile.
 */
export function toLeafletCoordsRelative(
    x: number,
    z: number,
    centerTileX: number,
    centerTileZ: number,
    tileSize: number = 512
): { lat: number; lng: number } {
    // Calculate the block offset from the center tile's origin
    const centerOriginX = centerTileX * tileSize;
    const centerOriginZ = centerTileZ * tileSize;
    
    const relativeX = x - centerOriginX;
    const relativeZ = z - centerOriginZ;
    
    return {
        lat: -relativeZ,  // Invert Z for screen coords
        lng: relativeX
    };
}

/**
 * Convert Leaflet coords back to Minecraft world coordinates relative to a center tile.
 * Inverse of toLeafletCoordsRelative.
 */
export function fromLeafletCoordsRelative(
    lat: number,
    lng: number,
    centerTileX: number,
    centerTileZ: number,
    tileSize: number = 512
): { x: number; z: number } {
    const centerOriginX = centerTileX * tileSize;
    const centerOriginZ = centerTileZ * tileSize;
    
    return {
        x: Math.round(lng + centerOriginX),
        z: Math.round(-lat + centerOriginZ)  // Invert back from screen coords
    };
}

/**
 * Clamp a point to the edge of a circle if it's outside.
 * Returns the original point if inside, or the nearest point on the circle edge if outside.
 * 
 * @param lat - Latitude (y coordinate)
 * @param lng - Longitude (x coordinate) 
 * @param centerLat - Circle center latitude
 * @param centerLng - Circle center longitude
 * @param radius - Circle radius in coordinate units
 * @returns The clamped coordinates and whether the point was outside
 */
export function clampToCircle(
    lat: number,
    lng: number,
    centerLat: number,
    centerLng: number,
    radius: number
): { lat: number; lng: number; clamped: boolean } {
    const dx = lng - centerLng;
    const dy = lat - centerLat;
    const distance = Math.hypot(dx, dy);
    
    if (distance <= radius) {
        return { lat, lng, clamped: false };
    }
    
    // Normalize and scale to circle edge
    const scale = radius / distance;
    return {
        lat: centerLat + dy * scale,
        lng: centerLng + dx * scale,
        clamped: true
    };
}

// ============================================================================
// Route Optimization (TSP)
// ============================================================================

/**
 * A point with coordinates and world (for nether conversion)
 */
export interface RoutePoint {
    x: number;
    z: number;
    world: string;
}

/**
 * Convert coordinates to overworld-equivalent for distance calculation.
 * Nether coordinates are multiplied by 8 (1 nether block = 8 overworld blocks).
 * 
 * @param x - X coordinate
 * @param z - Z coordinate
 * @param world - World name
 * @returns Overworld-equivalent coordinates
 * 
 * @example
 * toOverworldEquivalent(100, 50, 'the_nether')  // { x: 800, z: 400 }
 * toOverworldEquivalent(100, 50, 'overworld')   // { x: 100, z: 50 }
 */
export function toOverworldEquivalent(x: number, z: number, world: string): { x: number; z: number } {
    if (world.toLowerCase().includes('nether')) {
        return { x: x * 8, z: z * 8 };
    }
    return { x, z };
}

/**
 * Calculate distance between two points in overworld-equivalent coordinates.
 * Automatically converts nether coordinates for accurate cross-world distances.
 * 
 * @param x1 - First point X
 * @param z1 - First point Z
 * @param world1 - First point world
 * @param x2 - Second point X
 * @param z2 - Second point Z
 * @param world2 - Second point world
 * @returns Distance in overworld blocks
 * 
 * @example
 * // Same-world distance
 * calculateRouteDistance(0, 0, 'overworld', 100, 100, 'overworld') // ~141.4
 * 
 * // Cross-world: nether point at (100, 100) = overworld (800, 800)
 * calculateRouteDistance(0, 0, 'overworld', 100, 100, 'the_nether') // ~1131.4
 */
// eslint-disable-next-line max-params
export function calculateRouteDistance(
    x1: number, z1: number, world1: string,
    x2: number, z2: number, world2: string
): number {
    const p1 = toOverworldEquivalent(x1, z1, world1);
    const p2 = toOverworldEquivalent(x2, z2, world2);
    return Math.hypot(p1.x - p2.x, p1.z - p2.z);
}

/**
 * Build distance matrix for route optimization.
 * Index 0 is the origin; indices 1-n are the points.
 * 
 * @param points - Array of route points to visit
 * @param origin - Starting position (defaults to 0,0 in overworld)
 * @returns 2D matrix where matrix[i][j] = distance from i to j
 * 
 * @example
 * const matrix = buildDistanceMatrix(shops, playerPosition);
 * // matrix[0][1] = distance from player to first shop
 * // matrix[1][2] = distance from first shop to second shop
 */
export function buildDistanceMatrix(points: RoutePoint[], origin?: RoutePoint): number[][] {
    const n = points.length + 1; // +1 for origin
    const matrix: number[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
    
    const originX = origin?.x ?? 0;
    const originZ = origin?.z ?? 0;
    const originWorld = origin?.world ?? 'overworld';
    
    // Origin is at index 0
    for (const [index, point_] of points.entries()) {
        const point = point_!;
        const distributionFromOrigin = calculateRouteDistance(originX, originZ, originWorld, point.x, point.z, point.world);
        matrix[0]![index + 1] = distributionFromOrigin;
        matrix[index + 1]![0] = distributionFromOrigin;
    }
    
    // Distances between points
    for (let index = 0; index < points.length; index++) {
        for (let index_ = index + 1; index_ < points.length; index_++) {
            const a = points[index]!;
            const b = points[index_]!;
            const distribution = calculateRouteDistance(a.x, a.z, a.world, b.x, b.z, b.world);
            matrix[index + 1]![index_ + 1] = distribution;
            matrix[index_ + 1]![index + 1] = distribution;
        }
    }
    
    return matrix;
}

/**
 * Generate initial route using nearest-neighbor heuristic.
 * Starts from origin and greedily visits the closest unvisited point.
 * 
 * @param points - Points to visit
 * @param distributionMatrix - Pre-computed distance matrix
 * @returns Array of indices into points array in visit order
 * 
 * @example
 * const order = nearestNeighborOrder(shops, distMatrix);
 * // order = [2, 0, 1] means visit shops[2], then shops[0], then shops[1]
 */
export function nearestNeighborOrder(points: RoutePoint[], distributionMatrix: number[][]): number[] {
    if (points.length === 0) {return [];}
    if (points.length === 1) {return [0];}
    
    const order: number[] = [];
    const visited = new Set<number>();
    let current = 0; // Start at origin (index 0 in matrix)
    
    while (order.length < points.length) {
        let nearestIndex = -1;
        let nearestDistribution = Infinity;
        
        for (let index = 0; index < points.length; index++) {
            if (visited.has(index)) {continue;}
            const distribution = distributionMatrix[current]![index + 1]!; // +1 because origin is at 0
            if (distribution < nearestDistribution) {
                nearestDistribution = distribution;
                nearestIndex = index;
            }
        }
        
        if (nearestIndex !== -1) {
            order.push(nearestIndex);
            visited.add(nearestIndex);
            current = nearestIndex + 1; // +1 for matrix index
        }
    }
    
    return order;
}

/**
 * Calculate total route length for a given visit order.
 * 
 * @param order - Array of point indices in visit order
 * @param distributionMatrix - Pre-computed distance matrix
 * @returns Total distance in overworld blocks
 * 
 * @example
 * const totalDist = calculateOrderDistance([0, 2, 1], distMatrix);
 */
export function calculateOrderDistance(order: number[], distributionMatrix: number[][]): number {
    if (order.length === 0) {return 0;}
    
    let total = distributionMatrix[0]![order[0]! + 1]!; // Origin to first
    
    for (let index = 0; index < order.length - 1; index++) {
        total += distributionMatrix[order[index]! + 1]![order[index + 1]! + 1]!;
    }
    
    return total;
}

interface TwoOptEdgeIndices {
    previousI: number;
    currentI: number;
    currentJ: number;
    nextJ: number;
}

function calculateEdgeIndices(
    result: number[],
    startIndex: number,
    endIndex: number
): TwoOptEdgeIndices {
    return {
        previousI: startIndex === 0 ? 0 : result[startIndex - 1]! + 1,
        currentI: result[startIndex]! + 1,
        currentJ: result[endIndex]! + 1,
        nextJ: endIndex === result.length - 1 ? -1 : result[endIndex + 1]! + 1
    };
}

function shouldSwapEdges(
    distributionMatrix: number[][],
    indices: TwoOptEdgeIndices
): boolean {
    const { previousI, currentI, currentJ, nextJ } = indices;

    // Current cost: prevI→currI + currJ→nextJ
    let currentCost = distributionMatrix[previousI]![currentI]!;
    if (nextJ !== -1) {
        currentCost += distributionMatrix[currentJ]![nextJ]!;
    }

    // New cost: prevI→currJ + currI→nextJ
    let newCost = distributionMatrix[previousI]![currentJ]!;
    if (nextJ !== -1) {
        newCost += distributionMatrix[currentI]![nextJ]!;
    }

    return newCost < currentCost - 0.001;
}

function applyTwoOptSwap(result: number[], startIndex: number, endIndex: number): void {
    const segment = result.slice(startIndex, endIndex + 1).toReversed();
    result.splice(startIndex, endIndex - startIndex + 1, ...segment);
}

/**
 * Optimize route using 2-opt edge swapping.
 * 
 * Algorithm:
 * 1. For each pair of non-adjacent edges
 * 2. Try reversing the segment between them
 * 3. Keep the swap if it reduces total distance
 * 4. Repeat until no improvement found
 * 
 * Time complexity: O(n²) per iteration, typically 2-5 iterations.
 * 
 * @param order - Initial route order
 * @param distributionMatrix - Pre-computed distance matrix
 * @returns Optimized route order (new array)
 * 
 * @example
 * const optimized = twoOptOptimize(nearestNeighborOrder(points, matrix), matrix);
 */
export function twoOptOptimize(order: number[], distributionMatrix: number[][]): number[] {
    if (order.length < 3) {return [...order];}
    
    const result = [...order];
    let improved = true;
    
    while (improved) {
        improved = false;
        
        for (let startIndex = 0; startIndex < result.length - 1; startIndex++) {
            for (let endIndex = startIndex + 2; endIndex < result.length; endIndex++) {
                const indices = calculateEdgeIndices(result, startIndex, endIndex);
                
                if (shouldSwapEdges(distributionMatrix, indices)) {
                    applyTwoOptSwap(result, startIndex, endIndex);
                    improved = true;
                }
            }
        }
    }
    
    return result;
}

/**
 * Compute optimized route order using nearest-neighbor + 2-opt.
 * Solves an approximate Traveling Salesman Problem (TSP).
 * 
 * @param points - Array of route points to visit
 * @param origin - Optional starting position (defaults to 0,0 in overworld)
 * @returns Indices into points array in optimal visit order
 * 
 * @example
 * const cartItems = getCartItems();
 * const order = computeOptimalOrder(cartItems, playerPosition);
 * const optimizedRoute = order.map(i => cartItems[i]);
 */
export function computeOptimalOrder(points: RoutePoint[], origin?: RoutePoint): number[] {
    if (points.length === 0) {return [];}
    if (points.length === 1) {return [0];}
    
    // Build distance matrix
    const distributionMatrix = buildDistanceMatrix(points, origin);
    
    // Get initial order using nearest-neighbor
    let order = nearestNeighborOrder(points, distributionMatrix);
    
    // Optimize with 2-opt
    order = twoOptOptimize(order, distributionMatrix);
    
    return order;
}
