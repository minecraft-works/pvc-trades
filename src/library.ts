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
 * This file contains core text processing, location, trade filtering, and
 * sorting logic. Domain modules have been extracted to dedicated files and
 * are re-exported here for backward compatibility.
 * 
 * LOCAL SECTIONS
 *   Store Re-exports          configStore, coreBlocksStore, blockConversionsStore
 *   Query Matching            matchesQuery(), matchesItem(), matchesShop()
 *   Formatting                formatName(), formatPrice(), escapeHtml()
 *   HTML Utilities            stripHtml(), splitAtWordBoundary()
 *   Location & Distance       isValidCoordinate(), formatCoordinates()
 *   Trade Processing          normalizeTradeName(), parseTrade()
 *   Trade Filtering           filterTrades(), applyFilters()
 *   Sorting                   sortTrades(), compareByColumn()
 * 
 * RE-EXPORTED MODULES
 *   src/valuation/            statistics, ratio-graph, item-values, item-identity (shulker parsing)
 *   src/map/map-math          coordinate conversions, tile offsets, zoom
 *   src/routing/              route-optimizer, navigation-helpers
 *   src/interpolation/        player position interpolation
 *   src/dashboard/            dashboard-data computation
 *   src/tile-coords           tile coordinate utilities
 * 
 * ============================================================================
 */

import { formatName } from './formatting.js';
import { getOverworldDistanceFromOrigin } from './routing/route-optimizer.js';
import { parseExactQuery } from './search/query.js';
import {
    type Coordinates,
    type FilterResult,
    type Item,
    type MappingRule,
    type Recipe,
    type Shop,
    type ShulkerItem,
    type SortColumn,
    type SortDirection,
    type Trade,
} from './types.js';
import { describeItemStack, getItemStackNames, parseShulkerContents } from './valuation/item-identity.js';

export type { SimpleTileCoords, ZoomedTileCoords } from './tile-coords.js';

// ============================================================================
// Store Re-exports (stores moved to src/stores/)
// ============================================================================

// Re-export stores for backward compatibility - stores are now in src/stores/
export {
    blockConversionsStore,
    configStore,
    coreBlocksStore,
    getConfig,
    getCoreBlocks,
    loadBaseItems,
    loadConfig,
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
    itemEnchants: Readonly<Record<string, number>> | undefined,
    ruleEnchants: Readonly<Record<string, number>> | undefined
): boolean {
    if (!itemEnchants || !ruleEnchants) { return false; }
    for (const [key, value] of Object.entries(ruleEnchants)) {
        if (itemEnchants[key] !== value) { return false; }
    }
    return true;
}

// ============================================================================
// Formatting Functions (extracted to src/formatting.ts to break circular deps)
// ============================================================================

export { formatName } from './formatting.js';

/**
 * Apply custom mapping rules to transform item types.
 * Used for special items like vote certificates or custom enchants.
 * Returns a new Item if a rule matches; returns the original if no rule matches;
 * returns undefined if item is undefined.
 *
 * @param item - The item to check against mapping rules (may be undefined)
 * @param mappingRules - Array of mapping rules to check
 * @returns Mapped item (new object if rule matched), original item, or undefined
 *
 * @example
 * const item = { type: 'PAPER', name: '50 Votes Certificate', amount: 1 };
 * const mapped = applyMapping(item, mappingRules);
 * // mapped?.type might now be 'Vote Certificate'
 */
export function applyMapping(item: Item | undefined, mappingRules: readonly MappingRule[]): Item | undefined {
    if (!item) { return undefined; }
    const type = item.type.replace('minecraft:', '').toUpperCase();

    for (const rule of mappingRules) {
        const matchesType = rule.item === type;
        const matchesName = !rule.originalName || item.name === rule.originalName;
        const matchesEnchant = !rule.enchant || enchantsMatch(item.enchant, rule.enchant);

        if (matchesType && matchesName && matchesEnchant) {
            return { ...item, type: rule.customName, name: '' };
        }
    }
    return item;
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
export function getRegex(pattern: string): Readonly<RegExp> {
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
 * @param string_ - String to split
 * @returns Array of tokens (single chars or escape sequences)
 */
function splitPreservingEscapes(string_: string): readonly string[] {
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
 * Matching runs on the raw text and each segment is HTML-escaped, so queries
 * can never match inside an escaped entity (e.g. "amp" in "&amp;").
 * Highlights only the first match unless the regex has the global flag.
 * 
 * @param text - Text to highlight in
 * @param regex - Pattern to match and highlight
 * @returns HTML string with matches wrapped in <mark>
 * 
 * @example
 * highlight('Diamond Pickaxe', /diamond/i) // '<mark>Diamond</mark> Pickaxe'
 */
export function highlight(text: string, regex: Readonly<RegExp>): string {
    const matcher = new RegExp(regex.source, regex.global ? regex.flags : `${regex.flags}g`);
    let html = '';
    let lastIndex = 0;
    for (const match of text.matchAll(matcher)) {
        if (match[0] !== '') {
            html += `${escapeHtml(text.slice(lastIndex, match.index))}<mark>${escapeHtml(match[0])}</mark>`;
            lastIndex = match.index + match[0].length;
            if (!regex.global) { break; }
        }
    }
    return html + escapeHtml(text.slice(lastIndex));
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
export function parseLocation(location: string): Readonly<Coordinates> {
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
export function processTrade(recipe: Readonly<Recipe>, shop: Readonly<Shop>, mappingRules: readonly MappingRule[]): Readonly<Trade> {
    const { x, y, z } = parseLocation(shop.location);
    const world = shop.world.replace('minecraft:', '');

    const resultItem = applyMapping(recipe.resultItem, mappingRules) ?? recipe.resultItem;
    const item1 = applyMapping(recipe.item1, mappingRules) ?? recipe.item1;
    const item2 = recipe.item2 ? applyMapping(recipe.item2, mappingRules) ?? recipe.item2 : undefined;

    const lore = resultItem.lore ?? [];
    let resultName: string;
    let resultAmount: number;
    let loreText = '';
    let isShulker = false;
    let shulkerItems: readonly ShulkerItem[] | undefined;

    if (lore.length > 0 && resultItem.type.includes('SHULKER')) {
        const parsed = parseShulkerContents(lore);
        resultName = parsed.defaultName;
        resultAmount = parsed.defaultTotal;
        shulkerItems = parsed.items;
        loreText = lore.join(' ').toLowerCase();
        isShulker = true;
    } else {
        resultName = formatName(resultItem);
        resultAmount = resultItem.amount;
    }

    const costName = formatName(item1) + (item2 ? ' ' + formatName(item2) : '');
    const displayStock = isShulker ? recipe.stock * resultAmount : recipe.stock;
    // Searchable cost text also covers shulker contents ("cobblestone" finds a shulker of it)
    const costNames = [item1, item2].flatMap(item => (item ? getItemStackNames(item) : []));

    return {
        stock: recipe.stock,
        resultText: resultName.toLowerCase(),
        costText: costNames.join(' ').toLowerCase(),
        item1,
        item2,
        resultItem,
        x, y, z, world,
        displayStock,
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

/**
 * Display amount and name of each cost item; a filled shulker box shows its
 * contents ("1728× Cobblestone") rather than "1× Shulker box".
 *
 * @param trade - Trade whose cost should be described
 * @returns One entry per cost item
 */
export function getCostParts(trade: Readonly<Pick<Trade, 'item1' | 'item2'>>): readonly { readonly amount: number; readonly name: string }[] {
    return trade.item2 ? [describeItemStack(trade.item1), describeItemStack(trade.item2)] : [describeItemStack(trade.item1)];
}

/**
 * Format a trade's cost with per-item amounts (handles two-item costs).
 *
 * @param trade - Trade whose cost should be formatted
 * @returns Human-readable cost, e.g. "5× Diamond block + 5× Emerald block"
 *
 * @example
 * formatTradeCost(trade) // '64× Emerald'
 */
export function formatTradeCost(trade: Readonly<Pick<Trade, 'item1' | 'item2'>>): string {
    return getCostParts(trade).map(part => `${part.amount}× ${part.name}`).join(' + ');
}

/**
 * Format a trade's cost item names without amounts (handles two-item costs).
 *
 * @param trade - Trade whose cost names should be formatted
 * @returns Cost names joined with " + ", e.g. "Diamond block + Emerald block"
 */
export function formatTradeCostNames(trade: Readonly<Pick<Trade, 'item1' | 'item2'>>): string {
    return getCostParts(trade).map(part => part.name).join(' + ');
}

/**
 * Total displayed cost amount (shulker contents counted), for sorting.
 *
 * @param trade - Trade
 * @returns Sum of displayed cost amounts
 */
export function getTotalCostAmount(trade: Readonly<Pick<Trade, 'item1' | 'item2'>>): number {
    return getCostParts(trade).reduce((sum, part) => sum + part.amount, 0);
}

interface ShulkerMatchResult {
    matched: boolean;
    name: string;
    amount: number;
}

/**
 * Match a name against a query; a quoted query ("emerald") must match the whole name
 * @param name - Item name (any case)
 * @param query - Search query
 * @returns True if the name matches
 */
function nameMatches(name: string, query: string): boolean {
    const exact = parseExactQuery(query);
    return exact === undefined ? matchesQuery(name, query) : name.toLowerCase() === exact;
}

function costMatches(trade: Readonly<Trade>, query: string): boolean {
    if (parseExactQuery(query) === undefined) { return matchesQuery(trade.costText, query); }
    const names = [trade.item1, trade.item2].flatMap(item => (item ? getItemStackNames(item) : []));
    return names.some(name => nameMatches(name, query));
}

function findMatchingShulkerItem(
    shulkerItems: readonly ShulkerItem[] | undefined,
    query: string
): Readonly<ShulkerMatchResult> | undefined {
    if (!shulkerItems) { return undefined; }
    const isExact = parseExactQuery(query) !== undefined;
    const matched = shulkerItems.find(
        item => nameMatches(item.name, query) || (!isExact && matchesQuery(item.key, query))
    );
    if (matched) {
        return { matched: true, name: matched.name, amount: matched.total };
    }
    return undefined;
}

function checkWantQueryMatch(
    trade: Readonly<Trade>,
    wantQuery: string
): Readonly<{ matchResult: boolean; displayName: string; displayAmount: number }> {
    if (!wantQuery) {
        return { matchResult: true, displayName: trade.resultName, displayAmount: trade.resultAmount };
    }
    if (nameMatches(trade.resultText, wantQuery)) {
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
 * A query in double quotes ("emerald") matches the whole item name only.
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
export function filterTrade(trade: Readonly<Trade>, wantQuery: string, giveQuery: string): Readonly<FilterResult> | undefined {
    if (trade.stock === 0) { return undefined; }

    const { matchResult, displayName, displayAmount } = checkWantQueryMatch(trade, wantQuery);
    const matchCost = !giveQuery || costMatches(trade, giveQuery);

    if (wantQuery && !matchResult) { return undefined; }
    if (giveQuery && !matchCost) { return undefined; }

    return {
        matchResult: Boolean(wantQuery && matchResult),
        matchCost: Boolean(giveQuery && matchCost),
        trade,
        displayName,
        displayAmount
    };
}

// ============================================================================
// Sorting
// ============================================================================

/**
 * Sort filter results by a specified column and direction.
 * Returns a new sorted array.
 * 
 * @param results - Array of filter results to sort
 * @param column - Column to sort by ('result-amt', 'cost-name', 'stock', etc.)
 * @param direction - 'asc' or 'desc'
 * @returns A new sorted array
 * 
 * @example
 * const sorted = sortResults(results, 'result-amt', 'desc'); // Sort by amount descending
 */
export function sortResults(
    results: readonly FilterResult[],
    column: SortColumn,
    direction: SortDirection
): readonly FilterResult[] {
    const sortDirection = direction === 'asc' ? 1 : -1;

    return results.toSorted((a, b) => {
        const tradeA = a.trade;
        const tradeB = b.trade;
        let valueA: number;
        let valueB: number;

        switch (column) {
            case 'cost-amt': {
                valueA = getTotalCostAmount(tradeA);
                valueB = getTotalCostAmount(tradeB);
                break;
            }
            case 'cost-name': {
                return sortDirection * formatTradeCostNames(tradeA).localeCompare(formatTradeCostNames(tradeB));
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
                valueA = getOverworldDistanceFromOrigin(tradeA);
                valueB = getOverworldDistanceFromOrigin(tradeB);
                break;
            }
            default: {
                return 0;
            }
        }
        return sortDirection * (valueA - valueB);
    });
}

// ============================================================================
// Valuation Re-exports (implementations moved to src/valuation/)
// ============================================================================

export { getItemComponents, getPairKey, getPairPrice, getValuationName, parseShulkerContents, toValuationInput, valueItemStack } from './valuation/item-identity.js';
export { calculateItemValues, calculatePairPrices } from './valuation/item-values.js';
export { buildExchangeMatrix,buildRatioGraph, getRatio } from './valuation/ratio-graph.js';
export { countIndependentShops, getTrustedItemValue, getTrustedPairPrice, hasEnoughIndependentData, median } from './valuation/statistics.js';

// ============================================================================
// Map Utilities Re-exports (implementations moved to src/map/map-math.ts)
// ============================================================================

export { calculateFitZoom, clampToCircle,fromLeafletCoordsRelative, getTileOffset, getTradeKey, getWorldId, isNether, shouldSwitchMapWorld, toLeafletCoords, toLeafletCoordsRelative } from './map/map-math.js';

// ============================================================================
// Route Optimization Re-exports (implementations moved to src/routing/route-optimizer.ts)
// ============================================================================

export { buildDistanceMatrix, calculateOrderDistance, calculateRouteDistance, computeOptimalOrder, getOverworldDistanceFromOrigin, nearestNeighborOrder, type RoutePoint, toOverworldEquivalent, toViewCoords, twoOptOptimize } from './routing/route-optimizer.js';

// ============================================================================
// Shopping & Navigation Re-exports (implementations moved to src/routing/navigation-helpers.ts)
// ============================================================================

export { aggregateShoppingList, buildMarkerContent, buildStopTooltip, calculateTotalRouteDistance, getZoomForHeight, hasPositionMoved } from './routing/navigation-helpers.js';

// ============================================================================
// Player Position Interpolation Re-exports (kept in library.ts as canonical source)
// ============================================================================

export { estimateVelocity, type InterpolatedPosition, lerpAngle, type Position2D, SPRING_DAMPING, SPRING_STIFFNESS, type SpringConfig, type SpringResult, springStep, type Velocity2D } from './interpolation/interpolation.js';

// ============================================================================
// Dashboard Data Re-exports (implementations moved to src/dashboard/dashboard-data.ts)
// ============================================================================

export { computeDashboardData,formatRelativeTime } from './dashboard/dashboard-data.js';
export {getBlocksPerTile, getTileBounds, getTileCoords,getTileCoordsAtZoom} from './tile-coords.js';