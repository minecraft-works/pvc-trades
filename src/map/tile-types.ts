/**
 * Map Tile Types
 * 
 * Type definitions for map tile loading.
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
    /** Highest detail pyramid level */
    readonly maxZoom: number;
    /** Overview pyramid level for fallback tiles */
    readonly fallbackZoom: number;
    /** Blocks covered by one overview tile */
    readonly overviewTileBlocks: number;
    /** Number of detail tiles per overview tile per axis */
    readonly detailToOverviewRatio: number;
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

/** Options for loading navigation map tiles */
export interface LoadNavMapTilesOptions {
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
