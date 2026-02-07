# ADR-009: Map Tile Caching Strategy

## Status
**Implemented** - 2025

## Context

The application displays interactive maps using Dynmap tile images. Each map view requires multiple tile requests:

| Zoom Level | Tiles per View | Total at Zoom |
|------------|----------------|---------------|
| 0 (world) | 1 | 1 |
| 3 | 4-9 | 64 |
| 5 | 16-25 | 1,024 |
| 6 (max) | 25-36 | 4,096 |

### Problems with Direct Tile Loading

1. **Network dependency**: Each pan/zoom fetches tiles from server
2. **CORS issues**: Dynmap may not allow cross-origin requests
3. **Latency**: Tile loading creates visible "grey squares"
4. **Bandwidth**: Repeated visits re-download same tiles
5. **Offline**: No functionality without network

## Decision

Pre-fetch all tiles at build time and serve from local `/tiles/` directory with **manifest-based loading** and **blob URL caching**.

```
Build time:                        Runtime:
┌─────────────┐                   ┌─────────────────────┐
│   Dynmap    │ ───fetch-tiles──► │ /tiles/manifest.json │
│   Server    │                   │ /tiles/{z}/{x}/{y}.png │
└─────────────┘                   └─────────────────────┘
                                           │
                                    TileLoader
                                           │
                                   ┌───────┴───────┐
                                   │   Blob URLs   │
                                   │   (in memory) │
                                   └───────────────┘
```

## Rationale

### Why Pre-fetch Instead of Proxy?

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **Pre-fetch** | Fast, offline, no CORS | Stale data, storage size | ✅ Selected |
| Runtime proxy | Always fresh | Server needed, latency | Rejected |
| Service Worker | Cache + fresh | Complexity, SW lifecycle | Rejected |
| CDN cache | Fast, fresh | Cost, configuration | Rejected |

**Key factors**:
- Map tiles for a Minecraft server change infrequently (days/weeks)
- Static hosting is simple and cheap
- Offline/LAN usage is valuable for Minecraft servers
- ~50MB tile storage is acceptable

### Why Blob URL Caching?

```typescript
// Fetch once, create blob URL
const blob = await response.blob();
const blobUrl = URL.createObjectURL(blob);
this.cache.set(tileKey, blobUrl);

// Leaflet uses blob URL directly
return blobUrl;
```

Benefits:
- Browser doesn't re-request the tile
- Image data in memory, instant display
- Works with Leaflet's tile layer API
- Avoids HTTP cache ambiguity

### Manifest-Based Loading

The manifest lists available tiles:

```json
{
    "tiles": [
        "0/0/0.png",
        "1/0/0.png",
        "1/0/1.png"
    ],
    "generated": "2025-01-15T10:00:00Z"
}
```

Benefits:
- Know which tiles exist before requesting
- Avoid 404 errors for missing tiles
- Can show placeholder for unavailable tiles
- Track freshness via `generated` timestamp

### Why Not Service Worker?

Service Workers add complexity:
- Registration/update lifecycle
- Scope restrictions
- Debug difficulty
- Cache invalidation strategy

The tile set is small enough to hold in memory and simple enough that a service worker is overkill.

## Implementation

### Build-Time Scripts

| Script | Purpose |
|--------|---------|
| `scripts/fetch-tiles.ts` | Download tiles from Dynmap |
| `scripts/tile-utils.ts` | Coordinate conversion, URL building |

### Runtime Components

| Component | Purpose |
|-----------|---------|
| `TileLoader` class | Manages tile fetching and blob caching |
| `TileManifest` interface | Typed manifest structure |
| Leaflet tile layer | Displays tiles on map |

### Cache Lifecycle

1. **Init**: Load manifest, pre-allocate cache
2. **Request**: Check cache, fetch if missing, create blob URL
3. **Display**: Return blob URL to Leaflet
4. **Cleanup**: Optional, blob URLs freed on page unload

### Fallback Behavior

```typescript
async getTile(z: number, x: number, y: number): Promise<string> {
    const key = `${z}/${x}/${y}`;
    
    if (!this.manifest.has(key)) {
        return PLACEHOLDER_TILE; // Grey tile
    }
    
    if (this.cache.has(key)) {
        return this.cache.get(key)!;
    }
    
    return this.fetchAndCache(key);
}
```

## Consequences

### Positive

- Near-instant tile display after first load
- Works offline/LAN perfectly
- No CORS issues
- Predictable performance

### Negative

- Tiles can become stale
- Must re-run fetch-tiles to update
- Storage space for tiles (~50MB)
- Memory usage for blob cache

### Mitigations

- Include `generated` date in manifest, show in UI
- Document refresh procedure
- Tiles compressed with PNG optimization
- Blob URLs freed on page unload

## Future Considerations

- Incremental tile updates (only fetch changed tiles)
- Tile diffing based on manifest hash
- WebP format for smaller tiles
- IndexedDB for persistent cache across sessions
