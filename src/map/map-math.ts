/**
 * Map Coordinate Utilities
 *
 * Pure functions for Minecraft↔Leaflet coordinate conversions,
 * tile offsets, zoom calculations, and world-type detection.
 *
 * @module map/map-math
 */

import { getTileCoords } from '../tile-coords.js';

// ============================================================================
// World Detection
// ============================================================================

/**
 * Check if a world name represents the Nether dimension.
 *
 * @param world - World name (e.g., 'world_nether', 'minecraft:the_nether')
 * @returns true if world is the Nether
 *
 * @example
 * isNether('world_nether')        // true
 * isNether('minecraft:the_nether') // true
 * isNether('world')               // false
 */
export function isNether(world: string): boolean {
    return world.toLowerCase().includes('nether');
}

/** Item fields that distinguish otherwise identical trades */
interface TradeKeyItem {
    readonly amount: number;
    readonly name?: string | undefined;
    readonly lore?: readonly string[] | undefined;
    readonly enchant?: Readonly<Record<string, number>> | undefined;
}

/**
 * Short, stable FNV-1a hash (base 36) for compact keys
 * @param text - Text to hash
 * @returns Base-36 hash
 */
function hashString(text: string): string {
    let hash = 0x81_1C_9D_C5;
    for (const char of text) {
        hash ^= char.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
    }
    return hash.toString(36);
}

function itemExtras(item: TradeKeyItem | undefined): string {
    if (!item) { return ''; }
    const enchant = Object.entries(item.enchant ?? {}).map(([key, level]) => `${key}=${level}`).toSorted((a, b) => a.localeCompare(b));
    const extras = [...(item.lore ?? []), ...enchant];
    if (extras.length === 0) { return ''; }
    // A filled shulker box shows its contents, so its name ("mending") is only kept here
    if (item.name) { extras.push(`name=${item.name}`); }
    return extras.join('\n');
}

/**
 * Generate a unique key for a trade based on location, items and amounts.
 * Used for cart persistence, navigation progress, snapshots and row identity.
 *
 * The readable prefix is `x,y,z,world,result,cost`. Amounts and a hash of
 * lore/enchantments are appended when known, so two trades at the same shop
 * that differ only in amount or in shulker contents get different keys.
 *
 * @param trade - Trade with location and item info
 * @param trade.x - X coordinate in Minecraft blocks
 * @param trade.y - Y coordinate (height) in Minecraft blocks
 * @param trade.z - Z coordinate in Minecraft blocks
 * @param trade.world - World name (e.g., 'overworld', 'the_nether')
 * @param trade.costName - Display name of the cost item
 * @param trade.resultName - Display name of the result item
 * @param trade.resultAmount - Amount received (optional)
 * @param trade.resultItem - Received item stack (optional)
 * @param trade.item1 - First cost item stack (optional)
 * @param trade.item2 - Second cost item stack (optional)
 * @returns Unique string key
 *
 * @example
 * getTradeKey(trade) // '100,64,-200,overworld,Diamond,Shulker box|3:1#k2x9f1'
 */
export function getTradeKey(trade: {
    x: number; y: number; z: number; world: string; costName: string; resultName: string;
    resultAmount?: number; resultItem?: TradeKeyItem; item1?: TradeKeyItem; item2?: TradeKeyItem | undefined;
}): string {
    const base = `${trade.x},${trade.y},${trade.z},${trade.world},${trade.resultName},${trade.costName}`;
    if (trade.item1 === undefined || trade.resultAmount === undefined) { return base; }

    const amounts = [trade.resultAmount, trade.item1.amount, trade.item2?.amount]
        .filter(amount => amount !== undefined)
        .join(':');
    const extras = [trade.resultItem, trade.item1, trade.item2].map(item => itemExtras(item));
    const hash = extras.some(Boolean) ? `#${hashString(extras.join('\u0000'))}` : '';
    return `${base}|${amounts}${hash}`;
}

/**
 * Get world ID for tile URLs from world name.
 * Normalizes various Minecraft world name formats to tile path names.
 *
 * @param world - World name in any format
 * @returns Normalized world ID ('overworld', 'the_nether', or 'the_end')
 *
 * @example
 * getWorldId('world')              // 'overworld'
 * getWorldId('minecraft:the_nether') // 'the_nether'
 * getWorldId('world_the_end')      // 'the_end'
 */
export function getWorldId(world: string): string {
    const lower = world.toLowerCase();
    if (lower.includes('nether')) {
        return 'the_nether';
    }
    if (lower.includes('end')) {
        return 'the_end';
    }
    return 'overworld';
}

/**
 * Determine if the navigation map should switch to a different world.
 *
 * @param previousWorld - The world the player was in before (normalized)
 * @param currentWorld - The world the player is now in (normalized)
 * @param currentMapWorld - The world the map is currently showing (normalized)
 * @param shopsInCurrentWorld - Number of uncompleted shops in the player's current world
 * @returns true if the map should switch to show the player's current world
 */
export function shouldSwitchMapWorld(
    previousWorld: string | undefined,
    currentWorld: string,
    currentMapWorld: string,
    shopsInCurrentWorld: number
): boolean {
    // No previous position - can't determine if world changed
    if (!previousWorld) {
        return false;
    }

    // Player didn't change worlds
    if (previousWorld === currentWorld) {
        return false;
    }

    // Map is already showing the player's current world
    if (currentWorld === currentMapWorld) {
        return false;
    }

    // Player changed worlds AND map is showing different world AND there are shops in player's world
    return shopsInCurrentWorld > 0;
}

// ============================================================================
// Tile & Coordinate Conversions
// ============================================================================

/**
 * Calculate offset within a tile (0 to tileSize-1).
 *
 * @param x - Minecraft X coordinate
 * @param z - Minecraft Z coordinate
 * @param tileSize - Size of tiles in blocks (default 512)
 * @returns Offset within tile { offsetX, offsetZ }
 *
 * @example
 * getTileOffset(600, -100, 512) // { offsetX: 88, offsetZ: 412 }
 */
export function getTileOffset(x: number, z: number, tileSize = 512): { offsetX: number; offsetZ: number } {
    const { tileX, tileZ } = getTileCoords(x, z, tileSize);
    return {
        offsetX: x - tileX * tileSize,
        offsetZ: z - tileZ * tileSize
    };
}

/**
 * Calculate Leaflet zoom level needed to fit content in a container.
 * Uses CRS.Simple formula: pixels = units × 2^zoom
 *
 * @param containerSize - Container size in pixels
 * @param contentSize - Content size in coordinate units
 * @returns Zoom level (can be fractional)
 *
 * @example
 * calculateFitZoom(800, 512) // ~0.64 (content slightly smaller than container)
 */
export function calculateFitZoom(containerSize: number, contentSize: number): number {
    return Math.log2(containerSize / contentSize);
}

/**
 * Convert Minecraft coordinates to Leaflet CRS.Simple latLng.
 * In CRS.Simple, lat = -z (inverted), lng = x.
 *
 * @param x - Minecraft X coordinate
 * @param z - Minecraft Z coordinate
 * @param tileSize - Tile size for offset calculation
 * @returns Leaflet-compatible { lat, lng }
 *
 * @example
 * toLeafletCoords(100, 200) // { lat: -200 % 512, lng: 100 % 512 }
 */
export function toLeafletCoords(
    x: number,
    z: number,
    tileSize = 512
): { lat: number; lng: number } {
    const { offsetX, offsetZ } = getTileOffset(x, z, tileSize);
    return {
        lat: -offsetZ,  // Invert Z for screen coords (negative = down)
        lng: offsetX
    };
}

/**
 * Convert Minecraft world coordinates to Leaflet coords relative to a center tile.
 * Used for placing markers (like players) relative to a shop's tile.
 * @param x - Minecraft X coordinate in blocks
 * @param z - Minecraft Z coordinate in blocks
 * @param centerTileX - X tile coordinate of the center tile
 * @param centerTileZ - Z tile coordinate of the center tile
 * @param tileSize - Size of tiles in blocks (default 512)
 * @returns Leaflet-compatible { lat, lng } relative to the center tile
 */
export function toLeafletCoordsRelative(
    x: number,
    z: number,
    centerTileX: number,
    centerTileZ: number,
    tileSize = 512
): { lat: number; lng: number } {
    // Calculate the block offset from the center tile's origin
    const centerOriginX = centerTileX * tileSize;
    const centerOriginZ = centerTileZ * tileSize;

    const relativeX = x - centerOriginX;
    const relativeZ = z - centerOriginZ;

    return {
        lat: -relativeZ,  // Invert Z for screen coords
        lng: relativeX
    };
}

/**
 * Convert Leaflet coords back to Minecraft world coordinates relative to a center tile.
 * Inverse of toLeafletCoordsRelative.
 * @param lat - Leaflet latitude (negative Z)
 * @param lng - Leaflet longitude (X)
 * @param centerTileX - X tile coordinate of the center tile
 * @param centerTileZ - Z tile coordinate of the center tile
 * @param tileSize - Size of tiles in blocks (default 512)
 * @returns Minecraft block coordinates { x, z }
 */
export function fromLeafletCoordsRelative(
    lat: number,
    lng: number,
    centerTileX: number,
    centerTileZ: number,
    tileSize = 512
): { x: number; z: number } {
    const centerOriginX = centerTileX * tileSize;
    const centerOriginZ = centerTileZ * tileSize;

    return {
        x: Math.round(lng + centerOriginX),
        z: Math.round(-lat + centerOriginZ)  // Invert back from screen coords
    };
}

/**
 * Clamp a point to the edge of a circle if it's outside.
 * Returns the original point if inside, or the nearest point on the circle edge if outside.
 *
 * @param lat - Latitude (y coordinate)
 * @param lng - Longitude (x coordinate)
 * @param centerLat - Circle center latitude
 * @param centerLng - Circle center longitude
 * @param radius - Circle radius in coordinate units
 * @returns The clamped coordinates and whether the point was outside
 */
export function clampToCircle(
    lat: number,
    lng: number,
    centerLat: number,
    centerLng: number,
    radius: number
): { lat: number; lng: number; clamped: boolean } {
    const dx = lng - centerLng;
    const dy = lat - centerLat;
    const distance = Math.hypot(dx, dy);

    if (distance <= radius) {
        return { lat, lng, clamped: false };
    }

    // Normalize and scale to circle edge
    const scale = radius / distance;
    return {
        lat: centerLat + dy * scale,
        lng: centerLng + dx * scale,
        clamped: true
    };
}
