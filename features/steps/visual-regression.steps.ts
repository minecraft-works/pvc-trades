/**
 * Visual regression step definitions
 * 
 * Uses Playwright's built-in toHaveScreenshot() for pixel-level comparison.
 * Baselines are stored in the test-results directory and committed to source control.
 * 
 * First run generates baselines; subsequent runs compare against them.
 * Use `npx playwright test --update-snapshots` to refresh baselines.
 */
import { expect } from '@playwright/test';
import { Then } from './fixtures';

/** Tolerance for pixel comparison to avoid flaky results from anti-aliasing */
const MAX_DIFF_PIXEL_RATIO = 0.01;

/** Shared screenshot options for stability */
const SCREENSHOT_OPTIONS = {
    maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    animations: 'disabled' as const,
};

Then(
    'the main content area should match the visual baseline {string}',
    async ({ page }, baselineName: string) => {
        // Wait for trade rows to be fully rendered before capturing
        await page.locator('.trade-row').first().waitFor({ state: 'visible' });
        // Use full-page screenshot clipped to the content area to avoid virtual scroller instability
        const content = page.locator('#table-container');
        const box = await content.boundingBox();
        if (!box) { throw new Error('#results-container not visible'); }
        await expect(page).toHaveScreenshot(`${baselineName}.png`, {
            ...SCREENSHOT_OPTIONS,
            clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 600) },
        });
    },
);

Then(
    'the dialog should match the visual baseline {string}',
    async ({ page }, baselineName: string) => {
        const dialog = page.locator('dialog[open], .dialog-overlay:visible, .trade-details-popover:visible').first();
        await expect(dialog).toHaveScreenshot(`${baselineName}.png`, SCREENSHOT_OPTIONS);
    },
);
