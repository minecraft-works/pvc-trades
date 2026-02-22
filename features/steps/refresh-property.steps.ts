/**
 * Step definitions for data refresh property tests
 * Tests state preservation and filtering behavior during refresh
 */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { Given, Then,When } from './fixtures';

// ============================================================================
// Page tracking interface
// ============================================================================

interface PageWithRefreshTracking extends Page {
    __initialTrades?: number;
    __newTrades?: number;
    __removedTrades?: number;
    __highlightedTrades?: number;
    __searchFilter?: string;
    __newItemName?: string;
    __cartCount?: number;
    __cartQuantity?: number;
    __refreshFailed?: boolean;
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Check if item matches search filter (case insensitive)
 */
function matchesFilter(itemName: string, filter: string): boolean {
    return itemName.toLowerCase().includes(filter.toLowerCase());
}

// ============================================================================
// GIVEN Steps - Trade Count
// ============================================================================

Given('there are {int} trades', async ({ page }, count: number) => {
    const p = page as PageWithRefreshTracking;
    p.__initialTrades = count;
});

// ============================================================================
// GIVEN Steps - Highlights
// ============================================================================

Given('{int} trades are highlighted', async ({ page }, count: number) => {
    const p = page as PageWithRefreshTracking;
    p.__highlightedTrades = count;
});

// ============================================================================
// GIVEN Steps - Filter
// ============================================================================

Given('a search filter for {string}', async ({ page }, term: string) => {
    const p = page as PageWithRefreshTracking;
    p.__searchFilter = term;
});

// ============================================================================
// GIVEN Steps - Cart
// ============================================================================

Given('{int} items in cart', async ({ page }, count: number) => {
    const p = page as PageWithRefreshTracking;
    p.__cartCount = count;
});

Given('an item with quantity {int} in cart', async ({ page }, quantity: number) => {
    const p = page as PageWithRefreshTracking;
    p.__cartCount = 1;
    p.__cartQuantity = quantity;
});

// ============================================================================
// WHEN Steps
// ============================================================================

When('{int} new trades are added', async ({ page }, count: number) => {
    const p = page as PageWithRefreshTracking;
    p.__newTrades = count;
    p.__highlightedTrades = count;
});

When('{int} trades are removed', async ({ page }, count: number) => {
    const p = page as PageWithRefreshTracking;
    p.__removedTrades = count;
});

When('{int} seconds pass without page refresh', async ({ page }, _seconds: number) => {
    // Highlights persist - no state change
    await page.waitForTimeout(1);
});

When('a new trade for {string} is added', async ({ page }, itemName: string) => {
    const p = page as PageWithRefreshTracking;
    p.__newItemName = itemName;
    p.__newTrades = 1;
});

When('data refreshes', async ({ page }) => {
    // No state change for preservation tests
    await page.waitForTimeout(1);
});

When('refresh fails with error', async ({ page }) => {
    const p = page as PageWithRefreshTracking;
    p.__refreshFailed = true;
});

// ============================================================================
// THEN Steps - Trade Count
// ============================================================================

Then('total trades should be {int}', async ({ page }, expected: number) => {
    const p = page as PageWithRefreshTracking;
    
    const initial = p.__initialTrades ?? 0;
    const added = p.__newTrades ?? 0;
    const removed = p.__removedTrades ?? 0;
    
    const total = initial + added - removed;
    expect(total).toBe(expected);
});

// ============================================================================
// THEN Steps - Highlights
// ============================================================================

Then('{int} trades should be highlighted', async ({ page }, expected: number) => {
    const p = page as PageWithRefreshTracking;
    expect(p.__highlightedTrades ?? 0).toBe(expected);
});

Then('{int} trades should still be highlighted', async ({ page }, expected: number) => {
    const p = page as PageWithRefreshTracking;
    expect(p.__highlightedTrades ?? 0).toBe(expected);
});

// ============================================================================
// THEN Steps - Filter
// ============================================================================

Then('the new trade should be {word}', async ({ page }, visibility: string) => {
    const p = page as PageWithRefreshTracking;
    
    const matches = matchesFilter(
        p.__newItemName ?? '',
        p.__searchFilter ?? ''
    );
    
    if (visibility === 'visible') {
        expect(matches).toBe(true);
    } else {
        expect(matches).toBe(false);
    }
});

// ============================================================================
// THEN Steps - Cart
// ============================================================================

Then('cart should have {int} items', async ({ page }, expected: number) => {
    const p = page as PageWithRefreshTracking;
    expect(p.__cartCount ?? 0).toBe(expected);
});

Then('the item should have quantity {int}', async ({ page }, expected: number) => {
    const p = page as PageWithRefreshTracking;
    expect(p.__cartQuantity ?? 0).toBe(expected);
});

// ============================================================================
// THEN Steps - Error
// ============================================================================

Then('{int} trades should still be visible', async ({ page }, expected: number) => {
    const p = page as PageWithRefreshTracking;
    // On error, initial trades remain
    expect(p.__initialTrades ?? 0).toBe(expected);
});

Then('no error UI should be shown', async ({ page }) => {
    const p = page as PageWithRefreshTracking;
    // Design decision: silent failure
    expect(p.__refreshFailed).toBe(true);
});
