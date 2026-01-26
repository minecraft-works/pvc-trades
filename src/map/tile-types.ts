/**
 * Map Tile Types
 * 
 * Type definitions for map tile loading and caching.
 * 
 * @module map/tile-types
 */

// ============================================================================
// Configuration Types
// ============================================================================

/** Map tile configuration */
export interface TileConfig {
    /** Pixels per tile (and blocks per tile at maxZoom) */
    readonly tileSize: number;
    /** Base URL for tile assets */
    readonly baseUrl: string;
    /** Highest detail zoom level (1 pixel = 1 block) */
    readonly maxZoom: number;
    /** Base map zoom level for fallback tiles */
    readonly fallbackZoom: number;
    /** Lowest detail zoom level */
    readonly minZoom: number;
    /** URL for player position data */
    readonly playersUrl: string;
}

// ============================================================================
// Tile Loading Types
// ============================================================================

/** Options for loading a single tile to a map */
export interface LoadTileOptions {
    /** Leaflet map to add tile to */
    map: L.Map;
    /** World identifier (overworld, the_nether) */
    worldId: string;
    /** Zoom level (4 or 8) */
    zoom: number;
    /** Tile X coordinate at the specified zoom */
    tx: number;
    /** Tile Z coordinate at the specified zoom */
    tz: number;
    /** Bounds for the tile overlay */
    bounds: L.LatLngBoundsExpression;
    /** Set tracking tiles already added to this map instance */
    addedToMap: Set<string>;
}

/** Context for loading shop map tiles */
export interface MapTileContext {
    /** World identifier */
    worldId: string;
    /** Center tile X coordinate for positioning */
    centerTileX: number;
    /** Center tile Z coordinate for positioning */
    centerTileZ: number;
    /** Set tracking zoom4 tiles added */
    addedToMapZoom4: Set<string>;
    /** Set tracking zoom8 tiles added */
    addedToMapZoom8: Set<string>;
    /** Manifest of available tiles */
    manifest: Set<string>;
}

/** Options for loading navigation map tiles */
export interface LoadNavMapTilesOptions {
    /** Manifest of available tiles */
    manifest: Set<string>;
    /** World identifier */
    worldId: string;
    /** Tile range to load */
    tileRange: TileRange;
    /** Set tracking tiles already added */
    addedToMap: Set<string>;
    /** Override center X for positioning (defaults to tileRange.centerTileX) */
    mapCenterTileX?: number;
    /** Override center Z for positioning (defaults to tileRange.centerTileZ) */
    mapCenterTileZ?: number;
}

/** Tile range bounds */
export interface TileRange {
    minTileX: number;
    maxTileX: number;
    minTileZ: number;
    maxTileZ: number;
    centerTileX: number;
    centerTileZ: number;
}

// ============================================================================
// Manifest Types
// ============================================================================

/** Entry from tile manifest.json */
export interface ManifestEntry {
    world: string;
    tileX: number;
    tileZ: number;
    blocksPerTile: number;
}
