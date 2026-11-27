/**
 * Unit tests for src/dashboard/dashboard-data.ts
 */
import { describe, expect, test } from 'vitest';

import { getTradeKey } from '../map/map-math.js';
import type { FavoriteItem, Trade, TradeSnapshot } from '../types.js';
import { computeDashboardData, formatRelativeTime } from './dashboard-data.js';

// ============================================================================
// formatRelativeTime
// ============================================================================

describe('formatRelativeTime', () => {
    const NOW = 1_000_000_000;

    test('returns "just now" for less than 1 minute', () => {
        expect(formatRelativeTime(NOW - 30_000, NOW)).toBe('just now');
        expect(formatRelativeTime(NOW - 59_999, NOW)).toBe('just now');
    });

    test('returns minutes for less than 1 hour', () => {
        expect(formatRelativeTime(NOW - 60_000, NOW)).toBe('1m ago');
        expect(formatRelativeTime(NOW - 1_800_000, NOW)).toBe('30m ago');
        expect(formatRelativeTime(NOW - 3_599_999, NOW)).toBe('59m ago');
    });

    test('returns hours for less than 1 day', () => {
        expect(formatRelativeTime(NOW - 3_600_000, NOW)).toBe('1h ago');
        expect(formatRelativeTime(NOW - 43_200_000, NOW)).toBe('12h ago');
        expect(formatRelativeTime(NOW - 86_399_999, NOW)).toBe('23h ago');
    });

    test('returns days for 24+ hours', () => {
        expect(formatRelativeTime(NOW - 86_400_000, NOW)).toBe('1d ago');
        expect(formatRelativeTime(NOW - 172_800_000, NOW)).toBe('2d ago');
    });
});

// ============================================================================
// computeDashboardData
// ============================================================================

/**
 * Minimal trade factory for dashboard tests
 * @param overrides - Property overrides to merge into the default trade object
 * @returns A Trade object with default values merged with any provided overrides
 */
function makeDashboardTrade(overrides: Partial<Trade> = {}): Trade {
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
        stock: 10,
        displayStock: 10,
        ...overrides,
    } as Trade;
}

/**
 * Deviation calculator returning a fixed percent
 * @param percent - The fixed deviation percent to always return
 * @returns A deviation calculator function that always returns the given percent
 */
function fixedPercent(percent: number) {
    return () => ({ percent });
}

/**
 * Deviation calculator selecting percent by x-coordinate
 * @param x1Percent - Percent returned for trades at x=100
 * @param otherPercent - Percent returned for all other trades
 * @returns A deviation calculator function that branches on the trade's x coordinate
 */
function percentByX(x1Percent: number, otherPercent: number) {
    return (t: Trade) => t.x === 100 ? { percent: x1Percent } : { percent: otherPercent };
}

/**
 * Deviation calculator that returns undefined
 * @returns Always undefined, simulating a trade with no computable deviation
 */
function noDeviationResult(): undefined {
    return;
}

/**
 * Returns deviation based on trade x-coord: x=100 gets first percent, others get second
 * @param atX100 - Deviation percent for trades at x=100
 * @param other - Deviation percent for all other trades
 * @returns A deviation calculator function that branches on trade x coordinate
 */
function deviationByCoord(atX100: number, other: number) {
    return (t: Trade) => t.x === 100 ? { percent: atX100 } : { percent: other };
}

/**
 * Get an item by index, failing the test when it does not exist.
 * @param items - Items to index into
 * @param index - Index of the item to return
 * @returns The item at `index`
 */
function itemAt<T>(items: readonly T[], index: number): T {
    const item = items[index];
    if (item === undefined) {
        throw new Error(`Expected an item at index ${index}`);
    }
    return item;
}

describe('computeDashboardData', () => {
    const BASE_SNAPSHOT: TradeSnapshot = {
        timestamp: Date.now() - 3_600_000,
        trades: {},
    };

    test('returns empty data when no previous snapshot', () => {
        const trades = [makeDashboardTrade()];
        const result = computeDashboardData(trades, fixedPercent(0), undefined, []);

        expect(result.newTradeKeys).toHaveLength(0);
        expect(result.priceDrops).toHaveLength(0);
        expect(result.watchlistHits).toHaveLength(0);
        expect(result.lastVisit).toBeUndefined();
    });

    test('detects new trades not in previous snapshot', () => {
        const trades = [makeDashboardTrade()];
        const result = computeDashboardData(trades, fixedPercent(0), BASE_SNAPSHOT, []);

        expect(result.newTradeKeys).toHaveLength(1);
    });

    test('does not flag existing trades as new', () => {
        const trade = makeDashboardTrade();
        const key = getTradeKey(trade);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: { [key]: { deviationPercent: 10, stock: 5 } },
        };
        const result = computeDashboardData([trade], fixedPercent(5), snapshot, []);

        expect(result.newTradeKeys).toHaveLength(0);
    });

    test('detects price drops meeting threshold', () => {
        const trade = makeDashboardTrade();
        const key = getTradeKey(trade);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: { [key]: { deviationPercent: 20, stock: 10 } },
        };
        // Deviation dropped from 20% to 5% — improvement of 15pp (≥5pp threshold)
        const result = computeDashboardData([trade], fixedPercent(5), snapshot, []);

        expect(result.priceDrops).toHaveLength(1);
        expect(itemAt(result.priceDrops, 0).oldDeviation).toBe(20);
        expect(itemAt(result.priceDrops, 0).newDeviation).toBe(5);
    });

    test('ignores price changes below threshold', () => {
        const trade = makeDashboardTrade();
        const key = getTradeKey(trade);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: { [key]: { deviationPercent: 10, stock: 10 } },
        };
        // Only 3pp improvement — below 5pp threshold
        const result = computeDashboardData([trade], fixedPercent(7), snapshot, []);

        expect(result.priceDrops).toHaveLength(0);
    });

    test('detects watchlist hits for favorited items', () => {
        const trade = makeDashboardTrade({ resultName: 'Diamond' });
        const favorites: FavoriteItem[] = [
            { itemName: 'diamond', maxDeviation: 10, addedAt: 1 },
        ];
        const result = computeDashboardData([trade], fixedPercent(-5), BASE_SNAPSHOT, favorites);

        expect(result.watchlistHits).toHaveLength(1);
        expect(itemAt(result.watchlistHits, 0).itemName).toBe('Diamond');
        expect(itemAt(result.watchlistHits, 0).currentDeviation).toBe(-5);
    });

    test('excludes watchlist items exceeding maxDeviation', () => {
        const trade = makeDashboardTrade({ resultName: 'Diamond' });
        const favorites: FavoriteItem[] = [
            { itemName: 'diamond', maxDeviation: -10, addedAt: 1 },
        ];
        // Current deviation is 5%, maxDeviation is -10% — does not meet threshold
        const result = computeDashboardData([trade], fixedPercent(5), BASE_SNAPSHOT, favorites);

        expect(result.watchlistHits).toHaveLength(0);
    });

    test('includes lastVisit from previous snapshot', () => {
        const result = computeDashboardData([], noDeviationResult, BASE_SNAPSHOT, []);
        expect(result.lastVisit).toBe(BASE_SNAPSHOT.timestamp);
    });

    test('keeps best deal per favorite item', () => {
        const trade1 = makeDashboardTrade({ resultName: 'Diamond', x: 100 });
        const trade2 = makeDashboardTrade({ resultName: 'Diamond', x: 200 });
        const favorites: FavoriteItem[] = [
            { itemName: 'diamond', maxDeviation: undefined, addedAt: 1 },
        ];

        const result = computeDashboardData([trade1, trade2], percentByX(10, -5), BASE_SNAPSHOT, favorites);

        expect(result.watchlistHits).toHaveLength(1);
        expect(itemAt(result.watchlistHits, 0).currentDeviation).toBe(-5);
    });

    test('sorts price drops by improvement magnitude', () => {
        const trade1 = makeDashboardTrade({ resultName: 'Diamond', x: 100 });
        const trade2 = makeDashboardTrade({ resultName: 'Iron ingot', x: 200 });
        const key1 = getTradeKey(trade1);
        const key2 = getTradeKey(trade2);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: {
                [key1]: { deviationPercent: 30, stock: 10 },
                [key2]: { deviationPercent: 50, stock: 10 },
            },
        };

        const result = computeDashboardData([trade1, trade2], percentByX(20, 10), snapshot, []);

        expect(result.priceDrops).toHaveLength(2);
        // trade2 improved more: 50→10 (40pp) vs trade1: 30→20 (10pp)
        expect(itemAt(result.priceDrops, 0).itemName).toBe('Iron ingot');
        expect(itemAt(result.priceDrops, 1).itemName).toBe('Diamond');
    });

    test('excludes price drops when a better deal already exists for the same item', () => {
        // Two trades for the same item at different shops
        const tradeA = makeDashboardTrade({ resultName: 'Potato', x: 100 });
        const tradeB = makeDashboardTrade({ resultName: 'Potato', x: 200, shopName: 'OtherShop' });
        const keyA = getTradeKey(tradeA);
        const keyB = getTradeKey(tradeB);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: {
                [keyA]: { deviationPercent: -40, stock: 10 },  // Already -40%
                [keyB]: { deviationPercent: 0, stock: 10 },    // Was 0%
            },
        };

        // tradeA stays at -40%, tradeB drops to -20%
        const result = computeDashboardData([tradeA, tradeB], deviationByCoord(-40, -20), snapshot, []);

        // tradeB improved by 20pp, but tradeA at -40% is still the better deal
        // so tradeB's drop should NOT appear — it's not the global best
        expect(result.priceDrops).toHaveLength(0);
    });

    test('includes price drop when it becomes the new global best for the item', () => {
        const tradeA = makeDashboardTrade({ resultName: 'Potato', x: 100 });
        const tradeB = makeDashboardTrade({ resultName: 'Potato', x: 200, shopName: 'OtherShop' });
        const keyA = getTradeKey(tradeA);
        const keyB = getTradeKey(tradeB);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: {
                [keyA]: { deviationPercent: -30, stock: 10 },
                [keyB]: { deviationPercent: 0, stock: 10 },
            },
        };
        // tradeA stays at -30%, tradeB drops to -50% (new global best)
        const result = computeDashboardData([tradeA, tradeB], deviationByCoord(-30, -50), snapshot, []);

        expect(result.priceDrops).toHaveLength(1);
        expect(itemAt(result.priceDrops, 0).newDeviation).toBe(-50);
        expect(itemAt(result.priceDrops, 0).oldDeviation).toBe(0);
    });

    test('excludes out-of-stock trades from price drops', () => {
        const trade = makeDashboardTrade({ stock: 0, displayStock: 0 });
        const key = getTradeKey(trade);
        const snapshot: TradeSnapshot = {
            ...BASE_SNAPSHOT,
            trades: { [key]: { deviationPercent: -50, stock: 10 } },
        };
        // Trade improved from -50% to -80%, but stock is 0 — should be excluded
        const result = computeDashboardData([trade], fixedPercent(-80), snapshot, []);

        expect(result.priceDrops).toHaveLength(0);
    });

    test('excludes out-of-stock trades from new trade detection', () => {
        const trade = makeDashboardTrade({ stock: 0, displayStock: 0 });
        const result = computeDashboardData([trade], fixedPercent(0), BASE_SNAPSHOT, []);

        expect(result.newTradeKeys).toHaveLength(0);
    });

    test('excludes out-of-stock trades from watchlist hits', () => {
        const trade = makeDashboardTrade({ resultName: 'Diamond', stock: 0, displayStock: 0 });
        const favorites: FavoriteItem[] = [
            { itemName: 'diamond', maxDeviation: 10, addedAt: 1 },
        ];
        const result = computeDashboardData([trade], fixedPercent(-5), BASE_SNAPSHOT, favorites);

        expect(result.watchlistHits).toHaveLength(0);
    });
});
