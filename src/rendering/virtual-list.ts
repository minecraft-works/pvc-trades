/**
 * Minimal window-scrolled virtual list for rows of equal height.
 *
 * Only the rows in (and just around) the viewport are in the DOM; padding on
 * the container stands in for the rest. Rows that stay in range are kept, not
 * re-created, so a focused row keeps focus while scrolling.
 *
 * @module rendering/virtual-list
 */

/** Rows rendered beyond each edge of the viewport */
const OVERSCAN_ROWS = 10;

/** Row height used until a rendered row can be measured */
const ESTIMATED_ROW_HEIGHT = 32;

export interface VisibleRangeInput {
    /** Viewport top relative to the first row, in px (negative when the list starts below it) */
    readonly offset: number;
    readonly viewportHeight: number;
    readonly rowHeight: number;
    readonly count: number;
    readonly overscan: number;
}

/**
 * Rows to render for a scroll position.
 * @param input - Scroll offset, sizes and row count
 * @returns Half-open index range [start, end)
 *
 * @example
 * getVisibleRange({ offset: 320, viewportHeight: 640, rowHeight: 32, count: 1000, overscan: 10 })
 * // { start: 0, end: 40 }
 */
export function getVisibleRange(input: VisibleRangeInput): { start: number; end: number } {
    const { offset, viewportHeight, rowHeight, count, overscan } = input;
    const first = Math.floor(Math.max(0, offset) / rowHeight);
    const last = Math.ceil(Math.max(0, offset + viewportHeight) / rowHeight);
    const start = Math.min(count, Math.max(0, first - overscan));
    const end = Math.min(count, last + overscan);
    return { start, end: Math.max(start, end) };
}

export interface VirtualList<T> {
    /** Replace the items; visible rows are rendered again */
    setItems: (items: readonly T[]) => void;
    /** Remove listeners, rows and the scroll padding */
    destroy: () => void;
}

/**
 * Render a long list into `container`, which scrolls with the window.
 * @param container - Block element in the page flow
 * @param renderItem - Creates the element for one item
 * @returns Handle to update or remove the list
 */
export function createVirtualList<T>(container: HTMLElement, renderItem: (item: T) => HTMLElement): VirtualList<T> {
    let items: readonly T[] = [];
    let rowHeight = ESTIMATED_ROW_HEIGHT;
    let rendered = { start: 0, end: 0 };
    let frame: number | undefined;

    function measureRowHeight(): void {
        const row = container.firstElementChild;
        if (!(row instanceof HTMLElement)) { return; }
        const height = row.getBoundingClientRect().height + Number.parseFloat(getComputedStyle(row).marginTop);
        if (height > 0) { rowHeight = height; }
    }

    function currentRange(): { start: number; end: number } {
        return getVisibleRange({
            // Row i sits at the container's top + i rows: the top padding stands in for the rows above
            offset: -container.getBoundingClientRect().top,
            viewportHeight: globalThis.innerHeight,
            count: items.length,
            overscan: OVERSCAN_ROWS,
            rowHeight,
        });
    }

    function renderRows(start: number, end: number): HTMLElement[] {
        return items.slice(start, end).map(item => renderItem(item));
    }

    /**
     * Bring the DOM to the range, keeping rows that stay in it
     * @param range - Rows to show
     * @param range.start - First row index
     * @param range.end - Index after the last row
     * @param reset - Re-create every row (items changed)
     */
    function apply(range: { start: number; end: number }, reset: boolean): void {
        const { start, end } = range;
        const overlaps = !reset && start < rendered.end && end > rendered.start;
        if (overlaps) {
            for (let index = rendered.start; index < start; index++) { container.firstElementChild?.remove(); }
            for (let index = end; index < rendered.end; index++) { container.lastElementChild?.remove(); }
            container.prepend(...renderRows(start, Math.min(rendered.start, end)));
            container.append(...renderRows(Math.max(rendered.end, start), end));
        } else {
            container.replaceChildren(...renderRows(start, end));
        }
        rendered = { start, end };
        container.style.paddingTop = `${String(start * rowHeight)}px`;
        container.style.paddingBottom = `${String((items.length - end) * rowHeight)}px`;
    }

    function update(): void {
        frame = undefined;
        const range = currentRange();
        if (range.start !== rendered.start || range.end !== rendered.end) { apply(range, false); }
    }

    function scheduleUpdate(): void {
        frame ??= requestAnimationFrame(update);
    }

    function onResize(): void {
        measureRowHeight();
        scheduleUpdate();
    }

    globalThis.addEventListener('scroll', scheduleUpdate, { passive: true });
    globalThis.addEventListener('resize', onResize);

    return {
        setItems(next): void {
            items = next;
            apply(currentRange(), true);
            const estimate = rowHeight;
            measureRowHeight();
            // The first real row may differ from the estimate: lay out again with its height
            if (rowHeight !== estimate) { apply(currentRange(), true); }
        },
        destroy(): void {
            globalThis.removeEventListener('scroll', scheduleUpdate);
            globalThis.removeEventListener('resize', onResize);
            if (frame !== undefined) { cancelAnimationFrame(frame); }
            container.replaceChildren();
            container.style.removeProperty('padding-top');
            container.style.removeProperty('padding-bottom');
        },
    };
}
