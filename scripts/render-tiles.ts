#!/usr/bin/env npx tsx
/**
 * Canonical Tile Renderer
 *
 * Re-renders source tiles (fetched by fetch-tiles.ts from Dynmap/BlueMap)
 * into the canonical pyramid format defined by config.json's tilePyramid.
 *
 * Source tiles:    public/tiles/{world}/{providerLevelId}/{tx}/{tz}.png
 * Canonical tiles: public/tiles/{world}/{canonicalLevel}/{tx}/{tz}.{format}
 *
 * For each source tile, the script:
 * 1. Reads the source image (any pixel dimensions)
 * 2. Splits it into splitFactor×splitFactor sub-regions
 * 3. Resizes each sub-region to tileWidth×tileHeight
 * 4. Writes the canonical tile
 *
 * Also overwrites manifest.json with canonical entries compatible with the
 * runtime's loadTileManifest().
 *
 * Run: npx tsx scripts/render-tiles.ts
 *      npm run render-tiles
 *
 * @module scripts/render-tiles
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { createTileProviderFromConfig } from '../src/stores/config-store';
import {
    blocksPerTile as pyramidBlocksPerTile,
    detailLevel,
    overviewLevel,
} from '../src/tile-pyramid';
import { AppConfigSchema, DEFAULT_CONFIG, resolveRawConfig, type TilePyramidConfig } from '../src/types';
import {
    applyShadeToColor,
    computeShadeMap,
    decodeBlockLight,
    decodeHeightmap,
    extractSubHeights,
    extractSubRegionRgba,
    isDualLayerTile,
    type LightingConfig,
    quantizeHeightmap,
    upsampleBilinear,
} from './heightmap-shader';

// ============================================================================
// Constants
// ============================================================================

/** Raw tiles downloaded by fetch-tiles.ts (never served directly) */
const SOURCE_TILES_DIR = 'public/tiles-src';
/** Canonical rendered tiles served at runtime */
const TILES_DIR = 'public/tiles';
const MANIFEST_PATH = path.join(TILES_DIR, 'manifest.json');

// ============================================================================
// Types
// ============================================================================

interface SourceTile {
    world: string;
    tileX: number;
    tileZ: number;
    levelId: number;
    sourcePath: string;
}

interface CanonicalEntry {
    world: string;
    tileX: number;
    tileZ: number;
    blocksPerTile: number;
    heightmap?: { min: number; max: number };
}

interface SplitResult {
    entries: CanonicalEntry[];
    rendered: number;
    skipped: number;
}

/** Options for splitting a source tile into canonical tiles */
interface SplitOptions {
    /** Source tile metadata */
    source: SourceTile;
    /** Canonical pyramid level to produce */
    canonLevel: number;
    /** Number of canonical tiles per source tile per axis */
    splitFactor: number;
    /** Pixel width of each crop region in the source */
    cropWidth: number;
    /** Pixel height of each crop region in the source */
    cropHeight: number;
    /** Pyramid configuration */
    pyramid: TilePyramidConfig;
    /** Whether the source is a BlueMap dual-layer tile (color + heightmap) */
    isDualLayer: boolean;
    /** Lighting configuration (used only when isDualLayer is true) */
    lightingConfig?: LightingConfig;
}

/** Shared context for rendering a single dual-layer sub-tile */
interface DualLayerSubTileContext {
    /** Grid offset along X axis */
    dx: number;
    /** Grid offset along Z axis */
    dz: number;
    /** Source tile metadata */
    source: SourceTile;
    /** Split factor per axis */
    splitFactor: number;
    /** Canonical level index */
    canonLevel: number;
    /** Canonical blocks-per-tile value */
    canonBpt: number;
    /** Pixel width of each crop region */
    cropWidth: number;
    /** Pixel height of each crop region */
    cropHeight: number;
    /** Width of the full source image */
    sourceWidth: number;
    /** Full-source color buffer (RGBA) */
    colorBuffer: Buffer;
    /** Decoded full-source heightmap */
    heights: Float32Array;
    /** Decoded full-source block-light values (0–1 per pixel), or undefined when not available */
    blockLights: Float32Array | undefined;
    /** Lighting configuration */
    lightingConfig: LightingConfig;
    /** Whether to emit heightmap sidecar tiles */
    emitHeightmap: boolean;
    /** Pyramid configuration */
    pyramid: TilePyramidConfig;
}

// ============================================================================
// Config
// ============================================================================

function loadConfig() {
    const configPath = 'config.json';
    let config = DEFAULT_CONFIG;
    if (existsSync(configPath)) {
        const raw: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
        const parsed = AppConfigSchema.safeParse(resolveRawConfig(raw));
        if (parsed.success) {
            config = parsed.data;
        } else {
            console.warn('Invalid config.json, using defaults:', parsed.error.message);
        }
    } else {
        console.warn('config.json not found, using defaults');
    }
    return config;
}

// ============================================================================
// World normalization
// ============================================================================

function normalizeWorld(world: string): string {
    const lower = world.toLowerCase();
    if (lower === 'world' || lower === 'overworld' || lower === 'minecraft_overworld') {
        return 'overworld';
    }
    if (lower.includes('nether')) {
        return 'the_nether';
    }
    if (lower.includes('end')) {
        return 'the_end';
    }
    return world;
}

// ============================================================================
// Source tile discovery
// ============================================================================

/**
 * Scan the tiles directory for source tiles at a specific provider level.
 *
 * @param world - Normalized world name (e.g., 'overworld')
 * @param levelId - Provider-specific level ID (e.g., 8 for Dynmap detail)
 * @returns Array of discovered source tiles
 */
function findSourceTilesInWorld(world: string, levelId: number): SourceTile[] {
    const levelDir = path.join(SOURCE_TILES_DIR, world, String(levelId));
    if (!existsSync(levelDir)) { return []; }

    const tiles: SourceTile[] = [];
    for (const txDirName of readdirSync(levelDir)) {
        const txDirPath = path.join(levelDir, txDirName);
        const tileX = Number.parseInt(txDirName, 10);
        if (!statSync(txDirPath).isDirectory() || Number.isNaN(tileX)) { continue; }

        for (const file of readdirSync(txDirPath)) {
            const match = /^(?<z>-?\d+)\.png$/u.exec(file);
            if (match?.groups) {
                const tileZ = Number.parseInt(match.groups.z, 10);
                tiles.push({
                    world,
                    tileX,
                    tileZ,
                    levelId,
                    sourcePath: path.join(levelDir, txDirName, file),
                });
            }
        }
    }

    return tiles;
}

/**
 * Find all world directories under the tiles directory.
 *
 * @returns Array of normalized world name strings
 */
function findWorlds(): string[] {
    if (!existsSync(SOURCE_TILES_DIR)) { return []; }
    return readdirSync(SOURCE_TILES_DIR)
        .filter(name => {
            const fullPath = path.join(SOURCE_TILES_DIR, name);
            return statSync(fullPath).isDirectory();
        })
        .map(name => normalizeWorld(name));
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Apply output format encoding to a sharp pipeline.
 *
 * @param pipeline - Sharp pipeline to encode
 * @param format - Target format string ('jpeg', 'webp', 'avif', or default png)
 * @returns The pipeline with the format encoder applied
 */
function applyFormat(pipeline: sharp.Sharp, format: string): sharp.Sharp {
    switch (format) {
        case 'webp': { return pipeline.webp({ lossless: true }); }
        case 'avif': { return pipeline.avif(); }
        case 'jpeg': { return pipeline.jpeg({ progressive: true, quality: 92, mozjpeg: true }); }
        default: { return pipeline.png({ progressive: true }); }
    }
}

/**
 * Render a single dual-layer sub-tile: extract sub-region, compute shade,
 * write the shaded color tile and optional heightmap sidecar.
 *
 * @param context - Shared dual-layer rendering context
 * @returns Entry, plus whether the tile was newly rendered or skipped
 */
async function renderDualLayerSubTile(context: DualLayerSubTileContext): Promise<{
    entry: CanonicalEntry;
    wasRendered: boolean;
}> {
    const {
        dx, dz, source, splitFactor, canonLevel, canonBpt,
        cropWidth, cropHeight, sourceWidth, colorBuffer, heights, blockLights,
        lightingConfig, emitHeightmap, pyramid,
    } = context;

    const canonTileX = source.tileX * splitFactor + dx;
    const canonTileZ = source.tileZ * splitFactor + dz;
    const outputPath = path.join(
        TILES_DIR, source.world,
        String(canonLevel), String(canonTileX),
        `${canonTileZ}.${pyramid.format}`,
    );
    const heightmapPath = path.join(
        TILES_DIR, source.world,
        String(canonLevel), String(canonTileX),
        `${canonTileZ}.height.png`,
    );

    // Extract sub-regions
    const startX = dx * cropWidth;
    const startZ = dz * cropHeight;
    const subColor = extractSubRegionRgba(colorBuffer, sourceWidth, startX, startZ, cropWidth, cropHeight);
    const subHeights = extractSubHeights(heights, sourceWidth, startX, startZ, cropWidth, cropHeight);
    const subBlockLights = blockLights
        ? extractSubHeights(blockLights, sourceWidth, startX, startZ, cropWidth, cropHeight)
        : undefined;

    // Upscale buffers if shadingScale > 1 (bilinear for heights/block-light, nearest for color)
    const scale = lightingConfig.shadingScale;
    const shadedW = cropWidth * scale;
    const shadedH = cropHeight * scale;
    let shadedColor: Buffer;
    let shadedHeights: Float32Array;
    let shadedBlockLights: Float32Array | undefined;
    if (scale > 1) {
        shadedColor = await sharp(subColor, { raw: { width: cropWidth, height: cropHeight, channels: 4 } })
            .resize(shadedW, shadedH, { kernel: 'nearest' })
            .raw()
            .toBuffer();
        shadedHeights = upsampleBilinear(subHeights, cropWidth, cropHeight, scale);
        shadedBlockLights = subBlockLights
            ? upsampleBilinear(subBlockLights, cropWidth, cropHeight, scale)
            : undefined;
    } else {
        shadedColor = subColor;
        shadedHeights = subHeights;
        shadedBlockLights = subBlockLights;
    }

    // Compute and apply shade at (potentially upscaled) resolution
    const shade = computeShadeMap(shadedHeights, shadedW, shadedH, lightingConfig);
    applyShadeToColor(shadedColor, shade, shadedBlockLights, lightingConfig.blockLightBoost);

    // Quantize from original (unscaled) heights — min/max metadata is geometric, not resolution-dependent
    const quantized = quantizeHeightmap(subHeights, cropWidth, cropHeight);
    const entry: CanonicalEntry = {
        world: source.world,
        tileX: canonTileX,
        tileZ: canonTileZ,
        blocksPerTile: canonBpt,
        heightmap: { min: quantized.min, max: quantized.max },
    };

    if (existsSync(outputPath)) {
        return { entry, wasRendered: false };
    }

    mkdirSync(path.dirname(outputPath), { recursive: true });

    // Write shaded color tile at full (potentially upscaled) resolution.
    // The extract only fires when buffer dimensions differ from pyramid dims;
    // this trims the 501→500 source border pixel when shadingScale = 1.
    // With shadingScale > 1, shadedW === pyramid.tileWidth so no extract needed.
    let pipeline = sharp(shadedColor, {
        raw: { width: shadedW, height: shadedH, channels: 4 },
    });
    if (shadedW !== pyramid.tileWidth || shadedH !== pyramid.tileHeight) {
        pipeline = pipeline.extract({ left: 0, top: 0, width: pyramid.tileWidth, height: pyramid.tileHeight });
    }
    pipeline = applyFormat(pipeline, pyramid.format);
    await pipeline.toFile(outputPath);

    // Write heightmap sidecar at the same output dimensions
    if (emitHeightmap) {
        let heightPipeline = sharp(quantized.data, {
            raw: { width: cropWidth, height: cropHeight, channels: 1 },
        });
        if (cropWidth !== pyramid.tileWidth || cropHeight !== pyramid.tileHeight) {
            // scale > 1: nearest-neighbour upscale to match tile dims; else trim border pixel
            heightPipeline = scale > 1
                ? heightPipeline.resize(pyramid.tileWidth, pyramid.tileHeight, { kernel: 'nearest' })
                : heightPipeline.extract({ left: 0, top: 0, width: pyramid.tileWidth, height: pyramid.tileHeight });
        }
        await heightPipeline.png({ compressionLevel: 9 }).toFile(heightmapPath);
    }

    return { entry, wasRendered: true };
}

/**
 * Split a source tile into canonical tiles.
 *
 * For Dynmap (512px source → 2×2 split → 256px canonical):
 * each quadrant of the source image becomes one canonical tile.
 *
 * For BlueMap dual-layer tiles (501×1002), the top half holds color pixels
 * and the bottom half holds heightmap metadata. When lighting is enabled,
 * shade is baked into the color using the heightmap gradients. Optionally,
 * a separate 8-bit grayscale heightmap tile is also emitted.
 *
 * @param options - Split configuration including source tile path, level, split factor, and crop dimensions
 * @returns Rendered tile entries with counts of new and skipped tiles
 */
async function splitSourceTile(options: SplitOptions): Promise<SplitResult> {
    const { source, canonLevel, splitFactor, cropWidth, cropHeight, pyramid, isDualLayer, lightingConfig } = options;
    const entries: CanonicalEntry[] = [];
    let rendered = 0;
    let skipped = 0;

    const sourceImage = sharp(source.sourcePath);
    const canonBpt = pyramidBlocksPerTile(canonLevel, pyramid);

    // -------------------------------------------------------------------
    // Dual-layer path: decode heightmap, apply shade, write heightmap tiles
    // -------------------------------------------------------------------
    if (isDualLayer && lightingConfig) {
        const meta = await sourceImage.metadata();
        const sourceWidth = meta.width;
        const colorHeight = Math.floor(meta.height / 2);

        // Read full source as raw RGBA (color half + heightmap half)
        const fullRaw = await sourceImage.clone()
            .ensureAlpha()
            .raw()
            .toBuffer();

        const rowBytes = sourceWidth * 4;
        const colorBuffer = Buffer.from(fullRaw.subarray(0, colorHeight * rowBytes));
        const heightBuffer = fullRaw.subarray(colorHeight * rowBytes, colorHeight * 2 * rowBytes);

        // Decode full heightmap (heights) and block-light channel once
        const heights = decodeHeightmap(heightBuffer, sourceWidth, colorHeight);
        const blockLights = lightingConfig.blockLightBoost > 0
            ? decodeBlockLight(heightBuffer, sourceWidth, colorHeight)
            : undefined;
        const emitHeightmap = pyramid.lighting?.emitHeightmapTiles ?? false;

        for (let dx = 0; dx < splitFactor; dx++) {
            for (let dz = 0; dz < splitFactor; dz++) {
                const { entry, wasRendered } = await renderDualLayerSubTile({
                    dx, dz, source, splitFactor, canonLevel, canonBpt,
                    cropWidth, cropHeight, sourceWidth, colorBuffer, heights, blockLights,
                    lightingConfig, emitHeightmap, pyramid,
                });
                entries.push(entry);
                rendered += wasRendered ? 1 : 0;
                skipped += wasRendered ? 0 : 1;
            }
        }

        return { entries, rendered, skipped };
    }

    // -------------------------------------------------------------------
    // Standard path: simple crop → resize → encode (Dynmap / non-heightmap)
    // -------------------------------------------------------------------
    for (let dx = 0; dx < splitFactor; dx++) {
        for (let dz = 0; dz < splitFactor; dz++) {
            const canonTileX = source.tileX * splitFactor + dx;
            const canonTileZ = source.tileZ * splitFactor + dz;
            const outputPath = path.join(
                TILES_DIR, source.world,
                String(canonLevel), String(canonTileX),
                `${canonTileZ}.${pyramid.format}`,
            );

            if (existsSync(outputPath)) {
                entries.push({
                    world: source.world,
                    tileX: canonTileX,
                    tileZ: canonTileZ,
                    blocksPerTile: canonBpt,
                });
                skipped++;
                continue;
            }

            mkdirSync(path.dirname(outputPath), { recursive: true });

            const extractRegion = {
                left: dx * cropWidth,
                top: dz * cropHeight,
                width: cropWidth,
                height: cropHeight,
            };

            let pipeline = sourceImage.clone().extract(extractRegion);

            // Resize if crop dimensions don't match target tile dimensions
            if (cropWidth !== pyramid.tileWidth || cropHeight !== pyramid.tileHeight) {
                pipeline = pipeline.resize(pyramid.tileWidth, pyramid.tileHeight);
            }

            pipeline = applyFormat(pipeline, pyramid.format);
            await pipeline.toFile(outputPath);
            entries.push({
                world: source.world,
                tileX: canonTileX,
                tileZ: canonTileZ,
                blocksPerTile: canonBpt,
            });
            rendered++;
        }
    }

    return { entries, rendered, skipped };
}

/**
 * Read the pixel dimensions of one source tile to determine crop regions.
 *
 * For BlueMap dual-layer tiles (height > 1.5× width), only the top half
 * (color data) is used for cropping. The bottom half is heightmap metadata.
 *
 * @param tiles - Source tiles at a given level
 * @param splitFactor - How many canonical tiles per axis per source tile
 * @returns Crop width and height in source pixels plus dual-layer flag, or undefined if no tiles
 */
async function getSourceCropDimensions(
    tiles: SourceTile[],
    splitFactor: number,
): Promise<{ cropWidth: number; cropHeight: number; isDualLayer: boolean } | undefined> {
    if (tiles.length === 0) { return undefined; }

    const { width, height } = await sharp(tiles[0].sourcePath).metadata();
    const dualLayer = isDualLayerTile(width, height);
    const effectiveHeight = dualLayer ? Math.floor(height / 2) : height;

    return {
        cropWidth: Math.floor(width / splitFactor),
        cropHeight: Math.floor(effectiveHeight / splitFactor),
        isDualLayer: dualLayer,
    };
}

// ============================================================================
// Level Processing
// ============================================================================

interface LevelProcessOptions {
    world: string;
    levelId: number;
    canonLevel: number;
    splitFactor: number;
    pyramid: TilePyramidConfig;
    label: string;
    /** Lighting config to use for dual-layer tiles (undefined = no shading) */
    lightingConfig?: LightingConfig;
}

/**
 * Process all source tiles at a given level for one world.
 *
 * @param options - Level processing configuration including world, source level ID, canonical level, and split factor
 * @returns Rendered tile entries with counts of new and skipped tiles
 */
async function processSourceLevel(options: LevelProcessOptions): Promise<SplitResult> {
    const { world, levelId, canonLevel, splitFactor, pyramid, label, lightingConfig } = options;
    const tiles = findSourceTilesInWorld(world, levelId);

    if (tiles.length === 0) {
        return { entries: [], rendered: 0, skipped: 0 };
    }

    const crop = await getSourceCropDimensions(tiles, splitFactor);
    if (!crop) {
        return { entries: [], rendered: 0, skipped: 0 };
    }

    const dualLabel = crop.isDualLayer ? ' [dual-layer]' : '';
    console.log(`\n[${world}] ${tiles.length} source ${label} tiles → level ${canonLevel} (crop ${crop.cropWidth}×${crop.cropHeight}px)${dualLabel}`);

    const entries: CanonicalEntry[] = [];
    let rendered = 0;
    let skipped = 0;

    for (const tile of tiles) {
        try {
            const result = await splitSourceTile({
                source: tile,
                cropWidth: crop.cropWidth,
                cropHeight: crop.cropHeight,
                isDualLayer: crop.isDualLayer,
                canonLevel,
                splitFactor,
                pyramid,
                lightingConfig,
            });
            entries.push(...result.entries);
            rendered += result.rendered;
            skipped += result.skipped;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`  [WARN] Failed to render ${tile.sourcePath}: ${message}`);
        }
    }

    return { entries, rendered, skipped };
}

// ============================================================================
// Intermediate Tile Derivation
// ============================================================================

/**
 * Build the array of sharp composites for one intermediate-tile mosaic group.
 * Reads each available shaded detail tile from disk and places it at the
 * correct grid position within the mosaic.  Missing tiles leave that cell
 * transparent (the parent sharp image is initialised to transparent).
 *
 * @param groupEntries - Detail-level entries that share the same intermediate parent
 * @param world - Normalised world name
 * @param detail - Detail level index
 * @param scale - Pyramid scale factor (tiles per intermediate tile side)
 * @param pyramid - Pyramid configuration (tile dimensions and format)
 * @returns Array of overlay options ready for sharp.composite()
 */
async function buildMosaicComposites(
    groupEntries: CanonicalEntry[],
    world: string,
    detail: number,
    scale: number,
    pyramid: TilePyramidConfig,
): Promise<sharp.OverlayOptions[]> {
    const composites: sharp.OverlayOptions[] = [];
    for (const detailEntry of groupEntries) {
        const localX = ((detailEntry.tileX % scale) + scale) % scale;
        const localZ = ((detailEntry.tileZ % scale) + scale) % scale;
        const detailPath = path.join(
            TILES_DIR, world,
            String(detail), String(detailEntry.tileX),
            `${detailEntry.tileZ}.${pyramid.format}`,
        );
        if (!existsSync(detailPath)) { continue; }
        const buf = await sharp(detailPath).ensureAlpha().raw().toBuffer();
        composites.push({
            input: buf,
            raw: { width: pyramid.tileWidth, height: pyramid.tileHeight, channels: 4 },
            left: localX * pyramid.tileWidth,
            top: localZ * pyramid.tileHeight,
        });
    }
    return composites;
}

/**
 * Derive intermediate-level canonical tiles by downsampling a scaleFactor×scaleFactor
 * grid of already-rendered detail tiles.
 *
 * For each group of detail tiles that share a parent at
 * `detailLevel(pyramid) - 1`, the function:
 * 1. Reads the shaded detail tile PNGs from disk.
 * 2. Places each into a (scaleFactor x tileWidth) x (scaleFactor x tileHeight)
 *    mosaic at the correct grid position (transparent where tiles are absent).
 * 3. Lanczos-resizes the mosaic back to tileWidth x tileHeight.
 * 4. Writes to `TILES_DIR/world/{intermediateLevel}/{parentX}/{parentZ}.{format}`.
 *
 * Tiles already present on disk are skipped (skip-if-exists).
 * The LOD‑4 overview pass runs afterward and only writes to a different level
 * (overviewLevel = 0), so there is no conflict.
 *
 * @param world - Normalised world name
 * @param detailEntries - Canonical entries from the most-detail pass
 * @param pyramid - Pyramid configuration
 * @returns SplitResult with new entries and render/skip counts
 */
async function deriveIntermediateTiles(
    world: string,
    detailEntries: CanonicalEntry[],
    pyramid: TilePyramidConfig,
): Promise<SplitResult> {
    const detail = detailLevel(pyramid);
    const intermediateLevel = detail - 1;
    if (intermediateLevel < 0) {
        return { entries: [], rendered: 0, skipped: 0 };
    }

    const scale = pyramid.scaleFactor;
    const intermediateBpt = pyramidBlocksPerTile(intermediateLevel, pyramid);

    // Group detail entries by parent intermediate tile coordinate
    const groups = new Map<string, CanonicalEntry[]>();
    for (const entry of detailEntries) {
        if (entry.world !== world) { continue; }
        const parentX = Math.floor(entry.tileX / scale);
        const parentZ = Math.floor(entry.tileZ / scale);
        const key = `${parentX}/${parentZ}`;
        const existing = groups.get(key);
        if (existing) {
            existing.push(entry);
        } else {
            groups.set(key, [entry]);
        }
    }

    if (groups.size === 0) {
        return { entries: [], rendered: 0, skipped: 0 };
    }

    const mosaicW = pyramid.tileWidth * scale;
    const mosaicH = pyramid.tileHeight * scale;
    const entries: CanonicalEntry[] = [];
    let rendered = 0;
    let skipped = 0;

    console.log(`\n[${world}] Deriving ${groups.size} intermediate (level ${intermediateLevel}) tiles from ${detailEntries.length} detail tiles (${scale}x${scale} -> 1)`);

    for (const [groupKey, groupEntries] of groups) {
        const slashPos = groupKey.indexOf('/');
        const parentX = Number.parseInt(groupKey.slice(0, slashPos), 10);
        const parentZ = Number.parseInt(groupKey.slice(slashPos + 1), 10);

        const outputPath = path.join(
            TILES_DIR, world,
            String(intermediateLevel), String(parentX),
            `${parentZ}.${pyramid.format}`,
        );

        const entry: CanonicalEntry = {
            world,
            tileX: parentX,
            tileZ: parentZ,
            blocksPerTile: intermediateBpt,
        };

        if (existsSync(outputPath)) {
            entries.push(entry);
            skipped++;
        } else {
            const composites = await buildMosaicComposites(groupEntries, world, detail, scale, pyramid);
            if (composites.length > 0) {
                mkdirSync(path.dirname(outputPath), { recursive: true });

                let pipeline = sharp({
                    create: {
                        width: mosaicW,
                        height: mosaicH,
                        channels: 4,
                        background: { r: 0, g: 0, b: 0, alpha: 0 },
                    },
                }).composite(composites).resize(pyramid.tileWidth, pyramid.tileHeight, { kernel: 'lanczos3' });
                pipeline = applyFormat(pipeline, pyramid.format);
                await pipeline.toFile(outputPath);

                entries.push(entry);
                rendered++;
            }
        }
    }

    return { entries, rendered, skipped };
}

// ============================================================================
// Main
// ============================================================================
 
async function main(): Promise<void> {
    console.log('=== Canonical Tile Renderer ===');
    console.log(`Timestamp: ${new Date().toISOString()}`);

    // Load config
    const config = loadConfig();
    const pyramid = config.tilePyramid;
    const provider = createTileProviderFromConfig(config);

    console.log(`\nSource provider: ${provider.name}`);
    console.log(`  Detail: ${provider.detailLevel.label} (${provider.detailLevel.blocksPerTile} blocks/tile)`);
    console.log(`  Overview: ${provider.overviewLevel.label} (${provider.overviewLevel.blocksPerTile} blocks/tile)`);

    console.log('\nCanonical pyramid:');
    console.log(`  Tile size: ${pyramid.tileWidth}×${pyramid.tileHeight}px`);
    console.log(`  Levels: ${pyramid.levels} (detail=${detailLevel(pyramid)}, overview=${overviewLevel()})`);
    console.log(`  Format: ${pyramid.format}`);

    // Validate split factors (must be integer for simple splitting)
    const canonDetailBpt = pyramidBlocksPerTile(detailLevel(pyramid), pyramid);
    const canonOverviewBpt = pyramidBlocksPerTile(overviewLevel(), pyramid);

    const detailSplit = provider.detailLevel.blocksPerTile / canonDetailBpt;
    const overviewSplit = provider.overviewLevel.blocksPerTile / canonOverviewBpt;

    if (!Number.isInteger(detailSplit)) {
        console.error(`\nERROR: Source detail blocks/tile (${provider.detailLevel.blocksPerTile}) is not a multiple of canonical (${canonDetailBpt}).`);
        console.error('Non-aligned grid compositing is not yet supported.');
        process.exit(1);
    }

    if (!Number.isInteger(overviewSplit)) {
        console.error(`\nERROR: Source overview blocks/tile (${provider.overviewLevel.blocksPerTile}) is not a multiple of canonical (${canonOverviewBpt}).`);
        console.error('Non-aligned grid compositing is not yet supported.');
        process.exit(1);
    }

    console.log(`\nSplit factors: detail=${detailSplit}×${detailSplit}, overview=${overviewSplit}×${overviewSplit}`);

    // Resolve lighting configuration (only for BlueMap sources with lighting enabled)
    const lightingCfg = pyramid.lighting;
    let lightingConfig: LightingConfig | undefined;
    if (lightingCfg?.enabled) {
        lightingConfig = {
            model: lightingCfg.model,
            sunDirection: lightingCfg.sunDirection,
            ambientIntensity: lightingCfg.ambientIntensity,
            diffuseIntensity: lightingCfg.diffuseIntensity,
            heightScale: lightingCfg.heightScale,
            normalScale: lightingCfg.normalScale,
            blockLightBoost: lightingCfg.blockLightBoost,
            shadingScale: lightingCfg.shadingScale,
        };
        console.log(`\nLighting: ${lightingConfig.model} model (ambient=${lightingConfig.ambientIntensity}, diffuse=${lightingConfig.diffuseIntensity}, heightScale=${lightingConfig.heightScale}, normalScale=${lightingConfig.normalScale}, blockLightBoost=${lightingConfig.blockLightBoost})`);
        console.log(`  Sun direction: [${lightingConfig.sunDirection.join(', ')}]`);
        console.log(`  Heightmap tiles: ${lightingCfg.emitHeightmapTiles ? 'enabled' : 'disabled'}`);
    } else {
        console.log('\nLighting: disabled');
    }

    // Discover worlds
    const worlds = findWorlds();
    console.log(`Worlds found: ${worlds.join(', ') || '(none)'}`);

    if (worlds.length === 0) {
        console.log('\nNo tiles to render.');
        return;
    }

    let totalRendered = 0;
    let totalSkipped = 0;
    const allEntries: CanonicalEntry[] = [];

    for (const world of worlds) {
        const detail = await processSourceLevel({
            levelId: provider.detailLevel.id,
            canonLevel: detailLevel(pyramid),
            splitFactor: detailSplit,
            label: 'detail',
            world,
            pyramid,
            lightingConfig,
        });
        allEntries.push(...detail.entries);
        totalRendered += detail.rendered;
        totalSkipped += detail.skipped;

        // Derive intermediate level from shaded detail tiles (must run before
        // the LOD‑4 overview pass so skip-if-exists protects any intermediate
        // tiles that happen to share a path — in practice they don't since
        // overview writes only to overviewLevel() = 0, but the ordering makes
        // the intent explicit: more-detailed derivation always wins).
        const intermediate = await deriveIntermediateTiles(world, detail.entries, pyramid);
        allEntries.push(...intermediate.entries);
        totalRendered += intermediate.rendered;
        totalSkipped += intermediate.skipped;

        const overview = await processSourceLevel({
            levelId: provider.overviewLevel.id,
            canonLevel: overviewLevel(),
            splitFactor: overviewSplit,
            label: 'overview',
            world,
            pyramid,
            lightingConfig,
        });
        allEntries.push(...overview.entries);
        totalRendered += overview.rendered;
        totalSkipped += overview.skipped;
    }

    // Deduplicate entries (same canonical tile from different source tiles)
    const entryMap = new Map<string, CanonicalEntry>();
    for (const entry of allEntries) {
        const key = `${entry.world}/${entry.blocksPerTile}/${entry.tileX}/${entry.tileZ}`;
        entryMap.set(key, entry);
    }

    // Prune entries whose output file no longer exists on disk (guards against
    // stale manifest from a partial/interrupted run or missing cache restore).
    // Derive the canonical level from the entry's blocksPerTile value.
    const uniqueEntries = [...entryMap.values()].filter(entry => {
        let level = detailLevel(pyramid);
        for (let l = 0; l < pyramid.levels; l++) {
            if (pyramidBlocksPerTile(l, pyramid) === entry.blocksPerTile) {
                level = l;
                break;
            }
        }
        const filePath = path.join(
            TILES_DIR, entry.world,
            String(level), String(entry.tileX),
            `${entry.tileZ}.${pyramid.format}`,
        );
        return existsSync(filePath);
    });

    // Write canonical manifest
    writeFileSync(MANIFEST_PATH, JSON.stringify(uniqueEntries, null, 2));

    console.log('\n=== Render Summary ===');
    console.log(`Rendered: ${totalRendered}`);
    console.log(`Skipped (cached): ${totalSkipped}`);
    console.log(`Canonical manifest: ${uniqueEntries.length} entries`);
    console.log('\n=== Complete ===');
}

main().catch((error: unknown) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
