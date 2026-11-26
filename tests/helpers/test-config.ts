/**
 * Shared test configuration for both Playwright specs and BDD step definitions.
 *
 * Centralises the config object so that schema changes (e.g. new fields,
 * default value tweaks) only need updating in one place.
 *
 * @module tests/helpers/test-config
 */

import type { Page, Route } from '@playwright/test';

import { type AppConfig, DEFAULT_CONFIG } from '../../src/types.js';

// ============================================================================
// Base test config
// ============================================================================

/**
 * Standard test configuration derived from `DEFAULT_CONFIG`.
 *
 * The only difference from production defaults is `dataUrl`, which points at
 * the local `data.json` so Playwright route interception works reliably.
 */
export const TEST_APP_CONFIG: AppConfig = {
    ...DEFAULT_CONFIG,
    dataUrl: 'data.json'
};

// ============================================================================
// Tile format constants
// ============================================================================

/** Tile format served by the Squaremap server. */
export const TILE_FORMAT = 'png';

/** Glob pattern for page.route() tile interception */
export const TILE_ROUTE_PATTERN = `**/tiles/**/*.${TILE_FORMAT}` as const;

// ============================================================================
// Config builder
// ============================================================================

/** Selective overrides accepted by {@link buildTestConfig}. */
export interface TestConfigOverrides {
    dataUrl?: string;
    dataRefreshMs?: number;
    squaremap?: Partial<AppConfig['squaremap']>;
    analysis?: Partial<AppConfig['analysis']>;
}

/**
 * Build a test config with selective overrides (deep-merged for nested objects).
 *
 * @param overrides
 * @example
 * // Override just the polling rate
 * buildTestConfig({ squaremap: { playerRefreshMs: 500 } })
 */
export function buildTestConfig(overrides: TestConfigOverrides = {}): AppConfig {
    return {
        ...TEST_APP_CONFIG,
        ...overrides,
        squaremap: { ...TEST_APP_CONFIG.squaremap, ...overrides.squaremap },
        analysis: { ...TEST_APP_CONFIG.analysis, ...overrides.analysis }
    };
}

// ============================================================================
// Playwright route helper
// ============================================================================

/**
 * Intercept `config.json` requests and respond with the standard test config
 * (or a customised variant via `overrides`).
 *
 * @param page
 * @param overrides
 * @example
 * // Default config
 * await mockConfigRoute(page);
 *
 * // Fast data refresh for polling tests
 * await mockConfigRoute(page, { dataRefreshMs: 2000 });
 *
 * // Custom map server base URL
 * await mockConfigRoute(page, { squaremap: { baseUrl: 'http://localhost:5173/maps' } });
 */
export async function mockConfigRoute(
    page: Page,
    overrides: TestConfigOverrides = {}
): Promise<void> {
    const config = buildTestConfig(overrides);
    await page.route('**/config.json', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(config)
        });
    });
}
