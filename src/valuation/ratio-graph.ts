/**
 * Ratio Graph & Exchange Matrix
 *
 * Builds conversion-rate graphs between core currencies (Emerald, Diamond,
 * Gold, Iron, Netherite) and produces NxN exchange matrices for the UI.
 *
 * @module valuation/ratio-graph
 */

import {
    blockConversionsStore,
    configStore,
    coreBlocksStore,
} from '../stores/index.js';
import {
    type BlockConversions,
    type ExchangeMatrix,
    type ItemValues,
    type RatioGraph,
} from '../types.js';
import { hasEnoughIndependentData,median } from './statistics.js';

// ============================================================================
// Public API
// ============================================================================

/**
 * Build a ratio graph for the core blocks
 * Combines: fixed ratios (block↔ingot), shop trades, and transitive deductions
 * Returns: Map of "itemA->itemB" => ratio (1 itemA = ratio itemB)
 * @param itemValues - Aggregated item values computed from shop trades
 * @returns Ratio graph mapping "itemA->itemB" keys to their numeric conversion ratios
 */
export function buildRatioGraph(itemValues: ItemValues): RatioGraph {
    const coreBlocks = coreBlocksStore.get();
    const coreBlocksLower = coreBlocks.map(b => b.toLowerCase());
    const blockConversions = blockConversionsStore.get();

    const emeraldValues = buildEmeraldValuesFromTrades(itemValues);
    const emeraldValuesWithConversions = applyBlockConversions(emeraldValues, blockConversions);
    return buildCoreBlockRatios(coreBlocksLower, emeraldValuesWithConversions);
}

/**
 * Get the ratio between two items from the ratio graph
 * Returns undefined if no path exists
 * @param graph - The ratio graph to query
 * @param from - The source currency name (e.g., "emerald")
 * @param to - The target currency name (e.g., "diamond")
 * @returns The ratio (1 `from` = ratio `to`), or undefined if not found
 */
export function getRatio(graph: RatioGraph, from: string, to: string): number | undefined {
    const key = `${from.toLowerCase()}->${to.toLowerCase()}`;
    return graph.get(key);
}

/**
 * Build an NxN exchange matrix for core currencies.
 * Each cell shows how many of column-currency you get for 1 of row-currency.
 *
 * @param itemValues - The computed item values from trades
 * @param side - Whether to use buy (ask) or sell (bid) prices
 * @returns Matrix with labels and ratio grid
 *
 * @example
 * const matrix = buildExchangeMatrix(itemValues, 'buy');
 * // matrix.ratios[0][1] = how many of labels[1] for 1 of labels[0]
 */
export function buildExchangeMatrix(itemValues: ItemValues, side: 'buy' | 'sell'): ExchangeMatrix {
    const coreBlocks = coreBlocksStore.get();
    const emeraldValues = buildDirectionalEmeraldValues(itemValues, side);

    const labels: string[] = [];
    const blockValues: number[] = [];
    for (const block of coreBlocks) {
        const value = emeraldValues.get(block.toLowerCase());
        if (value !== undefined) {
            labels.push(block);
            blockValues.push(value);
        }
    }

    const ratios: (number | undefined)[][] = [];
    for (const [rowIndex, rowValue] of blockValues.entries()) {
        const row: (number | undefined)[] = [];
        for (const [colIndex, colValue] of blockValues.entries()) {
            if (rowIndex === colIndex) {
                row.push(1);
            } else {
                const ratio = rowValue / colValue;
                row.push(Number.isFinite(ratio) && ratio > 0 ? ratio : undefined);
            }
        }
        ratios.push(row);
    }

    return { labels, ratios };
}

// ============================================================================
// Private Helpers
// ============================================================================

function buildEmeraldValuesFromTrades(itemValues: ItemValues): ReadonlyMap<string, number> {
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

/**
 * Create a new map with block conversions derived from the given emerald values.
 * @param baseValues - Existing emerald-equivalent values
 * @param blockConversions - Block-to-ingot conversion rates
 * @returns New map with block conversion values added
 */
function applyBlockConversions(
    baseValues: ReadonlyMap<string, number>,
    blockConversions: BlockConversions
): ReadonlyMap<string, number> {
    const result = new Map(baseValues);
    for (const [blockName, { base, multiplier }] of Object.entries(blockConversions)) {
        const blockKey = blockName.toLowerCase();
        const baseKey = base.toLowerCase();

        // Derive block from base item (e.g. diamond × 9 = diamond block)
        if (!result.has(blockKey)) {
            const baseValue = result.get(baseKey);
            if (baseValue !== undefined) {
                result.set(blockKey, baseValue * multiplier);
            }
        }

        // Derive base item from block (e.g. netherite block / 9 = netherite ingot)
        if (!result.has(baseKey)) {
            const blockValue = result.get(blockKey);
            if (blockValue !== undefined) {
                result.set(baseKey, blockValue / multiplier);
            }
        }
    }
    return result;
}

/**
 * Build a RatioGraph from core blocks using their emerald-equivalent values.
 * @param coreBlocksLower - Lowercase core block names to compare
 * @param emeraldValues - Emerald-equivalent values
 * @returns Ratio graph with all pairwise conversion ratios
 */
function buildCoreBlockRatios(
    coreBlocksLower: readonly string[],
    emeraldValues: ReadonlyMap<string, number>
): RatioGraph {
    const graph = new Map<string, number>();

    // Pre-filter to only blocks with known emerald-equivalent values
    const blocksWithValues: { readonly block: string; readonly value: number }[] = [];
    for (const block of coreBlocksLower) {
        const value = emeraldValues.get(block);
        if (value !== undefined) {
            blocksWithValues.push({ block, value });
        }
    }

    for (const { block: blockA, value: valueA } of blocksWithValues) {
        for (const { block: blockB, value: valueB } of blocksWithValues) {
            if (blockA === blockB) { continue; }
            const ratio = valueA / valueB;
            const key = `${blockA}->${blockB}`;
            if (Number.isFinite(ratio) && ratio > 0 && !graph.has(key)) {
                graph.set(key, ratio);
                graph.set(`${blockB}->${blockA}`, 1 / ratio);
            }
        }
    }
    return graph;
}

/**
 * Build emerald values using only buy or sell medians.
 * Used to create separate buy/sell exchange matrices.
 * @param itemValues - Aggregated item values computed from shop trades
 * @param side - Whether to use buy (ask) or sell (bid) prices
 * @returns Map of item keys to their emerald-equivalent value on the given side
 */
function buildDirectionalEmeraldValues(
    itemValues: ItemValues,
    side: 'buy' | 'sell'
): ReadonlyMap<string, number> {
    const emeraldValues = new Map<string, number>();
    const config = configStore.get();
    const coreBlocks = coreBlocksStore.get();
    const coreBlocksLower = new Set(coreBlocks.map(b => b.toLowerCase()));

    for (const [key, entry] of itemValues.entries()) {
        if (coreBlocksLower.has(key) && !hasEnoughIndependentData(entry, config.analysis.minIndependentShops)) {
            continue;
        }

        const prices = side === 'buy' ? entry.buyPrices : entry.sellPrices;
        const value = median(prices);
        if (value !== undefined) {
            emeraldValues.set(key, value);
        }
    }

    emeraldValues.set('emerald', 1);
    const blockConversions = blockConversionsStore.get();
    return applyBlockConversions(emeraldValues, blockConversions);
}
