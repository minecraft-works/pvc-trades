/**
 * Daily Deals Dashboard Data Computation
 *
 * Pure functions for computing dashboard data by comparing current trades
 * against a previous snapshot. Detects new trades, price drops, and
 * watchlist hits.
 *
 * @module dashboard/dashboard-data
 */

import {
    type Trade,
    type TradeSnapshot,
    type TradeSnapshotEntry,
    type FavoriteItem,
    type DashboardData,
    type PriceDrop,
    type WatchlistHit,
} from '../types.js';

import { getTradeKey } from '../map/map-math.js';

// ============================================================================
// Public API
// ============================================================================

/**
 * Format a timestamp as a relative time string (e.g., "14h ago", "2d ago").
 *
 * @param timestamp - The past timestamp to format
 * @param now - The current time (default: Date.now()), injectable for testing
 * @returns Human-readable relative time string
 *
 * @example
 * formatRelativeTime(Date.now() - 3_600_000)  // "1h ago"
 * formatRelativeTime(Date.now() - 86_400_000) // "1d ago"
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
    const diffMs = now - timestamp;
    const minutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(diffMs / 86_400_000);

    if (minutes < 1) { return 'just now'; }
    if (minutes < 60) { return `${minutes}m ago`; }
    if (hours < 24) { return `${hours}h ago`; }
    return `${days}d ago`;
}

/**
 * Compute dashboard data by comparing current trades against a previous snapshot.
 * Pure function: no side effects.
 *
 * @param currentTrades - All current trades
 * @param getDeviation - Function to calculate deviation for a trade
 * @param previousSnapshot - Previously saved snapshot (undefined on first visit)
 * @param favorites - User's watchlist items
 * @param dropThreshold - Minimum deviation improvement (percentage points) to count as a price drop
 * @returns Dashboard data with new trades, price drops, and watchlist hits
 */
export function computeDashboardData(
    currentTrades: Trade[],
    getDeviation: (trade: Trade) => { percent: number } | undefined,
    previousSnapshot: TradeSnapshot | undefined,
    favorites: FavoriteItem[],
    dropThreshold: number = 5
): DashboardData {
    const newTradeKeysList: string[] = [];
    const priceDrops: PriceDrop[] = [];
    const watchlistHitMap = new Map<string, WatchlistHit>();

    const favoritesByName = new Map<string, FavoriteItem>();
    for (const fav of favorites) {
        favoritesByName.set(fav.itemName.toLowerCase(), fav);
    }

    const previousTrades = previousSnapshot?.trades ?? {};
    const bestDeviationByItem = buildBestDeviationMap(currentTrades, getDeviation);

    const tradeContext: DashboardTradeContext = {
        getDeviation, previousSnapshot, previousTrades,
        favoritesByName, dropThreshold,
        newTradeKeysList, priceDrops, watchlistHitMap
    };

    for (const trade of currentTrades) {
        processDashboardTrade(trade, tradeContext);
    }

    const filteredDrops = filterToGlobalBestDrops(priceDrops, bestDeviationByItem);
    filteredDrops.sort((a, b) => (a.newDeviation - a.oldDeviation) - (b.newDeviation - b.oldDeviation));

    return {
        newTradeKeys: newTradeKeysList,
        priceDrops: filteredDrops,
        watchlistHits: [...watchlistHitMap.values()],
        lastVisit: previousSnapshot?.timestamp
    };
}

// ============================================================================
// Private Helpers
// ============================================================================

/**
 * Check if a trade is new (not in previous snapshot).
 */
function isNewTrade(key: string, previousSnapshot: TradeSnapshot | undefined, previousTrades: Record<string, TradeSnapshotEntry>): boolean {
    return Boolean(previousSnapshot) && !(key in previousTrades);
}

/**
 * Check if a trade has a price drop exceeding the threshold.
 */
function detectPriceDrop(
    trade: Trade,
    key: string,
    deviation: { percent: number } | undefined,
    previous: TradeSnapshotEntry | undefined,
    dropThreshold: number
): PriceDrop | undefined {
    if (!previous || !deviation || previous.deviationPercent === undefined) {
        return undefined;
    }
    const improvement = previous.deviationPercent - deviation.percent;
    if (improvement < dropThreshold) {
        return undefined;
    }
    return {
        tradeKey: key,
        itemName: trade.resultName,
        oldDeviation: previous.deviationPercent,
        newDeviation: deviation.percent
    };
}

/**
 * Update the watchlist hit map with the best deal per favorite item.
 */
function updateWatchlistHit(
    trade: Trade,
    deviation: { percent: number },
    previousDeviation: number | undefined,
    favorite: FavoriteItem,
    watchlistHitMap: Map<string, WatchlistHit>
): void {
    const meetsThreshold = favorite.maxDeviation === undefined
        || deviation.percent <= favorite.maxDeviation;
    if (!meetsThreshold) { return; }

    const normalizedName = trade.resultName.toLowerCase();
    const existing = watchlistHitMap.get(normalizedName);
    if (existing && deviation.percent >= existing.currentDeviation) { return; }

    watchlistHitMap.set(normalizedName, {
        itemName: trade.resultName,
        currentDeviation: deviation.percent,
        previousDeviation
    });
}

/**
 * Build a map of the best (lowest) current deviation per item across all trades.
 */
function buildBestDeviationMap(
    trades: Trade[],
    getDeviation: (trade: Trade) => { percent: number } | undefined
): Map<string, number> {
    const map = new Map<string, number>();
    for (const trade of trades) {
        const deviation = trade.stock > 0 ? getDeviation(trade) : undefined;
        if (!deviation) { continue; }
        const name = trade.resultName.toLowerCase();
        const existing = map.get(name);
        if (existing === undefined || deviation.percent < existing) {
            map.set(name, deviation.percent);
        }
    }
    return map;
}

/**
 * Filter price drops to only those that resulted in the global best price for their item.
 * If an item has a better deal from another trade, the drop isn't interesting to the user.
 * When multiple drops for the same item tie for best, keep only the one with the largest improvement.
 */
function filterToGlobalBestDrops(
    drops: PriceDrop[],
    bestDeviationByItem: Map<string, number>
): PriceDrop[] {
    // First pass: only keep drops where the new deviation matches the global best
    const globalBestDrops = drops.filter(drop => {
        const best = bestDeviationByItem.get(drop.itemName.toLowerCase());
        return best !== undefined && drop.newDeviation <= best;
    });

    // Second pass: deduplicate per item, keeping the largest improvement
    const bestPerItem = new Map<string, PriceDrop>();
    for (const drop of globalBestDrops) {
        const normalizedName = drop.itemName.toLowerCase();
        const existing = bestPerItem.get(normalizedName);
        const improvement = drop.oldDeviation - drop.newDeviation;
        const existingImprovement = existing ? existing.oldDeviation - existing.newDeviation : -1;
        if (improvement > existingImprovement) {
            bestPerItem.set(normalizedName, drop);
        }
    }

    return [...bestPerItem.values()];
}

/** Context for processing a single trade within dashboard computation */
interface DashboardTradeContext {
    readonly getDeviation: (trade: Trade) => { percent: number } | undefined;
    readonly previousSnapshot: TradeSnapshot | undefined;
    readonly previousTrades: Record<string, TradeSnapshotEntry>;
    readonly favoritesByName: Map<string, FavoriteItem>;
    readonly dropThreshold: number;
    readonly newTradeKeysList: string[];
    readonly priceDrops: PriceDrop[];
    readonly watchlistHitMap: Map<string, WatchlistHit>;
}

/** Process a single trade for dashboard: detect new trades, price drops, and watchlist hits */
function processDashboardTrade(trade: Trade, context: DashboardTradeContext): void {
    // Skip out-of-stock trades — they are hidden from search results,
    // so reporting them in the dashboard would confuse users (see filterTrade).
    if (trade.stock === 0) { return; }

    const key = getTradeKey(trade);
    const currentDeviation = context.getDeviation(trade);
    const previous = context.previousTrades[key];

    if (isNewTrade(key, context.previousSnapshot, context.previousTrades)) {
        context.newTradeKeysList.push(key);
    }

    const drop = detectPriceDrop(trade, key, currentDeviation, previous, context.dropThreshold);
    if (drop) {
        context.priceDrops.push(drop);
    }

    const normalizedName = trade.resultName.toLowerCase();
    const favorite = context.favoritesByName.get(normalizedName);
    if (favorite && currentDeviation) {
        const previousDeviation = context.previousSnapshot ? previous?.deviationPercent : undefined;
        updateWatchlistHit(trade, currentDeviation, previousDeviation, favorite, context.watchlistHitMap);
    }
}
