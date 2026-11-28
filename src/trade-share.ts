/**
 * Pure text for sharing a trade: its coordinates, or a sentence to paste in chat.
 *
 * @module trade-share
 */

import { getCostParts } from './library.js';
import { isNether } from './map/map-math.js';
import type { FilterResult, Trade } from './types.js';

/**
 * Coordinates as Minecraft shows them, e.g. for pasting into a chat or a note.
 * @param trade - Trade whose shop location is shared
 * @returns "x y z"
 */
export function formatCoordinates(trade: Readonly<Pick<Trade, 'x' | 'y' | 'z'>>): string {
    return `${trade.x} ${trade.y} ${trade.z}`;
}

/**
 * Where a shop is, with the dimension named when it is not the overworld.
 * @param trade - Trade whose shop location is described
 * @returns e.g. "120, 64, -300" or "12, 64, 5 in the Nether"
 */
function describeLocation(trade: Readonly<Pick<Trade, 'x' | 'y' | 'z' | 'world'>>): string {
    const coordinates = `${trade.x}, ${trade.y}, ${trade.z}`;
    if (isNether(trade.world)) { return `${coordinates} in the Nether`; }
    if (trade.world.toLowerCase().includes('end')) { return `${coordinates} in the End`; }
    return coordinates;
}

/**
 * A sentence offering the trade, ready to paste in chat.
 * @param result - Search result for the trade (shulker contents counted in the item and amount)
 * @returns e.g. "ValeriaShares sells 1 Diamond for 1 Emerald at 120, 64, -300"
 */
export function formatChatMessage(result: Readonly<Pick<FilterResult, 'displayName' | 'displayAmount'>> & { readonly trade: Trade }): string {
    const { trade, displayName, displayAmount } = result;
    const cost = getCostParts(trade).map(part => `${part.amount} ${part.name}`).join(' + ');
    const seller = trade.shopOwner ? `${trade.shopOwner} sells` : 'Selling';
    return `${seller} ${displayAmount} ${displayName} for ${cost} at ${describeLocation(trade)}`;
}
