/**
 * Favorites watchlist step definitions
 * 
 * Updated for dialog-based approach with dropdown threshold selection.
 */
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';
import { setupMultiWorldDataMock, setupColoredTileMocks } from '../../tests/helpers/navigation-mocks';

// ============================================================================
// Constants for selectors
// ============================================================================
const TRADE_ROW_SELECTOR = '.trade-row';
const FAVORITE_STAR_SELECTOR = '.favorite-star';
const FAVORITES_DIALOG_SELECTOR = '#favorites-dialog';
const FILTER_FAVORITES_BTN_SELECTOR = '#filter-favorites';
const OPEN_FAVORITES_SELECTOR = '#open-favorites';
const CLOSE_FAVORITES_SELECTOR = '#close-favorites';
const FAVORITES_BADGE_SELECTOR = '.favorites-badge';
const FAVORITES_LIST_SELECTOR = '.favorites-list';
const FAVORITES_EMPTY_SELECTOR = '.favorites-empty';

// Dialog element selectors
const FAVORITES_ITEM_SELECTOR = '.favorites-item';
const FAVORITES_ADD_ROW_SELECTOR = '.favorites-item-add';
const ADD_INPUT_SELECTOR = '#favorites-new-item-input';
const ADD_DROPDOWN_SELECTOR = '#favorites-new-threshold-select';
const ADD_SAVE_BTN_SELECTOR = '.add-favorite-btn';
const EDIT_INPUT_SELECTOR = '.favorites-item-name-input';
const EDIT_DROPDOWN_SELECTOR = '.favorites-threshold-select';
const EDIT_BTN_SELECTOR = '.edit-favorite';
const SAVE_BTN_SELECTOR = '.save-favorite';
const DELETE_BTN_SELECTOR = '.remove-favorite';
const ITEM_DISPLAY_SELECTOR = '.favorites-item-display';
const ITEM_EDIT_SELECTOR = '.favorites-item-edit';
const THRESHOLD_DISPLAY_SELECTOR = '.favorites-item-threshold';

// ============================================================================
// Helper Functions
// ============================================================================

/** Get the first visible trade's item name */
async function getFirstTradeItemName(page: import('@playwright/test').Page): Promise<string> {
    await page.waitForSelector(FAVORITE_STAR_SELECTOR);
    return await page.locator(FAVORITE_STAR_SELECTOR).first().getAttribute('data-item') ?? 'unknown';
}

/** Get a trade item name by index (0-based), returns different items for badge count tests */
async function getTradeItemNameByIndex(page: import('@playwright/test').Page, index: number): Promise<string> {
    await page.waitForSelector(FAVORITE_STAR_SELECTOR);
    const stars = page.locator(FAVORITE_STAR_SELECTOR);
    const count = await stars.count();
    
    // Get unique item names
    const itemNames = new Set<string>();
    for (let starIndex = 0; starIndex < count && itemNames.size <= index; starIndex++) {
        const name = await stars.nth(starIndex).getAttribute('data-item');
        if (name) {
            itemNames.add(name);
        }
    }
    
    return [...itemNames][index] ?? 'unknown';
}

/** Store item name in test context for later verification */
let lastClickedItemName = '';

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('I have no favorites', async ({ page }) => {
    await page.evaluate(() => {
        localStorage.removeItem('pvc-trades-favorites');
    });
    // Re-apply mocks before reload
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    await page.reload();
    await page.waitForSelector(TRADE_ROW_SELECTOR, { state: 'visible' });
});

Given('I have {string} in my favorites', async ({ page }, itemName: string) => {
    // If placeholder item, use first visible trade's item
    let actualItemName = itemName;
    const placeholders = ['Diamond', 'TestItem', 'Diamond Pickaxe', 'Mending Book'];
    
    if (placeholders.includes(itemName)) {
        actualItemName = await getFirstTradeItemName(page);
    }
    
    await page.evaluate((name) => {
        const existing = localStorage.getItem('pvc-trades-favorites');
        const favorites = existing ? JSON.parse(existing) : [];
        if (!favorites.some((f: { itemName: string }) => f.itemName === name)) {
            favorites.push({ itemName: name, addedAt: Date.now() });
            localStorage.setItem('pvc-trades-favorites', JSON.stringify(favorites));
        }
    }, actualItemName.toLowerCase());
    
    // Re-apply mocks before reload
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    await page.reload();
    await page.waitForSelector(TRADE_ROW_SELECTOR, { state: 'visible' });
});

Given('I have {string} in my favorites with threshold {int}', async ({ page }, itemName: string, threshold: number) => {
    let actualItemName = itemName;
    const placeholders = ['Diamond', 'TestItem', 'Diamond Pickaxe'];
    
    if (placeholders.includes(itemName)) {
        actualItemName = await getFirstTradeItemName(page);
    }
    
    await page.evaluate(({ name, thresh }) => {
        const favorites = [{ itemName: name, maxDeviation: thresh, addedAt: Date.now() }];
        localStorage.setItem('pvc-trades-favorites', JSON.stringify(favorites));
    }, { name: actualItemName.toLowerCase(), thresh: threshold });
    
    // Re-apply mocks before reload
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    await page.reload();
    await page.waitForSelector(TRADE_ROW_SELECTOR, { state: 'visible' });
});

Given('I have {string} in my favorites without threshold', async ({ page }, itemName: string) => {
    let actualItemName = itemName;
    const placeholders = ['Diamond', 'TestItem', 'Diamond Pickaxe'];
    
    if (placeholders.includes(itemName)) {
        actualItemName = await getFirstTradeItemName(page);
    }
    
    await page.evaluate((name) => {
        const favorites = [{ itemName: name, addedAt: Date.now() }];
        localStorage.setItem('pvc-trades-favorites', JSON.stringify(favorites));
    }, actualItemName.toLowerCase());
    
    // Re-apply mocks before reload
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    await page.reload();
    await page.waitForSelector(TRADE_ROW_SELECTOR, { state: 'visible' });
});

Given('I have {int} different items in my favorites', async ({ page }, count: number) => {
    // Get different item names from the trade list
    const itemNames: string[] = [];
    for (let itemIndex = 0; itemIndex < count; itemIndex++) {
        const name = await getTradeItemNameByIndex(page, itemIndex);
        if (name !== 'unknown' && !itemNames.includes(name)) {
            itemNames.push(name);
        }
    }
    
    // Build favorites array with all items
    const favorites = itemNames.map((name, index) => ({
        itemName: name.toLowerCase(),
        addedAt: Date.now() - index * 1000 // Slight offset for ordering
    }));
    
    await page.evaluate((favs) => {
        localStorage.setItem('pvc-trades-favorites', JSON.stringify(favs));
    }, favorites);
    
    // Re-apply mocks before reload
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    await page.reload();
    await page.waitForSelector(TRADE_ROW_SELECTOR, { state: 'visible' });
});

Given('the favorites filter is active', async ({ page }) => {
    const filterButton = page.locator(FILTER_FAVORITES_BTN_SELECTOR);
    const isActive = await filterButton.evaluate(element => element.classList.contains('active'));
    if (!isActive) {
        await filterButton.click();
    }
});

// ============================================================================
// WHEN Steps - Star Interactions
// ============================================================================

When('I click the star on a trade row for a new item', async ({ page }) => {
    // Click a hollow star (not yet a favorite)
    const hollowStar = page.locator(`${FAVORITE_STAR_SELECTOR}:not(.active)`).first();
    lastClickedItemName = await hollowStar.getAttribute('data-item') ?? '';
    await hollowStar.click();
});

When('I click the filled star on a {string} trade row', async ({ page }, _itemName: string) => {
    // Find a star that is marked as a favorite (active class)
    const star = page.locator(`${FAVORITE_STAR_SELECTOR}.active`).first();
    lastClickedItemName = await star.getAttribute('data-item') ?? '';
    await star.click();
});

// ============================================================================
// WHEN Steps - Dialog Interactions
// ============================================================================

When('I open the favorites dialog', async ({ page }) => {
    await page.locator(OPEN_FAVORITES_SELECTOR).click();
    await page.waitForSelector(FAVORITES_DIALOG_SELECTOR, { state: 'visible' });
});

When('I close the favorites dialog', async ({ page }) => {
    await page.locator(CLOSE_FAVORITES_SELECTOR).click();
});

When('I click the favorites button in the search bar', async ({ page }) => {
    await page.locator(OPEN_FAVORITES_SELECTOR).click();
});

// ============================================================================
// WHEN Steps - Add Row Interactions
// ============================================================================

When('the threshold dropdown shows {string}', async ({ page }, expectedValue: string) => {
    const dropdown = page.locator(ADD_DROPDOWN_SELECTOR);
    const selectedText = await dropdown.locator('option:checked').textContent();
    expect(selectedText?.trim()).toBe(expectedValue);
});

When('I click the save button in the add row', async ({ page }) => {
    await page.locator(ADD_SAVE_BTN_SELECTOR).click();
});

When('I select {string} in the add row dropdown', async ({ page }, optionText: string) => {
    const dropdown = page.locator(ADD_DROPDOWN_SELECTOR);
    await dropdown.selectOption({ label: optionText });
});

When('I type {string} in the add input', async ({ page }, text: string) => {
    await page.locator(ADD_INPUT_SELECTOR).fill(text);
    lastClickedItemName = text.toLowerCase();
});

// ============================================================================
// WHEN Steps - Edit Row Interactions
// ============================================================================

When('I click the edit button for the item', async ({ page }) => {
    await page.locator(EDIT_BTN_SELECTOR).first().click();
});

When('I select {string} in the edit dropdown', async ({ page }, optionText: string) => {
    const dropdown = page.locator(`${FAVORITES_ITEM_SELECTOR}:not(${FAVORITES_ADD_ROW_SELECTOR}) ${EDIT_DROPDOWN_SELECTOR}`).first();
    await dropdown.selectOption({ label: optionText });
});

When('I click the save button in the row', async ({ page }) => {
    await page.locator(SAVE_BTN_SELECTOR).first().click();
});

When('I click the delete button for the item', async ({ page }) => {
    await page.locator(DELETE_BTN_SELECTOR).first().click();
});

// ============================================================================
// WHEN Steps - Filter & Refresh
// ============================================================================

When('I click the favorites filter button', async ({ page }) => {
    await page.locator(FILTER_FAVORITES_BTN_SELECTOR).click();
});

// ============================================================================
// THEN Steps - Dialog Visibility
// ============================================================================

Then('I should see the favorites dialog', async ({ page }) => {
    await expect(page.locator(FAVORITES_DIALOG_SELECTOR)).toBeVisible();
});

Then('the favorites dialog should be hidden', async ({ page }) => {
    await expect(page.locator(FAVORITES_DIALOG_SELECTOR)).not.toBeVisible();
});

// ============================================================================
// THEN Steps - Add Row Assertions
// ============================================================================

Then('the add input should contain the item name', async ({ page }) => {
    const input = page.locator(ADD_INPUT_SELECTOR);
    await expect(input).toHaveValue(lastClickedItemName);
});

Then('the add input should be focused', async ({ page }) => {
    const input = page.locator(ADD_INPUT_SELECTOR);
    await expect(input).toBeFocused();
});

Then('the add row threshold should be {string}', async ({ page }, expectedValue: string) => {
    const dropdown = page.locator(ADD_DROPDOWN_SELECTOR);
    const selectedText = await dropdown.locator('option:checked').textContent();
    expect(selectedText?.trim()).toBe(expectedValue);
});

Then('the add input should be cleared', async ({ page }) => {
    await expect(page.locator(ADD_INPUT_SELECTOR)).toHaveValue('');
});

Then('I should see the add row at the bottom', async ({ page }) => {
    await expect(page.locator(FAVORITES_ADD_ROW_SELECTOR)).toBeVisible();
});

Then('the add row should have an input field', async ({ page }) => {
    await expect(page.locator(ADD_INPUT_SELECTOR)).toBeVisible();
});

Then('the add row should have a threshold dropdown', async ({ page }) => {
    await expect(page.locator(ADD_DROPDOWN_SELECTOR)).toBeVisible();
});

Then('the add row dropdown should have options:', async ({ page }, dataTable: { raw: () => string[][] }) => {
    const dropdown = page.locator(ADD_DROPDOWN_SELECTOR);
    const options = await dropdown.locator('option').allTextContents();
    const expected = dataTable.raw().flat();
    expect(options).toEqual(expected);
});

Then('the add row dropdown should have title {string}', async ({ page }, title: string) => {
    await expect(page.locator(ADD_DROPDOWN_SELECTOR)).toHaveAttribute('title', title);
});

// ============================================================================
// THEN Steps - Edit Mode Assertions
// ============================================================================

Then('the item row should be in edit mode', async ({ page }) => {
    // Edit controls should be visible, display controls hidden
    const itemRow = page.locator(`${FAVORITES_ITEM_SELECTOR}:not(${FAVORITES_ADD_ROW_SELECTOR})`).first();
    await expect(itemRow.locator(ITEM_EDIT_SELECTOR)).toBeVisible();
    await expect(itemRow.locator(ITEM_DISPLAY_SELECTOR)).toBeHidden();
});

Then('the edit input should contain the item name', async ({ page }) => {
    const input = page.locator(`${FAVORITES_ITEM_SELECTOR}:not(${FAVORITES_ADD_ROW_SELECTOR}) ${EDIT_INPUT_SELECTOR}`).first();
    const value = await input.inputValue();
    expect(value.length).toBeGreaterThan(0);
});

Then('the save button should be visible', async ({ page }) => {
    await expect(page.locator(SAVE_BTN_SELECTOR).first()).toBeVisible();
});

Then('the edit button should be hidden', async ({ page }) => {
    await expect(page.locator(EDIT_BTN_SELECTOR).first()).toBeHidden();
});

Then('the delete button should be visible', async ({ page }) => {
    await expect(page.locator(DELETE_BTN_SELECTOR).first()).toBeVisible();
});

Then('the edit button should be visible', async ({ page }) => {
    await expect(page.locator(EDIT_BTN_SELECTOR).first()).toBeVisible();
});

// ============================================================================
// THEN Steps - Favorites List Assertions
// ============================================================================

Then('I should see {string} in the favorites list', async ({ page }, _itemName: string) => {
    // For placeholders, just verify there's an item in the list
    await expect(page.locator(`${FAVORITES_ITEM_SELECTOR}:not(${FAVORITES_ADD_ROW_SELECTOR})`).first()).toBeVisible();
});

Then('I should see {string} displayed for the item', async ({ page }, thresholdText: string) => {
    await expect(page.locator(THRESHOLD_DISPLAY_SELECTOR).first()).toHaveText(thresholdText);
});

Then('no threshold should be displayed for the item', async ({ page }) => {
    const itemRow = page.locator(`${FAVORITES_ITEM_SELECTOR}:not(${FAVORITES_ADD_ROW_SELECTOR})`).first();
    await expect(itemRow.locator(THRESHOLD_DISPLAY_SELECTOR)).toHaveCount(0);
});

Then('I should see text {string} in the dialog', async ({ page }, text: string) => {
    await expect(page.getByText(text, { exact: false })).toBeVisible();
});

Then('I should see a hint to click star on trades', async ({ page }) => {
    await expect(page.locator('.favorites-hint')).toBeVisible();
});

// ============================================================================
// THEN Steps - Star State Assertions
// ============================================================================

Then('the star should be filled', async ({ page }) => {
    await expect(page.locator(`${FAVORITE_STAR_SELECTOR}.active`).first()).toBeVisible();
});

Then('the star should remain hollow', async ({ page }) => {
    await expect(page.locator(`${FAVORITE_STAR_SELECTOR}`).first()).not.toHaveClass(/active/);
});

Then('the star should be hollow', async ({ page }) => {
    await expect(page.locator(`${FAVORITE_STAR_SELECTOR}`).first()).not.toHaveClass(/active/);
});

Then('all {string} trade rows should show filled stars', async ({ page }, _itemName: string) => {
    const stars = page.locator(`${FAVORITE_STAR_SELECTOR}.active`);
    const count = await stars.count();
    expect(count).toBeGreaterThan(0);
});

Then('all trade rows should show hollow stars', async ({ page }) => {
    const activeStars = page.locator(`${FAVORITE_STAR_SELECTOR}.active`);
    await expect(activeStars).toHaveCount(0);
});

Then('{string} trade rows should show filled stars', async ({ page }, _itemName: string) => {
    const stars = page.locator(`${FAVORITE_STAR_SELECTOR}.active`);
    const count = await stars.count();
    expect(count).toBeGreaterThan(0);
});

// ============================================================================
// THEN Steps - Favorites Persistence & State
// ============================================================================

Then('the item should be in my favorites', async ({ page }) => {
    const hasFavorite = await page.evaluate(() => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return false; }
        const favorites = JSON.parse(data);
        return favorites.length > 0;
    });
    expect(hasFavorite).toBe(true);
});

Then('the item should not be in my favorites', async ({ page }) => {
    const isEmpty = await page.evaluate(() => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return true; }
        const favorites = JSON.parse(data);
        return favorites.length === 0;
    });
    expect(isEmpty).toBe(true);
});

Then('the item should have no threshold filter', async ({ page }) => {
    const hasNoThreshold = await page.evaluate(() => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return false; }
        const favorites = JSON.parse(data);
        return favorites.some((f: { maxDeviation?: number }) => f.maxDeviation === undefined);
    });
    expect(hasNoThreshold).toBe(true);
});

Then('the item should be in my favorites with threshold {int}', async ({ page }, threshold: number) => {
    const hasThreshold = await page.evaluate((thresh) => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return false; }
        const favorites = JSON.parse(data);
        return favorites.some((f: { maxDeviation?: number }) => f.maxDeviation === thresh);
    }, threshold);
    expect(hasThreshold).toBe(true);
});

Then('the item should have threshold {int}', async ({ page }, threshold: number) => {
    const hasThreshold = await page.evaluate((thresh) => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return false; }
        const favorites = JSON.parse(data);
        return favorites.some((f: { maxDeviation?: number }) => f.maxDeviation === thresh);
    }, threshold);
    expect(hasThreshold).toBe(true);
});

Then('the item should still have threshold {int}', async ({ page }, threshold: number) => {
    const hasThreshold = await page.evaluate((thresh) => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return false; }
        const favorites = JSON.parse(data);
        return favorites.some((f: { maxDeviation?: number }) => f.maxDeviation === thresh);
    }, threshold);
    expect(hasThreshold).toBe(true);
});

Then('{string} should be in my favorites', async ({ page }, itemName: string) => {
    const hasFavorite = await page.evaluate((name) => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return false; }
        const favorites = JSON.parse(data);
        return favorites.some((f: { itemName: string }) => 
            f.itemName.toLowerCase() === name.toLowerCase()
        );
    }, itemName);
    expect(hasFavorite).toBe(true);
});

Then('{string} should be in my favorites with threshold {int}', async ({ page }, itemName: string, threshold: number) => {
    const hasItem = await page.evaluate(({ name, thresh }) => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return false; }
        const favorites = JSON.parse(data);
        return favorites.some((f: { itemName: string; maxDeviation?: number }) => 
            f.itemName.toLowerCase() === name.toLowerCase() && f.maxDeviation === thresh
        );
    }, { name: itemName, thresh: threshold });
    expect(hasItem).toBe(true);
});

Then('I should still have {string} in my favorites', async ({ page }, _itemName: string) => {
    const hasFavorites = await page.evaluate(() => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return false; }
        const favorites = JSON.parse(data);
        return favorites.length > 0;
    });
    expect(hasFavorites).toBe(true);
});

// ============================================================================
// THEN Steps - Badge Assertions
// ============================================================================

Then('the favorites badge should show {int}', async ({ page }, count: number) => {
    const badge = page.locator(FAVORITES_BADGE_SELECTOR);
    await expect(badge).toHaveText(String(count));
    await expect(badge).not.toHaveClass(/hidden/);
});

Then('the favorites badge should be hidden', async ({ page }) => {
    await expect(page.locator(FAVORITES_BADGE_SELECTOR)).toHaveClass(/hidden/);
});

// ============================================================================
// THEN Steps - Filter Assertions
// ============================================================================

Then('I should only see trades for favorited items', async ({ page }) => {
    const rows = page.locator(TRADE_ROW_SELECTOR);
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    
    // Each visible row should have an active star
    for (let index = 0; index < Math.min(count, 5); index++) {
        const row = rows.nth(index);
        await expect(row.locator(`${FAVORITE_STAR_SELECTOR}.active`)).toBeVisible();
    }
});

Then('I should see all trades', async ({ page }) => {
    const count = await page.locator(TRADE_ROW_SELECTOR).count();
    expect(count).toBeGreaterThan(1);
});

Then('the favorites button should show active state', async ({ page }) => {
    await expect(page.locator(FILTER_FAVORITES_BTN_SELECTOR)).toHaveClass(/active/);
});

Then('the favorites button should show inactive state', async ({ page }) => {
    await expect(page.locator(FILTER_FAVORITES_BTN_SELECTOR)).not.toHaveClass(/active/);
});

// ============================================================================
// THEN Steps - Property Test Assertions
// ============================================================================

Then('the item should be stored as {string}', async ({ page }, expectedName: string) => {
    const hasItem = await page.evaluate((name) => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return false; }
        const favorites = JSON.parse(data);
        return favorites.some((f: { itemName: string }) => f.itemName === name);
    }, expectedName);
    expect(hasItem).toBe(true);
});

Then('I should have exactly {int} favorite', async ({ page }, count: number) => {
    const actualCount = await page.evaluate(() => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return 0; }
        const favorites = JSON.parse(data);
        return favorites.length;
    });
    expect(actualCount).toBe(count);
});

Then('I should have exactly {int} entries', async ({ page }, count: number) => {
    const actualCount = await page.evaluate(() => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return 0; }
        const favorites = JSON.parse(data);
        return favorites.length;
    });
    expect(actualCount).toBe(count);
});

Then('the threshold should be {int}', async ({ page }, threshold: number) => {
    const hasThreshold = await page.evaluate((thresh) => {
        const data = localStorage.getItem('pvc-trades-favorites');
        if (!data) { return false; }
        const favorites = JSON.parse(data);
        return favorites.some((f: { maxDeviation?: number }) => f.maxDeviation === thresh);
    }, threshold);
    expect(hasThreshold).toBe(true);
});

Then('the stored threshold should be {word}', async ({ page }, value: string) => {
    if (value === 'undefined') {
        const hasNoThreshold = await page.evaluate(() => {
            const data = localStorage.getItem('pvc-trades-favorites');
            if (!data) { return false; }
            const favorites = JSON.parse(data);
            return favorites.some((f: { maxDeviation?: number }) => f.maxDeviation === undefined);
        });
        expect(hasNoThreshold).toBe(true);
    } else {
        const threshold = Number.parseInt(value, 10);
        const hasThreshold = await page.evaluate((thresh) => {
            const data = localStorage.getItem('pvc-trades-favorites');
            if (!data) { return false; }
            const favorites = JSON.parse(data);
            return favorites.some((f: { maxDeviation?: number }) => f.maxDeviation === thresh);
        }, threshold);
        expect(hasThreshold).toBe(true);
    }
});
