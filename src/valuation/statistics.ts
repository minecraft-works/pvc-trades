/**
 * Statistical Functions for Price Analysis
 *
 * Provides median calculation, independent-shop counting, and trusted
 * item-value lookup with block-conversion fallbacks.
 *
 * @module valuation/statistics
 */

import {
    blockConversionsStore,
    configStore,
    coreBlocksStore,
} from '../stores/index.js';
import {
    type BlockConversions,
    type Coordinates,
    type ItemValueEntry,
    type ItemValues,
    type PairPrices,
    type PriceEntry,
    type TrustedValueOptions,
} from '../types.js';
import { getPairKey, toBaseUnit } from './item-identity.js';

/** Default independent shops required for non-core items */
const DEFAULT_MIN_ITEM_SHOPS = 2;

/**
 * Price arrays only grow (calculateItemValues appends while it iterates), so an
 * array's length identifies its contents. Statistics are cached per array and
 * recomputed when the length or the cluster distance changes.
 */
interface CachedStat {
    readonly length: number;
    readonly clusterDistance: number;
    readonly value: number | undefined;
}

const medianCache = new WeakMap<readonly unknown[], CachedStat>();
const independentShopsCache = new WeakMap<readonly unknown[], CachedStat>();
const combinedShopsCache = new WeakMap<ItemValueEntry, CachedStat & { readonly sellLength: number }>();

function cached(
    cache: WeakMap<readonly unknown[], CachedStat>,
    array: readonly unknown[],
    clusterDistance: number,
    compute: () => number | undefined
): number | undefined {
    const hit = cache.get(array);
    if (hit?.length === array.length && hit.clusterDistance === clusterDistance) { return hit.value; }
    const value = compute();
    cache.set(array, { length: array.length, clusterDistance, value });
    return value;
}

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
export function median(array: readonly PriceEntry[] | readonly number[]): number | undefined {
    if (array.length === 0) { return undefined; }
    return cached(medianCache, array, 0, () => computeMedian(array));
}

function computeMedian(array: readonly PriceEntry[] | readonly number[]): number | undefined {
    const prices = array.map(p => typeof p === 'object' ? p.price : p);
    const sorted: readonly number[] = prices.toSorted((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) {
        return sorted[mid];
    }
    const lower = sorted[mid - 1];
    const upper = sorted[mid];
    if (lower === undefined || upper === undefined) { return undefined; }
    return (lower + upper) / 2;
}

/**
 * Count independent shops. Shops within shopClusterDistance blocks of each
 * other, or owned by the same player, count as one source. This keeps a
 * single mega-shop or one player's chain of shops from dominating prices.
 *
 * Clustering is greedy and not transitive: each cluster has the location and
 * owner of its first shop, so neighbours of one owner's shop do not get merged
 * with that owner's shops elsewhere.
 *
 * @param priceArray - Array of prices with coordinates and optional owner
 * @returns Number of independent shop clusters
 *
 * @example
 * // Two shops 100 blocks apart = 2 independent shops
 * countIndependentShops([{price: 10, x: 0, y: 64, z: 0}, {price: 12, x: 100, y: 64, z: 0}]) // 2
 * // ...unless one player owns both
 * countIndependentShops([{price: 10, x: 0, y: 64, z: 0, owner: 'Bob'}, {price: 12, x: 100, y: 64, z: 0, owner: 'bob'}]) // 1
 */
export function countIndependentShops(priceArray: readonly PriceEntry[]): number {
    const maxDistance = configStore.get().analysis.shopClusterDistance;
    return cached(independentShopsCache, priceArray, maxDistance, () => computeIndependentShops(priceArray, maxDistance)) ?? 0;
}

function computeIndependentShops(priceArray: readonly PriceEntry[], maxDistance: number): number {
    const clusters: { readonly anchor: Coordinates; readonly owner: string | undefined }[] = [];

    for (const entry of priceArray) {
        const owner = entry.owner?.toLowerCase();
        const joinsCluster = clusters.some(cluster =>
            (owner !== undefined && cluster.owner === owner)
            || Math.hypot(entry.x - cluster.anchor.x, entry.y - cluster.anchor.y, entry.z - cluster.anchor.z) <= maxDistance);
        if (!joinsCluster) {
            clusters.push({ anchor: { x: entry.x, y: entry.y, z: entry.z }, owner });
        }
    }
    return clusters.length;
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
    const {
        minShops = 3,
        minItemShops = configStore.get().analysis.minIndependentShopsPerItem ?? DEFAULT_MIN_ITEM_SHOPS,
    } = options;
    const blockConversions = blockConversionsStore.get();
    const itemKey = itemName.toLowerCase();

    // Emerald is always 1
    if (itemKey === 'emerald') { return 1; }
    if (itemKey === 'emerald block') { return 9; }

    const isCoreBlock = isCoreCurrency(itemKey);
    const valueOf = (entry: ItemValueEntry): number | undefined =>
        getEntryValue(entry, isCoreBlock, minShops, minItemShops);

    // Try direct value from trades
    const directValue = getDirectTradeValue(itemValues.get(itemKey), valueOf);
    if (directValue !== undefined) { return directValue; }

    // Try block conversion (block = ingot × multiplier)
    const conversionValue = getBlockConversionValue(itemKey, itemValues, blockConversions, valueOf);
    if (conversionValue !== undefined) { return conversionValue; }

    // Try reverse conversion (ingot from block)
    return getReverseConversionValue(itemKey, itemValues, blockConversions, valueOf);
}

/**
 * Get the trusted median per-unit price of an item in a specific currency,
 * e.g. how many diamonds one hanging root usually costs.
 * Requires the same independent-shop evidence as {@link getTrustedItemValue}.
 *
 * @param pairPrices - Prices from calculatePairPrices
 * @param resultName - Valuation name of the item received
 * @param costName - Valuation name of the item paid
 * @param options - Optional evidence thresholds
 * @returns Median cost units per result unit, or undefined if untrusted
 *
 * @example
 * getTrustedPairPrice(pairs, 'Hanging roots', 'Diamond') // 0.0156
 */
export function getTrustedPairPrice(
    pairPrices: PairPrices,
    resultName: string,
    costName: string,
    options: TrustedValueOptions = {}
): number | undefined {
    const {
        minShops = 3,
        minItemShops = configStore.get().analysis.minIndependentShopsPerItem ?? DEFAULT_MIN_ITEM_SHOPS,
    } = options;
    const prices = pairPrices.get(getPairKey(resultName, costName));
    if (!prices) { return undefined; }

    const isCoreBlock = isCoreCurrency(resultName.toLowerCase());
    const required = isCoreBlock ? minShops : minItemShops;
    if (countIndependentShops(prices) < required) { return undefined; }
    return median(prices);
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Independent shops across both sides of an entry.
 * @param entry - Item value entry
 * @returns Number of independent shop clusters among buy and sell prices
 */
function countCombinedShops(entry: ItemValueEntry): number {
    const maxDistance = configStore.get().analysis.shopClusterDistance;
    const hit = combinedShopsCache.get(entry);
    if (hit?.length === entry.buyPrices.length && hit.sellLength === entry.sellPrices.length && hit.clusterDistance === maxDistance) {
        return hit.value ?? 0;
    }
    const value = computeIndependentShops([...entry.buyPrices, ...entry.sellPrices], maxDistance);
    combinedShopsCache.set(entry, { length: entry.buyPrices.length, sellLength: entry.sellPrices.length, clusterDistance: maxDistance, value });
    return value;
}

/**
 * Whether an item is a core currency, as listed or in base units
 * (core "Gold Block" makes "Gold ingot" core too)
 * @param itemKey - Lowercase item name
 * @returns True for core currencies
 */
function isCoreCurrency(itemKey: string): boolean {
    return coreBlocksStore.get().some(block =>
        block.toLowerCase() === itemKey || toBaseUnit(block, 1).name.toLowerCase() === itemKey);
}

function getMedianValue(
    buyPrices: readonly PriceEntry[],
    sellPrices: readonly PriceEntry[]
): number | undefined {
    const buy = median(buyPrices);
    const sell = median(sellPrices);
    if (buy !== undefined && sell !== undefined) { return (buy + sell) / 2; }
    return buy ?? sell;
}

/**
 * Median value of an entry, if the entry has enough independent evidence.
 * For core blocks only sides backed by enough independent shops contribute,
 * so a lone outlier on one side cannot skew the average with the
 * well-supported side. Other items need `minItemShops` independent shops
 * across both sides (ADR-018).
 * @param entry - Item value entry with buy/sell prices
 * @param isCoreBlock - Whether the item is a core block subject to per-side trust rules
 * @param minShops - Minimum independent shops required per side for core blocks
 * @param minItemShops - Minimum independent shops required for other items
 * @returns Emerald value, or undefined if not trusted
 */
function getEntryValue(
    entry: ItemValueEntry,
    isCoreBlock: boolean,
    minShops: number,
    minItemShops: number
): number | undefined {
    if (!isCoreBlock) {
        if (countCombinedShops(entry) < minItemShops) { return undefined; }
        return getMedianValue(entry.buyPrices, entry.sellPrices);
    }
    return getMedianValue(
        countIndependentShops(entry.buyPrices) >= minShops ? entry.buyPrices : [],
        countIndependentShops(entry.sellPrices) >= minShops ? entry.sellPrices : []
    );
}

function getDirectTradeValue(
    entry: ItemValueEntry | undefined,
    valueOf: (entry: ItemValueEntry) => number | undefined
): number | undefined {
    return entry ? valueOf(entry) : undefined;
}

function getBlockConversionValue(
    itemKey: string,
    itemValues: ItemValues,
    blockConversions: Readonly<BlockConversions>,
    valueOf: (entry: ItemValueEntry) => number | undefined
): number | undefined {
    const blockInfo = blockConversions[itemKey];
    if (!blockInfo) { return undefined; }

    const baseEntry = itemValues.get(blockInfo.base.toLowerCase());
    if (!baseEntry) { return undefined; }

    const baseValue = valueOf(baseEntry);
    if (baseValue === undefined) { return undefined; }
    return baseValue * blockInfo.multiplier;
}

function getReverseConversionValue(
    itemKey: string,
    itemValues: ItemValues,
    blockConversions: Readonly<BlockConversions>,
    valueOf: (entry: ItemValueEntry) => number | undefined
): number | undefined {
    for (const [blockKey, conversion] of Object.entries(blockConversions)) {
        if (conversion.base.toLowerCase() !== itemKey) { continue; }

        const blockEntry = itemValues.get(blockKey);
        if (blockEntry) {
            const blockValue = valueOf(blockEntry);
            if (blockValue !== undefined) {
                return blockValue / conversion.multiplier;
            }
        }
    }
    return undefined;
}
