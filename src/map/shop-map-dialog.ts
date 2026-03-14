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
    getTileCoords,
    getWorldId,
    toLeafletCoords,
    toLeafletCoordsRelative} from '../library.js';
import { getConfig as getStoreConfig } from '../stores/config-store.js';
import { playerPositionService } from '../stores/player-position-service.js';
import {
    blocksPerTile as pyramidBlocksPerTile,
    detailLevel as pyramidDetailLevel} from '../tile-pyramid.js';
import type { Player } from '../types.js';
import { shouldDisableAnimations } from '../types.js';
import { fetchPlayers, getPlayerWorld } from './players.js';
import {
    loadTileManifest,
    TILE_CONFIG,
    tileExistsInManifest} from './tile-loader.js';

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

// Leaflet zoom thresholds for LOD switching
/**
 * Leaflet zoom level at which the detail (highest-resolution) tile level activates.
 * With a factor-2 pyramid, each coarser level activates 1 zoom unit lower.
 */
const ZOOM_SHOW_DETAIL = 1;

/**
 * Returns the pyramid level that should be displayed at the given Leaflet zoom.
 * With a factor-2 pyramid, each level is 1 zoom unit apart.
 *
 * @param zoom - Current Leaflet zoom level
 * @returns Active pyramid level index
 */
function getActivePyramidLevel(zoom: number): number {
    const detail = pyramidDetailLevel(getStoreConfig().tilePyramid);
    for (let l = detail; l > 0; l--) {
        if (zoom >= ZOOM_SHOW_DETAIL - (detail - l)) { return l; }
    }
    return 0;
}

/**\n * Show only the pane for the active pyramid level, hide all others.\n *\n * @param zoom - Current Leaflet zoom level\n */
function updateTilePaneVisibility(zoom: number): void {
    if (!leafletMap) { return; }
    const activeLevel = getActivePyramidLevel(zoom);
    const detail = pyramidDetailLevel(getStoreConfig().tilePyramid);
    for (let l = 0; l <= detail; l++) {
        const pane = leafletMap.getPane(`tilesLevel${l}`);
        if (pane) { pane.style.display = l === activeLevel ? '' : 'none'; }
    }
}

// ============================================================================
// Types
// ============================================================================

/** Tile context for shop map */
interface ShopMapTileContext {
    worldId: string;
    centerTileX: number;
    centerTileZ: number;
    /** Dedup sets keyed by pyramid level — prevents the same URL being added twice */
    addedToMap: Map<number, Set<string>>;
    manifest: Set<string>;
}

/** Parameters for setting up shop map */
interface ShopMapSetupParameters {
    container: HTMLElement;
    dialog: HTMLDialogElement;
    worldId: string;
    x: number;
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

/**
 * Returns true if every finer-level tile that covers this tile's footprint
 * exists in the manifest. When true this tile can be skipped — the finer
 * layer will fully cover it (and is preferentially shown at lower zoom).
 *
 * @param manifest - Set of manifest keys for available tiles
 * @param worldId - World identifier
 * @param level - Pyramid level to check
 * @param lx - Tile X coordinate
 * @param lz - Tile Z coordinate
 * @returns True if all finer tiles covering this footprint exist
 */
function isLevelCoveredByFiner(
    manifest: Set<string>,
    worldId: string,
    level: number,
    lx: number,
    lz: number,
): boolean {
    const pyramid = getStoreConfig().tilePyramid;
    const finerLevel = level + 1;
    if (finerLevel > pyramidDetailLevel(pyramid)) { return false; }
    const bpt = pyramidBlocksPerTile(level, pyramid);
    const finerBpt = pyramidBlocksPerTile(finerLevel, pyramid);
    const scale = Math.round(bpt / finerBpt);
    for (let dx = 0; dx < scale; dx++) {
        for (let dz = 0; dz < scale; dz++) {
            if (!tileExistsInManifest(manifest, worldId, finerBpt, lx * scale + dx, lz * scale + dz)) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Load one tile at a given pyramid level onto the map.
 * Deduplication is handled via context.addedToMap.
 *
 * @param context - Tile context with manifest and dedup sets
 * @param level - Pyramid level to load
 * @param lx - Tile X coordinate
 * @param lz - Tile Z coordinate
 */
function loadTileAtLevel(
    context: ShopMapTileContext,
    level: number,
    lx: number,
    lz: number,
): void {
    const { worldId, centerTileX, centerTileZ, addedToMap, manifest } = context;
    const pyramid = getStoreConfig().tilePyramid;
    const bpt = pyramidBlocksPerTile(level, pyramid);

    let seen = addedToMap.get(level);
    if (!seen) { seen = new Set<string>(); addedToMap.set(level, seen); }
    const mapKey = `${lx},${lz}`;
    if (seen.has(mapKey)) { return; }
    seen.add(mapKey);

    if (!tileExistsInManifest(manifest, worldId, bpt, lx, lz)) { return; }
    if (isLevelCoveredByFiner(manifest, worldId, level, lx, lz)) { return; }

    // Compute Leaflet bounds from world block coords relative to center
    const centerX = centerTileX * TILE_CONFIG.tileSize;
    const centerZ = centerTileZ * TILE_CONFIG.tileSize;
    const worldX = lx * bpt;
    const worldZ = lz * bpt;
    const dX = worldX - centerX;
    const dZ = worldZ - centerZ;
    const bounds: L.LatLngBoundsExpression = [
        [-(dZ + bpt), dX],
        [-dZ, dX + bpt],
    ];

    const url = `${TILE_CONFIG.baseUrl}/${worldId}/${level}/${lx}/${lz}.${TILE_CONFIG.format}`;
    if (leafletMap) { L.imageOverlay(url, bounds, { pane: `tilesLevel${level}` }).addTo(leafletMap); }
}

function loadVisibleShopMapTiles(context: ShopMapTileContext): void {
    if (!leafletMap) { return; }
    const mapBounds = leafletMap.getBounds();
    const currentZoom = leafletMap.getZoom();

    updateTilePaneVisibility(currentZoom);

    const pyramid = getStoreConfig().tilePyramid;
    const detail = pyramidDetailLevel(pyramid);
    const centerX = context.centerTileX * TILE_CONFIG.tileSize;
    const centerZ = context.centerTileZ * TILE_CONFIG.tileSize;

    // Load tiles for every pyramid level lazily — dedup prevents re-fetching.
    // Pane visibility controls which level is shown at each zoom.
    for (let level = 0; level <= detail; level++) {
        const bpt = pyramidBlocksPerTile(level, pyramid);
        const minLx = Math.floor((centerX + mapBounds.getWest()) / bpt);
        const maxLx = Math.floor((centerX + mapBounds.getEast()) / bpt);
        const minLz = Math.floor((centerZ - mapBounds.getNorth()) / bpt);
        const maxLz = Math.floor((centerZ - mapBounds.getSouth()) / bpt);
        for (let lz = minLz; lz <= maxLz; lz++) {
            for (let lx = minLx; lx <= maxLx; lx++) {
                loadTileAtLevel(context, level, lx, lz);
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
        maxZoom: 6,
        zoomControl: true,
        attributionControl: false,
        zoomSnap: 0,
        zoomDelta: 0.5,
        ...animationOptions
    };
}

function setupShopMap(parameters: ShopMapSetupParameters): void {
    const { container, dialog, worldId, x, z, tileX, tileZ, manifest, playerRefreshMs } = parameters;
    
    leafletMap = L.map(container, createMapConfig());
    
    // Create one pane per pyramid level for proper z-ordering.
    // Level 0 (coarsest) has the lowest z-index; detail is on top.
    // Default overlayPane z-index is 400; all tile panes go below it.
    const pyramidForPanes = getStoreConfig().tilePyramid;
    const detailLevelForPanes = pyramidDetailLevel(pyramidForPanes);
    for (let l = 0; l <= detailLevelForPanes; l++) {
        leafletMap.createPane(`tilesLevel${l}`).style.zIndex = String(350 + l);
    }

    const context: ShopMapTileContext = {
        worldId,
        manifest,
        centerTileX: tileX,
        centerTileZ: tileZ,
        addedToMap: new Map<number, Set<string>>(),
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
    
    leafletMap.on('move', () => { updatePlayerMarkers(); });
    leafletMap.on('zoomend', () => { updatePlayerMarkers(); updateZoomClass(); });

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
                    playerRefreshMs: getConfig().dynmap.playerRefreshMs,
                    worldId,
                    x, z,
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
