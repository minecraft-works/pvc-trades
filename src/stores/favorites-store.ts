/**
 * Favorites Watchlist Store
 * 
 * Encapsulates favorites state with persistence to localStorage.
 * Provides methods for adding, removing, and updating watched items.
 * 
 * @module stores/favorites-store
 */

import { DEVIATION,STORAGE_KEYS } from '../constants.js';
import type { FavoriteItem } from '../types.js';
import { FavoriteItemArraySchema } from '../types.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Clamp threshold to valid range
 * @param value - Threshold value to clamp
 * @returns Value clamped and rounded to the valid deviation range
 */
function clampThreshold(value: number): number {
    return Math.max(DEVIATION.MIN_PERCENT, Math.min(DEVIATION.MAX_PERCENT, Math.round(value)));
}

/**
 * Normalize item name for consistent lookups
 * @param name - Raw item name to normalize
 * @returns Lowercase trimmed item name
 */
function normalizeItemName(name: string): string {
    return name.toLowerCase().trim();
}

// ============================================================================
// Favorites Store
// ============================================================================

/**
 * Centralized store for favorites watchlist state.
 * 
 * Manages:
 * - Watched items with optional deal thresholds
 * - Persistence to localStorage
 * - Threshold matching for deal alerts
 * 
 * @example
 * ```typescript
 * favoritesStore.add('Diamond Pickaxe', -20);
 * favoritesStore.has('diamond pickaxe');  // true (normalized)
 * favoritesStore.meetsThreshold('diamond pickaxe', -25);  // true
 * favoritesStore.remove('Diamond Pickaxe');
 * ```
 */
export class FavoritesStore {
    private _items = new Map<string, FavoriteItem>();
    private _onChangeCallbacks: (() => void)[] = [];

    // ========================================================================
    // Getters
    // ========================================================================

    /**
     * Get all favorite items (returns a copy to prevent external mutation)
     * @returns Sorted array of all favorite items, newest first
     */
    getAll(): FavoriteItem[] {
        return [...this._items.values()].toSorted((a, b) => b.addedAt - a.addedAt);
    }

    /**
     * Get number of watched items
     * @returns Total count of favorited items
     */
    get count(): number {
        return this._items.size;
    }

    /**
     * Check if any items are being watched
     * @returns True if no items are in the watchlist
     */
    get isEmpty(): boolean {
        return this._items.size === 0;
    }

    // ========================================================================
    // Item Operations
    // ========================================================================

    /**
     * Check if an item is in favorites
     * @param itemName Item name (case-insensitive)
     * @returns True if the item is in the watchlist
     */
    has(itemName: string): boolean {
        return this._items.has(normalizeItemName(itemName));
    }

    /**
     * Get a favorite item by name
     * @param itemName Item name (case-insensitive)
     * @returns Matching favorite item, or undefined if not found
     */
    get(itemName: string): FavoriteItem | undefined {
        return this._items.get(normalizeItemName(itemName));
    }

    /**
     * Add or update an item in favorites
     * @param itemName Item name (case-insensitive)
     * @param maxDeviation Optional deal threshold (e.g., -20 for 20% below market)
     */
    add(itemName: string, maxDeviation?: number): void {
        const normalized = normalizeItemName(itemName);
        const clampedThreshold = maxDeviation === undefined 
            ? undefined
            : clampThreshold(maxDeviation);

        this._items.set(normalized, {
            itemName: normalized,
            maxDeviation: clampedThreshold,
            addedAt: Date.now()
        });

        this._save();
        this._notifyChange();
    }

    /**
     * Remove an item from favorites
     * @param itemName Item name (case-insensitive)
     */
    remove(itemName: string): void {
        const normalized = normalizeItemName(itemName);
        if (this._items.delete(normalized)) {
            this._save();
            this._notifyChange();
        }
    }

    /**
     * Update threshold for an existing favorite
     * @param itemName Item name (case-insensitive)
     * @param maxDeviation New threshold (undefined to remove threshold)
     */
    updateThreshold(itemName: string, maxDeviation?: number): void {
        const normalized = normalizeItemName(itemName);
        const existing = this._items.get(normalized);

        if (existing) {
            this._items.set(normalized, {
                ...existing,
                maxDeviation: maxDeviation === undefined ? undefined : clampThreshold(maxDeviation),
            });
            this._save();
            this._notifyChange();
        }
    }

    /**
     * Check if a trade deviation meets the threshold for a favorited item
     * @param itemName Item name (case-insensitive)
     * @param deviation Current trade deviation (e.g., -25 for 25% below market)
     * @returns true if item is favorited and deviation meets threshold (or no threshold set)
     */
    meetsThreshold(itemName: string, deviation: number): boolean {
        const favorite = this.get(itemName);
        if (!favorite) {
            return false;
        }
        // If no threshold set, no deal alert (user didn't define what's a "deal")
        if (favorite.maxDeviation === undefined) {
            return false;
        }
        // Deviation must be <= threshold (lower is better)
        return deviation <= favorite.maxDeviation;
    }

    /**
     * Clear all favorites
     */
    clear(): void {
        this._items.clear();
        this._save();
        this._notifyChange();
    }

    // ========================================================================
    // Persistence
    // ========================================================================

    /**
     * Load favorites from localStorage
     */
    load(): void {
        try {
            this._loadFromStorage();
        } catch {
            // Invalid data - keep existing state
        }
        this._notifyChange();
    }

    /**
     * Parse and apply favorites data from localStorage.
     */
    private _loadFromStorage(): void {
        const stored = localStorage.getItem(STORAGE_KEYS.FAVORITES);
        if (!stored) { return; }
        const parsed: unknown = JSON.parse(stored);
        const result = FavoriteItemArraySchema.safeParse(parsed);
        if (!result.success) { return; }
        this._items.clear();
        for (const item of result.data) {
            this._items.set(normalizeItemName(item.itemName), item);
        }
    }

    /**
     * Save favorites to localStorage
     */
    private _save(): void {
        try {
            const items = [...this._items.values()];
            localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(items));
        } catch {
            // Storage full or unavailable - ignore
        }
    }

    // ========================================================================
    // Change Notifications
    // ========================================================================

    /**
     * Register a callback to be called when favorites change
     * @param callback - Function invoked when the favorites list changes
     * @returns Unsubscribe function
     */
    onChange(callback: () => void): () => void {
        this._onChangeCallbacks.push(callback);
        return () => {
            const index = this._onChangeCallbacks.indexOf(callback);
            if (index !== -1) {
                this._onChangeCallbacks.splice(index, 1);
            }
        };
    }

    /**
     * Notify all change listeners
     */
    private _notifyChange(): void {
        for (const callback of this._onChangeCallbacks) {
            callback();
        }
    }

    // ========================================================================
    // Testing Support
    // ========================================================================

    /**
     * Get direct reference to items map (for testing)
     * @internal
     * @returns Direct reference to the internal favorites items map
     */
    _getItemsRef(): Map<string, FavoriteItem> {
        return this._items;
    }

    /**
     * Set items directly (for testing)
     * @param items - Array of favorite items to set directly
     * @internal
     */
    _setItems(items: FavoriteItem[]): void {
        this._items.clear();
        for (const item of items) {
            this._items.set(item.itemName, item);
        }
        this._notifyChange();
    }

    /**
     * Reset store to initial state (for testing)
     * @internal
     */
    _reset(): void {
        this._items.clear();
        this._onChangeCallbacks = [];
    }
}

/** Singleton favorites store instance */
export const favoritesStore = new FavoritesStore();

// Expose for E2E testing
// @ts-expect-error - exposing for e2e testing
globalThis.__favoritesStore = favoritesStore;
