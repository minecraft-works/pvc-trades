/**
 * Core Blocks Store
 * 
 * Manages the list of core currency blocks used for ratio calculations.
 * Loads from core_currencies.json.
 * 
 * @module stores/core-blocks-store
 */

// ============================================================================
// Core Blocks Store
// ============================================================================

/**
 * Centralized store for core currency blocks.
 * 
 * Core blocks are the base currencies used for exchange rate calculations
 * (e.g., Emerald Block, Diamond Block, Gold Block, Iron Block, Netherite Ingot).
 * 
 * @example
 * ```typescript
 * await coreBlocksStore.load();
 * const blocks = coreBlocksStore.get();
 * const isCoreBlock = blocks.includes('Diamond Block');
 * ```
 */
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

// ============================================================================
// Convenience Functions
// ============================================================================

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
