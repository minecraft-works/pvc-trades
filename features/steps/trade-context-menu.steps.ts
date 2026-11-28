/**
 * Step definitions for the trade row context menu
 */
import { expect, type Page } from '@playwright/test';

import { Then, When } from './fixtures';

const FIRST_ROW = '.trade-row:not(.no-results)';
const MENU = '.context-menu';

/**
 * Read what the page last copied.
 * @param page - Page to read the clipboard of
 * @returns Clipboard text
 */
function readClipboard(page: Page): Promise<string> {
    return page.evaluate(() => navigator.clipboard.readText());
}

/**
 * Escape text for use inside a regular expression.
 * @param text - Literal text
 * @returns Text matching itself
 */
function escapeRegex(text: string): string {
    return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

When('I right-click the first trade', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator(FIRST_ROW).first().click({ button: 'right' });
    await expect(page.locator(MENU)).toBeVisible();
});

When('I long-press the first trade', async ({ page }) => {
    const row = page.locator(FIRST_ROW).first();
    const box = await row.boundingBox();
    if (!box) { throw new Error('First trade row has no box'); }
    const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
    const touch = { ...point, pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true };
    await row.dispatchEvent('pointerdown', touch);
    await expect(page.locator(MENU)).toBeVisible();
    // Lifting the finger ends with a click, as on a real device
    await row.dispatchEvent('pointerup', touch);
    await row.dispatchEvent('click', point);
});

When('I choose {string} from the context menu', async ({ page }, label: string) => {
    await page.locator(MENU).getByRole('menuitem', { name: label }).click();
});

Then('the clipboard should hold the coordinates of the first trade', async ({ page }) => {
    const row = page.locator(FIRST_ROW).first();
    const [x, y, z] = await row.evaluate(element => [element.dataset.x, element.dataset.y, element.dataset.z]);
    await expect.poll(() => readClipboard(page)).toBe(`${x} ${y} ${z}`);
});

Then('the clipboard should hold a sentence with the item, the cost and the coordinates of the first trade', async ({ page }) => {
    const row = page.locator(FIRST_ROW).first();
    const [x, y, z] = await row.evaluate(element => [element.dataset.x, element.dataset.y, element.dataset.z]);
    const itemText = await row.locator('.result-name .name-text').innerText();
    const costText = await row.locator('.cost-name .name-text').innerText();
    const item = escapeRegex(itemText.trim());
    const cost = escapeRegex(costText.trim());
    await expect.poll(() => readClipboard(page)).toMatch(
        new RegExp(String.raw`(sells|Selling) \d+ ${item} for \d+ ${cost}.* at ${x}, ${y}, ${z}`)
    );
});

Then('the context menu should be visible', async ({ page }) => {
    await expect(page.locator(MENU)).toBeVisible();
});

Then('the context menu should be closed', async ({ page }) => {
    await expect(page.locator(MENU)).toBeHidden();
});
