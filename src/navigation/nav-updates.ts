/**
 * Navigation updates module — route recalculation, distance display,
 * player marker, animation loop, and map centering.
 *
 * All functions operate on the shared NavState + external deps.
 *
 * @module navigation/nav-updates
 */

import * as L from 'leaflet';

import {
    isNether,
    toOverworldEquivalent,
    toViewCoords,
    toLeafletCoordsRelative,
    calculateRouteDistance,
    getTradeKey,
    getZoomForHeight,
    getWorldId,
} from '../library.js';

import { TILE_CONFIG } from '../map/index.js';

import { NAVIGATION } from '../constants.js';

import type { RouteStop } from '../types.js';

import { debugInterpolation } from '../debug.js';

import type { NavState } from './nav-map.js';
import type { NavMapHandler } from './nav-map.js';

// ============================================================================
// Dependencies and handler interface
// ============================================================================

/** Dependencies injected by main.ts */
export interface NavUpdatesDeps {
    navigationStore: {
        playerPosition: { x: number; y: number; z: number; world: string; yaw?: number } | undefined;
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
        items: Array<{ trade: { x: number; z: number; world: string; resultName: string; item1: { amount: number }; costName: string; resultAmount: number; y: number }; quantity: number }>;
    };
    navMapHandler: NavMapHandler;
    computeRoute: (origin?: { x: number; z: number; world: string }, excludeCompleted?: boolean) => RouteStop[];
    getAllCartStops: () => RouteStop[];
    renderCartDialog: () => void;
    getInterpolator: (name: string) => {
        getDisplayPosition: (now: number) => { x: number; z: number; yaw?: number } | undefined;
    };
}

/** Public API returned by the factory */
export interface NavUpdatesHandler {
    recalculateRouteFromPlayer(): void;
    updateRouteMarkersForCompletion(): void;
    updatePlayerToNextLine(): void;
    updateLiveDistance(): void;
    checkAutoAdvance(): void;
    updatePlayerMarker(): void;
    updatePlayerMarkerPosition(displayX: number, displayZ: number, yaw?: number): void;
    startNavAnimationLoop(): void;
    stopNavAnimationLoop(): void;
    centerMapOnPlayer(): void;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create the navigation updates handler.
 *
 * @param state  Shared mutable NavState
 * @param deps   Callbacks and stores from main.ts
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
                return !oldStop || stop.x !== oldStop.x || stop.z !== oldStop.z;
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

        const playerDisplayCoords = toOverworldEquivalent(playerPos.x, playerPos.z, playerPos.world);

        const playerCoords = toLeafletCoordsRelative(
            playerDisplayCoords.x, playerDisplayCoords.z,
            state.centerTileX, state.centerTileZ, TILE_CONFIG.tileSize,
        );

        const stopCoords = toLeafletCoordsRelative(
            nextStop.displayX, nextStop.displayZ,
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

        let distanceHtml: string;
        let dialogHtml: string;

        if (route.length === 0) {
            distanceHtml = '<span class="distance-label">Route complete! 🎉</span>';
            dialogHtml = distanceHtml;
        } else {
            const currentStop = route[0]!;
            const stopWorld = getWorldId(currentStop.world);
            const isNetherShop = stopWorld.includes('nether');
            const distance = calculateRouteDistance(
                deps.navigationStore.playerPosition.x, deps.navigationStore.playerPosition.z, deps.navigationStore.playerPosition.world,
                currentStop.x, currentStop.z, currentStop.world,
            );
            const itemName = currentStop.cartItem?.trade.resultName ?? 'Next stop';
            const quantity = currentStop.cartItem?.quantity ?? 1;
            const distanceText = Math.round(distance).toLocaleString();
            const worldIndicator = isNetherShop ? '🔥 ' : '';
            distanceHtml = `<span class="distance-label">→ ${worldIndicator}${itemName}:</span><span class="distance-value">${distanceText} blocks</span>`;

            const coordsText = isNetherShop
                ? `${currentStop.x}, ${currentStop.y}, ${currentStop.z} (Nether → OW: ${currentStop.displayX}, ${currentStop.displayZ})`
                : `${currentStop.x}, ${currentStop.y}, ${currentStop.z}`;
            const buyText = `${quantity}× ${itemName}`;
            dialogHtml = `
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
        }

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

            const interpolator = deps.getInterpolator(playerName);
            const displayPos = interpolator.getDisplayPosition(performance.now());

            if (displayPos) {
                const viewWorld = deps.navigationStore.viewWorld;
                const viewCoords = toViewCoords(
                    displayPos.x, displayPos.z,
                    playerPos.world,
                    viewWorld,
                );
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
        state.map.flyTo([lat, lng], zoom, { duration: 0.3, easeLinearity: 0.5 });
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
