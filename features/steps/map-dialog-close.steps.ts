/**
 * Step definitions for map dialog close behavior scenarios
 * Tests that the dialog closes only when clicking outside, not during map interactions
 */
import { expect } from '@playwright/test';

import { Then,When } from './fixtures';

// Selectors
const SELECTOR_MAP_DIALOG = '#map-dialog';
const SELECTOR_LEAFLET_MAP = '.leaflet-container';

// Re-use the "I click on an overworld shop" step from shop-map-players.steps.ts
// It's already defined there and will be shared

When('I click on the map area', async ({ page }) => {
    const map = page.locator(SELECTOR_LEAFLET_MAP).first();
    await map.click({ position: { x: 100, y: 100 } });
});

When('I click outside the map dialog', async ({ page }) => {
    const dialog = page.locator(SELECTOR_MAP_DIALOG);
    const box = await dialog.boundingBox();
    if (!box) {
        throw new Error('Map dialog not visible');
    }
    
    // Click on the backdrop (outside the dialog)
    // Click 50px to the left of the dialog
    await page.mouse.click(box.x - 50, box.y + box.height / 2);
});

When('I mousedown on the map area', async ({ page }) => {
    const map = page.locator(SELECTOR_LEAFLET_MAP).first();
    const box = await map.boundingBox();
    if (!box) {
        throw new Error('Map not visible');
    }
    
    // Press mouse down in the center of the map
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
});

When('I drag to outside the dialog', async ({ page }) => {
    const dialog = page.locator(SELECTOR_MAP_DIALOG);
    const box = await dialog.boundingBox();
    if (!box) {
        throw new Error('Map dialog not visible');
    }
    
    // Move mouse to outside the dialog (left side)
    await page.mouse.move(box.x - 100, box.y + box.height / 2);
});

When('I release the mouse outside the dialog', async ({ page }) => {
    // Release the mouse (mouseup)
    await page.mouse.up();
});

Then('the map dialog should remain open', async ({ page }) => {
    const dialog = page.locator(SELECTOR_MAP_DIALOG);
    await expect(dialog).toBeVisible();
});

Then('the map dialog should be closed', async ({ page }) => {
    const dialog = page.locator(SELECTOR_MAP_DIALOG);
    await expect(dialog).not.toBeVisible();
});
