/**
 * Search scope store: the lenses, biomes, shop filter and trade filters that
 * narrow the results besides the typed text. The pill row, the field menus,
 * the keyboard shortcuts and the URL all read and change this one state.
 *
 * @module stores/search-scope-store
 */

import type { BiomeId } from '../search/biomes.js';
import type { LensId } from '../search/lenses.js';
import { EMPTY_SCOPE, type SearchScope, type SearchSide } from '../search/scope.js';
import type { QuickFilters, ShopFilter } from '../types.js';

/**
 * Holds the current search scope and tells listeners when it changes.
 */
class SearchScopeStore {
    private scope: SearchScope = EMPTY_SCOPE;
    private readonly listeners: (() => void)[] = [];

    /**
     * Current scope
     * @returns The scope
     */
    get(): SearchScope {
        return this.scope;
    }

    /**
     * Replace the whole scope, e.g. from the URL
     * @param scope - New scope
     */
    set(scope: SearchScope): void {
        this.scope = scope;
        this.notify();
    }

    /**
     * Set or clear the lens of one side
     * @param side - Buying or Paying
     * @param lens - Lens ID, or undefined to clear
     */
    setLens(side: SearchSide, lens: LensId | undefined): void {
        this.set(side === 'buy' ? { ...this.scope, buyLens: lens } : { ...this.scope, payLens: lens });
    }

    /**
     * Set or clear the biome of one side
     * @param side - Buying or Paying
     * @param biome - Biome ID, or undefined to clear
     */
    setBiome(side: SearchSide, biome: BiomeId | undefined): void {
        this.set(side === 'buy' ? { ...this.scope, buyBiome: biome } : { ...this.scope, payBiome: biome });
    }

    /** Clear the lenses and biomes of both sides */
    clearItemScopes(): void {
        this.set({ ...this.scope, buyLens: undefined, payLens: undefined, buyBiome: undefined, payBiome: undefined });
    }

    /**
     * Set or clear the shop filter
     * @param shop - Shop or owner, or undefined to show all shops
     */
    setShop(shop: ShopFilter | undefined): void {
        this.set({ ...this.scope, shop });
    }

    /**
     * Turn a trade filter on or off
     * @param key - Filter
     * @param enabled - New state
     */
    setFilter(key: keyof QuickFilters, enabled: boolean): void {
        this.set({ ...this.scope, filters: { ...this.scope.filters, [key]: enabled } });
    }

    /**
     * Flip a trade filter
     * @param key - Filter
     */
    toggleFilter(key: keyof QuickFilters): void {
        this.setFilter(key, !this.scope.filters[key]);
    }

    /** Swap the Buying and Paying lenses and biomes, along with the search terms */
    swapLenses(): void {
        const { buyLens, payLens, buyBiome, payBiome } = this.scope;
        this.set({ ...this.scope, buyLens: payLens, payLens: buyLens, buyBiome: payBiome, payBiome: buyBiome });
    }

    /**
     * Register a callback for scope changes
     * @param callback - Called after every change
     * @returns Unsubscribe function
     */
    onChange(callback: () => void): () => void {
        this.listeners.push(callback);
        return () => {
            const index = this.listeners.indexOf(callback);
            if (index !== -1) { this.listeners.splice(index, 1); }
        };
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}

/** The app's search scope */
export const searchScopeStore = new SearchScopeStore();
