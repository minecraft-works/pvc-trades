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
// Config builder
// ============================================================================

/** Selective overrides accepted by {@link buildTestConfig}. */
export interface TestConfigOverrides {
    dataUrl?: string;
    dataRefreshMs?: number;
    dynmap?: Partial<AppConfig['dynmap']>;
    analysis?: Partial<AppConfig['analysis']>;
}

/**
 * Build a test config with selective overrides (deep-merged for nested objects).
 *
 * @example
 * // Override just the polling rate
 * buildTestConfig({ dynmap: { baseUrl: 'http://localhost:5173/tiles' } })
 */
export function buildTestConfig(overrides: TestConfigOverrides = {}): AppConfig {
    return {
        ...TEST_APP_CONFIG,
        ...overrides,
        dynmap: { ...TEST_APP_CONFIG.dynmap, ...overrides.dynmap },
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
 * @example
 * // Default config
 * await mockConfigRoute(page);
 *
 * // Fast data refresh for polling tests
 * await mockConfigRoute(page, { dataRefreshMs: 2000 });
 *
 * // Custom dynmap base URL
 * await mockConfigRoute(page, { dynmap: { baseUrl: 'http://localhost:5173/tiles' } });
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
