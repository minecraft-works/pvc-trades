/**
 * Trade Snapshot Store
 * 
 * Persists a rolling history of trade state snapshots between sessions.
 * The dashboard compares current data against a baseline snapshot that is
 * approximately 24 hours old, providing a stable "since yesterday" comparison.
 * 
 * New snapshots are appended every ~6 hours, and entries older than ~30 hours
 * are pruned to keep localStorage usage bounded (~1.7 MB for ~6 snapshots).
 * 
 * @module stores/snapshot-store
 */

import type { Trade, TradeSnapshot, TradeSnapshotEntry, SnapshotHistory } from '../types.js';
import { TradeSnapshotSchema, SnapshotHistorySchema } from '../types.js';
import { STORAGE_KEYS, DASHBOARD } from '../constants.js';
import { getTradeKey } from '../library.js';
import type { DeviationResult } from '../search/deviation.js';

// ============================================================================
// Snapshot Store
// ============================================================================

/**
 * Store for persisting a rolling history of trade state snapshots.
 * 
 * Maintains multiple snapshots in localStorage so the dashboard baseline
 * is always approximately 24 hours old. Snapshots are saved at intervals
 * (default 6h) and pruned when they exceed the maximum age (default 30h).
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
     * Handles migration from legacy single-snapshot format.
     * Returns an empty array if nothing is stored or data is invalid.
     */
    loadAll(): TradeSnapshot[] {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.SNAPSHOT);
            if (!stored) { return []; }

            const parsed: unknown = JSON.parse(stored);

            // Try new history format first
            const historyResult = SnapshotHistorySchema.safeParse(parsed);
            if (historyResult.success) {
                return historyResult.data.snapshots;
            }

            // Fall back to legacy single-snapshot format (migration)
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
        let bestSnapshot = snapshots[0]!;
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
        const entries: Record<string, TradeSnapshotEntry> = {};
        for (const trade of trades) {
            const key = getTradeKey(trade);
            const deviation = getDeviation(trade);
            entries[key] = {
                deviationPercent: deviation?.percent,
                stock: trade.displayStock
            };
        }

        const newSnapshot: TradeSnapshot = {
            timestamp: now,
            trades: entries
        };

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
        const entries: Record<string, TradeSnapshotEntry> = {};

        for (const trade of trades) {
            const key = getTradeKey(trade);
            const deviation = getDeviation(trade);
            entries[key] = {
                deviationPercent: deviation?.percent,
                stock: trade.displayStock
            };
        }

        const snapshot: TradeSnapshot = {
            timestamp: Date.now(),
            trades: entries
        };

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

    /** Persist snapshot array to localStorage */
    private persist(snapshots: TradeSnapshot[]): void {
        const history: SnapshotHistory = { snapshots };
        try {
            localStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(history));
        } catch {
            // Storage full or unavailable - ignore
        }
    }
}

/** Singleton snapshot store instance */
export const snapshotStore = new SnapshotStore();
