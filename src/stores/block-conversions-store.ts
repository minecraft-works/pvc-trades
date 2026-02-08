/**
 * Block Conversions Store
 * 
 * Manages block-to-ingot conversion ratios (e.g., Diamond Block = 9 Diamonds).
 * Loads from block_conversions.json.
 * 
 * @module stores/block-conversions-store
 */

import { type BlockConversions, BlockConversionsSchema } from '../types.js';

// ============================================================================
// Block Conversions Store
// ============================================================================

/**
 * Centralized store for block-to-ingot conversion ratios.
 * 
 * These ratios are used to calculate block values from ingot values.
 * For example, if a Diamond is worth X emeralds, a Diamond Block is worth 9X.
 * 
 * @example
 * ```typescript
 * await blockConversionsStore.load();
 * const conversions = blockConversionsStore.get();
 * const diamondBlockRatio = conversions['diamond block']; // { base: 'diamond', multiplier: 9 }
 * ```
 */
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

// ============================================================================
// Convenience Functions
// ============================================================================

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
