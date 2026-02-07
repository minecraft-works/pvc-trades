# ADR-007: Virtual Scrolling for Large Lists

## Status
**Implemented** - 2024

## Context

The trade list can contain thousands of items. When displaying filtered results, rendering all items as DOM nodes causes:

1. **Initial render lag**: Creating 1000+ DOM elements blocks the main thread
2. **Memory pressure**: Each row has icons, text, buttons (~20 DOM nodes)
3. **Scroll jank**: Browser struggles to composite large DOM trees
4. **Event listener overhead**: Attaching handlers to each row

### Performance Threshold

Testing showed noticeable degradation above ~100 visible items:

| Item Count | Render Time | Scroll FPS |
|------------|-------------|------------|
| 50 | <50ms | 60 |
| 100 | ~80ms | 55 |
| 500 | ~300ms | 30 |
| 1000 | ~700ms | 15 |

## Decision

Use **virtual scrolling** via the `virtual-scroller` web component to render only visible items plus a buffer.

```html
<virtual-scroller>
    <!-- Only ~20 items rendered at a time -->
</virtual-scroller>
```

## Rationale

### How Virtual Scrolling Works

```
┌─────────────────────────────────┐
│         Viewport (visible)       │
│  ┌───────────────────────────┐  │
│  │ Item 47                   │  │  ← Rendered
│  │ Item 48                   │  │  ← Rendered
│  │ Item 49                   │  │  ← Rendered
│  │ Item 50                   │  │  ← Rendered
│  └───────────────────────────┘  │
└─────────────────────────────────┘
│ Item 51                         │  ← Buffer (rendered)
│ Item 52                         │  ← Buffer (rendered)
│ ... Items 53-1000 ...           │  ← NOT rendered
```

Only items in viewport + buffer exist in DOM. As user scrolls, items are recycled.

### Why `virtual-scroller`?

| Library | Bundle | Framework | API | Decision |
|---------|--------|-----------|-----|----------|
| **virtual-scroller** | ~5KB | Vanilla | Web Component | ✅ Selected |
| react-window | ~6KB | React only | Hooks | N/A (not React) |
| vue-virtual-scroller | ~8KB | Vue only | Directive | N/A (not Vue) |
| Custom implementation | 0KB | Any | Manual | Rejected: complexity |

**Selection factors**:
- Framework-agnostic (vanilla TypeScript app)
- Web Component API integrates cleanly with HTML
- Small bundle footprint
- Handles edge cases (resize, dynamic heights)

### Why Not Custom Implementation?

Virtual scrolling has subtle edge cases:
- Scroll position preservation on data change
- Dynamic item heights
- Keyboard navigation
- Resize handling
- Initial scroll position restoration

A robust implementation requires significant effort. The library handles these correctly.

## Implementation

### Usage Pattern

```typescript
import 'virtual-scroller';

const scroller = document.querySelector('virtual-scroller');
scroller.items = filteredTrades;
scroller.renderItem = (item, index) => createTradeRow(item);
```

### Threshold Decision

Virtual scrolling adds complexity (recycling callbacks, scroll state management). Only apply when beneficial:

```typescript
if (results.length > VIRTUAL_SCROLL_THRESHOLD) {
    useVirtualScroller(results);
} else {
    useSimpleList(results);
}
```

Threshold set at **100 items** based on performance testing.

### Event Delegation

With virtual scrolling, items are recycled. Event handlers must use **delegation** on the container, not individual rows:

```typescript
// ✅ Correct: delegation
scroller.addEventListener('click', (e) => {
    const row = e.target.closest('.trade-row');
    if (row) handleRowClick(row.dataset.tradeKey);
});

// ❌ Wrong: per-row handlers (lost on recycle)
row.addEventListener('click', handleClick);
```

## Consequences

### Positive

- Constant render time regardless of list size
- Smooth 60fps scrolling for any data size
- Reduced memory usage
- Scalable to 10,000+ items

### Negative

- Adds dependency (~5KB)
- Requires event delegation pattern
- Scroll position management more complex
- Search highlighting requires re-render callback

### Mitigations

- Event delegation is good practice anyway
- Library handles scroll position internally
- Re-render on filter change handled by `items` setter

## Future Considerations

- Consider `content-visibility: auto` CSS for simpler cases
- Browser native virtual scrolling proposals may obsolete libraries
- Dynamic row heights may require configuration adjustments
