/**
 * Navigation updates module — route recalculation, distance display,
 * player marker, animation loop, and map centering.
 *
 * All functions operate on the shared NavState + external deps.
 *
 * @module navigation/nav-updates
 */

// eslint-disable-next-line sonarjs/no-wildcard-import -- Leaflet's L namespace is idiomatic
import * as L from 'leaflet';

import { NAVIGATION } from '../constants.js';
import { debugInterpolation } from '../debug.js';
import {
    calculateRouteDistance,
    getTradeKey,
    getWorldId,
    getZoomForHeight,
    isNether,
    toLeafletCoordsRelative,
    toViewCoords,
} from '../library.js';
import { TILE_CONFIG } from '../map/index.js';
import type { RouteStop } from '../types.js';
import type { NavState } from './nav-map.js';
import type { NavMapHandler } from './nav-map.js';

// ============================================================================
// Dependencies and handler interface
// ============================================================================

/** Dependencies injected by main.ts */
export interface NavUpdatesDeps {
    navigationStore: {
        playerPosition: { x: number; y: number; z: number; world: string; yaw?: number | undefined } | undefined;
        playerName: string;
        isActive: boolean;
        mode: 'follow' | 'manual';
        viewWorld: string;
        progress: { completedKeys: Set<string>; currentIndex: number };
        mapObjects: { playerMarker: L.Marker | undefined };
        markStopComplete: (key: string) => void;
        setPlayerMarker: (marker: L.Marker | undefined) => void;
    };
    cartStore: {
        items: { trade: { x: number; z: number; world: string; resultName: string; item1: { amount: number }; costName: string; resultAmount: number; y: number }; quantity: number }[];
    };
    navMapHandler: NavMapHandler;
    computeRoute: (origin?: { x: number; z: number; world: string }, excludeCompleted?: boolean) => RouteStop[];
    getAllCartStops: () => RouteStop[];
    renderCartDialog: () => void;
    playerPositionService: {
        getPositionAt: (name: string, timestamp: number) => { x: number; z: number; yaw?: number | undefined } | undefined;
    };
}

/** Public API returned by the factory */
export interface NavUpdatesHandler {
    recalculateRouteFromPlayer: () => void;
    updateRouteMarkersForCompletion: () => void;
    updatePlayerToNextLine: () => void;
    updateLiveDistance: () => void;
    checkAutoAdvance: () => void;
    updatePlayerMarker: () => void;
    updatePlayerMarkerPosition: (displayX: number, displayZ: number, yaw?: number) => void;
    startNavAnimationLoop: () => void;
    stopNavAnimationLoop: () => void;
    centerMapOnPlayer: () => void;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Build HTML snippets for the distance-to-next-stop display.
 *
 * @param playerPos - Current player position
 * @param playerPos.x - Player X coordinate
 * @param playerPos.z - Player Z coordinate
 * @param playerPos.world - Player world identifier
 * @param stop - The next route stop
 * @returns Distance HTML for inline display and expanded dialog
 */
function buildStopDistanceHtml(
    playerPos: { x: number; z: number; world: string },
    stop: RouteStop,
): { distanceHtml: string; dialogHtml: string } {
    const stopWorld = getWorldId(stop.world);
    const isNetherShop = stopWorld.includes('nether');
    const distance = calculateRouteDistance(
        playerPos.x, playerPos.z, playerPos.world,
        stop.x, stop.z, stop.world,
    );
    const itemName = stop.cartItem?.trade.resultName ?? 'Next stop';
    const quantity = stop.cartItem?.quantity ?? 1;
    const distanceText = Math.round(distance).toLocaleString();
    const worldIndicator = isNetherShop ? '🔥 ' : '';
    const distanceHtml = `<span class="distance-label">→ ${worldIndicator}${itemName}:</span><span class="distance-value">${distanceText} blocks</span>`;

    const coordsText = isNetherShop
        ? `${stop.x}, ${stop.y}, ${stop.z} (Nether → OW: ${stop.displayX}, ${stop.displayZ})`
        : `${stop.x}, ${stop.y}, ${stop.z}`;
    const buyText = `${quantity}× ${itemName}`;
    const dialogHtml = `
        <div class="nav-info-row">
            <span class="nav-info-label">📍</span>
            <span class="nav-info-coords">${coordsText}</span>
        </div>
        <div class="nav-info-row">
            <span class="nav-info-label">🛒</span>
            <span class="nav-info-item">${worldIndicator}${buyText}</span>
        </div>
        <div class="nav-info-row">
            <span class="nav-info-label">↗</span>
            <span class="nav-info-distance">${Math.round(distance).toLocaleString()} blocks</span>
        </div>
    `;
    return { distanceHtml, dialogHtml };
}

/**
 * Create the navigation updates handler.
 *
 * @param state  Shared mutable NavState
 * @param deps   Callbacks and stores from main.ts
 * @returns Handler object with navigation update functions
 */
// eslint-disable-next-line max-lines-per-function -- factory function encapsulates module state via closures
export function createNavUpdatesHandler(state: NavState, deps: NavUpdatesDeps): NavUpdatesHandler {

    // ── Route recalculation ─────────────────────────────────────────

    function recalculateRouteFromPlayer(): void {
        const playerPos = deps.navigationStore.playerPosition;
        if (!state.map || !playerPos) { return; }

        const fullRoute = deps.computeRoute(playerPos, true);
        state.currentRoute = fullRoute;

        const allStops = deps.getAllCartStops();
        const stopsChanged = state.currentWorldRoute.length !== allStops.length ||
            allStops.some((stop, index) => {
                const oldStop = state.currentWorldRoute[index];
                return stop.x !== oldStop?.x || stop.z !== oldStop.z;
            });

        if (!stopsChanged) { return; }

        state.currentWorldRoute = allStops;
        globalThis.__navCurrentWorldRoute = allStops;

        if (state.routePolyline) {
            state.map.removeLayer(state.routePolyline);
            state.routePolyline = undefined;
        }

        for (const marker of state.stopMarkers) {
            state.map.removeLayer(marker);
        }
        state.stopMarkers = [];

        if (allStops.length > 0) {
            const routePoints = deps.navMapHandler.createRouteMarkersUnified(
                allStops, state.centerTileX, state.centerTileZ,
                deps.navigationStore.progress.completedKeys,
            );

            if (routePoints.length > 0) {
                state.routePolyline = L.polyline(routePoints, {
                    color: '#3b82f6', weight: 3, opacity: 0.8, dashArray: '10, 5',
                }).addTo(state.map);
            }
        }
    }

    function updateRouteMarkersForCompletion(): void {
        if (!state.map) { return; }

        for (const marker of state.stopMarkers) {
            state.map.removeLayer(marker);
        }
        state.stopMarkers = [];

        if (state.routePolyline) {
            state.map.removeLayer(state.routePolyline);
            state.routePolyline = undefined;
        }

        const allStops = deps.getAllCartStops();
        if (allStops.length === 0) { return; }

        const routePoints = deps.navMapHandler.createRouteMarkersUnified(
            allStops, state.centerTileX, state.centerTileZ,
            deps.navigationStore.progress.completedKeys,
        );

        if (routePoints.length > 0) {
            state.routePolyline = L.polyline(routePoints, {
                color: '#3b82f6', weight: 3, opacity: 0.8, dashArray: '10, 5',
            }).addTo(state.map);
        }
    }

    // ── Player-to-next line ─────────────────────────────────────────

    function updatePlayerToNextLine(): void {
        const playerPos = deps.navigationStore.playerPosition;
        if (!state.map || !playerPos) { return; }

        if (state.playerToNextLine) {
            state.map.removeLayer(state.playerToNextLine);
            state.playerToNextLine = undefined;
        }

        const nextStop = state.currentWorldRoute.find(stop =>
            stop.cartItem && !deps.navigationStore.progress.completedKeys.has(getTradeKey(stop.cartItem.trade)),
        );

        if (!nextStop) { return; }

        const viewWorld = deps.navigationStore.viewWorld;
        const playerViewCoords = toViewCoords(playerPos.x, playerPos.z, playerPos.world, viewWorld);

        const playerCoords = toLeafletCoordsRelative(
            playerViewCoords.x, playerViewCoords.z,
            state.centerTileX, state.centerTileZ, TILE_CONFIG.tileSize,
        );

        const stopViewCoords = toViewCoords(nextStop.x, nextStop.z, nextStop.world, viewWorld);
        const stopCoords = toLeafletCoordsRelative(
            stopViewCoords.x, stopViewCoords.z,
            state.centerTileX, state.centerTileZ, TILE_CONFIG.tileSize,
        );

        state.playerToNextLine = L.polyline(
            [[playerCoords.lat, playerCoords.lng], [stopCoords.lat, stopCoords.lng]],
            { color: '#22c55e', weight: 3, opacity: 0.9, dashArray: '5, 8' },
        ).addTo(state.map);
    }

    // ── Live distance display ───────────────────────────────────────

    function updateLiveDistance(): void {
        const liveDistance = document.querySelector('#nav-live-distance');
        const dialogDistance = document.querySelector('#nav-dialog-distance');

        if (!deps.navigationStore.playerPosition) { return; }

        const route = state.currentRoute.length > 0
            ? state.currentRoute
            : deps.computeRoute(deps.navigationStore.playerPosition, true);

        const COMPLETE_HTML = '<span class="distance-label">Route complete! 🎉</span>';
        const currentStop = route[0];
        const { distanceHtml, dialogHtml } = currentStop
            ? buildStopDistanceHtml(deps.navigationStore.playerPosition, currentStop)
            : { distanceHtml: COMPLETE_HTML, dialogHtml: COMPLETE_HTML };

        if (liveDistance) { liveDistance.innerHTML = distanceHtml; }
        if (dialogDistance) { dialogDistance.innerHTML = dialogHtml; }
    }

    // ── Auto-advance ────────────────────────────────────────────────

    function checkAutoAdvance(): void {
        if (!deps.navigationStore.playerPosition || state.currentRoute.length === 0) { return; }

        const currentStop = state.currentRoute.find(stop =>
            stop.cartItem && !deps.navigationStore.progress.completedKeys.has(getTradeKey(stop.cartItem.trade)),
        );
        if (!currentStop?.cartItem) { return; }

        const distance = calculateRouteDistance(
            deps.navigationStore.playerPosition.x, deps.navigationStore.playerPosition.z, deps.navigationStore.playerPosition.world,
            currentStop.x, currentStop.z, currentStop.world,
        );

        const yDistance = Math.abs(deps.navigationStore.playerPosition.y - currentStop.y);

        if (distance < NAVIGATION.ARRIVAL_THRESHOLD && yDistance < NAVIGATION.ARRIVAL_THRESHOLD) {
            const key = getTradeKey(currentStop.cartItem.trade);
            deps.navigationStore.markStopComplete(key);

            updateRouteMarkersForCompletion();
            updatePlayerToNextLine();
            updateLiveDistance();
            deps.renderCartDialog();
        }
    }

    // ── Player marker ───────────────────────────────────────────────

    function updatePlayerMarker(): void {
        const playerPos = deps.navigationStore.playerPosition;
        if (!state.map || !playerPos) { return; }

        const playerIsNether = isNether(playerPos.world);
        const viewWorld = deps.navigationStore.viewWorld;
        const displayCoords = toViewCoords(playerPos.x, playerPos.z, playerPos.world, viewWorld);

        const { lat, lng } = toLeafletCoordsRelative(
            displayCoords.x, displayCoords.z,
            state.centerTileX, state.centerTileZ, TILE_CONFIG.tileSize,
        );

        const rotation = playerPos.yaw === undefined ? 0 : playerPos.yaw + 180;
        const hasHeading = playerPos.yaw !== undefined;
        const netherClass = playerIsNether ? ' nav-player-marker--nether' : '';

        const playerIconHtml = hasHeading
            ? `<div class="nav-player-arrow" style="transform: rotate(${rotation}deg)"></div>`
            : '<div class="nav-player-arrow" style="transform: rotate(0deg)"></div>';

        let navPlayerMarker = deps.navigationStore.mapObjects.playerMarker;

        if (navPlayerMarker) {
            navPlayerMarker.setLatLng([lat, lng]);
            navPlayerMarker.setOpacity(1);
            const playerIcon = L.divIcon({
                className: `nav-player-marker${netherClass}`,
                html: playerIconHtml,
                iconSize: [26, 26],
                iconAnchor: [13, 13],
            });
            navPlayerMarker.setIcon(playerIcon);
        } else {
            const playerIcon = L.divIcon({
                className: `nav-player-marker${netherClass}`,
                html: playerIconHtml,
                iconSize: [26, 26],
                iconAnchor: [13, 13],
            });

            navPlayerMarker = L.marker([lat, lng], { icon: playerIcon, zIndexOffset: 1000 });
            navPlayerMarker.addTo(state.map);
            deps.navigationStore.setPlayerMarker(navPlayerMarker);
        }
    }

    function updatePlayerMarkerPosition(displayX: number, displayZ: number, yaw?: number): void {
        const navPlayerMarker = deps.navigationStore.mapObjects.playerMarker;
        if (!navPlayerMarker || !state.map) { return; }

        const { lat, lng } = toLeafletCoordsRelative(
            displayX, displayZ,
            state.centerTileX, state.centerTileZ, TILE_CONFIG.tileSize,
        );
        navPlayerMarker.setLatLng([lat, lng]);

        if (yaw !== undefined) {
            const markerElement = navPlayerMarker.getElement();
            const arrow = markerElement?.querySelector<HTMLElement>('.nav-player-arrow');
            if (arrow) {
                const rotation = yaw + 180;
                arrow.style.transform = `rotate(${rotation}deg)`;
            }
        }
    }

    // ── Animation loop ──────────────────────────────────────────────

    function startNavAnimationLoop(): void {
        stopNavAnimationLoop();

        function tick(): void {
            const playerPos = deps.navigationStore.playerPosition;
            if (!playerPos || !state.map) {
                state.animationFrameId = requestAnimationFrame(tick);
                return;
            }

            const playerName = deps.navigationStore.playerName;
            if (!playerName) {
                state.animationFrameId = requestAnimationFrame(tick);
                return;
            }

            const displayPos = deps.playerPositionService.getPositionAt(playerName, performance.now());

            if (displayPos) {
                const viewWorld = deps.navigationStore.viewWorld;
                const viewCoords = toViewCoords(
                    displayPos.x, displayPos.z,
                    playerPos.world,
                    viewWorld,
                );

                if (deps.navigationStore.mode === 'follow') {
                    // Pan the map to the interpolated position — spring smoothness is applied
                    // to the pan, not to the marker. The marker always stays at the same
                    // Leaflet coordinates as the map center, appearing fixed/sticky.
                    const { lat, lng } = toLeafletCoordsRelative(
                        viewCoords.x, viewCoords.z,
                        state.centerTileX, state.centerTileZ, TILE_CONFIG.tileSize,
                    );
                    state.map.setView([lat, lng], state.map.getZoom(), { animate: false });
                }

                updatePlayerMarkerPosition(viewCoords.x, viewCoords.z, displayPos.yaw);
            }

            state.animationFrameId = requestAnimationFrame(tick);
        }

        state.animationFrameId = requestAnimationFrame(tick);
        debugInterpolation('Animation loop started');
    }

    function stopNavAnimationLoop(): void {
        if (state.animationFrameId !== undefined) {
            cancelAnimationFrame(state.animationFrameId);
            state.animationFrameId = undefined;
            debugInterpolation('Animation loop stopped');
        }
    }

    // ── Map centering ───────────────────────────────────────────────

    function centerMapOnPlayer(): void {
        if (!state.map || !deps.navigationStore.playerPosition) { return; }

        const displayCoords = toViewCoords(
            deps.navigationStore.playerPosition.x,
            deps.navigationStore.playerPosition.z,
            deps.navigationStore.playerPosition.world,
            deps.navigationStore.viewWorld,
        );

        const { lat, lng } = toLeafletCoordsRelative(
            displayCoords.x, displayCoords.z,
            state.centerTileX, state.centerTileZ, TILE_CONFIG.tileSize,
        );

        const zoom = getZoomForHeight(deps.navigationStore.playerPosition.y);
        // Snap to position; the animation loop provides frame-by-frame smooth panning
        // from this point onward via spring interpolation.
        state.map.setView([lat, lng], zoom, { animate: false });
    }

    // ── Return public API ───────────────────────────────────────────

    return {
        recalculateRouteFromPlayer,
        updateRouteMarkersForCompletion,
        updatePlayerToNextLine,
        updateLiveDistance,
        checkAutoAdvance,
        updatePlayerMarker,
        updatePlayerMarkerPosition,
        startNavAnimationLoop,
        stopNavAnimationLoop,
        centerMapOnPlayer,
    };
}
