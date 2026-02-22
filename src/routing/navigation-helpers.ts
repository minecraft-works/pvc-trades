/**
 * Shopping & Navigation Helper Functions
 *
 * Pure functions for aggregating shopping lists, calculating route
 * distances, building marker content, and height-based zoom.
 *
 * @module routing/navigation-helpers
 */

import { ZOOM_HEIGHT } from '../constants.js';
import { formatName } from '../library.js';
import { type RouteStop,type ShoppingList, type Trade } from '../types.js';
import { calculateRouteDistance } from './route-optimizer.js';

// ============================================================================
// Public API
// ============================================================================

/**
 * Aggregate shopping list costs and gains from cart items.
 * Pure function - takes cart items, returns aggregated totals.
 *
 * @param cartItems - Array of cart items with trade and quantity
 * @returns ShoppingList with costs and gains maps
 *
 * @example
 * const list = aggregateShoppingList(cart);
 * console.log(list.costs.get('Diamond')); // Total diamonds needed
 */
export function aggregateShoppingList(cartItems: Array<{ trade: Trade; quantity: number }>): ShoppingList {
    const costs = new Map<string, number>();
    const gains = new Map<string, number>();

    for (const cartItem of cartItems) {
        const { trade, quantity } = cartItem;
        // Aggregate costs
        const cost1Name = formatName(trade.item1);
        const cost1Amount = trade.item1.amount * quantity;
        costs.set(cost1Name, (costs.get(cost1Name) ?? 0) + cost1Amount);

        if (trade.item2) {
            const cost2Name = formatName(trade.item2);
            const cost2Amount = trade.item2.amount * quantity;
            costs.set(cost2Name, (costs.get(cost2Name) ?? 0) + cost2Amount);
        }

        // Aggregate gains
        const gainAmount = trade.resultAmount * quantity;
        gains.set(trade.resultName, (gains.get(trade.resultName) ?? 0) + gainAmount);
    }

    return { costs, gains };
}

/**
 * Calculate total route distance across all stops.
 * Accounts for cross-dimension travel (overworld/nether coordinate scaling).
 *
 * @param route - Array of route stops to calculate distance for
 * @param startX - Starting X coordinate (default 0)
 * @param startZ - Starting Z coordinate (default 0)
 * @param startWorld - Starting world (default 'overworld')
 * @returns Total distance in blocks
 *
 * @example
 * const route = computeRoute(cart);
 * const distance = calculateTotalRouteDistance(route, playerX, playerZ, 'overworld');
 */
export function calculateTotalRouteDistance(
    route: RouteStop[],
    startX = 0,
    startZ = 0,
    startWorld = 'overworld'
): number {
    if (route.length === 0) { return 0; }

    let total = 0;
    let previousX = startX;
    let previousZ = startZ;
    let previousWorld = startWorld;

    for (const stop of route) {
        total += calculateRouteDistance(previousX, previousZ, previousWorld, stop.x, stop.z, stop.world);
        previousX = stop.x;
        previousZ = stop.z;
        previousWorld = stop.world;
    }

    return total;
}

/**
 * Build marker HTML content for a route stop.
 * Pure function for generating Leaflet marker HTML.
 *
 * @param isCompleted - Whether the stop is marked as visited
 * @param index - Display index for incomplete stops (ignored if completed)
 * @param isNetherStop - Whether this is a nether stop (shows fire indicator)
 * @returns HTML string for the marker content
 */
export function buildMarkerContent(isCompleted: boolean, index: number, isNetherStop: boolean): string {
    const netherIndicator = isNetherStop ? '<span class="nether-indicator">🔥</span>' : '';
    if (isCompleted) {
        return `<div class="nav-marker nav-marker--completed">✓${netherIndicator}</div>`;
    }
    return `<div class="nav-marker">${index}${netherIndicator}</div>`;
}

/**
 * Build tooltip text for a route stop.
 * Shows item info and coordinates, with special formatting for nether stops.
 *
 * @param stop - The route stop to build tooltip for
 * @param isCompleted - Whether the stop is marked as visited
 * @returns Multi-line tooltip string
 */
export function buildStopTooltip(stop: RouteStop, isCompleted: boolean): string {
    let text = stop.cartItem
        ? `${stop.cartItem.quantity}× ${stop.cartItem.trade.resultName}`
        : 'Stop';

    if (isCompleted) {
        text = `✓ ${text} (completed)`;
    }

    if (stop.isNether) {
        text += `\nNether: ${stop.x}, ${stop.z}`;
        text += `\n(OW: ${stop.displayX}, ${stop.displayZ})`;
    }
    return text;
}

/**
 * Calculate zoom level based on player Y coordinate (height).
 * Uses linear interpolation between ground level and high altitude.
 * At or below MIN_HEIGHT → MAX_ZOOM (closest).
 * At or above MAX_HEIGHT → MIN_ZOOM (furthest).
 * Between them → linearly interpolated.
 *
 * @param y - Player Y coordinate (height in Minecraft blocks)
 * @returns Zoom level (continuous) from MIN_ZOOM to MAX_ZOOM
 *
 * @example
 * getZoomForHeight(63);  // 2 (ground level — max zoom)
 * getZoomForHeight(300); // -3 (high altitude — min zoom)
 * getZoomForHeight(181.5); // ~-0.5 (midpoint)
 */
export function getZoomForHeight(y: number): number {
    const { MIN_HEIGHT, MAX_HEIGHT, MAX_ZOOM, MIN_ZOOM } = ZOOM_HEIGHT;

    if (y <= MIN_HEIGHT) { return MAX_ZOOM; }
    if (y >= MAX_HEIGHT) { return MIN_ZOOM; }

    // Linear interpolation: t goes from 0 (ground) to 1 (max altitude)
    const t = (y - MIN_HEIGHT) / (MAX_HEIGHT - MIN_HEIGHT);
    return MAX_ZOOM + t * (MIN_ZOOM - MAX_ZOOM);
}

/** Simple position for movement comparison */
interface SimplePosition {
    x: number;
    z: number;
}

/**
 * Check if a player position has moved beyond a threshold.
 * Used to determine when to update UI or recalculate routes.
 *
 * @param previous - Previous position (if undefined, returns true)
 * @param current - Current position
 * @param threshold - Distance threshold in blocks
 * @returns True if position moved beyond threshold or previous is undefined
 *
 * @example
 * hasPositionMoved({ x: 0, z: 0 }, { x: 5, z: 5 }, 10);  // false (within threshold)
 * hasPositionMoved({ x: 0, z: 0 }, { x: 15, z: 0 }, 10); // true (beyond threshold)
 * hasPositionMoved(undefined, { x: 0, z: 0 }, 10);       // true (no previous)
 */
export function hasPositionMoved(
    previous: SimplePosition | undefined,
    current: SimplePosition,
    threshold: number
): boolean {
    if (!previous) { return true; }
    return Math.abs(previous.x - current.x) > threshold || Math.abs(previous.z - current.z) > threshold;
}
