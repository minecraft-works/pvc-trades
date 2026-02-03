/**
 * Playwright Global Setup
 * 
 * This file configures global settings that apply to all Playwright tests.
 * It's referenced in playwright.config.ts via the `use` configuration.
 */

import { test as base } from '@playwright/test';

/**
 * Extended test with animation disabling.
 * Import this instead of `@playwright/test` in spec files to get animations disabled.
 */
export const test = base.extend({
    page: async ({ page }, use) => {
        // Disable animations for faster, more stable tests
        await page.addInitScript(() => {
            // JS flag checked by shouldDisableAnimations() in types.ts
            (globalThis as unknown as { __animationsDisabled?: boolean }).__animationsDisabled = true;
            // CSS attribute checked by [data-animations-disabled] rules in styles.css
            document.documentElement.dataset.animationsDisabled = 'true';
        });
        await use(page);
    },
});

export { expect } from '@playwright/test';
