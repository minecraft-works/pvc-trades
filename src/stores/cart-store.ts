/**
 * Shopping Cart Store
 * 
 * Encapsulates cart state with persistence to localStorage.
 * Provides methods for adding, removing, and updating cart items.
 * 
 * @module stores/cart-store
 */

import type { CartItem, Trade } from '../types.js';
import { CartItemArraySchema } from '../types.js';
import { STORAGE_KEYS } from '../constants.js';
import { getTradeKey } from '../library.js';

// ============================================================================
// Cart Store
// ============================================================================

/**
 * Centralized store for shopping cart state.
 * 
 * Manages:
 * - Cart items with quantities
 * - Persistence to localStorage
 * - Badge count updates
 * 
 * @example
 * ```typescript
 * cartStore.add(trade);
 * cartStore.updateQuantity(trade, -1);
 * cartStore.remove(trade);
 * cartStore.clear();
 * ```
 */
class CartStore {
    private _items: CartItem[] = [];
    private _onChangeCallbacks: Array<() => void> = [];

    // ========================================================================
    // Getters
    // ========================================================================

    /**
     * Get all cart items (returns a copy to prevent external mutation)
     */
    get items(): CartItem[] {
        return [...this._items];
    }

    /**
     * Get total number of items in cart (sum of quantities)
     */
    get totalQuantity(): number {
        return this._items.reduce((sum, item) => sum + item.quantity, 0);
    }

    /**
     * Get number of unique trades in cart
     */
    get uniqueCount(): number {
        return this._items.length;
    }

    /**
     * Check if cart is empty
     */
    get isEmpty(): boolean {
        return this._items.length === 0;
    }

    // ========================================================================
    // Item Operations
    // ========================================================================

    /**
     * Add a trade to the cart (or increment quantity if exists)
     */
    add(trade: Trade): void {
        const key = getTradeKey(trade);
        const existing = this._items.find(item => getTradeKey(item.trade) === key);

        if (existing) {
            existing.quantity++;
        } else {
            this._items.push({ trade, quantity: 1 });
        }

        this._save();
        this._notifyChange();
    }

    /**
     * Remove a trade from the cart entirely
     */
    remove(trade: Trade): void {
        const key = getTradeKey(trade);
        this._items = this._items.filter(item => getTradeKey(item.trade) !== key);
        this._save();
        this._notifyChange();
    }

    /**
     * Update quantity for a cart item
     * @param trade The trade to update
     * @param delta Amount to add (can be negative)
     */
    updateQuantity(trade: Trade, delta: number): void {
        const key = getTradeKey(trade);
        const item = this._items.find(cartItem => getTradeKey(cartItem.trade) === key);

        if (item) {
            item.quantity = Math.max(0, item.quantity + delta);
            this._save();
            this._notifyChange();
        }
    }

    /**
     * Set exact quantity for a cart item
     */
    setQuantity(trade: Trade, quantity: number): void {
        const key = getTradeKey(trade);
        const item = this._items.find(cartItem => getTradeKey(cartItem.trade) === key);

        if (item) {
            item.quantity = Math.max(0, quantity);
            this._save();
            this._notifyChange();
        }
    }

    /**
     * Find a cart item by trade
     */
    find(trade: Trade): CartItem | undefined {
        const key = getTradeKey(trade);
        return this._items.find(item => getTradeKey(item.trade) === key);
    }

    /**
     * Check if a trade is in the cart
     */
    has(trade: Trade): boolean {
        const key = getTradeKey(trade);
        return this._items.some(item => getTradeKey(item.trade) === key);
    }

    /**
     * Remove items with zero quantity
     * Called when cart dialog is closed
     * @returns true if any items were removed
     */
    cleanupZeroQuantity(): boolean {
        const hadZeroItems = this._items.some(item => item.quantity === 0);
        if (hadZeroItems) {
            this._items = this._items.filter(item => item.quantity > 0);
            this._save();
            this._notifyChange();
        }
        return hadZeroItems;
    }

    /**
     * Clear the entire cart
     */
    clear(): void {
        this._items = [];
        this._save();
        this._notifyChange();
    }

    // ========================================================================
    // Persistence
    // ========================================================================

    /**
     * Load cart from localStorage
     */
    load(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.CART);
            if (stored) {
                const parsed: unknown = JSON.parse(stored);
                const result = CartItemArraySchema.safeParse(parsed);
                if (result.success) {
                    this._items = result.data as unknown as CartItem[];
                }
            }
        } catch {
            this._items = [];
        }
        this._notifyChange();
    }

    /**
     * Save cart to localStorage
     */
    private _save(): void {
        try {
            localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(this._items));
        } catch {
            // Storage full or unavailable - ignore
        }
    }

    // ========================================================================
    // Change Notifications
    // ========================================================================

    /**
     * Register a callback to be called when cart changes
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
     * Get direct reference to items array (for testing/migration)
     * @internal
     */
    _getItemsRef(): CartItem[] {
        return this._items;
    }

    /**
     * Set items directly (for testing/migration)
     * @internal
     */
    _setItems(items: CartItem[]): void {
        this._items = items;
        this._notifyChange();
    }

    /**
     * Reset store to initial state (for testing)
     * @internal
     */
    _reset(): void {
        this._items = [];
        this._onChangeCallbacks = [];
    }
}

/** Singleton cart store instance */
export const cartStore = new CartStore();

// Expose for E2E testing
// @ts-expect-error - exposing for e2e testing
globalThis.__cartStore = cartStore;
