/**
 * Live navigation orchestrator — start/stop, player polling, mode & view controls.
 *
 * Coordinates between nav-map (Leaflet infrastructure) and nav-updates
 * (route recalculation, animation, distance display).
 *
 * @module navigation/live-navigation
 */

import {
    CSS_CLASSES,
    DIALOG_IDS,
    SELECTORS,
    WORLDS,
} from '../constants.js';
import { debugInterpolation,debugNavigation, debugPlayerPoll } from '../debug.js';
import {
    calculateTotalRouteDistance,
    getWorldId,
    hasPositionMoved,
} from '../library.js';
import type { LightingController } from '../lighting/lighting-controller.js';
import {
    fetchPlayers,
    getPlayerWorld,
} from '../map/index.js';
import type { Player,RouteStop } from '../types.js';
import type { NavState } from './nav-map.js';
import type { NavMapHandler } from './nav-map.js';
import type { NavUpdatesHandler } from './nav-updates.js';

// ============================================================================
// Dependencies and handler interface
// ============================================================================

/** Dependencies injected by main.ts */
export interface LiveNavigationDeps {
    navigationStore: {
        isActive: boolean;
        playerPosition: { x: number; y: number; z: number; world: string; yaw?: number | undefined } | undefined;
        playerName: string;
        mode: 'follow' | 'manual';
        viewWorld: string;
        viewWorldMode: 'auto' | 'manual';
        progress: { completedKeys: Set<string>; currentIndex: number };
        refreshInterval: ReturnType<typeof setInterval> | undefined;
        start: (playerName: string) => void;
        stop: () => void;
        setPlayerPosition: (pos: { x: number; y: number; z: number; world: string; yaw?: number | undefined }) => void;
        setRefreshInterval: (interval: ReturnType<typeof setInterval>) => void;
        setMode: (mode: 'follow' | 'manual') => void;
        setViewWorld: (world: string) => void;
        toggleViewWorldMode: () => 'auto' | 'manual';
        markStopComplete: (key: string) => void;
    };
    navMapHandler: NavMapHandler;
    navUpdatesHandler: NavUpdatesHandler;
    computeRoute: (origin?: { x: number; z: number; world: string }, excludeCompleted?: boolean) => RouteStop[];
    getAllCartStops: () => RouteStop[];
    syncNavProgressWithCart: (route: RouteStop[]) => void;
    createTimelineStop: (stop: RouteStop, index: number, route: RouteStop[], previous: RouteStop | undefined, forNavPanel?: boolean) => HTMLElement;
    renderCartDialog: () => void;
    switchTab: (tab: 'cart' | 'navigate') => void;
    getElement: <T extends HTMLElement = HTMLElement>(id: string) => T;
    getConfig: () => { dynmap: { playerRefreshMs: number } };
    playerPositionService: {
        pushSample: (name: string, sample: { x: number; y: number; z: number; yaw?: number | undefined; timestamp: number }) => void;
        resetPlayer: (name: string) => void;
        removePlayer: (name: string) => void;
        getPhase: (name: string) => string | undefined;
        getVelocity: (name: string) => { vx: number; vz: number } | undefined;
    };
    updateNearbyShopTooltip: () => void;
    cartStoreUniqueCount: () => number;
    /** Optional lighting controller for day/night toggle */
    lightingController?: LightingController;
}

/** Public API returned by the factory */
export interface LiveNavigationHandler {
    startNavigation: () => Promise<void>;
    stopNavigation: () => void;
    toggleNavigation: () => void;
    setupNavigationControls: () => void;
    switchToManualMode: () => void;
    initViewWorldButtons: () => void;
    renderNavigateTab: () => void;
}

// ============================================================================
// Pure helpers (no closure needed)
// ============================================================================

/**
 * Update the follow toggle button appearance
 * @param mode - Navigation mode: 'follow' for auto-center, 'manual' for user-controlled
 */
function updateFollowToggleButton(mode: 'follow' | 'manual'): void {
    const toggleButton = document.querySelector<HTMLButtonElement>('#nav-follow-toggle');
    if (!toggleButton) { return; }
    toggleButton.dataset.mode = mode;
    toggleButton.title = mode === 'follow' ? 'Auto-follow enabled' : 'Auto-follow disabled (click to re-center)';
}

/**
 * Show "player not found" message in distance display
 * @param playerNameInput - The player name input element, or null if not found
 */
function showPlayerNotFound(playerNameInput: HTMLInputElement | null): void {
    const distanceDisplay = document.querySelector('#nav-dialog-distance');
    if (distanceDisplay) {
        distanceDisplay.innerHTML = `<span class="distance-label">Player "${playerNameInput?.value}" not found</span>`;
    }
}

/**
 * Push a player position sample to the position service and log debug info
 * @param service - The live navigation player position service
 * @param player - Player data including name and position
 */
function pushPlayerSampleWithDebug(service: LiveNavigationDeps['playerPositionService'], player: Player): void {
    service.pushSample(player.name, {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        yaw: player.rotation?.yaw,
        timestamp: performance.now(),
    });
    const phase = service.getPhase(player.name) ?? 'idle';
    const vel = service.getVelocity(player.name);
    debugInterpolation('sample pushed player=%s phase=%s vx=%.4f vz=%.4f',
        player.name, phase, vel ? vel.vx : 0, vel ? vel.vz : 0);
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create the live navigation handler.
 *
 * @param state  Shared mutable NavState
 * @param deps   Callbacks and stores from main.ts
 * @returns Handler object with live navigation lifecycle functions
 */
export function createLiveNavigationHandler(state: NavState, deps: LiveNavigationDeps): LiveNavigationHandler {

    // ── Mode controls ───────────────────────────────────────────────

    function switchToManualMode(): void {
        if (!deps.navigationStore.isActive) { return; }
        deps.navigationStore.setMode('manual');

        const recenterButton = document.querySelector(SELECTORS.RECENTER_MAP);
        const dialogRecenterButton = document.querySelector('#nav-dialog-recenter');
        recenterButton?.classList.remove('hidden');
        dialogRecenterButton?.classList.remove('hidden');

        updateFollowToggleButton('manual');
    }

    function switchToFollowMode(): void {
        deps.navigationStore.setMode('follow');

        const recenterButton = document.querySelector(SELECTORS.RECENTER_MAP);
        const dialogRecenterButton = document.querySelector('#nav-dialog-recenter');
        recenterButton?.classList.add('hidden');
        dialogRecenterButton?.classList.add('hidden');

        updateFollowToggleButton('follow');
        deps.navUpdatesHandler.centerMapOnPlayer();
    }

    function toggleFollowMode(): void {
        if (deps.navigationStore.mode === 'follow') { switchToManualMode(); } else { switchToFollowMode(); }
    }

    // ── View world controls ─────────────────────────────────────────

    function initViewWorldButtons(): void {
        const viewModeButton = document.querySelector<HTMLButtonElement>(SELECTORS.NAV_VIEW_MODE_TOGGLE);
        const worldToggleButton = document.querySelector<HTMLButtonElement>(SELECTORS.NAV_WORLD_TOGGLE);
        const mode = deps.navigationStore.viewWorldMode;
        const world = deps.navigationStore.viewWorld;

        if (viewModeButton) {
            viewModeButton.dataset.mode = mode;
            viewModeButton.title = mode === 'auto' ? 'Auto (follows player world)' : 'Manual (fixed world view)';
        }

        if (worldToggleButton) {
            worldToggleButton.dataset.world = world;
            worldToggleButton.disabled = mode === 'auto';
            const worldName = world === WORLDS.OVERWORLD ? 'Overworld' : 'Nether';
            worldToggleButton.title = mode === 'auto'
                ? 'World toggle disabled in auto mode'
                : `Viewing: ${worldName}`;
            worldToggleButton.textContent = world === WORLDS.OVERWORLD ? '🌍' : '🔥';
        }
    }

    function toggleViewWorldMode(): void {
        const newMode = deps.navigationStore.toggleViewWorldMode();

        const viewModeButton = document.querySelector<HTMLButtonElement>(SELECTORS.NAV_VIEW_MODE_TOGGLE);
        if (viewModeButton) {
            viewModeButton.dataset.mode = newMode;
            viewModeButton.title = newMode === 'auto' ? 'Auto (follows player world)' : 'Manual (fixed world view)';
        }

        const worldToggleButton = document.querySelector<HTMLButtonElement>(SELECTORS.NAV_WORLD_TOGGLE);
        if (worldToggleButton) {
            worldToggleButton.disabled = newMode === 'auto';
            if (newMode === 'auto') {
                worldToggleButton.title = 'World toggle disabled in auto mode';
            } else {
                const worldName = deps.navigationStore.viewWorld === WORLDS.OVERWORLD ? 'Overworld' : 'Nether';
                worldToggleButton.title = `Viewing: ${worldName}`;
            }
        }
    }

    function toggleViewWorld(): void {
        if (deps.navigationStore.viewWorldMode === 'auto') { return; }

        const currentWorld = deps.navigationStore.viewWorld;
        const newWorld = currentWorld === WORLDS.OVERWORLD ? WORLDS.NETHER : WORLDS.OVERWORLD;
        deps.navigationStore.setViewWorld(newWorld);

        const worldToggleButton = document.querySelector<HTMLButtonElement>(SELECTORS.NAV_WORLD_TOGGLE);
        if (worldToggleButton) {
            worldToggleButton.dataset.world = newWorld;
            worldToggleButton.title = `Viewing: ${newWorld === WORLDS.OVERWORLD ? 'Overworld' : 'Nether'}`;
        }

        if (state.map && state.currentRoute.length > 0) {
            void deps.navMapHandler.initNavigationMapDialog(state.currentRoute).then(() => {
                if (deps.navigationStore.mode === 'follow') {
                    deps.navUpdatesHandler.centerMapOnPlayer();
                }
            });
        }
    }

    // ── Player helpers ──────────────────────────────────────────────

    function handlePortalCrossing(player: Player, playerWorld: string, previousWorld: string): boolean {
        debugNavigation('Player crossed portal from %s to %s, auto-switching view', previousWorld, playerWorld);
        deps.navigationStore.setViewWorld(playerWorld);

        deps.playerPositionService.resetPlayer(player.name);
        pushPlayerSampleWithDebug(deps.playerPositionService, player);

        const worldToggleButton = document.querySelector<HTMLButtonElement>(SELECTORS.NAV_WORLD_TOGGLE);
        if (worldToggleButton) {
            worldToggleButton.dataset.world = playerWorld;
        }

        if (state.map && state.currentRoute.length > 0) {
            void deps.navMapHandler.initNavigationMapDialog(state.currentRoute);
            return true;
        }
        return false;
    }

    function handleFoundPlayer(player: Player, previousPosition: { x: number; z: number; world: string; yaw?: number | undefined } | undefined): void {
        const playerWorld = getPlayerWorld(player);
        const position = {
            x: player.position.x,
            y: player.position.y,
            z: player.position.z,
            world: playerWorld,
            yaw: player.rotation?.yaw,
        };
        deps.navigationStore.setPlayerPosition(position);
        // @ts-expect-error - exposed for testing
        globalThis.__currentPlayerPosition = position;

        const previousWorld = previousPosition?.world;
        const playerCrossedPortal = previousWorld !== undefined && previousWorld !== playerWorld;
        if (deps.navigationStore.viewWorldMode === 'auto' && playerCrossedPortal && handlePortalCrossing(player, playerWorld, previousWorld)) {
            return;
        }

        pushPlayerSampleWithDebug(deps.playerPositionService, player);

        deps.navUpdatesHandler.updatePlayerMarker();
        deps.navUpdatesHandler.updateLiveDistance();
        deps.navUpdatesHandler.checkAutoAdvance();
        deps.updateNearbyShopTooltip();

        const currentPos = deps.navigationStore.playerPosition;
        if (!currentPos) { return; }

        if (hasPositionMoved(previousPosition, currentPos, 10)) {
            deps.navUpdatesHandler.recalculateRouteFromPlayer();
        }

        deps.navUpdatesHandler.updatePlayerToNextLine();
        // Map centering in follow mode is handled by the animation loop (60fps via
        // spring-damper interpolation), so no per-poll centerMapOnPlayer call needed.
    }

    // ── Player polling ──────────────────────────────────────────────

    async function pollPlayerPosition(): Promise<void> {
        const playerNameInput = document.querySelector<HTMLInputElement>(SELECTORS.PLAYER_NAME_INPUT);
        const playerName = playerNameInput?.value.trim().toLowerCase();

        if (!playerName || !state.map) { return; }

        try {
            const players = await fetchPlayers();
            const player = players.find(p => p.name.toLowerCase() === playerName);

            if (player) {
                const previousPosition = deps.navigationStore.playerPosition;
                debugPlayerPoll('Player found name=%s world=%s x=%d z=%d prevWorld=%s',
                    player.name, player.world, player.position.x, player.position.z, previousPosition?.world);
                handleFoundPlayer(player, previousPosition);
            } else {
                debugPlayerPoll('Player not found: %s', playerName);
                showPlayerNotFound(playerNameInput);
            }
        } catch (error) {
            debugPlayerPoll('Poll failed: %s', error);
            console.warn('Failed to poll player position:', error);
        }
    }

    // ── Start / stop ────────────────────────────────────────────────

    async function fetchInitialPlayerPosition(playerName: string): Promise<void> {
        try {
            const players = await fetchPlayers();
            const player = players.find(p => p.name.toLowerCase() === playerName);
            if (!player) { return; }

            const playerWorld = getPlayerWorld(player);
            const position = { x: player.position.x, y: player.position.y, z: player.position.z, world: playerWorld, yaw: player.rotation?.yaw };
            deps.navigationStore.setPlayerPosition(position);
            if (deps.navigationStore.viewWorldMode === 'auto') {
                deps.navigationStore.setViewWorld(playerWorld);
                initViewWorldButtons();
            }
            // @ts-expect-error - exposed for testing
            globalThis.__currentPlayerPosition = position;

            deps.playerPositionService.pushSample(player.name, { x: player.position.x, y: player.position.y, z: player.position.z, yaw: player.rotation?.yaw, timestamp: performance.now() });
            debugNavigation('Initial player position world=%s x=%d y=%d z=%d', playerWorld, player.position.x, player.position.y, player.position.z);
        } catch (error) {
            debugNavigation('Failed to get initial player position: %s', error);
            console.warn('Failed to get initial player position:', error);
        }
    }

    async function initMapAndStartPolling(): Promise<void> {
        const route = deps.computeRoute(deps.navigationStore.playerPosition, true);
        state.currentRoute = route;
        const playerWorld = deps.navigationStore.playerPosition?.world;
        debugNavigation('Initializing map stops=%d targetWorld=%s worlds=%o', route.length, playerWorld, [...new Set(route.map(s => getWorldId(s.world)))]);
        await deps.navMapHandler.initNavigationMapDialog(route, playerWorld);

        if (deps.navigationStore.mode === 'follow' && deps.navigationStore.playerPosition) {
            deps.navUpdatesHandler.centerMapOnPlayer();
        }

        void pollPlayerPosition();
        const config = deps.getConfig();
        deps.navigationStore.setRefreshInterval(setInterval(() => void pollPlayerPosition(), config.dynmap.playerRefreshMs));
        deps.navUpdatesHandler.startNavAnimationLoop();
    }

    async function startNavigation(): Promise<void> {
        const playerNameInput = document.querySelector<HTMLInputElement>('#player-name-input');
        if (!playerNameInput?.value.trim()) {
            playerNameInput?.focus();
            return;
        }

        debugNavigation('Starting navigation player=%s cartSize=%d', playerNameInput.value.trim(), deps.cartStoreUniqueCount());
        deps.navigationStore.start(playerNameInput.value.trim());

        updateFollowToggleButton('follow');
        initViewWorldButtons();

        const cartDialog = deps.getElement<HTMLDialogElement>('cart-dialog');
        const navDialog = document.querySelector<HTMLDialogElement>(SELECTORS.NAV_DIALOG);
        cartDialog.close();
        document.body.style.overflow = 'hidden';

        if (navDialog) {
            navDialog.showModal();

            const playerName = playerNameInput.value.trim().toLowerCase();
            await fetchInitialPlayerPosition(playerName);

            requestAnimationFrame(() => {
                void initMapAndStartPolling();
            });
        } else {
            console.error('nav-dialog element not found!');
        }
    }

    function stopNavigation(): void {
        const navDialog = document.querySelector<HTMLDialogElement>(SELECTORS.NAV_DIALOG);
        const cartDialog = deps.getElement<HTMLDialogElement>(DIALOG_IDS.CART);

        const stoppingPlayerName = deps.navigationStore.playerName;
        deps.navUpdatesHandler.stopNavAnimationLoop();
        deps.playerPositionService.removePlayer(stoppingPlayerName);
        deps.navigationStore.stop();

        if (state.routePolyline && state.map) { state.map.removeLayer(state.routePolyline); }
        state.routePolyline = undefined;
        if (state.playerToNextLine && state.map) { state.map.removeLayer(state.playerToNextLine); }
        state.playerToNextLine = undefined;
        if (state.map) {
            for (const marker of state.stopMarkers) {
                state.map.removeLayer(marker);
            }
        }
        state.stopMarkers = [];
        state.currentRoute = [];
        state.mapWorld = WORLDS.OVERWORLD;

        if (navDialog) { navDialog.close(); }
        document.body.style.overflow = '';

        if (state.map) {
            try { state.map.remove(); } catch { /* already removed */ }
            state.map = undefined;
        }

        deps.renderCartDialog();
        deps.switchTab('navigate');
        cartDialog.showModal();
    }

    function toggleNavigation(): void {
        if (deps.navigationStore.isActive) {
            stopNavigation();
        } else {
            void startNavigation();
        }
    }

    // ── Navigation controls setup ───────────────────────────────────

    function setupNavigationControls(): void {
        const startButton = document.querySelector('#start-navigation');
        const recenterButton = document.querySelector(SELECTORS.RECENTER_MAP);
        const closeNavButton = document.querySelector('#close-nav');
        const followToggleButton = document.querySelector('#nav-follow-toggle');
        const viewModeToggleButton = document.querySelector(SELECTORS.NAV_VIEW_MODE_TOGGLE);
        const worldToggleButton = document.querySelector(SELECTORS.NAV_WORLD_TOGGLE);
        const dayNightToggleButton = document.querySelector<HTMLButtonElement>('#nav-daynight-toggle');

        startButton?.addEventListener('click', toggleNavigation);
        recenterButton?.addEventListener('click', switchToFollowMode);
        closeNavButton?.addEventListener('click', stopNavigation);
        followToggleButton?.addEventListener('click', toggleFollowMode);
        viewModeToggleButton?.addEventListener('click', toggleViewWorldMode);
        worldToggleButton?.addEventListener('click', toggleViewWorld);

        if (dayNightToggleButton) {
            dayNightToggleButton.dataset.mode = 'day';
            dayNightToggleButton.addEventListener('click', () => {
                if (!deps.lightingController) { return; }
                deps.lightingController.toggleDayNight();
                const isNightNow = deps.lightingController.state.config.sunIntensity === 0;
                dayNightToggleButton.dataset.mode = isNightNow ? 'night' : 'day';
                dayNightToggleButton.textContent = isNightNow ? '🌙' : '☀️';
                dayNightToggleButton.title = isNightNow ? 'Night mode' : 'Day mode';
            });
        }

        const navDialog = document.querySelector<HTMLDialogElement>(SELECTORS.NAV_DIALOG);
        if (navDialog) {
            navDialog.addEventListener('click', (event) => {
                if (event.target === navDialog) {
                    stopNavigation();
                }
            });
        }
    }

    // ── Navigate tab rendering ──────────────────────────────────────

    function renderTimelineStops(container: HTMLElement, route: RouteStop[]): void {
        let previousStop: RouteStop | undefined;
        for (let index = 0; index < route.length; index++) {
            const stop = route[index];
            if (!stop) { continue; }
            container.append(deps.createTimelineStop(stop, index, route, previousStop));
            previousStop = stop;
        }
    }

    function renderNavigateTab(): void {
        const route = deps.computeRoute();

        const navTimeline = document.querySelector('#nav-timeline');
        const navDistance = document.querySelector('#nav-distance');

        if (navTimeline instanceof HTMLElement) {
            navTimeline.innerHTML = '';

            if (route.length === 0) {
                navTimeline.innerHTML = `<p class="${CSS_CLASSES.CART_EMPTY}">Add items to cart to see route</p>`;
            } else {
                deps.syncNavProgressWithCart(route);
                renderTimelineStops(navTimeline, route);
                navTimeline.classList.toggle('navigating', deps.navigationStore.refreshInterval !== undefined);
            }
        }

        if (navDistance) {
            if (route.length === 0) {
                navDistance.textContent = '';
            } else {
                const totalDistance = calculateTotalRouteDistance(route);
                const netherDistance = Math.round(totalDistance / 8);
                navDistance.innerHTML = `<span class="dist-label">Distance:</span><span class="dist-ow">${Math.round(totalDistance).toLocaleString()}</span><span class="dist-nether">${netherDistance.toLocaleString()}</span>`;
            }
        }
    }

    // ── Return public API ───────────────────────────────────────────

    return {
        startNavigation,
        stopNavigation,
        toggleNavigation,
        setupNavigationControls,
        switchToManualMode,
        initViewWorldButtons,
        renderNavigateTab,
    };
}
