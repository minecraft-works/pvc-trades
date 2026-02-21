/**
 * Barrel re-export for test navigation mocks.
 * Split into focused modules for maintainability.
 * @module tests/helpers/navigation-mocks
 */

export { createColoredPng, BLUE_PIXEL_PNG, RED_PIXEL_PNG } from './png-utilities.js';

export type { PlayerState, PlayerMock, MultiPlayerMock } from './player-mocks.js';
export { createPlayerMock, createMultiPlayerMock, setupPlayerApiMock, setupMultiPlayerApiMock } from './player-mocks.js';

export type { RGB } from './tile-map-mocks.js';
export { setupColoredTileMocks, MULTI_WORLD_SHOP_DATA, setupMultiWorldDataMock, sampleMapColor, isBlueColor, isRedColor, waitForMapWorld } from './tile-map-mocks.js';

export type { MockRecipe, MockShop, DynamicDataMock } from './data-refresh-mocks.js';
export { createDynamicDataMock, setupDynamicDataMock, setupFastRefreshConfig } from './data-refresh-mocks.js';
