/**
 * Fast-probing helpers: the field menus (lenses, filters), scope pills,
 * exact-match queries, autocomplete, URL history, per-item prices and the
 * "+" key on result rows.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './helpers/global-setup';
import { mockConfigRoute } from './helpers/test-config';

const ROW = '.trade-row';
const WANT = '#searchWant';
const GIVE = '#searchGive';
const WANT_MENU = '#searchWant-suggestions';
const EMERALD_TYPE = 'EMERALD';

const pill = (id: string): string => `#scope-pills [data-pill="${id}"]`;

/**
 * Click a field and tick one of the filter rows in its menu.
 * @param page - Page
 * @param label - Filter row text
 */
async function turnOnInMenu(page: Page, label: string): Promise<void> {
    await page.locator(WANT).click();
    await page.locator(`${WANT_MENU} .search-suggestion-toggle`, { hasText: label }).click();
    await page.keyboard.press('Escape');
}

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
 * A shulker box of enchanted books that the seller named, for 8 diamonds.
 * @param name - Name the seller gave the box
 * @returns Raw recipe in data.json shape
 */
function bookBox(name: string) {
    return {
        resultItem: { type: 'SHULKER_BOX', name, amount: 1, lore: Array.from({ length: 27 }, () => '- 1x ENCHANTED_BOOK') },
        item1: { type: 'DIAMOND', name: '', amount: 8 },
        stock: 2,
    };
}

/**
 * A bundle of map art that the seller named
 * @param name - Name the seller gave the bundle
 * @param diamonds - Price in diamonds
 * @returns Raw recipe in data.json shape
 */
function artBundle(name: string, diamonds: number) {
    return { resultItem: { type: 'BUNDLE', name, amount: 1 }, item1: { type: 'DIAMOND', name: '', amount: diamonds }, stock: 1 };
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

test.describe('Trade filters', () => {
    test.beforeEach(async ({ page }) => { await openApp(page); });

    test('deals only keeps trades at least 75% below market', async ({ page }) => {
        // Beef from four independent shops: 1, 4, 8 and 8 emeralds (median 6)
        await openApp(page, '', {
            data: [1, 4, 8, 8].map((price, index) => ({
                location: `${index * 1000}.0, 64.0, 0.0`, world: 'world', shopOwner: `Owner${index}`,
                recipes: [recipe('COOKED_BEEF', 1, EMERALD_TYPE, price)],
            })),
        });
        await turnOnInMenu(page, 'Deals');
        await expect(page.locator(ROW)).toHaveCount(1);
        await expect(page.locator(`${ROW} .dev`)).toHaveText(['−83%']);
        await expect(page).toHaveURL(/[?&]filters=deals/);

        await page.keyboard.press('Alt+Digit1');
        await expect(page.locator(ROW)).toHaveCount(4);
        await expect(page.locator('#scope-pills')).toBeHidden();
    });

    test('best per item keeps only the cheapest offer for each item', async ({ page }) => {
        await page.keyboard.press('Alt+Digit2');
        await expect(page.locator(pill('filter-best'))).toContainText('Best per item');
        const names = await resultNames(page);
        expect(names).toHaveLength(4);
        expect(new Set(names).size).toBe(4);
        const beefRow = page.locator(ROW).filter({ hasText: 'Cooked beef' });
        await expect(beefRow.locator('.dev')).toHaveText('−33%');
    });

    test('the Paying menu only offers categories, straight away', async ({ page }) => {
        await page.locator(GIVE).click();
        const menu = page.locator('#searchGive-suggestions');
        await expect(menu.locator('.search-suggestion-action')).toHaveCount(13);
        await expect(menu.locator('.search-suggestion-toggle, .search-suggestion-submenu')).toHaveCount(0);

        await menu.locator('.search-suggestion-action', { hasText: 'Ores & Minerals' }).click();
        await expect(page.locator(pill('lens-pay'))).toContainText('paying with Ores & Minerals');
    });

    test('on a phone both menus span the whole search card', async ({ page }) => {
        await page.setViewportSize({ width: 412, height: 800 });
        const card = await page.locator('.search-box').boundingBox();
        for (const [field, menu] of [[WANT, WANT_MENU], [GIVE, '#searchGive-suggestions']] as const) {
            await page.locator(field).click();
            const box = await page.locator(menu).boundingBox();
            expect(box?.x).toBeCloseTo(card?.x ?? Number.NaN, 0);
            expect(box?.width).toBeCloseTo(card?.width ?? Number.NaN, 0);
            await page.keyboard.press('Escape');
        }
    });

    test('on a phone the open menu stays above the on-screen keyboard', async ({ page }) => {
        await page.setViewportSize({ width: 412, height: 800 });
        // The keyboard only shrinks the visual viewport: stand in for it
        await page.addInitScript(() => {
            const viewport = Object.assign(new EventTarget(), { height: innerHeight, offsetTop: 0 });
            Object.defineProperty(globalThis, 'visualViewport', { value: viewport });
            Object.assign(globalThis, {
                showKeyboard: (height: number) => {
                    viewport.height = innerHeight - height;
                    viewport.dispatchEvent(new Event('resize'));
                },
            });
        });
        await openApp(page);

        await page.locator(WANT).click();
        await page.evaluate(() => { (globalThis as unknown as { showKeyboard: (height: number) => void }).showKeyboard(400); });
        const menu = await page.locator(WANT_MENU).boundingBox();
        expect((menu?.y ?? 0) + (menu?.height ?? 0)).toBeLessThanOrEqual(400);
    });

    for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 740 }]) {
        test(`clicking outside an open menu only closes it (${viewport.width}px)`, async ({ page }) => {
            await page.setViewportSize(viewport);
            // Enough rows that some lie below the open menu
            const sandShop = { location: '3000.0, 64.0, 0.0', world: 'world', recipes: Array.from({ length: 30 }, (_, index) => recipe('SAND', index + 1, EMERALD_TYPE, 1)) };
            await openApp(page, '', { data: [...SHOP_DATA.data, sandShop] });

            await page.locator(WANT).click();
            await expect(page.locator(WANT_MENU)).toBeVisible();
            const row = await page.evaluate((menuSelector) => {
                const menuBottom = document.querySelector(menuSelector)?.getBoundingClientRect().bottom ?? 0;
                const box = [...document.querySelectorAll('.trade-row')]
                    .map(element => element.getBoundingClientRect())
                    .find(rect => rect.top > menuBottom && rect.bottom < innerHeight);
                return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            }, WANT_MENU);
            expect(row).toBeTruthy();
            await page.mouse.click(row!.x, row!.y);

            await expect(page.locator(WANT_MENU)).toBeHidden();
            await expect(page.locator(WANT)).not.toBeFocused();
            await expect(page.locator('dialog[open]')).toHaveCount(0);
            await expect(page.locator('.search-menu-backdrop')).toBeHidden();
        });
    }
});

test.describe('Lenses', () => {
    test.beforeEach(async ({ page }) => { await openApp(page); });

    test('clicking Buying opens on its categories; one is picked in place and a filter can follow', async ({ page }) => {
        await page.locator(WANT).click();
        await expect(page.locator(`${WANT_MENU} .search-suggestion-heading`).first()).toHaveText('Categories');
        const category = (name: string) => page.locator(`${WANT_MENU} .search-suggestion-action`, { hasText: name });
        await category('Food').click();

        await expect(page.locator(ROW)).toHaveCount(4);
        expect(new Set(await resultNames(page))).toEqual(new Set(['Cooked beef']));
        await expect(page.locator(pill('lens-buy'))).toContainText('buying Food');
        await expect(page).toHaveURL(/[?&]lens=food/);

        // The menu stays open, so a filter can be ticked next; the counts follow it
        await expect(category('Food')).toHaveClass(/is-current/);
        await expect(category('Food')).toContainText('4');
        await page.locator(`${WANT_MENU} .search-suggestion-toggle`, { hasText: 'Best per item' }).click();
        await expect(page.locator(ROW)).toHaveCount(1);
        await expect(category('Food')).toContainText('1');
        await category('Ores & Minerals').click();
        await expect(category('Food')).not.toHaveClass(/is-current/);
        await expect(page.locator(pill('lens-buy'))).toContainText('buying Ores & Minerals');
        await expect(page.locator(ROW)).toHaveCount(1);

        await category('Ores & Minerals').click();
        await expect(page.locator(pill('lens-buy'))).toHaveCount(0);
        await expect(page.locator(WANT_MENU)).toBeVisible();
    });

    test('while typing the menu stays, its counts follow the search, and a pick keeps the text', async ({ page }) => {
        const category = (name: string) => page.locator(`${WANT_MENU} .search-suggestion-action`, { hasText: name });
        await page.locator(WANT).click();
        await expect(category('Food')).toContainText('4');

        await page.locator(WANT).fill('iron');
        await expect(page.locator(`${WANT_MENU} [role="option"]`).first()).toHaveText('Iron ingot');
        await expect(category('Ores & Minerals')).toContainText('1');
        await expect(category('Food')).toHaveClass(/is-empty/);

        await category('Ores & Minerals').click();
        await page.locator(`${WANT_MENU} .search-suggestion-toggle`, { hasText: 'Best per item' }).click();
        await expect(page.locator(WANT)).toHaveValue('iron');
        await expect(category('Ores & Minerals')).toHaveClass(/is-current/);
        await expect(page.locator(`${WANT_MENU} .search-suggestion-toggle`, { hasText: 'Best per item' })).toHaveClass(/is-current/);
        expect(await resultNames(page)).toEqual(['Iron ingot']);
    });

    test('Backspace in an empty Buying field removes the last pill', async ({ page }) => {
        await openApp(page, '?lens=food&filters=best');
        const pills = page.locator('#scope-pills .scope-pill');
        await expect(pills).toHaveCount(2);

        await page.locator(WANT).focus();
        await page.keyboard.press('Backspace');
        await expect(pills).toHaveCount(1);
        await expect(page.locator(pill('lens-buy'))).toBeVisible();
        await page.keyboard.press('Backspace');
        await expect(pills).toHaveCount(0);
        await expect(page.locator(ROW)).toHaveCount(7);
    });

    test('swap moves the lens to Paying; the empty-results hint removes it', async ({ page }) => {
        await openApp(page, '?lens=food');
        await expect(page.locator(ROW)).toHaveCount(4);

        await page.locator('#swap-search').click();
        await expect(page).toHaveURL(/[?&]paylens=food/);
        await expect(page.locator(pill('lens-pay'))).toContainText('paying with Food');
        await expect(page.locator('.no-results-hint')).toContainText('7 matching trades outside Food');

        await page.locator('.no-results-action').click();
        await expect(page.locator(ROW)).toHaveCount(7);
        await expect(page.locator('#scope-pills')).toBeHidden();
    });

    test('a menu over a search keeps it: Esc closes the menu, and a submenu filters only what is typed after it', async ({ page }) => {
        const owners = ['Alice', 'Bob', 'Carol'];
        await openApp(page, '', { data: SHOP_DATA.data.map((shop, index) => ({ ...shop, shopOwner: owners[index] })) });
        await page.locator(WANT).fill('Cooked beef');
        // Come back to a search later: the click opens the menu over it
        await page.locator(WANT).blur();
        await page.locator(WANT).click();
        await expect(page.locator(WANT_MENU)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator(WANT_MENU)).toBeHidden();
        await expect(page.locator(WANT)).toHaveValue('Cooked beef');

        await page.locator(WANT).click();
        await page.locator(`${WANT_MENU} .search-suggestion-submenu`, { hasText: 'Shops & owners' }).click();
        await page.keyboard.type('bo');
        const shops = page.locator(`${WANT_MENU} .search-suggestion-action`);
        await expect(shops).toHaveText([/Bob/]);
        await shops.first().click();

        await expect(page.locator(WANT)).toHaveValue('Cooked beef');
        await expect(page.locator(pill('shop'))).toBeVisible();
        await expect(page.locator(ROW)).toHaveCount(2);
    });

    test('removing a pill moves focus to the next pill, then back to the field', async ({ page }) => {
        await openApp(page, '?lens=food&filters=best');
        await page.locator(`${pill('lens-buy')} .scope-pill-clear`).click();
        const bestClear = page.locator(`${pill('filter-best')} .scope-pill-clear`);
        await expect(bestClear).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page.locator(WANT)).toBeFocused();
    });
});

test.describe('Field menu on a touch screen', () => {
    test.use({ hasTouch: true, viewport: { width: 412, height: 800 } });
    test.beforeEach(async ({ page }) => { await openApp(page); });

    test('the first touch in the menu hides the keyboard and keeps the menu open', async ({ page }) => {
        await page.locator(WANT).tap();
        await expect(page.locator(WANT_MENU)).toBeVisible();
        await expect(page.locator(WANT)).toBeFocused();

        const food = page.locator(`${WANT_MENU} .search-suggestion-action`, { hasText: 'Food' });
        await food.tap();
        // Leaving the field is what hides a phone's keyboard
        await expect(page.locator(WANT)).not.toBeFocused();
        await expect(page.locator(WANT_MENU)).toBeVisible();
        await expect(food).toHaveClass(/is-current/);
        await page.locator(`${WANT_MENU} .search-suggestion-toggle`, { hasText: 'Best per item' }).tap();
        await expect(page.locator(ROW)).toHaveCount(1);

        // Tapping the field again types; tapping the other field opens its menu instead
        await page.locator(WANT).tap();
        await expect(page.locator(WANT)).toBeFocused();
        await expect(page.locator(WANT_MENU)).toBeVisible();
        await food.tap();
        await page.locator(GIVE).tap();
        await expect(page.locator(WANT_MENU)).toBeHidden();
        await expect(page.locator('#searchGive-suggestions')).toBeVisible();
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
        await expect(page.locator(pill('filter-shulkers'))).toBeVisible();
        await expect(page.locator(ROW)).toHaveCount(1);
        await expect(page.locator(`${ROW} .result-amt`)).toHaveText('1728');
    });

    test('without a search it lists every trade with a filled shulker box on either side', async ({ page }) => {
        await turnOnInMenu(page, 'Shulker boxes');
        await expect(page.locator(ROW)).toHaveCount(2);
        const names = await resultNames(page);
        expect(names.toSorted((a, b) => a.localeCompare(b))).toEqual(['Diamond', 'Sand']);
    });
});

test.describe('Seller-named shulker boxes', () => {
    test('show the seller name next to the item and can be searched by it', async ({ page }) => {
        await openApp(page, '', {
            data: [{ location: '0.0, 64.0, 0.0', world: 'world', recipes: [bookBox('mending'), bookBox('silk touch')] }],
        });
        await expect(page.locator(`${ROW} .item-label`)).toHaveCount(2);
        const labels = await page.locator(`${ROW} .item-label`).allInnerTexts();
        expect(labels.toSorted((a, b) => a.localeCompare(b))).toEqual(['“mending”', '“silk touch”']);

        await page.locator(WANT).fill('mending');
        await expect(page.locator(ROW)).toHaveCount(1);
        await expect(page.locator(`${ROW} .item-label mark`)).toHaveText('mending');
    });

    test('each named box opens its own details', async ({ page }) => {
        await openApp(page, '', {
            data: [{ location: '0.0, 64.0, 0.0', world: 'world', recipes: [bookBox('mending'), bookBox('silk touch'), bookBox('sweeping edge iii')] }],
        });
        const silkRow = page.locator(ROW).filter({ has: page.locator('.item-label', { hasText: 'silk touch' }) });
        await silkRow.locator('.result-name .info-icon').click();
        await expect(page.locator('#trade-details-content .trade-detail-name')).toHaveText('Silk touch');
    });
});

test.describe('Seller-named bundles', () => {
    test('show as a bundle with the seller name, and without a Deal %', async ({ page }) => {
        await openApp(page, '', {
            data: [0, 1, 2].map(index => ({
                location: `${index * 1000}.0, 64.0, 0.0`, world: 'world', shopOwner: `Artist${index}`,
                recipes: [artBundle(index === 0 ? 'Coca-Cola' : `Art ${index}`, 4 + index)],
            })),
        });
        const cocaCola = page.locator(ROW).filter({ has: page.locator('.item-label', { hasText: 'Coca-Cola' }) });
        await expect(cocaCola.locator('.result-name .name-text')).toHaveText('Bundle');
        await expect(cocaCola.locator('.dev')).toHaveText('—');

        await page.locator(WANT).fill('coca');
        await expect(page.locator(ROW)).toHaveCount(1);
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

    test('Shift+Tab in Paying goes straight back to Buying', async ({ page }) => {
        await page.locator(GIVE).focus();
        await page.keyboard.press('Shift+Tab');
        await expect(page.locator(WANT)).toBeFocused();
    });

    test('Escape closes suggestions and clears the field', async ({ page }) => {
        await page.locator(WANT).fill('be');
        await expect(page.locator('#searchWant-suggestions')).toBeVisible();
        await page.keyboard.press('Escape');

        await expect(page.locator('#searchWant-suggestions')).toBeHidden();
        await expect(page.locator(WANT)).toHaveValue('');
    });

    test('with no item name to complete, arrow down still moves into the results', async ({ page }) => {
        await page.locator(WANT).fill('Sand');
        await expect(page.locator('#searchWant-suggestions .search-suggestion-heading').first()).toHaveText('Categories');
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
