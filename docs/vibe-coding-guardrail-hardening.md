# Vibe-Coding Guardrail Hardening Plan

> Audit date: 2026-02-28 · Branch: `feature/scenario`

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **P0** | High impact — closes biggest AI-drift escape hatches |
| **P1** | Medium impact — tightens existing enforcement |
| **P2** | Low impact — polish and completeness |

---

## Checklist

### P0 — High Impact

- [x] **Enable `@typescript-eslint/no-unsafe-type-assertion`**
  - Added as `error` in eslint.config.js
  - Disabled in test file overrides (test mocks legitimately use partial casts)
  - Production DOM casts replaced with `instanceof` type guards
  - `SortColumn` casts replaced with runtime type guard set
  - `readonly` array casts replaced with spread operator `[...results]`
  - 6 `response.json()` casts given eslint-disable with "FUTURE: Zod schema" comment (needs schemas)
  - 1 `cart-store.ts` Zod structural mismatch cast retained with justification

- [x] **Add `eslint-disable` budget counter in CI**
  - Added CI step counting inline suppressions in `src/`
  - Budget: 40 (fails build if exceeded)
  - Current count: 37 production + 2 test = 39 total

- [x] **Broaden `library-no-dom` dependency-cruiser rule**
  - Now blocks `library.ts` → `main.ts`, `dialogs/`, `favorites/`, `rendering/`, `cart/`, `navigation/`, `dashboard/`, `map/`

- [x] **Promote Knip `exports` rule from `warn` to `error`**
  - Changed in knip.json

### P1 — Medium Impact

- [x] **Make `npm audit --audit-level=high` blocking in CI**
  - Removed `continue-on-error: true` from security audit step

- [x] **Enable `exactOptionalPropertyTypes: true` in tsconfig**
  - Caught 13 real type errors — all optional properties needed `| undefined`
  - Fixed across 8 files (types.ts, player-interpolator.ts, navigation-store.ts, interpolation.ts, live-navigation.ts, nav-updates.ts, favorites-ui.ts)

- [x] **Fix duplicate `unicorn/prefer-query-selector` rule**
  - Removed duplicate `warn` override; `error` severity retained

### P2 — Low Impact / Future

- [x] **Consider `noPropertyAccessFromIndexSignature: true`** in tsconfig
  - Evaluated: 34 errors, all `dataset.X` property access on HTMLElement
  - **Deferred** — low value vs churn; `noUncheckedIndexedAccess` covers the safety risk

- [x] **Add `lint:circular` to pre-commit hook**
  - Verified: `lint:deps` in pre-commit runs dependency-cruiser with `no-circular: error`
  - **No gap** — already covered; no change needed

- [x] **Run mutation testing on PRs** (at least `library.ts`)
  - Added `pull_request` trigger to `.github/workflows/mutation-testing.yml`
  - Scoped to paths: `library.ts`, `library.test.ts`, `library.property.test.ts`

- [x] **Add per-file coverage minimums**
  - Ratcheted aggregate thresholds: 83/74/85/83 → 86/79/87/86
  - Excluded `chatlog/run-parser.ts` (CLI script, 0% coverage, untestable in Vitest)
  - Documented weak files: `config-store.ts` (56%), `item-values.ts` (63%), `core-blocks-store.ts` (65%)
  - `perFile: true` not feasible until weak files improved

- [x] **Evaluate immutability rule surface area**
  - `prefer-immutable-types` enforced on pure computation modules (library, routing, valuation, search, interpolation, tile-coords, tile-pyramid)
  - Disabled only in stores (ADR-005) and UI/DOM modules (inherently imperative)
  - Tested: enabling in UI modules causes 13+ errors per file — impractical for DOM code
  - **Current scope is well-calibrated** — no change needed

- [x] **Add Zod schemas for remaining `response.json()` casts**
  - Created `ShopDataSchema` (types.ts) — validates shop/recipe/item structure
  - Created `PlayersDataSchema` (types.ts) — validates player API response
  - Created `ManifestEntrySchema` (tile-types.ts) — validates tile manifest entries
  - Created `NavProgressSchema` (navigation-store.ts) — validates persisted nav state
  - All 5 `response.json()`/`JSON.parse()` casts replaced with `.safeParse()` + fallback
  - Eliminated 10 `eslint-disable` directives (47 → 37 production)
  - Budget tightened: 50 → 40

---

## Implementation Notes

### `no-unsafe-type-assertion` rollout

All 4 original `as unknown as` casts resolved:
- `globalThis` casts → eliminated via proper `test-globals.d.ts` type declarations
- `cart-store.ts` Zod cast → retained with explicit eslint-disable justification

20 additional violations from the new rule were fixed:
- 8 DOM casts → `instanceof` type guards
- 5 rendering casts → type guard set + spread operator
- 1 chatlog script cast → added to existing eslint-disable line

### Zod schema migration

All `response.json()` / `JSON.parse()` casts replaced with Zod `.safeParse()`:
- `ShopDataSchema` → `data-loader.ts` (2 casts eliminated)
- `MappingRuleSchema` (pre-existing) → `data-loader.ts` (1 cast eliminated)
- `PlayersDataSchema` → `players.ts` (1 cast + `@typescript-eslint/no-unnecessary-condition` eliminated)
- `ManifestEntrySchema` → `tile-loader.ts` (1 cast eliminated)
- `NavProgressSchema` → `navigation-store.ts` (1 cast eliminated)

Moved `ItemSchema` earlier in types.ts to be reusable by `RecipeSchema`/`ShopSchema`.
Updated `Player` interface: `rotation` and `world` now include `| undefined`.

### `eslint-disable` budget

Current distribution (37 production directives):
- 9 `max-lines-per-function` — factory functions with closures
- 7 `no-unnecessary-type-parameters` — TypeScript overly-broad diagnostic
- 4 `functional/prefer-tacit` — conflicts with `unicorn/no-array-callback-reference`
- 3 `functional/prefer-immutable-types` — test-globals.d.ts declarations
- 2 `no-unsafe-type-assertion` — cart-store Zod mismatch + chatlog script
- 12 others (various justified suppressions)

```bash
# CI step pseudo-code
COUNT=$(grep -rc 'eslint-disable' src/ --include='*.ts' | awk -F: '{s+=$2}END{print s}')
if [ "$COUNT" -gt 40 ]; then
  echo "::error::eslint-disable budget exceeded: $COUNT > 40"
  exit 1
fi
```
