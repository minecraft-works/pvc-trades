/**
 * Player API mocks for BDD navigation scenarios.
 * Provides controllable player state for testing map markers and navigation.
 * @module tests/helpers/player-mocks
 */

import type { Page, Route } from '@playwright/test';

export interface PlayerState {
    uuid: string;
    name: string;
    foreign: boolean;
    position: {
        x: number;
        y: number;
        z: number;
    };
    rotation?: {
        pitch: number;
        yaw: number;
        roll: number;
    };
    world?: string;
}

export interface PlayerMock {
    /** Current player state */
    state: PlayerState;
    /** Update player position/world */
    setPosition(x: number, z: number, world?: string, y?: number): void;
    /** Move player to nether */
    moveToNether(x?: number, z?: number, y?: number): void;
    /** Move player to overworld */
    moveToOverworld(x?: number, z?: number, y?: number): void;
}

/**
 * Creates a controllable player mock
 */
export function createPlayerMock(initialWorld: string = 'World'): PlayerMock {
    const state: PlayerState = {
        uuid: 'test-uuid-1234',
        name: 'TestPlayer',
        foreign: initialWorld === 'World_nether' || initialWorld.toLowerCase().includes('nether'),
        position: {
            x: 0,
            y: 64,
            z: 0
        },
        rotation: {
            pitch: 0,
            yaw: 0,
            roll: 0
        },
        world: initialWorld
    };

    return {
        state,
        setPosition(x: number, z: number, world?: string, y?: number) {
            state.position.x = x;
            state.position.z = z;
            if (y !== undefined) { state.position.y = y; }
            if (world) {
                state.world = world;
                state.foreign = world === 'World_nether' || world.toLowerCase().includes('nether');
            }
        },
        moveToNether(x = -100, z = -12, y?: number) {
            state.position.x = x;
            state.position.z = z;
            if (y !== undefined) { state.position.y = y; }
            state.world = 'World_nether';
            state.foreign = true;
        },
        moveToOverworld(x = 0, z = 0, y?: number) {
            state.position.x = x;
            state.position.z = z;
            if (y !== undefined) { state.position.y = y; }
            state.world = 'World';
            state.foreign = false;
        }
    };
}

/**
 * Multi-player mock for testing multiple players on map
 */
export interface MultiPlayerMock {
    /** All player states */
    players: PlayerState[];
    /** Add a player */
    addPlayer(name: string, x: number, z: number, world: string): void;
    /** Clear all players */
    clear(): void;
    /** Get player by name */
    getPlayer(name: string): PlayerState | undefined;
}

/**
 * Creates a multi-player mock for testing player markers
 */
export function createMultiPlayerMock(): MultiPlayerMock {
    const players: PlayerState[] = [];
    let nextId = 1;

    return {
        players,
        addPlayer(name: string, x: number, z: number, world: string) {
            const isNether = world === 'World_nether' || world.toLowerCase().includes('nether');
            players.push({
                uuid: `test-uuid-${nextId++}`,
                name,
                foreign: isNether,
                position: { x, y: 64, z },
                rotation: { pitch: 0, yaw: 0, roll: 0 }
            });
        },
        clear() {
            players.length = 0;
        },
        getPlayer(name: string) {
            return players.find(p => p.name === name);
        }
    };
}

/**
 * Sets up player API mock that returns the current player state
 */
export async function setupPlayerApiMock(page: Page, playerMock: PlayerMock): Promise<void> {
    await page.route('**/pvc-players.minecraft-works.workers.dev**', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                players: [playerMock.state]
            })
        });
    });
}

/**
 * Sets up player API mock that returns multiple players
 */
export async function setupMultiPlayerApiMock(page: Page, multiPlayerMock: MultiPlayerMock): Promise<void> {
    await page.route('**/pvc-players.minecraft-works.workers.dev**', async (route: Route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                players: multiPlayerMock.players
            })
        });
    });
}
