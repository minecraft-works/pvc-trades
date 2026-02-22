/**
 * Unit tests for CartStore
 * 
 * @module stores/cart-store.test
 */

import { afterEach,beforeEach, describe, expect, test, vi } from 'vitest';

import type { Trade } from '../types.js';
import { cartStore } from './cart-store.js';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
})();

// Install mock before imports can use it
vi.stubGlobal('localStorage', localStorageMock);

// Mock trade factory
function createMockTrade(overrides: Partial<Trade> = {}): Trade {
    return {
        x: 100,
        y: 64,
        z: 200,
        world: 'world',
        item1: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
        resultItem: { type: 'EMERALD_BLOCK', name: 'Emerald Block', amount: 1 },
        stock: 10,
        displayStock: 10,
        resultText: '1x Emerald Block',
        costText: '1x Diamond',
        loreText: '',
        shulkerItems: undefined,
        resultName: 'Emerald Block',
        resultAmount: 1,
        costName: 'Diamond',
        ...overrides,
    };
}

describe('CartStore', () => {
    beforeEach(() => {
        // Reset store before each test
        cartStore._reset();
        // Clear localStorage mock
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('add', () => {
        test('adds new trade to cart', () => {
            const trade = createMockTrade();
            
            cartStore.add(trade);
            
            expect(cartStore.items).toHaveLength(1);
            expect(cartStore.items[0]!.trade).toBe(trade);
            expect(cartStore.items[0]!.quantity).toBe(1);
        });

        test('increments quantity when adding existing trade', () => {
            const trade = createMockTrade();
            
            cartStore.add(trade);
            cartStore.add(trade);
            
            expect(cartStore.items).toHaveLength(1);
            expect(cartStore.items[0]!.quantity).toBe(2);
        });

        test('treats different trades as separate items', () => {
            const trade1 = createMockTrade({ x: 100 });
            const trade2 = createMockTrade({ x: 200 });
            
            cartStore.add(trade1);
            cartStore.add(trade2);
            
            expect(cartStore.items).toHaveLength(2);
        });
    });

    describe('remove', () => {
        test('removes trade from cart', () => {
            const trade = createMockTrade();
            cartStore.add(trade);
            
            cartStore.remove(trade);
            
            expect(cartStore.items).toHaveLength(0);
        });

        test('does nothing when removing non-existent trade', () => {
            const trade1 = createMockTrade({ x: 100 });
            const trade2 = createMockTrade({ x: 200 });
            cartStore.add(trade1);
            
            cartStore.remove(trade2);
            
            expect(cartStore.items).toHaveLength(1);
        });
    });

    describe('updateQuantity', () => {
        test('increments quantity with positive delta', () => {
            const trade = createMockTrade();
            cartStore.add(trade);
            
            cartStore.updateQuantity(trade, 5);
            
            expect(cartStore.items[0]!.quantity).toBe(6);
        });

        test('decrements quantity with negative delta', () => {
            const trade = createMockTrade();
            cartStore.add(trade);
            cartStore.add(trade);
            cartStore.add(trade);
            
            cartStore.updateQuantity(trade, -2);
            
            expect(cartStore.items[0]!.quantity).toBe(1);
        });

        test('clamps quantity to zero minimum', () => {
            const trade = createMockTrade();
            cartStore.add(trade);
            
            cartStore.updateQuantity(trade, -10);
            
            expect(cartStore.items[0]!.quantity).toBe(0);
        });
    });

    describe('setQuantity', () => {
        test('sets exact quantity', () => {
            const trade = createMockTrade();
            cartStore.add(trade);
            
            cartStore.setQuantity(trade, 10);
            
            expect(cartStore.items[0]!.quantity).toBe(10);
        });

        test('clamps to zero for negative values', () => {
            const trade = createMockTrade();
            cartStore.add(trade);
            
            cartStore.setQuantity(trade, -5);
            
            expect(cartStore.items[0]!.quantity).toBe(0);
        });
    });

    describe('find', () => {
        test('returns cart item when found', () => {
            const trade = createMockTrade();
            cartStore.add(trade);
            
            const found = cartStore.find(trade);
            
            expect(found).toBeDefined();
            expect(found!.trade).toBe(trade);
        });

        test('returns undefined when not found', () => {
            const trade = createMockTrade();
            
            const found = cartStore.find(trade);
            
            expect(found).toBeUndefined();
        });
    });

    describe('has', () => {
        test('returns true when trade is in cart', () => {
            const trade = createMockTrade();
            cartStore.add(trade);
            
            expect(cartStore.has(trade)).toBe(true);
        });

        test('returns false when trade is not in cart', () => {
            const trade = createMockTrade();
            
            expect(cartStore.has(trade)).toBe(false);
        });
    });

    describe('cleanupZeroQuantity', () => {
        test('removes items with zero quantity', () => {
            const trade1 = createMockTrade({ x: 100 });
            const trade2 = createMockTrade({ x: 200 });
            cartStore.add(trade1);
            cartStore.add(trade2);
            cartStore.setQuantity(trade1, 0);
            
            const hadZeroItems = cartStore.cleanupZeroQuantity();
            
            expect(hadZeroItems).toBe(true);
            expect(cartStore.items).toHaveLength(1);
            expect(cartStore.items[0]!.trade.x).toBe(200);
        });

        test('returns false when no zero-quantity items', () => {
            const trade = createMockTrade();
            cartStore.add(trade);
            
            const hadZeroItems = cartStore.cleanupZeroQuantity();
            
            expect(hadZeroItems).toBe(false);
        });
    });

    describe('clear', () => {
        test('removes all items from cart', () => {
            cartStore.add(createMockTrade({ x: 100 }));
            cartStore.add(createMockTrade({ x: 200 }));
            
            cartStore.clear();
            
            expect(cartStore.items).toHaveLength(0);
        });
    });

    describe('getters', () => {
        test('totalQuantity returns sum of all quantities', () => {
            const trade1 = createMockTrade({ x: 100 });
            const trade2 = createMockTrade({ x: 200 });
            cartStore.add(trade1);
            cartStore.add(trade1);
            cartStore.add(trade2);
            
            expect(cartStore.totalQuantity).toBe(3);
        });

        test('uniqueCount returns number of unique trades', () => {
            const trade1 = createMockTrade({ x: 100 });
            const trade2 = createMockTrade({ x: 200 });
            cartStore.add(trade1);
            cartStore.add(trade1);
            cartStore.add(trade2);
            
            expect(cartStore.uniqueCount).toBe(2);
        });

        test('isEmpty returns true when cart is empty', () => {
            expect(cartStore.isEmpty).toBe(true);
        });

        test('isEmpty returns false when cart has items', () => {
            cartStore.add(createMockTrade());
            
            expect(cartStore.isEmpty).toBe(false);
        });

        test('items returns a copy (immutable)', () => {
            const trade = createMockTrade();
            cartStore.add(trade);
            
            const items1 = cartStore.items;
            const items2 = cartStore.items;
            
            expect(items1).not.toBe(items2);
            expect(items1).toEqual(items2);
        });
    });

    describe('onChange', () => {
        test('calls callback when cart changes', () => {
            const callback = vi.fn();
            cartStore.onChange(callback);
            
            cartStore.add(createMockTrade());
            
            expect(callback).toHaveBeenCalledTimes(1);
        });

        test('unsubscribe stops callbacks', () => {
            const callback = vi.fn();
            const unsubscribe = cartStore.onChange(callback);
            
            cartStore.add(createMockTrade());
            unsubscribe();
            cartStore.add(createMockTrade());
            
            expect(callback).toHaveBeenCalledTimes(1);
        });

        test('multiple callbacks are all called', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();
            cartStore.onChange(callback1);
            cartStore.onChange(callback2);
            
            cartStore.add(createMockTrade());
            
            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
        });
    });

    describe('persistence', () => {
        test('saves to localStorage on add', () => {
            const trade = createMockTrade();
            
            cartStore.add(trade);
            
            expect(localStorageMock.setItem).toHaveBeenCalled();
        });

        test('loads from localStorage', () => {
            const items = [{ trade: createMockTrade(), quantity: 3 }];
            localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(items));
            
            cartStore.load();
            
            expect(cartStore.items).toHaveLength(1);
            expect(cartStore.items[0]!.quantity).toBe(3);
        });

        test('handles invalid localStorage data gracefully', () => {
            localStorageMock.getItem.mockReturnValueOnce('invalid json');
            
            cartStore.load();
            
            expect(cartStore.items).toHaveLength(0);
        });

        test('handles structurally invalid cart items gracefully', () => {
            // Data that is valid JSON and an array, but not valid CartItems
            const corruptData = [{ notATrade: true, quantity: 'abc' }];
            localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(corruptData));
            
            cartStore.load();
            
            expect(cartStore.items).toHaveLength(0);
        });

        test('handles missing localStorage data', () => {
            localStorageMock.getItem.mockReturnValueOnce(null);
            
            cartStore.load();
            
            expect(cartStore.items).toHaveLength(0);
        });
    });
});
