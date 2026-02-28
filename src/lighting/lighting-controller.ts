/**
 * Lighting Controller
 *
 * High-level orchestrator that wires together the heightmap atlas,
 * GPU renderer, and Leaflet overlay. Provides a simple API for the
 * navigation system to:
 *
 * 1. Attach/detach lighting to a Leaflet map
 * 2. Update torch (point light) positions each frame
 * 3. Toggle day/night mode
 * 4. Rebuild the heightmap atlas on viewport changes
 *
 * @module lighting/lighting-controller
 * @see docs/adr/014-heightmap-lighting.md — Phase 3
 */

import debug from 'debug';

import { getConfig } from '../stores/config-store.js';
import type { TileHeightmapMeta } from './heightmap-atlas.js';
import { buildHeightmapAtlas, parseManifestHeightmaps } from './heightmap-atlas.js';
import type { LightOverlay } from './light-overlay.js';
import { createLightOverlay, getMapBlockViewport } from './light-overlay.js';
import type { LightRenderer } from './light-renderer.js';
import { createLightRenderer } from './light-renderer.js';
import type { BlockViewport, LightingState, PointLight } from './light-types.js';
import {
    createLightingState,
    toggleDayNight,
    TORCH_LIGHT_DEFAULTS,
} from './light-types.js';

const debugLighting = debug('pvc:lighting');

// ============================================================================
// Types
// ============================================================================

/** Manifest entry with optional heightmap */
interface ManifestEntryLike {
    world: string;
    tileX: number;
    tileZ: number;
    blocksPerTile: number;
    heightmap?: { min: number; max: number };
}

/** Public API for controlling the lighting system */
export interface LightingController {
    /** Initialize and attach to a Leaflet map */
    attach: (map: L.Map, centerTileX: number, centerTileZ: number, manifestEntries: readonly ManifestEntryLike[]) => Promise<void>;
    /** Detach from the map and release resources */
    detach: () => void;
    /** Update torch position (call every animation frame) */
    updateTorch: (blockX: number, blockY: number, blockZ: number) => void;
    /** Remove the torch (player tracking lost) */
    removeTorch: () => void;
    /** Render one lighting frame (call in animation loop) */
    renderFrame: () => void;
    /** Toggle day/night mode */
    toggleDayNight: () => void;
    /** Enable or disable the lighting system */
    setEnabled: (enabled: boolean) => void;
    /** Rebuild atlas for current viewport (call on large pan) */
    rebuildAtlas: () => Promise<void>;
    /** Current state (read-only) */
    readonly state: Readonly<LightingState>;
    /** Whether the system is attached to a map */
    readonly isAttached: boolean;
    /** Whether WebGL2 is available */
    readonly hasGpu: boolean;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a lighting controller.
 *
 * Initializes the GPU renderer (or CPU fallback) and prepares the
 * system for attachment to a Leaflet map.
 *
 * @returns Lighting controller instance
 */
export function createLightingController(): LightingController {
    const state: LightingState = createLightingState();
    let renderer: LightRenderer | undefined;
    let overlay: LightOverlay | undefined;
    let map: L.Map | undefined;
    let centerTileX = 0;
    let centerTileZ = 0;
    let heightmapMeta: Map<string, TileHeightmapMeta> | undefined;
    let currentWorld = 'overworld';
    let lastAtlasViewport: BlockViewport | undefined;

    /** Minimum pan distance (blocks) before atlas rebuild */
    const ATLAS_REBUILD_THRESHOLD = 128;
     
    async function attach(
        mapInstance: L.Map,
        ctX: number,
        ctZ: number,
        manifestEntries: readonly ManifestEntryLike[],
    ): Promise<void> {
        detach(); // Clean up any previous attachment
         
        map = mapInstance;
         
        centerTileX = ctX;
         
        centerTileZ = ctZ;

        // Parse heightmap metadata from manifest
        const pyramid = getConfig().tilePyramid;
         
        heightmapMeta = parseManifestHeightmaps(manifestEntries, pyramid);

        if (heightmapMeta.size === 0) {
            debugLighting('no heightmap tiles in manifest — lighting disabled');
            return;
        }

        // Create renderer + overlay
        renderer = createLightRenderer();
        overlay = createLightOverlay(renderer);
        overlay.attach(map, centerTileX, centerTileZ);

        // Determine world from manifest entries
        const firstEntry = manifestEntries[0];
        if (firstEntry) {
             
            currentWorld = firstEntry.world;
        }

        // Build initial atlas
        await rebuildAtlas();

        // Enable lighting
        state.enabled = true;
    }

    function detach(): void {
        state.enabled = false;
        state.pointLights = [];

        overlay?.detach();
        renderer?.dispose();
         
        overlay = undefined;
         
        renderer = undefined;
         
        map = undefined;
         
        heightmapMeta = undefined;
         
        lastAtlasViewport = undefined;

        debugLighting('detached');
    }

    function updateTorch(blockX: number, blockY: number, blockZ: number): void {
        const torch: PointLight = {
            x: blockX,
            y: blockY,
            z: blockZ,
            ...TORCH_LIGHT_DEFAULTS,
        };

        // Replace first point light (torch is always index 0)
        if (state.pointLights.length === 0) {
            state.pointLights.push(torch);
        } else {
            state.pointLights[0] = torch;
        }
    }

    function removeTorch(): void {
        if (state.pointLights.length > 0) {
            state.pointLights.shift();
        }
    }

    function renderFrame(): void {
        overlay?.renderFrame(state);
    }

    function handleToggleDayNight(): void {
        toggleDayNight(state);
        debugLighting('toggled: isNight=%s', state.config.isNight);
    }

    function setEnabled(enabled: boolean): void {
        state.enabled = enabled;
        debugLighting('enabled=%s', enabled);
    }

    async function rebuildAtlas(): Promise<void> {
        if (!map || !heightmapMeta || heightmapMeta.size === 0) { return; }

        const viewport = getMapBlockViewport(map, centerTileX, centerTileZ);
        if (!viewport) { return; }

        // Skip rebuild if viewport hasn't moved much
        if (lastAtlasViewport && !viewportMovedSignificantly(lastAtlasViewport, viewport)) {
            return;
        }

        debugLighting('rebuilding atlas for viewport (%d,%d)→(%d,%d)',
            viewport.minBlockX, viewport.minBlockZ, viewport.maxBlockX, viewport.maxBlockZ);

        const atlas = await buildHeightmapAtlas(viewport, currentWorld, heightmapMeta);
        if (atlas && overlay) {
            overlay.setAtlas(atlas);
            lastAtlasViewport = viewport;
        }
    }

    /**
     * Check if viewport has panned far enough to warrant atlas rebuild.
     *
     * @param previous - Previous viewport bounds
     * @param current - Current viewport bounds
     * @returns Whether the viewport moved more than the rebuild threshold
     */
    function viewportMovedSignificantly(
        previous: BlockViewport,
        current: BlockViewport,
    ): boolean {
        const dx = Math.abs((current.minBlockX + current.maxBlockX) / 2 - (previous.minBlockX + previous.maxBlockX) / 2);
        const dz = Math.abs((current.minBlockZ + current.maxBlockZ) / 2 - (previous.minBlockZ + previous.maxBlockZ) / 2);
        return dx > ATLAS_REBUILD_THRESHOLD || dz > ATLAS_REBUILD_THRESHOLD;
    }

    return {
        attach,
        detach,
        updateTorch,
        removeTorch,
        renderFrame,
        setEnabled,
        rebuildAtlas,
        toggleDayNight: handleToggleDayNight,
        get state() { return state; },
        get isAttached() { return map !== undefined; },
        get hasGpu() { return renderer?.isValid ?? false; },
    };
}
