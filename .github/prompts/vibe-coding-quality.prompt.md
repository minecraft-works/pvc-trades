# Vibe Coding Quality Guard Rails

This skill defines the engineering disciplines that keep this AI-accelerated codebase maintainable. Reference it during code generation, reviews, and refactoring to prevent quality drift.

---

## Why This Exists

This project is primarily vibe-coded (AI-generated with human oversight). Without explicit guard rails, AI assistants introduce entropy over time: inconsistent patterns, escape hatches, dead code, and shallow tests. This document codifies the disciplines that prevent that.

---

## Enforced Disciplines

### 1. Zero `any` in Production

- **Never** use `: any`, `as any`, or untyped generics in `src/` files
- Use `unknown` for data from external sources, then validate with Zod
- If a type is genuinely complex, define it in `types.ts` — don't escape to `any`

```typescript
// ❌ Vibe coding shortcut
const data = await response.json() as any;

// ✅ Disciplined approach
const data: unknown = await response.json();
const result = MySchema.safeParse(data);
if (!result.success) { return DEFAULT_VALUE; }
```

### 2. No Suppression Without Justification

- `@ts-expect-error` is allowed **only** with an explanatory comment
- `eslint-disable` requires a comment explaining **why** the rule doesn't apply
- Never use `@ts-ignore` (use `@ts-expect-error` so it fails when the issue is fixed)
- Never use blanket `eslint-disable` (always disable specific rules)

```typescript
// ❌ Lazy suppression
// @ts-ignore
window.myStore = store;

// ✅ Justified suppression
// @ts-expect-error - exposing store on window for e2e test access
window.myStore = store;
```

### 3. Zod `.safeParse()` at Every Boundary

- **Never** use `.parse()` in production code (it throws)
- Always provide a fallback value for parse failures
- `.parse()` is acceptable in test assertions where failure = test failure

```typescript
// ❌ Throws on invalid data — crashes the app
const config = AppConfigSchema.parse(data);

// ✅ Graceful degradation
const result = AppConfigSchema.safeParse(data);
return result.success ? result.data : DEFAULT_CONFIG;
```

### 4. Constants, Not Magic Numbers

- All thresholds, selectors, storage keys, and config values live in `constants.ts`
- Import from `constants.ts` — never inline a magic number or duplicate a selector string
- If you need a new constant, add it to the appropriate section in `constants.ts`

### 5. Pure/Impure Separation

- `library.ts`: Pure functions only — no `document`, `window`, `localStorage`, `fetch`
- `main.ts`: DOM manipulation, event handlers, side effects
- `stores/*.ts`: Stateful classes with localStorage persistence
- **Test**: If a function can't be unit-tested without a browser, it's in the wrong file

### 6. Pre-commit Hooks Are Sacred

- **NEVER** use `--no-verify`, `-n`, or `HUSKY=0` to bypass hooks
- If hooks fail, **fix the issue** — don't work around it
- The hook runs: typecheck → lint-staged → knip → docs → test:coverage → test:load

---

## Active Concerns to Watch

These are known quality risks. AI assistants should actively work to **reduce** these, not increase them.

### Concern 1: God Files

| File | Lines | Risk |
|------|-------|------|
| `main.ts` | ~3,100 | Too large; should be decomposed into feature modules |
| `library.ts` | ~2,100 | Functions could be grouped into focused modules |

**When adding code**: Before adding a function to `main.ts` or `library.ts`, ask whether it belongs in an existing sub-module (`dialogs/`, `map/`, `navigation/`, `search/`, `favorites/`, `stores/`) or warrants a new one.

**Decomposition targets**:
- `main.ts` rendering functions → consider `rendering/` module
- `main.ts` tab/dialog management → already partially in `dialogs/`
- `library.ts` route optimization → consider `routing/` module
- `library.ts` value calculation → consider `valuation/` module

**Rule**: A new function should go into `main.ts` or `library.ts` **only** if it doesn't fit any sub-module. Prefer growing the module tree over growing the monoliths.

### Concern 2: Test Coverage Gaps

- `main.ts` is excluded from unit test coverage — it relies entirely on BDD tests
- BDD tests are thorough but slower to run and harder to pinpoint failures
- When extracting code from `main.ts` into modules, **add unit tests for the extracted functions**

### Concern 3: Mutation Testing Score

- Current mutation score: ~69% overall (cart-store 87%, navigation-store 60%, library 68%)
- The Stryker `break` threshold is 65% — do not let it regress
- When modifying `library.ts`, `cart-store.ts`, or `navigation-store.ts`, aim to **improve** the mutation score
- Next target: raise `break` to 70% once scores allow

### Concern 4: Large Step Definition Files

- Some BDD step files exceed 1,000 lines (tile-loading, tile-color-verification)
- When adding new step definitions, check if similar steps already exist
- Prefer reusing existing steps over duplicating patterns
- If a step file exceeds 500 lines, consider splitting by sub-feature

### Concern 5: Re-export Indirection

- `library.ts` re-exports stores from `stores/index.ts` for "backward compatibility"
- New code should import stores directly from `stores/index.ts` or specific store files
- Do not add new re-exports through `library.ts`

---

## Quality Checklist for AI-Generated Code

Before considering a change complete, verify:

### Type Safety
- [ ] No `any` types introduced
- [ ] External data validated with Zod `.safeParse()`
- [ ] No `@ts-ignore` added (use `@ts-expect-error` with comment if needed)

### Architecture
- [ ] Pure logic is in `library.ts` or a sub-module, not `main.ts`
- [ ] DOM code is in `main.ts` or a UI module, not `library.ts`
- [ ] Constants are in `constants.ts`, not inlined
- [ ] New types/schemas are in `types.ts`

### Testing
- [ ] Pure functions have unit tests in adjacent `*.test.ts` files
- [ ] New user-facing behavior has a BDD scenario in `features/`
- [ ] Property-based tests considered for functions with broad input domains
- [ ] Tests mock external APIs — no real network calls

### Style
- [ ] Functions ≤100 lines (or justified `eslint-disable` with comment)
- [ ] ≤5 parameters (use options object for more)
- [ ] Cyclomatic complexity ≤15
- [ ] `for...of` instead of `.forEach()`
- [ ] `undefined` instead of `null`
- [ ] Template literals instead of string concatenation
- [ ] JSDoc on all exported functions

### Process
- [ ] Commit message follows conventional commits (`feat:`, `fix:`, `refactor:`, etc.)
- [ ] Pre-commit hooks pass without bypass
- [ ] No TODO/FIXME/HACK comments left behind (fix it now or create an issue)

---

## Anti-Patterns to Reject

AI assistants should refuse to generate these patterns:

| Anti-Pattern | Why It's Banned | Alternative |
|-------------|-----------------|-------------|
| `as any` | Destroys type safety | Use proper types or `unknown` + validation |
| `.parse()` in prod | Throws on invalid data | `.safeParse()` + fallback |
| `console.log` debugging | Leaks to production | Use `debug` library namespaces |
| `@ts-ignore` | Silently hides future breaks | `@ts-expect-error` with comment |
| `--no-verify` on commit | Bypasses all quality gates | Fix the failing check |
| Inline magic numbers | Scattered, undocumented values | Add to `constants.ts` |
| `forEach` | Inconsistent with codebase (unicorn rule) | `for...of` |
| `null` returns | Inconsistent with codebase (unicorn rule) | `undefined` |
| Test-only code in prod | Couples prod to test concerns (ADR-003) | Use test fixtures |
| Adding to god files | Increases debt | Use or create sub-modules |

---

## When to Update This Document

- After a quality assessment identifies new patterns or risks
- When a new ADR is created that affects coding disciplines
- When a concern is resolved (move from "Active Concerns" to a "Resolved" section)
- When new linting rules or tooling are added to the project
