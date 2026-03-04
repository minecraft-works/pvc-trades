#!/usr/bin/env npx tsx
/**
 * Standalone single-tile renderer
 *
 * Takes a BlueMap dual-layer PNG tile as input and produces three output tiles:
 *   1. slope-only:  BlueMap-exact slope shading (no enhancements)
 *   2. full:        slope + soft shadow + neighbour AO + block-light glow
 *   3. height-lit:  slope + shadow + AO + height-aware light emission
 *
 * Usage:
 *   npx tsx scripts/_render-single-tile.ts <input.png> [outputDir]
 *
 * Defaults:
 *   outputDir = same directory as input
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import {
    applyCoolShadowTint,
    applySlopeShading,
    boostSaturation,
    computeBlockLightGlow,
    computeHardShadowMap,
    computeHeightAwareLightGlowParallel,
    computeNeighborAO,
    decodeBlockLight,
    decodeHeightmap,
    isDualLayerTile,
    quantizeHeightmap,
    upsampleBilinear,
    upsampleNearest,
} from './heightmap-shader.js';

// ============================================================================
// CLI arguments
// ============================================================================

const inputPath = process.argv[2] ?? 'C:/Users/310251331/Downloads/bluemap/z0.png';
const outputDir = process.argv[3] ?? path.dirname(inputPath);
const baseName = path.basename(inputPath, path.extname(inputPath));

if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
}
mkdirSync(outputDir, { recursive: true });

// ============================================================================
// Shared context produced by decoding
// ============================================================================

/** Decoded tile data shared across all rendering passes. */
interface TileContext {
    /** Upscaled RGBA color buffer at 2× resolution */
    upColor: Buffer;
    /** Upscaled heightmap (nearest-neighbour) */
    upHeights: Float32Array;
    /** Upscaled block-light values (bilinear) */
    upBlockLights: Float32Array;
    /** Upscaled buffer width */
    upW: number;
    /** Upscaled buffer height */
    upH: number;
    /** Trimmed output width */
    tileW: number;
    /** Trimmed output height */
    tileH: number;
    /** Original heights at source resolution */
    heights: Float32Array;
    /** Original block-light at source resolution */
    blockLights: Float32Array;
    /** Original color buffer (for raw diagnostic) */
    colorBuffer: Buffer;
    /** Source tile width */
    sourceWidth: number;
    /** Source tile half-height (color region) */
    colorHeight: number;
}

// ============================================================================
// Helper functions — each pass is a separate function to stay under limits
// ============================================================================

/**
 * Decode the dual-layer tile and prepare upscaled buffers.
 *
 * @returns Shared tile context for rendering passes
 */
async function decodeTile(): Promise<TileContext> {
    const sourceImage = sharp(inputPath);
    const meta = await sourceImage.metadata();
    const sourceWidth = meta.width;
    const sourceHeight = meta.height;

    console.log(`Input: ${inputPath}`);
    console.log(`Dimensions: ${sourceWidth}×${sourceHeight}`);

    if (!isDualLayerTile(sourceWidth, sourceHeight)) {
        console.error('Not a BlueMap dual-layer tile (expected height ≈ 2× width).');
        process.exit(1);
    }

    const colorHeight = Math.floor(sourceHeight / 2);
    const fullRaw = await sourceImage.ensureAlpha().raw().toBuffer();
    const rowBytes = sourceWidth * 4;
    const colorBuffer = Buffer.from(fullRaw.subarray(0, colorHeight * rowBytes));
    const heightBuffer = fullRaw.subarray(colorHeight * rowBytes, colorHeight * 2 * rowBytes);

    const heights = decodeHeightmap(heightBuffer, sourceWidth, colorHeight);
    const blockLights = decodeBlockLight(heightBuffer, sourceWidth, colorHeight);

    logStats(heights, blockLights);

    const scale = 2;
    const upW = sourceWidth * scale;
    const upH = colorHeight * scale;

    const upColor = await sharp(colorBuffer, { raw: { width: sourceWidth, height: colorHeight, channels: 4 } })
        .resize(upW, upH, { kernel: 'nearest' })
        .raw()
        .toBuffer();

    const upHeights = upsampleNearest(heights, sourceWidth, colorHeight, scale);
    const upBlockLights = upsampleBilinear(blockLights, sourceWidth, colorHeight, scale);

    return {
        upColor,
        upHeights,
        upBlockLights,
        upW,
        upH,
        heights,
        blockLights,
        colorBuffer,
        sourceWidth,
        colorHeight,
        tileW: 1000,
        tileH: 1000,
    };
}

/**
 * Log height and block-light statistics.
 *
 * @param heights - Decoded heightmap
 * @param blockLights - Decoded block-light values
 */
function logStats(heights: Float32Array, blockLights: Float32Array): void {
    let hMin = Infinity;
    let hMax = -Infinity;
    for (const h of heights) {
        if (h < hMin) { hMin = h; }
        if (h > hMax) { hMax = h; }
    }
    let blMin = Infinity;
    let blMax = -Infinity;
    let blNonZero = 0;
    for (const bl of blockLights) {
        if (bl < blMin) { blMin = bl; }
        if (bl > blMax) { blMax = bl; }
        if (bl > 0.01) { blNonZero++; }
    }
    console.log(`Height range: ${hMin} to ${hMax}`);
    console.log(`Block-light range: ${blMin.toFixed(3)} to ${blMax.toFixed(3)}, non-zero pixels: ${blNonZero}/${blockLights.length}`);
}

/**
 * Apply additive glow RGB channels onto an RGBA color buffer.
 *
 * @param color - RGBA pixel buffer (mutated)
 * @param glowR - Red glow channel
 * @param glowG - Green glow channel
 * @param glowB - Blue glow channel
 * @param n - Total pixel count
 */
function applyGlow(color: Buffer, glowR: Float32Array, glowG: Float32Array, glowB: Float32Array, n: number): void {
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        color[o]     = Math.min(255, (color[o] ?? 0) + Math.round(glowR[i] ?? 0));
        color[o + 1] = Math.min(255, (color[o + 1] ?? 0) + Math.round(glowG[i] ?? 0));
        color[o + 2] = Math.min(255, (color[o + 2] ?? 0) + Math.round(glowB[i] ?? 0));
    }
}

/**
 * Write a trimmed PNG from an RGBA buffer.
 *
 * @param color - Source RGBA buffer
 * @param context - Tile context for dimensions
 * @param outPath - Output file path
 * @param compression - PNG compression level (0-9)
 */
async function writeTrimmedPng(color: Buffer, context: TileContext, outPath: string, compression = 6): Promise<void> {
    await sharp(color, { raw: { width: context.upW, height: context.upH, channels: 4 } })
        .extract({ left: 0, top: 0, width: context.tileW, height: context.tileH })
        .png({ compressionLevel: compression })
        .toFile(outPath);
}

/**
 * Pass 1: slope shading only (no enhancements).
 *
 * @param context - Decoded tile context
 */
async function renderPass1(context: TileContext): Promise<void> {
    console.log('\n--- Pass 1: Slope shading only ---');
    const color = Buffer.from(context.upColor);
    applySlopeShading(color, context.upHeights, context.upW, context.upH, 1);
    const outPath = path.join(outputDir, `${baseName}_slope-only.png`);
    await writeTrimmedPng(color, context, outPath);
    console.log(`Written: ${outPath}`);
}

/**
 * Pass 2: full pipeline (slope + shadow + AO + block-light glow).
 *
 * @param context - Decoded tile context
 */
async function renderPass2(context: TileContext): Promise<void> {
    console.log('\n--- Pass 2: Full pipeline (slope + shadow + AO + glow) ---');
    const color = Buffer.from(context.upColor);

    applySlopeShading(color, context.upHeights, context.upW, context.upH, 1);
    const hardShadow = computeHardShadowMap(context.upHeights, context.upW, context.upH);
    const ao = computeNeighborAO(context.upHeights, context.upW, context.upH);

    const n = context.upW * context.upH;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        const mul = hardShadow[i] * ao[i];
        color[o]     = Math.min(255, Math.max(0, Math.round(color[o] * mul)));
        color[o + 1] = Math.min(255, Math.max(0, Math.round(color[o + 1] * mul)));
        color[o + 2] = Math.min(255, Math.max(0, Math.round(color[o + 2] * mul)));
    }

    const { r, g, b } = computeBlockLightGlow(context.upBlockLights, context.upW, context.upH);
    applyGlow(color, r, g, b, n);

    const outPath = path.join(outputDir, `${baseName}_full.png`);
    await writeTrimmedPng(color, context, outPath);
    console.log(`Written: ${outPath}`);
}

/**
 * Pass 3: height-aware light emission with terrain occlusion.
 *
 * @param context - Decoded tile context
 */
async function renderPass3(context: TileContext): Promise<void> {
    console.log('\n--- Pass 3: Height-aware light emission ---');
    const color = Buffer.from(context.upColor);

    applySlopeShading(color, context.upHeights, context.upW, context.upH, 1);
    const hardShadow = computeHardShadowMap(context.upHeights, context.upW, context.upH);
    const ao = computeNeighborAO(context.upHeights, context.upW, context.upH);
    applyCoolShadowTint(color, hardShadow, ao, context.upW, context.upH);

    const n = context.upW * context.upH;
    const t0 = performance.now();
    const { r, g, b, intensity } = await computeHeightAwareLightGlowParallel(
        context.upBlockLights, context.upHeights, context.upW, context.upH,
        0.03, 48, 0.008, 0.5, 2,
    );
    console.log(`  Glow computed at 2× in ${((performance.now() - t0) / 1000).toFixed(2)}s`);
    applyGlow(color, r, g, b, n);

    boostSaturation(color, context.upW, context.upH, 1.3);

    const outPath = path.join(outputDir, `${baseName}_height-lit.png`);
    await writeTrimmedPng(color, context, outPath);
    console.log(`Written: ${outPath}`);

    // Glow intensity diagnostic
    const glowDiag = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
        glowDiag[i] = Math.min(255, Math.round((intensity[i] ?? 0) * 255));
    }
    const diagPath = path.join(outputDir, `${baseName}_glow-height-aware.png`);
    await sharp(glowDiag, { raw: { width: context.upW, height: context.upH, channels: 1 } })
        .extract({ left: 0, top: 0, width: context.tileW, height: context.tileH })
        .png({ compressionLevel: 9 })
        .toFile(diagPath);
    console.log(`Glow diagnostic: ${diagPath}`);
}

/**
 * Write diagnostic images (heightmap, block-light, raw color).
 *
 * @param context - Decoded tile context
 */
async function writeDiagnostics(context: TileContext): Promise<void> {
    console.log('\n--- Diagnostics ---');

    const q = quantizeHeightmap(context.heights, context.sourceWidth, context.colorHeight);
    let outPath = path.join(outputDir, `${baseName}_heightmap.png`);
    await sharp(q.data, { raw: { width: context.sourceWidth, height: context.colorHeight, channels: 1 } })
        .resize(context.tileW, context.tileH, { kernel: 'nearest' })
        .png({ compressionLevel: 9 })
        .toFile(outPath);
    console.log(`Heightmap (${q.min}–${q.max}): ${outPath}`);

    const blViz = Buffer.alloc(context.sourceWidth * context.colorHeight);
    for (let i = 0; i < context.blockLights.length; i++) {
        blViz[i] = Math.min(255, Math.round(context.blockLights[i] * 255));
    }
    outPath = path.join(outputDir, `${baseName}_blocklight.png`);
    await sharp(blViz, { raw: { width: context.sourceWidth, height: context.colorHeight, channels: 1 } })
        .resize(context.tileW, context.tileH, { kernel: 'nearest' })
        .png({ compressionLevel: 9 })
        .toFile(outPath);
    console.log(`Block-light: ${outPath}`);

    outPath = path.join(outputDir, `${baseName}_color-raw.png`);
    await sharp(context.colorBuffer, { raw: { width: context.sourceWidth, height: context.colorHeight, channels: 4 } })
        .resize(context.tileW, context.tileH, { kernel: 'nearest' })
        .png({ compressionLevel: 6 })
        .toFile(outPath);
    console.log(`Raw color: ${outPath}`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    const context = await decodeTile();
    await renderPass1(context);
    await renderPass2(context);
    await renderPass3(context);
    await writeDiagnostics(context);
    console.log('\nDone!');
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
