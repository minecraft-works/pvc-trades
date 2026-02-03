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
