/**
 * Tile Loader Module
 * 
 * Handles tile loading, caching, and manifest management for Leaflet maps.
 * Provides shared functionality for both shop maps and navigation maps.
 * 
 * @module map/tile-loader
 */

import debug from 'debug';

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
import type { LoadTileOptions, ManifestEntry,TileConfig } from './tile-types.js';

// Leaflet is loaded as a global from CDN
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- CDN global, not an importable module
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

/**
 * @deprecated Remove after all callers migrate to pyramid-based values.
 * Use `TILE_CONFIG.overviewTileBlocks` instead.
 */
export const OVERVIEW_TILE_SIZE = 512 * 16; // Legacy: only correct for Dynmap default

// ============================================================================
// Cache State (Module-scoped)
// ============================================================================

/**
 * Global cache for tile blob URLs (persists across map sessions)
 * Key format: "world/zoom/x/z" -> blob URL
 */
const tileBlobCache = new Map<string, string>();

/**
 * Global cache for tile manifest (which tiles exist)
 * Key format: "world/blocksPerTile/x/z" -> true
 */
let tileManifestCache: Set<string> | undefined;
let manifestLoadPromise: Promise<Set<string>> | undefined;

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
            if (response.ok) {
                const manifest = await response.json() as ManifestEntry[];
                debugTiles('manifest: fetched %d entries', manifest.length);
                for (const entry of manifest) {
                    // Normalize world name to match what getWorldId returns
                    const normalizedWorld = getWorldId(entry.world);
                    const key = `${normalizedWorld}/${entry.blocksPerTile}/${entry.tileX}/${entry.tileZ}`;
                    newCache.add(key);
                }
                debugTiles('manifest: processed into %d unique keys', newCache.size);
            } else {
                debugTiles('manifest: fetch failed status=%d', response.status);
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
 * Load a tile and add it to a map (non-blocking, uses cache)
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
    
    const cacheKey = `${worldId}/${zoom}/${tx}/${tz}`;
    const overlayOptions: L.ImageOverlayOptions = pane ? { pane } : {};
    
    // Check if we already have this tile cached
    const cachedBlobUrl = tileBlobCache.get(cacheKey);
    if (cachedBlobUrl) {
        debugTiles('loadTile: CACHE HIT cacheKey=%s', cacheKey);
        L.imageOverlay(cachedBlobUrl, bounds, overlayOptions).addTo(map);
        return;
    }
    
    // Fire-and-forget: load tile without blocking
    const pyramid = getConfig().tilePyramid;
    const url = canonicalTileUrl({ world: worldId, level: zoom, tileX: tx, tileZ: tz }, pyramid);
    debugTiles('loadTile: FETCH url=%s', url);
    fetch(url)
        .then(async response => {
            if (!response.ok) {
                debugTiles('loadTile: FETCH FAIL url=%s status=%d', url, response.status);
                return;
            }
            debugTiles('loadTile: FETCH OK url=%s', url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            tileBlobCache.set(cacheKey, blobUrl);
            // Check map still exists before adding
            if (map.getContainer().isConnected) {
                debugTiles('loadTile: ADDED to map cacheKey=%s', cacheKey);
                L.imageOverlay(blobUrl, bounds, overlayOptions).addTo(map);
            } else {
                debugTiles('loadTile: MAP GONE cacheKey=%s (still cached)', cacheKey);
            }
        })
        .catch((error: unknown) => {
            debugTiles('loadTile: ERROR url=%s error=%o', url, error);
        });
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

/**
 * Get a cached tile blob URL if available.
 * @param worldId - World identifier
 * @param level - Pyramid level
 * @param tx - Tile X coordinate
 * @param tz - Tile Z coordinate
 * @returns Blob URL if cached, undefined otherwise
 */
export function getCachedTileUrl(worldId: string, level: number, tx: number, tz: number): string | undefined {
    const cacheKey = `${worldId}/${level}/${tx}/${tz}`;
    return tileBlobCache.get(cacheKey);
}

/**
 * Cache a tile blob URL for future reuse.
 * @param worldId - World identifier
 * @param level - Pyramid level
 * @param tx - Tile X coordinate
 * @param tz - Tile Z coordinate
 * @param blobUrl - The blob URL to cache
 */
export function setCachedTileUrl(worldId: string, level: number, tx: number, tz: number, blobUrl: string): void {
    const cacheKey = `${worldId}/${level}/${tx}/${tz}`;
    tileBlobCache.set(cacheKey, blobUrl);
}

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Get the current blob cache size (for testing)
 * @internal
 * @returns Number of cached blob URLs currently held in memory
 */
export function _getBlobCacheSize(): number {
    return tileBlobCache.size;
}

/**
 * Clear all caches (for testing)
 * @internal
 */
export function _clearCaches(): void {
    tileBlobCache.clear();
    tileManifestCache = undefined;
    manifestLoadPromise = undefined;
}
