# ADR-021: Lean Runtime Dependencies

## Status
**Implemented** - 2026-11

## Context

The site is used on phones in-game (alt-tabbed) as well as on desktops. In
November 2026 the initial JavaScript was 132 kB gzip, of which only 42 kB was
the app itself:

| Dependency | gzip | Used for |
|------------|------|----------|
| leaflet | 43 kB | Maps, only once a map dialog opens |
| zod | 26 kB | Validating a handful of schemas |
| virtual-scroller | 18 kB | Windowing equal-height rows |
| debug + ms | 2.5 kB | Namespaced console logging |

Main-thread work also mattered: valuating 6.7k trades took ~0.8 s per load and
per 60 s refresh, and every refresh downloaded and re-processed the full
payload even when nothing had changed.

## Decision

Keep the initial bundle small and load heavy features on demand.

1. **Leaflet on demand.** `src/map/leaflet.ts`: `loadLeaflet()` is awaited
   before a map is created, `leaflet()` is used while a map exists, and
   `prefetchLeaflet()` loads it when the browser is idle after the first data
   load. Only type imports of `leaflet` are allowed elsewhere. Leaflet's CSS
   is bundled through `styles.css` (no CDN request, no CSP exception, no
   version drift).
2. **zod/mini** instead of classic zod (ADR-006).
3. **In-house virtual list** for equal-height rows (ADR-007).
4. **In-house logger** in `src/debug.ts`, same `localStorage.debug` patterns as
   the `debug` package.
5. **lit-html** for templates: escaping by default for untrusted shop data at
   ~3.5 kB gzip, without adopting a framework.
6. **Cached statistics:** `countIndependentShops` and `median` are cached per
   price array (keyed on length; arrays only grow), cutting valuation from
   ~0.8 s to ~0.1 s.
7. **Conditional refresh:** the shops Worker forwards `ETag`/`Last-Modified`
   with `Cache-Control: no-cache`; the app refreshes with
   `fetch(url, { cache: 'no-cache' })` and skips processing when the body is
   unchanged.

`size-limit` (package.json) enforces the budget in CI.

## Consequences

- Initial JS: 132 kB → 57 kB gzip (lit-html included).
- A new runtime dependency needs a size check (`npm run build` prints gzip
  sizes) and should be loaded on demand if it is not needed for the first
  render.
- Code that touches Leaflet must respect the load order; tests poll for the
  map (`__leafletMap`/`__navMap`) instead of assuming it exists right after a
  dialog opens.
