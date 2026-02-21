/**
 * Tile Loader Module
 * 
 * Handles tile loading, caching, and manifest management for Leaflet maps.
 * Provides shared functionality for both shop maps and navigation maps.
 * 
 * @module map/tile-loader
 */

import debug from 'debug';
import type { TileConfig, LoadTileOptions, ManifestEntry } from './tile-types.js';
import { getWorldId } from '../library.js';

// Leaflet is loaded as a global from CDN
declare const L: typeof import('leaflet');

const debugTiles = debug('tiles');

// ============================================================================
// Configuration
// ============================================================================

/** Default tile configuration */
export const TILE_CONFIG: TileConfig = {
    tileSize: 512,      // pixels per tile (and blocks per tile at maxZoom)
    baseUrl: 'tiles',
    maxZoom: 8,         // highest detail zoom level (1 pixel = 1 block)
    fallbackZoom: 4,    // base map zoom level for fallback
    minZoom: 1,         // lowest detail zoom level
    playersUrl: 'players.json'
};

/** Zoom 4 tile size (16x the base tile) */
export const ZOOM4_TILE_SIZE = TILE_CONFIG.tileSize * 16;

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
let manifestLoadPromise: Promise<void> | undefined;

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
        await manifestLoadPromise;
        debugTiles('manifest: in-progress load complete size=%d', (tileManifestCache as Set<string> | undefined)?.size ?? 0);
        return tileManifestCache ?? new Set();
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
    })();
    
    await manifestLoadPromise;
    return tileManifestCache ?? new Set();
}

/**
 * Check if a tile exists in the manifest
 * 
 * @param manifest - The manifest Set to check
 * @param world - World identifier
 * @param blocksPerTile - Blocks per tile (512 for zoom8, 8192 for zoom4)
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
    const url = `${TILE_CONFIG.baseUrl}/${worldId}/${zoom}/${tx}/${tz}.png`;
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
            if (map.getContainer()?.isConnected) {
                debugTiles('loadTile: ADDED to map cacheKey=%s', cacheKey);
                L.imageOverlay(blobUrl, bounds, overlayOptions).addTo(map);
            } else {
                debugTiles('loadTile: MAP GONE cacheKey=%s (still cached)', cacheKey);
            }
        })
        .catch((error) => {
            debugTiles('loadTile: ERROR url=%s error=%o', url, error);
        });
}

// ============================================================================
// Coordinate Utilities
// ============================================================================

/**
 * Calculate zoom 4 tile coordinates from zoom 8 coordinates
 * 
 * @param z8x - Zoom 8 tile X coordinate
 * @param z8z - Zoom 8 tile Z coordinate
 * @returns Zoom 4 tile coordinates
 */
export function calculateZoom4Coords(z8x: number, z8z: number): { x: number; z: number } {
    return {
        x: Math.floor(z8x / 16),
        z: Math.floor(z8z / 16)
    };
}

// ============================================================================
// Cache Access (for shop map integration)
// ============================================================================

/**
 * Get a cached tile blob URL if available.
 * @param worldId - World identifier
 * @param zoom - Zoom level (4 or 8)
 * @param tx - Tile X coordinate
 * @param tz - Tile Z coordinate
 * @returns Blob URL if cached, undefined otherwise
 */
export function getCachedTileUrl(worldId: string, zoom: number, tx: number, tz: number): string | undefined {
    const cacheKey = `${worldId}/${zoom}/${tx}/${tz}`;
    return tileBlobCache.get(cacheKey);
}

/**
 * Cache a tile blob URL for future reuse.
 * @param worldId - World identifier
 * @param zoom - Zoom level (4 or 8)
 * @param tx - Tile X coordinate
 * @param tz - Tile Z coordinate
 * @param blobUrl - The blob URL to cache
 */
export function setCachedTileUrl(worldId: string, zoom: number, tx: number, tz: number, blobUrl: string): void {
    const cacheKey = `${worldId}/${zoom}/${tx}/${tz}`;
    tileBlobCache.set(cacheKey, blobUrl);
}

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Get the current blob cache size (for testing)
 * @internal
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
