/**
 * Navigation map module — Leaflet map infrastructure, tile loading, and route markers.
 *
 * Manages the Leaflet map used during live navigation:
 * - Map creation and teardown
 * - Tile range calculation and tile loading (overview + detail)
 * - Unified route marker creation (completed/incomplete)
 * - Dynamic tile loading on pan/zoom
 *
 * Uses factory pattern to receive shared NavState + external deps.
 *
 * @module navigation/nav-map
 */

// eslint-disable-next-line sonarjs/no-wildcard-import -- Leaflet's L namespace is idiomatic
import * as L from 'leaflet';

import { CSS_CLASSES, WORLDS } from '../constants.js';
import { debugMap, debugTiles } from '../debug.js';
import {
    buildMarkerContent,
    buildStopTooltip,
    getTileCoords,
    getTradeKey,
    isNether,
    toLeafletCoordsRelative,
    toViewCoords,
} from '../library.js';
import type { LightingController } from '../lighting/lighting-controller.js';
import type { LoadNavMapTilesOptions, TileRange } from '../map/index.js';
import {
    calculateOverviewCoords,
    loadTileManifest,
    loadTileToMap,
    TILE_CONFIG,
    tileExistsInManifest,
} from '../map/index.js';
import { getManifestEntries } from '../map/index.js';
import type { RouteStop } from '../types.js';
import { shouldDisableAnimations } from '../types.js';

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

/** 
 * Create initial NavState with default values
 * @returns Fresh NavState object with all fields at their defaults
 */
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
    toggleStopCompletion: (stop: RouteStop, route: RouteStop[]) => void;
    onMapDrag: () => void;
    /** Optional lighting controller for dynamic terrain lighting */
    lightingController?: LightingController;
}

/** Public API returned by the factory */
export interface NavMapHandler {
    initNavigationMapDialog: (route: RouteStop[], targetWorld?: string) => Promise<void>;
    createRouteMarkersUnified: (
        allStops: RouteStop[],
        centerTileX: number,
        centerTileZ: number,
        completedKeys: Set<string>,
    ) => L.LatLngExpression[];
    cleanupNavMap: () => void;
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

function loadOverviewTiles(context: TileLoadContext): { loaded: number; skipped: number } {
    const { map, manifest, worldId, minTileX, maxTileX, minTileZ, maxTileZ, positionCenterX, positionCenterZ, addedToMap } = context;
    let loaded = 0;
    let skipped = 0;
    const overviewSize = TILE_CONFIG.overviewTileBlocks;
    const ratio = TILE_CONFIG.detailToOverviewRatio;
    const overviewTiles = new Set<string>();
    for (let tz = minTileZ - 1; tz <= maxTileZ + 1; tz++) {
        for (let tx = minTileX - 1; tx <= maxTileX + 1; tx++) {
            const ov = calculateOverviewCoords(tx, tz);
            const key = `${ov.x},${ov.z}`;
            if (overviewTiles.has(key)) { continue; }
            overviewTiles.add(key);
            if (tileExistsInManifest(manifest, worldId, TILE_CONFIG.overviewTileBlocks, ov.x, ov.z)) {
                loaded++;
                const startDetailX = ov.x * ratio;
                const startDetailZ = ov.z * ratio;
                const dx = startDetailX - positionCenterX;
                const dy = startDetailZ - positionCenterZ;
                const bounds: L.LatLngBoundsExpression = [
                    [-dy * TILE_CONFIG.tileSize - overviewSize, dx * TILE_CONFIG.tileSize],
                    [-dy * TILE_CONFIG.tileSize, dx * TILE_CONFIG.tileSize + overviewSize],
                ];
                loadTileToMap({ map, worldId, bounds, addedToMap, zoom: TILE_CONFIG.fallbackZoom, tx: ov.x, tz: ov.z, pane: 'tilesOverview' });
            } else {
                skipped++;
            }
        }
    }
    return { loaded, skipped };
}

function loadDetailTiles(context: TileLoadContext): { loaded: number; skipped: number } {
    const { map, manifest, worldId, minTileX, maxTileX, minTileZ, maxTileZ, positionCenterX, positionCenterZ, addedToMap } = context;
    let loaded = 0;
    let skipped = 0;
    for (let tz = minTileZ - 1; tz <= maxTileZ + 1; tz++) {
        for (let tx = minTileX - 1; tx <= maxTileX + 1; tx++) {
            if (tileExistsInManifest(manifest, worldId, TILE_CONFIG.tileSize, tx, tz)) {
                loaded++;
                const relativeX = tx - positionCenterX;
                const relativeZ = tz - positionCenterZ;
                const bounds: L.LatLngBoundsExpression = [
                    [-relativeZ * TILE_CONFIG.tileSize - TILE_CONFIG.tileSize, relativeX * TILE_CONFIG.tileSize],
                    [-relativeZ * TILE_CONFIG.tileSize, relativeX * TILE_CONFIG.tileSize + TILE_CONFIG.tileSize],
                ];
                loadTileToMap({ map, worldId, tx, tz, bounds, addedToMap, zoom: TILE_CONFIG.maxZoom, pane: 'tilesDetail' });
            } else {
                skipped++;
            }
        }
    }
    return { loaded, skipped };
}

/**
 * Create a Leaflet map configured for navigation
 * @param container - DOM element to mount the Leaflet map into
 * @param onMapDrag - Callback fired when the user starts dragging the map
 * @returns Configured Leaflet map instance
 */
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

    map.createPane('tilesOverview').style.zIndex = '350';
    map.createPane('tilesDetail').style.zIndex = '360';
    L.control.zoom({ position: 'bottomleft' }).addTo(map);

    map.on('dragstart', onMapDrag);

    return map;
}

/**
 * Expose navigation map globals for E2E testing
 * @param state - Shared mutable NavState
 * @param tileRange - The tile range calculated for the current route
 */
function exposeNavTestGlobals(state: NavState, tileRange: TileRange): void {
    globalThis.__navMap = state.map;
    globalThis.__navMapWorld = state.mapWorld;
    globalThis.__navMapCenterTileX = tileRange.centerTileX;
    globalThis.__navMapCenterTileZ = tileRange.centerTileZ;
    globalThis.__leafletMap = state.map;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create the navigation map handler.
 *
 * @param state  Shared mutable NavState (same reference passed to all nav modules)
 * @param deps   Callbacks and stores from main.ts
 * @returns Handler object with nav map lifecycle and rendering functions
 */
// eslint-disable-next-line max-lines-per-function -- factory function encapsulates module state via closures
export function createNavMapHandler(state: NavState, deps: NavMapDeps): NavMapHandler {

    // ── Map lifecycle ───────────────────────────────────────────────

    function cleanupNavMap(): void {
        deps.lightingController?.detach();
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

        const z4 = loadOverviewTiles(tileContext);
        debugTiles('loadNavMapTiles: overview loaded=%d skipped=%d (not in manifest)', z4.loaded, z4.skipped);

        let z8 = { loaded: 0, skipped: 0 };
        if (currentZoom > -2) {
            z8 = loadDetailTiles(tileContext);
        } else {
            debugTiles('loadNavMapTiles: skipping detail tiles (currentZoom=%d <= -2)', currentZoom);
        }

        debugTiles('loadNavMapTiles: detail loaded=%d skipped=%d (not in manifest)', z8.loaded, z8.skipped);
        debugTiles('loadNavMapTiles: TOTAL loaded=%d (overview=%d detail=%d)', z4.loaded + z8.loaded, z4.loaded, z8.loaded);
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

    async function initNavigationMapDialog(route: RouteStop[], targetWorld?: string): Promise<void> {
        const container = document.querySelector('#nav-dialog-map-container');
        if (!(container instanceof HTMLElement)) {
            debugMap('Map container not found');
            return;
        }

        cleanupNavMap();
        state.currentRoute = route;
        globalThis.__navCurrentRoute = state.currentRoute;

        if (route.length === 0) {
            container.innerHTML = `<p class="${CSS_CLASSES.CART_EMPTY}" style="text-align: center; padding: 20px; color: var(--color-text-muted);">No route to display</p>`;
            state.currentWorldRoute = [];
            debugMap('Empty route, no map displayed');
            return;
        }

        container.innerHTML = '';
        const worldToShow = targetWorld ?? deps.navigationStore.viewWorld;
        state.mapWorld = worldToShow;
        // Use optimized route order for display rather than unordered cart insertion order
        state.currentWorldRoute = route;
        globalThis.__navCurrentWorldRoute = route;

        const tileRange = calculateTileRangeForView(route);
        state.centerTileX = tileRange.centerTileX;
        state.centerTileZ = tileRange.centerTileZ;

        state.map = createNavLeafletMap(container, () => deps.onMapDrag());
        exposeNavTestGlobals(state, tileRange);

        const routePoints = createRouteMarkersUnified(
            route, tileRange.centerTileX, tileRange.centerTileZ,
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
        loadNavMapTiles({ manifest, tileRange, worldId: worldToShow, addedToMap: addedToNavMap });
        bindDynamicTileLoading(manifest, addedToNavMap);

        // Attach lighting overlay to the map
        if (deps.lightingController) {
            const entries = getManifestEntries();
            void deps.lightingController.attach(
                state.map,
                tileRange.centerTileX,
                tileRange.centerTileZ,
                entries,
            );
        }
    }

    // ── Return public API ───────────────────────────────────────────

    return {
        initNavigationMapDialog,
        createRouteMarkersUnified,
        cleanupNavMap,
    };
}
