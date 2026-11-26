/**
 * Barrel re-export for test navigation mocks.
 * Split into focused modules for maintainability.
 * @module tests/helpers/navigation-mocks
 */

export type { DynamicDataMock,MockRecipe, MockShop } from './data-refresh-mocks.js';
export { createDynamicDataMock, setupDynamicDataMock, setupFastRefreshConfig } from './data-refresh-mocks.js';
export type { MultiPlayerMock,PlayerMock, PlayerState } from './player-mocks.js';
export { createMultiPlayerMock, createPlayerMock, setupMultiPlayerApiMock,setupPlayerApiMock } from './player-mocks.js';
export { BLUE_PIXEL_PNG, createColoredPng, RED_PIXEL_PNG } from './png-utilities.js';
export type { TestConfigOverrides } from './test-config.js';
export { buildTestConfig, mockConfigRoute,TEST_APP_CONFIG } from './test-config.js';
export type { RGB } from './tile-map-mocks.js';
export { fulfillMissingTile, isBlueColor, isRedColor, MULTI_WORLD_SHOP_DATA, sampleMapColor, setupColoredTileMocks, setupMultiWorldDataMock, waitForMapWorld } from './tile-map-mocks.js';
