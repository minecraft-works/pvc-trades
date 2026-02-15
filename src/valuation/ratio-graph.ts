/**
 * Ratio Graph & Exchange Matrix
 *
 * Builds conversion-rate graphs between core currencies (Emerald, Diamond,
 * Gold, Iron, Netherite) and produces NxN exchange matrices for the UI.
 *
 * @module valuation/ratio-graph
 */

import {
    type BlockConversions,
    type ItemValues,
    type RatioGraph,
    type ExchangeMatrix,
} from '../types.js';

import {
    configStore,
    coreBlocksStore,
    blockConversionsStore,
} from '../stores/index.js';

import { median, hasEnoughIndependentData } from './statistics.js';

// ============================================================================
// Public API
// ============================================================================

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
    const values: number[] = [];

    for (const block of coreBlocks) {
        const value = emeraldValues.get(block.toLowerCase());
        if (value !== undefined) {
            labels.push(block);
            values.push(value);
        }
    }

    const ratios: (number | undefined)[][] = [];
    for (const [rowIndex, rowValue] of values.entries()) {
        const row: (number | undefined)[] = [];
        for (const [colIndex, colValue] of values.entries()) {
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
        const baseKey = base.toLowerCase();

        // Derive block from base item (e.g. diamond × 9 = diamond block)
        if (!emeraldValues.has(blockKey)) {
            const baseValue = emeraldValues.get(baseKey);
            if (baseValue !== undefined) {
                emeraldValues.set(blockKey, baseValue * multiplier);
            }
        }

        // Derive base item from block (e.g. netherite block / 9 = netherite ingot)
        if (!emeraldValues.has(baseKey)) {
            const blockValue = emeraldValues.get(blockKey);
            if (blockValue !== undefined) {
                emeraldValues.set(baseKey, blockValue / multiplier);
            }
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
 * Build emerald values using only buy or sell medians.
 * Used to create separate buy/sell exchange matrices.
 */
function buildDirectionalEmeraldValues(
    itemValues: ItemValues,
    side: 'buy' | 'sell'
): Map<string, number> {
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
    addBlockConversionValues(emeraldValues, blockConversions);
    return emeraldValues;
}
