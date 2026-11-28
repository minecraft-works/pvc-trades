# Architecture

Static single-page app (Vite, vanilla TypeScript, lit-html templates, Leaflet
maps). See [AGENTS.md](../AGENTS.md) for the folder layout and conventions;
this document explains how the parts work together.

## Runtime overview

```
GitHub Pages (static: index.html, JS, CSS, config.json, *_conversions.json)
        │
Browser ├── shop data ──► pvc-shops Worker ──► map server /shops/data.json   (60 s refresh, ETag/304)
        ├── players ────► pvc-players Worker ─► map server /maps/tiles/players.json (polling while a map is open)
        └── tiles ──────► map server /maps/tiles/minecraft_{world}/{zoom}/{x}_{z}.png (<img>, no referrer)
```

The map server sends no CORS headers, so JSON goes through the Workers
(`workers/`). Tiles are plain images and need no Worker. On `localhost` the
app reads `public/data.json` (`npm run fetch-data`) instead of the shops
Worker.

## Startup and data flow

1. `main.ts` creates the handlers (data loader, renderer, search, dialogs,
   navigation, …) on `DOMContentLoaded`, injecting their dependencies.
2. `data-loader` loads `config.json`, `core_currencies.json`,
   `block_conversions.json`, then the shop data and `trade_conversions.json`.
   Every payload is validated with zod/mini `safeParse`.
3. `processTrade()` (`library.ts`) turns each shop recipe into a `Trade`
   (names, mapping rules, shulker contents, trade key).
4. Valuation: `buildValuation()` (`src/valuation/valuation.ts`, ADR-019)
   turns the in-stock trades into one set of prices:
   - trades are converted to **base units** (a block that crafts back into
     its base counts as that base, 1 Diamond block = 9 Diamond);
   - `calculatePairPrices()` collects per-unit prices per (item, currency);
   - `buildCurrencyGraph()` derives Buy/Sell exchange rates between
     currencies from direct markets, or composed through other currencies
     (Sell never above Buy);
   - `calculateItemValues()` derives emerald values anchored to those rates.
   `createDeviationCalculator()` (`search/deviation.ts`) compares a trade
   with the median of the same item in the same currency (ADR-018); without
   enough data it estimates across currencies, shown as "≈" and never
   counted as a deal. The 💱 Rates tab, converter and flips read the same
   valuation. Trust requires enough **independent shops** (clustered by
   distance and owner); statistics are cached per price array.
5. The dashboard compares trades with the stored snapshot (below), then
   `search-sort` filters and sorts, and `trade-renderer` renders the rows into
   the virtual list (ADR-007).
6. After the first load, Leaflet is prefetched when the browser is idle
   (ADR-021).

**Refresh:** every `dataRefreshMs` the loader fetches with
`cache: 'no-cache'`. The Worker answers 304 when unchanged, and the loader
also skips everything when the body equals the last one. Otherwise steps 3–5
run again and new trade keys are highlighted.

## Search

- Two queries: *Buying* (result item) and *Paying* (cost items). Matching
  ignores spaces/underscores and word order; a quoted query
  (`"emerald"`) matches whole names only (`search/query.ts`).
- The search scope (lenses, shop/owner and trade filters, ADR-023) is chosen
  from each field's menu (`quick-search/autocomplete.ts`, `field-menu.ts`),
  shown as pills (`scope-pills.ts`) and held by `searchScopeStore`. Lenses
  match on item IDs (`search/lenses.ts`); the whole search state is mirrored
  in the URL (`url-sync.ts`, `search/scope.ts`).
- Admin shops (owner `ADMIN_SHOP_OWNER`, appended by the shops Worker) are
  the owner filter "Admin shops" or the trade filter "Hide admin shops",
  which exclude each other (`withShop`/`withFilter`). Their stock is
  unlimited, so ranking uses `getRealStock()` (`search/shop-filter.ts`,
  ADR-024).
- Sorting supports several columns at once (`search-sort.ts`).

## Cart, route and navigation

- `cartStore` keeps trades and quantities (localStorage). The cart dialog
  aggregates a shopping list and computes a route.
- Routing (`src/routing/`): distances are normalised to overworld coordinates
  (nether × 8, ADR-008); the order is nearest-neighbour improved by 2-opt
  (ADR-004).
- Live navigation (`src/navigation/`) polls the player's position, smooths it
  with a spring-damper (`player-position-service`, ADR-011), follows the
  player on a round map, marks stops done within
  `NAVIGATION.ARRIVAL_THRESHOLD` blocks, and recalculates the route after
  moving.

## Maps and tiles

Leaflet is loaded on demand (`src/map/leaflet.ts`). Two maps exist: the shop
map dialog (`map/shop-map-dialog.ts`) and the navigation map
(`navigation/nav-map.ts`). Both use `CRS.Simple` with coordinates relative to
a centre tile (`lat = -z`, `lng = x`).

Tiles come from a Squaremap zoom pyramid:

```
{baseUrl}/tiles/minecraft_{world}/{zoom}/{tileX}_{tileZ}.png
blocksPerTile = 512 × 2^(8 − zoom)      zoom 8: 512 blocks (detail) … zoom 4: 8192 blocks (overview)
tileX = floor(blockX / blocksPerTile)
```

- `map/tile-layout.ts` maps app pyramid levels 0–4 to server zooms 4–8 and
  builds URLs; `tile-coords.ts` is the single source of truth for tile maths.
- `map/tile-loader.ts` adds each tile once per map as an image overlay. The
  server answers 200 with an empty body for unrendered tiles; those fail to
  decode and are removed.
- Only visible tiles are requested (plus a prefetch of the zoom target), and
  the browser HTTP cache handles reuse (ADR-009, ADR-010).
- World ids: data `world`/`world_nether`/`world_the_end` →
  `overworld`/`the_nether`/`the_end` (`getWorldId()`), tile path
  `minecraft_{id}`.

## Daily deals dashboard

Compares current trades with a baseline about a day old to show new trades,
price drops (≥ `DASHBOARD.PRICE_DROP_THRESHOLD` percentage points) and
watchlist hits (`dashboard/dashboard-data.ts`, pure; `dashboard-ui.ts`, DOM).

- **Rolling snapshots** (`snapshotStore`): on each load a snapshot of every
  trade's deviation and stock is appended if the last one is older than
  `DASHBOARD.SNAPSHOT_INTERVAL_MS` (1 h); snapshots older than
  `SNAPSHOT_MAX_AGE_MS` (30 h) are pruned.
- **Baseline:** the snapshot closest to `BASELINE_TARGET_AGE_MS` (24 h) old.
  Without one (first visit) nothing is shown.
- The banner can be dismissed and re-opened with the 📊 button; the new-trade
  keys also drive the "New" trade filter.
- Storage is compact (keys stored once, values in parallel arrays) and
  versioned with the deviation model, so old baselines are discarded.

## Persistence (localStorage)

| Key | Content |
|-----|---------|
| `shop-trades-cart` | Cart items and quantities |
| `shop-trades-favorites` | Watchlist with optional deviation thresholds |
| `shop-trades-snapshot-dev4` | Dashboard baseline (older keys are removed on load) |
| `shop-trades-nav-*` | Navigation progress, player name, tab, follow mode, view world |
| `debug` | Debug log namespaces (see AGENTS.md) |

All of it is validated with zod/mini on load and falls back to an empty state.

## Build and deploy

- `vite build` → `dist/` (initial JS chunk, a lazy Leaflet chunk, one CSS
  file). `size-limit` guards the initial chunk.
- CI (`.github/workflows/ci.yml`) runs static checks, unit tests with
  coverage, E2E in two shards, and build + size + Lighthouse in parallel.
- `deploy.yml` deploys to GitHub Pages after CI passes on `main`.
- Workers are deployed separately: `cd workers/<name> && npx wrangler deploy`.
