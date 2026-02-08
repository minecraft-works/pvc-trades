/**
 * Unit tests for FavoritesStore
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { FavoritesStore } from './favorites-store.js';
import { STORAGE_KEYS, DEVIATION } from '../constants.js';
import type { FavoriteItem } from '../types.js';

// Mock localStorage
const mockLocalStorage = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
    };
})();

Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage });

describe('FavoritesStore', () => {
    let store: FavoritesStore;

    beforeEach(() => {
        mockLocalStorage.clear();
        store = new FavoritesStore();
    });

    describe('add', () => {
        test('adds item to favorites', () => {
            store.add('Diamond');
            expect(store.has('diamond')).toBe(true);
        });

        test('normalizes item name to lowercase', () => {
            store.add('EMERALD Block');
            expect(store.has('emerald block')).toBe(true);
        });

        test('sets maxDeviation when provided', () => {
            store.add('Diamond', -30);
            const fav = store.get('diamond');
            expect(fav?.maxDeviation).toBe(-30);
        });

        test('clamps maxDeviation to valid range', () => {
            store.add('Diamond', -150);
            const fav = store.get('diamond');
            expect(fav?.maxDeviation).toBe(DEVIATION.MIN_PERCENT);
        });

        test('updates existing favorite threshold', () => {
            store.add('Diamond', -20);
            store.add('Diamond', -50);
            const fav = store.get('diamond');
            expect(fav?.maxDeviation).toBe(-50);
        });

        test('sets addedAt timestamp', () => {
            const before = Date.now();
            store.add('Diamond');
            const after = Date.now();
            const fav = store.get('diamond');
            expect(fav?.addedAt).toBeGreaterThanOrEqual(before);
            expect(fav?.addedAt).toBeLessThanOrEqual(after);
        });

        test('persists to localStorage', () => {
            store.add('Diamond');
            const stored = JSON.parse(mockLocalStorage.getItem(STORAGE_KEYS.FAVORITES) ?? '[]') as FavoriteItem[];
            expect(stored).toHaveLength(1);
            expect(stored[0].itemName).toBe('diamond');
        });
    });

    describe('remove', () => {
        test('removes item from favorites', () => {
            store.add('Diamond');
            store.remove('Diamond');
            expect(store.has('diamond')).toBe(false);
        });

        test('handles case-insensitive removal', () => {
            store.add('Diamond');
            store.remove('DIAMOND');
            expect(store.has('diamond')).toBe(false);
        });

        test('does nothing for non-existent item', () => {
            store.add('Diamond');
            store.remove('Emerald');
            expect(store.has('diamond')).toBe(true);
        });
    });

    describe('has', () => {
        test('returns true for existing favorite', () => {
            store.add('Diamond');
            expect(store.has('Diamond')).toBe(true);
        });

        test('returns false for non-existent favorite', () => {
            expect(store.has('Diamond')).toBe(false);
        });

        test('is case-insensitive', () => {
            store.add('Diamond');
            expect(store.has('DIAMOND')).toBe(true);
            expect(store.has('diamond')).toBe(true);
        });
    });

    describe('get', () => {
        test('returns favorite item', () => {
            store.add('Diamond', -25);
            const fav = store.get('diamond');
            expect(fav?.itemName).toBe('diamond');
            expect(fav?.maxDeviation).toBe(-25);
        });

        test('returns undefined for non-existent item', () => {
            expect(store.get('diamond')).toBeUndefined();
        });
    });

    describe('getAll', () => {
        test('returns all favorites', () => {
            store.add('Diamond');
            store.add('Emerald');
            const all = store.getAll();
            expect(all).toHaveLength(2);
        });

        test('returns empty array when no favorites', () => {
            expect(store.getAll()).toHaveLength(0);
        });
    });

    describe('updateThreshold', () => {
        test('updates threshold for existing favorite', () => {
            store.add('Diamond', -20);
            store.updateThreshold('Diamond', -40);
            expect(store.get('diamond')?.maxDeviation).toBe(-40);
        });

        test('clears threshold when undefined', () => {
            store.add('Diamond', -20);
            store.updateThreshold('Diamond');
            expect(store.get('diamond')?.maxDeviation).toBeUndefined();
        });

        test('does nothing for non-existent item', () => {
            store.updateThreshold('Diamond', -20);
            expect(store.has('diamond')).toBe(false);
        });
    });

    describe('meetsThreshold', () => {
        test('returns true when deviation is at or below threshold', () => {
            store.add('Diamond', -20);
            expect(store.meetsThreshold('diamond', -25)).toBe(true);
            expect(store.meetsThreshold('diamond', -20)).toBe(true);
        });

        test('returns false when deviation is above threshold', () => {
            store.add('Diamond', -20);
            expect(store.meetsThreshold('diamond', -15)).toBe(false);
            expect(store.meetsThreshold('diamond', 10)).toBe(false);
        });

        test('returns false when no threshold set', () => {
            store.add('Diamond');
            expect(store.meetsThreshold('diamond', -50)).toBe(false);
        });

        test('returns false for non-favorite item', () => {
            expect(store.meetsThreshold('diamond', -50)).toBe(false);
        });
    });

    describe('load', () => {
        test('loads favorites from localStorage', () => {
            const data = [{ itemName: 'diamond', maxDeviation: -30, addedAt: 123_456 }];
            mockLocalStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(data));
            
            store.load();
            expect(store.has('diamond')).toBe(true);
            expect(store.get('diamond')?.maxDeviation).toBe(-30);
        });

        test('handles invalid localStorage data gracefully', () => {
            mockLocalStorage.setItem(STORAGE_KEYS.FAVORITES, 'invalid json');
            store.load();
            expect(store.getAll()).toHaveLength(0);
        });

        test('handles empty localStorage', () => {
            store.load();
            expect(store.getAll()).toHaveLength(0);
        });
    });

    describe('onChange', () => {
        test('calls callback when favorite is added', () => {
            const callback = vi.fn();
            store.onChange(callback);
            store.add('Diamond');
            expect(callback).toHaveBeenCalled();
        });

        test('calls callback when favorite is removed', () => {
            const callback = vi.fn();
            store.add('Diamond');
            store.onChange(callback);
            store.remove('Diamond');
            expect(callback).toHaveBeenCalled();
        });

        test('calls callback when threshold is updated', () => {
            const callback = vi.fn();
            store.add('Diamond', -20);
            store.onChange(callback);
            store.updateThreshold('Diamond', -40);
            expect(callback).toHaveBeenCalled();
        });

        test('unsubscribe stops callback from being called', () => {
            const callback = vi.fn();
            const unsubscribe = store.onChange(callback);
            store.add('Diamond', -20);
            expect(callback).toHaveBeenCalledTimes(1);
            
            unsubscribe();
            store.add('Emerald');
            expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
        });
    });

    describe('internal testing methods', () => {
        test('_getItemsRef returns the internal map reference', () => {
            store.add('Diamond', -20);
            const itemsReference = store._getItemsRef();
            expect(itemsReference instanceof Map).toBe(true);
            expect(itemsReference.size).toBe(1);
        });

        test('_setItems replaces all items', () => {
            store.add('Diamond', -20);
            store._setItems([
                { itemName: 'emerald', addedAt: Date.now() },
                { itemName: 'gold ingot', maxDeviation: -10, addedAt: Date.now() }
            ]);
            expect(store.getAll().length).toBe(2);
            expect(store.has('Diamond')).toBe(false);
            expect(store.has('Emerald')).toBe(true);
            expect(store.has('Gold Ingot')).toBe(true);
        });

        test('_reset clears all items and callbacks', () => {
            const callback = vi.fn();
            store.onChange(callback);
            store.add('Diamond', -20);
            expect(callback).toHaveBeenCalledTimes(1); // Called from add
            
            store._reset();
            
            expect(store.getAll().length).toBe(0);
            store.add('Emerald'); // Should not trigger callback after reset
            expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
        });
    });
});
