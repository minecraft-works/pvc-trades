# ADR-014: Heightmap-Based Lighting

## Status

Accepted — Phase 1 (baked static lighting) and Phase 2 (heightmap tile emission) implemented.

## Context

BlueMap tiles embed a heightmap in the bottom half of their dual-layer 501×1002 PNG (see [ADR-012](012-bluemap-tile-migration.md)). The existing `BlueMapTileProvider.processImage()` already extracts this data into an `ImageData` object at runtime, but nothing consumes it downstream. The build-time renderer (`scripts/render-tiles.ts`) treats all source tiles as flat color images — it runs `sharp.extract()` on the top-half color region and discards the bottom-half metadata entirely.

The heightmap encodes per-pixel elevation and block light levels. Applying slope-based or normal-based shading to color tiles produces significantly more realistic terrain rendering — hills cast shadows, valleys darken, and cliff faces show relief. BlueMap's own WebGL viewer already does this with a GLSL fragment shader.

This ADR defines a three-phase plan to incorporate heightmap-based lighting into the canonical tile pipeline (ADR-013), starting with zero-cost baked shading and progressing to optional runtime dynamic lighting with day/night cycle support.

### What We Have Today

| Component | File | Current behavior |
|-----------|------|-----------------|
| `ProcessedTile` interface | `src/map/providers/tile-provider.ts` | `{ colorImage: Blob; heightmap?: ImageData }` — heightmap field exists |
| `BlueMapTileProvider.processImage()` | `src/map/providers/bluemap-provider.ts` | Splits dual PNG → color (top 500×500) + heightmap metadata (bottom 500×500) |
| `DynmapTileProvider.processImage()` | `src/map/providers/dynmap-provider.ts` | Identity — returns blob unchanged, no heightmap |
| `splitSourceTile()` | `scripts/render-tiles.ts` | `sharp.extract()` on raw source PNG. No heightmap awareness |
| `loadTileToMap()` | `src/map/tile-loader.ts` | `L.imageOverlay(url)` — single color tile, no post-processing |
| Tile manifest | `public/tiles/manifest.json` | `[{ world, tileX, tileZ, blocksPerTile }]` — no heightmap flag |

### BlueMap Heightmap Format

The bottom 501×501 pixels of each BlueMap tile encode per-pixel metadata in RGBA channels:

```
R = block light level (0–15, encoded as R × 255)
G = height high byte
B = height low byte
A = unused
```

**Height decoding** (from BlueMap's `LowresFragmentShader.js`):

```
heightUnsigned = G × 256 + B
if heightUnsigned ≥ 32768:
    height = -(65535 - heightUnsigned)    // negative (below sea level)
else:
    height = heightUnsigned               // positive
```

**BlueMap's own shade formula** (simple slope):

```
shade = clamp((h[x,z] - h[x+1,z] + h[x,z] - h[x,z+1]) × 0.06, -0.2, 0.04)
```

This mimics northwest-facing fixed light. The factor 0.06 and clamp range were tuned for BlueMap's 3D WebGL view.

## Decision

Implement heightmap-based lighting in three phases using a **hybrid baked-default + optional dynamic override** strategy:

1. **Phase 1 — Baked static lighting** at build time (zero runtime cost)
2. **Phase 2 — Ship heightmap tiles** alongside color tiles (no runtime change yet)
3. **Phase 3 — Runtime dynamic compositing** with day/night cycle

Each phase is independently deployable. Phase 1 alone produces visibly improved tiles. Phase 3 is optional and can be deferred indefinitely.

## Phase 1: Baked Static Lighting (Build-Time)

### Goal

Apply Lambertian diffuse shading to color tiles during `render-tiles.ts` so the canonical output contains pre-lit JPEG tiles. Zero runtime change.

### Lighting Model

Use a **Lambertian diffuse** model with configurable sun direction instead of BlueMap's simple slope formula. This produces more realistic terrain relief:

```
I = I_ambient + I_diffuse × max(0, n̂ · l̂)
```

Where:
- **n̂** = surface normal from heightmap gradients:
  ```
  dx = h[x+1,z] - h[x-1,z]
  dz = h[x,z+1] - h[x,z-1]
  n̂ = normalize(-dx, 2.0, -dz)
  ```
- **l̂** = light direction vector (noon default: `normalize(0.3, 1.0, -0.3)`)  
- **I_ambient** = 0.35 (fill light — shadows are never pure black on a Minecraft map)
- **I_diffuse** = 0.65

The shade value per pixel modulates the color tile brightness:

```
outputRGB = colorRGB × I
```

### Configuration

Add to `config.json`:

```jsonc
{
  "tilePyramid": {
    // ... existing fields ...
    "lighting": {
      "enabled": true,
      "model": "lambertian",
      "sunDirection": [0.3, 1.0, -0.3],
      "ambientIntensity": 0.35,
      "diffuseIntensity": 0.65,
      "heightScale": 1.0
    }
  }
}
```

Add Zod schema in `src/types.ts`:

```typescript
const LightingConfigSchema = z.object({
    /** Enable heightmap-based lighting in tile rendering */
    enabled: z.boolean().default(false),
    /** Shading model: 'slope' (BlueMap-style) or 'lambertian' (normal-based) */
    model: z.enum(['slope', 'lambertian']).default('lambertian'),
    /** Sun direction vector [x, y, z] (will be normalized) */
    sunDirection: z.tuple([z.number(), z.number(), z.number()])
        .default([0.3, 1.0, -0.3]),
    /** Ambient light intensity (0–1). Prevents pure-black shadows */
    ambientIntensity: z.number().min(0).max(1).default(0.35),
    /** Diffuse light intensity (0–1) */
    diffuseIntensity: z.number().min(0).max(1).default(0.65),
    /** Height exaggeration factor (1.0 = real height, 2.0 = double relief) */
    heightScale: z.number().positive().default(1.0)
}).default({});
```

Add `lighting` as optional field on `TilePyramidConfigSchema`.

### Build Script Changes: `scripts/render-tiles.ts`

#### New module: `scripts/heightmap-shader.ts`

Pure functions — no I/O, no sharp dependency. Testable in isolation.

```typescript
// scripts/heightmap-shader.ts

export interface LightingConfig {
    model: 'slope' | 'lambertian';
    sunDirection: [number, number, number];
    ambientIntensity: number;
    diffuseIntensity: number;
    heightScale: number;
}

/**
 * Decode BlueMap heightmap from raw RGBA pixel buffer.
 *
 * @param rgba - Raw pixel data (4 bytes per pixel: R, G, B, A)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Float32Array of decoded height values (width × height)
 */
export function decodeHeightmap(
    rgba: Buffer,
    width: number,
    height: number
): Float32Array { /* ... */ }

/**
 * Compute per-pixel shade intensity from a heightmap.
 *
 * Returns a Float32Array where each value is a brightness multiplier
 * (0.0 = black, 1.0 = full brightness, >1.0 = slight highlight).
 *
 * @param heights - Decoded height values (from decodeHeightmap)
 * @param width - Heightmap width
 * @param height - Heightmap height
 * @param config - Lighting configuration
 * @returns Float32Array of intensity multipliers (width × height)
 */
export function computeShadeMap(
    heights: Float32Array,
    width: number,
    height: number,
    config: LightingConfig
): Float32Array { /* ... */ }

/**
 * Apply shade map to an RGBA color buffer in-place.
 *
 * Multiplies each pixel's R, G, B channels by the corresponding
 * shade intensity. Alpha is preserved.
 *
 * @param colorRgba - Mutable RGBA pixel buffer (modified in-place)
 * @param shadeMap - Per-pixel intensity multipliers
 */
export function applyShadeToColor(
    colorRgba: Buffer,
    shadeMap: Float32Array
): void { /* ... */ }
```

#### `decodeHeightmap` implementation detail

```typescript
export function decodeHeightmap(
    rgba: Buffer,
    width: number,
    height: number
): Float32Array {
    const heights = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
        const offset = i * 4;
        // R = block light (unused for shading)
        const g = rgba[offset + 1];  // height high byte
        const b = rgba[offset + 2];  // height low byte
        const unsigned = g * 256 + b;
        heights[i] = unsigned >= 32768 ? -(65535 - unsigned) : unsigned;
    }
    return heights;
}
```

#### `computeShadeMap` implementation detail (Lambertian)

```typescript
export function computeShadeMap(
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
            const idx = z * width + x;

            // Central differences for gradient (clamp at edges)
            const hL = heights[z * width + Math.max(0, x - 1)] * scale;
            const hR = heights[z * width + Math.min(width - 1, x + 1)] * scale;
            const hU = heights[Math.max(0, z - 1) * width + x] * scale;
            const hD = heights[Math.min(height - 1, z + 1) * width + x] * scale;

            const dx = hR - hL;
            const dz = hD - hU;

            // Surface normal: n = normalize(-dx, 2.0, -dz)
            const nx = -dx;
            const ny = 2.0;
            const nz = -dz;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            const nnx = nx / len;
            const nny = ny / len;
            const nnz = nz / len;

            // Lambertian: I = ambient + diffuse * max(0, n·l)
            const dot = nnx * lx + nny * ly + nnz * lz;
            shade[idx] = config.ambientIntensity
                + config.diffuseIntensity * Math.max(0, dot);
        }
    }

    return shade;
}

function normalizeVec3(v: [number, number, number]): [number, number, number] {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
}
```

#### Changes to `render-tiles.ts`

Modify `splitSourceTile()`:

1. Before splitting, detect whether the source tile is a BlueMap dual-layer PNG (height > width × 1.5)
2. If dual-layer + lighting enabled:
   a. Extract top half as color buffer (raw RGBA via `sharp.raw()`)
   b. Extract bottom half as heightmap buffer
   c. Call `decodeHeightmap()` → `computeShadeMap()` → `applyShadeToColor()`
   d. Write shaded color buffer back into a sharp pipeline
3. Then split into canonical sub-tiles as before

```typescript
async function splitSourceTile(options: SplitOptions): Promise<SplitResult> {
    const { source, canonLevel, splitFactor, cropWidth, cropHeight, pyramid } = options;
    // ...existing setup...

    let sourceImage = sharp(source.sourcePath);
    const metadata = await sourceImage.metadata();

    // Detect BlueMap dual-layer tile (height ≈ 2× width)
    const isDualLayer = metadata.height !== undefined
        && metadata.width !== undefined
        && metadata.height > metadata.width * 1.5;

    if (isDualLayer && lightingConfig?.enabled) {
        // Extract color (top half) and heightmap (bottom half)
        const colorHalf = await sharp(source.sourcePath)
            .extract({ left: 0, top: 0, width: metadata.width!, height: Math.floor(metadata.height! / 2) })
            .raw()
            .toBuffer({ resolveWithObject: true });

        const metaHalf = await sharp(source.sourcePath)
            .extract({ left: 0, top: Math.floor(metadata.height! / 2), width: metadata.width!, height: Math.floor(metadata.height! / 2) })
            .raw()
            .toBuffer({ resolveWithObject: true });

        const heights = decodeHeightmap(metaHalf.data, metaHalf.info.width, metaHalf.info.height);
        const shadeMap = computeShadeMap(heights, metaHalf.info.width, metaHalf.info.height, lightingConfig);
        applyShadeToColor(colorHalf.data, shadeMap);

        // Reconstruct as sharp input from shaded raw pixels
        sourceImage = sharp(colorHalf.data, {
            raw: { width: colorHalf.info.width, height: colorHalf.info.height, channels: colorHalf.info.channels }
        });
    } else if (isDualLayer) {
        // No lighting — just crop to color half
        sourceImage = sharp(source.sourcePath)
            .extract({ left: 0, top: 0, width: metadata.width!, height: Math.floor(metadata.height! / 2) });
    }

    // ...existing split loop (extract sub-tiles, encode, write)...
}
```

#### Dynmap fallback

Dynmap tiles have no heightmap. When `tileSource` is `"dynmap"`, the dual-layer detection returns false and the pipeline is unchanged — tiles render without shading as they do today. This is an acceptable fallback because Dynmap's top-down color tiles already include baked-in environmental coloring.

### Unit Tests: `scripts/heightmap-shader.test.ts`

```typescript
describe('decodeHeightmap', () => {
    test('decodes sea level (y=63) correctly', () => { /* ... */ });
    test('decodes negative height (below sea level) via signed encoding', () => { /* ... */ });
    test('block light channel is ignored', () => { /* ... */ });
});

describe('computeShadeMap (lambertian)', () => {
    test('flat terrain returns uniform ambient+diffuse value', () => { /* ... */ });
    test('slope facing sun is brighter than slope facing away', () => { /* ... */ });
    test('heightScale amplifies relief effect', () => { /* ... */ });
    test('edge pixels use clamped neighbors', () => { /* ... */ });
});

describe('computeShadeMap (slope)', () => {
    test('matches BlueMap formula for simple gradient', () => { /* ... */ });
});

describe('applyShadeToColor', () => {
    test('multiplies RGB by shade, preserves alpha', () => { /* ... */ });
    test('clamps output to 0–255', () => { /* ... */ });
});
```

### Deliverables

- [ ] `scripts/heightmap-shader.ts` — pure shader functions
- [ ] `scripts/heightmap-shader.test.ts` — unit tests
- [ ] `LightingConfigSchema` in `src/types.ts`
- [ ] `lighting` field on `TilePyramidConfigSchema`
- [ ] Updated `splitSourceTile()` in `scripts/render-tiles.ts`
- [ ] `config.json` updated with `lighting` section
- [ ] Updated `copilot-instructions.md` with lighting docs

### Verification

```bash
# Render BlueMap source tiles with lighting
npm run render-tiles

# Visually compare: open a baked tile vs the raw color-only version
# The shaded tile should show terrain relief (bright hilltops, dark valleys)
```

---

## Phase 2: Ship Heightmap Tiles

### Goal

Produce 8-bit grayscale heightmap tiles alongside color tiles during build. The runtime does not consume them yet — this phase only adds the build output and manifest support.

### Heightmap Tile Format

**8-bit grayscale PNG** per canonical tile. Encodes a quantized local height range:

```
Pixel value = round(255 × (height - tileMinHeight) / (tileMaxHeight - tileMinHeight))
```

A 2-byte header appended to the manifest entry stores `minHeight` and `maxHeight` for dequantization at runtime.

| Property | Value |
|----------|-------|
| Format | 8-bit grayscale PNG |
| Size (256×256) | ~2–5 KB (highly compressible — Minecraft terrain is blocky) |
| Precision | 256 height levels within tile's local range |
| Path | `tiles/{world}/{level}/{tileX}/{tileZ}.height.png` |

### Manifest Extension

Add optional `heightmap` field to manifest entries:

```jsonc
[
  {
    "world": "overworld",
    "tileX": 3,
    "tileZ": -2,
    "blocksPerTile": 256,
    "heightmap": { "min": 42, "max": 187 }
  }
]
```

Zod schema update in `src/map/tile-types.ts`:

```typescript
export const ManifestEntrySchema = z.object({
    world: z.string(),
    tileX: z.number().int(),
    tileZ: z.number().int(),
    blocksPerTile: z.number().int().positive(),
    heightmap: z.object({
        min: z.number().int(),
        max: z.number().int()
    }).optional()
});
```

The runtime's `loadTileManifest()` already uses `.safeParse()` — the new optional field is backward-compatible.

### Build Script Changes

In `splitSourceTile()`, when a BlueMap dual-layer source is detected:

1. Extract heightmap buffer (already done in Phase 1)
2. Compute min/max height across the sub-tile region
3. Quantize to 8-bit grayscale
4. Write as `{tileZ}.height.png` alongside the color tile
5. Add `heightmap: { min, max }` to the manifest entry

```typescript
// After shading in Phase 1, also write the heightmap tile
if (isDualLayer) {
    const subHeights = extractSubTileHeights(heights, dx, dz, cropWidth, cropHeight);
    const { min, max, quantized } = quantizeHeightmap(subHeights, pyramid.tileWidth, pyramid.tileHeight);

    const heightmapPath = outputPath.replace(`.${pyramid.format}`, '.height.png');
    await sharp(quantized, {
        raw: { width: pyramid.tileWidth, height: pyramid.tileHeight, channels: 1 }
    }).png().toFile(heightmapPath);

    entries[entries.length - 1].heightmap = { min, max };
}
```

### Deliverables

- [ ] Heightmap tile generation in `render-tiles.ts`
- [ ] `ManifestEntrySchema` update with optional `heightmap`
- [ ] Heightmap quantization utility in `scripts/heightmap-shader.ts`
- [ ] Validation update in `scripts/validate-tiles.ts` (check `.height.png` exists when manifest has `heightmap`)

### Storage Impact

At ~3 KB per heightmap tile, a typical deployment with ~200 detail tiles adds ~600 KB. Overview tiles add less (fewer tiles). Total overhead: **< 1 MB**.

---

## Phase 3: Runtime Dynamic Lighting (Day/Night Cycle)

### Goal

Load heightmap tiles at runtime. Composite dynamic shading over color tiles based on a sun angle that follows the Minecraft day/night cycle.

### Architecture

```
                     ┌──────────────────────────────────────────────┐
                     │               RUNTIME                        │
                     │                                              │
  L.imageOverlay ──► │  1. Color JPEG loads (progressive scan)     │
  (immediate)        │     → user sees blurry-then-sharp tile      │
                     │                                              │
  fetch .height.png ►│  2. Heightmap loads in parallel (~3 KB)     │
  (background)       │     → cached in heightmapCache Map          │
                     │                                              │
  Sun angle timer ──►│  3. computeShadeMap(heightmap, sunAngle)    │
  (every 60s)        │     → OffscreenCanvas composite              │
                     │     → overlay.setUrl(blobUrl)                │
                     │                                              │
                     │  4. Day/night: re-shade visible tiles        │
                     │     when sun angle changes > threshold       │
                     └──────────────────────────────────────────────┘
```

### Progressive Rendering Integration

This is **additive**, not blocking:

1. `loadTileToMap()` works exactly as today — `L.imageOverlay(colorUrl)` displays the baked-in Phase 1 shading immediately via progressive JPEG
2. In parallel, fetch the heightmap tile (small, fast)
3. Once both are loaded, compute dynamic shade and replace the overlay's source with the dynamically lit version
4. The user sees the baked tile first (good quality), then a seamless upgrade to dynamic lighting

On subsequent day/night updates, only the shade computation runs — the heightmap is already cached.

### Day/Night Cycle

The Minecraft day/night cycle is 20 real-world minutes (24,000 game ticks).

#### Server Time Sources

| Provider | Endpoint | Field |
|----------|----------|-------|
| Dynmap | `GET /up/world/{world}/{timestamp}` | `currentcount` (world ticks) |
| BlueMap | `GET /maps/{mapId}/live/markers.json` | Server-dependent; may need plugin |
| Fallback | Client-side | UTC-based synthetic cycle |

#### Sun Angle Calculation

```typescript
/**
 * Calculate sun direction from Minecraft world ticks.
 *
 * Tick 0 = sunrise (east). Tick 6000 = noon (overhead).
 * Tick 12000 = sunset (west). Tick 18000 = midnight.
 *
 * @param ticks - Current world tick count (mod 24000)
 * @returns Normalized [x, y, z] light direction vector
 */
export function sunDirectionFromTicks(
    ticks: number
): [number, number, number] {
    const angle = (2 * Math.PI * (ticks % 24000)) / 24000;

    // Sun rotates in the X-Y plane (east-west arc)
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const z = 0.3; // slight north bias for terrain relief

    const len = Math.sqrt(x * x + y * y + z * z);
    return [x / len, y / len, z / len];
}

/**
 * Determine ambient/diffuse intensities based on time of day.
 *
 * Daytime (ticks 0–12000): full brightness.
 * Night (ticks 12000–24000): reduced diffuse, blue-shifted ambient.
 *
 * @param ticks - Current world tick count
 * @returns { ambient, diffuse, tint } intensity values
 */
export function dayNightIntensity(ticks: number): {
    ambient: number;
    diffuse: number;
    tint: [number, number, number]; // RGB multiplier for color shift
} {
    const t = ticks % 24000;

    if (t < 12000) {
        // Day: full sun
        return { ambient: 0.35, diffuse: 0.65, tint: [1.0, 1.0, 1.0] };
    }

    if (t < 13000 || t > 23000) {
        // Sunrise/sunset transition: warm tint
        const blend = t < 13000
            ? (t - 12000) / 1000
            : 1 - (t - 23000) / 1000;
        return {
            ambient: 0.35 - 0.1 * blend,
            diffuse: 0.65 - 0.35 * blend,
            tint: [1.0, 0.85 + 0.15 * (1 - blend), 0.7 + 0.3 * (1 - blend)]
        };
    }

    // Night: moonlight (dim, blue-ish)
    return { ambient: 0.25, diffuse: 0.15, tint: [0.7, 0.75, 1.0] };
}
```

### Runtime Module: `src/map/heightmap-compositor.ts`

```typescript
/**
 * Heightmap Compositor
 *
 * Fetches heightmap tiles, computes dynamic shade maps,
 * and composites them over color tiles using OffscreenCanvas.
 *
 * @module map/heightmap-compositor
 */

interface CachedHeightmap {
    heights: Float32Array;
    width: number;
    height: number;
    min: number;
    max: number;
}

/** Module-scoped heightmap cache (tile key → decoded heights) */
const heightmapCache = new Map<string, CachedHeightmap>();

/**
 * Load and decode a heightmap tile.
 *
 * @param world - World identifier
 * @param level - Pyramid level
 * @param tileX - Tile X coordinate
 * @param tileZ - Tile Z coordinate
 * @param meta - Manifest heightmap metadata { min, max }
 * @returns Decoded heightmap or undefined if fetch fails
 */
export async function loadHeightmap(
    world: string,
    level: number,
    tileX: number,
    tileZ: number,
    meta: { min: number; max: number }
): Promise<CachedHeightmap | undefined> { /* ... */ }

/**
 * Composite dynamic lighting over a color tile.
 *
 * @param colorUrl - URL of the color tile (already displayed)
 * @param heightmap - Decoded heightmap data
 * @param sunDirection - Current sun direction vector
 * @param intensity - Ambient/diffuse/tint values
 * @returns Blob URL of the composited tile, or undefined on failure
 */
export async function compositeDynamicLighting(
    colorUrl: string,
    heightmap: CachedHeightmap,
    sunDirection: [number, number, number],
    intensity: { ambient: number; diffuse: number; tint: [number, number, number] }
): Promise<string | undefined> { /* ... */ }

/**
 * Re-shade all visible tiles for a new sun angle.
 *
 * Called by the day/night timer. Only processes tiles
 * that have cached heightmaps.
 *
 * @param map - Leaflet map instance
 * @param overlays - Map of tile key → L.ImageOverlay
 * @param sunDirection - New sun direction
 * @param intensity - New ambient/diffuse/tint values
 */
export async function reshadeVisibleTiles(
    map: L.Map,
    overlays: Map<string, L.ImageOverlay>,
    sunDirection: [number, number, number],
    intensity: { ambient: number; diffuse: number; tint: [number, number, number] }
): Promise<void> { /* ... */ }
```

### Changes to `tile-loader.ts`

```typescript
// After adding color overlay:
if (manifestEntry.heightmap && dynamicLightingEnabled) {
    const heightmap = await loadHeightmap(worldId, zoom, tx, tz, manifestEntry.heightmap);
    if (heightmap) {
        const serverTicks = await fetchServerTime();
        const sun = sunDirectionFromTicks(serverTicks);
        const intensity = dayNightIntensity(serverTicks);
        const blobUrl = await compositeDynamicLighting(url, heightmap, sun, intensity);
        if (blobUrl) {
            overlay.setUrl(blobUrl);
        }
    }
}
```

### Day/Night Update Loop

```typescript
// In map initialization (shop-map-dialog.ts or nav-map.ts)
const DAY_NIGHT_INTERVAL_MS = 60_000; // re-shade every 60 seconds

let dayNightTimer: ReturnType<typeof setInterval> | undefined;

function startDayNightCycle(map: L.Map, overlays: Map<string, L.ImageOverlay>): void {
    dayNightTimer = setInterval(async () => {
        const ticks = await fetchServerTime();
        const sun = sunDirectionFromTicks(ticks);
        const intensity = dayNightIntensity(ticks);
        await reshadeVisibleTiles(map, overlays, sun, intensity);
    }, DAY_NIGHT_INTERVAL_MS);
}

function stopDayNightCycle(): void {
    if (dayNightTimer !== undefined) {
        clearInterval(dayNightTimer);
        dayNightTimer = undefined;
    }
}
```

### Performance Budget

| Operation | Target | Mitigation |
|-----------|--------|-----------|
| Heightmap fetch | < 50ms (3–5 KB PNG) | Browser HTTP cache; parallel with color tile |
| Heightmap decode | < 5ms (256×256 pixels) | `createImageBitmap()` + `getImageData()` |
| Shade computation | < 10ms per tile | `Float32Array` math, no allocation in hot loop |
| Canvas composite | < 5ms per tile | `OffscreenCanvas` + `transferToImageBitmap()` |
| Re-shade interval | 60s | Only visible tiles; skip if sun delta < threshold |
| Memory (heightmaps) | ~260 KB per tile (Float32Array 256×256×4) | LRU evict; typical visible: ~20 tiles = ~5 MB |

### User Controls

Add to settings/config:

```jsonc
{
  "dynamicLighting": {
    "enabled": false,
    "source": "server",
    "fallbackCycleMinutes": 20,
    "updateIntervalMs": 60000
  }
}
```

- `enabled: false` — off by default (Phase 1 baked shading is always active)
- `source: "server"` — poll server ticks; `"client"` uses UTC-mapped synthetic cycle
- `fallbackCycleMinutes` — cycle length when server time is unavailable

### Deliverables

- [ ] `src/map/heightmap-compositor.ts` — fetch, decode, composite, re-shade
- [ ] `src/map/sun-cycle.ts` — `sunDirectionFromTicks()`, `dayNightIntensity()`
- [ ] `src/map/sun-cycle.test.ts` — unit tests for tick → angle → intensity
- [ ] Updated `loadTileToMap()` in `tile-loader.ts` — optional heightmap loading
- [ ] Day/night timer in map dialogs
- [ ] `DynamicLightingConfigSchema` in `src/types.ts`
- [ ] Feature flag in `config.json`
- [ ] BDD scenario: tile displays with/without dynamic lighting

---

## Consequences

### Positive

- **Phase 1 is zero-cost at runtime** — tiles simply look better, no code change for consumers
- **Progressive JPEG still works** — baked shading is part of the JPEG; dynamic lighting refines after load
- **Heightmap data is reusable** — contour lines, elevation tooltips, 3D preview are future possibilities
- **Day/night is optional** — can ship Phases 1–2 and defer Phase 3 indefinitely
- **Dynmap fallback is clean** — no heightmap = no shading = tiles work exactly as today

### Negative

- **Build complexity** — Phase 1 adds image processing to `render-tiles.ts` (sharp raw buffer manipulation)
- **Storage overhead** — Phase 2 adds ~600 KB for heightmap tiles
- **Runtime complexity** — Phase 3 adds canvas compositing, server polling, overlay replacement
- **Memory pressure** — Phase 3 caches heightmap Float32Arrays per visible tile (~5 MB for 20 tiles)

### Mitigations

- Phase 1 uses `sharp` (already a dependency) for all image operations — no new build deps
- Heightmap tiles are tiny (8-bit grayscale PNG compresses well for blocky terrain)
- Phase 3 uses `OffscreenCanvas` for off-main-thread compositing
- LRU eviction prevents unbounded heightmap memory growth
- Each phase is independently testable and deployable

## Related

- [ADR-009](009-tile-caching-strategy.md) — Browser HTTP cache replaces blob cache
- [ADR-010](010-tile-loading-minimization.md) — Shop-centric tile collection (heightmaps follow same grid)
- [ADR-012](012-bluemap-tile-migration.md) — BlueMap dual-layer PNG format documentation
- [ADR-013](013-canonical-tile-pyramid.md) — Canonical tile pyramid (build-time re-rendering)

## References

- [BlueMap LowresFragmentShader.js](https://github.com/BlueMap-Minecraft/BlueMap/blob/master/common/webapp/src/js/map/lowres/LowresFragmentShader.js) — shade formula
- [BlueMap LowresVertexShader.js](https://github.com/BlueMap-Minecraft/BlueMap/blob/master/common/webapp/src/js/map/lowres/LowresVertexShader.js) — height decoding
- [Lambertian reflectance](https://en.wikipedia.org/wiki/Lambertian_reflectance) — diffuse lighting model
- [Minecraft day-night cycle](https://minecraft.wiki/w/Daylight_cycle) — 24,000 ticks = 20 minutes
