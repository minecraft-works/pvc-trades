/**
 * Lighting Shaders (GLSL)
 *
 * Vertex and fragment shader source strings for the WebGL2
 * GPU-accelerated lighting system.
 *
 * The vertex shader renders a fullscreen triangle. The fragment shader:
 * 1. Converts screen coordinates → block coordinates via viewport uniforms
 * 2. Samples the heightmap atlas for terrain height
 * 3. Ray-marches sun shadow (directional light)
 * 4. Computes up to 8 point lights with 3D distance, terrain occlusion,
 *    and inverse-square falloff
 * 5. Outputs an RGB lighting color for `mix-blend-mode: multiply`
 *
 * @module lighting/light-shaders
 * @see docs/adr/014-heightmap-lighting.md — Phase 3
 */

import { MAX_POINT_LIGHTS } from './light-types.js';

// ============================================================================
// Vertex Shader
// ============================================================================

/**
 * Fullscreen triangle vertex shader.
 *
 * Renders a single triangle covering the entire viewport without
 * requiring a vertex buffer. Uses `gl_VertexID` (WebGL2).
 */
export const VERTEX_SHADER_SOURCE = /* glsl */ `#version 300 es
precision highp float;

// Fullscreen triangle from gl_VertexID (0, 1, 2)
void main() {
    // Positions: (-1,-1), (3,-1), (-1,3) → covers full clip space
    float x = float((gl_VertexID & 1) * 4 - 1);
    float y = float((gl_VertexID >> 1) * 4 - 1);
    gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

// ============================================================================
// Fragment Shader
// ============================================================================

/**
 * Lighting fragment shader.
 *
 * Computes per-pixel lighting by sampling a heightmap atlas texture and
 * performing shadow ray-marching for the sun + up to 8 point lights.
 *
 * Output is an RGB lighting multiplier (for mix-blend-mode: multiply):
 * - (1, 1, 1) = fully lit → no darkening
 * - (0.2, 0.2, 0.2) = deep shadow
 * - (0.6, 0.5, 0.3) = warm torch light tint
 */
export const FRAGMENT_SHADER_SOURCE = /* glsl */ `#version 300 es
precision highp float;

// ── Heightmap Atlas ──────────────────────────────────────────────────
uniform sampler2D u_heightmap;
// Atlas origin in block coordinates (top-left corner)
uniform vec2 u_atlasOrigin;
// Atlas size in blocks
uniform vec2 u_atlasSize;

// ── Viewport ─────────────────────────────────────────────────────────
// Viewport origin in block coordinates (top-left)
uniform vec2 u_viewOrigin;
// Viewport size in blocks
uniform vec2 u_viewSize;
// Canvas resolution in pixels
uniform vec2 u_resolution;

// ── Sun (Directional Light) ──────────────────────────────────────────
uniform vec3 u_sunDirection;     // Normalized sun direction
uniform float u_sunIntensity;    // 0.0 = night, 0.8 = day
uniform float u_sunMaxDistance;  // Max ray-march distance (blocks)
uniform int u_sunSteps;          // Number of ray-march steps

// ── Ambient ──────────────────────────────────────────────────────────
uniform float u_ambientIntensity;

// ── Point Lights ─────────────────────────────────────────────────────
uniform int u_numPointLights;
// xyz = block position, w = radius
uniform vec4 u_pointLights[${MAX_POINT_LIGHTS}];
// rgb = color × intensity (pre-multiplied)
uniform vec3 u_pointLightColors[${MAX_POINT_LIGHTS}];

// ── Output ───────────────────────────────────────────────────────────
out vec4 fragColor;

// ── Helper: sample height from atlas ─────────────────────────────────
float sampleHeight(vec2 blockPos) {
    vec2 uv = (blockPos - u_atlasOrigin) / u_atlasSize;
    // Clamp to atlas bounds — out-of-bounds reads return edge height
    uv = clamp(uv, vec2(0.0), vec2(1.0));
    return texture(u_heightmap, uv).r;
}

// ── Sun shadow ray-march ─────────────────────────────────────────────
/**
 * March a ray from the surface point toward the sun.
 * If any terrain sample along the ray is higher than the ray's Y,
 * the point is in shadow.
 *
 * Returns 1.0 (fully lit) or 0.0 (in shadow).
 */
float sunShadow(vec2 blockPos, float surfaceHeight) {
    if (u_sunIntensity <= 0.0) return 0.0;
    if (u_sunDirection.y <= 0.001) return 0.0; // Sun at/below horizon

    float stepSize = u_sunMaxDistance / float(u_sunSteps);
    vec3 rayPos = vec3(blockPos, surfaceHeight);
    vec3 rayDir = normalize(u_sunDirection) * stepSize;

    for (int i = 1; i <= ${String(64)}; i++) {
        if (i > u_sunSteps) break;

        rayPos += rayDir;
        float terrainHeight = sampleHeight(rayPos.xz);

        // Ray Y vs terrain height — note: rayDir.z maps to world Y
        // In our 2D top-down system: ray.z = height, terrain height sampled at ray.xy
        if (terrainHeight > rayPos.z) {
            return 0.0; // Occluded by terrain
        }
    }

    return 1.0;
}

// ── Point light contribution ─────────────────────────────────────────
/**
 * Compute illumination from a single point light.
 * Includes 3D distance falloff, terrain occlusion check, and
 * inverse-square attenuation: (1 - dist/radius)^2.
 */
vec3 pointLightContribution(
    vec4 light,    // xyz = position, w = radius
    vec3 color,    // pre-multiplied rgb
    vec2 blockPos,
    float surfaceHeight
) {
    float radius = light.w;
    vec3 lightPos = light.xyz;
    vec3 surfacePos = vec3(blockPos, surfaceHeight);

    // 3D distance
    float dist3D = distance(surfacePos, lightPos);
    if (dist3D >= radius) return vec3(0.0);

    // Inverse-square falloff
    float t = 1.0 - dist3D / radius;
    float attenuation = t * t;

    // Simple terrain occlusion: check midpoint between light and surface
    // If terrain at midpoint is higher than the line connecting them → occluded
    vec2 midXZ = (blockPos + lightPos.xy) * 0.5;
    float midRayHeight = (surfaceHeight + lightPos.z) * 0.5;
    float midTerrainHeight = sampleHeight(midXZ);

    if (midTerrainHeight > midRayHeight + 2.0) {
        return vec3(0.0); // Hill between light and surface
    }

    return color * attenuation;
}

// ── Main ─────────────────────────────────────────────────────────────
void main() {
    // Screen pixel → block coordinates
    vec2 uv = gl_FragCoord.xy / u_resolution;
    // Flip Y: screen Y=0 is bottom, map Z increases downward
    uv.y = 1.0 - uv.y;
    vec2 blockPos = u_viewOrigin + uv * u_viewSize;

    // Sample terrain height at this position
    float height = sampleHeight(blockPos);

    // ── Ambient ──
    vec3 lighting = vec3(u_ambientIntensity);

    // ── Sun ──
    float shadow = sunShadow(blockPos, height);
    lighting += vec3(u_sunIntensity * shadow);

    // ── Point Lights ──
    for (int i = 0; i < ${MAX_POINT_LIGHTS}; i++) {
        if (i >= u_numPointLights) break;
        lighting += pointLightContribution(
            u_pointLights[i],
            u_pointLightColors[i],
            blockPos,
            height
        );
    }

    // Clamp to [0, 1] — multiply blend can't brighten beyond source
    lighting = clamp(lighting, vec3(0.0), vec3(1.0));

    fragColor = vec4(lighting, 1.0);
}
`;
