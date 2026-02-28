/**
 * Heightmap Atlas
 *
 * Fetches, decodes, and stitches `.height.png` sidecar tiles into a
 * continuous {@link HeightmapAtlas} suitable for GPU texture upload.
 *
 * Each `.height.png` tile is 8-bit grayscale, quantized with per-tile
 * min/max stored in the manifest. This module dequantizes back to real
 * block heights (Float32) and stitches tiles into a single rectangle
 * covering the viewport plus a configurable margin.
 *
 * @module lighting/heightmap-atlas
 * @see docs/adr/014-heightmap-lighting.md — Phase 2 (emission) + Phase 3 (consumption)
 */

import debug from 'debug';

import { getConfig } from '../stores/config-store.js';
import {
    blocksPerTile,
    canonicalTileUrl,
    detailLevel,
    tileFromBlock,
} from '../tile-pyramid.js';
import type { TilePyramidConfig } from '../types.js';
import type {
    BlockViewport,
    DecodedHeightmap,
    HeightmapAtlas,
} from './light-types.js';
import { ATLAS_MARGIN_BLOCKS } from './light-types.js';

const debugAtlas = debug('pvc:atlas');

// ============================================================================
// Types
// ============================================================================

/** Per-tile metadata from the manifest */
export interface TileHeightmapMeta {
    readonly tileX: number;
    readonly tileZ: number;
    readonly min: number;
    readonly max: number;
}

/** Cache key → decoded heightmap */
const heightmapCache = new Map<string, DecodedHeightmap>();

// ============================================================================
// Tile Fetching & Decoding
// ============================================================================

/**
 * Build the URL for a heightmap sidecar tile.
 *
 * Pattern: `tiles/{world}/{level}/{tileX}/{tileZ}.height.png`
 *
 * @param world - World identifier (e.g. 'overworld')
 * @param level - Pyramid level
 * @param tileX - Tile X coordinate
 * @param tileZ - Tile Z coordinate
 * @returns URL string for the heightmap tile
 */
function heightmapTileUrl(
    world: string,
    level: number,
    tileX: number,
    tileZ: number,
): string {
    // Use canonical URL pattern but swap extension
    const pyramid = getConfig().tilePyramid;
    const colorUrl = canonicalTileUrl(
        { world, level, tileX, tileZ },
        pyramid,
    );
    // Replace .{format} with .height.png
    return colorUrl.replace(/\.[^.]+$/, '.height.png');
}

/**
 * Fetch and decode a single heightmap tile.
 *
 * Decodes the 8-bit grayscale PNG into real block heights using the
 * tile's min/max metadata from the manifest.
 *
 * @param world - World identifier
 * @param level - Pyramid level
 * @param tileX - Tile X coordinate
 * @param tileZ - Tile Z coordinate
 * @param meta - Height range metadata { min, max }
 * @param meta.min - Minimum height value (from manifest)
 * @param meta.max - Maximum height value (from manifest)
 * @returns Decoded heightmap, or undefined if fetch/decode fails
 */
async function fetchHeightmapTile(
    world: string,
    level: number,
    tileX: number,
    tileZ: number,
    meta: Readonly<{ min: number; max: number }>,
): Promise<DecodedHeightmap | undefined> {
    const cacheKey = `${world}/${level}/${tileX}/${tileZ}`;

    const cached = heightmapCache.get(cacheKey);
    if (cached) {
        debugAtlas('cache hit: %s', cacheKey);
        return cached;
    }

    const url = heightmapTileUrl(world, level, tileX, tileZ);
    debugAtlas('fetching: %s', url);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            debugAtlas('fetch failed: %s status=%d', url, response.status);
            return undefined;
        }

        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        // Draw to offscreen canvas to get pixel data
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        if (!context) {
            debugAtlas('failed to get 2d context for %s', cacheKey);
            return undefined;
        }

        context.drawImage(bitmap, 0, 0);
        const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
        bitmap.close();

        // Decode 8-bit grayscale → real heights
        const heights = dequantizeHeightmap(
            imageData.data,
            bitmap.width,
            bitmap.height,
            meta.min,
            meta.max,
        );

        const decoded: DecodedHeightmap = {
            heights,
            width: bitmap.width,
            height: bitmap.height,
        };
        heightmapCache.set(cacheKey, decoded);
        debugAtlas('decoded: %s (%dx%d, range %d–%d)',
            cacheKey, bitmap.width, bitmap.height, meta.min, meta.max);

        return decoded;
    } catch (error) {
        debugAtlas('error fetching %s: %o', url, error);
        return undefined;
    }
}

/**
 * Dequantize 8-bit grayscale pixel data to real height values.
 *
 * Reverses the quantization: `real = min + (pixel / 255) × (max - min)`.
 * Reads the R channel of RGBA data (grayscale PNGs have R = G = B).
 *
 * @param rgba - Raw RGBA pixel data from canvas getImageData
 * @param width - Image width
 * @param height - Image height
 * @param min - Minimum height value (from manifest)
 * @param max - Maximum height value (from manifest)
 * @returns Float32Array of real height values
 */
export function dequantizeHeightmap(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    min: number,
    max: number,
): Float32Array {
    const pixelCount = width * height;
    const heights = new Float32Array(pixelCount);
    const range = max - min;

    if (range === 0) {
        heights.fill(min);
        return heights;
    }

    for (let index = 0; index < pixelCount; index++) {
        // Read R channel (index i*4) — grayscale has R = G = B
        const gray = rgba[index * 4] ?? 0;
        heights[index] = min + (gray / 255) * range;
    }

    return heights;
}

// ============================================================================
// Atlas Stitching
// ============================================================================

/**
 * Build a heightmap atlas for the given viewport.
 *
 * Fetches all heightmap tiles covering the viewport plus a margin
 * (for sun shadow ray-marching), decodes them, and stitches into a
 * single continuous Float32Array.
 *
 * Tiles missing a heightmap in the manifest are filled with a default
 * height of 64 (sea level).
 *
 * @param viewport - Block-coordinate viewport bounds
 * @param world - World identifier
 * @param manifest - Tile manifest data (key → heightmap metadata)
 * @returns Stitched atlas, or undefined if no valid heightmaps exist
 */
export async function buildHeightmapAtlas(
    viewport: BlockViewport,
    world: string,
    manifest: Map<string, TileHeightmapMeta>,
): Promise<HeightmapAtlas | undefined> {
    const pyramid = getConfig().tilePyramid;
    const level = detailLevel(pyramid);
    const bpt = blocksPerTile(level, pyramid);

    // Expand viewport by margin for ray-marching
    const expandedMin = {
        blockX: viewport.minBlockX - ATLAS_MARGIN_BLOCKS,
        blockZ: viewport.minBlockZ - ATLAS_MARGIN_BLOCKS,
    };
    const expandedMax = {
        blockX: viewport.maxBlockX + ATLAS_MARGIN_BLOCKS,
        blockZ: viewport.maxBlockZ + ATLAS_MARGIN_BLOCKS,
    };

    // Compute tile range covering expanded viewport
    const minTile = tileFromBlock(expandedMin.blockX, expandedMin.blockZ, level, pyramid);
    const maxTile = tileFromBlock(expandedMax.blockX, expandedMax.blockZ, level, pyramid);

    const tilesX = maxTile.tileX - minTile.tileX + 1;
    const tilesZ = maxTile.tileZ - minTile.tileZ + 1;

    debugAtlas('atlas grid: %dx%d tiles (level %d, bpt %d)', tilesX, tilesZ, level, bpt);

    // Atlas dimensions in texels (1 texel = 1 block at detail level)
    const tilePixels = pyramid.tileWidth; // 256
    const atlasWidth = tilesX * tilePixels;
    const atlasHeight = tilesZ * tilePixels;

    const atlas = new Float32Array(atlasWidth * atlasHeight);
    atlas.fill(64); // Default: sea level for missing tiles

    // Fetch all tiles in parallel
    const fetchPromises: Promise<void>[] = [];

    for (let tz = minTile.tileZ; tz <= maxTile.tileZ; tz++) {
        for (let tx = minTile.tileX; tx <= maxTile.tileX; tx++) {
            const key = manifestKey(world, bpt, tx, tz);
            const meta = manifest.get(key);
            if (!meta) { continue; }

            const tilePromise = fetchHeightmapTile(world, level, tx, tz, meta)
                .then(decoded => {
                    if (!decoded) { return; }
                    stitchTile(
                        atlas, atlasWidth,
                        decoded,
                        (tx - minTile.tileX) * tilePixels,
                        (tz - minTile.tileZ) * tilePixels,
                    );
                });
            fetchPromises.push(tilePromise);
        }
    }

    await Promise.all(fetchPromises);

    const originBlockX = minTile.tileX * bpt;
    const originBlockZ = minTile.tileZ * bpt;

    debugAtlas('atlas built: %dx%d texels, origin (%d, %d)',
        atlasWidth, atlasHeight, originBlockX, originBlockZ);

    return {
        atlasWidth,
        atlasHeight,
        originBlockX,
        originBlockZ,
        heights: atlas,
        blocksPerTexel: bpt / tilePixels,
    };
}

/**
 * Build manifest key matching tile-loader format.
 *
 * @param world - World identifier
 * @param blocksPerTile_ - Blocks per tile at this level
 * @param tileX - Tile X
 * @param tileZ - Tile Z
 * @returns Key string in format "world/bpt/tx/tz"
 */
export function manifestKey(
    world: string,
    blocksPerTile_: number,
    tileX: number,
    tileZ: number,
): string {
    return `${world}/${blocksPerTile_}/${tileX}/${tileZ}`;
}

/**
 * Copy decoded heightmap tile data into the atlas at the given offset.
 *
 * @param atlas - Target atlas Float32Array (mutated)
 * @param atlasWidth - Atlas row width
 * @param tile - Decoded tile heightmap
 * @param offsetX - Column offset in atlas
 * @param offsetZ - Row offset in atlas
 */
function stitchTile(
    atlas: Float32Array,
    atlasWidth: number,
    tile: DecodedHeightmap,
    offsetX: number,
    offsetZ: number,
): void {
    for (let z = 0; z < tile.height; z++) {
        const sourceStart = z * tile.width;
        const destinationStart = (offsetZ + z) * atlasWidth + offsetX;
        atlas.set(
            tile.heights.subarray(sourceStart, sourceStart + tile.width),
            destinationStart,
        );
    }
}

/**
 * Parse the raw manifest JSON into a Map of heightmap metadata.
 *
 * Only entries with a `heightmap` field are included.
 *
 * @param manifestEntries - Raw manifest entry objects
 * @param pyramid - Pyramid configuration
 * @returns Map of manifest key → tile heightmap metadata
 */
export function parseManifestHeightmaps(
    manifestEntries: readonly { world: string; tileX: number; tileZ: number; blocksPerTile: number; heightmap?: { min: number; max: number } }[],
    pyramid: Readonly<TilePyramidConfig>,
): Map<string, TileHeightmapMeta> {
    const result = new Map<string, TileHeightmapMeta>();
    const level = detailLevel(pyramid);
    const bpt = blocksPerTile(level, pyramid);

    for (const entry of manifestEntries) {
        if (!entry.heightmap || entry.blocksPerTile !== bpt) { continue; }
        const key = manifestKey(entry.world, entry.blocksPerTile, entry.tileX, entry.tileZ);
        result.set(key, {
            tileX: entry.tileX,
            tileZ: entry.tileZ,
            min: entry.heightmap.min,
            max: entry.heightmap.max,
        });
    }

    debugAtlas('parsed %d heightmap entries from manifest', result.size);
    return result;
}

