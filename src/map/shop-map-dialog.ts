/**
 * Shop Map Dialog Module
 * 
 * Displays a Leaflet map centered on a shop location with:
 * - Tile loading at overview and detail levels
 * - Player markers with edge indicators for off-screen players
 * - Coordinate display updating on pan/zoom
 * 
 * @module map/shop-map-dialog
 */

import L from 'leaflet';

import { SELECTORS } from '../constants.js';
import { createEdgeMarker, getWorldDisplayName, resolvePlayerLabelPositions } from '../dialogs/index.js';
import {
    calculateFitZoom,
    clampToCircle,
    fromLeafletCoordsRelative,
    getTileCoords,
    getWorldId,
    toLeafletCoords,
    toLeafletCoordsRelative} from '../library.js';
import { playerPositionService } from '../stores/player-position-service.js';
import type { Player } from '../types.js';
import { shouldDisableAnimations } from '../types.js';
import { fetchPlayers, getPlayerWorld } from './players.js';
import {
    calculateOverviewCoords,
    loadTileManifest,
    TILE_CONFIG,
    tileExistsInManifest} from './tile-loader.js';
import type { MapTileContext } from './tile-types.js';

// ============================================================================
// Module State
// ============================================================================

let leafletMap: L.Map | undefined;
let playerMarkersLayer: L.LayerGroup | undefined;
let cachedPlayers: Player[] = [];
let playerRefreshInterval: ReturnType<typeof setInterval> | undefined;
/** rAF ID for smooth player marker interpolation on the shop map */
let shopMapAnimFrameId: number | undefined;
/** Map of player name → L.Marker for on-screen (non-edge) player markers */
const onScreenPlayerMarkers = new Map<string, L.Marker>();
/** Current shop map tile reference coords (for coordinate conversion) */
let shopMapTileX = 0;
let shopMapTileZ = 0;

// ============================================================================
// Types
// ============================================================================

/** Tile context for shop map (different from navigation map) */
interface ShopMapTileContext {
    worldId: string;
    centerTileX: number;
    centerTileZ: number;
    addedToMapOverview: Set<string>;
    addedToMapDetail: Set<string>;
    manifest: Set<string>;
}

/** Parameters for setting up shop map */
interface ShopMapSetupParameters {
    container: HTMLElement;
    coordinatesElement: HTMLElement;
    dialog: HTMLDialogElement;
    worldId: string;
    worldDisplay: string;
    x: number;
    y: number;
    z: number;
    tileX: number;
    tileZ: number;
    manifest: Set<string>;
    playerRefreshMs: number;
}

/** Dependencies for shop map dialog */
export interface ShopMapDialogDependencies {
    /** Called when map dialog closes and was opened from cart */
    onCloseFromCart: () => void;
    /** Check if dialog was opened from cart */
    isOpenedFromCart: () => boolean;
    /** Reset the opened-from-cart flag */
    clearOpenedFromCart: () => void;
    /** Get app config (specifically dynmap.playerRefreshMs) */
    getConfig: () => { dynmap: { playerRefreshMs: number } };
}

/** Handler returned by factory */
export interface ShopMapDialogHandler {
    /** Open the map dialog at specified coordinates */
    open: (x: number, y: number, z: number, world: string) => void;
    /** Get the current Leaflet map instance (for testing) */
    getMap: () => L.Map | undefined;
}

// ============================================================================
// Helper Functions (module-level to satisfy unicorn/consistent-function-scoping)
// ============================================================================

async function fetchPlayersAndUpdateCache(): Promise<Player[]> {
    cachedPlayers = await fetchPlayers();
    // Feed each player's position to their interpolator
    const now = performance.now();
    for (const player of cachedPlayers) {
        playerPositionService.pushSample(player.name, {
            x: player.position.x,
            y: player.position.y,
            z: player.position.z,
            yaw: player.rotation?.yaw,
            timestamp: now
        });
    }
    return cachedPlayers;
}

function loadOverviewTileToShopMap(context: ShopMapTileContext, ovX: number, ovZ: number): void {
    const { worldId, centerTileX, centerTileZ, addedToMapOverview, manifest } = context;
    const mapKey = `ov:${ovX},${ovZ}`;
    if (addedToMapOverview.has(mapKey)) { return; }
    addedToMapOverview.add(mapKey);
    
    if (!tileExistsInManifest(manifest, worldId, TILE_CONFIG.overviewTileBlocks, ovX, ovZ)) { return; }
    
    const ratio = TILE_CONFIG.detailToOverviewRatio;
    const overviewSize = TILE_CONFIG.overviewTileBlocks;
    const startZ8X = ovX * ratio;
    const startZ8Z = ovZ * ratio;
    const dx = startZ8X - centerTileX;
    const dy = startZ8Z - centerTileZ;
    const bounds: L.LatLngBoundsExpression = [
        [-dy * TILE_CONFIG.tileSize - overviewSize, dx * TILE_CONFIG.tileSize],
        [-dy * TILE_CONFIG.tileSize, dx * TILE_CONFIG.tileSize + overviewSize]
    ];
    
    const url = `${TILE_CONFIG.baseUrl}/${worldId}/${TILE_CONFIG.fallbackZoom}/${ovX}/${ovZ}.${TILE_CONFIG.format}`;
    if (leafletMap) { L.imageOverlay(url, bounds, { pane: 'tilesOverview' }).addTo(leafletMap); }
}

function loadDetailTileToShopMap(context: ShopMapTileContext, tx: number, tz: number, dx: number, dy: number): void {
    const { worldId, addedToMapDetail, manifest } = context;
    const mapKey = `dt:${tx},${tz}`;
    if (addedToMapDetail.has(mapKey)) { return; }
    addedToMapDetail.add(mapKey);
    
    if (!tileExistsInManifest(manifest, worldId, TILE_CONFIG.tileSize, tx, tz)) { return; }
    
    const bounds: L.LatLngBoundsExpression = [
        [-dy * TILE_CONFIG.tileSize - TILE_CONFIG.tileSize, dx * TILE_CONFIG.tileSize],
        [-dy * TILE_CONFIG.tileSize, dx * TILE_CONFIG.tileSize + TILE_CONFIG.tileSize]
    ];
    
    const url = `${TILE_CONFIG.baseUrl}/${worldId}/${TILE_CONFIG.maxZoom}/${tx}/${tz}.${TILE_CONFIG.format}`;
    if (leafletMap) { L.imageOverlay(url, bounds, { pane: 'tilesDetail' }).addTo(leafletMap); }
}

function loadVisibleShopMapTiles(context: ShopMapTileContext): void {
    if (!leafletMap) { return; }
    const bounds = leafletMap.getBounds();
    const currentZoom = leafletMap.getZoom();
    
    const minDx = Math.floor(bounds.getWest() / TILE_CONFIG.tileSize);
    const maxDx = Math.ceil(bounds.getEast() / TILE_CONFIG.tileSize);
    const minDy = -Math.ceil(bounds.getNorth() / TILE_CONFIG.tileSize);
    const maxDy = -Math.floor(bounds.getSouth() / TILE_CONFIG.tileSize);
    
    const overviewTiles = new Set<string>();
    for (let dy = minDy - 1; dy <= maxDy + 1; dy++) {
        for (let dx = minDx - 1; dx <= maxDx + 1; dx++) {
            const tx = context.centerTileX + dx;
            const tz = context.centerTileZ + dy;
            const ov = calculateOverviewCoords(tx, tz);
            const key = `${ov.x},${ov.z}`;
            if (!overviewTiles.has(key)) {
                overviewTiles.add(key);
                loadOverviewTileToShopMap(context, ov.x, ov.z);
            }
        }
    }
    
    // Load zoom 8 (detail) tiles when zoomed in enough
    if (currentZoom > -3) {
        for (let dy = minDy; dy <= maxDy; dy++) {
            for (let dx = minDx; dx <= maxDx; dx++) {
                const tx = context.centerTileX + dx;
                const tz = context.centerTileZ + dy;
                loadDetailTileToShopMap(context, tx, tz, dx, dy);
            }
        }
    }
}

/**
 * Get interpolated or raw player position in Leaflet coordinates.
 * @param player - Player object with name and position
 * @param tileX - X tile coordinate of the center tile
 * @param tileZ - Z tile coordinate of the center tile
 * @returns Leaflet { lat, lng } coordinates for the player marker
 */
function getPlayerLeafletCoords(player: Player, tileX: number, tileZ: number): { lat: number; lng: number } {
    const interpPos = playerPositionService.getCurrentPosition(player.name);
    const posX = interpPos?.x ?? player.position.x;
    const posZ = interpPos?.z ?? player.position.z;
    return toLeafletCoordsRelative(posX, posZ, tileX, tileZ, TILE_CONFIG.tileSize);
}

function updateShopMapPlayerMarkers(
    dialog: HTMLDialogElement,
    container: HTMLElement,
    worldId: string,
    tileX: number,
    tileZ: number
): void {
    playerMarkersLayer?.clearLayers();
    onScreenPlayerMarkers.clear();
    for (const element of dialog.querySelectorAll('.player-edge-marker')) { element.remove(); }
    
    if (!leafletMap || !playerMarkersLayer || cachedPlayers.length === 0) { return; }
    const map = leafletMap;
    const markersLayer = playerMarkersLayer;

    const playersInWorld = cachedPlayers.filter(p => getPlayerWorld(p) === worldId);

    const mapCenter = leafletMap.getCenter();
    const containerRect = container.getBoundingClientRect();
    const containerRadius = Math.min(containerRect.width, containerRect.height) / 2;
    
    const point1 = leafletMap.containerPointToLatLng([containerRect.width / 2, containerRect.height / 2]);
    const point2 = leafletMap.containerPointToLatLng([containerRect.width / 2 + containerRadius, containerRect.height / 2]);
    const visibleRadiusMapUnits = Math.abs(point2.lng - point1.lng);
    
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;
    const edgeRadius = containerRect.width / 2 + 8;
    
    // Store tile coords for the rAF loop
    shopMapTileX = tileX;
    shopMapTileZ = tileZ;
    
    // Classify players as on-screen or edge
    const onScreenPlayers: { player: Player; coords: { lat: number; lng: number } }[] = [];
    for (const player of playersInWorld) {
        const playerCoords = getPlayerLeafletCoords(player, tileX, tileZ);
        const clamped = clampToCircle(playerCoords.lat, playerCoords.lng, mapCenter.lat, mapCenter.lng, visibleRadiusMapUnits);
        
        if (clamped.clamped) {
            const angle = Math.atan2(playerCoords.lat - mapCenter.lat, playerCoords.lng - mapCenter.lng);
            dialog.append(createEdgeMarker({ player, angle, centerX, centerY, edgeRadius, visibleRadiusMapUnits, playerCoords, mapCenter }));
        } else {
            onScreenPlayers.push({ player, coords: playerCoords });
        }
    }

    // Resolve label positions to avoid overlaps, then create Leaflet markers
    const screenMarkers = onScreenPlayers.map(({ player, coords }) => {
        const screenPoint = map.latLngToContainerPoint([coords.lat, coords.lng]);
        return { name: player.name, screenX: screenPoint.x, screenY: screenPoint.y };
    });
    const labelLayouts = resolvePlayerLabelPositions(screenMarkers);
    for (const [index, { player, coords }] of onScreenPlayers.entries()) {
        const cssClass = labelLayouts[index]?.cssClass;
        const labelClass = cssClass ? ` ${cssClass}` : '';
        const leafletMarker = L.marker([coords.lat, coords.lng], {
            icon: L.divIcon({
                className: 'leaflet-player-marker',
                html: `<span class="player-name${labelClass}">${player.name}</span>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            }),
            title: player.name
        }).addTo(markersLayer);
        onScreenPlayerMarkers.set(player.name.toLowerCase(), leafletMarker);
    }
}

/** Start rAF loop updating on-screen player marker positions from interpolators. */
function startShopMapAnimLoop(): void {
    if (shopMapAnimFrameId !== undefined) { return; }

    function tick(): void {
        const now = performance.now();
        for (const [name, marker] of onScreenPlayerMarkers) {
            const pos = playerPositionService.getPositionAt(name, now);
            if (!pos) { continue; }
            const coords = toLeafletCoordsRelative(pos.x, pos.z, shopMapTileX, shopMapTileZ, TILE_CONFIG.tileSize);
            marker.setLatLng([coords.lat, coords.lng]);
        }
        shopMapAnimFrameId = requestAnimationFrame(tick);
    }

    shopMapAnimFrameId = requestAnimationFrame(tick);
}

/** Stop the shop map rAF animation loop. */
function stopShopMapAnimLoop(): void {
    if (shopMapAnimFrameId !== undefined) {
        cancelAnimationFrame(shopMapAnimFrameId);
        shopMapAnimFrameId = undefined;
    }
    onScreenPlayerMarkers.clear();
    playerPositionService.clear();
}

/** Create Leaflet map configuration with optional animation disabling
 * @returns Leaflet MapOptions object with CRS.Simple and zoom settings
 */
function createMapConfig(): L.MapOptions {
    const animationOptions = shouldDisableAnimations() ? {
        fadeAnimation: false,
        zoomAnimation: false,
        markerZoomAnimation: false
    } : {};
    
    return {
        crs: L.CRS.Simple,
        minZoom: -5,
        maxZoom: 2,
        zoomControl: true,
        attributionControl: false,
        zoomSnap: 0,
        zoomDelta: 0.5,
        ...animationOptions
    };
}

function setupShopMap(parameters: ShopMapSetupParameters): void {
    const { container, coordinatesElement, dialog, worldId, worldDisplay, x, y, z, tileX, tileZ, manifest, playerRefreshMs } = parameters;
    
    leafletMap = L.map(container, createMapConfig());
    
    // Create custom panes for proper z-ordering: overview below detail
    // Default overlayPane z-index is 400, we put overview below and detail above
    leafletMap.createPane('tilesOverview').style.zIndex = '350';
    leafletMap.createPane('tilesDetail').style.zIndex = '360';
    
    const context: MapTileContext = {
        worldId,
        manifest,
        centerTileX: tileX,
        centerTileZ: tileZ,
        addedToMapOverview: new Set<string>(),
        addedToMapDetail: new Set<string>(),
    };
    
    const loadTiles = () => loadVisibleShopMapTiles(context);
    leafletMap.on('moveend', loadTiles);
    leafletMap.on('zoomend', loadTiles);
    
    const { lat: markerLat, lng: markerLng } = toLeafletCoords(x, z, TILE_CONFIG.tileSize);
    L.marker([markerLat, markerLng], {
        icon: L.divIcon({
            className: 'leaflet-pin-marker',
            iconSize: [24, 24],
            iconAnchor: [4, 24]
        })
    }).addTo(leafletMap);
    
    playerMarkersLayer = L.layerGroup().addTo(leafletMap);
    
    const updateCoordsLabel = (): void => {
        if (!leafletMap) { return; }
        const mapCenter = leafletMap.getCenter();
        const mcCoords = fromLeafletCoordsRelative(mapCenter.lat, mapCenter.lng, tileX, tileZ, TILE_CONFIG.tileSize);
        coordinatesElement.textContent = `${worldDisplay}: ${mcCoords.x}, ${y}, ${mcCoords.z}`;
    };
    
    const updatePlayerMarkers = () => updateShopMapPlayerMarkers(dialog, container, worldId, tileX, tileZ);
    
    const updateZoomClass = () => {
        if (leafletMap) {
            container.classList.toggle('zoomed-out', leafletMap.getZoom() < 0.5);
        }
    };
    
    void fetchPlayersAndUpdateCache().then(() => {
        if (!leafletMap) { return; }
        updatePlayerMarkers();
        startShopMapAnimLoop();
    });

    playerRefreshInterval = setInterval(() => {
        void fetchPlayersAndUpdateCache().then(() => {
            if (!leafletMap) { return; }
            updatePlayerMarkers();
        });
    }, playerRefreshMs);
    
    leafletMap.on('move', () => { updateCoordsLabel(); updatePlayerMarkers(); });
    leafletMap.on('zoomend', () => { updateCoordsLabel(); updatePlayerMarkers(); updateZoomClass(); });
    
    leafletMap.invalidateSize();
    const containerSize = leafletMap.getSize();
    const visibleSize = TILE_CONFIG.tileSize * 3;
    const smallerDimension = Math.min(containerSize.x, containerSize.y);
    const initialZoom = calculateFitZoom(smallerDimension, visibleSize);
    
    leafletMap.setView([markerLat, markerLng], initialZoom);
    loadTiles();
    updateZoomClass();
    
    // Expose map for E2E testing
    if (typeof globalThis !== 'undefined') {
        globalThis.__leafletMap = leafletMap;
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create shop map dialog handler
 * @param deps - External dependencies injected from main.ts
 * @returns Handler with open/close functions for the shop map dialog
 */
export function createShopMapDialogHandler(deps: ShopMapDialogDependencies): ShopMapDialogHandler {
    const { onCloseFromCart, isOpenedFromCart, clearOpenedFromCart, getConfig } = deps;
    
    function open(x: number, y: number, z: number, world: string): void {
        const dialog = document.querySelector<HTMLDialogElement>(SELECTORS.MAP_DIALOG);
        const container = document.querySelector('#map-container');
        const coordsElement = document.querySelector('#map-coords');
        
        if (!dialog || !(container instanceof HTMLElement) || !(coordsElement instanceof HTMLElement)) {
            return;
        }
        
        const worldId = getWorldId(world);
        const worldDisplay = getWorldDisplayName(world);
        coordsElement.textContent = `${worldDisplay}: ${x}, ${y}, ${z}`;
        
        if (playerRefreshInterval) {
            clearInterval(playerRefreshInterval);
            playerRefreshInterval = undefined;
        }
        stopShopMapAnimLoop();

        const closeButton = dialog.querySelector<HTMLElement>('#close-map');
        if (closeButton && !Object.hasOwn(closeButton.dataset, 'initialized')) {
            closeButton.dataset.initialized = 'true';
            closeButton.addEventListener('click', () => dialog.close());
        }

        dialog.addEventListener('close', () => {
            if (playerRefreshInterval) {
                clearInterval(playerRefreshInterval);
                playerRefreshInterval = undefined;
            }
            stopShopMapAnimLoop();
            if (isOpenedFromCart()) {
                clearOpenedFromCart();
                onCloseFromCart();
            }
        }, { once: true });
        
        const { tileX, tileZ } = getTileCoords(x, z, TILE_CONFIG.tileSize);
        dialog.showModal();
        
        requestAnimationFrame(() => {
            if (leafletMap) {
                try { leafletMap.remove(); } catch { /* already removed */ }
                leafletMap = undefined;
            }
            
            void loadTileManifest().then(manifest => {
                setupShopMap({
                    coordinatesElement: coordsElement,
                    playerRefreshMs: getConfig().dynmap.playerRefreshMs,
                    worldId,
                    worldDisplay,
                    x, y, z,
                    tileX, tileZ,
                    container,
                    dialog,
                    manifest
                });
            });
        });
    }
    
    return {
        open,
        getMap: () => leafletMap
    };
}
