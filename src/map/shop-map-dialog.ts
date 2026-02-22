/**
 * Shop Map Dialog Module
 * 
 * Displays a Leaflet map centered on a shop location with:
 * - Tile loading at zoom levels 4 and 8
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
import { clearAllInterpolators,getInterpolator } from '../stores/player-interpolator.js';
import type { Player } from '../types.js';
import { shouldDisableAnimations } from '../types.js';
import type { MapTileContext } from './index.js';
import {
    calculateZoom4Coords,
    fetchPlayers,
    getCachedTileUrl,
    getPlayerWorld,
    loadTileManifest,
    setCachedTileUrl,
    TILE_CONFIG,
    tileExistsInManifest,
    ZOOM4_TILE_SIZE} from './index.js';

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
    addedToMapZoom4: Set<string>;
    addedToMapZoom8: Set<string>;
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
        const interpolator = getInterpolator(player.name);
        interpolator.pushSample({
            x: player.position.x,
            y: player.position.y,
            z: player.position.z,
            yaw: player.rotation?.yaw,
            timestamp: now
        });
    }
    return cachedPlayers;
}

function loadZoom4TileToShopMap(context: ShopMapTileContext, z4x: number, z4z: number): void {
    const { worldId, centerTileX, centerTileZ, addedToMapZoom4, manifest } = context;
    const mapKey = `z4:${z4x},${z4z}`;
    if (addedToMapZoom4.has(mapKey)) { return; }
    addedToMapZoom4.add(mapKey);
    
    if (!tileExistsInManifest(manifest, worldId, 8192, z4x, z4z)) { return; }
    
    const startZ8X = z4x * 16;
    const startZ8Z = z4z * 16;
    const dx = startZ8X - centerTileX;
    const dy = startZ8Z - centerTileZ;
    const bounds: L.LatLngBoundsExpression = [
        [-dy * TILE_CONFIG.tileSize - ZOOM4_TILE_SIZE, dx * TILE_CONFIG.tileSize],
        [-dy * TILE_CONFIG.tileSize, dx * TILE_CONFIG.tileSize + ZOOM4_TILE_SIZE]
    ];
    
    const cachedBlobUrl = getCachedTileUrl(worldId, 4, z4x, z4z);
    if (cachedBlobUrl) {
        if (leafletMap) { L.imageOverlay(cachedBlobUrl, bounds, { pane: 'tilesZoom4' }).addTo(leafletMap); }
        return;
    }

    const url = `${TILE_CONFIG.baseUrl}/${worldId}/${TILE_CONFIG.fallbackZoom}/${z4x}/${z4z}.png`;
    fetch(url)
        .then(response => (response.ok && leafletMap) ? response.blob() : undefined)
        .then(blob => {
            if (blob && leafletMap) {
                const blobUrl = URL.createObjectURL(blob);
                setCachedTileUrl(worldId, 4, z4x, z4z, blobUrl);
                L.imageOverlay(blobUrl, bounds, { pane: 'tilesZoom4' }).addTo(leafletMap);
            }
        })
        .catch(() => {});
}

function loadZoom8TileToShopMap(context: ShopMapTileContext, tx: number, tz: number, dx: number, dy: number): void {
    const { worldId, addedToMapZoom8, manifest } = context;
    const mapKey = `z8:${tx},${tz}`;
    if (addedToMapZoom8.has(mapKey)) { return; }
    addedToMapZoom8.add(mapKey);
    
    if (!tileExistsInManifest(manifest, worldId, 512, tx, tz)) { return; }
    
    const bounds: L.LatLngBoundsExpression = [
        [-dy * TILE_CONFIG.tileSize - TILE_CONFIG.tileSize, dx * TILE_CONFIG.tileSize],
        [-dy * TILE_CONFIG.tileSize, dx * TILE_CONFIG.tileSize + TILE_CONFIG.tileSize]
    ];
    
    const cachedBlobUrl = getCachedTileUrl(worldId, 8, tx, tz);
    if (cachedBlobUrl) {
        if (leafletMap) { L.imageOverlay(cachedBlobUrl, bounds, { pane: 'tilesZoom8' }).addTo(leafletMap); }
        return;
    }

    const url = `${TILE_CONFIG.baseUrl}/${worldId}/${TILE_CONFIG.maxZoom}/${tx}/${tz}.png`;
    fetch(url)
        .then(response => (response.ok && leafletMap) ? response.blob() : undefined)
        .then(blob => {
            if (blob && leafletMap) {
                const blobUrl = URL.createObjectURL(blob);
                setCachedTileUrl(worldId, 8, tx, tz, blobUrl);
                L.imageOverlay(blobUrl, bounds, { pane: 'tilesZoom8' }).addTo(leafletMap);
            }
        })
        .catch(() => {});
}

function loadVisibleShopMapTiles(context: ShopMapTileContext): void {
    if (!leafletMap) { return; }
    const bounds = leafletMap.getBounds();
    const currentZoom = leafletMap.getZoom();
    
    const minDx = Math.floor(bounds.getWest() / TILE_CONFIG.tileSize);
    const maxDx = Math.ceil(bounds.getEast() / TILE_CONFIG.tileSize);
    const minDy = -Math.ceil(bounds.getNorth() / TILE_CONFIG.tileSize);
    const maxDy = -Math.floor(bounds.getSouth() / TILE_CONFIG.tileSize);
    
    const zoom4Tiles = new Set<string>();
    for (let dy = minDy - 1; dy <= maxDy + 1; dy++) {
        for (let dx = minDx - 1; dx <= maxDx + 1; dx++) {
            const tx = context.centerTileX + dx;
            const tz = context.centerTileZ + dy;
            const z4 = calculateZoom4Coords(tx, tz);
            const key = `${z4.x},${z4.z}`;
            if (!zoom4Tiles.has(key)) {
                zoom4Tiles.add(key);
                loadZoom4TileToShopMap(context, z4.x, z4.z);
            }
        }
    }
    
    // Load zoom 8 (detail) tiles when zoomed in enough
    if (currentZoom > -3) {
        for (let dy = minDy; dy <= maxDy; dy++) {
            for (let dx = minDx; dx <= maxDx; dx++) {
                const tx = context.centerTileX + dx;
                const tz = context.centerTileZ + dy;
                loadZoom8TileToShopMap(context, tx, tz, dx, dy);
            }
        }
    }
}

/** Get interpolated or raw player position in Leaflet coordinates. */
function getPlayerLeafletCoords(player: Player, tileX: number, tileZ: number): { lat: number; lng: number } {
    const interpolator = getInterpolator(player.name);
    const interpPos = interpolator.getDisplayPosition(performance.now());
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
    
    if (!leafletMap || cachedPlayers.length === 0) { return; }

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
    const onScreenPlayers: Array<{ player: Player; coords: { lat: number; lng: number } }> = [];
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
        const screenPoint = leafletMap!.latLngToContainerPoint([coords.lat, coords.lng]);
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
        }).addTo(playerMarkersLayer!);
        onScreenPlayerMarkers.set(player.name.toLowerCase(), leafletMarker);
    }
}

/** Start rAF loop updating on-screen player marker positions from interpolators. */
function startShopMapAnimLoop(): void {
    if (shopMapAnimFrameId !== undefined) { return; }

    function tick(): void {
        const now = performance.now();
        for (const [name, marker] of onScreenPlayerMarkers) {
            const interpolator = getInterpolator(name);
            const pos = interpolator.getDisplayPosition(now);
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
    clearAllInterpolators();
}

/** Create Leaflet map configuration with optional animation disabling */
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
    
    // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- Leaflet's L.map()
    leafletMap = L.map(container, createMapConfig());
    
    // Create custom panes for proper z-ordering: zoom 4 below zoom 8
    // Default overlayPane z-index is 400, we put zoom4 below and zoom8 above
    leafletMap.createPane('tilesZoom4').style.zIndex = '350';
    leafletMap.createPane('tilesZoom8').style.zIndex = '360';
    
    const context: MapTileContext = {
        worldId,
        manifest,
        centerTileX: tileX,
        centerTileZ: tileZ,
        addedToMapZoom4: new Set<string>(),
        addedToMapZoom8: new Set<string>(),
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
        (globalThis as unknown as { __leafletMap?: L.Map }).__leafletMap = leafletMap;
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create shop map dialog handler
 */
export function createShopMapDialogHandler(deps: ShopMapDialogDependencies): ShopMapDialogHandler {
    const { onCloseFromCart, isOpenedFromCart, clearOpenedFromCart, getConfig } = deps;
    
    function open(x: number, y: number, z: number, world: string): void {
        const dialog = document.querySelector<HTMLDialogElement>(SELECTORS.MAP_DIALOG);
        const container = document.querySelector('#map-container');
        const coordsElement = document.querySelector('#map-coords');
        
        if (!dialog || !container || !coordsElement) {
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
                    container: container as HTMLElement,
                    coordinatesElement: coordsElement as HTMLElement,
                    playerRefreshMs: getConfig().dynmap.playerRefreshMs,
                    dialog,
                    worldId,
                    worldDisplay,
                    x, y, z,
                    tileX, tileZ,
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
