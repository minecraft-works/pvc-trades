import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../support/world';
import {
    createPlayerMock,
    setupPlayerApiMock,
    setupColoredTileMocks,
    setupMultiWorldDataMock
} from '../../tests/helpers/navigation-mocks';
import { BASE_URL } from '../support/hooks';

// ============ GIVEN Steps ============

Given('the app is loaded with shops in overworld and nether', async function (this: CustomWorld) {
    this.playerMock = createPlayerMock('World');
    await setupPlayerApiMock(this.page, this.playerMock);
    await setupColoredTileMocks(this.page);
    await setupMultiWorldDataMock(this.page);
    
    // Navigate to the app after setting up mocks
    await this.page.goto(BASE_URL);
    await this.page.waitForSelector('.trade-row', { state: 'visible', timeout: 2000 });
});

Given(String.raw`player {string} is in the overworld at \({int}, {int})`, async function (
    this: CustomWorld, 
    playerName: string, 
    x: number, 
    z: number
) {
    this.playerMock.moveToOverworld(x, z);
    await this.page.goto(BASE_URL);
    await this.page.waitForSelector('.search-container', { state: 'visible' });
    await this.page.waitForSelector('.trade-row', { state: 'visible', timeout: 2000 });
});

Given(String.raw`player {string} is in the nether at \({int}, {int})`, async function (
    this: CustomWorld, 
    playerName: string, 
    x: number, 
    z: number
) {
    this.playerMock.moveToNether(x, z);
    await this.page.goto(BASE_URL);
    await this.page.waitForSelector('.search-container', { state: 'visible' });
    await this.page.waitForSelector('.trade-row', { state: 'visible', timeout: 2000 });
});

Given('I open the navigation dialog with items from both worlds', async function (this: CustomWorld) {
    // Add overworld item
    const overworldRow = this.page.locator('.trade-row').filter({ hasText: 'Emerald' });
    await overworldRow.locator('.add-to-cart-btn').click();
    
    // Add nether item
    const netherRow = this.page.locator('.trade-row').filter({ hasText: 'Netherite' });
    await netherRow.locator('.add-to-cart-btn').click();
    
    // Open cart and navigate
    await this.page.locator('#open-cart').click();
    await this.page.waitForSelector('#cart-dialog', { state: 'visible' });
    await this.page.locator('#tab-navigate').click();
    await this.page.locator('#player-name-input').fill('TestPlayer');
    await this.page.locator('#start-navigation').click();
    await this.page.waitForSelector('#nav-dialog[open]', { state: 'visible', timeout: 2000 });
    
    // Wait for initial tiles to load
    await expect.poll(
        () => this.tileRequests.length,
        { timeout: 1000 }
    ).toBeGreaterThan(0);
});

Given('navigation shows {string} the {string}', async function (
    this: CustomWorld, 
    action: string, 
    world: string
) {
    const dialogDistance = this.page.locator('#nav-dialog-distance');
    await expect(dialogDistance).toBeVisible();
    const text = await dialogDistance.textContent();
    expect(text).toContain(action);
    expect(text).toContain(world);
});

// ============ WHEN Steps ============
// Note: 'I open the navigation dialog with items from both worlds' is defined as Given but works for When too

When(String.raw`player moves to the nether at \({int}, {int})`, async function (
    this: CustomWorld, 
    x: number, 
    z: number
) {
    // Clear tile requests BEFORE changing position to catch the transition
    this.tileRequests = [];
    
    // Move the player - next poll will pick up new position
    this.playerMock.moveToNether(x, z);
});

When(String.raw`player moves to the overworld at \({int}, {int})`, async function (
    this: CustomWorld, 
    x: number, 
    z: number
) {
    // Clear tile requests BEFORE changing position to catch the transition
    this.tileRequests = [];
    this.playerMock.moveToOverworld(x, z);
});

// ============ THEN Steps ============

Then('overworld tiles should be requested first', async function (this: CustomWorld) {
    const firstTile = this.tileRequests[0];
    expect(firstTile).toBe('overworld');
});

Then('nether tiles should be requested first', async function (this: CustomWorld) {
    const firstTile = this.tileRequests[0];
    expect(firstTile).toBe('nether');
});

Then('nether tiles should be requested', { timeout: 15_000 }, async function (this: CustomWorld) {
    // Poll until nether tiles are requested (max 10s)
    await expect.poll(
        () => this.tileRequests.filter(t => t === 'nether').length,
        { timeout: 2000, intervals: [100, 200, 500, 1000] }
    ).toBeGreaterThan(0);
});

Then('overworld tiles should be requested', { timeout: 15_000 }, async function (this: CustomWorld) {
    // Poll until overworld tiles are requested (max 10s)
    await expect.poll(
        () => this.tileRequests.filter(t => t === 'overworld').length,
        { timeout: 2000, intervals: [100, 200, 500, 1000] }
    ).toBeGreaterThan(0);
});
