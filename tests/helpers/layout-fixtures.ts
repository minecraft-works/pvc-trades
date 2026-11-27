/**
 * Shared setup for the layout specs (tests/layout-*.spec.ts): mock shop data,
 * routes and waits for the app and the shop map.
 */

import type { Page } from '@playwright/test';

import { expect } from './global-setup';
import { mockConfigRoute } from './test-config';

// Test configuration
export const BASE_URL = `http://localhost:${process.env.PORT ?? '5173'}`;
export const VIEWPORT = { width: 1280, height: 720 };
export const MOBILE_VIEWPORT = { width: 375, height: 667 };

// Mock shop data for testing
const MOCK_SHOP_DATA = {
    data: [
        {
            location: '-7374.0, 69.0, -1772.0',
            world: 'world',
            recipes: [
                {
                    resultItem: { type: 'FIREWORK_ROCKET', name: 'Firework Rocket', amount: 64 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                    stock: 6
                },
                {
                    resultItem: { type: 'GOLD_INGOT', name: 'Gold Ingot', amount: 5 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 8 },
                    stock: 128
                },
                {
                    resultItem: { type: 'IRON_INGOT', name: 'Iron Ingot', amount: 16 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 4 },
                    stock: 256
                }
            ]
        },
        {
            location: '-19950.0, 68.0, -21636.0',
            world: 'world_nether',
            recipes: [
                {
                    resultItem: { type: 'EMERALD', name: 'Emerald', amount: 12 },
                    item1: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                    stock: 32
                },
                {
                    resultItem: { type: 'NETHERITE_INGOT', name: 'Netherite Ingot', amount: 1 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 100 },
                    stock: 8
                }
            ]
        },
        {
            location: '300.0, 100.0, 400.0',
            world: 'world_the_end',
            recipes: [
                {
                    resultItem: { type: 'ENDER_PEARL', name: 'Ender Pearl', amount: 4 },
                    item1: { type: 'EMERALD', name: 'Emerald', amount: 5 },
                    stock: 16
                }
            ]
        }
    ]
};

// Helper to set up mock routes
export async function setupMockRoutes(page: Page): Promise<void> {
    await mockConfigRoute(page);

    await page.route('**/data.json', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_SHOP_DATA)
        });
    });
}

// Helper to wait for app to be ready
export async function waitForAppReady(page: Page): Promise<void> {
    // Wait for the search container to be visible (app has initialized)
    await page.waitForSelector('.search-container', { state: 'visible' });
}

// Helper to wait for all trades to be visible (trades show on load)
export async function showAllTrades(page: Page): Promise<void> {
    // Trades are shown automatically on load, just wait for them
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 10_000 });
}

/**
 * Recipe selling one cooked beef for emeralds
 * @param amount - Emerald price
 * @returns Raw recipe for mock shop data
 */
export function beefForEmeralds(amount: number) {
    return {
        resultItem: { type: 'COOKED_BEEF', name: '', amount: 1 },
        item1: { type: 'EMERALD', name: '', amount },
        stock: 5
    };
}

/** The open shop map, exposed for tests */
export interface LeafletWindow {
    __leafletMap: { getCenter: () => { lat: number; lng: number }; getZoom: () => number };
}

/**
 * Wait until the shop map exists: Leaflet loads on demand, after the dialog opens
 * @param page - Playwright page
 */
export async function waitForShopMap(page: Page): Promise<void> {
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as unknown as Partial<LeafletWindow>).__leafletMap))).toBe(true);
}
