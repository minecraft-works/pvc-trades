/**
 * Tile Provider Registry
 *
 * Manages the active tile provider and re-exports all provider types.
 * The active provider determines tile size, detail levels, URL patterns,
 * and image processing for the entire application.
 *
 * Default: Dynmap (matching current behavior).
 * Call `setActiveTileProvider()` during app initialization to switch.
 *
 * @module map/providers
 */

import { DynmapTileProvider } from './dynmap-provider.js';
import type { TileProvider } from './tile-provider.js';

// Re-export provider implementations
export { BlueMapTileProvider, encodeCoordPath } from './bluemap-provider.js';
export { DynmapTileProvider } from './dynmap-provider.js';
// Re-export types and utilities
export type { DetailLevel, ProcessedTile, TileProvider } from './tile-provider.js';

// ============================================================================
// Active Provider (module singleton)
// ============================================================================

/**
 * The currently active tile provider.
 *
 * Defaults to Dynmap with empty source URL (source URL is only
 * needed by build scripts, not at runtime).
 */
let activeProvider: TileProvider = new DynmapTileProvider('');

/**
 * Get the active tile provider.
 *
 * Returns the provider used for tile size, detail levels, and
 * all coordinate calculations throughout the app.
 * @returns The currently active TileProvider instance
 */
export function getActiveTileProvider(): TileProvider {
    return activeProvider;
}

/**
 * Set the active tile provider.
 *
 * Call during app initialization before any tile loading operations.
 * This changes the tile size, detail levels, and all derived values
 * (overview tile size, detail-to-overview ratio, etc.).
 *
 * @param provider - The tile provider to activate
 *
 * @example
 * import { BlueMapTileProvider, setActiveTileProvider } from './map/providers/index.js';
 * setActiveTileProvider(new BlueMapTileProvider('https://map.example.com', 'world'));
 */
export function setActiveTileProvider(provider: TileProvider): void {
    activeProvider = provider;
}
