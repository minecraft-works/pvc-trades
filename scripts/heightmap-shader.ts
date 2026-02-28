/**
 * Heightmap Shader Module
 *
 * Pure functions for decoding BlueMap heightmap data and computing
 * per-pixel lighting shade maps. No I/O or sharp dependency — all
 * functions operate on raw pixel buffers.
 *
 * BlueMap encodes heightmap metadata in the bottom half of its dual-layer
 * 501×1002 PNG tiles. Each pixel's RGBA channels encode:
 *   R = block light (0–15, as R×255)
 *   G = height high byte
 *   B = height low byte
 *   A = unused
 *
 * Height decoding: `height = G×256 + B` (unsigned; signed at 32768).
 *
 * @module scripts/heightmap-shader
 * @see docs/adr/014-heightmap-lighting.md
 */

// ============================================================================
// Types
// ============================================================================

/** Configuration for heightmap-based lighting */
export interface LightingConfig {
    /** Shading model: 'slope' (BlueMap-style) or 'lambertian' (normal-based) */
    readonly model: 'slope' | 'lambertian';
    /** Sun direction vector [x, y, z] (will be normalized internally) */
    readonly sunDirection: readonly [number, number, number];
    /** Ambient light intensity (0–1). Prevents pure-black shadows */
    readonly ambientIntensity: number;
    /** Diffuse light intensity (0–1) */
    readonly diffuseIntensity: number;
    /** Height exaggeration factor (1.0 = real height, 2.0 = double relief) */
    readonly heightScale: number;
}

/** Quantized heightmap output for 8-bit grayscale tile */
export interface QuantizedHeightmap {
    /** Quantized 8-bit pixel data (width × height bytes) */
    readonly data: Buffer;
    /** Minimum height in the original heightmap */
    readonly min: number;
    /** Maximum height in the original heightmap */
    readonly max: number;
}

// ============================================================================
// Default Lighting Config
// ============================================================================

/** Default lighting configuration (noon sun, Lambertian model) */
export const DEFAULT_LIGHTING: LightingConfig = {
    model: 'lambertian',
    sunDirection: [0.3, 1, -0.3],
    ambientIntensity: 0.35,
    diffuseIntensity: 0.65,
    heightScale: 1
};

// ============================================================================
// Vector Utilities
// ============================================================================

/**
 * Normalize a 3-component vector to unit length.
 *
 * @param v - Input vector [x, y, z]
 * @returns Normalized vector with magnitude 1
 */
export function normalizeVec3(v: readonly [number, number, number]): [number, number, number] {
    const length = Math.hypot(v[0], v[1], v[2]);
    if (length === 0) { return [0, 1, 0]; }
    return [v[0] / length, v[1] / length, v[2] / length];
}

// ============================================================================
// Heightmap Decoding
// ============================================================================

/**
 * Decode BlueMap heightmap from raw RGBA pixel buffer.
 *
 * Each pixel encodes: R = block light, G = height high byte, B = height low byte.
 * Height is unsigned (G×256 + B); values ≥ 32768 are negative (signed encoding).
 *
 * @param rgba - Raw pixel data (4 bytes per pixel: R, G, B, A)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Float32Array of decoded height values (width × height elements)
 */
export function decodeHeightmap(
    rgba: Buffer | Uint8Array,
    width: number,
    height: number
): Float32Array {
    const pixelCount = width * height;
    const heights = new Float32Array(pixelCount);

    for (let i = 0; i < pixelCount; i++) {
        const offset = i * 4;
        const g = rgba[offset + 1]; // height high byte
        const b = rgba[offset + 2]; // height low byte
        const unsigned = g * 256 + b;
        heights[i] = unsigned >= 32_768 ? -(65_535 - unsigned) : unsigned;
    }

    return heights;
}

// ============================================================================
// Shade Computation
// ============================================================================

/**
 * Compute per-pixel shade intensity from a heightmap using slope model.
 *
 * This matches BlueMap's original fragment shader formula:
 * `shade = clamp((h - hRight + h - hBelow) × 0.06, -0.2, 0.04)`
 *
 * The result is converted to an absolute intensity multiplier:
 * `intensity = 1.0 + shade` (range 0.8–1.04).
 *
 * @param heights - Decoded height values (from decodeHeightmap)
 * @param width - Heightmap width in pixels
 * @param height - Heightmap height in pixels
 * @param config - Lighting configuration
 * @returns Float32Array of intensity multipliers (width × height elements)
 */
export function computeSlopeShade(
    heights: Float32Array,
    width: number,
    height: number,
    config: LightingConfig
): Float32Array {
    const shade = new Float32Array(width * height);
    const scale = config.heightScale;

    for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
            const index = z * width + x;
            const h = heights[index] * scale;
            const hRight = heights[z * width + Math.min(width - 1, x + 1)] * scale;
            const hBelow = heights[Math.min(height - 1, z + 1) * width + x] * scale;

            const slopeShade = Math.max(-0.2, Math.min(0.04, (h - hRight + h - hBelow) * 0.06));
            shade[index] = 1 + slopeShade;
        }
    }

    return shade;
}

/**
 * Compute per-pixel shade intensity using Lambertian diffuse model.
 *
 * Derives a surface normal from the height gradient at each pixel using
 * central differences, then computes `I = ambient + diffuse × max(0, n̂·l̂)`.
 *
 * @param heights - Decoded height values (from decodeHeightmap)
 * @param width - Heightmap width in pixels
 * @param height - Heightmap height in pixels
 * @param config - Lighting configuration
 * @returns Float32Array of intensity multipliers (width × height elements)
 */
export function computeLambertianShade(
    heights: Float32Array,
    width: number,
    height: number,
    config: LightingConfig
): Float32Array {
    const shade = new Float32Array(width * height);
    const [lx, ly, lz] = normalizeVec3(config.sunDirection);
    const scale = config.heightScale;

    for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
            const index = z * width + x;

            // Central differences for gradient (clamp at edges)
            const hL = heights[z * width + Math.max(0, x - 1)] * scale;
            const hR = heights[z * width + Math.min(width - 1, x + 1)] * scale;
            const hU = heights[Math.max(0, z - 1) * width + x] * scale;
            const hD = heights[Math.min(height - 1, z + 1) * width + x] * scale;

            const dx = hR - hL;
            const dz = hD - hU;

            // Surface normal: n = normalize(-dx, 2.0, -dz)
            const nx = -dx;
            const ny = 2;
            const nz = -dz;
            const length = Math.hypot(nx, ny, nz);
            const nnx = nx / length;
            const nny = ny / length;
            const nnz = nz / length;

            // Lambertian: I = ambient + diffuse × max(0, n·l)
            const dot = nnx * lx + nny * ly + nnz * lz;
            shade[index] = config.ambientIntensity
                + config.diffuseIntensity * Math.max(0, dot);
        }
    }

    return shade;
}

/**
 * Compute per-pixel shade intensity from a heightmap.
 *
 * Dispatches to the appropriate model based on config.model.
 *
 * @param heights - Decoded height values (from decodeHeightmap)
 * @param width - Heightmap width in pixels
 * @param height - Heightmap height in pixels
 * @param config - Lighting configuration
 * @returns Float32Array of intensity multipliers (width × height elements)
 */
export function computeShadeMap(
    heights: Float32Array,
    width: number,
    height: number,
    config: LightingConfig
): Float32Array {
    if (config.model === 'slope') {
        return computeSlopeShade(heights, width, height, config);
    }
    return computeLambertianShade(heights, width, height, config);
}

// ============================================================================
// Color Application
// ============================================================================

/**
 * Apply shade map to an RGBA color buffer in-place.
 *
 * Multiplies each pixel's R, G, B channels by the corresponding
 * shade intensity. Alpha is preserved. Output is clamped to 0–255.
 *
 * @param colorRgba - Mutable RGBA pixel buffer (modified in-place)
 * @param shadeMap - Per-pixel intensity multipliers (same length as pixel count)
 */
export function applyShadeToColor(
    colorRgba: Buffer | Uint8Array,
    shadeMap: Float32Array
): void {
    for (const [i, intensity] of shadeMap.entries()) {
        const offset = i * 4;
        colorRgba[offset] = Math.min(255, Math.max(0, Math.round(colorRgba[offset] * intensity)));
        colorRgba[offset + 1] = Math.min(255, Math.max(0, Math.round(colorRgba[offset + 1] * intensity)));
        colorRgba[offset + 2] = Math.min(255, Math.max(0, Math.round(colorRgba[offset + 2] * intensity)));
        // Alpha (offset + 3) is preserved
    }
}

// ============================================================================
// Heightmap Quantization (Phase 2)
// ============================================================================

/**
 * Extract a sub-region of RGBA pixels from a full source buffer.
 *
 * Used when splitting a dual-layer source tile into canonical sub-tiles.
 * Returns a new Buffer containing only the extracted region's pixels.
 *
 * @param rgba - Full source RGBA buffer (4 bytes per pixel)
 * @param sourceWidth - Width of the full source in pixels
 * @param startX - Left column of the sub-region (in pixels)
 * @param startZ - Top row of the sub-region (in pixels)
 * @param subWidth - Width of the sub-region
 * @param subHeight - Height of the sub-region
 * @returns New Buffer with extracted RGBA pixel data (subWidth × subHeight × 4 bytes)
 */
export function extractSubRegionRgba(
    rgba: Buffer | Uint8Array,
    sourceWidth: number,
    startX: number,
    startZ: number,
    subWidth: number,
    subHeight: number
): Buffer {
    const sub = Buffer.alloc(subWidth * subHeight * 4);
    const sourceRowBytes = sourceWidth * 4;
    const subRowBytes = subWidth * 4;
    for (let z = 0; z < subHeight; z++) {
        const sourceOffset = (startZ + z) * sourceRowBytes + startX * 4;
        const destinationOffset = z * subRowBytes;
        if (Buffer.isBuffer(rgba)) {
            rgba.copy(sub, destinationOffset, sourceOffset, sourceOffset + subRowBytes);
        } else {
            sub.set(rgba.subarray(sourceOffset, sourceOffset + subRowBytes), destinationOffset);
        }
    }
    return sub;
}

/**
 * Extract a sub-region of heights from a full-tile heightmap.
 *
 * Used when splitting a source tile into canonical sub-tiles —
 * each sub-tile gets its corresponding slice of the heightmap.
 *
 * @param heights - Full-tile decoded heights (sourceWidth × sourceHeight)
 * @param sourceWidth - Width of the full source heightmap
 * @param startX - Left column of the sub-region (in pixels)
 * @param startZ - Top row of the sub-region (in pixels)
 * @param subWidth - Width of the sub-region
 * @param subHeight - Height of the sub-region
 * @returns Float32Array of heights for the sub-region (subWidth × subHeight)
 */
export function extractSubHeights(
    heights: Float32Array,
    sourceWidth: number,
    startX: number,
    startZ: number,
    subWidth: number,
    subHeight: number
): Float32Array {
    const sub = new Float32Array(subWidth * subHeight);
    for (let z = 0; z < subHeight; z++) {
        for (let x = 0; x < subWidth; x++) {
            sub[z * subWidth + x] = heights[(startZ + z) * sourceWidth + (startX + x)];
        }
    }
    return sub;
}

/**
 * Quantize a Float32 heightmap to 8-bit grayscale for compact storage.
 *
 * Maps the height range [min, max] linearly to [0, 255].
 * If all heights are equal (flat terrain), all pixels are set to 128.
 *
 * @param heights - Float32 height values
 * @param width - Heightmap width in pixels
 * @param height - Heightmap height in pixels
 * @returns Quantized data buffer with min/max metadata for dequantization
 */
export function quantizeHeightmap(
    heights: Float32Array,
    width: number,
    height: number
): QuantizedHeightmap {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    const pixelCount = width * height;
    for (let i = 0; i < pixelCount; i++) {
        if (heights[i] < min) { min = heights[i]; }
        if (heights[i] > max) { max = heights[i]; }
    }

    const data = Buffer.alloc(pixelCount);
    const range = max - min;

    if (range === 0) {
        // Flat terrain — all pixels at midpoint
        data.fill(128);
    } else {
        for (let i = 0; i < pixelCount; i++) {
            data[i] = Math.round(255 * (heights[i] - min) / range);
        }
    }

    return { data, min: Math.round(min), max: Math.round(max) };
}

/**
 * Check if a source tile image dimensions indicate a BlueMap dual-layer tile.
 *
 * BlueMap dual-layer tiles have height ≈ 2× width (e.g., 501×1002).
 * Dynmap tiles are square (e.g., 512×512).
 *
 * @param imageWidth - Source image width in pixels
 * @param imageHeight - Source image height in pixels
 * @returns true if the image appears to be a dual-layer BlueMap tile
 */
export function isDualLayerTile(imageWidth: number, imageHeight: number): boolean {
    return imageHeight > imageWidth * 1.5;
}
