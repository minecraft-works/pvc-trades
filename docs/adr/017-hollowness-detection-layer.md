# ADR-017: Hollowness Detection Layer

## Status

Investigation / Proposed

## Context

We want a visually inspectable image layer derived from BlueMap tile data that reveals whether pixel columns are hollow (bridges, tunnels, floating platforms, overhangs) or solid ground.

### Available Data Per Pixel Column

BlueMap's lowres dual-layer PNG encodes exactly three values per pixel:

| Channel | Source | Range | Meaning |
|---------|--------|-------|---------|
| **Color** (RGBA) | Top 501 rows | 0–255 per channel | Blended color of topmost visible blocks |
| **Height** | Metadata G×256+B | signed 16-bit | Y-coordinate of the **highest rendered block** in the column |
| **Block light** | Metadata R | 0–15 integer | Visibility-weighted max block light in the column |

### How BlueMap Computes These (from `BlockRenderPass.java`)

```java
// Scans top-to-bottom through the entire world column at (x, z)
for (y = maxY; y >= minY; y--) {
    block.set(x, y, z);
    blockRenderer.render(block, model, blockColor);

    // Block light weighted by how transparent the column is above this Y
    topBlockLight = Math.max(topBlockLight, block.getBlockLightLevel() * (1 - columnColor.a));

    if (blockColor.a > 0) {
        if (maxHeight < y) maxHeight = y;
        columnColor.underlay(blockColor.premultiplied());
    }

    // Stop scanning once the column is fully opaque
    if (renderTopOnly && blockColor.a > 0.999 && block.isCulling()) break;
}

tileMetaConsumer.set(x, z, columnColor, maxHeight, (int) topBlockLight);
```

**Key implications:**

- `height` = Y of the topmost block with any rendered color. For a bridge at Y=80 over terrain at Y=65, height=80. We **never see** Y=65.
- `blockLight` = Minecraft's real 3D block-light propagation value. It comes from the NBT `BlockLight` array — the same data the game engine uses. Light propagates through air in all 6 directions, decreasing by 1 per block, blocked by opaque blocks.
- `blockLight` at a column is the strongest block-light value at any Y that's still "visible" (column above is not yet fully opaque). For opaque surfaces, this is the block light at the top surface block.
- Once the column is opaque from above, deeper blocks are **invisible** — we have no information about what's below.

### The Fundamental Limitation

**We cannot directly see beneath the surface.** The height channel gives the rooftop, not the floor. The gap between a bridge deck and the ground below is invisible in the data.

However, we CAN infer hollowness from **spatial patterns** in the height and block-light channels.

## Detection Signals

### Signal 1: Height Isolation

A pixel whose height is significantly above its local neighborhood is elevated. Natural terrain has smooth gradients; bridges and platforms create sharp height plateaus surrounded by lower terrain.

```
isolation(x,z) = height(x,z) - median(heights within radius R)
```

| Pros | Cons |
|------|------|
| Catches bridges, floating platforms, towers | Also catches cliff edges, mountain peaks |
| Pure topological — no light needed | Scale-dependent (need tuning R) |
| Works for dark structures | |

**Discrimination**: A cliff has isolation on ONE side; a bridge has isolation on BOTH sides. See Signal 2.

### Signal 2: Thin Ridge Score (Bilateral Drop)

The most discriminative single signal. For each pixel, check if height drops sharply on **opposing** sides simultaneously:

```
For each axis pair (N-S, E-W, NE-SW, NW-SE):
  drop_positive = height(x,z) - height(x+d, z+d)    // one direction
  drop_negative = height(x,z) - height(x-d, z-d)    // opposite direction
  bilateral_drop = min(drop_positive, drop_negative)  // both must drop

ridge_score = max(bilateral_drop across all 4 axis pairs)
```

A pixel with high `ridge_score` is elevated AND narrow — the hallmark of a bridge or tube.

| Pros | Cons |
|------|------|
| Very discriminative — mountains fail the bilateral test | Thin natural ridges can trigger |
| Width-aware (vary `d` for different scales) | Needs multi-scale approach for wide bridges |
| Directly answers "is this a narrow elevated thing?" | |

**Multi-scale variant**: Compute at d=2, 4, 8, 16 and take the max. This catches 2-block-wide walkways through 32-block-wide platforms.

### Signal 3: Block Light Anomaly

Nonzero block light indicates a nearby artificial light source (torch, lantern, glowstone). On natural terrain surfaces, block light is typically 0. If a pixel has block light > 0 AND is at an elevated position, it's very likely an artificial structure with interior lighting.

```
light_anomaly(x,z) = blockLight(x,z) > 0 ? blockLight(x,z) / 15 : 0
```

**Enhanced version** — local contrast:
```
local_mean = average(blockLight within radius R)
anomaly(x,z) = blockLight(x,z) - local_mean   // positive = brighter than surroundings
```

| Pros | Cons |
|------|------|
| Very specific — lit interiors strongly correlate with hollowness | Only detects LIT hollow structures |
| 3D propagation means light "leaks" encode real spatial info | Dark tunnels are invisible |
| Can detect hollow surface even without height gradient | Outdoor torch arrays create false positives |

**Key insight**: Block light values at 3–8 (not 0, not 14–15) are the sweet spot. These indicate light that has propagated through several blocks of air — consistent with interior lighting leaking out. Values of 14–15 are right next to a light source (could be outdoor torch). Values of 1–2 are at the fringe of propagation reach.

### Signal 4: Height Gradient Magnitude (Edge Detection)

Sharp height changes mark the boundaries of elevated structures. The gradient magnitude shows where "walls" are in the height field:

```
dx = height(x+1, z) - height(x-1, z)
dz = height(x, z+1) - height(x, z-1)
gradient_mag = sqrt(dx² + dz²)
```

This doesn't indicate hollowness on its own, but combined with Signal 2, it marks the **edges** of hollow structures — useful for visual inspection.

### Signal 5: Laplacian (Concavity/Convexity)

```
laplacian = 4*h(x,z) - h(x-1,z) - h(x+1,z) - h(x,z-1) - h(x,z+1)
```

- **Positive** = local height maximum (peak, bridge deck, pillar top)
- **Negative** = local height minimum (valley, pit)
- **Zero** = flat or smooth slope

Bridges show as elongated regions of positive Laplacian. Natural hills show diffuse positive Laplacian at the peak but much more gradually.

### Signal 6: Color Discontinuity at Height Edges

Where height changes abruptly, if the color also changes drastically (e.g., from wood planks to grass), it's likely an artificial structure boundary. Natural terrain (grass-to-dirt cliff) has more continuous color. This is a secondary signal — useful for filtering false positives.

## Proposed Composite Score

### Weighted Fusion

```
hollowness(x,z) = clamp(
    w_ridge   × ridge_score(x,z)    +
    w_isolate × isolation_score(x,z) +
    w_light   × light_anomaly(x,z)  +
    w_edge    × edge_proximity(x,z)
, 0, 1)
```

Suggested starting weights:
- `w_ridge = 0.5` — primary structural signal
- `w_isolate = 0.2` — supports ridge when both agree
- `w_light = 0.25` — strong when present, often absent
- `w_edge = 0.05` — minor refinement

### Diagnostic RGBA Image

For visual inspection, encode each signal as a separate channel:

| Channel | Signal | Visual Meaning |
|---------|--------|----------------|
| **R** | Thin ridge score | Red = narrow elevated structure |
| **G** | Block light anomaly | Green = lit interior detected |
| **B** | Height isolation | Blue = elevated above surroundings |
| **A** | Composite hollowness | Opacity = confidence of hollow classification |

This lets you toggle channels in any image viewer to inspect signals independently.

### Alternative: False-Color Heatmap

Single-channel grayscale hollowness score mapped to a diverging colormap:

```
0.0 (definitely solid) → dark blue
0.5 (uncertain)        → white
1.0 (definitely hollow) → bright red
```

Overlaid semi-transparently on the color tile for spatial context.

## Implementation Plan

### Phase 1: New Function in `heightmap-shader.ts`

```typescript
export function computeHollownessMap(
    heights: Float32Array,
    blockLights: Float32Array,
    width: number,
    height: number,
    options?: {
        ridgeRadii?: number[];       // multi-scale bilateral check [2, 4, 8, 16]
        isolationRadius?: number;    // median neighborhood radius (default 12)
        heightThreshold?: number;    // minimum height drop to count (default 3)
        lightWeight?: number;        // weight for block-light signal (default 0.25)
    }
): {
    ridge: Float32Array;       // 0–1 per pixel: thin ridge score
    isolation: Float32Array;   // 0–1 per pixel: height isolation score
    lightAnomaly: Float32Array;// 0–1 per pixel: block light anomaly
    composite: Float32Array;   // 0–1 per pixel: combined hollowness score
}
```

### Phase 2: Diagnostic Pass in `_render-single-tile.ts`

Add a Pass 4 that generates:
- `{tile}_hollowness-rgba.png` — 4-channel diagnostic (R=ridge, G=light, B=isolation)
- `{tile}_hollowness-heatmap.png` — false-color composite overlaid on color tile

### Phase 3: Production Integration (Optional)

If the hollowness layer proves useful, add it as a heatmap overlay toggle in the web UI map dialog, similar to how glow diagnostics work now.

## Performance Considerations

| Operation | Complexity | At 501×501 (250K pixels) |
|-----------|-----------|--------------------------|
| Ridge score (4 axes × 4 scales) | O(n × 16) | ~4M comparisons, fast |
| Height isolation (radius 12) | O(n × π×12²) ≈ O(n × 452) | ~113M lookups, moderate |
| Block light anomaly | O(n) | Trivial |
| Total | | < 1 second expected |

Height isolation is the bottleneck. Can be optimized with a sliding-window median or by using mean instead of median (O(1) per pixel with prefix sums).

## Limitations

1. **Dark hollow structures** (no interior lighting) only produce the ridge/isolation signal — no block light to confirm
2. **Wide flat structures** (large rooftops) may not trigger ridge detection — only their edges score high
3. **Natural terrain features** (narrow ridges, cliff overhangs, sea stacks) can produce false positives in the ridge channel
4. **Single-pixel resolution** — structures smaller than 1 block/pixel are undetectable at LOD 1
5. **No depth information** — we know something is elevated but cannot determine how much air is underneath

## Decision

Implement Phase 1 + Phase 2 as a diagnostic tool. Evaluate on real tiles before deciding on production integration.

## References

- [ADR-012](012-bluemap-tile-migration.md) — BlueMap tile format and dual-layer PNG layout
- [ADR-016](016-single-tile-render-pipeline.md) — Single-tile render pipeline
- BlueMap source: `BlockRenderPass.java` — column scan and `topBlockLight` accumulation
- BlueMap source: `LowresTile.java` — `set(x, z, color, height, blockLight)` PNG encoding
- BlueMap source: `Chunk_1_18.java` — 3D block light read from NBT `BlockLight` array
