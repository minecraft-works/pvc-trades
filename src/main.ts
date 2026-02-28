/**
 * Main application entry point for Shop Trade Viewer
 *
 * This module handles DOM initialization, event binding, and wiring
 * together extracted modules via a factory/dependency-injection pattern.
 *
 * Most logic has been extracted into focused modules:
 * - `src/data/`        — Trade loading, refresh, item-value state
 * - `src/search/`      — Search, filtering, multi-column sort
 * - `src/rendering/`   — Trade row rendering, virtual scrolling
 * - `src/cart/`         — Cart dialog, route timeline
 * - `src/navigation/`  — Live navigation, player polling
 * - `src/dialogs/`     — Matrix dialog, trade details
 * - `src/dashboard/`   — Daily deals dashboard
 * - `src/favorites/`   — Watchlist UI
 * - `src/map/`         — Shop map dialog, tile loading
 *
 * @module main
 */

import type { CartDialogHandler } from './cart/index.js';
import {
    cleanupZeroQuantityItems,
    clearCart,
    computeRoute,
    createCartDialogHandler,
    getAllCartStops,
    refreshCartButtonStates,
    syncNavProgressWithCart,
    updateCartBadge,
} from './cart/index.js';
import {
    CSS_CLASSES,
    DIALOG_IDS,
    SELECTORS,
    STORAGE_KEYS,
    WORLDS} from './constants.js';
import type { DashboardUIHandler } from './dashboard/dashboard-ui.js';
import { createDashboardUIHandler } from './dashboard/dashboard-ui.js';
import type { DataLoaderHandler } from './data-loader/index.js';
import { createDataLoaderHandler } from './data-loader/index.js';
import { debugNavigation } from './debug.js';
import {
    createTradeDetailsHandler,
    openDialog,
    renderExchangeMatrix,
    setupDialogBackdropClose} from './dialogs/index.js';
import type { FavoritesUIHandler } from './favorites/index.js';
import { createFavoritesUIHandler } from './favorites/index.js';
import {
    getConfig,
    getTradeKey,
} from './library.js';
import type { ShopMapDialogHandler } from './map/index.js';
import {
    createShopMapDialogHandler
} from './map/index.js';
import type { LiveNavigationHandler,NavMapHandler, NavUpdatesHandler } from './navigation/index.js';
import { createLiveNavigationHandler,createNavMapHandler, createNavState, createNavUpdatesHandler, createShopTooltipHandler } from './navigation/index.js';
import type { TradeRendererHandler } from './rendering/index.js';
import { createTradeRendererHandler } from './rendering/index.js';
import type { SearchSortHandler } from './search/index.js';
import { createSearchSortHandler, updateClearButtonVisibility } from './search/index.js';
import { cartStore, favoritesStore, navigationStore, playerPositionService,snapshotStore } from './stores/index.js';

// ============================================================================
// State
// ============================================================================

// Data loader handler (initialized in DOMContentLoaded)
let dataLoader: DataLoaderHandler;

// Favorites UI handler (initialized in DOMContentLoaded)
let favoritesUI: FavoritesUIHandler;

// Dashboard UI handler (initialized in DOMContentLoaded)
let dashboardUI: DashboardUIHandler;

// Shop map dialog handler (initialized in DOMContentLoaded)
let shopMapDialog: ShopMapDialogHandler;

// Navigation module handlers (initialized in DOMContentLoaded)
const navState = createNavState();
let navMapHandler: NavMapHandler;
let navUpdatesHandler: NavUpdatesHandler;
let liveNav: LiveNavigationHandler;

// Cart dialog handler (initialized in DOMContentLoaded)
let cartHandler: CartDialogHandler;

// Trade renderer handler (initialized in DOMContentLoaded)
let renderer: TradeRendererHandler;

// Search/sort handler (initialized in DOMContentLoaded)
let searchHandler: SearchSortHandler;

// Flag to track if map was opened from cart (for back navigation)
let mapOpenedFromCart = false;

// ============================================================================
// DOM Helpers
// ============================================================================

const CLEAR_SEARCH_WANT_ID = 'clear-search-want';
const CLEAR_SEARCH_GIVE_ID = 'clear-search-give';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers specify concrete element types
function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.querySelector<T>(`#${id}`);
    if (!element) { throw new Error(`Element #${id} not found`); }
    return element;
}

function getInputValue(id: string): string {
    return getElement<HTMLInputElement>(id).value.trim().toLowerCase();
}

// ============================================================================
// Matrix Dialog (wrapper for dialogs module)
// ============================================================================

/**
 * Render the exchange rate matrix dialog using the extracted module
 */
function renderMatrixDialog(): void {
    const container = getElement('matrix-container');
    renderExchangeMatrix(container, dataLoader.getItemValues(), getElement);
}

// ============================================================================
// Trade Details Dialog (uses extracted module)
// ============================================================================

/**
 * Trade details popover handler, configured with trade lookup
 */
const openTradeDetailsPopover = createTradeDetailsHandler({
    getTrade: (key) => dataLoader.getTradeByKey(key)
});

// ============================================================================
// Tab Switching
// ============================================================================

function setupCartTabs(): void {
    const tabCart = document.querySelector('#tab-cart');
    const tabNavigate = document.querySelector('#tab-navigate');
    
    tabCart?.addEventListener('click', () => switchTab('cart'));
    tabNavigate?.addEventListener('click', () => switchTab('navigate'));
}

/**
 * Toggle CSS class on an element if it exists
 * @param selector - CSS selector for the target element
 * @param active - Whether to add (true) or remove (false) the active class
 */
function setActive(selector: string, active: boolean): void {
    const element = document.querySelector(selector);
    if (!element) { return; }
    element.classList.toggle('active', active);
}

/**
 * Toggle CSS class 'hidden' on an element if it exists
 * @param selector - CSS selector for the target element
 * @param hidden - Whether to add (true) or remove (false) the hidden class
 */
function setHidden(selector: string, hidden: boolean): void {
    const element = document.querySelector(selector);
    if (!element) { return; }
    element.classList.toggle('hidden', hidden);
}

function switchTab(tab: 'cart' | 'navigate'): void {
    const isCart = tab === 'cart';

    setActive('#tab-cart', isCart);
    setActive('#tab-navigate', !isCart);
    setActive('#tab-content-cart', isCart);
    setActive('#tab-content-navigate', !isCart);
    setHidden('#clear-cart', !isCart);
    setHidden('#start-navigation', isCart);

    if (!isCart) {
        liveNav.renderNavigateTab();
    }

    localStorage.setItem(STORAGE_KEYS.NAV_TAB, tab);
}

function restoreActiveTab(): void {
    const savedTab = localStorage.getItem(STORAGE_KEYS.NAV_TAB);
    if (savedTab === 'navigate') {
        switchTab('navigate');
    } else {
        switchTab('cart');
    }
}

function setupPlayerNameInput(): void {
    const input = document.querySelector<HTMLInputElement>(SELECTORS.PLAYER_NAME_INPUT);
    if (!input) {
        return;
    }
    
    // Restore saved player name
    const savedName = localStorage.getItem(STORAGE_KEYS.NAV_PLAYER);
    if (savedName) {
        input.value = savedName;
    }
    
    // Save on input
    input.addEventListener('input', () => {
        localStorage.setItem(STORAGE_KEYS.NAV_PLAYER, input.value);
    });
}

// ============================================================================
// Initialization
// ============================================================================

// Global error boundary — routes uncaught async errors to debug logger
globalThis.addEventListener('unhandledrejection', (event) => {
    debugNavigation('Unhandled promise rejection: %O', event.reason);
});

/** Wire up search input fields, clear buttons, and swap button */
function setupSearchInputHandlers(): void {
    getElement('searchWant').addEventListener('input', () => {
        updateClearButtonVisibility(getElement<HTMLInputElement>('searchWant'), CLEAR_SEARCH_WANT_ID);
        searchHandler.debouncedSearch();
    });
    getElement('searchGive').addEventListener('input', () => {
        updateClearButtonVisibility(getElement<HTMLInputElement>('searchGive'), CLEAR_SEARCH_GIVE_ID);
        searchHandler.debouncedSearch();
    });
    getElement(CLEAR_SEARCH_WANT_ID).addEventListener('click', () => {
        searchHandler.clearSearchInput('searchWant', CLEAR_SEARCH_WANT_ID);
    });
    getElement(CLEAR_SEARCH_GIVE_ID).addEventListener('click', () => {
        searchHandler.clearSearchInput('searchGive', CLEAR_SEARCH_GIVE_ID);
    });
    getElement('swap-search').addEventListener('click', () => {
        const wantInput = getElement<HTMLInputElement>('searchWant');
        const giveInput = getElement<HTMLInputElement>('searchGive');
        const wantValue = wantInput.value;
        wantInput.value = giveInput.value;
        giveInput.value = wantValue;
        updateClearButtonVisibility(wantInput, CLEAR_SEARCH_WANT_ID);
        updateClearButtonVisibility(giveInput, CLEAR_SEARCH_GIVE_ID);
        searchHandler.search();
    });
}

/** Register global keyboard shortcuts (Ctrl+F search focus, Ctrl+Shift+X swap) */
function setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', event => {
        // Ctrl+F / Cmd+F: Focus search
        if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
            event.preventDefault();
            getElement<HTMLInputElement>('searchWant').focus();
        }
        // Ctrl+Shift+X / Cmd+Shift+X: Swap search fields
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'X') {
            event.preventDefault();
            const wantInput = getElement<HTMLInputElement>('searchWant');
            const giveInput = getElement<HTMLInputElement>('searchGive');
            const wantValue = wantInput.value;
            wantInput.value = giveInput.value;
            giveInput.value = wantValue;
            updateClearButtonVisibility(wantInput, CLEAR_SEARCH_WANT_ID);
            updateClearButtonVisibility(giveInput, CLEAR_SEARCH_GIVE_ID);
            searchHandler.search();
        }
    });
}

/** Set up all dialog handlers: matrix, dashboard, map, and cart */
function setupAllDialogs(): void {
    // Matrix dialog
    const matrixDialog = getElement<HTMLDialogElement>(DIALOG_IDS.MATRIX);
    setupDialogBackdropClose(matrixDialog);
    getElement('open-matrix').addEventListener('click', () => {
        openDialog(DIALOG_IDS.MATRIX, renderMatrixDialog);
    });

    // Dashboard toggle
    document.querySelector('#open-dashboard')?.addEventListener('click', () => dashboardUI.toggleDashboard());

    // Map dialog
    const mapDialog = document.querySelector<HTMLDialogElement>(SELECTORS.MAP_DIALOG);
    if (mapDialog) {
        setupDialogBackdropClose(mapDialog);
    }

    // Cart dialog
    const cartDialog = getElement<HTMLDialogElement>(DIALOG_IDS.CART);
    setupDialogBackdropClose(cartDialog);

    // Clean up zero-quantity items when cart dialog closes
    cartDialog.addEventListener('close', () => {
        cleanupZeroQuantityItems();
    });

    getElement('open-cart').addEventListener('click', () => {
        cartHandler.renderCartDialog();
        restoreActiveTab();
        cartDialog.showModal();
    });
    getElement('close-cart').addEventListener('click', () => {
        // Stop navigation when closing cart dialog
        if (navigationStore.isActive) {
            liveNav.stopNavigation();
        }
        cartDialog.close();
    });
    getElement('clear-cart').addEventListener('click', () => {
        clearCart();
        refreshCartButtonStates();
        cartDialog.close();
    });
}

// eslint-disable-next-line max-lines-per-function -- application entry point wires all extracted modules
document.addEventListener('DOMContentLoaded', () => {
    // Initialize data loader (owns trade state, item values, deviation calculator)
    dataLoader = createDataLoaderHandler({
        getElement,
        renderHeader: () => renderer.renderHeader(),
        search: () => searchHandler.search(),
        showDashboard: () => dashboardUI.showDashboard(),
    });
    void dataLoader.loadShops();

    // Register cart change listener before loading
    cartStore.onChange(updateCartBadge);
    cartStore.load();
    navigationStore.loadProgress();
    navigationStore.loadMode();

    // Initialize search/sort handler (before modules that depend on it)
    searchHandler = createSearchSortHandler({
        getInputValue,
        getElement,
        getAllTrades: () => dataLoader.getAllTrades(),
        getDeviation: () => dataLoader.getDeviation(),
        getNewTradeKeys: () => dataLoader.getNewTradeKeys(),
        renderResults: (...arguments_) => renderer.renderResults(...arguments_),
        updateSortArrows: () => renderer.updateSortArrows(),
        updateDealsBadge: (count) => favoritesUI.updateDealsBadge(count),
        isFilterNewOnly: () => renderer.isFilterNewOnly(),
        isFilterCartOnly: () => renderer.isFilterCartOnly(),
    });

    // Initialize favorites
    favoritesStore.load();
    favoritesUI = createFavoritesUIHandler({
        favoritesStore,
        triggerSearch: searchHandler.triggerSearch,
    });
    favoritesUI.setupFavoritesDialog();
    favoritesUI.updateFavoritesBadge();

    // Initialize dashboard UI
    dashboardUI = createDashboardUIHandler({
        getAllTrades: () => dataLoader.getAllTrades(),
        getDeviation: () => dataLoader.getDeviation(),
        search: () => searchHandler.search(),
        updateClearButtonVisibility,
        snapshotStore,
        favoritesStore,
    });

    // Initialize shop map dialog
    shopMapDialog = createShopMapDialogHandler({
        onCloseFromCart: () => {
            const cartDialog = getElement<HTMLDialogElement>(DIALOG_IDS.CART);
            cartHandler.renderCartDialog();
            cartDialog.showModal();
        },
        isOpenedFromCart: () => mapOpenedFromCart,
        clearOpenedFromCart: () => { mapOpenedFromCart = false; },
        // eslint-disable-next-line functional/prefer-tacit -- late-bound: getConfig not available at init
        getConfig: () => getConfig(),
    });

    // Initialize trade renderer
    renderer = createTradeRendererHandler({
        getDeviation: () => dataLoader.getDeviation(),
        getActiveSorts: () => searchHandler.getActiveSorts(),
        getNewTradeKeys: () => dataLoader.getNewTradeKeys(),
        search: () => searchHandler.search(),
        sortByColumn: (col) => searchHandler.sortByColumn(col),
        openDialogForItem: (name) => favoritesUI.openDialogForItem(name),
    });

    // Initialize cart dialog handler
    cartHandler = createCartDialogHandler({
        renderNavigateTab: () => liveNav.renderNavigateTab(),
        recalculateRouteFromPlayer: () => navUpdatesHandler.recalculateRouteFromPlayer(),
        updatePlayerToNextLine: () => navUpdatesHandler.updatePlayerToNextLine(),
        updateLiveDistance: () => navUpdatesHandler.updateLiveDistance(),
        openShopMap: (x, y, z, world) => shopMapDialog.open(x, y, z, world),
        setMapOpenedFromCart: () => { mapOpenedFromCart = true; },
    });

    // Initialize navigation modules
    const updateNearbyShopTooltip = createShopTooltipHandler({
        getRoute: () => navState.currentRoute.length > 0 ? navState.currentRoute : computeRoute(navigationStore.playerPosition, true),
        getActiveCartItemsAtLocation: (x: number, z: number) => cartStore.items.filter(item =>
            item.trade.x === x &&
            item.trade.z === z &&
            !navigationStore.progress.completedKeys.has(getTradeKey(item.trade))
        ),
        getTooltipElement: () => document.querySelector('#nav-shop-tooltip'),
        getPlayerPosition: () => navigationStore.playerPosition
    });

    navMapHandler = createNavMapHandler(navState, {
        navigationStore,
        getAllCartStops,
        toggleStopCompletion: (stop, route) => cartHandler.toggleStopCompletion(stop, route),
        onMapDrag: () => liveNav.switchToManualMode(),
    });

    navUpdatesHandler = createNavUpdatesHandler(navState, {
        navigationStore,
        cartStore,
        navMapHandler,
        computeRoute,
        getAllCartStops,
        playerPositionService,
        renderCartDialog: () => cartHandler.renderCartDialog(),
    });

    liveNav = createLiveNavigationHandler(navState, {
        navigationStore,
        navMapHandler,
        navUpdatesHandler,
        computeRoute,
        getAllCartStops,
        syncNavProgressWithCart,
        switchTab,
        getElement,
        playerPositionService,
        updateNearbyShopTooltip,
        createTimelineStop: (...arguments_) => cartHandler.createTimelineStop(...arguments_),
        renderCartDialog: () => cartHandler.renderCartDialog(),
        // eslint-disable-next-line functional/prefer-tacit -- late-bound: getConfig not available at init
        getConfig: () => getConfig(),
        cartStoreUniqueCount: () => cartStore.uniqueCount,
    });

    setupSearchInputHandlers();
    setupKeyboardShortcuts();
    setupAllDialogs();
    setupCartTabs();
    setupPlayerNameInput();
    liveNav.setupNavigationControls();
    setupTradeRowClickHandler();
});

/**
 * Set up event delegation for trade row clicks
 * Handles info icon clicks, map dialog opening, and ignores add-to-cart
 */
function setupTradeRowClickHandler(): void {
    getElement('results').addEventListener('click', (event) => {
        if (!(event.target instanceof HTMLElement)) { return; }
        const target = event.target;
        const row = target.closest<HTMLElement>(`.${CSS_CLASSES.TRADE_ROW}`);
        if (!row) { return; }

        const x = Number.parseInt(row.dataset.x ?? '0', 10);
        const y = Number.parseInt(row.dataset.y ?? '0', 10);
        const z = Number.parseInt(row.dataset.z ?? '0', 10);
        const world = row.dataset.world ?? WORLDS.OVERWORLD;

        // Click on info icon → open trade details popover
        const infoIcon = target.closest('.info-icon');
        if (infoIcon instanceof HTMLElement) {
            const isResult = infoIcon.dataset.info === 'result';
            openTradeDetailsPopover(row, isResult);
            return;
        }

        // Click on add-to-cart button is handled separately
        if (target.closest('.add-to-cart-btn')) {
            return;
        }

        // Click anywhere else on row → open map dialog
        shopMapDialog.open(x, y, z, world);
    });
}
