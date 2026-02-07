# ADR-008: Nether Coordinate System Normalization

## Status
**Implemented** - 2024

## Context

Minecraft has multiple dimensions with different coordinate scales:

| Dimension | Scale | Description |
|-----------|-------|-------------|
| Overworld | 1:1 | Main world, reference scale |
| The Nether | 8:1 | One nether block = 8 overworld blocks |
| The End | 1:1 | Same scale as overworld |

When routing between shops across dimensions, we must compare apples to apples. A player at overworld (800, 800) is effectively at the same "place" as nether (100, 100) via portals.

### The Problem

Without normalization:
- Shop A: Overworld (0, 0)
- Shop B: Nether (100, 100)
- Naive distance: √(100² + 100²) = 141 blocks

With normalization:
- Shop A: Overworld (0, 0)
- Shop B: Nether (100, 100) → Overworld equivalent (800, 800)
- True travel distance: √(800² + 800²) = 1131 blocks

The naive calculation would incorrectly prioritize the nether shop as "closer."

## Decision

**Normalize all coordinates to overworld-equivalent** before distance calculations.

```typescript
function toOverworldEquivalent(x: number, z: number, world: WorldType): [number, number] {
    if (world === 'the_nether') {
        return [x * 8, z * 8];
    }
    return [x, z];
}
```

## Rationale

### Why Overworld as Reference?

1. **Player familiarity**: Players think in overworld coordinates
2. **Dynmap default**: Dynmap displays overworld coordinates
3. **1:1 scale**: No multiplication/division for overworld comparisons
4. **Portal behavior**: Nether portals link based on overworld-equivalent positions

### Why Not Normalize to Nether?

Dividing overworld coordinates by 8 loses precision:
- Overworld (15, 15) → Nether (1.875, 1.875)
- Overworld (17, 17) → Nether (2.125, 2.125)

These are distinct locations but might round to the same nether coordinate.

### Distance Calculation

```typescript
function calculateRouteDistance(
    x1: number, z1: number, world1: WorldType,
    x2: number, z2: number, world2: WorldType
): number {
    const [ox1, oz1] = toOverworldEquivalent(x1, z1, world1);
    const [ox2, oz2] = toOverworldEquivalent(x2, z2, world2);
    return Math.hypot(ox1 - ox2, oz1 - oz2);
}
```

### The 8:1 Ratio is a Minecraft Invariant

This ratio is hardcoded in Minecraft and will not change:
- Walking 1 block in nether = moving 8 blocks in overworld position
- Nether portal linking uses this exact ratio
- All Minecraft tools/mods assume this ratio

This is **domain knowledge** that should be explicit in the codebase.

## Implementation

### Coordinate Functions

| Function | Purpose |
|----------|---------|
| `toOverworldEquivalent(x, z, world)` | Normalize any coordinate to overworld scale |
| `calculateRouteDistance(...)` | Distance between two points, any dimension |
| `buildDistanceMatrix(shops)` | Precompute all pairwise distances |

### World Type

```typescript
type WorldType = 'overworld' | 'the_nether' | 'the_end';
```

Uses Minecraft's internal naming convention (`the_nether`, not `nether`).

### Display Coordinates

When showing coordinates to users, display **original** coordinates with dimension indicator:
- Overworld: Green text, no prefix
- Nether: Red text, fire emoji (🔥)

```
Shop A: 100, 200 (overworld)
Shop B: 🔥 50, 75 (nether)
```

## Consequences

### Positive

- Accurate cross-world routing
- Consistent distance calculations
- Matches player mental model
- Matches Dynmap behavior

### Negative

- Must track world type alongside coordinates
- UI must show both original and context
- Tests must cover cross-world scenarios

### Mitigations

- Coordinates stored with world type in `Trade` objects
- UI clearly indicates dimension with color coding
- Test fixtures include cross-dimension shops

## References

- [Minecraft Wiki: Nether](https://minecraft.wiki/w/The_Nether#Coordinate_conversion)
- The 8:1 ratio is defined in Minecraft's `NetherPortalBlock.java`
