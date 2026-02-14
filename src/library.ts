/**
 * Pure logic functions - no DOM dependencies
 * These can be imported and unit tested directly
 * 
 * @module library
 * 
 * ============================================================================
 * FILE NAVIGATION INDEX
 * ============================================================================
 * 
 * STORES (re-exported from src/stores/)
 *   80 - Store Re-exports           configStore, coreBlocksStore, blockConversionsStore
 * 
 * TEXT PROCESSING
 *   92 - Query Matching Functions   matchQuery(), matchItem(), matchShop()
 *  160 - Formatting Functions       formatItemName(), formatPrice(), escapeHtml()
 *  230 - Shulker Box Parsing        parseShulkerItems(), extractShulkerCount()
 *  275 - HTML Utilities             stripHtml(), splitWordBoundary()
 * 
 * LOCATION & GEOMETRY
 *  316 - Location & Distance        isValidCoord(), formatCoords(), getDimension()
 *  338 - Trade Processing           normalizeItem(), parseTradeInput()
 *  402 - Trade Filtering            filterTrades(), applyFilters()
 * 
 * SORTING & COMPARISONS
 *  474 - Sorting                    sortTrades(), compareByColumn()
 * 
 * VALUE CALCULATIONS
 *  543 - Ratio Graph                buildRatioGraph(), findConversionPath()
 *  634 - Item Value Calculation     calculateValue(), getTrustedValue()
 *  787 - Statistical Functions      median(), independentShopsCount()
 * 
 * MAP & NAVIGATION
 *  977 - Map Utilities              calculateBounds(), coordsToLatLng()
 * 1222 - Route Optimization (TSP)   optimizeRoute(), nearestNeighbor()
 * 1509 - Shopping & Navigation      buildShoppingList(), getRouteStops()
 * 
 * ============================================================================
 */

import {
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
    type ShoppingList,
    type RouteStop,
    type TradeSnapshot,
    type TradeSnapshotEntry,
    type FavoriteItem,
    type DashboardData,
    type PriceDrop,
    type WatchlistHit,
    type PriceTableEntry,
} from './types.js';

// Shared tile coordinate utilities (used by both runtime and build scripts)
// Import for internal use AND re-export for consumers
import { getTileCoords,    } from './tile-coords.js';

import { ZOOM_HEIGHT } from './constants.js';

export type { SimpleTileCoords, ZoomedTileCoords } from './tile-coords.js';

// ============================================================================
// Store Re-exports (stores moved to src/stores/)
// ============================================================================

// Import stores for internal use within library.ts
import {
    configStore,
    coreBlocksStore,
    blockConversionsStore,
} from './stores/index.js';

// Re-export stores for backward compatibility - stores are now in src/stores/
export {
    configStore,
    getConfig,
    loadConfig,
    coreBlocksStore,
    getCoreBlocks,
    loadBaseItems,
    blockConversionsStore,
    loadFixedRatios,
} from './stores/index.js';

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
 * Handles underscores, spaces, and word-order variations (case-insensitive).
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
    const textNorm = normalize(text).toLowerCase();
    const queryNorm = normalize(query).toLowerCase();
    if (textNorm.includes(queryNorm)) { return true; }

    const textLower = text.toLowerCase();
    const words = query.replaceAll('_', ' ').split(/\s+/).filter(Boolean);
    return words.every(word => textLower.includes(word.toLowerCase()));
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
 * getRegex('[test]').test('[test]')             // true (special chars escaped)
 */
export function getRegex(pattern: string): RegExp {
    const withPlaceholder = pattern.replaceAll('*', '\u0000');
    const escaped = withPlaceholder.replaceAll(/[.+?^${}()|[\]\\]/g, String.raw`\$&`);
    // Split preserving escape sequences (e.g., \[ stays together as one unit)
    const tokens = splitPreservingEscapes(escaped);
    const flexible = tokens.join('[_ ]*');
    return new RegExp(flexible.replaceAll('\u0000', '.*'), 'i');
}

/**
 * Split string into tokens, keeping backslash escape sequences together.
 * Used by getRegex to ensure escaped characters aren't separated.
 * 
 * @param str - String to split
 * @returns Array of tokens (single chars or escape sequences)
 */
function splitPreservingEscapes(string_: string): string[] {
    const result: string[] = [];
    let index = 0;
    while (index < string_.length) {
        if (string_[index] === '\\' && index + 1 < string_.length) {
            // Keep escape sequence together
            result.push(string_.slice(index, index + 2));
            index += 2;
        } else {
            result.push(string_.slice(index, index + 1));
            index += 1;
        }
    }
    return result;
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
    const config = configStore.get();
    const coreBlocks = coreBlocksStore.get();
    const coreBlocksLower = new Set(coreBlocks.map(b => b.toLowerCase()));

    for (const [key, entry] of itemValues.entries()) {
        // For core blocks, require minimum independent shops for trust
        if (coreBlocksLower.has(key) && !hasEnoughIndependentData(entry, config.analysis.minIndependentShops)) {
            continue;
        }

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
        const blockKey = blockName.toLowerCase();
        // Preserve direct trade values — only fill in missing blocks
        if (emeraldValues.has(blockKey)) { continue; }
        const baseValue = emeraldValues.get(base.toLowerCase());
        if (baseValue !== undefined) {
            emeraldValues.set(blockKey, baseValue * multiplier);
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

/**
 * Build a price table showing buy/sell prices for core blocks in emeralds.
 * Each entry includes median buy/sell price, trade counts, independent shop count, and spread.
 * Sorted by buy price descending (most expensive first).
 */
export function buildPriceTable(itemValues: ItemValues): PriceTableEntry[] {
    const coreBlocks = coreBlocksStore.get();
    const entries: PriceTableEntry[] = [];

    for (const block of coreBlocks) {
        const key = block.toLowerCase();
        const entry = itemValues.get(key);
        if (!entry) { continue; }

        const buyPrice = median(entry.buyPrices);
        const sellPrice = median(entry.sellPrices);
        if (buyPrice === undefined && sellPrice === undefined) { continue; }

        const spread = buyPrice !== undefined && sellPrice !== undefined
            ? ((buyPrice - sellPrice) / buyPrice) * 100
            : undefined;

        entries.push({
            name: block,
            buyPrice,
            sellPrice,
            buyTradeCount: entry.buyPrices.length,
            sellTradeCount: entry.sellPrices.length,
            independentShopCount: countIndependentShops([...entry.buyPrices, ...entry.sellPrices]),
            spread,
        });
    }

    return entries.toSorted((a, b) => (b.buyPrice ?? 0) - (a.buyPrice ?? 0));
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
    // For trades with item2, we need different handling
    if (trade.item2) {
        return processDirectTradeWithItem2(trade, baseCurrency, values);
    }

    const item1Name = trade.item1Name ?? trade.costName;
    const costAsBase = normalizeToBaseCurrency(item1Name, trade.costAmount, baseCurrency);
    const resultAsBase = normalizeToBaseCurrency(trade.resultName, trade.resultAmount, baseCurrency);

    if (costAsBase.matches === resultAsBase.matches) { return; }

    if (costAsBase.matches) {
        const pricePerItem = costAsBase.amount / trade.resultAmount;
        addValue(values, trade.resultName, pricePerItem, 'buy', trade.x, trade.y, trade.z);
    } else if (resultAsBase.matches) {
        const pricePerItem = resultAsBase.amount / trade.costAmount;
        addValue(values, item1Name, pricePerItem, 'sell', trade.x, trade.y, trade.z);
    }
}

function processDirectTradeWithItem2(
    trade: TradeInput,
    baseCurrency: string,
    values: ItemValues
): void {
    if (!trade.item2) { return; }

    const item1Name = trade.item1Name ?? trade.costName;
    const item2Name = formatName(trade.item2);
    
    const item1AsBase = normalizeToBaseCurrency(item1Name, trade.costAmount, baseCurrency);
    const item2AsBase = normalizeToBaseCurrency(item2Name, trade.item2.amount, baseCurrency);
    const resultAsBase = normalizeToBaseCurrency(trade.resultName, trade.resultAmount, baseCurrency);

    // Both inputs are base currency -> derive result value
    if (item1AsBase.matches && item2AsBase.matches && !resultAsBase.matches) {
        const totalCost = item1AsBase.amount + item2AsBase.amount;
        const pricePerItem = totalCost / trade.resultAmount;
        addValue(values, trade.resultName, pricePerItem, 'buy', trade.x, trade.y, trade.z);
    }
    // Result is base currency, both inputs are not -> can't derive individual values
}

function deriveTransitiveValue(
    trade: TradeInput,
    baseCurrency: string,
    values: ItemValues
): boolean {
    // For trades with item2, we need different handling
    if (trade.item2) {
        return deriveTransitiveValueWithItem2(trade, baseCurrency, values);
    }

    const item1Name = trade.item1Name ?? trade.costName;
    const costKey = item1Name.toLowerCase();
    const resultKey = trade.resultName.toLowerCase();

    const costIsBase = normalizeToBaseCurrency(item1Name, 1, baseCurrency).matches;
    const resultIsBase = normalizeToBaseCurrency(trade.resultName, 1, baseCurrency).matches;
    if (costIsBase || resultIsBase) { return false; }

    const costEntry = values.get(costKey);
    const resultEntry = values.get(resultKey);
    let changed = false;

    if (costEntry && !resultEntry) {
        const costValue = getTrustedItemValue(item1Name, values);
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
            addValue(values, item1Name, pricePerCost, 'sell', trade.x, trade.y, trade.z);
            changed = true;
        }
    }

    return changed;
}

function deriveTransitiveValueWithItem2(
    trade: TradeInput,
    baseCurrency: string,
    values: ItemValues
): boolean {
    if (!trade.item2) { return false; }

    const item1Name = trade.item1Name ?? trade.costName;
    const item2Name = formatName(trade.item2);
    const resultKey = trade.resultName.toLowerCase();

    const item1IsBase = normalizeToBaseCurrency(item1Name, 1, baseCurrency).matches;
    const item2IsBase = normalizeToBaseCurrency(item2Name, 1, baseCurrency).matches;
    const resultIsBase = normalizeToBaseCurrency(trade.resultName, 1, baseCurrency).matches;

    // If already handled in direct phase, skip
    if ((item1IsBase && item2IsBase) || resultIsBase) { return false; }

    const item1Value = getTrustedItemValue(item1Name, values);
    const item2Value = getTrustedItemValue(item2Name, values);
    const resultEntry = values.get(resultKey);

    // If we know both input values but not result -> derive result value
    if (item1Value !== undefined && item2Value !== undefined && !resultEntry) {
        const totalCostValue = (trade.costAmount * item1Value) + (trade.item2.amount * item2Value);
        const pricePerResult = totalCostValue / trade.resultAmount;
        addValue(values, trade.resultName, pricePerResult, 'buy', trade.x, trade.y, trade.z);
        return true;
    }

    return false;
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

    // Phase 1: Direct trades with base currency (including item2 trades)
    for (const trade of trades) {
        processDirectTrade(trade, baseCurrency, values);
    }

    // Phase 2: Extend using known item values as intermediaries
    let changed = true;
    let iterations = 0;

    while (changed && iterations < config.analysis.maxTransitiveIterations) {
        changed = false;
        iterations++;

        for (const trade of trades) {
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

// getTileCoords is now re-exported from './tile-coords.js' at the top of this file

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
 * Convert coordinates for display on the specified view world.
 * When viewing overworld: nether coords are scaled ×8
 * When viewing nether: overworld coords are scaled ÷8
 * 
 * @param x - Original X coordinate
 * @param z - Original Z coordinate
 * @param stopWorld - The world where this point is located
 * @param viewWorld - The world currently being viewed ('overworld' or 'the_nether')
 * @returns Coordinates adjusted for the view world
 * 
 * @example
 * // Viewing overworld: nether stop at (100, 50) displays at (800, 400)
 * toViewCoords(100, 50, 'the_nether', 'overworld')  // { x: 800, z: 400 }
 * 
 * // Viewing nether: overworld stop at (800, 400) displays at (100, 50)
 * toViewCoords(800, 400, 'overworld', 'the_nether')  // { x: 100, z: 50 }
 * 
 * // Same world: no conversion needed
 * toViewCoords(100, 50, 'overworld', 'overworld')  // { x: 100, z: 50 }
 */
export function toViewCoords(
    x: number,
    z: number,
    stopWorld: string,
    viewWorld: string
): { x: number; z: number } {
    const isStopNether = stopWorld.toLowerCase().includes('nether');
    const isViewNether = viewWorld.toLowerCase().includes('nether');
    
    if (isStopNether === isViewNether) {
        // Same world type: no conversion needed
        return { x, z };
    }
    
    if (isStopNether && !isViewNether) {
        // Nether stop, viewing overworld: scale up ×8
        return { x: x * 8, z: z * 8 };
    }
    
    // Overworld stop, viewing nether: scale down ÷8
    return { x: x / 8, z: z / 8 };
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
        const point = point_;
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

// ============================================================================
// Shopping & Navigation Helpers (Pure Functions)
// ============================================================================

/**
 * Aggregate shopping list costs and gains from cart items.
 * Pure function - takes cart items, returns aggregated totals.
 * 
 * @param cartItems - Array of cart items with trade and quantity
 * @returns ShoppingList with costs and gains maps
 * 
 * @example
 * const list = aggregateShoppingList(cart);
 * console.log(list.costs.get('Diamond')); // Total diamonds needed
 */
export function aggregateShoppingList(cartItems: Array<{ trade: Trade; quantity: number }>): ShoppingList {
    const costs = new Map<string, number>();
    const gains = new Map<string, number>();
    
    for (const cartItem of cartItems) {
        const { trade, quantity } = cartItem;
        // Aggregate costs
        const cost1Name = formatName(trade.item1);
        const cost1Amount = trade.item1.amount * quantity;
        costs.set(cost1Name, (costs.get(cost1Name) ?? 0) + cost1Amount);
        
        if (trade.item2) {
            const cost2Name = formatName(trade.item2);
            const cost2Amount = trade.item2.amount * quantity;
            costs.set(cost2Name, (costs.get(cost2Name) ?? 0) + cost2Amount);
        }
        
        // Aggregate gains
        const gainAmount = trade.resultAmount * quantity;
        gains.set(trade.resultName, (gains.get(trade.resultName) ?? 0) + gainAmount);
    }
    
    return { costs, gains };
}

/**
 * Calculate total route distance across all stops.
 * Accounts for cross-dimension travel (overworld/nether coordinate scaling).
 * 
 * @param route - Array of route stops to calculate distance for
 * @param startX - Starting X coordinate (default 0)
 * @param startZ - Starting Z coordinate (default 0)
 * @param startWorld - Starting world (default 'overworld')
 * @returns Total distance in blocks
 * 
 * @example
 * const route = computeRoute(cart);
 * const distance = calculateTotalRouteDistance(route, playerX, playerZ, 'overworld');
 */
export function calculateTotalRouteDistance(
    route: RouteStop[],
    startX = 0,
    startZ = 0,
    startWorld = 'overworld'
): number {
    if (route.length === 0) { return 0; }
    
    let total = 0;
    let previousX = startX;
    let previousZ = startZ;
    let previousWorld = startWorld;
    
    for (const stop of route) {
        total += calculateRouteDistance(previousX, previousZ, previousWorld, stop.x, stop.z, stop.world);
        previousX = stop.x;
        previousZ = stop.z;
        previousWorld = stop.world;
    }
    
    return total;
}

/**
 * Build marker HTML content for a route stop.
 * Pure function for generating Leaflet marker HTML.
 * 
 * @param isCompleted - Whether the stop is marked as visited
 * @param index - Display index for incomplete stops (ignored if completed)
 * @param isNetherStop - Whether this is a nether stop (shows fire indicator)
 * @returns HTML string for the marker content
 */
export function buildMarkerContent(isCompleted: boolean, index: number, isNetherStop: boolean): string {
    const netherIndicator = isNetherStop ? '<span class="nether-indicator">🔥</span>' : '';
    if (isCompleted) {
        return `<div class="nav-marker nav-marker--completed">✓${netherIndicator}</div>`;
    }
    return `<div class="nav-marker">${index}${netherIndicator}</div>`;
}

/**
 * Build tooltip text for a route stop.
 * Shows item info and coordinates, with special formatting for nether stops.
 * 
 * @param stop - The route stop to build tooltip for
 * @param isCompleted - Whether the stop is marked as visited
 * @returns Multi-line tooltip string
 */
export function buildStopTooltip(stop: RouteStop, isCompleted: boolean): string {
    let text = stop.cartItem 
        ? `${stop.cartItem.quantity}× ${stop.cartItem.trade.resultName}`
        : 'Stop';
    
    if (isCompleted) {
        text = `✓ ${text} (completed)`;
    }
    
    if (stop.isNether) {
        text += `\nNether: ${stop.x}, ${stop.z}`;
        text += `\n(OW: ${stop.displayX}, ${stop.displayZ})`;
    }
    return text;
}

/**
 * Calculate zoom level based on player Y coordinate (height).
 * Uses linear interpolation between ground level and high altitude.
 * At or below MIN_HEIGHT → MAX_ZOOM (closest).
 * At or above MAX_HEIGHT → MIN_ZOOM (furthest).
 * Between them → linearly interpolated.
 *
 * @param y - Player Y coordinate (height in Minecraft blocks)
 * @returns Zoom level (continuous) from MIN_ZOOM to MAX_ZOOM
 *
 * @example
 * getZoomForHeight(63);  // 2 (ground level — max zoom)
 * getZoomForHeight(300); // -3 (high altitude — min zoom)
 * getZoomForHeight(181.5); // ~-0.5 (midpoint)
 */
export function getZoomForHeight(y: number): number {
    const { MIN_HEIGHT, MAX_HEIGHT, MAX_ZOOM, MIN_ZOOM } = ZOOM_HEIGHT;

    if (y <= MIN_HEIGHT) { return MAX_ZOOM; }
    if (y >= MAX_HEIGHT) { return MIN_ZOOM; }

    // Linear interpolation: t goes from 0 (ground) to 1 (max altitude)
    const t = (y - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);
    return MAX_ZOOM + t * (MIN_ZOOM - MAX_ZOOM);
}

/** Simple position for movement comparison */
interface SimplePosition {
    x: number;
    z: number;
}

/**
 * Check if a player position has moved beyond a threshold.
 * Used to determine when to update UI or recalculate routes.
 * 
 * @param previous - Previous position (if undefined, returns true)
 * @param current - Current position
 * @param threshold - Distance threshold in blocks
 * @returns True if position moved beyond threshold or previous is undefined
 * 
 * @example
 * hasPositionMoved({ x: 0, z: 0 }, { x: 5, z: 5 }, 10);  // false (within threshold)
 * hasPositionMoved({ x: 0, z: 0 }, { x: 15, z: 0 }, 10); // true (beyond threshold)
 * hasPositionMoved(undefined, { x: 0, z: 0 }, 10);       // true (no previous)
 */
export function hasPositionMoved(
    previous: SimplePosition | undefined, 
    current: SimplePosition, 
    threshold: number
): boolean {
    if (!previous) { return true; }
    return Math.abs(previous.x - current.x) > threshold || Math.abs(previous.z - current.z) > threshold;
}

// ============================================================================
// Player Position Interpolation (Predictive Lerp)
// ============================================================================

/** 2D velocity vector in blocks per millisecond */
export interface Velocity2D {
    /** X velocity in blocks/ms */
    vx: number;
    /** Z velocity in blocks/ms */
    vz: number;
}

/** 2D position used for interpolation */
export interface Position2D {
    x: number;
    z: number;
}

/** 3D position with optional yaw, used for full interpolation */
export interface InterpolatedPosition {
    x: number;
    y: number;
    z: number;
    /** Interpolated yaw in Minecraft degrees (0=south, 90=west, 180=north, 270=east) */
    yaw?: number;
}

/** Minecraft walking speed is ~4.3 blocks/sec = 0.0043 blocks/ms */
const MAX_SPEED_BLOCKS_PER_MS = 0.012; // ~12 blocks/sec covers sprinting + speed effects

/**
 * Estimate velocity from two position samples.
 * Clamps to maximum plausible Minecraft speed to reject teleports.
 * 
 * @param previous - Previous position
 * @param current - Current position
 * @param dtMs - Time delta in milliseconds between samples
 * @returns Velocity vector, or zero velocity if dt is 0 or speed exceeds plausible maximum
 * 
 * @example
 * estimateVelocity({ x: 0, z: 0 }, { x: 4, z: 0 }, 1000)
 * // { vx: 0.004, vz: 0 } — 4 blocks/sec eastward
 */
export function estimateVelocity(previous: Position2D, current: Position2D, dtMs: number): Velocity2D {
    if (dtMs <= 0) { return { vx: 0, vz: 0 }; }

    const vx = (current.x - previous.x) / dtMs;
    const vz = (current.z - previous.z) / dtMs;
    const speed = Math.hypot(vx, vz);

    // Reject implausible speeds (teleports, dimension changes)
    if (speed > MAX_SPEED_BLOCKS_PER_MS) {
        return { vx: 0, vz: 0 };
    }

    return { vx, vz };
}

/**
 * Extrapolate a position forward in time using a velocity vector.
 * 
 * @param base - Starting position
 * @param velocity - Velocity vector (blocks/ms)
 * @param elapsedMs - Milliseconds to extrapolate forward
 * @returns Predicted position
 * 
 * @example
 * extrapolatePosition({ x: 100, z: 200 }, { vx: 0.004, vz: 0 }, 500)
 * // { x: 102, z: 200 } — moved 2 blocks east in 500ms
 */
export function extrapolatePosition(base: Position2D, velocity: Velocity2D, elapsedMs: number): Position2D {
    return {
        x: base.x + velocity.vx * elapsedMs,
        z: base.z + velocity.vz * elapsedMs
    };
}

/**
 * Linearly interpolate between two positions.
 * 
 * @param from - Start position (t=0)
 * @param to - End position (t=1)
 * @param t - Interpolation factor, clamped to [0, 1]
 * @returns Interpolated position
 * 
 * @example
 * lerpPosition({ x: 0, z: 0 }, { x: 10, z: 20 }, 0.5)
 * // { x: 5, z: 10 }
 */
export function lerpPosition(from: Position2D, to: Position2D, t: number): Position2D {
    const clamped = Math.max(0, Math.min(1, t));
    return {
        x: from.x + (to.x - from.x) * clamped,
        z: from.z + (to.z - from.z) * clamped
    };
}

/**
 * Linearly interpolate between two angles, taking the shortest path around the circle.
 * Handles wrapping correctly (e.g., 350° → 10° goes through 0°, not through 180°).
 *
 * @param from - Start angle in degrees
 * @param to - End angle in degrees
 * @param t - Interpolation factor, clamped to [0, 1]
 * @returns Interpolated angle in degrees, normalized to [0, 360)
 *
 * @example
 * lerpAngle(350, 10, 0.5)  // 0 (shortest path through 360)
 * lerpAngle(10, 350, 0.5)  // 0 (shortest path through 360)
 * lerpAngle(0, 180, 0.5)   // 90
 */
export function lerpAngle(from: number, to: number, t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    // Find shortest delta (handles wrapping)
    const delta = ((to - from) % 360 + 540) % 360 - 180;
    const result = from + delta * clamped;
    // Normalize to [0, 360)
    return ((result % 360) + 360) % 360;
}

/**
 * Determine whether extrapolation should be used based on velocity magnitude.
 * Suppresses extrapolation only when the player appears stationary.
 * 
 * Yaw is intentionally NOT checked against velocity direction.
 * In Minecraft, players frequently strafe, look around while walking,
 * or ride vehicles — head direction often diverges from movement.
 * Checking yaw agreement would suppress extrapolation during normal
 * gameplay, causing the marker to sit still and then "jump" on each
 * poll. The correction mechanism handles wrong predictions gracefully.
 * 
 * @param velocity - Current estimated velocity
 * @param _yaw - Unused (kept for API compatibility)
 * @param speedThreshold - Minimum speed (blocks/ms) to consider the player moving. Default: walking speed / 4
 * @returns True if extrapolation is appropriate
 * 
 * @example
 * shouldExtrapolate({ vx: 0.004, vz: 0 }, 270)  // true — moving
 * shouldExtrapolate({ vx: 0, vz: 0 }, 90)         // false — stationary
 */
export function shouldExtrapolate(
    velocity: Velocity2D,
    _yaw?: number,
    speedThreshold: number = 0.001
): boolean {
    const speed = Math.hypot(velocity.vx, velocity.vz);
    return speed >= speedThreshold;
}

// ============================================================================
// Daily Deals Dashboard
// ============================================================================

/**
 * Format a timestamp as a relative time string (e.g., "14h ago", "2d ago").
 * 
 * @param timestamp - The past timestamp to format
 * @param now - The current time (default: Date.now()), injectable for testing
 * @returns Human-readable relative time string
 * 
 * @example
 * formatRelativeTime(Date.now() - 3_600_000)  // "1h ago"
 * formatRelativeTime(Date.now() - 86_400_000) // "1d ago"
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
    const diffMs = now - timestamp;
    const minutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(diffMs / 86_400_000);

    if (minutes < 1) { return 'just now'; }
    if (minutes < 60) { return `${minutes}m ago`; }
    if (hours < 24) { return `${hours}h ago`; }
    return `${days}d ago`;
}

/**
 * Compute dashboard data by comparing current trades against a previous snapshot.
 * 
 * Detects:
 * - **New trades**: trade keys present now but not in the previous snapshot
 * - **Price drops**: trades where deviation improved by ≥ `dropThreshold` percentage points
 * - **Watchlist hits**: favorited items with deviation meeting their threshold,
 *   annotated with previous deviation for delta display
 * 
 * Pure function — no side effects, fully unit-testable.
 * 
 * @param currentTrades - All current trades
 * @param getDeviation - Deviation calculator for current item values
 * @param previousSnapshot - Previous session's snapshot (undefined = first visit)
 * @param favorites - User's watchlist items
 * @param dropThreshold - Minimum deviation improvement (percentage points) to count as a drop
 * @returns Dashboard data with new trades, price drops, and watchlist hits
 * 
 * @example
 * const data = computeDashboardData(allTrades, getDeviation, snapshot, favorites);
 * if (data.watchlistHits.length > 0) { showBanner(data); }
 */
/**
 * Check if a trade is new (not in previous snapshot).
 */
function isNewTrade(key: string, previousSnapshot: TradeSnapshot | undefined, previousTrades: Record<string, TradeSnapshotEntry>): boolean {
    return Boolean(previousSnapshot) && !(key in previousTrades);
}

/**
 * Check if a trade has a price drop exceeding the threshold.
 */
function detectPriceDrop(
    trade: Trade,
    key: string,
    deviation: { percent: number } | undefined,
    previous: TradeSnapshotEntry | undefined,
    dropThreshold: number
): PriceDrop | undefined {
    if (!previous || !deviation || previous.deviationPercent === undefined) {
        return undefined;
    }
    const improvement = previous.deviationPercent - deviation.percent;
    if (improvement < dropThreshold) {
        return undefined;
    }
    return {
        tradeKey: key,
        itemName: trade.resultName,
        oldDeviation: previous.deviationPercent,
        newDeviation: deviation.percent
    };
}

/**
 * Update the watchlist hit map with the best deal per favorite item.
 */
function updateWatchlistHit(
    trade: Trade,
    deviation: { percent: number },
    previousDeviation: number | undefined,
    favorite: FavoriteItem,
    watchlistHitMap: Map<string, WatchlistHit>
): void {
    const meetsThreshold = favorite.maxDeviation === undefined
        || deviation.percent <= favorite.maxDeviation;
    if (!meetsThreshold) { return; }

    const normalizedName = trade.resultName.toLowerCase();
    const existing = watchlistHitMap.get(normalizedName);
    if (existing && deviation.percent >= existing.currentDeviation) { return; }

    watchlistHitMap.set(normalizedName, {
        itemName: trade.resultName,
        currentDeviation: deviation.percent,
        previousDeviation
    });
}

/**
 * Build a map of the best (lowest) current deviation per item across all trades.
 */
function buildBestDeviationMap(
    trades: Trade[],
    getDeviation: (trade: Trade) => { percent: number } | undefined
): Map<string, number> {
    const map = new Map<string, number>();
    for (const trade of trades) {
        const deviation = getDeviation(trade);
        if (!deviation) { continue; }
        const name = trade.resultName.toLowerCase();
        const existing = map.get(name);
        if (existing === undefined || deviation.percent < existing) {
            map.set(name, deviation.percent);
        }
    }
    return map;
}

/**
 * Filter price drops to only those that resulted in the global best price for their item.
 * If an item has a better deal from another trade, the drop isn't interesting to the user.
 * When multiple drops for the same item tie for best, keep only the one with the largest improvement.
 */
function filterToGlobalBestDrops(
    drops: PriceDrop[],
    bestDeviationByItem: Map<string, number>
): PriceDrop[] {
    // First pass: only keep drops where the new deviation matches the global best
    const globalBestDrops = drops.filter(drop => {
        const best = bestDeviationByItem.get(drop.itemName.toLowerCase());
        return best !== undefined && drop.newDeviation <= best;
    });

    // Second pass: deduplicate per item, keeping the largest improvement
    const bestPerItem = new Map<string, PriceDrop>();
    for (const drop of globalBestDrops) {
        const normalizedName = drop.itemName.toLowerCase();
        const existing = bestPerItem.get(normalizedName);
        const improvement = drop.oldDeviation - drop.newDeviation;
        const existingImprovement = existing ? existing.oldDeviation - existing.newDeviation : -1;
        if (improvement > existingImprovement) {
            bestPerItem.set(normalizedName, drop);
        }
    }

    return [...bestPerItem.values()];
}

/** Context for processing a single trade within dashboard computation */
interface DashboardTradeContext {
    readonly getDeviation: (trade: Trade) => { percent: number } | undefined;
    readonly previousSnapshot: TradeSnapshot | undefined;
    readonly previousTrades: Record<string, TradeSnapshotEntry>;
    readonly favoritesByName: Map<string, FavoriteItem>;
    readonly dropThreshold: number;
    readonly newTradeKeysList: string[];
    readonly priceDrops: PriceDrop[];
    readonly watchlistHitMap: Map<string, WatchlistHit>;
}

/** Process a single trade for dashboard: detect new trades, price drops, and watchlist hits */
function processDashboardTrade(trade: Trade, context: DashboardTradeContext): void {
    const key = getTradeKey(trade);
    const currentDeviation = context.getDeviation(trade);
    const previous = context.previousTrades[key];

    if (isNewTrade(key, context.previousSnapshot, context.previousTrades)) {
        context.newTradeKeysList.push(key);
    }

    const drop = detectPriceDrop(trade, key, currentDeviation, previous, context.dropThreshold);
    if (drop) {
        context.priceDrops.push(drop);
    }

    const normalizedName = trade.resultName.toLowerCase();
    const favorite = context.favoritesByName.get(normalizedName);
    if (favorite && currentDeviation) {
        const previousDeviation = context.previousSnapshot ? previous?.deviationPercent : undefined;
        updateWatchlistHit(trade, currentDeviation, previousDeviation, favorite, context.watchlistHitMap);
    }
}

/**
 * Compute dashboard data by comparing current trades against a previous snapshot.
 * Pure function: no side effects.
 *
 * @param currentTrades - All current trades
 * @param getDeviation - Function to calculate deviation for a trade
 * @param previousSnapshot - Previously saved snapshot (undefined on first visit)
 * @param favorites - User's watchlist items
 * @param dropThreshold - Minimum deviation improvement (percentage points) to count as a price drop
 * @returns Dashboard data with new trades, price drops, and watchlist hits
 */
export function computeDashboardData(
    currentTrades: Trade[],
    getDeviation: (trade: Trade) => { percent: number } | undefined,
    previousSnapshot: TradeSnapshot | undefined,
    favorites: FavoriteItem[],
    dropThreshold: number = 5
): DashboardData {
    const newTradeKeysList: string[] = [];
    const priceDrops: PriceDrop[] = [];
    const watchlistHitMap = new Map<string, WatchlistHit>();

    const favoritesByName = new Map<string, FavoriteItem>();
    for (const fav of favorites) {
        favoritesByName.set(fav.itemName.toLowerCase(), fav);
    }

    const previousTrades = previousSnapshot?.trades ?? {};
    const bestDeviationByItem = buildBestDeviationMap(currentTrades, getDeviation);

    const tradeContext: DashboardTradeContext = {
        getDeviation, previousSnapshot, previousTrades,
        favoritesByName, dropThreshold,
        newTradeKeysList, priceDrops, watchlistHitMap
    };

    for (const trade of currentTrades) {
        processDashboardTrade(trade, tradeContext);
    }

    const filteredDrops = filterToGlobalBestDrops(priceDrops, bestDeviationByItem);
    filteredDrops.sort((a, b) => (a.newDeviation - a.oldDeviation) - (b.newDeviation - b.oldDeviation));

    return {
        newTradeKeys: newTradeKeysList,
        priceDrops: filteredDrops,
        watchlistHits: [...watchlistHitMap.values()],
        lastVisit: previousSnapshot?.timestamp
    };
}

export {getTileCoordsAtZoom, getTileBounds, getBlocksPerTile, getTileCoords} from './tile-coords.js';