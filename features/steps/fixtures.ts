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
