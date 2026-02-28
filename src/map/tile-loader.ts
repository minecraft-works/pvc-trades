/**
 * Tile Loader Module
 * 
 * Handles tile loading, manifest management, and coordinate utilities for
 * Leaflet maps. Tiles are added to the map by passing their URL directly to
 * Leaflet's imageOverlay — the browser's HTTP cache handles deduplication and
 * persistence across sessions. Because imageOverlay never sets opacity:0 on its
 * img element, progressive PNG tiles render Adam7 pass-by-pass as bytes
 * arrive, even on a cold cache.
 * 
 * @module map/tile-loader
 */

import debug from 'debug';
import { z } from 'zod';

import { getWorldId } from '../library.js';
import { getConfig } from '../stores/config-store.js';
import {
    blocksPerTile as pyramidBlocksPerTile,
    canonicalTileUrl,
    coarsenTile,
    detailLevel,
    detailToOverviewRatio as pyramidDetailToOverviewRatio,
    overviewLevel
} from '../tile-pyramid.js';
import type { LoadTileOptions, ManifestEntry, TileConfig } from './tile-types.js';
import { ManifestEntrySchema } from './tile-types.js';

// Leaflet is loaded as a global from CDN
declare const L: typeof import('leaflet');

const debugTiles = debug('tiles');

// ============================================================================
// Configuration
// ============================================================================

/**
 * Tile configuration derived from the pyramid config in config.json.
 *
 * Dynamic properties (tileSize, detailLevel, overviewLevel, overviewTileBlocks,
 * detailToOverviewRatio) are getters that read from the app config,
 * so they update automatically when configuration changes.
 */
export const TILE_CONFIG: TileConfig = {
    get tileSize() { return getConfig().tilePyramid.baseBlocksPerTile; },
    baseUrl: 'tiles',
    get maxZoom() { return detailLevel(getConfig().tilePyramid); },
    get fallbackZoom() { return overviewLevel(); },
    minZoom: 1,
    playersUrl: 'players.json',
    get overviewTileBlocks() { return pyramidBlocksPerTile(overviewLevel(), getConfig().tilePyramid); },
    get detailToOverviewRatio() {
        return pyramidDetailToOverviewRatio(getConfig().tilePyramid);
    },
    get format() { return getConfig().tilePyramid.format; }
};

// ============================================================================
// Cache State (Module-scoped)
// ============================================================================

/**
 * Global cache for tile manifest (which tiles exist)
 * Key format: "world/blocksPerTile/x/z" -> true
 */
let tileManifestCache: Set<string> | undefined;
let manifestLoadPromise: Promise<Set<string>> | undefined;

/** Raw parsed manifest entries (includes heightmap metadata) */
let rawManifestEntries: ManifestEntry[] | undefined;

// ============================================================================
// Manifest Functions
// ============================================================================

/**
 * Load the tile manifest (cached globally)
 * 
 * @returns Set of manifest keys in format "world/blocksPerTile/x/z"
 */
export async function loadTileManifest(): Promise<Set<string>> {
    // If already loaded, return it
    if (tileManifestCache !== undefined) {
        debugTiles('manifest: returning cached manifest size=%d', tileManifestCache.size);
        return tileManifestCache;
    }
    
    // If loading is in progress, wait for it
    if (manifestLoadPromise !== undefined) {
        debugTiles('manifest: waiting for in-progress load');
        return manifestLoadPromise;
    }
    
    // Start loading - DON'T set tileManifestCache until fetch completes
    // This prevents race conditions where empty cache is returned
    debugTiles('manifest: starting fresh load from %s/manifest.json', TILE_CONFIG.baseUrl);
    manifestLoadPromise = (async () => {
        const newCache = new Set<string>();
        try {
            const response = await fetch(`${TILE_CONFIG.baseUrl}/manifest.json`);
            if (!response.ok) {
                debugTiles('manifest: fetch failed status=%d', response.status);
                tileManifestCache = newCache;
                return newCache;
            }

            const json: unknown = await response.json();
            const parsed = z.array(ManifestEntrySchema).safeParse(json);
            if (parsed.success) {
                debugTiles('manifest: fetched %d entries', parsed.data.length);
                rawManifestEntries = parsed.data as ManifestEntry[];
                for (const entry of parsed.data) {
                    // Normalize world name to match what getWorldId returns
                    const normalizedWorld = getWorldId(entry.world);
                    const key = `${normalizedWorld}/${entry.blocksPerTile}/${entry.tileX}/${entry.tileZ}`;
                    newCache.add(key);
                }
                debugTiles('manifest: processed into %d unique keys', newCache.size);
            }
        } catch (error) {
            console.warn('Failed to load tile manifest');
            debugTiles('manifest: fetch error %o', error);
        }
        // Only set the global cache AFTER loading completes
        tileManifestCache = newCache;
        return newCache;
    })();
    
    return manifestLoadPromise;
}

/**
 * Check if a tile exists in the manifest
 * 
 * @param manifest - The manifest Set to check
 * @param world - World identifier
 * @param blocksPerTile - Blocks per tile at the target pyramid level
 * @param tx - Tile X coordinate
 * @param tz - Tile Z coordinate
 * @returns true if tile exists in manifest
 */
export function tileExistsInManifest(
    manifest: Set<string>, 
    world: string, 
    blocksPerTile: number, 
    tx: number, 
    tz: number
): boolean {
    const key = `${world}/${blocksPerTile}/${tx}/${tz}`;
    const exists = manifest.has(key);
    debugTiles('checkManifest: key=%s exists=%s', key, exists);
    return exists;
}

// ============================================================================
// Tile Loading Functions
// ============================================================================

/**
 * Load a tile and add it to a map via direct URL.
 *
 * The browser's HTTP cache prevents redundant downloads between map sessions.
 * Within a session, `addedToMap` prevents duplicate overlay elements.
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

    const pyramid = getConfig().tilePyramid;
    const url = canonicalTileUrl({ world: worldId, level: zoom, tileX: tx, tileZ: tz }, pyramid);
    const overlayOptions: L.ImageOverlayOptions = pane ? { pane } : {};
    debugTiles('loadTile: ADD url=%s', url);
    L.imageOverlay(url, bounds, overlayOptions).addTo(map);
}

// ============================================================================
// Coordinate Utilities
// ============================================================================

/**
 * Calculate overview tile coordinates from detail tile coordinates.
 *
 * Uses the pyramid config to derive the correct ratio.
 *
 * @param detailTileX - Detail-level tile X coordinate
 * @param detailTileZ - Detail-level tile Z coordinate
 * @returns Overview tile coordinates
 */
export function calculateOverviewCoords(detailTileX: number, detailTileZ: number): { x: number; z: number } {
    const pyramid = getConfig().tilePyramid;
    const result = coarsenTile(detailTileX, detailTileZ, detailLevel(pyramid), overviewLevel(), pyramid);
    return { x: result.tileX, z: result.tileZ };
}

// ============================================================================
// Cache Access (for shop map integration)
// ============================================================================

// NOTE: getCachedTileUrl / setCachedTileUrl removed — tiles are now loaded via
// direct URL. The browser HTTP cache replaces the in-memory blob cache.

// ============================================================================
// Manifest Raw Entries
// ============================================================================

/**
 * Get the raw parsed manifest entries (includes heightmap metadata).
 *
 * Returns entries only after `loadTileManifest()` has completed.
 * If the manifest hasn't been loaded yet, returns an empty array.
 *
 * @returns Array of manifest entries with heightmap metadata
 */
export function getManifestEntries(): readonly ManifestEntry[] {
    return rawManifestEntries ?? [];
}

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Clear all caches (for testing)
 * @internal
 */
export function _clearCaches(): void {
    tileManifestCache = undefined;
    manifestLoadPromise = undefined;
    rawManifestEntries = undefined;
}
