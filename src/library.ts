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
 *   Shulker Box Parsing       parseShulkerItems(), extractShulkerCount()
 *   HTML Utilities            stripHtml(), splitAtWordBoundary()
 *   Location & Distance       isValidCoordinate(), formatCoordinates()
 *   Trade Processing          normalizeTradeName(), parseTrade()
 *   Trade Filtering           filterTrades(), applyFilters()
 *   Sorting                   sortTrades(), compareByColumn()
 * 
 * RE-EXPORTED MODULES
 *   src/valuation/            statistics, ratio-graph, item-values
 *   src/map/map-math          coordinate conversions, tile offsets, zoom
 *   src/routing/              route-optimizer, navigation-helpers
 *   src/interpolation/        player position interpolation
 *   src/dashboard/            dashboard-data computation
 *   src/tile-coords           tile coordinate utilities
 * 
 * ============================================================================
 */

import { formatName } from './formatting.js';
import {
    type Coordinates,
    type FilterResult,
    type Item,
    type MappingRule,
    type Recipe,
    type Shop,
    type ShulkerItem,
    type ShulkerParseResult,
    type SortColumn,
    type SortDirection,
    type Trade,
} from './types.js';

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
// Formatting Functions (extracted to src/formatting.ts to break circular deps)
// ============================================================================

export { formatName } from './formatting.js';

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
        const matchesType = rule.item === type;
        const matchesName = !rule.originalName || item.name === rule.originalName;
        const matchesEnchant = !rule.enchant || enchantsMatch(item.enchant, rule.enchant);

        if (matchesType && matchesName && matchesEnchant) {
            item.type = rule.customName;
            item.name = '';
            return;
        }
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
        item1: recipe.item1,
        item2: recipe.item2,
        resultItem: recipe.resultItem,
        stock: recipe.stock,
        resultText: resultName.toLowerCase(),
        costText: costName.toLowerCase(),
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
// Valuation Re-exports (implementations moved to src/valuation/)
// ============================================================================

export { calculateItemValues } from './valuation/item-values.js';
export { buildExchangeMatrix,buildRatioGraph, getRatio } from './valuation/ratio-graph.js';
export { countIndependentShops, getTrustedItemValue,hasEnoughIndependentData, median } from './valuation/statistics.js';

// ============================================================================
// Map Utilities Re-exports (implementations moved to src/map/map-math.ts)
// ============================================================================

export { calculateFitZoom, clampToCircle,fromLeafletCoordsRelative, getTileOffset, getTradeKey, getWorldId, isNether, shouldSwitchMapWorld, toLeafletCoords, toLeafletCoordsRelative } from './map/map-math.js';

// ============================================================================
// Route Optimization Re-exports (implementations moved to src/routing/route-optimizer.ts)
// ============================================================================

export { buildDistanceMatrix, calculateOrderDistance, calculateRouteDistance, computeOptimalOrder,nearestNeighborOrder, type RoutePoint, toOverworldEquivalent, toViewCoords, twoOptOptimize } from './routing/route-optimizer.js';

// ============================================================================
// Shopping & Navigation Re-exports (implementations moved to src/routing/navigation-helpers.ts)
// ============================================================================

export { aggregateShoppingList, buildMarkerContent, buildStopTooltip, calculateTotalRouteDistance, getZoomForHeight, hasPositionMoved } from './routing/navigation-helpers.js';

// ============================================================================
// Player Position Interpolation Re-exports (kept in library.ts as canonical source)
// ============================================================================

export { estimateVelocity, extrapolatePosition, type InterpolatedPosition, lerpAngle, lerpPosition, type Position2D, shouldExtrapolate,type Velocity2D } from './interpolation/interpolation.js';

// ============================================================================
// Dashboard Data Re-exports (implementations moved to src/dashboard/dashboard-data.ts)
// ============================================================================

export { computeDashboardData,formatRelativeTime } from './dashboard/dashboard-data.js';
export {getBlocksPerTile, getTileBounds, getTileCoords,getTileCoordsAtZoom} from './tile-coords.js';