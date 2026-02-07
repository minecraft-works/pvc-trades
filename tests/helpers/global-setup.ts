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
            
            // Patch Leaflet's flyTo to use setView when animations are disabled
            // This avoids buggy flyTo behavior with duration 0
            const patchLeafletFlyTo = () => {
                const L = (globalThis as unknown as { L?: { Map?: { prototype: { flyTo?: unknown; setView?: unknown } } } }).L;
                if (!L?.Map?.prototype?.flyTo) { return; }
                L.Map.prototype.flyTo = function(this: unknown, latlng: unknown, zoom?: number, _options?: unknown) {
                    // When animations disabled, use setView which is more reliable
                    const setView = (this as { setView: (latlng: unknown, zoom?: number, options?: { animate: boolean }) => unknown }).setView;
                    return setView.call(this, latlng, zoom, { animate: false });
                };
            };
            // Patch after Leaflet loads
            if ((globalThis as unknown as { L?: unknown }).L) {
                patchLeafletFlyTo();
            } else {
                // Wait for Leaflet to load, then patch
                Object.defineProperty(globalThis, 'L', {
                    configurable: true,
                    set(value) {
                        Object.defineProperty(globalThis, 'L', { value, writable: true, configurable: true });
                        setTimeout(patchLeafletFlyTo, 0);
                    }
                });
            }
        });
        await use(page);
    },
});

export { expect } from '@playwright/test';
