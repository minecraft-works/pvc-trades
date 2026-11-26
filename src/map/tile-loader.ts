/**
 * Tile Loader Module
 * 
 * Adds map tiles to Leaflet maps. Tiles are requested straight from the map
 * server by the browser (as plain `<img>` elements via `imageOverlay`), so the
 * browser HTTP cache handles deduplication and persistence across sessions.
 *
 * The server rejects requests whose `Referer` is another site, so the page
 * sends no referrer (see the `referrer` meta tag in index.html). The server
 * answers 200 with an empty body for tiles it has not rendered; those fail to
 * decode and are removed from the map again.
 * 
 * @module map/tile-loader
 */

import debug from 'debug';

import { getConfig } from '../stores/config-store.js';
import {
    blocksPerTile,
    coarsenTile,
    DETAIL_BLOCKS_PER_TILE,
    DETAIL_LEVEL,
    detailToOverviewRatio,
    OVERVIEW_LEVEL,
    tileUrl,
} from './tile-layout.js';
import type { LoadTileOptions, TileConfig } from './tile-types.js';

// Leaflet is loaded as a global from CDN
declare const L: typeof import('leaflet');

const debugTiles = debug('tiles');

// ============================================================================
// Configuration
// ============================================================================

/** Tile grid configuration derived from the server's zoom pyramid */
export const TILE_CONFIG: TileConfig = {
    tileSize: DETAIL_BLOCKS_PER_TILE,
    maxZoom: DETAIL_LEVEL,
    fallbackZoom: OVERVIEW_LEVEL,
    overviewTileBlocks: blocksPerTile(OVERVIEW_LEVEL),
    detailToOverviewRatio: detailToOverviewRatio(),
};

// ============================================================================
// Tile Loading Functions
// ============================================================================

/**
 * Get the map server URL of a tile.
 *
 * @param worldId - Normalized world name (overworld, the_nether)
 * @param level - Pyramid level
 * @param tx - Tile X coordinate at that level
 * @param tz - Tile Z coordinate at that level
 * @returns Absolute tile URL
 */
export function getTileUrl(worldId: string, level: number, tx: number, tz: number): string {
    return tileUrl({ level, baseUrl: getConfig().squaremap.baseUrl, world: worldId, tileX: tx, tileZ: tz });
}

/**
 * Add a tile image to a map. If the server has no tile there, the overlay is
 * removed again so no broken image stays in the DOM.
 *
 * @param map - Leaflet map to add the tile to
 * @param url - Tile image URL
 * @param bounds - Bounds for the tile overlay
 * @param pane - Optional pane name for z-ordering
 */
export function addTileOverlay(
    map: L.Map,
    url: string,
    bounds: L.LatLngBoundsExpression,
    pane?: string,
): void {
    const overlay = L.imageOverlay(url, bounds, pane ? { pane } : {});
    overlay.on('error', () => {
        debugTiles('tile missing: %s', url);
        overlay.remove();
    });
    debugTiles('loadTile: ADD url=%s', url);
    overlay.addTo(map);
}

/**
 * Load a tile and add it to a map. Within a session, `addedToMap` prevents
 * duplicate overlay elements.
 *
 * @param options - Tile loading options
 */
export function loadTileToMap(options: LoadTileOptions): void {
    const { map, worldId, zoom, tx, tz, bounds, addedToMap, pane } = options;
    const mapKey = `z${zoom}:${tx},${tz}`;
    if (addedToMap.has(mapKey)) {
        debugTiles('loadTile: SKIP already added mapKey=%s', mapKey);
        return;
    }
    addedToMap.add(mapKey);
    addTileOverlay(map, getTileUrl(worldId, zoom, tx, tz), bounds, pane);
}

// ============================================================================
// Coordinate Utilities
// ============================================================================

/**
 * Calculate overview tile coordinates from detail tile coordinates.
 *
 * @param detailTileX - Detail-level tile X coordinate
 * @param detailTileZ - Detail-level tile Z coordinate
 * @returns Overview tile coordinates
 */
export function calculateOverviewCoords(detailTileX: number, detailTileZ: number): { x: number; z: number } {
    const result = coarsenTile(detailTileX, detailTileZ, DETAIL_LEVEL, OVERVIEW_LEVEL);
    return { x: result.tileX, z: result.tileZ };
}
