# ADR-010: Limiting Requests to the External Map Server

## Status
**Accepted** — 2026

## Context

Tiles come from an external community map server that we do not control and that sits behind Cloudflare. Since tiles are now requested by every visitor's browser (see [ADR-009](009-tile-caching-strategy.md)), the application itself must keep its request volume small.

## Decision

The map code only requests what is visible and never requests the same tile twice per map:

1. **Only tiles in view.** The navigation map requests the tiles covering the current viewport (plus a one-tile margin) and loads more on `moveend`/`zoomend`. The shop map requests the pyramid level that is active for the current zoom, plus the coarsest level (8192 blocks per tile, usually one to four tiles) as an always-visible underlay, so a zoom-out shows blurry terrain instead of an empty map while sharper tiles load. When a zoom animation starts, the shop map fetches the tiles of the zoom target into the browser cache (tiles are served with `max-age=14400`); these are the same tiles it adds at `zoomend`, so this costs no extra requests. On a level change the previous level stays visible underneath until the new level has loaded (`src/map/level-switcher.ts`). Clicking a player flies the map there (zoom out, travel, zoom in). The destination's tiles are fetched at the start of the flight, and the underlay is requested for the route (padded by half its size) and, while the map moves, for whatever is in view, at most every 100 ms. A larger preload of the flight's peak view was tried and dropped: the extra requests queued ahead of the destination's tiles.
2. **Detail only when zoomed in.** The navigation map skips the detail level (512 blocks per tile) at low zoom and relies on the overview level (8192 blocks per tile).
3. **Deduplication.** `addedToMap` sets in `tile-loader.ts`, the navigation map and the shop map ensure a tile is added to a map once.
4. **Browser HTTP cache.** Tiles are plain `<img>` loads; the server's `max-age=14400` means repeat visits do not hit the server.
5. **Missing tiles are dropped.** The server answers unrendered tiles with an empty 200; the overlay is removed on `error`, so a failed tile costs one request and no DOM.

## Consequences

- Load on the server scales with how much map a visitor looks at, not with the number of shops.
- Panning far away (e.g. a shop 50,000 blocks from spawn) requests tiles at that location.
- If the server tightens its rules, the next step is a caching tile proxy Worker in front of it.
