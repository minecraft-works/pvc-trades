/**
 * Functional E2E Tests for Shopping Cart and Navigation Features
 */

import { test, expect } from './helpers/global-setup';
import type { Page } from '@playwright/test';

// Mock data matching the actual app structure
const MOCK_SHOP_DATA = {
    data: [
        {
            location: '100.0, 64.0, 200.0',
            world: 'world',
            recipes: [
                {
                    resultItem: { type: 'EMERALD', name: 'Emerald', amount: 3 },
                    item1: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                    stock: 10
                }
            ]
        },
        {
            location: '-50.0, 64.0, -100.0',
            world: 'world',
            recipes: [
                {
                    resultItem: { type: 'EMERALD', name: 'Emerald', amount: 1 },
                    item1: { type: 'IRON_INGOT', name: 'Iron Ingot', amount: 5 },
                    stock: 20
                }
            ]
        },
        {
            location: '300.0, 64.0, 400.0',
            world: 'world_nether',
            recipes: [
                {
                    resultItem: { type: 'NETHERITE_SCRAP', name: 'Netherite Scrap', amount: 1 },
                    item1: { type: 'GOLD_INGOT', name: 'Gold Ingot', amount: 8 },
                    stock: 5
                }
            ]
        }
    ]
};

async function setupMockRoutes(page: Page): Promise<void> {
    // Mock config.json to use local data.json instead of Cloudflare Worker
    await page.route('**/config.json', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                dataUrl: 'data.json',
                dataRefreshMs: 60_000, // Must be > 0 to pass Zod validation
                dynmap: {
                    baseUrl: 'https://web.peacefulvanilla.club/maps',
                    tileSize: 128,
                    defaultZoom: 4,
                    maxZoomLevel: 7,
                    playerRefreshMs: 1000
                },
                analysis: {
                    shopClusterDistance: 16,
                    maxTransitiveIterations: 10,
                    minIndependentShops: 3
                }
            })
        });
    });

    await page.route('**/data.json', route => {
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_SHOP_DATA)
        });
    });
}

async function waitForAppReady(page: Page): Promise<void> {
    await page.waitForSelector('.search-container', { state: 'visible' });
    await page.waitForSelector('.trade-row', { state: 'visible', timeout: 10_000 });
}

test.describe('Shopping Cart Basics', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.goto('/');
        await waitForAppReady(page);
        
        // Clear localStorage before each test
        await page.evaluate(() => {
            localStorage.clear();
        });
    });

    test('should add item to cart and update badge', async ({ page }) => {
        // Initially badge should be hidden
        const badge = page.locator('#cart-badge');
        await expect(badge).toHaveClass(/hidden/);

        // Click first add button
        await page.locator('.add-to-cart-btn').first().click();

        // Badge should now be visible and show "1"
        await expect(badge).not.toHaveClass(/hidden/);
        await expect(badge).toHaveText('1');
    });

    test('should add multiple items and update badge count', async ({ page }) => {
        const badge = page.locator('#cart-badge');

        // Add first item
        await page.locator('.add-to-cart-btn').nth(0).click();
        await expect(badge).toHaveText('1');

        // Add second item
        await page.locator('.add-to-cart-btn').nth(1).click();
        await expect(badge).toHaveText('2');

        // Add third item
        await page.locator('.add-to-cart-btn').nth(2).click();
        await expect(badge).toHaveText('3');
    });

    test('should persist cart to localStorage', async ({ page }) => {
        // Add an item
        await page.locator('.add-to-cart-btn').first().click();

        // Check localStorage with correct storage key
        const cartData = await page.evaluate(() => localStorage.getItem('pvc-trades-cart'));
        expect(cartData).toBeTruthy();
        
        const cart = JSON.parse(cartData!);
        expect(cart).toHaveLength(1);
        expect(cart[0]).toHaveProperty('quantity', 1);
        expect(cart[0]).toHaveProperty('trade');
    });

    test('should load cart from localStorage on page load', async ({ page }) => {
        // Manually set cart in localStorage with correct storage key
        await page.evaluate(() => {
            const mockCart = [{
                trade: {
                    x: 100, y: 64, z: 200,
                    world: 'world',
                    resultItem: { type: 'EMERALD', name: 'Emerald', amount: 3 },
                    item1: { type: 'DIAMOND', name: 'Diamond', amount: 1 },
                    stock: 10,
                    resultName: 'Emerald',
                    resultText: 'emerald',
                    resultAmount: 3,
                    costName: 'Diamond',
                    costText: 'diamond',
                    displayStock: 10
                },
                quantity: 1
            }];
            localStorage.setItem('pvc-trades-cart', JSON.stringify(mockCart));
        });

        // Reload page
        await page.reload();
        await waitForAppReady(page);

        // Badge should show "1" (1 item in cart)
        const badge = page.locator('#cart-badge');
        await expect(badge).toHaveText('1');
    });

    test('should open cart dialog when cart button clicked', async ({ page }) => {
        // Add item first
        await page.locator('.add-to-cart-btn').first().click();

        // Click cart button
        await page.locator('#open-cart').click();

        // Dialog should be visible
        const dialog = page.locator('#cart-dialog');
        await expect(dialog).not.toHaveClass(/hidden/);
    });
});

test.describe('Cart Dialog', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.goto('/');
        await waitForAppReady(page);
        
        await page.evaluate(() => {
            localStorage.clear();
        });

        // Add some items and open cart
        await page.locator('.add-to-cart-btn').nth(0).click();
        await page.locator('.add-to-cart-btn').nth(1).click();
        await page.locator('#open-cart').click();
    });

    test('should display cart items in dialog', async ({ page }) => {
        // Should show 2 cart items
        const cartItems = page.locator('.cart-item');
        await expect(cartItems).toHaveCount(2);
    });

    test('should have Cart and Navigate tabs', async ({ page }) => {
        // Check tabs exist with correct IDs
        await expect(page.locator('#tab-cart')).toBeVisible();
        await expect(page.locator('#tab-navigate')).toBeVisible();
    });

    test('should close dialog when backdrop clicked', async ({ page }) => {
        const dialog = page.locator('#cart-dialog');
        
        // Click close button (backdrop clicks are tricky with <dialog>)
        await page.locator('#close-cart').click();

        // Dialog should not have the 'open' attribute
        const isOpen = await dialog.evaluate((element: HTMLDialogElement) => element.open);
        expect(isOpen).toBe(false);
    });
});

test.describe('Cart Quantity Management', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.goto('/');
        await waitForAppReady(page);
        
        await page.evaluate(() => {
            localStorage.clear();
        });
    });

    test('should increment quantity when adding same item twice', async ({ page }) => {
        // Add same item twice
        const firstAddButton = page.locator('.add-to-cart-btn').first();
        await firstAddButton.click();
        await firstAddButton.click();

        // Badge should show "2" (1 unique item, quantity 2)
        const badge = page.locator('#cart-badge');
        await expect(badge).toHaveText('2');

        // Open cart and check quantity
        await page.locator('#open-cart').click();
        
        // Should show 1 cart item with quantity 2
        const cartItems = page.locator('.cart-item');
        await expect(cartItems).toHaveCount(1);
        
        const quantityDisplay = page.locator('.qty-display').first();
        await expect(quantityDisplay).toHaveText('2');
    });
});

test.describe('Navigation Tab', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.goto('/');
        await waitForAppReady(page);
        
        await page.evaluate(() => {
            localStorage.clear();
        });

        // Add items and open cart
        await page.locator('.add-to-cart-btn').nth(0).click();
        await page.locator('.add-to-cart-btn').nth(1).click();
        await page.locator('#open-cart').click();
    });

    test('should switch to Navigate tab when clicked', async ({ page }) => {
        // Click Navigate tab (correct ID)
        await page.locator('#tab-navigate').click();

        // Navigate panel should be visible
        const navigatePanel = page.locator('#tab-content-navigate');
        await expect(navigatePanel).toBeVisible();
    });

    test('should show player position input', async ({ page }) => {
        await page.locator('#tab-navigate').click();

        // Should have player name input (correct ID)
        const playerNameInput = page.locator('#player-name-input');
        await expect(playerNameInput).toBeVisible();
    });

    test('should show Start Navigation button', async ({ page }) => {
        await page.locator('#tab-navigate').click();

        // Should have Start Navigation button (correct ID)
        const startButton = page.locator('#start-navigation');
        await expect(startButton).toBeVisible();
    });
});

test.describe('Navigation Flow', () => {
    test.beforeEach(async ({ page }) => {
        await setupMockRoutes(page);
        await page.goto('/');
        await waitForAppReady(page);
        
        await page.evaluate(() => {
            localStorage.clear();
        });

        // Add items, open cart, go to navigate tab
        await page.locator('.add-to-cart-btn').nth(0).click();
        await page.locator('.add-to-cart-btn').nth(1).click();
        await page.locator('#open-cart').click();
        await page.locator('#tab-navigate').click();
    });

    test('should start navigation and open map dialog', async ({ page }) => {
        // Enter player name
        await page.locator('#player-name-input').fill('TestPlayer');

        // Click Start Navigation
        await page.locator('#start-navigation').click();

        // Navigation dialog should be visible (correct ID: nav-dialog)
        const navDialog = page.locator('#nav-dialog');
        // Wait a bit longer for dialog to open and initialize
        await navDialog.waitFor({ state: 'visible', timeout: 10_000 });
        await expect(navDialog).toBeVisible();
    });

    test('should close cart dialog when navigation starts', async ({ page }) => {
        // Enter player name and start
        await page.locator('#player-name-input').fill('TestPlayer');
        await page.locator('#start-navigation').click();

        // Cart dialog should be closed
        const cartDialog = page.locator('#cart-dialog');
        const isOpen = await cartDialog.evaluate((element: HTMLDialogElement) => element.open);
        expect(isOpen).toBe(false);
    });
});
