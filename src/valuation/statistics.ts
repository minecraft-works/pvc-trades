/**
 * Statistical Functions for Price Analysis
 *
 * Provides median calculation, independent-shop counting, and trusted
 * item-value lookup with block-conversion fallbacks.
 *
 * @module valuation/statistics
 */

import {
    type PriceEntry,
    type ItemValueEntry,
    type ItemValues,
    type Coordinates,
    type TrustedValueOptions,
    type BlockConversions,
} from '../types.js';

import {
    configStore,
    coreBlocksStore,
    blockConversionsStore,
} from '../stores/index.js';

// ============================================================================
// Public API
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
// Private Helpers
// ============================================================================

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
