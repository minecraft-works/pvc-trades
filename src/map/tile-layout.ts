/**
 * Squaremap tile layout.
 *
 * The map server publishes a native zoom pyramid at
 * `{baseUrl}/tiles/minecraft_{world}/{zoom}/{tileX}_{tileZ}.png`.
 * Tiles are 512×512 px; at the highest zoom (8) one pixel is one block.
 * Each lower zoom doubles the area covered by a tile.
 *
 * The app works with pyramid *levels* (0 = coarsest overview, highest = detail).
 * Level `n` maps to server zoom `n + MIN_SERVER_ZOOM`.
 *
 * @module map/tile-layout
 */

/** Highest server zoom (1 px = 1 block) */
const MAX_SERVER_ZOOM = 8;

/** Number of pyramid levels the app uses (server zooms 4–8) */
const PYRAMID_LEVELS = 5;

/** Blocks covered by one tile at the detail level */
export const DETAIL_BLOCKS_PER_TILE = 512;

const MIN_SERVER_ZOOM = MAX_SERVER_ZOOM - (PYRAMID_LEVELS - 1);

/** Highest-resolution pyramid level */
export const DETAIL_LEVEL = PYRAMID_LEVELS - 1;

/** Coarsest pyramid level */
export const OVERVIEW_LEVEL = 0;

/**
 * Blocks covered by one tile at a pyramid level.
 *
 * @param level - Pyramid level (0 = overview, {@link DETAIL_LEVEL} = detail)
 * @returns Blocks per tile edge
 */
export function blocksPerTile(level: number): number {
    return DETAIL_BLOCKS_PER_TILE * 2 ** (DETAIL_LEVEL - level);
}

/**
 * Number of detail tiles per overview tile along one axis.
 *
 * @returns Detail-to-overview tile ratio
 */
export function detailToOverviewRatio(): number {
    return blocksPerTile(OVERVIEW_LEVEL) / DETAIL_BLOCKS_PER_TILE;
}

/** Options for building a tile URL */
export interface TileUrlOptions {
    /** Map server base URL, e.g. `https://example.com/maps` */
    baseUrl: string;
    /** Normalized world name (`overworld`, `the_nether`, `the_end`) */
    world: string;
    /** Pyramid level */
    level: number;
    tileX: number;
    tileZ: number;
}

/**
 * Build the URL of a tile on the map server.
 *
 * @param options - Server, world, level and tile coordinates
 * @returns Absolute tile URL
 *
 * @example
 * tileUrl({ baseUrl: 'https://m.example/maps', world: 'overworld', level: 4, tileX: 3, tileZ: -2 })
 * // 'https://m.example/maps/tiles/minecraft_overworld/8/3_-2.png'
 */
export function tileUrl(options: Readonly<TileUrlOptions>): string {
    const zoom = options.level + MIN_SERVER_ZOOM;
    return `${options.baseUrl}/tiles/minecraft_${options.world}/${String(zoom)}/${String(options.tileX)}_${String(options.tileZ)}.png`;
}

/**
 * Convert tile coordinates from a finer level to a coarser one.
 *
 * @param tileX - Tile X at the finer level
 * @param tileZ - Tile Z at the finer level
 * @param fromLevel - Finer (source) level
 * @param toLevel - Coarser (target) level
 * @returns Tile coordinates at the target level
 */
export function coarsenTile(
    tileX: number,
    tileZ: number,
    fromLevel: number,
    toLevel: number,
): { tileX: number; tileZ: number } {
    const ratio = blocksPerTile(toLevel) / blocksPerTile(fromLevel);
    return { tileX: Math.floor(tileX / ratio), tileZ: Math.floor(tileZ / ratio) };
}
