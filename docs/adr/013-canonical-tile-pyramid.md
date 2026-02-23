# ADR-013: Canonical Tile Pyramid

## Status
Proposed

## Context

The current tile provider abstraction (ADR-012) translates between Dynmap and BlueMap URL patterns and coordinate systems, but it does not normalize the output. The runtime still sees provider-specific details:

- **Different tile sizes**: Dynmap = 512 blocks/tile, BlueMap = 500 blocks/tile
- **Different pixel dimensions**: Dynmap = 512×512 px, BlueMap = 501×1002 px (dual-layer)
- **Different zoom systems**: Dynmap uses zoom 8/4, BlueMap uses LOD 1/3
- **Provider-specific URL paths**: leaked into cache keys, manifest entries, test mocks

When you ask for "level 1, tile (3, -2)", the answer depends on which provider is active. The BDD tests are hardcoded to Dynmap's zoom 8/4 and 512-block tiles. Switching providers requires updating test mocks, not just config.

Additionally, the tile format is locked to PNG. Future requirements (progressive loading, WebP/AVIF, custom binary formats) would require touching both build scripts and runtime code.

### The Core Problem

The abstraction boundary is in the wrong place:

```
Current:
  Source Server → [fetch as-is] → public/tiles/ → [runtime knows provider details] → Leaflet

Needed:
  Source Server → [fetch + re-render] → public/tiles/ (canonical) → [runtime is fully agnostic] → Leaflet
```

## Decision

Introduce a **canonical tile pyramid** — a uniform tile system defined entirely by configuration. Build scripts fetch from any source and re-render into this canonical format. The runtime knows nothing about Dynmap, BlueMap, or any other source.

### Pyramid Configuration

```json
{
  "tilePyramid": {
    "tileWidth": 256,
    "tileHeight": 256,
    "levels": 3,
    "scaleFactor": 4,
    "baseBlocksPerTile": 256,
    "format": "png"
  }
}
```

### Level Math

Levels are numbered 0 to `levels - 1`, with **higher levels = more detail** (matching Leaflet zoom convention):

```
level = levels - 1    → detail (closest view)
level = 0             → overview (farthest view)
```

```
blocksPerTile(level) = baseBlocksPerTile × scaleFactor^(levels - 1 - level)
```

With defaults (`base=256, factor=4, levels=3`):

| Level | Formula | blocksPerTile | Use |
|-------|---------|---------------|-----|
| 0     | 256 × 4² = 256 × 16 | 4096 | Overview (world map) |
| 1     | 256 × 4¹ = 256 × 4 | 1024 | Mid-range |
| 2     | 256 × 4⁰ = 256 × 1 | 256 | Detail (shop navigation) |

### Canonical URL Pattern

```
/tiles/{world}/{level}/{x}/{z}.{format}
```

Examples:
```
/tiles/overworld/2/3/-2.png     (detail tile at x=3, z=-2)
/tiles/the_nether/0/0/0.png     (overview tile at origin)
```

### Canonical Manifest

```json
[
  { "world": "overworld", "level": 2, "tileX": 3, "tileZ": -2 },
  { "world": "overworld", "level": 0, "tileX": 0, "tileZ": 0 }
]
```

No `blocksPerTile` in the manifest — it's derived from level + config. No provider-specific zoom IDs.

### Architecture

```
BUILD TIME                                              RUNTIME
┌──────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ Dynmap       │     │                      │     │                 │
│ BlueMap      │────►│  Tile Renderer       │────►│  public/tiles/  │
│ (any source) │     │  (fetch + re-render) │     │  + manifest.json│
└──────────────┘     │                      │     └────────┬────────┘
                     │ For each canonical   │              │
                     │ tile needed:         │              ▼
                     │ 1. Which source tiles│     ┌─────────────────┐
                     │    cover this area?  │     │  tile-loader.ts │
                     │ 2. Fetch from source │     │  (canonical     │
                     │ 3. Crop/scale to     │     │   levels only)  │
                     │    tileWidth×Height  │     └─────────────────┘
                     │ 4. Write canonical   │
                     └──────────────────────┘
```

### Build-Time Re-Rendering

For each canonical tile at level L covering blocks `[x₀, x₁) × [z₀, z₁)`:

1. Calculate which source provider tiles overlap this block range
2. Fetch those source tiles (with rate limiting, caching)
3. Composite the overlapping source pixels onto a canvas of `tileWidth × tileHeight`
4. Apply `processImage()` (e.g., extract color from BlueMap dual-layer)
5. Encode to `format` and write to canonical path

This handles:
- **Size mismatch**: Source 512px → canonical 256px (downscale)
- **Grid mismatch**: Source 500-block grid ≠ canonical 256-block grid (composite + crop)
- **Format conversion**: BlueMap dual-layer → pure color PNG
- **Pixel ratio differences**: Source may have different px-per-block ratios at different LODs

### Runtime Changes

The runtime becomes fully agnostic:

```typescript
// tile-loader.ts — NO provider imports
export const TILE_CONFIG = {
    tileWidth: pyramid.tileWidth,       // from config
    tileHeight: pyramid.tileHeight,
    levels: pyramid.levels,
    scaleFactor: pyramid.scaleFactor,
    baseBlocksPerTile: pyramid.baseBlocksPerTile,
    format: pyramid.format,
    baseUrl: 'tiles',
    
    // Derived
    detailLevel: pyramid.levels - 1,
    overviewLevel: 0,
    detailBlocksPerTile: pyramid.baseBlocksPerTile,
    overviewBlocksPerTile: pyramid.baseBlocksPerTile * pyramid.scaleFactor ** (pyramid.levels - 1),
    
    blocksPerTile(level: number): number {
        return pyramid.baseBlocksPerTile * pyramid.scaleFactor ** (pyramid.levels - 1 - level);
    }
};

// URL generation — just canonical paths
function getTileUrl(world: string, level: number, tx: number, tz: number): string {
    return `tiles/${world}/${level}/${tx}/${tz}.${TILE_CONFIG.format}`;
}
```

No `getActiveTileProvider()`, no `getSourceWorldId()`, no `processImage()` at runtime.

### Provider Role Change

`TileProvider` moves from a runtime+build interface to a **build-only source adapter**:

```typescript
// scripts/source-adapters/tile-provider.ts (build-only)
interface TileSourceAdapter {
    name: string;
    tileSize: number;           // Source pixels per tile
    blocksPerTile: number;      // Source blocks per tile at detail level
    
    getSourceUrl(world: string, blockX: number, blockZ: number): string;
    processImage(raw: Buffer): Promise<{ color: Buffer; heightmap?: Buffer }>;
}
```

The runtime never imports this. It only exists in `scripts/`.

### Test Impact

BDD tests become fully agnostic — they mock canonical URLs:

```typescript
// Before (Dynmap-specific):
const match = url.match(/tiles\/(overworld|the_nether)\/(\d+)\/(-?\d+)\/(-?\d+)\.png/);
const blocksPerTile = zoom === 8 ? 512 : 8192;

// After (canonical):
const match = url.match(/tiles\/(overworld|the_nether)\/(\d+)\/(-?\d+)\/(-?\d+)\.png/);
const level = Number.parseInt(match[2], 10);
const blocksPerTile = pyramid.blocksPerTile(level);
```

Feature files reference levels instead of zoom:

```gherkin
# Before:
Examples: Zoom 8 tiles (512 blocks per tile)
  | tile_x | tile_z | zoom | west_x | east_x |
  | 0      | 0      | 8    | 0      | 512    |

# After:
Examples: Detail level tiles (<baseBlocksPerTile> blocks per tile)
  | tile_x | tile_z | level | west_x | east_x  |
  | 0      | 0      | 2     | 0      | 256     |
```

### Format Extensibility

The `format` field enables future formats without code changes:

| Format | Use Case |
|--------|----------|
| `png` | Current default, lossless |
| `webp` | Smaller files, lossy OK for maps |
| `avif` | Even smaller, modern browsers |
| `ptile` | Custom binary for progressive loading |

Build script encodes to whichever format is configured. Runtime just loads `tile.{format}`.

## Rationale

### Why Re-Render Instead of Just Remap URLs?

| Approach | Source-agnostic? | Format-agnostic? | Test-agnostic? |
|----------|:---:|:---:|:---:|
| **URL remapping** (current) | Partial | ❌ | ❌ |
| **Canonical re-render** | ✅ | ✅ | ✅ |

URL remapping leaks source details into:
- Runtime code (provider getters, processImage)
- Cache keys (zoom 8 vs LOD 1)
- Manifest format (blocksPerTile varies by source)
- Test mocks (hardcoded to source values)

Re-rendering eliminates all leakage. The boundary is clean: everything downstream of `public/tiles/` is canonical.

### Why Configurable Levels Instead of Fixed 2?

Fixed 2 levels (detail + overview) is sufficient today but limits future use:
- **3 levels** allows a mid-range view useful for route overview
- **Configurable factor** lets us tune file count vs. resolution trade-off
- Adding a level later would require manifest migration; configuring upfront avoids this

### Why 256×256 Default?

- **Web standard**: Leaflet, Google Maps, OpenStreetMap all use 256px tiles
- **Cache-friendly**: common CDN and browser cache optimizations target 256px
- **Granularity**: more tiles = finer-grained caching (only re-fetch changed areas)
- **Trade-off**: more HTTP requests, but each is smaller and more cacheable

512×512 remains viable via config (`tileWidth: 512, tileHeight: 512`).

## Implementation Plan

### Phase 1: Canonical Pyramid Module + Config
1. Add `tilePyramid` to `config.json` and Zod schema
2. Create `src/tile-pyramid.ts` — pure functions for level math, URL generation, coordinate conversion
3. Unit tests for all pyramid math

### Phase 2: Runtime Migration
1. Replace `TILE_CONFIG` getters (provider-based) with pyramid config
2. Remove runtime imports of `TileProvider`, `getActiveTileProvider`
3. Update `tile-loader.ts`, `shop-map-dialog.ts`, `nav-map.ts` to use canonical levels
4. Update `tile-types.ts` — replace `maxZoom`/`fallbackZoom` with canonical level references

### Phase 3: Build Script Migration  
1. Move `TileProvider` interface to `scripts/source-adapters/`
2. Create `scripts/render-tiles.ts` — fetch source tiles → re-render to canonical pyramid
3. Update `validate-tiles.ts` for canonical manifest format
4. Update deploy.yml cache key

### Phase 4: BDD Test Migration
1. Update step definitions to use pyramid config instead of hardcoded zoom/blocksPerTile
2. Update feature files from zoom 8/4 to canonical levels
3. Color-coded mock tiles use level numbers instead of zoom numbers

## Consequences

### Positive

- **True source agnosticism**: runtime has zero knowledge of tile source
- **Format freedom**: change output format via config, no code changes
- **Clean test boundary**: all tests mock canonical URLs — source-independent
- **Future-proof**: progressive loading, heightmap layers, WebP — all just format/config changes
- **Single coordinate system**: level + (x, z) is universal, no provider-specific translation

### Negative

- **Build complexity**: re-rendering adds image processing (canvas/sharp) to build scripts
- **Build time**: composite + encode is slower than passthrough fetch
- **CI dependency**: needs an image library (sharp or canvas) in CI
- **Migration scope**: touches runtime, build scripts, tests, config, types — large changeset
- **Wasted source pixels**: downscaling 512px source to 256px canonical discards detail

### Mitigations

- **Sharp** is fast and runs natively in Node — minimal build time impact
- **Build caching** means re-rendering only happens for new/changed tiles
- **Phased rollout** keeps the system working at each step
- **Config-driven tile size** avoids wasting pixels if 512px is preferred

## Related

- [ADR-009](009-tile-caching-strategy.md) — Runtime blob URL caching (unchanged)
- [ADR-010](010-tile-loading-minimization.md) — Shop-centric tile collection (approach preserved, grid math updated)
- [ADR-012](012-bluemap-tile-migration.md) — BlueMap analysis (superseded by this ADR for runtime; source adapter reuses findings)
