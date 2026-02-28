/**
 * Tile Provider Interface
 *
 * Stable interface for third-party tile providers (Dynmap, BlueMap, etc.).
 * Consumers use this interface exclusively; implementations handle
 * provider-specific details like URL patterns, image formats, and
 * coordinate systems.
 *
 * @module map/providers/tile-provider
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A detail level in the provider's tile pyramid.
 *
 * Each provider organizes tiles into a pyramid of detail levels.
 * Higher detail means more pixels per block (closer view).
 *
 * - Dynmap uses zoom levels (zoom 8 = 1 px/block, zoom 4 = 16 px/block)
 * - BlueMap uses LOD levels (LOD 1 = 1 px/block, LOD 3 = 25 px/block)
 */
export interface DetailLevel {
    /** Provider-specific level identifier (e.g., zoom 8 for Dynmap, LOD 1 for BlueMap) */
    readonly id: number;
    /** Number of Minecraft blocks each tile covers at this level */
    readonly blocksPerTile: number;
    /** Human-readable label for debug output (e.g., 'zoom8', 'lod1') */
    readonly label: string;
}

/**
 * Result of processing a raw tile image from the source.
 *
 * Dynmap tiles contain only a color map and are returned unchanged.
 * BlueMap tiles are dual-layer PNGs that need splitting into
 * a color map and heightmap metadata.
 */
export interface ProcessedTile {
    /** Color map image suitable for display on the map */
    readonly colorImage: Blob;
    /** Heightmap metadata extracted from the tile (BlueMap only) */
    readonly heightmap?: ImageData;
}

/**
 * Stable interface for tile retrieval from third-party map providers.
 *
 * Each implementation encapsulates provider-specific details:
 * - Tile size and coordinate system
 * - Source URL generation for build-time fetching
 * - World ID mapping between normalized names and provider IDs
 * - Image post-processing (splitting dual-layer PNGs, etc.)
 *
 * Consumers work exclusively through this interface, never depending
 * on provider-specific logic.
 */
export interface TileProvider {
    /** Provider name for logging and diagnostics */
    readonly name: string;

    /** Blocks per tile at the highest detail level */
    readonly tileSize: number;

    /** Highest detail level (close-up view, e.g., zoom 8 or LOD 1) */
    readonly detailLevel: DetailLevel;

    /** Overview/fallback level (zoomed-out view, e.g., zoom 4 or LOD 3) */
    readonly overviewLevel: DetailLevel;

    /**
     * Convert a normalized world name to the provider's source world identifier.
     *
     * @param normalizedWorld - One of 'overworld', 'the_nether', 'the_end'
     * @returns Provider-specific world ID (e.g., 'minecraft_overworld' for Dynmap)
     */
    getSourceWorldId: (normalizedWorld: string) => string;

    /**
     * Generate URL to fetch a tile from the remote source server.
     *
     * Used by build scripts to download tiles for pre-fetching.
     * Not typically called at runtime (tiles are served locally).
     *
     * @param normalizedWorld - Normalized world name
     * @param level - Detail level to fetch at
     * @param tileX - Tile X coordinate
     * @param tileZ - Tile Z coordinate
     * @returns Full URL to the tile image on the source server
     */
    getSourceTileUrl: (normalizedWorld: string, level: DetailLevel, tileX: number, tileZ: number) => string;

    /**
     * Process a raw tile image from the source into display-ready content.
     *
     * - Dynmap: returns the blob unchanged (pure color map)
     * - BlueMap: splits the dual-layer PNG into color map + heightmap metadata
     *
     * @param raw - Raw tile image blob from the source server
     * @returns Processed tile with color image and optional heightmap
     */
    processImage: (raw: Blob) => Promise<ProcessedTile>;
}

