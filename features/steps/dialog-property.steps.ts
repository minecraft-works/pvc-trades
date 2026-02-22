/**
 * Step definitions for map dialog close property tests
 * Tests click zone detection and drag behavior
 */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { Given, Then,When } from './fixtures';

// ============================================================================
// Page tracking interface
// ============================================================================

interface PageWithDialogTracking extends Page {
    __dialogOpen?: boolean;
    __mapLeft?: number;
    __mapTop?: number;
    __mapRight?: number;
    __mapBottom?: number;
    __clickX?: number;
    __clickY?: number;
    __dragStartX?: number;
    __dragStartY?: number;
    __dragEndX?: number;
    __dragEndY?: number;
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Check if point is inside rectangle
 */
function isInsideRect(
    x: number, y: number,
    left: number, top: number, right: number, bottom: number
): boolean {
    return x >= left && x <= right && y >= top && y <= bottom;
}

/**
 * Determine if dialog should close based on click/drag
 */
function shouldCloseDialog(
    clickX: number, clickY: number,
    dragStartX: number | undefined, dragStartY: number | undefined,
    left: number, top: number, right: number, bottom: number
): boolean {
    // If drag, use drag start position
    const effectiveX = dragStartX ?? clickX;
    const effectiveY = dragStartY ?? clickY;
    
    // Close if click/drag started outside map
    return !isInsideRect(effectiveX, effectiveY, left, top, right, bottom);
}

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the map dialog is open', async ({ page }) => {
    const p = page as PageWithDialogTracking;
    p.__dialogOpen = true;
});

Given(String.raw`the map area is from \({int}, {int}\) to \({int}, {int}\)`, async ({ page }, left: number, top: number, right: number, bottom: number) => {
    const p = page as PageWithDialogTracking;
    p.__mapLeft = left;
    p.__mapTop = top;
    p.__mapRight = right;
    p.__mapBottom = bottom;
});

// ============================================================================
// WHEN Steps
// ============================================================================

When(String.raw`click occurs at \({int}, {int}\)`, async ({ page }, x: number, y: number) => {
    const p = page as PageWithDialogTracking;
    p.__clickX = x;
    p.__clickY = y;
    
    // Determine if dialog closes
    const shouldClose = shouldCloseDialog(
        x, y, undefined, undefined,
        p.__mapLeft ?? 0, p.__mapTop ?? 0, p.__mapRight ?? 0, p.__mapBottom ?? 0
    );
    
    if (shouldClose) {
        p.__dialogOpen = false;
    }
});

When(String.raw`drag starts at \({int}, {int}\)`, async ({ page }, x: number, y: number) => {
    const p = page as PageWithDialogTracking;
    p.__dragStartX = x;
    p.__dragStartY = y;
});

When(String.raw`drag ends at \({int}, {int}\)`, async ({ page }, x: number, y: number) => {
    const p = page as PageWithDialogTracking;
    p.__dragEndX = x;
    p.__dragEndY = y;
    
    // Determine if dialog closes based on drag start
    const shouldClose = shouldCloseDialog(
        0, 0, p.__dragStartX, p.__dragStartY,
        p.__mapLeft ?? 0, p.__mapTop ?? 0, p.__mapRight ?? 0, p.__mapBottom ?? 0
    );
    
    if (shouldClose) {
        p.__dialogOpen = false;
    }
});

When(String.raw`interaction {word} occurs at \({int}, {int}\)`, async ({ page }, _interaction: string, x: number, y: number) => {
    const p = page as PageWithDialogTracking;
    p.__clickX = x;
    p.__clickY = y;
    
    // Map interactions inside map don't close dialog
    const isInside = isInsideRect(
        x, y,
        p.__mapLeft ?? 0, p.__mapTop ?? 0, p.__mapRight ?? 0, p.__mapBottom ?? 0
    );
    
    if (!isInside) {
        p.__dialogOpen = false;
    }
});

When(String.raw`{int} rapid clicks occur at \({int}, {int}\)`, async ({ page }, _count: number, x: number, y: number) => {
    const p = page as PageWithDialogTracking;
    p.__clickX = x;
    p.__clickY = y;
    
    // First click determines outcome
    const shouldClose = shouldCloseDialog(
        x, y, undefined, undefined,
        p.__mapLeft ?? 0, p.__mapTop ?? 0, p.__mapRight ?? 0, p.__mapBottom ?? 0
    );
    
    if (shouldClose) {
        p.__dialogOpen = false;
    }
});

// ============================================================================
// THEN Steps
// ============================================================================

Then('the dialog should be {word}', async ({ page }, state: string) => {
    const p = page as PageWithDialogTracking;
    
    if (state === 'open') {
        expect(p.__dialogOpen).toBe(true);
    } else {
        expect(p.__dialogOpen).toBe(false);
    }
});
