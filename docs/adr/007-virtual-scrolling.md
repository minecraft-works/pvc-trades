# ADR-007: Virtual Scrolling for Large Lists

## Status
**Implemented** - 2024. **Revised** 2026-11: the `virtual-scroller` package was
replaced by an in-house list (`src/rendering/virtual-list.ts`), see ADR-021.

## Context

The trade list shows up to ~7,000 trades. Rendering every row as DOM nodes
(~20 nodes per row) blocks the main thread on each search, uses a lot of
memory and makes scrolling janky.

## Decision

Render only the rows in and around the viewport. The page itself scrolls (no
inner scroll container), so the sticky search bar and header stay simple.

`createVirtualList(container, renderItem)` in `src/rendering/virtual-list.ts`:

- Rows have one fixed height (single-line grid rows; names truncate with an
  ellipsis). The height is measured from the first rendered row and again on
  resize.
- `getVisibleRange()` (pure, unit-tested) turns the scroll offset into the
  index range to render, plus 10 rows of overscan on each side.
- `padding-top`/`padding-bottom` on the container stand in for the rows that
  are not rendered, so the page height and scrollbar stay correct.
- On scroll (once per animation frame) rows that leave the range are removed
  and new ones are added at the edges. Rows that stay in range are kept, so a
  focused row keeps focus and arrow-key navigation (`main.ts`) can move to the
  next sibling row.
- `setItems()` re-creates the visible rows (row content depends on cart,
  favourites and deviation state); `destroy()` removes rows, padding and
  listeners, used when a search has no results.

```typescript
const list = createVirtualList(container, createTradeRowElement);
list.setItems(results);   // after every search
list.destroy();           // when showing "No trades found"
```

Rows are created by the renderer with their own event handlers; rows that
scroll out of range are discarded, so no recycling logic is needed.

## Rationale

The previous dependency (`virtual-scroller`, 18 kB gzip) supported variable
item heights, which this list does not need. Fixed-height windowing is ~150
lines, has no dependency, and keeps the focus/keyboard behaviour under our
control.

## Consequences

- Rows must keep a uniform height. A row that wraps or grows would desync the
  padding from the real positions; keep row content single-line (the Playwright
  spec `tests/virtual-scroll.spec.ts` checks consistent row heights).
- Behaviour is covered by `tests/virtual-scroll.spec.ts` (DOM row count,
  padding, scroll in both directions, search integration, empty results).
