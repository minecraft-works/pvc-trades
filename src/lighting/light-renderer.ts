/**
 * Light Renderer (WebGL2)
 *
 * Manages the WebGL2 rendering pipeline for the runtime lighting
 * overlay. Compiles shaders, manages textures and uniforms, and renders
 * the lighting pass to an offscreen canvas.
 *
 * The renderer is stateful — it owns a WebGL2 context, shader program,
 * and heightmap texture. Call {@link createLightRenderer} once, then
 * update uniforms and call {@link LightRenderer.render} each frame.
 *
 * @module lighting/light-renderer
 * @see docs/adr/014-heightmap-lighting.md — Phase 3
 */

import debug from 'debug';

import { FRAGMENT_SHADER_SOURCE, VERTEX_SHADER_SOURCE } from './light-shaders.js';
import type {
    BlockViewport,
    HeightmapAtlas,
    LightConfig,
    PointLight,
} from './light-types.js';
import { MAX_POINT_LIGHTS, RESOLUTION_SCALE } from './light-types.js';

const debugRenderer = debug('pvc:lighting');

// ============================================================================
// Types
// ============================================================================

/** Uniform locations cache */
interface UniformLocations {
    u_heightmap: WebGLUniformLocation | null;
    u_atlasOrigin: WebGLUniformLocation | null;
    u_atlasSize: WebGLUniformLocation | null;
    u_viewOrigin: WebGLUniformLocation | null;
    u_viewSize: WebGLUniformLocation | null;
    u_resolution: WebGLUniformLocation | null;
    u_sunDirection: WebGLUniformLocation | null;
    u_sunIntensity: WebGLUniformLocation | null;
    u_sunMaxDistance: WebGLUniformLocation | null;
    u_sunSteps: WebGLUniformLocation | null;
    u_ambientIntensity: WebGLUniformLocation | null;
    u_numPointLights: WebGLUniformLocation | null;
    u_pointLights: (WebGLUniformLocation | null)[];
    u_pointLightColors: (WebGLUniformLocation | null)[];
}

/** Public API for the light renderer */
export interface LightRenderer {
    /** The canvas element (attach to DOM for display) */
    readonly canvas: HTMLCanvasElement;
    /** Upload a new heightmap atlas to the GPU */
    uploadHeightmap: (atlas: HeightmapAtlas) => void;
    /** Render the lighting pass with current state */
    render: (viewport: BlockViewport, config: LightConfig, pointLights: readonly PointLight[]) => void;
    /** Resize the output canvas (call on viewport size change) */
    resize: (widthBlocks: number, heightBlocks: number) => void;
    /** Release WebGL resources */
    dispose: () => void;
    /** Whether the renderer initialized successfully */
    readonly isValid: boolean;
}

// ============================================================================
// Shader Compilation
// ============================================================================

/**
 * Compile a WebGL shader from source.
 *
 * @param gl - WebGL2 context
 * @param type - Shader type (VERTEX_SHADER or FRAGMENT_SHADER)
 * @param source - GLSL source code
 * @returns Compiled shader, or undefined on compilation error
 */
/* eslint-disable functional/prefer-immutable-types */
function compileShader(
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
): WebGLShader | undefined {
/* eslint-enable functional/prefer-immutable-types */
    const shader = gl.createShader(type);
    if (!shader) { return undefined; }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        console.error(`Shader compilation failed:\n${info ?? 'unknown error'}`);
        debugRenderer('shader compile error: %s', info);
        gl.deleteShader(shader);
        return undefined;
    }

    return shader;
}

/**
 * Link a shader program from vertex + fragment shaders.
 *
 * @param gl - WebGL2 context
 * @param vertShader - Compiled vertex shader
 * @param fragShader - Compiled fragment shader
 * @returns Linked program, or undefined on link error
 */
/* eslint-disable functional/prefer-immutable-types */
function linkProgram(
    gl: WebGL2RenderingContext,
    vertShader: WebGLShader,
    fragShader: WebGLShader,
): WebGLProgram | undefined {
/* eslint-enable functional/prefer-immutable-types */
    const program = gl.createProgram();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!program) { return undefined; }

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        console.error(`Program link failed:\n${info ?? 'unknown error'}`);
        debugRenderer('program link error: %s', info);
        gl.deleteProgram(program);
        return undefined;
    }

    return program;
}

// ============================================================================
// Uniform Initialization
// ============================================================================

/**
 * Look up all uniform locations for the lighting program.
 *
 * @param gl - WebGL2 context
 * @param program - Linked shader program
 * @returns Cached uniform locations
 */
/* eslint-disable functional/prefer-immutable-types */
function getUniformLocations(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
): UniformLocations {
/* eslint-enable functional/prefer-immutable-types */
    const pointLights: (WebGLUniformLocation | null)[] = [];
    const pointLightColors: (WebGLUniformLocation | null)[] = [];

    for (let index = 0; index < MAX_POINT_LIGHTS; index++) {
        // eslint-disable-next-line functional/immutable-data
        pointLights.push(gl.getUniformLocation(program, `u_pointLights[${index}]`));
        // eslint-disable-next-line functional/immutable-data
        pointLightColors.push(gl.getUniformLocation(program, `u_pointLightColors[${index}]`));
    }

    return {
        u_heightmap: gl.getUniformLocation(program, 'u_heightmap'),
        u_atlasOrigin: gl.getUniformLocation(program, 'u_atlasOrigin'),
        u_atlasSize: gl.getUniformLocation(program, 'u_atlasSize'),
        u_viewOrigin: gl.getUniformLocation(program, 'u_viewOrigin'),
        u_viewSize: gl.getUniformLocation(program, 'u_viewSize'),
        u_resolution: gl.getUniformLocation(program, 'u_resolution'),
        u_sunDirection: gl.getUniformLocation(program, 'u_sunDirection'),
        u_sunIntensity: gl.getUniformLocation(program, 'u_sunIntensity'),
        u_sunMaxDistance: gl.getUniformLocation(program, 'u_sunMaxDistance'),
        u_sunSteps: gl.getUniformLocation(program, 'u_sunSteps'),
        u_ambientIntensity: gl.getUniformLocation(program, 'u_ambientIntensity'),
        u_numPointLights: gl.getUniformLocation(program, 'u_numPointLights'),
        u_pointLights: pointLights,
        u_pointLightColors: pointLightColors,
    };
}

// ============================================================================
// Renderer Factory
// ============================================================================

/**
 * Create a GPU-accelerated light renderer.
 *
 * Initializes a WebGL2 context, compiles shaders, and prepares the
 * rendering pipeline. Returns a {@link LightRenderer} interface for
 * uploading heightmaps and rendering lighting frames.
 *
 * If WebGL2 is unavailable, returns a renderer with `isValid = false`.
 *
 * @returns Light renderer instance
 */
// eslint-disable-next-line max-lines-per-function
export function createLightRenderer(): LightRenderer {
    const canvas = document.createElement('canvas');
    canvas.style.imageRendering = 'auto'; // bilinear smoothing for ¼-res output

    const glOrNull = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
    });

    if (!glOrNull) {
        debugRenderer('WebGL2 not available — CPU fallback');
        return createCpuFallbackRenderer(canvas);
    }

    // Re-assign after null check so closures see non-nullable type
    const gl: WebGL2RenderingContext = glOrNull;

    // Compile shaders
    const vertShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

    if (!vertShader || !fragShader) {
        debugRenderer('shader compilation failed — CPU fallback');
        return createCpuFallbackRenderer(canvas);
    }

    const programOrNull = linkProgram(gl, vertShader, fragShader);
    if (!programOrNull) {
        debugRenderer('program linking failed — CPU fallback');
        return createCpuFallbackRenderer(canvas);
    }
    const program: WebGLProgram = programOrNull;

    // Clean up individual shaders (attached to program)
    gl.deleteShader(vertShader);
    gl.deleteShader(fragShader);

    const uniforms = getUniformLocations(gl, program);

    // Create heightmap texture (R32F)
    const heightmapTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, heightmapTexture);
    // Set texture params for nearest-neighbor (heightmap = discrete data)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Track current atlas metadata
    // eslint-disable-next-line functional/no-let
    let currentAtlasOrigin = [0, 0];
    // eslint-disable-next-line functional/no-let
    let currentAtlasSize = [1, 1];

    debugRenderer('WebGL2 renderer initialized');

    function uploadHeightmap(atlas: HeightmapAtlas): void {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, heightmapTexture);

        // Upload as R32F (single-channel float)
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.R32F,
            atlas.atlasWidth,
            atlas.atlasHeight,
            0,
            gl.RED,
            gl.FLOAT,
            atlas.heights,
        );
         
        currentAtlasOrigin = [atlas.originBlockX, atlas.originBlockZ];
         
        currentAtlasSize = [
            atlas.atlasWidth * atlas.blocksPerTexel,
            atlas.atlasHeight * atlas.blocksPerTexel,
        ];

        debugRenderer('heightmap uploaded: %dx%d texels', atlas.atlasWidth, atlas.atlasHeight);
    }

    function resize(widthBlocks: number, heightBlocks: number): void {
        // ¼ resolution: each pixel covers RESOLUTION_SCALE blocks
        const pixelWidth = Math.ceil(widthBlocks / RESOLUTION_SCALE);
        const pixelHeight = Math.ceil(heightBlocks / RESOLUTION_SCALE);

        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            // eslint-disable-next-line functional/immutable-data
            canvas.width = pixelWidth;
            // eslint-disable-next-line functional/immutable-data
            canvas.height = pixelHeight;
            gl.viewport(0, 0, pixelWidth, pixelHeight);
            debugRenderer('resized to %dx%d px (¼ of %dx%d blocks)',
                pixelWidth, pixelHeight, widthBlocks, heightBlocks);
        }
    }

    function render(
        viewport: BlockViewport,
        config: LightConfig,
        pointLights: readonly PointLight[],
    ): void {
        gl.useProgram(program);

        // ── Heightmap texture ──
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, heightmapTexture);
        gl.uniform1i(uniforms.u_heightmap, 0);

        // ── Atlas uniforms ──
        gl.uniform2f(uniforms.u_atlasOrigin, currentAtlasOrigin[0] ?? 0, currentAtlasOrigin[1] ?? 0);
        gl.uniform2f(uniforms.u_atlasSize, currentAtlasSize[0] ?? 1, currentAtlasSize[1] ?? 1);

        // ── Viewport uniforms ──
        const viewWidth = viewport.maxBlockX - viewport.minBlockX;
        const viewHeight = viewport.maxBlockZ - viewport.minBlockZ;
        gl.uniform2f(uniforms.u_viewOrigin, viewport.minBlockX, viewport.minBlockZ);
        gl.uniform2f(uniforms.u_viewSize, viewWidth, viewHeight);
        gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);

        // ── Sun uniforms ──
        const [sx, sy, sz] = normalizeVec3(config.sunDirection);
        gl.uniform3f(uniforms.u_sunDirection, sx, sy, sz);
        gl.uniform1f(uniforms.u_sunIntensity, config.sunIntensity);
        gl.uniform1f(uniforms.u_sunMaxDistance, config.sunMaxDistance);
        gl.uniform1i(uniforms.u_sunSteps, config.sunSteps);

        // ── Ambient ──
        gl.uniform1f(uniforms.u_ambientIntensity, config.ambientIntensity);

        // ── Point lights ──
        const numberLights = Math.min(pointLights.length, MAX_POINT_LIGHTS);
        gl.uniform1i(uniforms.u_numPointLights, numberLights);

        for (let index = 0; index < MAX_POINT_LIGHTS; index++) {
            // eslint-disable-next-line unicorn/no-null
            const posLoc = uniforms.u_pointLights[index] ?? null;
            // eslint-disable-next-line unicorn/no-null
            const colorLoc = uniforms.u_pointLightColors[index] ?? null;

            if (index < numberLights) {
                const light = pointLights[index];
                if (light) {
                    gl.uniform4f(posLoc, light.x, light.y, light.z, light.radius);
                    gl.uniform3f(
                        colorLoc,
                        light.color[0] * light.intensity,
                        light.color[1] * light.intensity,
                        light.color[2] * light.intensity,
                    );
                }
            } else {
                gl.uniform4f(posLoc, 0, 0, 0, 0);
                gl.uniform3f(colorLoc, 0, 0, 0);
            }
        }

        // ── Draw fullscreen triangle ──
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function dispose(): void {
        gl.deleteTexture(heightmapTexture);
        gl.deleteProgram(program);
        debugRenderer('renderer disposed');
    }

    return {
        canvas,
        uploadHeightmap,
        render,
        resize,
        dispose,
        isValid: true,
    };
}

// ============================================================================
// CPU Fallback
// ============================================================================

/**
 * Create a CPU-only fallback renderer.
 *
 * When WebGL2 is unavailable, this renders a flat ambient tint with no
 * sun shadows or point lights. Still supports day/night toggle (uniform
 * darkening).
 *
 * @param canvas - Canvas element to render to
 * @returns Light renderer with CPU-only rendering
 */
// eslint-disable-next-line functional/prefer-immutable-types
function createCpuFallbackRenderer(canvas: HTMLCanvasElement): LightRenderer {
    const context = canvas.getContext('2d');

    return {
        canvas,
        uploadHeightmap: () => { /* no-op for CPU fallback */ },
         
        render: (_viewport: BlockViewport, config: LightConfig) => {
            if (!context) { return; }
            const brightness = Math.min(1, config.ambientIntensity + config.sunIntensity);
            context.clearRect(0, 0, canvas.width, canvas.height);
            // eslint-disable-next-line functional/immutable-data
            context.fillStyle = `rgb(${Math.round(brightness * 255)}, ${Math.round(brightness * 255)}, ${Math.round(brightness * 255)})`;
            context.fillRect(0, 0, canvas.width, canvas.height);
        },
         
        resize: (widthBlocks: number, heightBlocks: number) => {
            const pixelWidth = Math.ceil(widthBlocks / RESOLUTION_SCALE);
            const pixelHeight = Math.ceil(heightBlocks / RESOLUTION_SCALE);
            // eslint-disable-next-line functional/immutable-data
            canvas.width = pixelWidth;
            // eslint-disable-next-line functional/immutable-data
            canvas.height = pixelHeight;
        },
        dispose: () => { /* nothing to clean up */ },
        isValid: false,
    };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Normalize a 3-component vector.
 *
 * @param v - Input vector [x, y, z]
 * @returns Normalized vector, or [0, 1, 0] if zero-length
 */
// eslint-disable-next-line functional/prefer-immutable-types
function normalizeVec3(v: readonly [number, number, number]): [number, number, number] {
    const length = Math.hypot(v[0], v[1], v[2]);
    if (length === 0) { return [0, 1, 0]; }
    return [v[0] / length, v[1] / length, v[2] / length];
}
