# ADR-009: Map Tiles Loaded Directly From the Map Server

## Status
**Accepted** — 2026

## Context

The shop and navigation maps are Leaflet maps showing tiles of the community server's live map (`squaremap.baseUrl` in `config.json`, a Squaremap instance). Its tiles follow a native zoom pyramid:

```
{baseUrl}/tiles/minecraft_{world}/{zoom}/{tileX}_{tileZ}.png     # zoom 4–8, 512×512 px
```

At zoom 8 one pixel is one block (512 blocks per tile); every lower zoom doubles the area covered.

What the server does and does not allow (verified against the live server):

| Behaviour | Consequence |
|-----------|-------------|
| `Referer` from another site → **403** (no `Referer` or the server's own origin → 200) | The page must send no referrer for tile requests |
| No `Access-Control-Allow-Origin` header | Tiles can be shown in `<img>` elements but not read with `fetch()`, canvas or WebGL |
| `Cache-Control: max-age=14400` | The browser HTTP cache handles repeat visits |
| Unrendered tiles → HTTP 200 with an **empty body** | There is no 404 to detect; the image simply fails to decode |

## Decision

The browser loads tiles straight from the map server through `L.imageOverlay(url, bounds)`:

- `index.html` sets `<meta name="referrer" content="no-referrer">` so tile requests carry no foreign `Referer`.
- `src/map/tile-layout.ts` maps the app's pyramid levels (0 = overview … 4 = detail) to server zooms 4–8 and builds tile URLs from `config.squaremap.baseUrl`.
- `src/map/tile-loader.ts` adds each tile once per map (`addedToMap`). When a tile fails to decode (not rendered), its overlay's `error` event removes it again, so lower-resolution tiles underneath stay visible.

JSON endpoints are different: they cannot be loaded cross-origin, so player positions and shop data keep going through our own Cloudflare Workers, which add CORS headers. See `workers/players`.

## Consequences

### Positive

- Tiles are always current; nothing to build, cache or deploy.
- The browser HTTP cache persists tiles across sessions.

### Negative

- Every visitor's browser requests tiles from a server we do not control (see [ADR-010](010-tile-loading-minimization.md) for how requests are limited).
- Because the page must strip the `Referer` to be served, the map depends on the server's hotlink rule staying as it is. If it changes the map goes blank; the fallback is a tile proxy Worker.
- Pixels cannot be read back, so features that need canvas access to tiles (e.g. lighting) are not possible.
