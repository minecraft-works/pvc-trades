# ADR-006: Zod for Runtime Schema Validation

## Status
**Implemented** - 2024. **Updated** 2026-11: schemas use `zod/mini` (see
"zod/mini" below and ADR-019).

## Context

The application loads data from multiple external sources:

- `data.json` — Shop and trade data
- `config.json` — Application configuration
- `players.json` — Live player positions (players Worker proxy)
- `core_currencies.json` — Core block definitions
- `block_conversions.json` — Block↔ingot conversion rates
- localStorage — Persisted user state

All external data is untrusted and may be:
- Malformed (missing fields, wrong types)
- Outdated (schema changed)
- Corrupted (storage issues)

TypeScript types only exist at compile time — they provide no runtime protection.

## Decision

Use **Zod** for runtime schema validation with the **`.safeParse()` pattern**.

```typescript
const data: unknown = await response.json();
const result = AppConfigSchema.safeParse(data);
if (!result.success) {
    return DEFAULT_CONFIG; // Fallback
}
return result.data; // Typed correctly
```

## Rationale

### Why Runtime Validation?

| Source | Trust Level | Risk |
|--------|-------------|------|
| Network JSON | None | Server error, schema drift, MITM |
| localStorage | Low | Corruption, old format, user tampering |
| URL params | None | XSS, injection |

Without validation, invalid data causes runtime errors deep in the call stack, making debugging difficult.

### Why Zod?

| Library | TS Inference | Bundle Size | API Style | Decision |
|---------|--------------|-------------|-----------|----------|
| **Zod** | First-class | ~12KB | Chainable, declarative | ✅ Selected |
| io-ts | Good | ~8KB | FP-heavy, steeper learning | Rejected |
| Yup | Limited | ~15KB | jQuery-like, less TS focus | Rejected |
| Ajv | Manual | ~30KB | JSON Schema, verbose | Rejected |
| Valibot | Good | ~3KB | Newer, less ecosystem | Considered |

**Zod advantages**:
- Schema definition = TypeScript type (single source of truth)
- `.safeParse()` returns discriminated union (no try/catch needed)
- Composable schemas (`.extend()`, `.pick()`, `.merge()`)
- Excellent error messages for debugging
- Well-documented, widely adopted

### The `.safeParse()` Pattern

**Never use `.parse()`** — it throws on invalid data, forcing try/catch everywhere.

```typescript
// ✅ Correct: safeParse with fallback
const result = Schema.safeParse(data);
return result.success ? result.data : fallback;

// ❌ Wrong: parse throws
try {
    return Schema.parse(data);
} catch {
    return fallback;
}
```

The `.safeParse()` pattern:
- Explicit success/failure handling
- No exception overhead
- Type narrowing works naturally
- Consistent pattern across codebase

## Implementation

### Schema Location

All schemas defined in `types.ts`:
- Adjacent to the TypeScript interface they validate
- Exported for reuse across modules
- Named with `Schema` suffix: `AppConfigSchema`, `TradeSchema`

### Type Extraction

```typescript
// Schema defines shape
const TradeSchema = z.object({
    give: z.array(ItemStackSchema),
    result: z.array(ItemStackSchema),
    // ...
});

// Type derived from schema
type Trade = z.infer<typeof TradeSchema>;
```

Single source of truth — schema and type always match.

### Fallback Strategy

| Data Source | Fallback |
|-------------|----------|
| config.json | `DEFAULT_CONFIG` constant |
| data.json | Empty array, show error UI |
| localStorage | Empty/default state |
| Player API | Show "not found" message |

## Consequences

### Positive

- Type-safe external data handling
- Single source of truth for types
- Clear validation failure points
- Excellent developer experience

### Negative

- ~12KB bundle size addition
- Schema duplication if types defined separately (avoid this)
- Learning curve for schema composition

### Mitigations

- Schemas are the type source (use `z.infer`)
- Zod is tree-shakeable for unused features
- Document common schema patterns

## zod/mini

Classic zod's chainable API (`z.string().min(1).optional()`) keeps most of the
library in the bundle (26 kB gzip here). `zod/mini` has the same validation
core and types, with modifiers as functions that tree-shake (~8 kB):

| Classic | zod/mini |
|---------|----------|
| `import { z } from 'zod'` | `import { z } from 'zod/mini'` |
| `z.string().optional()` | `z.optional(z.string())` |
| `z.number().int().positive()` | `z.int().check(z.positive())` |
| `z.string().min(1)` | `z.string().check(z.minLength(1))` |
| `z.number().min(-99).max(999)` | `z.number().check(z.gte(-99), z.lte(999))` |
| `z.string().optional().default('')` | `z._default(z.string(), '')` |
| `z.object({...}).loose()` | `z.looseObject({...})` |
| `x.nullable()` | `z.nullable(x)` |

`.safeParse()` and `z.infer` work the same.

## Future Considerations

- Add transforms (`z.pipe`/`z.transform`) for data normalization if needed
