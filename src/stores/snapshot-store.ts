/**
 * Trade Snapshot Store
 * 
 * Persists a rolling history of trade state snapshots between sessions.
 * The dashboard compares current data against a baseline snapshot that is
 * approximately 24 hours old, providing a stable "since yesterday" comparison.
 * 
 * Uses a compact storage format: trade keys are stored once, and each snapshot
 * contains only a timestamp + parallel value arrays. This reduces storage from
 * ~280 KB/snapshot to ~27 KB/snapshot for ~3400 trades, enabling hourly saves.
 * 
 * @module stores/snapshot-store
 */

import { DASHBOARD,STORAGE_KEYS } from '../constants.js';
import { getTradeKey } from '../map/map-math.js';
import type { CompactSnapshotHistory,DeviationResult, Trade, TradeSnapshot, TradeSnapshotEntry } from '../types.js';
import { CompactSnapshotHistorySchema,SnapshotHistorySchema, TradeSnapshotSchema } from '../types.js';

// ============================================================================
// Pack / Unpack (compact ↔ expanded)
// ============================================================================

/**
 * Pack expanded snapshots into the compact storage format.
 * Keys are deduplicated across all snapshots (union of all keys).
 * Missing trades in a snapshot get [null, 0] as placeholder.
 */
export function packSnapshots(snapshots: TradeSnapshot[]): CompactSnapshotHistory {
    // Collect the union of all trade keys across all snapshots
    const keySet = new Set<string>();
    for (const snapshot of snapshots) {
        for (const key of Object.keys(snapshot.trades)) {
            keySet.add(key);
        }
    }
    const keys = [...keySet];

    const compactSnapshots = snapshots.map((snapshot) => ({
        t: snapshot.timestamp,
        v: keys.map((key): [number | null, number] => {
            const entry = snapshot.trades[key];
            /* eslint-disable unicorn/no-null -- null required for JSON serialization (undefined not supported) */
            return entry
                ? [entry.deviationPercent ?? null, entry.stock]
                : [null, 0];
            /* eslint-enable unicorn/no-null */
        }),
    }));

    return { keys, snapshots: compactSnapshots };
}

/**
 * Unpack compact storage format back to expanded TradeSnapshot array.
 */
export function unpackSnapshots(compact: CompactSnapshotHistory): TradeSnapshot[] {
    const { keys, snapshots: compactSnapshots } = compact;

    return compactSnapshots.map((cs) => {
        const trades: Record<string, TradeSnapshotEntry> = {};
        for (const [index, key] of keys.entries()) {
            const value = cs.v[index];
            if (value) {
                trades[key] = {
                    deviationPercent: value[0] ?? undefined,
                    stock: value[1],
                };
            }
        }
        return { timestamp: cs.t, trades };
    });
}

// ============================================================================
// Snapshot Store
// ============================================================================

/**
 * Store for persisting a rolling history of trade state snapshots.
 * 
 * Maintains multiple snapshots in localStorage using a compact format
 * (keys stored once, values as parallel arrays). The dashboard baseline
 * is always approximately 24 hours old. Snapshots are saved at intervals
 * (default 1h) and pruned when they exceed the maximum age (default 30h).
 * 
 * @example
 * ```typescript
 * const baseline = snapshotStore.loadBaseline(DASHBOARD.BASELINE_TARGET_AGE_MS);
 * // ... compute dashboard from baseline vs current ...
 * snapshotStore.appendIfDue(allTrades, getDeviation);
 * ```
 */
class SnapshotStore {
    // ========================================================================
    // Load
    // ========================================================================

    /**
     * Load all snapshots from localStorage.
     * Handles migration from three legacy formats:
     * 1. Compact format (current): `{ keys, snapshots: [{ t, v }] }`
     * 2. History format (v2): `{ snapshots: [{ timestamp, trades }] }`
     * 3. Single snapshot (v1): `{ timestamp, trades }`
     * Returns an empty array if nothing is stored or data is invalid.
     */
    loadAll(): TradeSnapshot[] {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.SNAPSHOT);
            if (!stored) { return []; }

            const parsed: unknown = JSON.parse(stored);

            // Try compact format first (current)
            const compactResult = CompactSnapshotHistorySchema.safeParse(parsed);
            if (compactResult.success) {
                return unpackSnapshots(compactResult.data);
            }

            // Try v2 history format
            const historyResult = SnapshotHistorySchema.safeParse(parsed);
            if (historyResult.success) {
                return historyResult.data.snapshots;
            }

            // Fall back to v1 single-snapshot format
            const legacyResult = TradeSnapshotSchema.safeParse(parsed);
            if (legacyResult.success) {
                return [legacyResult.data];
            }

            return [];
        } catch {
            return [];
        }
    }

    /**
     * Load the baseline snapshot closest to the target age.
     * Returns the snapshot whose age is nearest to targetAgeMs,
     * or the oldest snapshot if none is old enough.
     * Returns undefined if no snapshots exist.
     * 
     * @param targetAgeMs - Desired baseline age in milliseconds (default: 24h)
     */
    loadBaseline(targetAgeMs: number = DASHBOARD.BASELINE_TARGET_AGE_MS): TradeSnapshot | undefined {
        const snapshots = this.loadAll();
        if (snapshots.length === 0) { return undefined; }

        const now = Date.now();
        const firstSnapshot = snapshots[0];
        if (!firstSnapshot) { return undefined; }
        let bestSnapshot = firstSnapshot;
        let bestDelta = Math.abs(now - bestSnapshot.timestamp - targetAgeMs);

        for (const snapshot of snapshots) {
            const delta = Math.abs(now - snapshot.timestamp - targetAgeMs);
            if (delta < bestDelta) {
                bestDelta = delta;
                bestSnapshot = snapshot;
            }
        }

        return bestSnapshot;
    }

    /**
     * Load the most recent snapshot from the history.
     * Returns undefined if no snapshots exist.
     */
    loadLatest(): TradeSnapshot | undefined {
        const snapshots = this.loadAll();
        return snapshots.length > 0 ? snapshots.at(-1) : undefined;
    }

    // ========================================================================
    // Save
    // ========================================================================

    /**
     * Append a new snapshot if enough time has passed since the last one.
     * Also prunes snapshots older than SNAPSHOT_MAX_AGE_MS.
     * Always saves if no snapshots exist yet.
     * 
     * @param trades - All current trades
     * @param getDeviation - Deviation calculator for current item values
     * @returns true if a new snapshot was saved
     */
    appendIfDue(
        trades: Trade[],
        getDeviation: (trade: Trade) => DeviationResult | undefined
    ): boolean {
        const snapshots = this.loadAll();
        const now = Date.now();

        // Check if enough time has passed since the most recent snapshot
        const latest = snapshots.at(-1);
        if (latest && (now - latest.timestamp) < DASHBOARD.SNAPSHOT_INTERVAL_MS) {
            return false;
        }

        // Build the new snapshot
        const newSnapshot = this.buildSnapshot(trades, getDeviation, now);

        // Prune old snapshots and append new one
        const pruned = snapshots.filter(
            (s) => (now - s.timestamp) < DASHBOARD.SNAPSHOT_MAX_AGE_MS
        );
        pruned.push(newSnapshot);

        this.persist(pruned);
        return true;
    }

    /**
     * Save a snapshot of current trade state to localStorage (legacy API).
     * Appends to the history unconditionally (bypasses interval check).
     * 
     * @param trades - All current trades
     * @param getDeviation - Deviation calculator for current item values
     */
    save(
        trades: Trade[],
        getDeviation: (trade: Trade) => DeviationResult | undefined
    ): void {
        const snapshot = this.buildSnapshot(trades, getDeviation);

        const snapshots = this.loadAll();
        const now = Date.now();
        const pruned = snapshots.filter(
            (s) => (now - s.timestamp) < DASHBOARD.SNAPSHOT_MAX_AGE_MS
        );
        pruned.push(snapshot);

        this.persist(pruned);
    }

    // ========================================================================
    // Utility
    // ========================================================================

    /**
     * Clear all stored snapshots (for testing or reset)
     */
    clear(): void {
        try {
            localStorage.removeItem(STORAGE_KEYS.SNAPSHOT);
        } catch {
            // Ignore
        }
    }

    // ========================================================================
    // Private
    // ========================================================================

    /** Build an expanded TradeSnapshot from current trades */
    private buildSnapshot(
        trades: Trade[],
        getDeviation: (trade: Trade) => DeviationResult | undefined,
        timestamp: number = Date.now()
    ): TradeSnapshot {
        const entries: Record<string, TradeSnapshotEntry> = {};

        for (const trade of trades) {
            const key = getTradeKey(trade);
            const deviation = getDeviation(trade);
            entries[key] = {
                deviationPercent: deviation?.percent,
                stock: trade.displayStock
            };
        }

        return { timestamp, trades: entries };
    }

    /** Persist snapshot array to localStorage in compact format */
    private persist(snapshots: TradeSnapshot[]): void {
        const compact = packSnapshots(snapshots);
        try {
            localStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(compact));
        } catch {
            // Storage full or unavailable - ignore
        }
    }
}

/** Singleton snapshot store instance */
export const snapshotStore = new SnapshotStore();
