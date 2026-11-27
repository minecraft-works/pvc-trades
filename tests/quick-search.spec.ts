/**
 * Fast-probing helpers: quick bar (deals only, best per item), exact-match
 * queries, autocomplete, URL history, per-item prices and the "+" key on
 * result rows.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './helpers/global-setup';
import { mockConfigRoute } from './helpers/test-config';

const ROW = '.trade-row';
const WANT = '#searchWant';
const GIVE = '#searchGive';
const EMERALD_TYPE = 'EMERALD';

function recipe(resultType: string, resultAmount: number, costType: string, costAmount: number, stock = 5) {
    return {
        resultItem: { type: resultType, name: '', amount: resultAmount },
        item1: { type: costType, name: '', amount: costAmount },
        stock,
    };
}

/**
 * 3 diamonds for one shulker box with 27 stacks of `content`.
 * @param content - Item name filling the shulker box
 * @returns Raw recipe in data.json shape
 */
function diamondsForShulkerOf(content: string) {
    return {
        resultItem: { type: 'DIAMOND', name: '', amount: 3 },
        item1: { type: 'SHULKER_BOX', name: '', amount: 1, lore: Array.from({ length: 27 }, () => `- 64x ${content}`) },
        stock: 41,
    };
}

/**
 * Three shops far apart. Cooked beef for emeralds is sold at 2, 4 and 3
 * emeralds, so the median is 3 and the cheapest offer is −33%.
 */
const SHOP_DATA = {
    data: [
        {
            location: '0.0, 64.0, 0.0', world: 'world', recipes: [
                recipe('COOKED_BEEF', 1, EMERALD_TYPE, 2),
                recipe('DIAMOND', 1, 'EMERALD_BLOCK', 10),
                recipe('SAND', 16, EMERALD_TYPE, 1),
            ],
        },
        {
            location: '1000.0, 64.0, 0.0', world: 'world', recipes: [
                recipe('COOKED_BEEF', 1, EMERALD_TYPE, 4),
                recipe('COOKED_BEEF', 1, 'DIAMOND', 1, 3),
            ],
        },
        {
            location: '2000.0, 64.0, 0.0', world: 'world', recipes: [
                recipe('COOKED_BEEF', 1, EMERALD_TYPE, 3),
                recipe('IRON_INGOT', 1, 'EMERALD_BLOCK', 1),
            ],
        },
    ],
};

async function openApp(page: Page, query = '', data: unknown = SHOP_DATA): Promise<void> {
    await mockConfigRoute(page);
    await page.route('**/data.json', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
    }));
    await page.goto(`./${query}`);
    await page.waitForSelector(ROW, { state: 'visible', timeout: 10_000 });
}

async function resultNames(page: Page): Promise<string[]> {
    const names = await page.locator(`${ROW} .result-name`).allTextContents();
    return names.map(name => name.replace('ℹ', '').trim());
}

test.describe('Quick bar', () => {
    test.beforeEach(async ({ page }) => { await openApp(page); });

    test('deals only keeps trades at least 20% below market', async ({ page }) => {
        await page.locator('#deals-only-toggle').click();
        await expect(page.locator(ROW)).toHaveCount(1);
        await expect(page.locator(`${ROW} .dev`)).toHaveText(['−33%']);

        await page.keyboard.press('Alt+Digit1');
        await expect(page.locator(ROW)).toHaveCount(7);
    });

    test('best per item keeps only the cheapest offer for each item', async ({ page }) => {
        await page.keyboard.press('Alt+Digit2');
        await expect(page.locator('#best-per-item-toggle')).toHaveAttribute('aria-pressed', 'true');
        const names = await resultNames(page);
        expect(names).toHaveLength(4);
        expect(new Set(names).size).toBe(4);
        const beefRow = page.locator(ROW).filter({ hasText: 'Cooked beef' });
        await expect(beefRow.locator('.dev')).toHaveText('−33%');
    });
});

test.describe('Shulkers only', () => {
    const SHULKER_DATA = {
        data: [{
            location: '0.0, 64.0, 0.0', world: 'world', recipes: [
                recipe('SAND', 16, EMERALD_TYPE, 1),
                {
                    resultItem: { type: 'SHULKER_BOX', name: '', amount: 1, lore: Array.from({ length: 27 }, () => '- 64x SAND') },
                    item1: { type: 'EMERALD_BLOCK', name: '', amount: 5 },
                    stock: 2,
                },
                diamondsForShulkerOf('Cobblestone'),
                recipe('COOKED_BEEF', 1, EMERALD_TYPE, 2),
            ],
        }],
    };

    test.beforeEach(async ({ page }) => { await openApp(page, '', SHULKER_DATA); });

    test('a Buying search keeps only filled shulker boxes of that item', async ({ page }) => {
        await page.locator(WANT).fill('sand');
        await expect(page.locator(ROW)).toHaveCount(2);

        await page.keyboard.press('Alt+Digit3');
        await expect(page.locator('#shulkers-only-toggle')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator(ROW)).toHaveCount(1);
        await expect(page.locator(`${ROW} .result-amt`)).toHaveText('1728');
    });

    test('without a search it lists every trade with a filled shulker box on either side', async ({ page }) => {
        await page.locator('#shulkers-only-toggle').click();
        await expect(page.locator(ROW)).toHaveCount(2);
        const names = await resultNames(page);
        expect(names.toSorted((a, b) => a.localeCompare(b))).toEqual(['Diamond', 'Sand']);
    });
});

test.describe('Autocomplete', () => {
    test.beforeEach(async ({ page }) => { await openApp(page); });

    test('suggests item names and Enter accepts the highlighted one', async ({ page }) => {
        await page.locator(WANT).fill('be');
        const options = page.locator('#searchWant-suggestions [role="option"]');
        await expect(options.first()).toHaveText('Cooked beef');
        await expect(page.locator(WANT)).toHaveAttribute('aria-expanded', 'true');

        await page.keyboard.press('ArrowDown');
        await expect(options.first()).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('Enter');

        await expect(page.locator(WANT)).toHaveValue('Cooked beef');
        await expect(page.locator('#searchWant-suggestions')).toBeHidden();
        await expect(page.locator(ROW)).toHaveCount(4);
    });

    test('Tab accepts the highlighted suggestion and moves to Paying', async ({ page }) => {
        await page.locator(WANT).fill('san');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Tab');

        await expect(page.locator(WANT)).toHaveValue('Sand');
        await expect(page.locator(GIVE)).toBeFocused();
    });

    test('Escape closes suggestions and clears the field', async ({ page }) => {
        await page.locator(WANT).fill('be');
        await expect(page.locator('#searchWant-suggestions')).toBeVisible();
        await page.keyboard.press('Escape');

        await expect(page.locator('#searchWant-suggestions')).toBeHidden();
        await expect(page.locator(WANT)).toHaveValue('');
    });

    test('without suggestions, arrow down still moves into the results', async ({ page }) => {
        await page.locator(WANT).fill('Sand');
        await expect(page.locator('#searchWant-suggestions')).toBeHidden();
        await page.keyboard.press('ArrowDown');
        await expect(page.locator(ROW).first()).toBeFocused();
    });
});

test.describe('URL search history', () => {
    test('search terms are restored from the URL', async ({ page }) => {
        await openApp(page, '?buy=beef&pay=%22diamond%22');
        await expect(page.locator(WANT)).toHaveValue('beef');
        await expect(page.locator(GIVE)).toHaveValue('"diamond"');
        await expect(page.locator(ROW)).toHaveCount(1);
    });

    test('searching updates the URL and Back returns to the previous probe', async ({ page }) => {
        await openApp(page);
        await page.locator(WANT).fill('sand');
        await expect(page).toHaveURL(/[?&]buy=sand/);

        // Let the probe settle into its own history entry, then start the next one
        await page.waitForTimeout(1000);
        await page.locator(WANT).fill('iron');
        await expect(page).toHaveURL(/[?&]buy=iron/);

        await page.goBack();
        await expect(page.locator(WANT)).toHaveValue('sand');
        await expect(page.locator(ROW)).toHaveCount(1);
    });
});

test.describe('Result rows', () => {
    test.beforeEach(async ({ page }) => { await openApp(page); });

    test('shows a per-item price when several items are received', async ({ page }) => {
        const sandRow = page.locator(ROW).filter({ hasText: 'Sand' });
        await expect(sandRow.locator('.unit-price')).toHaveText('16 for 1');
        const beefRow = page.locator(ROW).filter({ hasText: 'Cooked beef' }).first();
        await expect(beefRow.locator('.unit-price')).toHaveCount(0);
    });

    test('pressing + on a focused row adds it to the cart', async ({ page }) => {
        await page.locator(ROW).first().focus();
        await page.keyboard.press('+');
        await expect(page.locator('#cart-badge')).toHaveText('1');
        await expect(page.locator(`${ROW} .add-to-cart-btn.in-cart`)).toHaveCount(1);
    });

    test('highlighting part of a name keeps the spaces around it', async ({ page }) => {
        await page.locator(WANT).fill('beef');
        const name = page.locator(`${ROW} .result-name .name-text`).first();
        await expect(name.locator('mark')).toHaveText('beef');
        // innerText reflects rendering: flex layout used to drop the space before <mark>
        expect(await name.innerText()).toBe('Cooked beef');
    });
});

test.describe('Shulker box costs', () => {
    const SHULKER_SHOP = {
        data: [{ location: '-87.0, 68.0, 90.0', world: 'world', recipes: [diamondsForShulkerOf('COBBLESTONE'), diamondsForShulkerOf('STONE')] }],
    };

    test.beforeEach(async ({ page }) => { await openApp(page, '', SHULKER_SHOP); });

    test('trades for different shulker contents are told apart', async ({ page }) => {
        const costs = await page.locator(`${ROW} .cost-name .name-text`).allTextContents();
        expect(costs.toSorted((a, b) => a.localeCompare(b))).toEqual(['Cobblestone', 'Stone']);
        await expect(page.locator(`${ROW} .cost-amt`)).toHaveText(['1728', '1728']);

        const keys = await page.locator(ROW).evaluateAll(rows => rows.map(row => (row as HTMLElement).dataset.tradeKey));
        expect(new Set(keys).size).toBe(2);
    });

    test('each row opens the details of its own shulker', async ({ page }) => {
        const stoneRow = page.locator(ROW).filter({ has: page.locator('.cost-name .name-text', { hasText: /^Stone$/ }) });
        await stoneRow.locator('.cost-name .info-icon').click();

        const details = page.locator('#trade-details-content');
        await expect(details.locator('.trade-detail-contents')).toHaveText('Contains 1728× Stone');
        await expect(details.locator('.trade-detail-lore-line')).toHaveText(['- 64x STONE ×27']);
    });

    test('Paying search finds shulker contents', async ({ page }) => {
        await page.locator(GIVE).fill('cobble');
        await expect(page.locator(ROW)).toHaveCount(1);
        await expect(page.locator(`${ROW} .cost-name .name-text`)).toHaveText('Cobblestone');
    });
});
