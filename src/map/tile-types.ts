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
    /** Blocks per tile at the highest detail level */
    readonly tileSize: number;
    /** Base URL for tile assets */
    readonly baseUrl: string;
    /** Highest detail pyramid level */
    readonly maxZoom: number;
    /** Overview pyramid level for fallback tiles */
    readonly fallbackZoom: number;
    /** Lowest detail zoom level */
    readonly minZoom: number;
    /** URL for player position data */
    readonly playersUrl: string;
    /** Blocks covered by one overview tile */
    readonly overviewTileBlocks: number;
    /** Number of detail tiles per overview tile per axis */
    readonly detailToOverviewRatio: number;
    /** Output tile format (png, webp, avif) */
    readonly format: string;
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
    /** Pyramid level (overview or detail) */
    zoom: number;
    /** Tile X coordinate at the specified level */
    tx: number;
    /** Tile Z coordinate at the specified level */
    tz: number;
    /** Bounds for the tile overlay */
    bounds: L.LatLngBoundsExpression;
    /** Set tracking tiles already added to this map instance */
    addedToMap: Set<string>;
    /** Optional pane name for z-ordering */
    pane?: string;
}

/** Context for loading shop map tiles */
export interface MapTileContext {
    /** World identifier */
    worldId: string;
    /** Center tile X coordinate for positioning */
    centerTileX: number;
    /** Center tile Z coordinate for positioning */
    centerTileZ: number;
    /** Set tracking overview tiles added */
    addedToMapOverview: Set<string>;
    /** Set tracking detail tiles added */
    addedToMapDetail: Set<string>;
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
