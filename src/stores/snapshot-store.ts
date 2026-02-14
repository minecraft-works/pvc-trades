/**
 * Trade Snapshot Store
 * 
 * Persists a snapshot of trade state (deviation + stock) between sessions.
 * Used by the Daily Deals Dashboard to detect new trades, price drops,
 * and watchlist hits since the user's last visit.
 * 
 * @module stores/snapshot-store
 */

import type { Trade, TradeSnapshot, TradeSnapshotEntry } from '../types.js';
import { TradeSnapshotSchema } from '../types.js';
import { STORAGE_KEYS } from '../constants.js';
import { getTradeKey } from '../library.js';
import type { DeviationResult } from '../search/deviation.js';

// ============================================================================
// Snapshot Store
// ============================================================================

/**
 * Store for persisting trade state snapshots between browser sessions.
 * 
 * Saves a compact snapshot of all trades (deviation % and stock) to localStorage.
 * On next visit, the previous snapshot is loaded and compared against current
 * data to generate the deals dashboard.
 * 
 * @example
 * ```typescript
 * const previous = snapshotStore.load();
 * // ... compute dashboard from previous vs current ...
 * snapshotStore.save(allTrades, getDeviation);
 * ```
 */
class SnapshotStore {
    // ========================================================================
    // Load
    // ========================================================================

    /**
     * Load the previous snapshot from localStorage.
     * Returns undefined if no snapshot exists or data is invalid.
     */
    load(): TradeSnapshot | undefined {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.SNAPSHOT);
            if (!stored) { return undefined; }

            const parsed: unknown = JSON.parse(stored);
            const result = TradeSnapshotSchema.safeParse(parsed);
            return result.success ? result.data : undefined;
        } catch {
            return undefined;
        }
    }

    // ========================================================================
    // Save
    // ========================================================================

    /**
     * Save a snapshot of current trade state to localStorage.
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

        try {
            localStorage.setItem(STORAGE_KEYS.SNAPSHOT, JSON.stringify(snapshot));
        } catch {
            // Storage full or unavailable - ignore
        }
    }

    // ========================================================================
    // Utility
    // ========================================================================

    /**
     * Clear the stored snapshot (for testing or reset)
     */
    clear(): void {
        try {
            localStorage.removeItem(STORAGE_KEYS.SNAPSHOT);
        } catch {
            // Ignore
        }
    }
}

/** Singleton snapshot store instance */
export const snapshotStore = new SnapshotStore();
