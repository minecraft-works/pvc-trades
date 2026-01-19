/**
 * Tile utility functions for dynmap tile fetching.
 * Extracted from fetch-tiles.js for testability.
 */

export interface TileCoords {
    tileX: number;
    tileZ: number;
    blocksPerTile: number;
}

export interface Coordinates {
    x: number;
    y: number;
    z: number;
}

export interface ShopInput {
    location: string;
    world: string;
}

export interface ShopLocation {
    x: number;
    z: number;
    location: string;
}

export interface TileInfo {
    world: string;
    tileX: number;
    tileZ: number;
    blocksPerTile: number;
    url: string;
    shops: ShopLocation[];
}

export interface FetchResult {
    success: boolean;
    cached: boolean;
}

export interface RateLimitState {
    fetchedInBatch: number;
}

export interface RateLimitConfig {
    batchSize: number;
    delayBetweenTiles: number;
    delayBetweenBatches: number;
}

export interface RateLimitResult {
    delay: number;
    batchComplete: boolean;
}

/**
 * Calculate tile coordinates from Minecraft world coordinates.
 * At maxZoom, 1 pixel = 1 block, so tile covers tileSize blocks.
 * At lower zooms, each tile covers more area: blocksPerTile = tileSize * 2^(maxZoom - zoom)
 */
export function getTileCoords(
    x: number,
    z: number,
    zoom: number,
    maxZoom: number,
    tileSize: number
): TileCoords {
    const blocksPerTile = tileSize * Math.pow(2, maxZoom - zoom);
    
    const tileX = Math.floor(x / blocksPerTile);
    const tileZ = Math.floor(z / blocksPerTile);
    
    return { tileX, tileZ, blocksPerTile };
}

/**
 * Get tile filename from coordinates (legacy flat format).
 */
export function getTileFilename(tileX: number, tileZ: number): string {
    return `${tileX}_${tileZ}.png`;
}

/**
 * Get tile path in pyramid structure: {z}/{x}/{y}.png
 */
export function getTilePath(zoom: number, tileX: number, tileZ: number): string {
    return `${zoom}/${tileX}/${tileZ}.png`;
}

/**
 * Get tile URL for a world.
 */
export function getTileUrl(
    baseUrl: string,
    world: string,
    zoom: number,
    tileX: number,
    tileZ: number
): string {
    const worldId = getWorldId(world);
    return `${baseUrl}/tiles/${worldId}/${zoom}/${tileX}_${tileZ}.png`;
}

/**
 * Convert world name to dynmap world ID.
 */
export function getWorldId(world: string): string {
    const worldLower = world.toLowerCase();
    if (worldLower === 'world' || worldLower === 'overworld') {
        return 'minecraft_overworld';
    }
    if (worldLower === 'world_nether' || worldLower.includes('nether')) {
        return 'minecraft_the_nether';
    }
    if (worldLower === 'world_the_end' || worldLower.includes('end')) {
        return 'minecraft_the_end';
    }
    return `minecraft_${world}`;
}

/**
 * Parse shop location string to coordinates.
 */
export function parseLocation(location: string | null | undefined): Coordinates {
    if (!location || typeof location !== 'string') {
        return { x: 0, y: 0, z: 0 };
    }
    const coords = location.split(', ');
    return {
        x: parseFloat(coords[0]) || 0,
        y: parseFloat(coords[1]) || 0,
        z: parseFloat(coords[2]) || 0
    };
}

/**
 * Get normalized world name for output directory.
 */
export function getNormalizedWorld(world: string): string {
    const worldLower = world.toLowerCase();
    if (worldLower === 'world' || worldLower === 'overworld') {
        return 'overworld';
    }
    if (worldLower === 'world_nether' || worldLower.includes('nether')) {
        return 'the_nether';
    }
    if (worldLower === 'world_the_end' || worldLower.includes('end')) {
        return 'the_end';
    }
    return world;
}

/**
 * Get unique tiles needed for all shops (including 5x5 neighbors).
 */
export function getUniqueTiles(
    shops: ShopInput[],
    zoom: number,
    maxZoom: number,
    tileSize: number,
    baseUrl: string
): TileInfo[] {
    const tilesMap = new Map<string, TileInfo>();
    
    for (const shop of shops) {
        const { x, z } = parseLocation(shop.location);
        const world = shop.world.replace('minecraft:', '');
        const { tileX, tileZ, blocksPerTile } = getTileCoords(x, z, zoom, maxZoom, tileSize);
        
        // Add the center tile and all 24 neighbors (5x5 grid)
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                const tx = tileX + dx;
                const tz = tileZ + dz;
                const key = `${world}/${zoom}/${tx}_${tz}`;
                
                if (!tilesMap.has(key)) {
                    tilesMap.set(key, {
                        world,
                        tileX: tx,
                        tileZ: tz,
                        blocksPerTile,
                        url: getTileUrl(baseUrl, world, zoom, tx, tz),
                        shops: []
                    });
                }
                
                // Only track shops on the center tile
                if (dx === 0 && dz === 0) {
                    tilesMap.get(key)!.shops.push({ x, z, location: shop.location });
                }
            }
        }
    }
    
    return Array.from(tilesMap.values());
}

/**
 * Get all zoom 4 tiles in a specific range.
 * Used to provide base map coverage across a region.
 */
export function getBaseMapTiles(
    minTileX: number,
    maxTileX: number,
    minTileZ: number,
    maxTileZ: number,
    zoom: number,
    maxZoom: number,
    tileSize: number,
    baseUrl: string,
    world: string = 'overworld'
): TileInfo[] {
    const tiles: TileInfo[] = [];
    const blocksPerTile = tileSize * Math.pow(2, maxZoom - zoom);
    
    for (let tx = minTileX; tx <= maxTileX; tx++) {
        for (let tz = minTileZ; tz <= maxTileZ; tz++) {
            tiles.push({
                world,
                tileX: tx,
                tileZ: tz,
                blocksPerTile,
                url: getTileUrl(baseUrl, world, zoom, tx, tz),
                shops: []
            });
        }
    }
    
    return tiles;
}

/**
 * Process fetch results and determine if rate limiting delay is needed.
 * Returns the delay in ms (0 for no delay).
 */
export function calculateRateLimitDelay(
    result: FetchResult,
    state: RateLimitState,
    config: RateLimitConfig,
    hasMoreTiles: boolean
): RateLimitResult {
    // Cached tiles don't need rate limiting
    if (result.success && result.cached) {
        return { delay: 0, batchComplete: false };
    }
    
    // Increment fetch count for actual fetches and failed attempts
    state.fetchedInBatch++;
    
    // Check if batch is complete
    if (state.fetchedInBatch >= config.batchSize) {
        state.fetchedInBatch = 0;
        return { delay: config.delayBetweenBatches, batchComplete: true };
    }
    
    // Regular delay between tiles (only if more tiles remain)
    if (hasMoreTiles) {
        return { delay: config.delayBetweenTiles, batchComplete: false };
    }
    
    return { delay: 0, batchComplete: false };
}
