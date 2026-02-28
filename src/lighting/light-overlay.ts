/**
 * Light Overlay (Leaflet Integration)
 *
 * Positions the GPU-rendered lighting canvas over the Leaflet map and
 * keeps it synchronized with pan/zoom. Uses `mix-blend-mode: multiply`
 * to darken shadowed areas while preserving the underlying tile colors.
 *
 * The overlay is added as an absolutely-positioned element inside the
 * Leaflet map container with `pointer-events: none` so it doesn't
 * interfere with map interaction.
 *
 * @module lighting/light-overlay
 * @see docs/adr/014-heightmap-lighting.md — Phase 3
 */

import debug from 'debug';

import { fromLeafletCoordsRelative } from '../map/map-math.js';
import { TILE_CONFIG } from '../map/tile-loader.js';
import type { LightRenderer } from './light-renderer.js';
import type { HeightmapAtlas, LightingState } from './light-types.js';

const debugOverlay = debug('pvc:lighting');

// ============================================================================
// Types
// ============================================================================

/** Public API for the light overlay */
export interface LightOverlay {
    /** Attach the overlay to a Leaflet map */
    attach: (map: L.Map, centerTileX: number, centerTileZ: number) => void;
    /** Detach the overlay from the map */
    detach: () => void;
    /** Update the heightmap atlas (call after viewport change) */
    setAtlas: (atlas: HeightmapAtlas) => void;
    /** Render a frame with current lighting state */
    renderFrame: (state: LightingState) => void;
    /** Force a full update (atlas + render) */
    refresh: () => void;
    /** Whether the overlay is currently attached */
    readonly isAttached: boolean;
    /** The underlying renderer (for diagnostics) */
    readonly renderer: LightRenderer;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a lighting overlay that integrates with a Leaflet map.
 *
 * @param renderer - The GPU (or CPU fallback) light renderer
 * @returns Overlay controller
 */
export function createLightOverlay(renderer: LightRenderer): LightOverlay {
    let map: L.Map | undefined;
    let centerTileX = 0;
    let centerTileZ = 0;
    let hasAtlas = false;

    const canvas = renderer.canvas;

    // Style the canvas for overlay positioning
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.mixBlendMode = 'multiply';
    canvas.style.zIndex = '370'; // Above detail tiles (360)
    canvas.style.imageRendering = 'auto'; // Bilinear smoothing
    canvas.classList.add('lighting-overlay');

    /**
     * Get the current viewport in block coordinates.
     *
     * @returns Block viewport bounds, or undefined if map is unavailable
     */
    function getBlockViewport(): { minBlockX: number; maxBlockX: number; minBlockZ: number; maxBlockZ: number } | undefined {
        if (!map) { return undefined; }

        const bounds = map.getBounds();
        const tileSize = TILE_CONFIG.tileSize;

        // Convert Leaflet bounds to block coordinates
        // NorthWest = top-left (min lng, max lat)
        // SouthEast = bottom-right (max lng, min lat)
        const nw = fromLeafletCoordsRelative(
            bounds.getNorth(), bounds.getWest(),
            centerTileX, centerTileZ, tileSize,
        );
        const se = fromLeafletCoordsRelative(
            bounds.getSouth(), bounds.getEast(),
            centerTileX, centerTileZ, tileSize,
        );

        return {
            minBlockX: Math.min(nw.x, se.x),
            maxBlockX: Math.max(nw.x, se.x),
            minBlockZ: Math.min(nw.z, se.z),
            maxBlockZ: Math.max(nw.z, se.z),
        };
    }

    /**
     * Handle map movement — update viewport and re-render.
     */
    function onMapMove(): void {
        // Re-render is handled by the animation loop, not here.
        // This is just a hook point for future atlas refresh on large pans.
        debugOverlay('map moved — next render will use updated viewport');
    }
    function attach(mapInstance: L.Map, ctX: number, ctZ: number): void {
        if (map) { detach(); }

        map = mapInstance;
        centerTileX = ctX;
        centerTileZ = ctZ;

        // Add canvas to map container
        const container = map.getContainer();
        container.append(canvas);

        // Listen for viewport changes
        map.on('move', onMapMove);

        debugOverlay('overlay attached to map');
    }

    function detach(): void {
        if (map) {
            map.off('move', onMapMove);
            canvas.remove();
            map = undefined;
        }
        hasAtlas = false;
        debugOverlay('overlay detached');
    }
     
    function setAtlas(atlas: HeightmapAtlas): void {
        renderer.uploadHeightmap(atlas);
        hasAtlas = true;
        debugOverlay('atlas set: %dx%d', atlas.atlasWidth, atlas.atlasHeight);
    }
    function renderFrame(state: LightingState): void {
        if (!map || !hasAtlas || !state.enabled) {
            // If not enabled, make canvas transparent so baked tiles show through
            canvas.style.display = state.enabled ? 'block' : 'none';
            return;
        }

        canvas.style.display = 'block';

        const viewport = getBlockViewport();
        if (!viewport) { return; }

        const widthBlocks = viewport.maxBlockX - viewport.minBlockX;
        const heightBlocks = viewport.maxBlockZ - viewport.minBlockZ;

        // Resize GL canvas if needed
        renderer.resize(widthBlocks, heightBlocks);

        // Render the lighting pass
        renderer.render(viewport, state.config, state.pointLights);
    }

    function refresh(): void {
        debugOverlay('full refresh requested');
        if (map && hasAtlas) {
            // The atlas is already uploaded — just re-render
            // (Atlas rebuild should be triggered externally on large viewport changes)
        }
    }

    return {
        attach,
        detach,
        setAtlas,
        renderFrame,
        refresh,
        renderer,
        get isAttached() { return map !== undefined; },
    };
}
/**
 * Compute the visible block-coordinate viewport from a Leaflet map.
 *
 * Exported for use by atlas-building code that runs outside the overlay.
 *
 * @param map - Leaflet map instance
 * @param centerTileX - Reference tile X
 * @param centerTileZ - Reference tile Z
 * @returns Block viewport bounds, or undefined if map is invalid
 */
export function getMapBlockViewport(
    map: L.Map,
    centerTileX: number,
    centerTileZ: number,
): { minBlockX: number; maxBlockX: number; minBlockZ: number; maxBlockZ: number } | undefined {
    const bounds = map.getBounds();
    const tileSize = TILE_CONFIG.tileSize;

    const nw = fromLeafletCoordsRelative(
        bounds.getNorth(), bounds.getWest(),
        centerTileX, centerTileZ, tileSize,
    );
    const se = fromLeafletCoordsRelative(
        bounds.getSouth(), bounds.getEast(),
        centerTileX, centerTileZ, tileSize,
    );

    return {
        minBlockX: Math.min(nw.x, se.x),
        maxBlockX: Math.max(nw.x, se.x),
        minBlockZ: Math.min(nw.z, se.z),
        maxBlockZ: Math.max(nw.z, se.z),
    };
}
