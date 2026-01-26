/**
 * Navigation State Store
 * 
 * Encapsulates all live navigation state for route following.
 * Separates serializable state from Leaflet map objects.
 * 
 * @module stores/navigation-store
 */

import type { NavigationMode, NavigationProgress, RouteStop } from '../types.js';
import { STORAGE_KEYS, WORLDS } from '../constants.js';

// ============================================================================
// Types
// ============================================================================

/** Player position from Dynmap API */
export interface PlayerPosition {
    x: number;
    y: number;
    z: number;
    world: string;
    yaw?: number;
}

/** Leaflet map objects (not serializable) */
interface MapObjects {
    map: L.Map | undefined;
    playerMarker: L.Marker | undefined;
    routePolyline: L.Polyline | undefined;
    playerToNextLine: L.Polyline | undefined;
    stopMarkers: L.Marker[];
}

/** Map viewport state */
interface MapViewport {
    world: string;
    centerTileX: number;
    centerTileZ: number;
}

// ============================================================================
// Navigation Store
// ============================================================================

/**
 * Centralized store for live navigation state.
 * 
 * Manages:
 * - Navigation active/inactive state
 * - Follow vs manual mode
 * - Player position tracking
 * - Route progress
 * - Leaflet map objects
 * 
 * @example
 * ```typescript
 * navigationStore.start('PlayerName');
 * navigationStore.setRoute(optimizedRoute);
 * navigationStore.markStopComplete('shop-key');
 * navigationStore.stop();
 * ```
 */
class NavigationStore {
    // Serializable state
    private _isActive = false;
    private _mode: NavigationMode = 'follow';
    private _playerName = '';
    private _playerPosition: PlayerPosition | undefined;
    private _progress: NavigationProgress = {
        completedKeys: new Set(),
        currentIndex: 0
    };
    private _route: RouteStop[] = [];
    private _worldRoute: RouteStop[] = [];

    // Non-serializable Leaflet objects
    private _mapObjects: MapObjects = {
        map: undefined,
        playerMarker: undefined,
        routePolyline: undefined,
        playerToNextLine: undefined,
        stopMarkers: []
    };

    // Map viewport state
    private _viewport: MapViewport = {
        world: WORLDS.OVERWORLD,
        centerTileX: 0,
        centerTileZ: 0
    };

    // Refresh interval handle
    private _refreshInterval: ReturnType<typeof setInterval> | undefined;

    // ========================================================================
    // Getters (read-only access)
    // ========================================================================

    get isActive(): boolean {
        return this._isActive;
    }

    get mode(): NavigationMode {
        return this._mode;
    }

    get playerName(): string {
        return this._playerName;
    }

    get playerPosition(): PlayerPosition | undefined {
        return this._playerPosition;
    }

    get progress(): NavigationProgress {
        return this._progress;
    }

    get route(): RouteStop[] {
        return this._route;
    }

    get worldRoute(): RouteStop[] {
        return this._worldRoute;
    }

    get mapObjects(): MapObjects {
        return this._mapObjects;
    }

    get viewport(): MapViewport {
        return this._viewport;
    }

    get refreshInterval(): ReturnType<typeof setInterval> | undefined {
        return this._refreshInterval;
    }

    /** Get the current stop (next destination) */
    get currentStop(): RouteStop | undefined {
        return this._worldRoute[this._progress.currentIndex];
    }

    /** Get remaining stops count */
    get remainingStops(): number {
        return this._worldRoute.length - this._progress.currentIndex;
    }

    // ========================================================================
    // State Mutations
    // ========================================================================

    /**
     * Start navigation session
     */
    start(playerName: string): void {
        this._isActive = true;
        this._playerName = playerName;
        this.savePlayerName();
    }

    /**
     * Stop navigation session and cleanup
     */
    stop(): void {
        this._isActive = false;
        this.clearRefreshInterval();
        this.clearMapObjects();
    }

    /**
     * Toggle between follow and manual modes
     */
    toggleMode(): NavigationMode {
        this._mode = this._mode === 'follow' ? 'manual' : 'follow';
        this.saveMode();
        return this._mode;
    }

    /**
     * Set navigation mode directly
     */
    setMode(mode: NavigationMode): void {
        this._mode = mode;
        this.saveMode();
    }

    /**
     * Update player position
     */
    setPlayerPosition(position: PlayerPosition | undefined): void {
        this._playerPosition = position;
    }

    /**
     * Set the full route
     */
    setRoute(route: RouteStop[]): void {
        this._route = route;
    }

    /**
     * Set world-filtered route
     */
    setWorldRoute(worldRoute: RouteStop[]): void {
        this._worldRoute = worldRoute;
    }

    /**
     * Mark a stop as complete
     */
    markStopComplete(key: string): void {
        this._progress.completedKeys.add(key);
        this.saveProgress();
    }

    /**
     * Advance to next stop
     */
    advanceToNextStop(): void {
        if (this._progress.currentIndex < this._worldRoute.length - 1) {
            this._progress.currentIndex++;
            this.saveProgress();
        }
    }

    /**
     * Set current stop index directly
     */
    setCurrentIndex(index: number): void {
        this._progress.currentIndex = Math.max(0, Math.min(index, this._worldRoute.length - 1));
        this.saveProgress();
    }

    /**
     * Reset progress (for new route)
     */
    resetProgress(): void {
        this._progress = {
            completedKeys: new Set(),
            currentIndex: 0
        };
        this.saveProgress();
    }

    // ========================================================================
    // Map Objects Management
    // ========================================================================

    /**
     * Set Leaflet map instance
     */
    setMap(map: L.Map | undefined): void {
        this._mapObjects.map = map;
    }

    /**
     * Set player marker
     */
    setPlayerMarker(marker: L.Marker | undefined): void {
        this._mapObjects.playerMarker = marker;
    }

    /**
     * Set route polyline
     */
    setRoutePolyline(polyline: L.Polyline | undefined): void {
        this._mapObjects.routePolyline = polyline;
    }

    /**
     * Set player-to-next-stop line
     */
    setPlayerToNextLine(line: L.Polyline | undefined): void {
        this._mapObjects.playerToNextLine = line;
    }

    /**
     * Set stop markers array
     */
    setStopMarkers(markers: L.Marker[]): void {
        this._mapObjects.stopMarkers = markers;
    }

    /**
     * Clear all Leaflet map objects
     */
    clearMapObjects(): void {
        // Remove markers from map before clearing
        if (this._mapObjects.playerMarker) {
            this._mapObjects.playerMarker.remove();
        }
        if (this._mapObjects.routePolyline) {
            this._mapObjects.routePolyline.remove();
        }
        if (this._mapObjects.playerToNextLine) {
            this._mapObjects.playerToNextLine.remove();
        }
        for (const marker of this._mapObjects.stopMarkers) {
            marker.remove();
        }

        this._mapObjects = {
            map: undefined,
            playerMarker: undefined,
            routePolyline: undefined,
            playerToNextLine: undefined,
            stopMarkers: []
        };
    }

    // ========================================================================
    // Viewport Management
    // ========================================================================

    /**
     * Set current map world
     */
    setMapWorld(world: string): void {
        this._viewport.world = world;
    }

    /**
     * Set map center tile coordinates
     */
    setMapCenter(tileX: number, tileZ: number): void {
        this._viewport.centerTileX = tileX;
        this._viewport.centerTileZ = tileZ;
    }

    // ========================================================================
    // Refresh Interval Management
    // ========================================================================

    /**
     * Set player refresh interval
     */
    setRefreshInterval(interval: ReturnType<typeof setInterval>): void {
        this.clearRefreshInterval();
        this._refreshInterval = interval;
    }

    /**
     * Clear refresh interval
     */
    clearRefreshInterval(): void {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = undefined;
        }
    }

    // ========================================================================
    // Persistence
    // ========================================================================

    /**
     * Save progress to localStorage
     */
    saveProgress(): void {
        try {
            const data = {
                completedKeys: [...this._progress.completedKeys],
                currentIndex: this._progress.currentIndex
            };
            localStorage.setItem(STORAGE_KEYS.NAV_PROGRESS, JSON.stringify(data));
        } catch {
            // Storage unavailable - ignore
        }
    }

    /**
     * Load progress from localStorage
     */
    loadProgress(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.NAV_PROGRESS);
            if (stored) {
                const data = JSON.parse(stored) as { completedKeys: string[]; currentIndex: number };
                this._progress = {
                    completedKeys: new Set(data.completedKeys),
                    currentIndex: data.currentIndex
                };
            }
        } catch {
            // Invalid data - use defaults
        }
    }

    /**
     * Save player name to localStorage
     */
    savePlayerName(): void {
        try {
            localStorage.setItem(STORAGE_KEYS.NAV_PLAYER, this._playerName);
        } catch {
            // Storage unavailable
        }
    }

    /**
     * Load player name from localStorage
     */
    loadPlayerName(): string {
        try {
            return localStorage.getItem(STORAGE_KEYS.NAV_PLAYER) ?? '';
        } catch {
            return '';
        }
    }

    /**
     * Save navigation mode to localStorage
     */
    saveMode(): void {
        try {
            localStorage.setItem(STORAGE_KEYS.NAV_MODE, this._mode);
        } catch {
            // Storage unavailable
        }
    }

    /**
     * Load navigation mode from localStorage
     */
    loadMode(): NavigationMode {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.NAV_MODE);
            if (stored === 'follow' || stored === 'manual') {
                this._mode = stored;
            }
        } catch {
            // Invalid data - use default
        }
        return this._mode;
    }

    // ========================================================================
    // Testing Support
    // ========================================================================

    /**
     * Reset store to initial state (for testing)
     * @internal
     */
    _reset(): void {
        this.stop();
        this._playerName = '';
        this._playerPosition = undefined;
        this._progress = { completedKeys: new Set(), currentIndex: 0 };
        this._route = [];
        this._worldRoute = [];
        this._viewport = { world: WORLDS.OVERWORLD, centerTileX: 0, centerTileZ: 0 };
    }
}

/** Singleton navigation store instance */
export const navigationStore = new NavigationStore();
