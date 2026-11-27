/**
 * Step definitions for the shop/owner filter, shop info on the map and the flip finder
 */
import { expect } from '@playwright/test';

import { SHOPS_OR_DATA_ROUTE_REGEX } from '../../tests/helpers/endpoints';
import { setupColoredTileMocks, setupMultiWorldDataMock } from '../../tests/helpers/navigation-mocks';
import { mockConfigRoute } from '../../tests/helpers/test-config';
import { Given, Then, When } from './fixtures';

const SELECTOR_TRADE_ROW = '.trade-row';
const SELECTOR_SHOP_PILL = '#scope-pills [data-pill="shop"]';

/** Ann sells iron cheaply at the Iron Mine; Ben's Smithy pays double. Ann's own outlet must not count. */
const FLIP_SHOP_DATA = {
    data: [
        {
            shopName: 'Iron Mine',
            shopOwner: 'Ann',
            location: '0.0, 64.0, 0.0',
            world: 'World',
            recipes: [{ resultItem: { type: 'IRON_INGOT', name: '', amount: 16 }, item1: { type: 'EMERALD', name: '', amount: 1 }, stock: 10 }]
        },
        {
            shopName: 'Smithy',
            shopOwner: 'Ben',
            location: '300.0, 64.0, 0.0',
            world: 'World',
            recipes: [{ resultItem: { type: 'EMERALD', name: '', amount: 1 }, item1: { type: 'IRON_INGOT', name: '', amount: 8 }, stock: 20 }]
        },
        {
            shopName: 'Ann Outlet',
            shopOwner: 'Ann',
            location: '600.0, 64.0, 0.0',
            world: 'World',
            recipes: [{ resultItem: { type: 'EMERALD', name: '', amount: 1 }, item1: { type: 'IRON_INGOT', name: '', amount: 4 }, stock: 20 }]
        }
    ]
};

// ============================================================================
// GIVEN Steps
// ============================================================================

Given('the app is opened at {string} with mock shop data', async ({ page }, query: string) => {
    await setupColoredTileMocks(page);
    await setupMultiWorldDataMock(page);
    await page.goto(`./${query}`);
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
});

Given('the app is loaded with a profitable flip between two players', async ({ page }) => {
    await setupColoredTileMocks(page);
    await mockConfigRoute(page);
    await page.route(SHOPS_OR_DATA_ROUTE_REGEX, async route => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FLIP_SHOP_DATA) });
    });
    await page.goto('./');
    await page.waitForSelector(SELECTOR_TRADE_ROW, { state: 'visible', timeout: 5000 });
});

// ============================================================================
// Shop filter
// ============================================================================

When('I type {string} in the want field', async ({ page }, text: string) => {
    await page.locator('#searchWant').fill(text);
});

Then('I should see a shop suggestion {string} with {string}', async ({ page }, name: string, detail: string) => {
    const option = page.locator('#searchWant-suggestions .search-suggestion-action', { hasText: name });
    await expect(option).toBeVisible();
    await expect(option).toContainText(detail);
});

When('I choose the shop suggestion {string}', async ({ page }, name: string) => {
    await page.locator('#searchWant-suggestions .search-suggestion-action', { hasText: name }).click();
});

Then('the shop filter should show {string}', async ({ page }, label: string) => {
    await expect(page.locator(`${SELECTOR_SHOP_PILL} .scope-pill-label`)).toHaveText(label);
});

Then('the shop filter should be hidden', async ({ page }) => {
    await expect(page.locator(SELECTOR_SHOP_PILL)).toHaveCount(0);
});

When('I remove the shop filter', async ({ page }) => {
    await page.locator(`${SELECTOR_SHOP_PILL} .scope-pill-clear`).click();
});

Then('{int} trade(s) should be displayed', async ({ page }, count: number) => {
    await expect(page.locator(SELECTOR_TRADE_ROW)).toHaveCount(count);
});

Then('more than {int} trade(s) should be displayed', async ({ page }, count: number) => {
    await expect.poll(() => page.locator(SELECTOR_TRADE_ROW).count()).toBeGreaterThan(count);
});

Then('the address should contain {string}', async ({ page }, text: string) => {
    await expect.poll(() => page.url()).toContain(text);
});

Then('the address should not contain {string}', async ({ page }, text: string) => {
    await expect.poll(() => page.url()).not.toContain(text);
});

// ============================================================================
// Shop info on the map
// ============================================================================

When('I open the map for the {string} trade', async ({ page }, item: string) => {
    await page.locator(SELECTOR_TRADE_ROW, { hasText: item }).first().locator('.distance').click();
});

Then('the map should show the shop {string} by {string}', async ({ page }, shop: string, owner: string) => {
    const info = page.locator('#map-shop-info');
    await expect(info.locator('.map-shop-name')).toHaveText(shop);
    await expect(info.locator('.map-shop-owner')).toHaveText(`by ${owner}`);
});

When('I click the map\'s {string} button', async ({ page }, label: string) => {
    await page.locator('#map-shop-info .map-shop-trades-btn', { hasText: label }).click();
});

When('I click the shop {string} on the map', async ({ page }, shop: string) => {
    // Shop dots are drawn on a canvas, so click the dot through the map that the app exposes for tests
    await expect.poll(() => page.evaluate(() => Boolean((globalThis as unknown as { __leafletMap?: unknown }).__leafletMap))).toBe(true);
    const clicked = await page.evaluate((name) => {
        interface Dot { getTooltip?: () => { getContent: () => unknown } | undefined; fire: (type: string) => void }
        const map = (globalThis as unknown as { __leafletMap: { eachLayer: (callback: (layer: Dot) => void) => void } }).__leafletMap;
        let target: Dot | undefined;
        map.eachLayer(layer => {
            // The tooltip content is a function that renders the label element on demand
            const tooltipContent = layer.getTooltip?.()?.getContent();
            const content: unknown = typeof tooltipContent === 'function' ? tooltipContent(layer) : tooltipContent;
            if (content instanceof HTMLElement && content.querySelector('strong')?.textContent === name) { target = layer; }
        });
        target?.fire('click');
        return target !== undefined;
    }, shop);
    expect(clicked).toBe(true);
});

Then('the map coordinates should read {string}', async ({ page }, text: string) => {
    await expect(page.locator('#map-coords')).toHaveText(text);
});

// ============================================================================
// Flip finder
// ============================================================================

When('I open the Flips tab of the exchange rates dialog', async ({ page }) => {
    await page.locator('#open-matrix').click();
    await page.locator('.matrix-tab[data-tab="flips"]').click();
});

Then('I should see {int} flip(s)', async ({ page }, count: number) => {
    await expect(page.locator('.flip-card')).toHaveCount(count);
});

Then('the flip should be for {string} with a profit of {string}', async ({ page }, item: string, profit: string) => {
    const card = page.locator('.flip-card').first();
    await expect(card.locator('.flip-item')).toHaveText(item);
    await expect(card.locator('.flip-profit')).toHaveText(profit);
});

Then('the flip should buy at {string} {int} times and sell at {string} {int} times', async ({ page }, buyShop: string, buyUses: number, sellShop: string, sellUses: number) => {
    const legs = page.locator('.flip-card').first().locator('.flip-leg');
    await expect(legs.nth(0)).toContainText('Buy');
    await expect(legs.nth(0).locator('.flip-shop')).toContainText(buyShop);
    await expect(legs.nth(0).locator('.flip-leg-uses')).toHaveText(`×${buyUses}`);
    await expect(legs.nth(1)).toContainText('Sell');
    await expect(legs.nth(1).locator('.flip-shop')).toContainText(sellShop);
    await expect(legs.nth(1).locator('.flip-leg-uses')).toHaveText(`×${sellUses}`);
});

When('I add the flip to the cart', async ({ page }) => {
    const button = page.locator('.flip-card').first().locator('.flip-add');
    await button.click();
    await expect(button).toHaveText('✓ In cart');
});

Then('the cart badge should show {int}', async ({ page }, count: number) => {
    await expect(page.locator('#cart-badge')).toHaveText(String(count));
});

Then('the cart should list the shops {string} and {string}', async ({ page }, first: string, second: string) => {
    await page.keyboard.press('Escape');
    await page.locator('#open-cart').click();
    const shops = page.locator('#cart-items .cart-item-shop');
    await expect(shops).toHaveCount(2);
    await expect(shops.filter({ hasText: first })).toHaveCount(1);
    await expect(shops.filter({ hasText: second })).toHaveCount(1);
});
