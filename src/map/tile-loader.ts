/**
 * Tile Loader Module
 * 
 * Adds map tiles to Leaflet maps. Tiles are requested straight from the map
 * server by the browser (as plain `<img>` elements via `imageOverlay`), so the
 * browser HTTP cache handles deduplication and persistence across sessions.
 *
 * The server rejects requests whose `Referer` is another site, so the page
 * sends no referrer (see the `referrer` meta tag in index.html). The server
 * answers 200 with an empty body for tiles it has not rendered; those fail to
 * decode and are removed from the map again.
 * 
 * @module map/tile-loader
 */

import debug from 'debug';

import { getConfig } from '../stores/config-store.js';
import {
    blocksPerTile,
    coarsenTile,
    DETAIL_BLOCKS_PER_TILE,
    DETAIL_LEVEL,
    detailToOverviewRatio,
    OVERVIEW_LEVEL,
    tileUrl,
} from './tile-layout.js';
import type { LoadTileOptions, TileConfig } from './tile-types.js';

// Leaflet is loaded as a global from CDN
declare const L: typeof import('leaflet');

const debugTiles = debug('tiles');

// ============================================================================
// Configuration
// ============================================================================

/** Tile grid configuration derived from the server's zoom pyramid */
export const TILE_CONFIG: TileConfig = {
    tileSize: DETAIL_BLOCKS_PER_TILE,
    maxZoom: DETAIL_LEVEL,
    fallbackZoom: OVERVIEW_LEVEL,
    overviewTileBlocks: blocksPerTile(OVERVIEW_LEVEL),
    detailToOverviewRatio: detailToOverviewRatio(),
};

// ============================================================================
// Tile Loading Functions
// ============================================================================

/** How far each tile reaches into its right and bottom neighbours, in screen pixels */
const TILE_OVERLAP_PX = 1;

/** Leaflet internals the seamless overlay builds on (not in the public typings) */
interface SeamlessOverlayInternals {
    _image?: HTMLImageElement;
    _map?: L.Map;
    /** Unpadded size from the last reset, in layer pixels */
    _seamlessSize?: { width: number; height: number };
    _reset: () => void;
    _animateZoom: (event: L.ZoomAnimEvent) => void;
}

let SeamlessImageOverlay: (new (url: string, bounds: L.LatLngBoundsExpression, options?: L.ImageOverlayOptions) => L.ImageOverlay) | undefined;

/**
 * Pad an overlay image so it reaches `TILE_OVERLAP_PX` screen pixels into its
 * neighbours at the given scale
 * @param overlay - Overlay internals with the unpadded size
 * @param scale - Current zoom-animation scale (1 at rest)
 */
function padImage(overlay: SeamlessOverlayInternals, scale: number): void {
    const { _image: image, _seamlessSize: size } = overlay;
    if (!image || !size) { return; }
    image.style.width = `${size.width + TILE_OVERLAP_PX / scale}px`;
    image.style.height = `${size.height + TILE_OVERLAP_PX / scale}px`;
}

/**
 * Image overlay drawn one screen pixel wider and taller than its bounds. Each
 * tile is a separate image, so at fractional zoom (and while zooming) its
 * edges are anti-aliased on their own and a hairline of map background shows
 * between neighbours; the extra pixel overlaps the next tile and hides that
 * seam. During the zoom animation the padding is divided by the animation
 * scale, so zooming out (scale < 1) still overlaps by a full screen pixel.
 * Created on first use, once Leaflet has loaded.
 * @returns The overlay class
 */
function getSeamlessImageOverlay(): NonNullable<typeof SeamlessImageOverlay> {
    if (!SeamlessImageOverlay) {
        const base = L.ImageOverlay.prototype as unknown as SeamlessOverlayInternals;
        const baseReset = base._reset;
        const baseAnimateZoom = base._animateZoom;
        SeamlessImageOverlay = L.ImageOverlay.extend({
            _reset(this: SeamlessOverlayInternals): void {
                baseReset.call(this);
                const image = this._image;
                if (!image) { return; }
                this._seamlessSize = { width: Number.parseFloat(image.style.width), height: Number.parseFloat(image.style.height) };
                padImage(this, 1);
            },
            _animateZoom(this: SeamlessOverlayInternals, event: L.ZoomAnimEvent): void {
                baseAnimateZoom.call(this, event);
                if (this._map) { padImage(this, this._map.getZoomScale(event.zoom)); }
            },
        });
    }
    return SeamlessImageOverlay;
}

/**
 * Get the map server URL of a tile.
 *
 * @param worldId - Normalized world name (overworld, the_nether)
 * @param level - Pyramid level
 * @param tx - Tile X coordinate at that level
 * @param tz - Tile Z coordinate at that level
 * @returns Absolute tile URL
 */
export function getTileUrl(worldId: string, level: number, tx: number, tz: number): string {
    return tileUrl({ level, baseUrl: getConfig().squaremap.baseUrl, world: worldId, tileX: tx, tileZ: tz });
}

/**
 * Add a tile image to a map. If the server has no tile there, the overlay is
 * removed again so no broken image stays in the DOM.
 *
 * @param map - Leaflet map to add the tile to
 * @param url - Tile image URL
 * @param bounds - Bounds for the tile overlay
 * @param pane - Optional pane name for z-ordering
 * @returns The overlay; it fires `load` once the image is shown, or `error` if the tile is missing
 */
export function addTileOverlay(
    map: L.Map,
    url: string,
    bounds: L.LatLngBoundsExpression,
    pane?: string,
): L.ImageOverlay {
    const Overlay = getSeamlessImageOverlay();
    const overlay = new Overlay(url, bounds, pane ? { pane } : {});
    overlay.on('error', () => {
        debugTiles('tile missing: %s', url);
        overlay.remove();
    });
    debugTiles('loadTile: ADD url=%s', url);
    overlay.addTo(map);
    return overlay;
}

/**
 * Load a tile and add it to a map. Within a session, `addedToMap` prevents
 * duplicate overlay elements.
 *
 * @param options - Tile loading options
 */
export function loadTileToMap(options: LoadTileOptions): void {
    const { map, worldId, zoom, tx, tz, bounds, addedToMap, pane } = options;
    const mapKey = `z${zoom}:${tx},${tz}`;
    if (addedToMap.has(mapKey)) {
        debugTiles('loadTile: SKIP already added mapKey=%s', mapKey);
        return;
    }
    addedToMap.add(mapKey);
    addTileOverlay(map, getTileUrl(worldId, zoom, tx, tz), bounds, pane);
}

// ============================================================================
// Coordinate Utilities
// ============================================================================

/**
 * Calculate overview tile coordinates from detail tile coordinates.
 *
 * @param detailTileX - Detail-level tile X coordinate
 * @param detailTileZ - Detail-level tile Z coordinate
 * @returns Overview tile coordinates
 */
export function calculateOverviewCoords(detailTileX: number, detailTileZ: number): { x: number; z: number } {
    const result = coarsenTile(detailTileX, detailTileZ, DETAIL_LEVEL, OVERVIEW_LEVEL);
    return { x: result.tileX, z: result.tileZ };
}
