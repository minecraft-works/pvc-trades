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

import type * as L from 'leaflet';
import { html } from 'lit-html';

import { SELECTORS } from '../constants.js';
import { getWorldDisplayName } from '../dialogs/index.js';
import { renderToElement } from '../rendering/render.js';
import { isAdminShop, type ShopLocation, type ShopSummary } from '../search/shop-filter.js';
import { playerPositionService } from '../stores/player-position-service.js';
import { getTileCoords } from '../tile-coords.js';
import type { Player, ShopFilter } from '../types.js';
import { shouldDisableAnimations } from '../types.js';
import { leaflet, loadLeaflet } from './leaflet.js';
import { createLevelSwitcher, type LevelSwitcher } from './level-switcher.js';
import { calculateFitZoom, getWorldId, toLeafletCoords, toLeafletCoordsRelative } from './map-math.js';
import { getMarkerScale } from './map-math.js';
import { setupOutsideGestures } from './outside-gestures.js';
import { createPlayerLayer, type PlayerLayer } from './player-layer.js';
import { fetchPlayers, getPlayerWorld } from './players.js';
import { blocksPerTile, DETAIL_LEVEL } from './tile-layout.js';
import { addTileOverlay, getTileUrl, TILE_CONFIG } from './tile-loader.js';

// ============================================================================
// Module State
// ============================================================================

let leafletMap: L.Map | undefined;
/** Players on the open shop map */
let playerLayer: PlayerLayer | undefined;
/** Blue circle on the selected shop */
let pinMarker: L.Marker | undefined;
/** Player selected on the map instead of a shop (one selection at a time) */
let selectedPlayer: string | undefined;
/** True between a zoom animation's start and end; markers are not rebuilt or moved then */
let zoomAnimating = false;
/** Called when a player on the map is clicked */
let onPlayerClick: ((name: string) => void) | undefined;
/** Level switching of the open shop map */
let levelSwitcher: LevelSwitcher | undefined;
let cachedPlayers: Player[] = [];
let playerRefreshInterval: ReturnType<typeof setInterval> | undefined;
/** rAF ID for smooth player marker interpolation on the shop map */
let shopMapAnimFrameId: number | undefined;
/** Current shop map tile reference coords (for coordinate conversion) */
let shopMapTileX = 0;
let shopMapTileZ = 0;
/** Tiles of the open shop map */
let shopMapTileContext: ShopMapTileContext | undefined;

/** Flight to a player: seconds for a short hop, extra per doubling of the distance (in screens), and at most */
const FLIGHT_MIN_SECONDS = 0.5;
const FLIGHT_SECONDS_PER_DOUBLING = 0.25;
const FLIGHT_MAX_SECONDS = 1.6;
/** Underlay is started this much around a flight's route (0.5 = half its size on each side) */
const FLIGHT_UNDERLAY_PADDING = 0.5;
/** Least time between underlay checks while the map moves */
const UNDERLAY_MOVE_CHECK_MS = 100;

// Leaflet zoom thresholds for LOD switching
/**
 * Leaflet zoom level at which the detail (highest-resolution) tile level activates:
 * one tile pixel per screen pixel (server tiles are 1 px per block at detail).
 * With a factor-2 pyramid, each coarser level activates 1 zoom unit lower.
 */
const ZOOM_SHOW_DETAIL = 0;

/**
 * Coarsest pyramid level, always shown beneath the current level: a handful
 * of tiles covers the whole view, so anything not loaded yet shows blurry
 * terrain instead of an empty map
 */
const UNDERLAY_LEVEL = 0;

/**
 * Returns the pyramid level that should be displayed at the given Leaflet zoom.
 * With a factor-2 pyramid, each level is 1 zoom unit apart.
 *
 * @param zoom - Current Leaflet zoom level
 * @returns Active pyramid level index
 */
function getActivePyramidLevel(zoom: number): number {
    for (let l = DETAIL_LEVEL; l > 0; l--) {
        if (zoom >= ZOOM_SHOW_DETAIL - (DETAIL_LEVEL - l)) { return l; }
    }
    return 0;
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
    /** Shows one level, keeping the previous one underneath until the new one has loaded */
    levels: LevelSwitcher;
    /** Tile URLs already fetched ahead of a zoom, so they are not fetched twice */
    prefetched: Set<string>;
}

/** Range of tile coordinates at one pyramid level */
interface TileRange {
    readonly minLx: number;
    readonly maxLx: number;
    readonly minLz: number;
    readonly maxLz: number;
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
    playerRefreshMs: number;
    /** Other shops to show as clickable dots */
    shops: readonly ShopLocation[];
    /** Called when a shop dot is clicked */
    onSelectShop: (shop: ShopLocation) => void;
}

/** Dependencies for shop map dialog */
export interface ShopMapDialogDependencies {
    /** Called when map dialog closes and was opened from cart */
    onCloseFromCart: () => void;
    /** Check if dialog was opened from cart */
    isOpenedFromCart: () => boolean;
    /** Reset the opened-from-cart flag */
    clearOpenedFromCart: () => void;
    /** Get app config (specifically squaremap.playerRefreshMs) */
    getConfig: () => { squaremap: { playerRefreshMs: number } };
    /** Shop name, owner and trade count at a location */
    getShopSummary: (x: number, y: number, z: number, world: string) => ShopSummary | undefined;
    /** Shops of a player, if they have any */
    getOwnerSummary: (player: string) => ShopSummary | undefined;
    /** All shops with something in stock, shown as dots on the map */
    getShopLocations: () => readonly ShopLocation[];
    /** Show the results for one shop (the map dialog closes first) */
    showShopTrades: (filter: ShopFilter) => void;
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
 * Load one tile at a given pyramid level onto the map.
 * Deduplication is handled via context.addedToMap.
 *
 * @param context - Tile context with dedup sets
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
    const { worldId, centerTileX, centerTileZ, addedToMap } = context;
    const bpt = blocksPerTile(level);

    let seen = addedToMap.get(level);
    if (!seen) { seen = new Set<string>(); addedToMap.set(level, seen); }
    const mapKey = `${lx},${lz}`;
    if (seen.has(mapKey)) { return; }
    seen.add(mapKey);

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

    if (leafletMap) {
        const overlay = addTileOverlay(leafletMap, getTileUrl(worldId, level, lx, lz), bounds, `tilesLevel${level}`);
        context.levels.tileStarted(level, mapKey);
        overlay.once('load error', () => { context.levels.tileSettled(level, mapKey); });
    }
}

/**
 * Tiles of a pyramid level that cover some map bounds
 * @param context - Tile context with the centre tile
 * @param level - Pyramid level
 * @param bounds - Map bounds to cover
 * @returns Tile coordinate range
 */
function getTileRange(context: ShopMapTileContext, level: number, bounds: L.LatLngBounds): TileRange {
    const centerX = context.centerTileX * TILE_CONFIG.tileSize;
    const centerZ = context.centerTileZ * TILE_CONFIG.tileSize;
    const bpt = blocksPerTile(level);
    return {
        minLx: Math.floor((centerX + bounds.getWest()) / bpt),
        maxLx: Math.floor((centerX + bounds.getEast()) / bpt),
        minLz: Math.floor((centerZ - bounds.getNorth()) / bpt),
        maxLz: Math.floor((centerZ - bounds.getSouth()) / bpt),
    };
}

/**
 * Call `visit` for every tile in a range
 * @param range - Tile coordinate range
 * @param visit - Called with each tile's coordinates
 */
function forEachTile(range: TileRange, visit: (lx: number, lz: number) => void): void {
    for (let lz = range.minLz; lz <= range.maxLz; lz++) {
        for (let lx = range.minLx; lx <= range.maxLx; lx++) { visit(lx, lz); }
    }
}

/**
 * Levels to request for a zoom: the level shown there, plus the coarse
 * underlay that stays visible beneath it
 * @param zoom - Leaflet zoom
 * @returns Pyramid levels
 */
function getLevelsToLoad(zoom: number): number[] {
    const level = getActivePyramidLevel(zoom);
    return level === UNDERLAY_LEVEL ? [level] : [level, UNDERLAY_LEVEL];
}

function loadVisibleShopMapTiles(context: ShopMapTileContext): void {
    if (!leafletMap) { return; }

    // Only the shown level and the underlay are requested; dedup prevents
    // re-fetching when the user returns to a level they already visited.
    const zoom = leafletMap.getZoom();
    const bounds = leafletMap.getBounds();
    context.levels.show(getActivePyramidLevel(zoom));
    for (const level of getLevelsToLoad(zoom)) {
        forEachTile(getTileRange(context, level, bounds), (lx, lz) => { loadTileAtLevel(context, level, lx, lz); });
    }
    context.levels.requestsDone();
}

/**
 * Fetch the tiles a view will show into the browser cache, so they appear
 * at once when the map gets there. These are the same requests the map makes
 * when it arrives.
 * @param context - Tile context
 * @param center - Centre of the view
 * @param zoom - Zoom of the view
 */
function prefetchView(context: ShopMapTileContext, center: L.LatLngExpression, zoom: number): void {
    if (!leafletMap) { return; }
    const half = leafletMap.getSize().divideBy(2);
    const centerPoint = leafletMap.project(center, zoom);
    const target = leaflet().latLngBounds(leafletMap.unproject(centerPoint.subtract(half), zoom), leafletMap.unproject(centerPoint.add(half), zoom));
    for (const level of getLevelsToLoad(zoom)) {
        const added = context.addedToMap.get(level);
        forEachTile(getTileRange(context, level, target), (lx, lz) => {
            const url = getTileUrl(context.worldId, level, lx, lz);
            if (added?.has(`${lx},${lz}`) || context.prefetched.has(url)) { return; }
            context.prefetched.add(url);
            const image = new Image();
            image.referrerPolicy = 'no-referrer';
            image.src = url;
        });
    }
}

/**
 * Put the coarse underlay under an area. Runs while the map moves (flights,
 * long drags) for the view, so a zoomed-out view never stays empty; the
 * underlay is a few big tiles, so this adds few requests.
 * @param context - Tile context
 * @param bounds - Area to cover
 */
function loadUnderlay(context: ShopMapTileContext, bounds: L.LatLngBounds): void {
    forEachTile(getTileRange(context, UNDERLAY_LEVEL, bounds), (lx, lz) => { loadTileAtLevel(context, UNDERLAY_LEVEL, lx, lz); });
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

/**
 * Fly the shop map to where a player is now: zoom out, travel, zoom back in
 * to the current zoom. Nearby players need little or no zoom-out.
 * @param name - Name of the clicked player
 */
function flyToPlayer(name: string): void {
    const player = cachedPlayers.find(candidate => candidate.name === name);
    if (!leafletMap || !player) { return; }
    const { lat, lng } = getPlayerLeafletCoords(player, shopMapTileX, shopMapTileZ);
    const destination = leaflet().latLng(lat, lng);
    const zoom = leafletMap.getZoom();
    // Fetch the destination's tiles, and start the coarse underlay around the
    // route so the zoomed-out middle of the flight isn't empty. Not more than
    // that: a big batch of requests delays the destination's tiles.
    if (shopMapTileContext) {
        prefetchView(shopMapTileContext, destination, zoom);
        loadUnderlay(shopMapTileContext, leafletMap.getBounds().extend(destination).pad(FLIGHT_UNDERLAY_PADDING));
    }
    leafletMap.flyTo(destination, zoom, { duration: getFlightDuration(leafletMap, destination) });
}

/**
 * Flight time: short hops are quick, long trips take a little longer
 * @param map - Shop map
 * @param destination - Where the flight ends
 * @returns Duration in seconds
 */
function getFlightDuration(map: L.Map, destination: L.LatLng): number {
    const screens = map.latLngToContainerPoint(destination).distanceTo(map.getSize().divideBy(2)) / Math.max(map.getSize().x, 1);
    return Math.min(FLIGHT_MAX_SECONDS, FLIGHT_MIN_SECONDS + Math.log2(1 + screens) * FLIGHT_SECONDS_PER_DOUBLING);
}

/**
 * While a player is selected, the coordinates label follows them
 */
function showSelectedPlayerCoords(): void {
    const player = cachedPlayers.find(candidate => candidate.name === selectedPlayer);
    const coordsElement = document.querySelector('#map-coords');
    if (!player || !coordsElement) { return; }
    const position = playerPositionService.getCurrentPosition(player.name) ?? player.position;
    const [x, y, z] = [position.x, position.y, position.z].map(value => Math.round(value));
    const text = `${getWorldDisplayName(getPlayerWorld(player))}: ${x}, ${y}, ${z}`;
    if (coordsElement.textContent !== text) { coordsElement.textContent = text; }
}

/** Most a press may move and still count as a click on a player, in pixels */
const PLAYER_CLICK_SLOP_PX = 6;

/**
 * Clicking a player (dot or name, on the map or on its rim) selects them.
 * Players move under the pointer and rim markers sit outside the map, so the
 * press is tracked on the dialog rather than on each marker.
 * @param dialog - Map dialog
 */
function setupPlayerClicks(dialog: HTMLDialogElement): void {
    if (Object.hasOwn(dialog.dataset, 'playerClicks')) { return; }
    dialog.dataset.playerClicks = 'true';
    let pressed: { name: string; x: number; y: number } | undefined;
    dialog.addEventListener('pointerdown', event => {
        const name = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-player]')?.dataset.player : undefined;
        pressed = name === undefined ? undefined : { name, x: event.clientX, y: event.clientY };
    }, {capture: true});
    dialog.addEventListener('pointerup', event => {
        if (pressed && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <= PLAYER_CLICK_SLOP_PX) {
            onPlayerClick?.(pressed.name);
        }
        pressed = undefined;
    }, {capture: true});
}

/** Start the frame loop that moves the players and their coordinates label. */
function startShopMapAnimLoop(): void {
    if (shopMapAnimFrameId !== undefined) { return; }

    function tick(): void {
        // During a zoom animation Leaflet slides the markers; moving them here would fight it
        if (!zoomAnimating) {
            playerLayer?.update();
            showSelectedPlayerCoords();
        }
        shopMapAnimFrameId = requestAnimationFrame(tick);
    }

    shopMapAnimFrameId = requestAnimationFrame(tick);
}

/** Stop the frame loop and remove the players. */
function stopShopMapAnimLoop(): void {
    if (shopMapAnimFrameId !== undefined) {
        cancelAnimationFrame(shopMapAnimFrameId);
        shopMapAnimFrameId = undefined;
    }
    playerLayer?.remove();
    playerLayer = undefined;
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
        crs: leaflet().CRS.Simple,
        minZoom: -5,
        maxZoom: 6,
        zoomControl: true,
        attributionControl: false,
        zoomSnap: 0,
        zoomDelta: 0.5,
        ...animationOptions
    };
}

/** Shop dot marker: a 16 px click area with the dot drawn inside it */
const SHOP_DOT_ICON_SIZE = 16;
/** Stacking: shop dots below players, the selected shop above everything */
const Z_SHOP_DOT = -10_000;
const Z_PLAYER = 5000;
const Z_SELECTED_SHOP = 10_000;
/** Smallest marker size change worth restyling all markers for */
const MARKER_SCALE_STEP = 0.04;
/** Shop dots are on the map within this much of the view around it (1 = one view width on each side) */
const SHOP_DOT_VIEW_PADDING = 1;

/**
 * Create a clickable dot for every shop in this world; hovering shows the
 * shop's name. Dots are black-and-white so they don't compete with the
 * selected shop (blue) or players (green, orange). They are map markers, so
 * they move with the zoom animation and scale with `--marker-scale`.
 * Only the dots in and around the view are on the map; the returned function
 * updates that set (call it after every pan and zoom), which keeps pans and
 * zoom animations light.
 * @param map - Shop map
 * @param parameters - Map setup with the shops and the click handler
 * @returns Function that adds and removes dots for the current view
 */
function addShopMarkers(map: L.Map, parameters: ShopMapSetupParameters): () => void {
    const { shops, worldId, tileX, tileZ, onSelectShop } = parameters;
    const half = SHOP_DOT_ICON_SIZE / 2;
    const icon = leaflet().divIcon({
        className: 'shop-dot-marker',
        html: '<span class="shop-dot"></span>',
        iconSize: [SHOP_DOT_ICON_SIZE, SHOP_DOT_ICON_SIZE],
        iconAnchor: [half, half],
    });
    const layer = leaflet().layerGroup().addTo(map);
    const markers: L.Marker[] = [];
    for (const shop of shops) {
        if (getWorldId(shop.world) !== worldId) { continue; }
        const { lat, lng } = toLeafletCoordsRelative(shop.x, shop.z, tileX, tileZ, TILE_CONFIG.tileSize);
        const name = shop.shopName ?? shop.shopOwner ?? 'Shop';
        const ownerName = isAdminShop(shop) ? 'admin shop' : shop.shopOwner;
        const owner = shop.shopName && shop.shopOwner ? ` · ${ownerName}` : '';
        markers.push(leaflet().marker([lat, lng], { icon, keyboard: false, zIndexOffset: Z_SHOP_DOT })
            // No trade count here: the pill's "All N trades" counts every shop with this name
            .bindTooltip(() => renderToElement(html`<strong>${name}</strong>${owner}`), {
                className: 'map-shop-tooltip',
                direction: 'top',
                offset: [0, -half],
            })
            .on('click', () => { onSelectShop(shop); }));
    }

    return () => {
        const area = map.getBounds().pad(SHOP_DOT_VIEW_PADDING);
        for (const marker of markers) {
            const wanted = area.contains(marker.getLatLng());
            if (wanted === layer.hasLayer(marker)) { continue; }
            if (wanted) { layer.addLayer(marker); } else { layer.removeLayer(marker); }
        }
    };
}

function setupShopMap(parameters: ShopMapSetupParameters): void {
    const { container, dialog, worldId, x, z, tileX, tileZ, playerRefreshMs } = parameters;
    
    leafletMap = leaflet().map(container, createMapConfig());
    const map = leafletMap;
    
    // One pane per pyramid level; the level switcher shows the current level
    // on top and keeps the previous one underneath while the new one loads.
    // Default overlayPane z-index is 400; all tile panes stay below it.
    for (let l = 0; l <= DETAIL_LEVEL; l++) {
        map.createPane(`tilesLevel${l}`).style.zIndex = String(350 + l);
    }

    levelSwitcher?.dispose();
    levelSwitcher = createLevelSwitcher(level => map.getPane(`tilesLevel${level}`), DETAIL_LEVEL + 1, { underlayLevel: UNDERLAY_LEVEL });
    const context: ShopMapTileContext = {
        worldId,
        centerTileX: tileX,
        centerTileZ: tileZ,
        addedToMap: new Map<number, Set<string>>(),
        levels: levelSwitcher,
        prefetched: new Set<string>(),
    };
    shopMapTileContext = context;
    
    const loadTiles = () => loadVisibleShopMapTiles(context);
    leafletMap.on('moveend', loadTiles);
    leafletMap.on('zoomend', loadTiles);
    leafletMap.on('zoomanim', (event: L.ZoomAnimEvent) => { prefetchView(context, event.center, event.zoom); });
    let lastUnderlayCheck = 0;
    leafletMap.on('move', () => {
        const now = performance.now();
        if (now - lastUnderlayCheck < UNDERLAY_MOVE_CHECK_MS) { return; }
        lastUnderlayCheck = now;
        loadUnderlay(context, map.getBounds());
    });

    // Marker sizes follow the zoom: set to the target size when a zoom
    // animation starts, so CSS animates the size alongside the map. Continuous
    // zooms (pinch) fire 'zoom' every frame; restyling ~1000 markers each time
    // is costly, so the size only updates once it changed noticeably.
    let markerScale = 0;
    const setMarkerScale = (zoom: number): void => {
        const scale = getMarkerScale(zoom);
        if (Math.abs(scale - markerScale) < MARKER_SCALE_STEP) { return; }
        markerScale = scale;
        container.style.setProperty('--marker-scale', scale.toFixed(3));
    };
    leafletMap.on('zoomanim', (event: L.ZoomAnimEvent) => { zoomAnimating = true; setMarkerScale(event.zoom); });
    leafletMap.on('zoom', () => { setMarkerScale(map.getZoom()); });
    leafletMap.on('zoomend', () => { zoomAnimating = false; });
    
    const updateShopDots = addShopMarkers(leafletMap, parameters);
    leafletMap.on('moveend', updateShopDots);

    const { lat: markerLat, lng: markerLng } = toLeafletCoords(x, z, TILE_CONFIG.tileSize);
    pinMarker = leaflet().marker([markerLat, markerLng], {
        icon: leaflet().divIcon({
            className: 'leaflet-pin-marker',
            html: '<span class="pin-dot"></span>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        }),
        interactive: false,
        zIndexOffset: Z_SELECTED_SHOP,
    }).addTo(leafletMap);
    
    // Players keep their markers; the frame loop moves them (see player-layer.ts)
    shopMapTileX = tileX;
    shopMapTileZ = tileZ;
    playerLayer?.remove();
    playerLayer = createPlayerLayer({
        map,
        rim: dialog,
        zIndexOffset: Z_PLAYER,
        getCoords: player => getPlayerLeafletCoords(player, tileX, tileZ),
    });
    const syncPlayers = (): void => { playerLayer?.setPlayers(cachedPlayers.filter(player => getPlayerWorld(player) === worldId)); };
    
    const updateZoomClass = () => {
        if (leafletMap) {
            container.classList.toggle('zoomed-out', leafletMap.getZoom() < 0.5);
        }
    };
    
    void fetchPlayersAndUpdateCache().then(() => {
        if (!leafletMap) { return; }
        syncPlayers();
        startShopMapAnimLoop();
    });

    playerRefreshInterval = setInterval(() => {
        void fetchPlayersAndUpdateCache().then(() => {
            if (leafletMap) { syncPlayers(); }
        });
    }, playerRefreshMs);
    
    leafletMap.on('zoomend', updateZoomClass);

    leafletMap.invalidateSize();
    const containerSize = leafletMap.getSize();
    const visibleSize = TILE_CONFIG.tileSize * 3;
    const smallerDimension = Math.min(containerSize.x, containerSize.y);
    const initialZoom = calculateFitZoom(smallerDimension, visibleSize);
    
    leafletMap.setView([markerLat, markerLng], initialZoom);
    setMarkerScale(initialZoom);
    updateShopDots();
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
 * Add the "All N trades →" button for a shop or player, or "sold out" when
 * none of their trades is in stock
 * @param element - Overlay element
 * @param summary - Shop or owner summary with the filter and trade count
 * @param title - Button tooltip
 * @param onShowTrades - Called with the filter when the button is clicked
 */
function appendTradesAction(element: HTMLElement, summary: ShopSummary, title: string, onShowTrades: (filter: ShopFilter) => void): void {
    const { filter, tradeCount } = summary;
    if (!filter) { return; }
    if (tradeCount === 0) {
        // Sold-out trades are hidden from the results, so there is nothing to list
        const soldOut = document.createElement('span');
        soldOut.className = 'map-shop-sold-out';
        soldOut.textContent = 'sold out';
        element.append(soldOut);
        return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-shop-trades-btn';
    button.textContent = tradeCount === 1 ? '1 trade →' : `All ${tradeCount} trades →`;
    button.title = title;
    button.addEventListener('click', () => onShowTrades(filter));
    element.append(button);
}

/**
 * Show the shop's name and owner over the map, with a button that lists all
 * trades of the shop. Hidden when the owner is unknown.
 * @param element - Overlay element
 * @param summary - Shop at the opened location
 * @param onShowTrades - Called with the shop's filter when the button is clicked
 */
function renderShopInfo(element: HTMLElement, summary: ShopSummary | undefined, onShowTrades: (filter: ShopFilter) => void): void {
    element.replaceChildren();
    const owner = summary?.shopOwner;
    element.classList.toggle('hidden', owner === undefined);
    if (!summary || owner === undefined) { return; }

    const name = document.createElement('strong');
    name.className = 'map-shop-name';
    name.textContent = summary.shopName ?? owner;
    const ownerElement = document.createElement('span');
    ownerElement.className = 'map-shop-owner';
    if (summary.shopName) {
        ownerElement.textContent = isAdminShop(summary) ? 'Admin shop' : `by ${owner}`;
        element.append(name, ownerElement);
    } else {
        ownerElement.textContent = 'Shop of';
        element.append(ownerElement, name);
    }
    const title = summary.filter?.shop ? `Show only trades from ${summary.filter.shop}` : `Show only trades from shops of ${owner}`;
    appendTradesAction(element, summary, title, onShowTrades);
}

/**
 * Show the selected player over the map, with a button listing the trades of
 * all their shops when they have any
 * @param element - Overlay element
 * @param name - Player name
 * @param shops - The player's shops, if any
 * @param onShowTrades - Called with the owner filter when the button is clicked
 */
function renderPlayerInfo(element: HTMLElement, name: string, shops: ShopSummary | undefined, onShowTrades: (filter: ShopFilter) => void): void {
    element.replaceChildren();
    element.classList.remove('hidden');
    const label = document.createElement('span');
    label.className = 'map-shop-owner';
    label.textContent = 'Player';
    const nameElement = document.createElement('strong');
    nameElement.className = 'map-shop-name';
    nameElement.textContent = name;
    element.append(label, nameElement);
    if (shops) { appendTradesAction(element, shops, `Show only trades from shops of ${name}`, onShowTrades); }
}

/**
 * Create shop map dialog handler
 * @param deps - External dependencies injected from main.ts
 * @returns Handler with open/close functions for the shop map dialog
 */
export function createShopMapDialogHandler(deps: ShopMapDialogDependencies): ShopMapDialogHandler {
    const { onCloseFromCart, isOpenedFromCart, clearOpenedFromCart, getConfig, getShopSummary, getOwnerSummary, getShopLocations, showShopTrades } = deps;
    /** Tile the open map's coordinates are relative to */
    let mapTile = { tileX: 0, tileZ: 0 };

    /**
     * Show the coordinates, name and owner of the selected shop
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param z - Z coordinate
     * @param world - World name
     */
    function showShopDetails(x: number, y: number, z: number, world: string): void {
        const coordsElement = document.querySelector('#map-coords');
        if (coordsElement) {
            coordsElement.textContent = `${getWorldDisplayName(world)}: ${x}, ${y}, ${z}`;
        }
        const shopInfo = document.querySelector<HTMLElement>('#map-shop-info');
        if (shopInfo) {
            renderShopInfo(shopInfo, getShopSummary(x, y, z, world), showShopTrades);
        }
    }

    /**
     * Make a shop dot the selected shop: move the pin there and show its details.
     * Any selected player is deselected.
     * @param shop - Clicked shop
     */
    function selectShop(shop: ShopLocation): void {
        selectedPlayer = undefined;
        playerLayer?.setSelected(undefined);
        pinMarker?.setOpacity(1);
        showShopDetails(shop.x, shop.y, shop.z, shop.world);
        if (!leafletMap) { return; }
        const { lat, lng } = toLeafletCoordsRelative(shop.x, shop.z, mapTile.tileX, mapTile.tileZ, TILE_CONFIG.tileSize);
        pinMarker?.setLatLng([lat, lng]);
        leafletMap.panTo([lat, lng]);
    }

    /**
     * Make a player the selection instead of the shop: hide the shop circle,
     * show the player (and a button for their shops' trades) and fly there
     * @param name - Clicked player
     */
    function selectPlayer(name: string): void {
        selectedPlayer = name;
        playerLayer?.setSelected(name);
        pinMarker?.setOpacity(0);
        const shopInfo = document.querySelector<HTMLElement>('#map-shop-info');
        if (shopInfo) { renderPlayerInfo(shopInfo, name, getOwnerSummary(name), showShopTrades); }
        showSelectedPlayerCoords();
        flyToPlayer(name);
    }
    onPlayerClick = selectPlayer;
    
    function open(x: number, y: number, z: number, world: string): void {
        const dialog = document.querySelector<HTMLDialogElement>(SELECTORS.MAP_DIALOG);
        const container = document.querySelector('#map-container');
        const coordsElement = document.querySelector('#map-coords');
        
        if (!dialog || !(container instanceof HTMLElement) || !(coordsElement instanceof HTMLElement)) {
            return;
        }
        
        const worldId = getWorldId(world);
        selectedPlayer = undefined;
        showShopDetails(x, y, z, world);
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
        setupPlayerClicks(dialog);
        setupOutsideGestures(dialog, () => leafletMap);

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
        mapTile = { tileX, tileZ };
        dialog.showModal();
        
        void loadLeaflet().then(() => requestAnimationFrame(() => {
            if (leafletMap) {
                try { leafletMap.remove(); } catch { /* already removed */ }
                leafletMap = undefined;
            }
            
            setupShopMap({
                worldId,
                x, z,
                tileX, tileZ,
                container,
                dialog,
                playerRefreshMs: getConfig().squaremap.playerRefreshMs,
                shops: getShopLocations(),
                onSelectShop: selectShop,
            });
        }));
    }
    
    return {
        open,
        getMap: () => leafletMap
    };
}
