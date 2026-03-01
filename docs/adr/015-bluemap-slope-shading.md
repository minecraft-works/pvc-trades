# ADR-015: BlueMap-Exact Slope Shading

## Status

Accepted — implemented in `scripts/heightmap-shader.ts` (`applySlopeShading`),
active via `config.json` (`model: "slope"`, `shadingScale: 1`, all extra effects
disabled).

## Context

ADR-014 introduced a Lambertian diffuse lighting model with configurable sun
direction, shadow casting, ambient occlusion, unsharp masking, and material
classification. After several tuning iterations, the output consistently looked
"blobby" or "muddy" compared to the reference BlueMap 3D viewer, even after
fixing the nearest-neighbour upsampling and reducing `normalScale`.

### Root Cause Analysis

Lambertian shading computes a surface **normal** at every pixel and dots it
against a sun direction. On a Minecraft map this means:

- **Every 1-block height step** between adjacent blocks creates a slope face,
  which gets normal tilt → shade gradient → visible "ridge" or "dome" effect.
- Tree canopies (flat leaf planes touching at different Y levels) produce
  dome-like shading because adjacent pixels have opposing normals.
- The effect is inherently smooth by nature of the dot product.

### How BlueMap Actually Works

Investigation of BlueMap's source (`LowresFragmentShader.js`,
`LowresVertexShader.js`, `LowresTile.java`) revealed:

1. **Server-side rendering applies no lighting whatsoever.** `LowresTile.set()`
   writes raw block color (RGBA) and metadata (height + blockLight) directly.
   The PNG color half is an unadulterated top-down block color atlas.

2. **All shading is client-side GLSL**, computed per-fragment on the GPU at
   render time.

3. **The shading formula is a simple slope comparison**, not a normal vector:

   ```glsl
   // Fragment shader — LowresFragmentShader.js
   float height  = metaToHeight(texture(textureImage, posToMetaUV(pos)));
   float heightX = metaToHeight(texture(textureImage, posToMetaUV(pos + vec2(1.0, 0.0))));
   float heightZ = metaToHeight(texture(textureImage, posToMetaUV(pos + vec2(0.0, 1.0))));

   float heightDiff = ((height - heightX) + (height - heightZ)) / lodScale;
   float shade = clamp(heightDiff * 0.06, -0.2, 0.04);

   color.rgb += shade;   // ADDITIVE — not multiplicative
   ```

4. **The shade is additive.** BlueMap adds a signed scalar directly to the RGB
   channels. This has important consequences:
   - `shade` range: `[-0.2, +0.04]` → in 8-bit terms: `[-51, +10]` per channel.
   - Shadows are an **absolute darkening** (–51 on each channel regardless of
     the underlying color). Dark forest floors become near-black; light sand
     cliffs become slightly dark.
   - Highlights are very subtle (+10 max — barely visible on bright surfaces).
   - The strong asymmetry is intentional: it produces crisp shadow lines without
     washing out lit areas.

5. **`lodScale` is 1 for lod=1 tiles** (direct source tiles, one pixel = one
   block). It increases for downsampled LODs. We only use lod=1 source tiles, so
   `lodScale = 1` and the formula simplifies to the raw `heightDiff * 0.06`.

6. **Block light** is stored in the R channel of the metadata half
   (`meta.r * 255.0`). BlueMap blends it with sunlight strength separately:
   ```glsl
   float blockLight = metaToLight(meta);
   float light = mix(blockLight, 15.0, sunlightStrength);
   color.rgb *= mix(ambientLight, 1.0, light / 15.0);
   ```
   This multiplicative light pass follows the additive shade pass. At
   `sunlightStrength = 1.0` and `ambientLight = 0` it reduces to
   `color.rgb *= 1.0` (full light everywhere outdoors). Underground areas with
   `blockLight = 0` get scaled by `ambientLight`.

### Why the Lambertian Model Produced Blobby Results

| Parameter | Lambertian effect | Slope effect |
|-----------|-------------------|--------------|
| 1-block height step | Normal tilts → visible shade gradient | 1-pixel difference → single sharp shade step |
| Flat block tops | Normal points up → full bright | height - hRight = 0 → shade = 0 → neutral |
| Tree canopy top | Normals mix across kernel → dome | Each leaf top is flat → shade = 0, only cliff edges shade |
| Cliff face | Steep normal → very bright edge | height - hRight large → strong shadow below, subtle highlight above |

The Lambertian model is correct for 3D surfaces but over-sensitive for a top-down
block map where every surface is either a flat top (no slope → no shade needed)
or an abrupt 1-block step (needs only a single-pixel shade transition, not a
smooth ramp).

## Decision

Replicate BlueMap's slope shading formula exactly, as a build-time baked pass
(`applySlopeShading` in `scripts/heightmap-shader.ts`).

### Formula

```
shade(x, z) = clamp(
    (h[x,z] - h[x+1,z] + h[x,z] - h[x,z+1]) × 0.06,
    -0.2, +0.04
)

output_rgb[i] = clamp(input_rgb[i] + shade × 255, 0, 255)
```

Constants are taken verbatim from BlueMap's GLSL source, unchanged.

### Config

```jsonc
// config.json — tileSourcePresets.bluemap.lighting
{
  "model": "slope",
  "shadingScale": 1,
  "shadowCasting":   { "enabled": false },
  "ambientOcclusion":{ "enabled": false },
  "unsharpMask":     { "enabled": false },
  "materialShading": { "enabled": false }
}
```

All extra techniques (shadow, AO, unsharp, material) are disabled. They are
preserved in the codebase for `model: "lambertian"` but should not be layered on
top of slope shading — they operate on fundamentally different assumptions.

### Scale and Pixel Geometry

With `shadingScale: 1`:

- **Shading runs on the 501×501 source buffer** (one shade computation per
  source pixel = one Minecraft block).
- **Output resize**: `501 → 1002 (nearest) → extract 1000`. Each source pixel
  becomes an exact **2×2 solid-color square** in the output tile.
- No sub-pixel variation exists within a block. This matches the BlueMap client
  exactly — one fragment shader invocation per pixel, each pixel = one block.

If sub-pixel variation is ever desired, `shadingScale: 2` would compute shading
at 1002×1002 resolution before the resize (shade gradients would span half-blocks
at source resolution), but this departs from the reference implementation.

### Resize Fix

At `shadingScale: 1` the shaded buffer is 501×501px but the pyramid tile size is
1000×1000px. The previous `sharp.extract(1000, 1000)` from a 501px buffer would
crash. The fix:

```typescript
// If buffer < tileWidth: upscale to first integer multiple ≥ tileWidth, then trim
const scaleX = Math.ceil(pyramid.tileWidth  / shadedW);   // = 2
const scaleY = Math.ceil(pyramid.tileHeight / shadedH);   // = 2
const upW = shadedW * scaleX;  // 501 × 2 = 1002
const upH = shadedH * scaleY;  // 501 × 2 = 1002
pipeline = pipeline.resize(upW, upH, { kernel: 'nearest' });
// 1002 ≠ 1000 → trim seamless border pixel
pipeline = pipeline.extract({ left: 0, top: 0, width: 1000, height: 1000 });
```

The same logic is applied to diagnostic tiles (`writeDiagnosticTile`) and the
heightmap sidecar.

## PNG Encoding

### Color Half (top 501×501 pixels)

Raw block color, premultiplied and averaged from all faces visible from above
(sourced from BlueMap's `BlockRenderPass.java`). No lighting applied server-side.

### Metadata Half (bottom 501×501 pixels)

Each pixel encodes three values packed into RGBA:

| Channel | Value | Range | Encoding |
|---------|-------|-------|----------|
| R | Block light | 0–15 | `blockLight / 15 × 255` |
| G | Height high byte | — | `(height & 0xFF00) >> 8` |
| B | Height low byte | — | `height & 0x00FF` |
| A | Unused | — | `0xFF` (always opaque) |

**Height is stored as a 16-bit unsigned integer**, with values ≥ 32768 treated
as negative (two's-complement wrapping at 16 bits):

```typescript
const unsigned = g * 256 + b;
const height = unsigned >= 32_768 ? -(65_535 - unsigned) : unsigned;
// Range: approximately -32767 to +32767 (Minecraft Y: -64 to 320 in practice)
```

**Seamless edge pixel**: BlueMap adds 1 to each tile dimension (`size = tileSize + 1`), writing one extra row and column at the right/bottom edge. These duplicate the neighbor tile's first row/column for seamless LOD blending in the 3D viewer. Our pipeline trims them via the `extract(1000, 1000)` step.

## Consequences

### Positive

- **Matches BlueMap reference** — same shadow direction, same intensity, same
  crisp appearance on cliff faces and terrain steps.
- **No blobby artifacts** — flat block tops produce zero shade (`h - hRight = 0`),
  tree canopy tops are flat → no dome effect.
- **Simple and fast** — one pass, no radial sampling, no normal estimation,
  no convolution kernels. Runs in `O(W × H)`.
- **Correct asymmetry** — shadows are strong (–51) and highlights are subtle
  (+10), preserving color fidelity in lit areas.
- **No dependency on extra techniques** — the block-light channel can still be
  consumed independently if desired (currently `blockLightBoost: 0`).

### Negative / Trade-offs

- **NW fixed sun** — shadow direction is always NW→SE (checks E and S neighbors).
  There is no way to change sun angle without departing from the BlueMap formula.
- **No ambient occlusion** — ravines, caves under overhangs, and dense
  structures do not darken. BlueMap's GLSL AO is view-angle and distance gated
  (only at low LODs, only when camera is near-top-down), so this is an acceptable
  omission for a static baked tile.
- **No specular / water shimmer** — BlueMap's client has no specular pass either.
- **2×2 block pixels** — at `shadingScale: 1` the output tile is 500 logical
  blocks at 2 px/block. Leafy terrain looks slightly chunky at close zoom.
  Mitigatable by enabling `shadingScale: 2` (half-block resolution) at the cost
  of departing from the exact BlueMap formula.

## Alternatives Considered

### Keep Lambertian Shading

Rejected for the blobby / dome effect on flat block tops (see root cause analysis
above). Remains available in the codebase as `model: "lambertian"` for scenarios
where smooth terrain gradients are preferred over pixel-accurate block rendering.

### shadingScale: 2 with Slope Model

Would compute shade at 1002×1002, introducing sub-pixel variation: the shade
transition at a cliff edge would be split across two output pixels instead of one.
Visually slightly smoother. Decided against it because:
1. Departs from the reference (BlueMap computes one shade per pixel per block).
2. Doubles memory and CPU usage.
3. The visual difference is imperceptible at the zoom levels the map is viewed at.

### Replicate BlueMap's GLSL AO Pass

BlueMap's AO is a screen-space, view-angle gated pass that only activates when
the camera is near top-down and the viewer is close (`lod === 1`, distance <
LOD threshold). For a static baked tile there is no camera, so this pass cannot
be replicated faithfully. A pre-baked radial AO approximation exists in the
codebase (`computeAmbientOcclusion`) but is disabled for slope mode.

## Related

- [ADR-012](012-bluemap-tile-migration.md) — BlueMap tile format and dual-layer PNG layout
- [ADR-013](013-canonical-tile-pyramid.md) — Canonical tile pyramid structure
- [ADR-014](014-heightmap-lighting.md) — Original heightmap lighting plan (Lambertian)
- `scripts/heightmap-shader.ts` — `applySlopeShading()`, `computeSlopeShade()`
- `scripts/render-tiles.ts` — Slope dispatch and resize logic
- `common/webapp/src/js/map/lowres/LowresFragmentShader.js` (BlueMap source) —
  reference GLSL implementation
