/**
 * Navigation State Store
 * 
 * Encapsulates all live navigation state for route following.
 * Separates serializable state from Leaflet map objects.
 * 
 * @module stores/navigation-store
 */

import { STORAGE_KEYS, WORLDS } from '../constants.js';
import type { NavigationMode, NavigationProgress, RouteStop, ViewWorldMode } from '../types.js';

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

    // View world state (which world's tiles/coords are displayed)
    private _viewWorld: string = WORLDS.OVERWORLD;
    private _viewWorldMode: ViewWorldMode = 'auto';

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

    /**
     * Get the current view world (which world's tiles/coords are displayed)
     * @returns The world identifier currently displayed on the map
     */
    get viewWorld(): string {
        return this._viewWorld;
    }

    /**
     * Get the current view world mode (auto-switch vs manual)
     * @returns The active view world mode
     */
    get viewWorldMode(): ViewWorldMode {
        return this._viewWorldMode;
    }

    get refreshInterval(): ReturnType<typeof setInterval> | undefined {
        return this._refreshInterval;
    }

    /**
     * Get the current stop (next destination)
     * @returns The current route stop, or undefined if no route active
     */
    get currentStop(): RouteStop | undefined {
        return this._worldRoute[this._progress.currentIndex];
    }

    /**
     * Get remaining stops count
     * @returns Number of unvisited stops remaining in the world route
     */
    get remainingStops(): number {
        return this._worldRoute.length - this._progress.currentIndex;
    }

    // ========================================================================
    // State Mutations
    // ========================================================================

    /**
     * Start navigation session
     * @param playerName - Player name to begin navigation for
     */
    start(playerName: string): void {
        this._isActive = true;
        this._playerName = playerName;
        this._mode = 'follow'; // Always start in follow mode
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
     * @returns The new navigation mode after toggle
     */
    toggleMode(): NavigationMode {
        this._mode = this._mode === 'follow' ? 'manual' : 'follow';
        this.saveMode();
        return this._mode;
    }

    /**
     * Set navigation mode directly
     * @param mode - Navigation mode to set
     */
    setMode(mode: NavigationMode): void {
        this._mode = mode;
        this.saveMode();
    }

    /**
     * Set the view world (which world's tiles/coords are displayed)
     * @param world - World identifier to display
     */
    setViewWorld(world: string): void {
        this._viewWorld = world;
        this.saveViewWorld();
    }

    /**
     * Toggle between auto and manual view world modes.
     * @returns The new view world mode after toggle
     */
    toggleViewWorldMode(): ViewWorldMode {
        this._viewWorldMode = this._viewWorldMode === 'auto' ? 'manual' : 'auto';
        this.saveViewWorldMode();
        return this._viewWorldMode;
    }

    /**
     * Set view world mode directly
     * @param mode - View world mode to set
     */
    setViewWorldMode(mode: ViewWorldMode): void {
        this._viewWorldMode = mode;
        this.saveViewWorldMode();
    }

    /**
     * Update player position
     * @param position - New player position, or undefined to clear
     */
    setPlayerPosition(position: PlayerPosition | undefined): void {
        this._playerPosition = position;
    }

    /**
     * Set the full route
     * @param route - Complete ordered route stops
     */
    setRoute(route: RouteStop[]): void {
        this._route = route;
    }

    /**
     * Set world-filtered route
     * @param worldRoute - World-filtered subset of route stops
     */
    setWorldRoute(worldRoute: RouteStop[]): void {
        this._worldRoute = worldRoute;
    }

    /**
     * Mark a stop as complete
     * @param key - Shop key to mark as completed
     */
    markStopComplete(key: string): void {
        this._progress.completedKeys.add(key);
        this.saveProgress();
    }

    /**
     * Unmark a stop as complete
     * @param key - Shop key to remove from completed set
     */
    unmarkStopComplete(key: string): void {
        this._progress.completedKeys.delete(key);
        this.saveProgress();
    }

    /**
     * Sync progress with validated keys and index
     * Used when cart changes to remove invalid completed keys
     * @param validCompletedKeys - Validated set of completed stop keys
     * @param currentIndex - Current stop index after sync
     */
    syncProgress(validCompletedKeys: Set<string>, currentIndex: number): void {
        this._progress = {
            completedKeys: validCompletedKeys,
            currentIndex
        };
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
     * @param index - Target stop index to navigate to
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
     * @param map - Leaflet map instance, or undefined to clear
     */
    setMap(map: L.Map | undefined): void {
        this._mapObjects.map = map;
    }

    /**
     * Set player marker
     * @param marker - Leaflet marker for player position
     */
    setPlayerMarker(marker: L.Marker | undefined): void {
        this._mapObjects.playerMarker = marker;
    }

    /**
     * Set route polyline
     * @param polyline - Leaflet polyline representing the route path
     */
    setRoutePolyline(polyline: L.Polyline | undefined): void {
        this._mapObjects.routePolyline = polyline;
    }

    /**
     * Set player-to-next-stop line
     * @param line - Leaflet polyline from player to next stop
     */
    setPlayerToNextLine(line: L.Polyline | undefined): void {
        this._mapObjects.playerToNextLine = line;
    }

    /**
     * Set stop markers array
     * @param markers - Array of Leaflet markers for route stops
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
     * @param world - World identifier for the current map view
     */
    setMapWorld(world: string): void {
        this._viewport.world = world;
    }

    /**
     * Set map center tile coordinates
     * @param tileX - Horizontal tile coordinate for map center
     * @param tileZ - Vertical tile coordinate for map center
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
     * @param interval - Active interval handle for player position polling
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
     * @returns Stored player name, or empty string if none
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
     * @returns Loaded (or default) navigation mode
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

    /**
     * Save view world to localStorage
     */
    saveViewWorld(): void {
        try {
            localStorage.setItem(STORAGE_KEYS.NAV_VIEW_WORLD, this._viewWorld);
        } catch {
            // Storage unavailable
        }
    }

    /**
     * Load view world from localStorage
     * @returns Loaded (or default) view world identifier
     */
    loadViewWorld(): string {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.NAV_VIEW_WORLD);
            if (stored === WORLDS.OVERWORLD || stored === WORLDS.NETHER) {
                this._viewWorld = stored;
            }
        } catch {
            // Invalid data - use default
        }
        return this._viewWorld;
    }

    /**
     * Save view world mode to localStorage
     */
    saveViewWorldMode(): void {
        try {
            localStorage.setItem(STORAGE_KEYS.NAV_VIEW_WORLD_MODE, this._viewWorldMode);
        } catch {
            // Storage unavailable
        }
    }

    /**
     * Load view world mode from localStorage
     * @returns Loaded (or default) view world mode
     */
    loadViewWorldMode(): ViewWorldMode {
        try {
            const stored = localStorage.getItem(STORAGE_KEYS.NAV_VIEW_WORLD_MODE);
            if (stored === 'auto' || stored === 'manual') {
                this._viewWorldMode = stored;
            }
        } catch {
            // Invalid data - use default
        }
        return this._viewWorldMode;
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
        this._mode = 'follow';
        this._playerName = '';
        this._playerPosition = undefined;
        this._progress = { completedKeys: new Set(), currentIndex: 0 };
        this._route = [];
        this._worldRoute = [];
        this._viewport = { world: WORLDS.OVERWORLD, centerTileX: 0, centerTileZ: 0 };
        this._viewWorld = WORLDS.OVERWORLD;
        this._viewWorldMode = 'auto';
    }
}

/** Singleton navigation store instance */
export const navigationStore = new NavigationStore();
