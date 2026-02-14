/**
 * Unit tests for SnapshotStore
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../constants.js';
import { TradeSnapshotSchema } from '../types.js';
import type { Trade } from '../types.js';
import type { DeviationResult } from '../search/deviation.js';

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

// Dynamic import to pick up mocked localStorage
const { snapshotStore } = await import('./snapshot-store.js');

/** Minimal trade for testing */
function makeTrade(overrides: Partial<Trade> = {}): Trade {
    return {
        shopName: 'TestShop',
        shopOwner: 'Owner',
        x: 100,
        y: 64,
        z: 200,
        world: 'world',
        resultName: 'Diamond',
        resultAmount: 1,
        costName: 'Emerald',
        costAmount: 2,
        displayStock: 10,
        ...overrides,
    } as Trade;
}

/** Simple deviation result */
function makeDeviation(percent: number): DeviationResult {
    return { percent, direction: percent < 0 ? 'better' : 'worse' } as DeviationResult;
}

/** Parse a stored snapshot with type safety */
function parseStored(): { timestamp: number; trades: Record<string, { deviationPercent?: number; stock: number }> } {
    const raw = mockLocalStorage.getItem(STORAGE_KEYS.SNAPSHOT);
    expect(raw).toBeDefined();
    return TradeSnapshotSchema.parse(JSON.parse(raw!));
}

/** Deviation calculator that always returns a fixed value */
function fixedDeviation(percent: number) {
    return () => makeDeviation(percent);
}

/** Deviation calculator that always returns undefined */
function noDeviation(): DeviationResult | undefined {
    return undefined;
}

describe('SnapshotStore', () => {
    beforeEach(() => {
        mockLocalStorage.clear();
    });

    // ====================================================================
    // load()
    // ====================================================================

    describe('load', () => {
        test('returns undefined when no snapshot stored', () => {
            expect(snapshotStore.load()).toBeUndefined();
        });

        test('returns parsed snapshot when valid data exists', () => {
            const snapshot = {
                timestamp: Date.now(),
                trades: {
                    'key1': { deviationPercent: 10, stock: 5 },
                },
            };
            mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(snapshot));

            const loaded = snapshotStore.load();
            expect(loaded).toBeDefined();
            expect(loaded?.timestamp).toBe(snapshot.timestamp);
            expect(loaded?.trades['key1']).toEqual({ deviationPercent: 10, stock: 5 });
        });

        test('returns undefined for corrupted JSON', () => {
            mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, 'not json {{{');
            expect(snapshotStore.load()).toBeUndefined();
        });

        test('returns undefined for invalid schema', () => {
            // Missing required timestamp
            mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify({ trades: {} }));
            expect(snapshotStore.load()).toBeUndefined();
        });

        test('returns undefined for negative timestamp', () => {
            mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify({
                timestamp: -1,
                trades: {},
            }));
            expect(snapshotStore.load()).toBeUndefined();
        });

        test('accepts snapshot with optional deviationPercent', () => {
            const snapshot = {
                timestamp: 1000,
                trades: {
                    'key1': { stock: 5 },
                },
            };
            mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(snapshot));

            const loaded = snapshotStore.load();
            expect(loaded?.trades['key1']?.deviationPercent).toBeUndefined();
            expect(loaded?.trades['key1']?.stock).toBe(5);
        });
    });

    // ====================================================================
    // save()
    // ====================================================================

    describe('save', () => {
        test('saves trades with deviations to localStorage', () => {
            const trades = [makeTrade()];

            snapshotStore.save(trades, fixedDeviation(-15));

            const parsed = parseStored();
            expect(parsed.timestamp).toBeGreaterThan(0);

            const entries = Object.values(parsed.trades);
            expect(entries).toHaveLength(1);
            expect(entries[0]).toEqual({
                deviationPercent: -15,
                stock: 10,
            });
        });

        test('saves undefined deviation when calculator returns undefined', () => {
            const trades = [makeTrade()];

            snapshotStore.save(trades, noDeviation);

            const parsed = parseStored();
            const entries = Object.values(parsed.trades);
            expect(entries).toHaveLength(1);
            expect(entries[0]?.deviationPercent).toBeUndefined();
        });

        test('saves multiple trades with unique keys', () => {
            const trades = [
                makeTrade({ resultName: 'Diamond', x: 100 }),
                makeTrade({ resultName: 'Iron ingot', x: 200 }),
            ];

            snapshotStore.save(trades, (trade: Trade) =>
                trade.resultName === 'Diamond' ? makeDeviation(-10) : makeDeviation(20));

            const parsed = parseStored();
            const entries = Object.values(parsed.trades);
            expect(entries).toHaveLength(2);
        });

        test('overwrites previous snapshot', () => {
            snapshotStore.save([makeTrade()], fixedDeviation(5));
            snapshotStore.save([makeTrade({ displayStock: 99 })], fixedDeviation(25));

            const parsed = parseStored();
            const entries = Object.values(parsed.trades);
            expect(entries).toHaveLength(1);
            expect(entries[0]?.stock).toBe(99);
            expect(entries[0]?.deviationPercent).toBe(25);
        });
    });

    // ====================================================================
    // clear()
    // ====================================================================

    describe('clear', () => {
        test('removes snapshot from localStorage', () => {
            snapshotStore.save([makeTrade()], fixedDeviation(0));
            expect(snapshotStore.load()).toBeDefined();

            snapshotStore.clear();
            expect(snapshotStore.load()).toBeUndefined();
        });

        test('does not throw when no snapshot exists', () => {
            expect(() => snapshotStore.clear()).not.toThrow();
        });
    });

    // ====================================================================
    // Round-trip
    // ====================================================================

    describe('round-trip', () => {
        test('save then load returns equivalent data', () => {
            const trades = [
                makeTrade({ resultName: 'Diamond', displayStock: 10 }),
                makeTrade({ resultName: 'Gold ingot', x: 300, displayStock: 64 }),
            ];

            snapshotStore.save(trades, (trade: Trade) =>
                trade.resultName === 'Diamond' ? makeDeviation(-43) : makeDeviation(0));
            const loaded = snapshotStore.load();

            expect(loaded).toBeDefined();
            expect(loaded!.timestamp).toBeGreaterThan(0);
            expect(Object.keys(loaded!.trades)).toHaveLength(2);
        });
    });
});
