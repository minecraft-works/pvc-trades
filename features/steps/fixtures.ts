/**
 * Playwright-BDD fixtures and step definition exports
 * 
 * This file sets up the connection between Playwright fixtures and BDD steps.
 * All step definition files should import Given, When, Then from here.
 */
import { test as base, createBdd } from 'playwright-bdd';
import { createPlayerMock, createMultiPlayerMock, type PlayerMock, type MultiPlayerMock } from '../../tests/helpers/navigation-mocks';

/**
 * Custom fixtures for BDD tests
 */
export type BddFixtures = {
    /** Player mock for navigation tests - created on demand */
    playerMock: PlayerMock;
    /** Multi-player mock for testing player markers on shop maps */
    multiPlayerMock: MultiPlayerMock;
    /** Track tile requests for debugging */
    tileRequests: string[];
};

/**
 * Extended test with custom fixtures
 */
export const test = base.extend<BddFixtures>({
    // Override page fixture to disable animations for faster, more stable tests
    page: async ({ page }, use) => {
        // Inject animation disable script before any page loads
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
    // Player mock is created fresh for each test
    // eslint-disable-next-line no-empty-pattern
    playerMock: async ({}, use) => {
        const mock = createPlayerMock('World');
        await use(mock);
    },
    // Multi-player mock is created fresh for each test
    // eslint-disable-next-line no-empty-pattern
    multiPlayerMock: async ({}, use) => {
        const mock = createMultiPlayerMock();
        await use(mock);
    },
    // Tile requests tracking
    // eslint-disable-next-line no-empty-pattern
    tileRequests: async ({}, use) => {
        const requests: string[] = [];
        await use(requests);
    },
});

/**
 * BDD step definition functions
 * Import these in your step definition files
 */
export const { Given, When, Then } = createBdd(test);

// ============================================================================
// Base tracking interfaces for property tests
// ============================================================================

/**
 * Base interface for page tracking in property tests
 * Step files can extend this with additional fields as needed
 */
export interface BasePageTracking {
    __playerX?: number;
    __playerZ?: number;
    __playerWorld?: string;
    __playerYaw?: number;
    __shopX?: number;
    __shopZ?: number;
    __shopWorld?: string;
}
