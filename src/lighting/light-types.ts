/**
 * Lighting Type Definitions
 *
 * Interfaces and constants for the unified GPU-accelerated runtime
 * lighting system. Covers sun (directional), point lights (torches),
 * and ambient illumination.
 *
 * @module lighting/light-types
 * @see docs/adr/014-heightmap-lighting.md — Phase 3
 */

// ============================================================================
// Point Lights
// ============================================================================

/** A point light source (e.g. player torch, placed light) */
export interface PointLight {
    /** Block X coordinate */
    readonly x: number;
    /** Block Y coordinate (height above sea level) */
    readonly y: number;
    /** Block Z coordinate */
    readonly z: number;
    /** Light radius in blocks (falloff reaches zero here) */
    readonly radius: number;
    /** RGB color, each channel 0–1 */
    readonly color: readonly [number, number, number];
    /** Intensity multiplier (default 1.0) */
    readonly intensity: number;
}

// ============================================================================
// Lighting Configuration
// ============================================================================

/** Runtime lighting configuration */
export interface LightConfig {
    /** Base ambient intensity (always-on fill light, 0–1) */
    readonly ambientIntensity: number;
    /** Sun intensity multiplier (0 = night, 0.8 = day) */
    readonly sunIntensity: number;
    /** Normalized sun direction vector [x, y, z] */
    readonly sunDirection: readonly [number, number, number];
    /** Maximum distance for sun shadow ray-march (blocks) */
    readonly sunMaxDistance: number;
    /** Number of ray-march steps for sun shadow */
    readonly sunSteps: number;
    /** Whether it's currently night */
    readonly isNight: boolean;
}

/** Mutable runtime lighting state */
export interface LightingState {
    /** Current lighting configuration */
    config: LightConfig;
    /** Active point light sources (max {@link MAX_POINT_LIGHTS}) */
    pointLights: PointLight[];
    /** Whether runtime lighting is enabled */
    enabled: boolean;
}

// ============================================================================
// Heightmap Atlas
// ============================================================================

/** Decoded heightmap data for a single tile */
export interface DecodedHeightmap {
    /** Real height values (width × height) */
    readonly heights: Float32Array;
    /** Tile width in pixels/blocks */
    readonly width: number;
    /** Tile height in pixels/blocks */
    readonly height: number;
}

/** Stitched heightmap atlas covering the viewport + margin */
export interface HeightmapAtlas {
    /** Continuous height values (atlasWidth × atlasHeight) */
    readonly heights: Float32Array;
    /** Atlas width in texels */
    readonly atlasWidth: number;
    /** Atlas height in texels */
    readonly atlasHeight: number;
    /** Block X coordinate of atlas top-left corner */
    readonly originBlockX: number;
    /** Block Z coordinate of atlas top-left corner */
    readonly originBlockZ: number;
    /** Blocks per texel (1 at detail level) */
    readonly blocksPerTexel: number;
}

/** Viewport in block coordinates */
export interface BlockViewport {
    /** Minimum block X (left edge) */
    readonly minBlockX: number;
    /** Maximum block X (right edge) */
    readonly maxBlockX: number;
    /** Minimum block Z (top edge) */
    readonly minBlockZ: number;
    /** Maximum block Z (bottom edge) */
    readonly maxBlockZ: number;
}

// ============================================================================
// Defaults & Constants
// ============================================================================

/** Maximum number of point lights supported by the shader */
export const MAX_POINT_LIGHTS = 8;

/** Default lighting config (daytime) */
export const DEFAULT_LIGHT_CONFIG: Readonly<LightConfig> = {
    ambientIntensity: 0.2,
    sunIntensity: 0.8,
    sunDirection: [0.3, 1, -0.3],
    sunMaxDistance: 64,
    sunSteps: 16,
    isNight: false,
};

/** Night lighting config */
export const NIGHT_LIGHT_CONFIG: Readonly<LightConfig> = {
    ambientIntensity: 0.2,
    sunIntensity: 0,
    sunDirection: [0.3, 1, -0.3],
    sunMaxDistance: 64,
    sunSteps: 16,
    isNight: true,
};

/** Default torch light properties (position filled at runtime) */
export const TORCH_LIGHT_DEFAULTS: Omit<PointLight, 'x' | 'y' | 'z'> = {
    radius: 48,
    color: [1, 0.78, 0.39],
    intensity: 1,
};

/**
 * Margin in blocks around the viewport for heightmap atlas.
 * Must be ≥ sunMaxDistance to prevent shadow ray clipping.
 */
export const ATLAS_MARGIN_BLOCKS = 64;

/**
 * Resolution downscale factor for the lighting overlay canvas.
 * 4 means ¼ of block resolution (each pixel covers 4×4 blocks).
 */
export const RESOLUTION_SCALE = 4;

/**
 * Create initial lighting state with defaults.
 *
 * @returns Fresh LightingState with daytime config and no point lights
 */
export function createLightingState(): LightingState {
    return {
        config: { ...DEFAULT_LIGHT_CONFIG },
        pointLights: [],
        enabled: false,
    };
}

/**
 * Toggle between day and night lighting config.
 *
 * @param state - Current lighting state (mutated in place)
 */
export function toggleDayNight(state: LightingState): void {
    state.config = state.config.isNight ? { ...DEFAULT_LIGHT_CONFIG } : { ...NIGHT_LIGHT_CONFIG };
}
