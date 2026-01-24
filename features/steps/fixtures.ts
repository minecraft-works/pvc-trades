/**
 * Playwright-BDD fixtures and step definition exports
 * 
 * This file sets up the connection between Playwright fixtures and BDD steps.
 * All step definition files should import Given, When, Then from here.
 */
import { test as base, createBdd } from 'playwright-bdd';
import { createPlayerMock, type PlayerMock } from '../../tests/helpers/navigation-mocks';

/**
 * Custom fixtures for BDD tests
 */
export type BddFixtures = {
    /** Player mock for navigation tests - created on demand */
    playerMock: PlayerMock;
    /** Track tile requests for debugging */
    tileRequests: string[];
};

/**
 * Extended test with custom fixtures
 */
export const test = base.extend<BddFixtures>({
    // Player mock is created fresh for each test
    playerMock: async (_, use) => {
        const mock = createPlayerMock('World');
        await use(mock);
    },
    // Tile requests tracking
    tileRequests: async (_, use) => {
        const requests: string[] = [];
        await use(requests);
    },
});

/**
 * BDD step definition functions
 * Import these in your step definition files
 */
export const { Given, When, Then } = createBdd(test);
