# AGENTS.md

Guide for AI agents (and humans) working on this repository. This project is
built and maintained by AI agents, so this file is the single source of truth
for conventions. Keep it accurate: when you change a convention, a command or
the structure, update this file in the same change.

## Project

Minecraft shop trade viewer for the PeacefulVanilla server: search ~7k shop
trades, judge deals (deviation from the median price), plan a shopping route,
and navigate it live on the server's map. Static site (Vite) deployed to GitHub
Pages; data comes from two Cloudflare Workers that add CORS to the map server:

| Data | Source |
|------|--------|
| Shop trades | `workers/shops` (`pvc-shops`), proxies `…/shops/data.json` and appends the admin shops, supports ETag/304 |
| Live players | `workers/players` (`pvc-players`), proxies `…/maps/tiles/players.json` |
| Map tiles | Loaded by the browser straight from the map server as `<img>` |

On `localhost` the app reads `public/data.json` instead of the shops Worker
(`npm run fetch-data` downloads it).

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Dev server at http://localhost:5173/pvc-trades/ |
| `npm run dev:players` | Dev server that also serves the players Worker locally |
| `npm run fetch-data` | Download live shop data to `public/data.json` |
| `npm test` | Unit tests (Vitest, ~2 s) |
| `npm run typecheck` | `tsc` over all code: src, tests, features, scripts, workers |
| `npm run lint` | ESLint with cache (cold ~60 s, warm ~5 s) |
| `npm run check` | Full gate: typecheck, all linters, knip, file names, lockfile, dependency rules, coverage |
| `npm run test:e2e` | Playwright-BDD + Playwright specs (~4 min) |
| `npm run build` | Production build to `dist/` |
| `npx size-limit` | Bundle size budget (after a build) |

Several worktrees can run E2E side by side: `PORT=5199 npm run test:e2e`
starts its own dev server on that port (Playwright otherwise reuses whatever
runs on 5173, which may be another checkout).

**Before you finish a change:** `npm run check`, plus `npm run test:e2e` when
UI behaviour changed. Hooks: pre-commit runs lint-staged, typecheck and unit
tests (~15 s); pre-push runs `npm run check`. Do not bypass them with
`--no-verify`; fix the failure.

## Where code goes

```
src/
├── main.ts              Entry: creates the handlers below and wires DOM events
├── library.ts           Pure: trade processing, search matching, sorting
├── types.ts             Types and zod schemas (snapshot-types.ts for snapshots)
├── constants.ts         Storage keys, CSS classes, selectors, thresholds
├── debug.ts             Namespaced debug loggers (see Debugging)
├── formatting.ts        Pure name formatting
├── tile-coords.ts       Pure tile coordinate maths (single source of truth)
├── valuation/           Pure: buildValuation (pair prices, currency graph, item values), rates, flips, item identity (shulkers, base units)
├── routing/             Pure: route optimisation (nearest neighbour + 2-opt), navigation helpers
├── interpolation/       Pure: player position spring-damper maths
├── search/              query.ts, deviation.ts, shop-filter.ts, lenses.ts, scope.ts (pure); search-sort.ts (DOM)
├── dashboard/           dashboard-data.ts (pure), dashboard-ui.ts (DOM)
├── stores/              Class-based state stores with localStorage persistence (ADR-005)
├── data-loader/         Fetches, validates and refreshes shop data
├── rendering/           Trade table rows and virtual-list.ts (window-scrolled list)
├── quick-search/        Field menus (autocomplete, lenses, shops, filters), scope pills, URL sync
├── dialogs/             Exchange-rate matrix, flips, trade details
├── cart/                Cart dialog and route timeline
├── favorites/           Watchlist dialog and popover
├── navigation/          Live navigation: nav map, updates, shop tooltip
├── map/                 Leaflet (leaflet.ts), shop map dialog, tiles, players
└── chatlog/             Offline chat log parser (CLI: run-parser.ts)
workers/                 Cloudflare Workers (shops, players), each with wrangler.toml
styles.css               Entry stylesheet; imports styles/*.css in cascade order
features/                Gherkin scenarios; features/steps/*.steps.ts step definitions
tests/                   Playwright specs (*.spec.ts) and shared helpers (tests/helpers/)
docs/                    architecture.md, glossary.md, ADRs (docs/adr/)
```

Rules:

- Pure logic (no DOM, no fetch) goes in a pure module with a unit test next to
  it. DOM code stays in the UI modules. Dependency rules are enforced by
  `npm run lint:deps` (e.g. library.ts and stores never import UI modules,
  nothing imports `main.ts`, no cycles).
- Import from the module that defines a symbol. Do not add re-export layers;
  the folder `index.ts` files only expose a folder's public handlers.
- UI modules use a factory with injected dependencies:
  `createXxxHandler(deps) → handler`, created in `main.ts`.
- Shared state lives in a store class (`stores/`), exported as a singleton.
- CSS goes in the matching `styles/*.css` file. Order in `styles.css` is the
  cascade order; use the custom properties in `styles/base.css` for colours.
- Keep files under ~400 lines and functions under ~75; split by sub-feature.

## Coding conventions

- TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- No `any`, `as any`, `@ts-ignore` or non-null `!`. `eslint-disable` is not
  allowed in `src/` (CI budget is 0).
- `undefined`, not `null`. `for…of`, not `.forEach()`. Template literals.
- `camelCase` functions/variables, `PascalCase` types/classes,
  `SCREAMING_SNAKE_CASE` constants, `_prefix` for unused parameters.
- JSDoc on every exported function. Max 5 parameters; use an options object.
- Magic numbers go in `constants.ts`.
- **External data is `unknown` until validated** with zod **mini**
  (`import { z } from 'zod/mini'`), always via `.safeParse()` with a fallback,
  never `.parse()` (`npm run lint:parse-safety`). zod/mini uses functions
  instead of chained modifiers:
  `z.optional(z.string())`, `z.int().check(z.positive())`,
  `z._default(z.string(), '')`, `z.looseObject({...})`.
- **Rendering:** build DOM with lit-html `html` templates, which insert values
  as text/attributes. Use `replaceContent(container, template)` to (re)fill an
  existing element and `renderToElement(template)` for Leaflet icons and
  tooltips (`src/rendering/render.ts`); lit's `render()` for a new element you
  own. Never assign `innerHTML`/`outerHTML` or call `insertAdjacentHTML`
  (ESLint blocks it) and never use `unsafeHTML`: shop, item, owner and player
  names come from a public feed and are untrusted. Search highlighting:
  `highlightSegments()` (pure, `library.ts`) plus a `<mark>` template.
- **Leaflet is loaded on demand.** Await `loadLeaflet()` (src/map/leaflet.ts)
  before creating a map; code that only runs while a map exists calls
  `leaflet()`. Use `import type * as L from 'leaflet'` for types. Never import
  `leaflet` at runtime elsewhere, or it lands in the initial bundle. The
  exchange rates dialog (`dialogs/matrix-dialog.ts`, `valuation/flips.ts`) is
  loaded the same way by `loadExchangeRates()` in `main.ts`: only type imports
  of those two modules elsewhere.
- Test-only behaviour belongs in test fixtures, not production code (ADR-003).

## Runtime constraints

- **Map server:** the page sends no referrer (`<meta name="referrer"
  content="no-referrer">`) because the server answers 403 to a foreign
  `Referer`. Tiles have no CORS headers: `<img>` only, no `fetch`/canvas.
  Missing tiles are HTTP 200 with an empty body; the overlay is removed on
  `error`. Only request what is visible; the server is a community resource
  (ADR-009, ADR-010).
- **Coordinates:** nether × 8 = overworld. Normalise to overworld before any
  distance (`calculateRouteDistance`, ADR-008). Worlds:
  `'overworld' | 'the_nether' | 'the_end'`.
- **Shop data refresh** (default 60 s) revalidates with the Worker and skips
  all processing when the payload is unchanged.
- **Admin shops:** the shops Worker appends the server's spawn shops with
  owner `ADMIN_SHOP_OWNER` (`constants.ts`; the Worker keeps a copy that must
  match). Their `stock` is a placeholder for unlimited: rank by
  `getRealStock()`, never `displayStock` (ADR-024). Localhost data has none,
  so tests add them via `tests/helpers/admin-shop-mocks.ts`.
- **Bundle budget:** initial JS ~62 kB gzip (~53 kB brotli); `size-limit`
  fails CI above 56 kB brotli. Prefer small in-house code over new runtime
  dependencies, and load heavy features on demand (ADR-021).
- Thresholds live in `constants.ts`, e.g. `NAVIGATION.ARRIVAL_THRESHOLD`
  (auto-advance at 8 blocks). Search input is debounced to one search per
  animation frame; player polling uses `squaremap.playerRefreshMs`.

## Testing

| Code under test | Test | Location |
|-----------------|------|----------|
| Pure function | Vitest unit test | `src/**/x.test.ts` next to `x.ts` |
| Broad input domains | fast-check property test | `src/library.property.test.ts` |
| Worker | Vitest with stubbed `fetch` | `workers/*/index.test.ts` |
| User-visible behaviour | Gherkin scenario + steps | `features/*.feature`, `features/steps/` |
| Layout/CSS invariants, perf | Playwright spec | `tests/*.spec.ts` |

- Unit tests run in Node without a DOM: keep logic testable as pure functions.
- Step files import `Given/When/Then` from `features/steps/fixtures.ts`, which
  also disables animations and provides player mocks.
- Never hit real endpoints. Mock with `page.route` using the patterns in
  `tests/helpers/endpoints.ts`; config via `mockConfigRoute()` in
  `tests/helpers/test-config.ts`; players via `tests/helpers/player-mocks.ts`;
  tiles via `tests/helpers/tile-map-mocks.ts`.
- Wait for conditions (`expect(...).toBeVisible()`, `expect.poll`), never fixed
  timeouts. Maps appear after Leaflet loads: poll for `__leafletMap`/`__navMap`.
- Coverage thresholds (`vitest.config.js`) apply to pure modules; DOM modules
  are covered by the browser tests. Mutation testing (Stryker) runs weekly and
  on PRs touching pure modules (`stryker.config.mjs`).

## Debugging

```js
localStorage.debug = 'app:*';            // all: app:navigation, app:playerpoll, app:map, app:tiles, app:interpolation
localStorage.debug = 'app:*,-app:tiles'; // all but tiles
delete localStorage.debug;
```

Reload after changing it; enable the "Verbose" console level. The app exposes
`__cartStore`, `__favoritesStore`, `__leafletMap` and `__navMap` on
`globalThis` for tests and inspection; the dev build also exposes
`refreshShopData()`.

## Git

- Branches: `main` (production, deployed after CI passes), `develop`,
  `feature/*`, `fix/*`, `chore/*`.
- Conventional commits, enforced by commitlint. Types: `feat`, `fix`, `perf`,
  `refactor`, `test`, `docs`, `chore`, `ci`, `style`, `revert` (no `build`).
  Body lines under 100 characters; explain why, not what.

## Documentation

- `docs/architecture.md`: module map, data flow, tile system, dashboard.
- `docs/glossary.md`: domain terms (deviation, independent shops, core blocks, …).
- `docs/adr/`: decisions. Read the relevant ADR before changing an established
  pattern, and add an ADR for a new one.
