/**
 * Unit tests for NavigationStore
 * 
 * @module stores/navigation-store.test
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { navigationStore, type PlayerPosition } from './navigation-store.js';
import type { RouteStop } from '../types.js';
import { STORAGE_KEYS, WORLDS } from '../constants.js';

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        // Helper for tests to set values
        _setStore: (newStore: Record<string, string>) => {
            store = newStore;
        },
        _getStore: () => store,
    };
})();

vi.stubGlobal('localStorage', localStorageMock);

// Mock RouteStop factory
function createMockShopStop(overrides: Partial<RouteStop> = {}): RouteStop {
    return {
        type: 'shop',
        key: 'shop-100-64-200-world',
        x: 100,
        y: 64,
        z: 200,
        world: 'world',
        displayWorld: 'overworld',
        label: 'Test Shop',
        ...overrides,
    } as RouteStop;
}

function createMockPortalStop(overrides: Partial<RouteStop> = {}): RouteStop {
    return {
        type: 'portal',
        key: 'portal-0-64-0-world',
        x: 0,
        y: 64,
        z: 0,
        world: 'world',
        displayWorld: 'overworld',
        label: 'Portal',
        targetWorld: 'world_nether',
        ...overrides,
    } as RouteStop;
}

describe('NavigationStore', () => {
    beforeEach(() => {
        navigationStore._reset();
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // ========================================================================
    // Initial State
    // ========================================================================

    describe('initial state', () => {
        test('isActive is false', () => {
            expect(navigationStore.isActive).toBe(false);
        });

        test('mode is follow', () => {
            expect(navigationStore.mode).toBe('follow');
        });

        test('playerName is empty', () => {
            expect(navigationStore.playerName).toBe('');
        });

        test('playerPosition is undefined', () => {
            expect(navigationStore.playerPosition).toBeUndefined();
        });

        test('progress has empty completedKeys and zero currentIndex', () => {
            expect(navigationStore.progress.completedKeys.size).toBe(0);
            expect(navigationStore.progress.currentIndex).toBe(0);
        });

        test('route and worldRoute are empty', () => {
            expect(navigationStore.route).toEqual([]);
            expect(navigationStore.worldRoute).toEqual([]);
        });

        test('viewport defaults to overworld at origin', () => {
            expect(navigationStore.viewport.world).toBe(WORLDS.OVERWORLD);
            expect(navigationStore.viewport.centerTileX).toBe(0);
            expect(navigationStore.viewport.centerTileZ).toBe(0);
        });
    });

    // ========================================================================
    // Start/Stop
    // ========================================================================

    describe('start', () => {
        test('sets isActive to true', () => {
            navigationStore.start('TestPlayer');
            expect(navigationStore.isActive).toBe(true);
        });

        test('sets playerName', () => {
            navigationStore.start('TestPlayer');
            expect(navigationStore.playerName).toBe('TestPlayer');
        });

        test('saves player name to localStorage', () => {
            navigationStore.start('TestPlayer');
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.NAV_PLAYER,
                'TestPlayer'
            );
        });
    });

    describe('stop', () => {
        test('sets isActive to false', () => {
            navigationStore.start('TestPlayer');
            navigationStore.stop();
            expect(navigationStore.isActive).toBe(false);
        });

        test('clears refresh interval', () => {
            const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
            const interval = setInterval(() => {}, 1000);
            navigationStore.setRefreshInterval(interval);
            
            navigationStore.stop();
            
            expect(clearIntervalSpy).toHaveBeenCalled();
            expect(navigationStore.refreshInterval).toBeUndefined();
            
            clearIntervalSpy.mockRestore();
        });
    });

    // ========================================================================
    // Mode Management
    // ========================================================================

    describe('toggleMode', () => {
        test('toggles from follow to manual', () => {
            expect(navigationStore.mode).toBe('follow');
            const result = navigationStore.toggleMode();
            expect(result).toBe('manual');
            expect(navigationStore.mode).toBe('manual');
        });

        test('toggles from manual to follow', () => {
            navigationStore.setMode('manual');
            const result = navigationStore.toggleMode();
            expect(result).toBe('follow');
            expect(navigationStore.mode).toBe('follow');
        });

        test('saves mode to localStorage', () => {
            navigationStore.toggleMode();
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.NAV_MODE,
                'manual'
            );
        });
    });

    describe('setMode', () => {
        test('sets mode to manual', () => {
            navigationStore.setMode('manual');
            expect(navigationStore.mode).toBe('manual');
        });

        test('sets mode to follow', () => {
            navigationStore.setMode('manual');
            navigationStore.setMode('follow');
            expect(navigationStore.mode).toBe('follow');
        });

        test('saves mode to localStorage', () => {
            navigationStore.setMode('manual');
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.NAV_MODE,
                'manual'
            );
        });
    });

    describe('loadMode', () => {
        test('loads follow mode from localStorage', () => {
            localStorageMock._setStore({ [STORAGE_KEYS.NAV_MODE]: 'follow' });
            const result = navigationStore.loadMode();
            expect(result).toBe('follow');
            expect(navigationStore.mode).toBe('follow');
        });

        test('loads manual mode from localStorage', () => {
            localStorageMock._setStore({ [STORAGE_KEYS.NAV_MODE]: 'manual' });
            const result = navigationStore.loadMode();
            expect(result).toBe('manual');
            expect(navigationStore.mode).toBe('manual');
        });

        test('returns default mode when localStorage is empty', () => {
            const result = navigationStore.loadMode();
            expect(result).toBe('follow');
        });

        test('ignores invalid mode values', () => {
            localStorageMock._setStore({ [STORAGE_KEYS.NAV_MODE]: 'invalid' });
            const result = navigationStore.loadMode();
            expect(result).toBe('follow');
        });
    });

    // ========================================================================
    // Player Position
    // ========================================================================

    describe('setPlayerPosition', () => {
        test('sets player position', () => {
            const position: PlayerPosition = { x: 100, y: 64, z: 200, world: 'world' };
            navigationStore.setPlayerPosition(position);
            expect(navigationStore.playerPosition).toEqual(position);
        });

        test('can set position with yaw', () => {
            const position: PlayerPosition = { x: 100, y: 64, z: 200, world: 'world', yaw: 90 };
            navigationStore.setPlayerPosition(position);
            expect(navigationStore.playerPosition?.yaw).toBe(90);
        });

        test('can clear position with undefined', () => {
            navigationStore.setPlayerPosition({ x: 100, y: 64, z: 200, world: 'world' });
            navigationStore.setPlayerPosition(undefined);
            expect(navigationStore.playerPosition).toBeUndefined();
        });
    });

    // ========================================================================
    // Route Management
    // ========================================================================

    describe('setRoute', () => {
        test('sets the full route', () => {
            const route = [createMockShopStop(), createMockPortalStop()];
            navigationStore.setRoute(route);
            expect(navigationStore.route).toEqual(route);
        });

        test('replaces existing route', () => {
            const route1 = [createMockShopStop()];
            const route2 = [createMockPortalStop()];
            navigationStore.setRoute(route1);
            navigationStore.setRoute(route2);
            expect(navigationStore.route).toEqual(route2);
        });
    });

    describe('setWorldRoute', () => {
        test('sets the world-filtered route', () => {
            const worldRoute = [createMockShopStop()];
            navigationStore.setWorldRoute(worldRoute);
            expect(navigationStore.worldRoute).toEqual(worldRoute);
        });
    });

    describe('currentStop', () => {
        test('returns first stop when currentIndex is 0', () => {
            const stop = createMockShopStop();
            navigationStore.setWorldRoute([stop]);
            expect(navigationStore.currentStop).toBe(stop);
        });

        test('returns undefined when worldRoute is empty', () => {
            expect(navigationStore.currentStop).toBeUndefined();
        });

        test('returns correct stop after advancing', () => {
            const stop1 = createMockShopStop({ key: 'shop-1' });
            const stop2 = createMockShopStop({ key: 'shop-2' });
            navigationStore.setWorldRoute([stop1, stop2]);
            navigationStore.advanceToNextStop();
            expect(navigationStore.currentStop).toBe(stop2);
        });
    });

    describe('remainingStops', () => {
        test('returns total count when at start', () => {
            const stops = [createMockShopStop(), createMockShopStop()];
            navigationStore.setWorldRoute(stops);
            expect(navigationStore.remainingStops).toBe(2);
        });

        test('decreases after advancing', () => {
            const stops = [createMockShopStop(), createMockShopStop()];
            navigationStore.setWorldRoute(stops);
            navigationStore.advanceToNextStop();
            expect(navigationStore.remainingStops).toBe(1);
        });

        test('returns 0 for empty route', () => {
            expect(navigationStore.remainingStops).toBe(0);
        });
    });

    // ========================================================================
    // Progress Management
    // ========================================================================

    describe('markStopComplete', () => {
        test('adds key to completedKeys', () => {
            navigationStore.markStopComplete('shop-1');
            expect(navigationStore.progress.completedKeys.has('shop-1')).toBe(true);
        });

        test('can mark multiple stops complete', () => {
            navigationStore.markStopComplete('shop-1');
            navigationStore.markStopComplete('shop-2');
            expect(navigationStore.progress.completedKeys.size).toBe(2);
        });

        test('saves progress to localStorage', () => {
            navigationStore.markStopComplete('shop-1');
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.NAV_PROGRESS,
                expect.any(String)
            );
        });
    });

    describe('unmarkStopComplete', () => {
        test('removes key from completedKeys', () => {
            navigationStore.markStopComplete('shop-1');
            navigationStore.unmarkStopComplete('shop-1');
            expect(navigationStore.progress.completedKeys.has('shop-1')).toBe(false);
        });

        test('handles unmarking non-existent key gracefully', () => {
            navigationStore.unmarkStopComplete('non-existent');
            expect(navigationStore.progress.completedKeys.size).toBe(0);
        });
    });

    describe('syncProgress', () => {
        test('updates completedKeys and currentIndex', () => {
            const validKeys = new Set(['shop-1', 'shop-2']);
            navigationStore.syncProgress(validKeys, 5);
            expect(navigationStore.progress.completedKeys).toEqual(validKeys);
            expect(navigationStore.progress.currentIndex).toBe(5);
        });

        test('saves progress to localStorage', () => {
            navigationStore.syncProgress(new Set(['shop-1']), 2);
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.NAV_PROGRESS,
                expect.any(String)
            );
        });
    });

    describe('advanceToNextStop', () => {
        test('increments currentIndex', () => {
            navigationStore.setWorldRoute([createMockShopStop(), createMockShopStop()]);
            expect(navigationStore.progress.currentIndex).toBe(0);
            navigationStore.advanceToNextStop();
            expect(navigationStore.progress.currentIndex).toBe(1);
        });

        test('does not exceed route length', () => {
            navigationStore.setWorldRoute([createMockShopStop()]);
            navigationStore.advanceToNextStop();
            navigationStore.advanceToNextStop();
            expect(navigationStore.progress.currentIndex).toBe(0); // clamped to last
        });

        test('saves progress to localStorage', () => {
            navigationStore.setWorldRoute([createMockShopStop(), createMockShopStop()]);
            navigationStore.advanceToNextStop();
            expect(localStorageMock.setItem).toHaveBeenCalledWith(
                STORAGE_KEYS.NAV_PROGRESS,
                expect.any(String)
            );
        });
    });

    describe('setCurrentIndex', () => {
        test('sets currentIndex to specified value', () => {
            navigationStore.setWorldRoute([
                createMockShopStop(),
                createMockShopStop(),
                createMockShopStop()
            ]);
            navigationStore.setCurrentIndex(2);
            expect(navigationStore.progress.currentIndex).toBe(2);
        });

        test('clamps to minimum 0', () => {
            navigationStore.setWorldRoute([createMockShopStop()]);
            navigationStore.setCurrentIndex(-5);
            expect(navigationStore.progress.currentIndex).toBe(0);
        });

        test('clamps to maximum route length minus 1', () => {
            navigationStore.setWorldRoute([createMockShopStop(), createMockShopStop()]);
            navigationStore.setCurrentIndex(100);
            expect(navigationStore.progress.currentIndex).toBe(1);
        });
    });

    describe('resetProgress', () => {
        test('clears completedKeys', () => {
            navigationStore.markStopComplete('shop-1');
            navigationStore.resetProgress();
            expect(navigationStore.progress.completedKeys.size).toBe(0);
        });

        test('resets currentIndex to 0', () => {
            navigationStore.setWorldRoute([createMockShopStop(), createMockShopStop()]);
            navigationStore.advanceToNextStop();
            navigationStore.resetProgress();
            expect(navigationStore.progress.currentIndex).toBe(0);
        });
    });

    // ========================================================================
    // Persistence
    // ========================================================================

    describe('loadProgress', () => {
        test('loads progress from localStorage', () => {
            const storedProgress = {
                completedKeys: ['shop-1', 'shop-2'],
                currentIndex: 3
            };
            localStorageMock._setStore({
                [STORAGE_KEYS.NAV_PROGRESS]: JSON.stringify(storedProgress)
            });

            navigationStore.loadProgress();

            expect(navigationStore.progress.completedKeys.has('shop-1')).toBe(true);
            expect(navigationStore.progress.completedKeys.has('shop-2')).toBe(true);
            expect(navigationStore.progress.currentIndex).toBe(3);
        });

        test('handles empty localStorage gracefully', () => {
            navigationStore.loadProgress();
            expect(navigationStore.progress.completedKeys.size).toBe(0);
            expect(navigationStore.progress.currentIndex).toBe(0);
        });

        test('handles invalid JSON gracefully', () => {
            localStorageMock._setStore({
                [STORAGE_KEYS.NAV_PROGRESS]: 'invalid-json'
            });
            navigationStore.loadProgress();
            expect(navigationStore.progress.completedKeys.size).toBe(0);
        });
    });

    describe('loadPlayerName', () => {
        test('returns stored player name', () => {
            localStorageMock._setStore({ [STORAGE_KEYS.NAV_PLAYER]: 'SavedPlayer' });
            const result = navigationStore.loadPlayerName();
            expect(result).toBe('SavedPlayer');
        });

        test('returns empty string when not stored', () => {
            const result = navigationStore.loadPlayerName();
            expect(result).toBe('');
        });
    });

    // ========================================================================
    // Viewport Management
    // ========================================================================

    describe('setMapWorld', () => {
        test('sets viewport world', () => {
            navigationStore.setMapWorld(WORLDS.NETHER);
            expect(navigationStore.viewport.world).toBe(WORLDS.NETHER);
        });
    });

    describe('setMapCenter', () => {
        test('sets viewport center coordinates', () => {
            navigationStore.setMapCenter(100, 200);
            expect(navigationStore.viewport.centerTileX).toBe(100);
            expect(navigationStore.viewport.centerTileZ).toBe(200);
        });
    });

    // ========================================================================
    // Refresh Interval
    // ========================================================================

    describe('setRefreshInterval', () => {
        test('stores interval reference', () => {
            const interval = setInterval(() => {}, 1000);
            navigationStore.setRefreshInterval(interval);
            expect(navigationStore.refreshInterval).toBe(interval);
            clearInterval(interval);
        });

        test('clears previous interval when setting new one', () => {
            const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
            const interval1 = setInterval(() => {}, 1000);
            const interval2 = setInterval(() => {}, 1000);
            
            navigationStore.setRefreshInterval(interval1);
            navigationStore.setRefreshInterval(interval2);
            
            expect(clearIntervalSpy).toHaveBeenCalledWith(interval1);
            expect(navigationStore.refreshInterval).toBe(interval2);
            
            clearInterval(interval2);
            clearIntervalSpy.mockRestore();
        });
    });

    describe('clearRefreshInterval', () => {
        test('clears interval and sets to undefined', () => {
            const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
            const interval = setInterval(() => {}, 1000);
            navigationStore.setRefreshInterval(interval);
            
            navigationStore.clearRefreshInterval();
            
            expect(clearIntervalSpy).toHaveBeenCalledWith(interval);
            expect(navigationStore.refreshInterval).toBeUndefined();
            
            clearIntervalSpy.mockRestore();
        });

        test('handles clearing when no interval is set', () => {
            expect(() => navigationStore.clearRefreshInterval()).not.toThrow();
        });
    });

    // ========================================================================
    // Reset
    // ========================================================================

    describe('_reset', () => {
        test('resets all state to initial values', () => {
            // Set up various state
            navigationStore.start('TestPlayer');
            navigationStore.setMode('manual');
            navigationStore.setPlayerPosition({ x: 100, y: 64, z: 200, world: 'world' });
            navigationStore.setRoute([createMockShopStop()]);
            navigationStore.setWorldRoute([createMockShopStop()]);
            navigationStore.markStopComplete('shop-1');
            navigationStore.setMapWorld(WORLDS.NETHER);
            navigationStore.setMapCenter(100, 200);

            // Reset
            navigationStore._reset();

            // Verify all state is reset
            expect(navigationStore.isActive).toBe(false);
            expect(navigationStore.playerName).toBe('');
            expect(navigationStore.playerPosition).toBeUndefined();
            expect(navigationStore.route).toEqual([]);
            expect(navigationStore.worldRoute).toEqual([]);
            expect(navigationStore.progress.completedKeys.size).toBe(0);
            expect(navigationStore.progress.currentIndex).toBe(0);
            expect(navigationStore.viewport.world).toBe(WORLDS.OVERWORLD);
            expect(navigationStore.viewport.centerTileX).toBe(0);
            expect(navigationStore.viewport.centerTileZ).toBe(0);
        });
    });
});
