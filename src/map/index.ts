/**
 * Map Module Barrel Export
 * 
 * Exports map tile loading functionality and tile provider abstraction.
 * 
 * @module map
 */

// Tile provider abstraction
export type {
    DetailLevel,
    ProcessedTile,
    TileProvider} from './providers/index.js';
export {
    BlueMapTileProvider,
    DynmapTileProvider,
    encodeCoordPath,
    getActiveTileProvider,
    setActiveTileProvider} from './providers/index.js';

// Types
export type {
    LoadNavMapTilesOptions,
    LoadTileOptions,
    ManifestEntry,
    MapTileContext,
    TileConfig,
    TileRange} from './tile-types.js';

// Tile loader
export {
    _clearCaches,
    _getBlobCacheSize,
    calculateOverviewCoords,
    getCachedTileUrl,
    loadTileManifest,
    loadTileToMap,
    OVERVIEW_TILE_SIZE,    setCachedTileUrl,
    TILE_CONFIG,
    tileExistsInManifest} from './tile-loader.js';

// Player utilities
export {
    fetchPlayers,
    filterPlayersByWorld,
    getPlayerWorld} from './players.js';

// Shop Map Dialog
export type {
    ShopMapDialogDependencies,
    ShopMapDialogHandler
} from './shop-map-dialog.js';
export {
    createShopMapDialogHandler
} from './shop-map-dialog.js';
