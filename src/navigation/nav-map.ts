/**
 * Navigation map module — Leaflet map infrastructure, tile loading, and route markers.
 *
 * Manages the Leaflet map used during live navigation:
 * - Map creation and teardown
 * - Tile range calculation and tile loading (zoom 4 + 8)
 * - Unified route marker creation (completed/incomplete)
 * - Dynamic tile loading on pan/zoom
 *
 * Uses factory pattern to receive shared NavState + external deps.
 *
 * @module navigation/nav-map
 */

import * as L from 'leaflet';

import {
    toViewCoords,
    toLeafletCoordsRelative,
    getTileCoords,
    getTradeKey,
    isNether,
    buildMarkerContent,
    buildStopTooltip,
} from '../library.js';

import {
    TILE_CONFIG,
    loadTileManifest,
    tileExistsInManifest,
    loadTileToMap,
    calculateZoom4Coords,
} from '../map/index.js';
import type { LoadNavMapTilesOptions, TileRange } from '../map/index.js';

import { CSS_CLASSES, WORLDS } from '../constants.js';

import { shouldDisableAnimations } from '../types.js';
import type { RouteStop } from '../types.js';

import { debugMap, debugTiles } from '../debug.js';

// ============================================================================
// NavState — shared mutable state for all navigation modules
// ============================================================================

/** Shared mutable state passed to all navigation module factories */
export interface NavState {
    map: L.Map | undefined;
    routePolyline: L.Polyline | undefined;
    playerToNextLine: L.Polyline | undefined;
    stopMarkers: L.Marker[];
    currentRoute: RouteStop[];
    currentWorldRoute: RouteStop[];
    mapWorld: string;
    centerTileX: number;
    centerTileZ: number;
    animationFrameId: number | undefined;
}

/** Create initial NavState with default values */
export function createNavState(): NavState {
    return {
        map: undefined,
        routePolyline: undefined,
        playerToNextLine: undefined,
        stopMarkers: [],
        currentRoute: [],
        currentWorldRoute: [],
        mapWorld: WORLDS.OVERWORLD,
        centerTileX: 0,
        centerTileZ: 0,
        animationFrameId: undefined,
    };
}

// ============================================================================
// Dependencies and handler interfaces
// ============================================================================

/** Dependencies injected by main.ts */
export interface NavMapDeps {
    navigationStore: {
        viewWorld: string;
        progress: { completedKeys: Set<string> };
        setPlayerMarker: (marker: L.Marker | undefined) => void;
    };
    getAllCartStops: () => RouteStop[];
    toggleStopCompletion: (stop: RouteStop, route: RouteStop[]) => void;
    onMapDrag: () => void;
}

/** Public API returned by the factory */
export interface NavMapHandler {
    initNavigationMapDialog(route: RouteStop[], targetWorld?: string): Promise<void>;
    createRouteMarkersUnified(
        allStops: RouteStop[],
        centerTileX: number,
        centerTileZ: number,
        completedKeys: Set<string>,
    ): L.LatLngExpression[];
    cleanupNavMap(): void;
}

// ============================================================================
// Tile loading context
// ============================================================================

interface TileLoadContext {
    map: L.Map;
    manifest: Set<string>;
    worldId: string;
    minTileX: number;
    maxTileX: number;
    minTileZ: number;
    maxTileZ: number;
    positionCenterX: number;
    positionCenterZ: number;
    addedToMap: Set<string>;
}

// ============================================================================
// Pure tile loading helpers (no closure needed)
// ============================================================================

function loadZoom4Tiles(context: TileLoadContext): { loaded: number; skipped: number } {
    const { map, manifest, worldId, minTileX, maxTileX, minTileZ, maxTileZ, positionCenterX, positionCenterZ, addedToMap } = context;
    let loaded = 0;
    let skipped = 0;
    const zoom4TileSize = TILE_CONFIG.tileSize * 16;
    const zoom4Tiles = new Set<string>();
    for (let tz = minTileZ - 1; tz <= maxTileZ + 1; tz++) {
        for (let tx = minTileX - 1; tx <= maxTileX + 1; tx++) {
            const z4 = calculateZoom4Coords(tx, tz);
            const key = `${z4.x},${z4.z}`;
            if (!zoom4Tiles.has(key)) {
                zoom4Tiles.add(key);
                if (tileExistsInManifest(manifest, worldId, 8192, z4.x, z4.z)) {
                    loaded++;
                    const startZ8X = z4.x * 16;
                    const startZ8Z = z4.z * 16;
                    const dx = startZ8X - positionCenterX;
                    const dy = startZ8Z - positionCenterZ;
                    const bounds: L.LatLngBoundsExpression = [
                        [-dy * TILE_CONFIG.tileSize - zoom4TileSize, dx * TILE_CONFIG.tileSize],
                        [-dy * TILE_CONFIG.tileSize, dx * TILE_CONFIG.tileSize + zoom4TileSize],
                    ];
                    loadTileToMap({ map, worldId, zoom: 4, tx: z4.x, tz: z4.z, bounds, addedToMap, pane: 'tilesZoom4' });
                } else {
                    skipped++;
                }
            }
        }
    }
    return { loaded, skipped };
}

function loadZoom8Tiles(context: TileLoadContext): { loaded: number; skipped: number } {
    const { map, manifest, worldId, minTileX, maxTileX, minTileZ, maxTileZ, positionCenterX, positionCenterZ, addedToMap } = context;
    let loaded = 0;
    let skipped = 0;
    for (let tz = minTileZ - 1; tz <= maxTileZ + 1; tz++) {
        for (let tx = minTileX - 1; tx <= maxTileX + 1; tx++) {
            if (tileExistsInManifest(manifest, worldId, 512, tx, tz)) {
                loaded++;
                const relativeX = tx - positionCenterX;
                const relativeZ = tz - positionCenterZ;
                const bounds: L.LatLngBoundsExpression = [
                    [-relativeZ * TILE_CONFIG.tileSize - TILE_CONFIG.tileSize, relativeX * TILE_CONFIG.tileSize],
                    [-relativeZ * TILE_CONFIG.tileSize, relativeX * TILE_CONFIG.tileSize + TILE_CONFIG.tileSize],
                ];
                loadTileToMap({ map, worldId, zoom: 8, tx, tz, bounds, addedToMap, pane: 'tilesZoom8' });
            } else {
                skipped++;
            }
        }
    }
    return { loaded, skipped };
}

/** Create a Leaflet map configured for navigation */
function createNavLeafletMap(container: HTMLElement, onMapDrag: () => void): L.Map {
    const animationOptions = shouldDisableAnimations() ? {
        fadeAnimation: false,
        zoomAnimation: false,
        markerZoomAnimation: false,
    } : {};

    // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- Leaflet L.map(), not Array.map()
    const map = L.map(container, {
        crs: L.CRS.Simple,
        minZoom: -5,
        maxZoom: 2,
        zoomControl: false,
        attributionControl: false,
        maxBoundsViscosity: 1,
        ...animationOptions,
    });

    map.createPane('tilesZoom4').style.zIndex = '350';
    map.createPane('tilesZoom8').style.zIndex = '360';
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    map.on('dragstart', () => onMapDrag());

    return map;
}

/** Expose navigation map globals for E2E testing */
function exposeNavTestGlobals(state: NavState, tileRange: TileRange): void {
    globalThis.__navMap = state.map;
    globalThis.__navMapWorld = state.mapWorld;
    globalThis.__navMapCenterTileX = tileRange.centerTileX;
    globalThis.__navMapCenterTileZ = tileRange.centerTileZ;
    (globalThis as unknown as { __leafletMap?: L.Map }).__leafletMap = state.map;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create the navigation map handler.
 *
 * @param state  Shared mutable NavState (same reference passed to all nav modules)
 * @param deps   Callbacks and stores from main.ts
 */
// eslint-disable-next-line max-lines-per-function -- factory function encapsulates module state via closures
export function createNavMapHandler(state: NavState, deps: NavMapDeps): NavMapHandler {

    // ── Map lifecycle ───────────────────────────────────────────────

    function cleanupNavMap(): void {
        if (state.map) {
            try { state.map.remove(); } catch { /* already removed */ }
        }
        state.map = undefined;
        deps.navigationStore.setPlayerMarker(undefined);
        state.routePolyline = undefined;
        state.playerToNextLine = undefined;
        state.stopMarkers = [];
    }

    // ── Tile range helpers ──────────────────────────────────────────

    function calculateTileRangeForView(stops: RouteStop[]): TileRange {
        const viewWorld = deps.navigationStore.viewWorld;
        const viewCoords = stops.map(stop => toViewCoords(stop.x, stop.z, stop.world, viewWorld));
        const xs = viewCoords.map(c => c.x);
        const zs = viewCoords.map(c => c.z);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minZ = Math.min(...zs);
        const maxZ = Math.max(...zs);
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;

        const { tileX: minTileX, tileZ: minTileZ } = getTileCoords(minX - 256, minZ - 256, TILE_CONFIG.tileSize);
        const { tileX: maxTileX, tileZ: maxTileZ } = getTileCoords(maxX + 256, maxZ + 256, TILE_CONFIG.tileSize);
        const { tileX: centerTileX, tileZ: centerTileZ } = getTileCoords(centerX, centerZ, TILE_CONFIG.tileSize);

        return { minTileX, maxTileX, minTileZ, maxTileZ, centerTileX, centerTileZ };
    }

    function calculateTileRangeFromView(centerTileX: number, centerTileZ: number): TileRange | undefined {
        if (!state.map) { return undefined; }

        const bounds = state.map.getBounds();
        const minDx = Math.floor(bounds.getWest() / TILE_CONFIG.tileSize);
        const maxDx = Math.ceil(bounds.getEast() / TILE_CONFIG.tileSize);
        const minDz = -Math.ceil(bounds.getNorth() / TILE_CONFIG.tileSize);
        const maxDz = -Math.floor(bounds.getSouth() / TILE_CONFIG.tileSize);

        const minTileX = centerTileX + minDx;
        const maxTileX = centerTileX + maxDx;
        const minTileZ = centerTileZ + minDz;
        const maxTileZ = centerTileZ + maxDz;
        const viewCenterTileX = Math.floor((minTileX + maxTileX) / 2);
        const viewCenterTileZ = Math.floor((minTileZ + maxTileZ) / 2);

        return { minTileX, maxTileX, minTileZ, maxTileZ, centerTileX: viewCenterTileX, centerTileZ: viewCenterTileZ };
    }

    // ── Tile loading ────────────────────────────────────────────────

    function loadNavMapTiles(options: LoadNavMapTilesOptions): void {
        const { manifest, worldId, tileRange, addedToMap, mapCenterTileX, mapCenterTileZ } = options;
        if (!state.map) { return; }
        const { minTileX, maxTileX, minTileZ, maxTileZ, centerTileX, centerTileZ } = tileRange;
        const positionCenterX = mapCenterTileX ?? centerTileX;
        const positionCenterZ = mapCenterTileZ ?? centerTileZ;
        const currentZoom = state.map.getZoom();

        debugTiles('loadNavMapTiles: world=%s tileRange=[%d,%d]->[%d,%d] center=[%d,%d] posCenter=[%d,%d] zoom=%d',
            worldId, minTileX, minTileZ, maxTileX, maxTileZ, centerTileX, centerTileZ, positionCenterX, positionCenterZ, currentZoom);

        const tileContext: TileLoadContext = { map: state.map, manifest, worldId, minTileX, maxTileX, minTileZ, maxTileZ, positionCenterX, positionCenterZ, addedToMap };

        const z4 = loadZoom4Tiles(tileContext);
        debugTiles('loadNavMapTiles: zoom4 loaded=%d skipped=%d (not in manifest)', z4.loaded, z4.skipped);

        let z8 = { loaded: 0, skipped: 0 };
        if (currentZoom > -2) {
            z8 = loadZoom8Tiles(tileContext);
        } else {
            debugTiles('loadNavMapTiles: skipping zoom8 tiles (currentZoom=%d <= -2)', currentZoom);
        }

        debugTiles('loadNavMapTiles: zoom8 loaded=%d skipped=%d (not in manifest)', z8.loaded, z8.skipped);
        debugTiles('loadNavMapTiles: TOTAL loaded=%d (zoom4=%d zoom8=%d)', z4.loaded + z8.loaded, z4.loaded, z8.loaded);
    }

    // ── Route markers ───────────────────────────────────────────────

    function createRouteMarkersUnified(
        allStops: RouteStop[],
        centerTileX: number,
        centerTileZ: number,
        completedKeys: Set<string>,
    ): L.LatLngExpression[] {
        if (!state.map) { return []; }
        const routePoints: L.LatLngExpression[] = [];
        state.stopMarkers = [];

        let incompleteIndex = 0;
        const viewWorld = deps.navigationStore.viewWorld;
        const viewIsNether = isNether(viewWorld);

        for (const stop of allStops) {
            const viewCoords = toViewCoords(stop.x, stop.z, stop.world, viewWorld);
            const { lat, lng } = toLeafletCoordsRelative(viewCoords.x, viewCoords.z, centerTileX, centerTileZ, TILE_CONFIG.tileSize);
            const isCompleted = Boolean(stop.cartItem && completedKeys.has(getTradeKey(stop.cartItem.trade)));

            if (!isCompleted) {
                routePoints.push([lat, lng]);
                incompleteIndex++;
            }

            const isCrossWorld = stop.isNether !== viewIsNether;
            const netherClass = stop.isNether ? ' nav-route-marker--nether' : '';
            const crossWorldClass = isCrossWorld ? ' nav-route-marker--cross-world' : '';
            const completedClass = isCompleted ? ' nav-route-marker--completed' : '';
            const displayIndex = isCompleted ? 0 : incompleteIndex;

            const markerIcon = L.divIcon({
                className: `nav-route-marker${netherClass}${crossWorldClass}${completedClass}`,
                html: buildMarkerContent(isCompleted, displayIndex, stop.isNether),
                iconSize: [36, 36],
                iconAnchor: [18, 18],
            });

            const marker = L.marker([lat, lng], { icon: markerIcon })
                .bindTooltip(buildStopTooltip(stop, isCompleted), { permanent: false, direction: 'top', offset: [0, -18] })
                .addTo(state.map);

            marker.on('click', () => deps.toggleStopCompletion(stop, allStops));
            state.stopMarkers.push(marker);
        }

        return routePoints;
    }

    // ── Dynamic tile loading ────────────────────────────────────────

    function bindDynamicTileLoading(manifest: Set<string>, addedToNavMap: Set<string>): void {
        if (!state.map) { return; }
        const loadVisibleNavMapTiles = () => {
            const viewTileRange = calculateTileRangeFromView(state.centerTileX, state.centerTileZ);
            if (viewTileRange) {
                debugTiles('loadVisibleNavMapTiles: view range [%d,%d]->[%d,%d]',
                    viewTileRange.minTileX, viewTileRange.minTileZ, viewTileRange.maxTileX, viewTileRange.maxTileZ);
                loadNavMapTiles({
                    manifest,
                    worldId: deps.navigationStore.viewWorld,
                    tileRange: viewTileRange,
                    addedToMap: addedToNavMap,
                    mapCenterTileX: state.centerTileX,
                    mapCenterTileZ: state.centerTileZ,
                });
            }
        };
        state.map.on('moveend', loadVisibleNavMapTiles);
        state.map.on('zoomend', loadVisibleNavMapTiles);
    }

    // ── Map initialization ──────────────────────────────────────────

    async function initNavigationMapDialog(route: RouteStop[], _targetWorld?: string): Promise<void> {
        const container = document.querySelector('#nav-dialog-map-container');
        if (!container) {
            debugMap('Map container not found');
            return;
        }

        cleanupNavMap();
        state.currentRoute = route;
        globalThis.__navCurrentRoute = state.currentRoute;

        const allStops = deps.getAllCartStops();

        if (allStops.length === 0) {
            container.innerHTML = `<p class="${CSS_CLASSES.CART_EMPTY}" style="text-align: center; padding: 20px; color: var(--color-text-muted);">No route to display</p>`;
            state.currentWorldRoute = [];
            debugMap('Empty route, no map displayed');
            return;
        }

        container.innerHTML = '';
        const worldToShow = deps.navigationStore.viewWorld;
        state.mapWorld = worldToShow;
        state.currentWorldRoute = allStops;
        globalThis.__navCurrentWorldRoute = allStops;

        const tileRange = calculateTileRangeForView(allStops);
        state.centerTileX = tileRange.centerTileX;
        state.centerTileZ = tileRange.centerTileZ;

        state.map = createNavLeafletMap(container as HTMLElement, () => deps.onMapDrag());
        exposeNavTestGlobals(state, tileRange);

        const routePoints = createRouteMarkersUnified(
            allStops, tileRange.centerTileX, tileRange.centerTileZ,
            deps.navigationStore.progress.completedKeys,
        );
        state.routePolyline = L.polyline(routePoints, {
            color: '#3b82f6', weight: 3, opacity: 0.8, dashArray: '10, 5',
        }).addTo(state.map);

        if (routePoints.length > 0) {
            state.map.fitBounds(L.latLngBounds(routePoints), { padding: [50, 50] });
        }

        const manifest = await loadTileManifest();
        const addedToNavMap = new Set<string>();
        loadNavMapTiles({ manifest, worldId: worldToShow, tileRange, addedToMap: addedToNavMap });
        bindDynamicTileLoading(manifest, addedToNavMap);
    }

    // ── Return public API ───────────────────────────────────────────

    return {
        initNavigationMapDialog,
        createRouteMarkersUnified,
        cleanupNavMap,
    };
}
