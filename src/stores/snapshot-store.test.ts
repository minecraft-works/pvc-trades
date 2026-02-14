/**
 * Unit tests for SnapshotStore (compact rolling history)
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS, DASHBOARD } from '../constants.js';
import { CompactSnapshotHistorySchema } from '../types.js';
import type { Trade, TradeSnapshot } from '../types.js';
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
const { snapshotStore, packSnapshots, unpackSnapshots } = await import('./snapshot-store.js');

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

/** Parse stored compact history back to expanded snapshots */
function parseStoredSnapshots(): TradeSnapshot[] {
    const raw = mockLocalStorage.getItem(STORAGE_KEYS.SNAPSHOT);
    expect(raw).toBeDefined();
    const compact = CompactSnapshotHistorySchema.parse(JSON.parse(raw!));
    return unpackSnapshots(compact);
}

/** Deviation calculator that always returns a fixed value */
function fixedDeviation(percent: number) {
    return () => makeDeviation(percent);
}

/** Deviation calculator that always returns undefined */
function noDeviation(): DeviationResult | undefined {
    return undefined;
}

/** Store snapshots in v2 history format (for migration tests) */
function storeHistory(snapshots: TradeSnapshot[]): void {
    mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify({ snapshots }));
}

/** Store snapshots in compact format */
function storeCompact(snapshots: TradeSnapshot[]): void {
    const compact = packSnapshots(snapshots);
    mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(compact));
}

/** Build a minimal snapshot at a given timestamp */
function makeSnapshot(timestamp: number, trades: Record<string, { deviationPercent?: number; stock: number }> = {}): TradeSnapshot {
    return { timestamp, trades };
}

describe('SnapshotStore', () => {
    beforeEach(() => {
        mockLocalStorage.clear();
    });

    // ====================================================================
    // loadAll()
    // ====================================================================

    describe('loadAll', () => {
        test('returns empty array when no data stored', () => {
            expect(snapshotStore.loadAll()).toEqual([]);
        });

        test('returns snapshots from compact format', () => {
            const snapshots = [
                makeSnapshot(1000, { key1: { deviationPercent: 10, stock: 5 } }),
                makeSnapshot(2000, { key1: { deviationPercent: 20, stock: 3 } }),
            ];
            storeCompact(snapshots);

            const loaded = snapshotStore.loadAll();
            expect(loaded).toHaveLength(2);
            expect(loaded[0]?.timestamp).toBe(1000);
            expect(loaded[1]?.timestamp).toBe(2000);
        });

        test('migrates v2 history format', () => {
            const snapshots = [
                makeSnapshot(1000, { key1: { deviationPercent: 10, stock: 5 } }),
                makeSnapshot(2000, { key1: { deviationPercent: 20, stock: 3 } }),
            ];
            storeHistory(snapshots);

            const loaded = snapshotStore.loadAll();
            expect(loaded).toHaveLength(2);
            expect(loaded[0]?.timestamp).toBe(1000);
            expect(loaded[1]?.timestamp).toBe(2000);
        });

        test('migrates legacy single-snapshot format', () => {
            const legacy = { timestamp: 5000, trades: { key1: { deviationPercent: -5, stock: 10 } } };
            mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(legacy));

            const loaded = snapshotStore.loadAll();
            expect(loaded).toHaveLength(1);
            expect(loaded[0]?.timestamp).toBe(5000);
        });

        test('returns empty array for corrupted JSON', () => {
            mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, 'not json {{{');
            expect(snapshotStore.loadAll()).toEqual([]);
        });

        test('returns empty array for invalid schema', () => {
            mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify({ wrong: true }));
            expect(snapshotStore.loadAll()).toEqual([]);
        });
    });

    // ====================================================================
    // loadBaseline()
    // ====================================================================

    describe('loadBaseline', () => {
        test('returns undefined when no snapshots exist', () => {
            expect(snapshotStore.loadBaseline()).toBeUndefined();
        });

        test('returns snapshot closest to 24h ago', () => {
            const now = Date.now();
            const snapshots = [
                makeSnapshot(now - 28 * 3_600_000, { a: { stock: 1 } }), // 28h ago
                makeSnapshot(now - 23 * 3_600_000, { a: { stock: 2 } }), // 23h ago  ← closest to 24h
                makeSnapshot(now - 6 * 3_600_000,  { a: { stock: 3 } }),  // 6h ago
                makeSnapshot(now - 1 * 3_600_000,  { a: { stock: 4 } }),  // 1h ago
            ];
            storeCompact(snapshots);

            const baseline = snapshotStore.loadBaseline();
            expect(baseline?.trades['a']?.stock).toBe(2);
        });

        test('returns oldest snapshot when all are younger than target', () => {
            const now = Date.now();
            const snapshots = [
                makeSnapshot(now - 6 * 3_600_000, { a: { stock: 1 } }), // 6h ago  ← oldest
                makeSnapshot(now - 1 * 3_600_000, { a: { stock: 2 } }), // 1h ago
            ];
            storeCompact(snapshots);

            const baseline = snapshotStore.loadBaseline();
            expect(baseline?.trades['a']?.stock).toBe(1);
        });

        test('returns single snapshot when only one exists', () => {
            const now = Date.now();
            storeCompact([makeSnapshot(now - 3_600_000, { a: { stock: 7 } })]);

            const baseline = snapshotStore.loadBaseline();
            expect(baseline?.trades['a']?.stock).toBe(7);
        });

        test('accepts custom target age', () => {
            const now = Date.now();
            const snapshots = [
                makeSnapshot(now - 12 * 3_600_000, { a: { stock: 1 } }), // 12h ago ← closest to 6h
                makeSnapshot(now - 6 * 3_600_000,  { a: { stock: 2 } }),  // 6h ago ← exact match
                makeSnapshot(now - 1 * 3_600_000,  { a: { stock: 3 } }),  // 1h ago
            ];
            storeCompact(snapshots);

            const baseline = snapshotStore.loadBaseline(6 * 3_600_000);
            expect(baseline?.trades['a']?.stock).toBe(2);
        });
    });

    // ====================================================================
    // loadLatest()
    // ====================================================================

    describe('loadLatest', () => {
        test('returns undefined when no snapshots exist', () => {
            expect(snapshotStore.loadLatest()).toBeUndefined();
        });

        test('returns most recent snapshot', () => {
            const now = Date.now();
            storeCompact([
                makeSnapshot(now - 12 * 3_600_000, { a: { stock: 1 } }),
                makeSnapshot(now - 6 * 3_600_000, { a: { stock: 2 } }),
            ]);

            const latest = snapshotStore.loadLatest();
            expect(latest?.trades['a']?.stock).toBe(2);
        });
    });

    // ====================================================================
    // appendIfDue()
    // ====================================================================

    describe('appendIfDue', () => {
        test('saves when no snapshots exist', () => {
            const trades = [makeTrade()];
            const result = snapshotStore.appendIfDue(trades, fixedDeviation(-15));

            expect(result).toBe(true);
            const snapshots = parseStoredSnapshots();
            expect(snapshots).toHaveLength(1);
        });

        test('does not save when interval has not elapsed', () => {
            const now = Date.now();
            storeCompact([makeSnapshot(now - 1000, { a: { stock: 1 } })]); // 1s ago

            const result = snapshotStore.appendIfDue([makeTrade()], fixedDeviation(0));
            expect(result).toBe(false);

            const snapshots = parseStoredSnapshots();
            expect(snapshots).toHaveLength(1);
        });

        test('saves when interval has elapsed', () => {
            const now = Date.now();
            storeCompact([makeSnapshot(now - DASHBOARD.SNAPSHOT_INTERVAL_MS - 1000)]); // just past interval

            const result = snapshotStore.appendIfDue([makeTrade()], fixedDeviation(10));
            expect(result).toBe(true);

            const snapshots = parseStoredSnapshots();
            expect(snapshots).toHaveLength(2);
        });

        test('prunes snapshots older than max age', () => {
            const now = Date.now();
            storeCompact([
                makeSnapshot(now - 40 * 3_600_000, { a: { stock: 1 } }), // 40h ago → pruned
                makeSnapshot(now - 25 * 3_600_000, { a: { stock: 2 } }), // 25h ago → kept
                makeSnapshot(now - DASHBOARD.SNAPSHOT_INTERVAL_MS - 1000, { a: { stock: 3 } }),
            ]);

            snapshotStore.appendIfDue([makeTrade()], fixedDeviation(0));

            const snapshots = parseStoredSnapshots();
            // 40h snapshot pruned, 25h + old latest + new = 3
            expect(snapshots).toHaveLength(3);
            expect(snapshots[0]?.trades['a']?.stock).toBe(2);
        });

        test('stores correct trade data', () => {
            const trades = [makeTrade({ displayStock: 42 })];
            snapshotStore.appendIfDue(trades, fixedDeviation(-25));

            const snapshots = parseStoredSnapshots();
            const entries = Object.values(snapshots[0]!.trades);
            expect(entries).toHaveLength(1);
            expect(entries[0]).toEqual({ deviationPercent: -25, stock: 42 });
        });

        test('saves undefined deviation when calculator returns undefined', () => {
            snapshotStore.appendIfDue([makeTrade()], noDeviation);

            const snapshots = parseStoredSnapshots();
            const entries = Object.values(snapshots[0]!.trades);
            expect(entries[0]?.deviationPercent).toBeUndefined();
        });
    });

    // ====================================================================
    // save() (legacy API)
    // ====================================================================

    describe('save', () => {
        test('saves trades with deviations to localStorage', () => {
            const trades = [makeTrade()];

            snapshotStore.save(trades, fixedDeviation(-15));

            const snapshots = parseStoredSnapshots();
            expect(snapshots).toHaveLength(1);
            const entries = Object.values(snapshots[0]!.trades);
            expect(entries).toHaveLength(1);
            expect(entries[0]).toEqual({
                deviationPercent: -15,
                stock: 10,
            });
        });

        test('appends to existing history', () => {
            const now = Date.now();
            storeCompact([makeSnapshot(now - 3_600_000, { a: { stock: 1 } })]);

            snapshotStore.save([makeTrade({ displayStock: 99 })], fixedDeviation(25));

            const snapshots = parseStoredSnapshots();
            expect(snapshots).toHaveLength(2);
        });
    });

    // ====================================================================
    // clear()
    // ====================================================================

    describe('clear', () => {
        test('removes all snapshots from localStorage', () => {
            snapshotStore.save([makeTrade()], fixedDeviation(0));
            expect(snapshotStore.loadAll()).toHaveLength(1);

            snapshotStore.clear();
            expect(snapshotStore.loadAll()).toEqual([]);
        });

        test('does not throw when no snapshot exists', () => {
            expect(() => snapshotStore.clear()).not.toThrow();
        });
    });

    // ====================================================================
    // Round-trip / migration
    // ====================================================================

    describe('round-trip', () => {
        test('save then loadBaseline returns equivalent data', () => {
            const trades = [
                makeTrade({ resultName: 'Diamond', displayStock: 10 }),
                makeTrade({ resultName: 'Gold ingot', x: 300, displayStock: 64 }),
            ];

            snapshotStore.save(trades, (trade: Trade) =>
                trade.resultName === 'Diamond' ? makeDeviation(-43) : makeDeviation(0));
            const baseline = snapshotStore.loadBaseline();

            expect(baseline).toBeDefined();
            expect(baseline!.timestamp).toBeGreaterThan(0);
            expect(Object.keys(baseline!.trades)).toHaveLength(2);
        });

        test('legacy single snapshot is migrated and preserved', () => {
            const legacy = {
                timestamp: Date.now() - 20 * 3_600_000,
                trades: { key1: { deviationPercent: 5, stock: 10 } },
            };
            mockLocalStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(legacy));

            // Load triggers migration
            const baseline = snapshotStore.loadBaseline();
            expect(baseline?.trades['key1']?.stock).toBe(10);

            // Appending converts to compact format
            snapshotStore.save([makeTrade()], fixedDeviation(0));
            const snapshots = parseStoredSnapshots();
            expect(snapshots).toHaveLength(2);
            expect(snapshots[0]?.trades['key1']?.stock).toBe(10);
        });

        test('v2 history format is migrated on re-save', () => {
            const now = Date.now();
            storeHistory([
                makeSnapshot(now - 3_600_000, { a: { deviationPercent: 5, stock: 10 } }),
            ]);

            // Load reads v2 format, save writes compact
            snapshotStore.save([makeTrade()], fixedDeviation(0));

            // Verify it's now stored in compact format
            const raw = mockLocalStorage.getItem(STORAGE_KEYS.SNAPSHOT);
            const parsed = CompactSnapshotHistorySchema.parse(JSON.parse(raw!));
            expect(parsed).toHaveProperty('keys');
            expect(parsed).toHaveProperty('snapshots');
            expect(parsed.snapshots[0]).toHaveProperty('t');
            expect(parsed.snapshots[0]).toHaveProperty('v');
        });
    });

    // ====================================================================
    // packSnapshots / unpackSnapshots
    // ====================================================================

    describe('packSnapshots / unpackSnapshots', () => {
        test('round-trips a single snapshot', () => {
            const original: TradeSnapshot[] = [
                makeSnapshot(1000, {
                    key1: { deviationPercent: -15, stock: 42 },
                    key2: { stock: 7 },
                }),
            ];

            const packed = packSnapshots(original);
            const unpacked = unpackSnapshots(packed);

            expect(unpacked).toHaveLength(1);
            expect(unpacked[0]?.timestamp).toBe(1000);
            expect(unpacked[0]?.trades['key1']).toEqual({ deviationPercent: -15, stock: 42 });
            expect(unpacked[0]?.trades['key2']).toEqual({ deviationPercent: undefined, stock: 7 });
        });

        test('deduplicates keys across snapshots', () => {
            const original: TradeSnapshot[] = [
                makeSnapshot(1000, { a: { stock: 1 }, b: { stock: 2 } }),
                makeSnapshot(2000, { b: { stock: 3 }, c: { stock: 4 } }),
            ];

            const packed = packSnapshots(original);

            // Union of keys: a, b, c
            expect(packed.keys).toHaveLength(3);
            expect(packed.keys).toContain('a');
            expect(packed.keys).toContain('b');
            expect(packed.keys).toContain('c');

            // Each compact snapshot has values parallel to keys
            expect(packed.snapshots).toHaveLength(2);
            expect(packed.snapshots[0]?.v).toHaveLength(3);
            expect(packed.snapshots[1]?.v).toHaveLength(3);
        });

        test('missing keys in a snapshot get [null, 0] placeholder', () => {
            const original: TradeSnapshot[] = [
                makeSnapshot(1000, { a: { stock: 1 } }),
                makeSnapshot(2000, { b: { stock: 2 } }),
            ];

            const packed = packSnapshots(original);
            const unpacked = unpackSnapshots(packed);

            // First snapshot has 'a' but not 'b'
            expect(unpacked[0]?.trades['a']?.stock).toBe(1);
            expect(unpacked[0]?.trades['b']?.stock).toBe(0); // placeholder

            // Second snapshot has 'b' but not 'a'
            expect(unpacked[1]?.trades['b']?.stock).toBe(2);
            expect(unpacked[1]?.trades['a']?.stock).toBe(0); // placeholder
        });

        test('preserves null deviation through compact format', () => {
            const original: TradeSnapshot[] = [
                makeSnapshot(1000, { a: { deviationPercent: undefined, stock: 5 } }),
            ];

            const packed = packSnapshots(original);
            expect(packed.snapshots[0]?.v[0]?.[0]).toBeNull(); // stored as null

            const unpacked = unpackSnapshots(packed);
            expect(unpacked[0]?.trades['a']?.deviationPercent).toBeUndefined(); // restored as undefined
        });

        test('empty snapshot array packs and unpacks', () => {
            const packed = packSnapshots([]);
            expect(packed.keys).toEqual([]);
            expect(packed.snapshots).toEqual([]);

            const unpacked = unpackSnapshots(packed);
            expect(unpacked).toEqual([]);
        });

        test('compact format is significantly smaller', () => {
            // Build a realistic snapshot with many keys
            const trades: Record<string, { deviationPercent: number; stock: number }> = {};
            for (let index = 0; index < 100; index++) {
                trades[`Shop_${index}_Diamond_1_Emerald_2`] = { deviationPercent: -index, stock: index * 10 };
            }
            const snapshots = [
                makeSnapshot(1000, trades),
                makeSnapshot(2000, trades),
                makeSnapshot(3000, trades),
            ];

            const expandedSize = JSON.stringify({ snapshots }).length;
            const compactSize = JSON.stringify(packSnapshots(snapshots)).length;

            // Compact should be meaningfully smaller (keys stored once instead of 3x)
            expect(compactSize).toBeLessThan(expandedSize);
        });
    });
});
