/**
 * Snapshot and dashboard types for trade deviation tracking.
 *
 * Extracted from types.ts to keep file sizes under the lint limit.
 * Re-exported from types.ts so existing imports are unaffected.
 */

import { z } from 'zod';

// ============================================================================
// Snapshot Types (Daily Deals Dashboard)
// ============================================================================

/**
 * A snapshot of a single trade's state at a point in time.
 * Used to detect price changes and new trades between sessions.
 */
export interface TradeSnapshotEntry {
    /** Deviation percentage from median market price (undefined if not calculable) */
    deviationPercent?: number | undefined;
    /** Stock level at snapshot time */
    stock: number;
}

/**
 * Result of a deviation calculation.
 * Moved to types.ts to break circular dependency between stores and search.
 */
export interface DeviationResult {
    /** The ratio of actual price to expected price (>1 = paying more) */
    readonly ratio: number;
    /** Percentage deviation, clamped to [-99, 999] for display */
    readonly percent: number;
    /** Display text like "+10%" or "−5%" */
    readonly text: string;
    /** True if good deal (negative deviation), false if bad, undefined if neutral */
    readonly isGood: boolean | undefined;
}

const TradeSnapshotEntrySchema = z.object({
    deviationPercent: z.number().optional(),
    stock: z.number().int().nonnegative()
});

/**
 * Full snapshot of all trade state, persisted between sessions.
 */
export interface TradeSnapshot {
    /** When this snapshot was saved (Date.now()) */
    timestamp: number;
    /** Trade states keyed by getTradeKey() */
    trades: Record<string, TradeSnapshotEntry>;
}

export const TradeSnapshotSchema = z.object({
    timestamp: z.number().positive(),
    trades: z.record(z.string(), TradeSnapshotEntrySchema)
});

/**
 * Zod schema for v2 history format (used for migration only).
 * The SnapshotHistory interface was removed — only the schema is needed.
 */
export const SnapshotHistorySchema = z.object({
    snapshots: z.array(TradeSnapshotSchema)
});

// ============================================================================
// Compact Snapshot Storage (localStorage-optimized)
// ============================================================================

/**
 * A single snapshot in compact storage form.
 * Values array is parallel to the shared keys array.
 */
export interface CompactSnapshot {
    /** Timestamp (ms since epoch) */
    t: number;
    /** Values parallel to keys: [deviationPercent | null, stock] */
    v: [number | null, number][];
}

/**
 * Compact localStorage format: keys stored once, snapshots as parallel arrays.
 * Reduces storage from ~280 KB/snapshot to ~27 KB/snapshot for ~3400 trades.
 */
export interface CompactSnapshotHistory {
    /** Trade keys, stored once (shared across all snapshots) */
    keys: string[];
    /** Compact snapshots with values parallel to keys */
    snapshots: CompactSnapshot[];
}

const CompactSnapshotSchema = z.object({
    t: z.number().positive(),
    v: z.array(z.tuple([z.number().nullable(), z.number().int().nonnegative()]))
});

export const CompactSnapshotHistorySchema = z.object({
    keys: z.array(z.string()),
    snapshots: z.array(CompactSnapshotSchema)
});

/**
 * A price drop detected between two snapshots.
 */
export interface PriceDrop {
    /** Trade key for lookup */
    tradeKey: string;
    /** Display name of the result item */
    itemName: string;
    /** Previous deviation percentage */
    oldDeviation: number;
    /** Current deviation percentage */
    newDeviation: number;
}

/**
 * A watchlist item that currently has a deal.
 */
export interface WatchlistHit {
    /** Normalized item name */
    itemName: string;
    /** Current best deviation for this item */
    currentDeviation: number;
    /** Previous deviation for this item (undefined if new) */
    previousDeviation: number | undefined;
}

/**
 * Computed dashboard data from comparing snapshots.
 */
export interface DashboardData {
    /** Trade keys that are new since last visit */
    readonly newTradeKeys: readonly string[];
    /** Trades where deviation improved by ≥5 percentage points */
    readonly priceDrops: readonly PriceDrop[];
    /** Watchlist items with active deals */
    readonly watchlistHits: readonly WatchlistHit[];
    /** Timestamp of previous snapshot (for "14h ago" display) */
    readonly lastVisit: number | undefined;
}
