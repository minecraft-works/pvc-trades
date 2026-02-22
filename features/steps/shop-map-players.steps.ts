/**
 * Step definitions for shop map player marker scenarios
 * Tests that player markers are correctly filtered by world
 */
import { expect } from '@playwright/test';

import { setupMultiPlayerApiMock } from '../../tests/helpers/navigation-mocks';
import { Given, Then,When } from './fixtures';

// Selectors
const SELECTOR_TRADE_ROW = '.trade-row';
const SELECTOR_MAP_DIALOG = '#map-dialog';
const SELECTOR_PLAYER_MARKER = '.leaflet-player-marker';
const SELECTOR_EDGE_MARKER = '.player-edge-marker';

Given('there are players in both worlds', async ({ multiPlayerMock }) => {
    // Initial setup - players will be added by specific steps
    // This just acknowledges the background setup
    multiPlayerMock.clear();
});

Given(String.raw`there is a player {string} in the overworld at \({int}, {int}\)`, async ({ multiPlayerMock }, name: string, x: number, z: number) => {
    multiPlayerMock.addPlayer(name, x, z, 'World');
});

Given(String.raw`there is a player {string} in the nether at \({int}, {int}\)`, async ({ multiPlayerMock }, name: string, x: number, z: number) => {
    multiPlayerMock.addPlayer(name, x, z, 'World_nether');
});

Given('there are no players in the nether', async ({ multiPlayerMock }) => {
    // Filter out nether players
    const overworldPlayers = multiPlayerMock.players.filter(p => p.world === 'World');
    multiPlayerMock.clear();
    for (const player of overworldPlayers) {
        multiPlayerMock.addPlayer(player.name, player.position.x, player.position.z, 'World');
    }
});

When('I click on the distance cell of an overworld shop', async ({ page, multiPlayerMock }) => {
    // Set up the multi-player API mock
    await setupMultiPlayerApiMock(page, multiPlayerMock);
    
    // Find an overworld shop (world indicator shows "O") and click its distance cell
    const overworldRow = page.locator(SELECTOR_TRADE_ROW).filter({ has: page.locator('.world:has-text("O")') }).first();
    await overworldRow.locator('.distance').click();
    
    // Wait for map dialog to open
    await expect(page.locator(SELECTOR_MAP_DIALOG)).toBeVisible({ timeout: 5000 });
    
    // Wait for player markers to load (API fetch)
    await page.waitForTimeout(500);
});

When('I click on the distance cell of a nether shop', async ({ page, multiPlayerMock }) => {
    // Set up the multi-player API mock
    await setupMultiPlayerApiMock(page, multiPlayerMock);
    
    // Find a nether shop (world indicator shows "N") and click its distance cell
    const netherRow = page.locator(SELECTOR_TRADE_ROW).filter({ has: page.locator('.world:has-text("N")') }).first();
    await netherRow.locator('.distance').click();
    
    // Wait for map dialog to open
    await expect(page.locator(SELECTOR_MAP_DIALOG)).toBeVisible({ timeout: 5000 });
    
    // Wait for player markers to load (API fetch)
    await page.waitForTimeout(500);
});

When(String.raw`I click on the distance cell of an overworld shop at \({int}, {int}\)`, async ({ page, multiPlayerMock }, _x: number, _z: number) => {
    // Set up the multi-player API mock
    await setupMultiPlayerApiMock(page, multiPlayerMock);
    
    // Find an overworld shop and click its distance cell
    const overworldRow = page.locator(SELECTOR_TRADE_ROW).filter({ has: page.locator('.world:has-text("O")') }).first();
    await overworldRow.locator('.distance').click();
    
    // Wait for map dialog to open
    await expect(page.locator(SELECTOR_MAP_DIALOG)).toBeVisible({ timeout: 5000 });
    
    // Wait for player markers to load (API fetch)
    await page.waitForTimeout(500);
});

Then('the map should show player marker for {string}', async ({ page }, playerName: string) => {
    // Check for player marker with that name (either on map or as edge marker)
    const mapMarker = page.locator(SELECTOR_PLAYER_MARKER).filter({ hasText: playerName });
    const edgeMarker = page.locator(SELECTOR_EDGE_MARKER).filter({ hasText: playerName });
    
    // At least one should be visible
    const mapVisible = await mapMarker.count() > 0;
    const edgeVisible = await edgeMarker.count() > 0;
    
    expect(mapVisible || edgeVisible, `Expected to find marker for player "${playerName}"`).toBeTruthy();
});

Then('the map should not show player marker for {string}', async ({ page }, playerName: string) => {
    // Check that no marker exists for this player
    const mapMarker = page.locator(SELECTOR_PLAYER_MARKER).filter({ hasText: playerName });
    const edgeMarker = page.locator(SELECTOR_EDGE_MARKER).filter({ hasText: playerName });
    
    await expect(mapMarker).toHaveCount(0);
    await expect(edgeMarker).toHaveCount(0);
});

Then('the map should show player markers for {string}, {string}, and {string}', async ({ page }, player1: string, player2: string, player3: string) => {
    const dialog = page.locator(SELECTOR_MAP_DIALOG);
    
    for (const playerName of [player1, player2, player3]) {
        const mapMarker = dialog.locator(SELECTOR_PLAYER_MARKER).filter({ hasText: playerName });
        const edgeMarker = dialog.locator(SELECTOR_EDGE_MARKER).filter({ hasText: playerName });
        
        const mapCount = await mapMarker.count();
        const edgeCount = await edgeMarker.count();
        
        expect(mapCount + edgeCount, `Expected to find marker for player "${playerName}"`).toBeGreaterThan(0);
    }
});

Then('the map should show no player markers', async ({ page }) => {
    const dialog = page.locator(SELECTOR_MAP_DIALOG);
    
    // No map markers and no edge markers
    await expect(dialog.locator(SELECTOR_PLAYER_MARKER)).toHaveCount(0);
    await expect(dialog.locator(SELECTOR_EDGE_MARKER)).toHaveCount(0);
});

Then('there should be an edge marker pointing toward {string}', async ({ page }, playerName: string) => {
    // Player is far away, so should have an edge marker
    const edgeMarker = page.locator(SELECTOR_EDGE_MARKER).filter({ hasText: playerName });
    await expect(edgeMarker).toBeVisible();
});
